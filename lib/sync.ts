import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';
import { supabase } from './supabase';

/**
 * Coleção local-first sincronizada com uma tabela do Supabase.
 *
 * - Toda alteração é gravada primeiro no aparelho (funciona offline e sobrevive ao fechamento do app).
 * - Alterações entram numa fila de envio por registro; só as linhas alteradas são enviadas (upsert).
 * - Leitura incremental: busca apenas linhas com updated_at maior que o último valor recebido
 *   (o servidor define updated_at por gatilho, então o relógio do aparelho não interfere).
 * - Exclusão é lógica (deleted_at), para que outros aparelhos percebam a remoção na leitura incremental.
 */
export type SyncRow = { id: string; updated_at?: string; deleted_at?: string | null };
export type SyncStatus = 'local' | 'idle' | 'syncing' | 'ok' | 'error';

type Persisted<T> = { items: T[]; cursor: string | null; cursorId?: string | null; outbox: T[] };
type Options = {
  table: string;
  storageKey: string;
  filter?: (q: any) => any; // eslint-disable-line @typescript-eslint/no-explicit-any
  /** Tabela sem coluna deleted_at (ex.: service_records): não envia esse campo. */
  softDelete?: boolean;
}; 

const PAGE = 1000;
const FLUSH_DELAY = 1500;
let syncEnabled = false; // ligado pela casca quando há sessão com acesso
const registry: Collection<SyncRow>[] = [];

export class Collection<T extends SyncRow> {
  private items = new Map<string, T>();
  private outbox = new Map<string, T>();
  private cursor: string | null = null;
  /** Desempate do cursor: várias linhas gravadas na mesma transação têm o mesmo updated_at. */
  private cursorId: string | null = null;
  private listeners = new Set<() => void>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private pulling: Promise<void> | null = null;
  /**
   * Muda a cada limpeza do cache (outra rede entrou no aparelho). Uma leitura que estava em andamento na hora da troca
   * descarta o que trouxe: senão gravaria linhas e o cursor da rede anterior, e a rede nova perderia os registros
   * mais antigos que esse cursor (foi o que fez as filiais sumirem ao entrar em outra rede, em 23/11/2026).
   */
  private epoca = 0;
  private version = 0;
  private snapshot: { list: T[]; version: number; loaded: boolean; status: SyncStatus; pending: number } =
    { list: [], version: 0, loaded: false, status: 'local', pending: 0 };
  loaded = false;
  status: SyncStatus = 'local';
  /** Verdadeiro depois da primeira leitura bem-sucedida do servidor nesta sessão. */
  pulledOnce = false;
  private loading: Promise<void>;

  constructor(private opts: Options) {
    this.loading = this.load();
    registry.push(this as unknown as Collection<SyncRow>);
  }

  /* ---------- Assinatura para React ---------- */
  subscribe = (fn: () => void) => { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; };
  getSnapshot = () => this.snapshot;
  private emit() {
    this.version++;
    this.snapshot = { list: [...this.items.values()], version: this.version, loaded: this.loaded, status: this.status, pending: this.outbox.size };
    this.listeners.forEach(fn => fn());
    recalcularAtividade();
  }
  private setStatus(s: SyncStatus) { if (this.status !== s) { this.status = s; this.emit(); } }

  /* ---------- Persistência local ---------- */
  private async load() {
    try {
      const raw = await AsyncStorage.getItem(this.opts.storageKey);
      if (raw) {
        const p = JSON.parse(raw) as Persisted<T>;
        p.items.forEach(i => this.items.set(i.id, i));
        p.outbox.forEach(i => this.outbox.set(i.id, i));
        this.cursor = p.cursor;
        this.cursorId = p.cursorId ?? null;
      }
    } catch { /* cache corrompido: começa vazio e a leitura do servidor repõe */ }
    this.loaded = true;
    this.emit();
  }
  whenLoaded() { return this.loading; }
  /** Chave do cache deste aparelho. */
  get chave() { return this.opts.storageKey; }
  private save() {
    const p: Persisted<T> = { items: [...this.items.values()], cursor: this.cursor, cursorId: this.cursorId, outbox: [...this.outbox.values()] };
    void AsyncStorage.setItem(this.opts.storageKey, JSON.stringify(p)).catch(() => undefined);
  }

  /* ---------- Leitura ---------- */
  get(id: string) { return this.items.get(id); }
  list() { return [...this.items.values()]; }

  /* ---------- Escrita local ---------- */
  private clean(item: T): T { return this.opts.softDelete === false ? item : ({ ...item, deleted_at: null } as T); }
  put(item: T) {
    if (bloqueado()) return;
    const clean = this.clean(item);
    this.items.set(item.id, clean);
    this.outbox.set(item.id, clean);
    this.save(); this.emit(); this.scheduleFlush();
  }
  putMany(list: T[]) {
    if (bloqueado()) return;
    list.forEach(item => { const clean = this.clean(item); this.items.set(item.id, clean); this.outbox.set(item.id, clean); });
    this.save(); this.emit(); this.scheduleFlush();
  }
  remove(id: string) {
    if (bloqueado()) return;
    const cur = this.items.get(id);
    if (!cur) return;
    this.items.delete(id);
    this.outbox.set(id, { ...cur, deleted_at: new Date().toISOString() });
    this.save(); this.emit(); this.scheduleFlush();
  }
  /** Apaga o cache deste aparelho (outra empresa entrou): a próxima leitura traz tudo do servidor de novo. */
  reset() {
    this.epoca++;
    this.pulling = null;
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    this.items.clear(); this.outbox.clear(); this.cursor = null; this.cursorId = null; this.pulledOnce = false;
    this.save(); this.emit();
  }
  /** Substitui tudo localmente (usado por importação de backup no modo local). */
  replaceLocal(list: T[]) { this.items = new Map(list.map(i => [i.id, i])); this.outbox = new Map(list.map(i => [i.id, i])); this.save(); this.emit(); this.scheduleFlush(); }

  /* ---------- Envio ---------- */
  private scheduleFlush() {
    if (!syncEnabled || !supabase) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => { void this.flush(); }, FLUSH_DELAY);
  }
  async flush() {
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    if (!syncEnabled || !supabase || !this.outbox.size) return;
    const batch = [...this.outbox.values()];
    this.setStatus('syncing');
    // updated_at é definido pelo servidor; não enviamos o valor local.
    const rows = batch.map(r => { const { updated_at: _u, ...rest } = r; if (this.opts.softDelete === false) delete (rest as SyncRow).deleted_at; return rest; });
    // defaultToNull: false → coluna que não veio na linha usa o valor padrão do banco (ex.: empresa_id = empresa de
    // quem grava), mesmo quando outras linhas do mesmo envio trazem a coluna.
    const { error } = await supabase.from(this.opts.table).upsert(rows as Record<string, unknown>[], { defaultToNull: false });
    if (error) { this.setStatus('error'); return; }
    // Remove da fila apenas o que não mudou durante o envio.
    batch.forEach(r => { if (this.outbox.get(r.id) === r) this.outbox.delete(r.id); });
    this.save();
    this.setStatus('ok');
    this.emit();
  }

  /* ---------- Leitura incremental ---------- */
  pull() {
    if (!syncEnabled || !supabase) return Promise.resolve();
    if (!this.pulling) {
      const p: Promise<void> = this.doPull(this.epoca).finally(() => { if (this.pulling === p) this.pulling = null; });
      this.pulling = p;
    }
    return this.pulling;
  }
  private async doPull(epoca: number) {
    if (!supabase) return;
    await this.loading;
    if (epoca !== this.epoca) return;
    this.setStatus('syncing');
    try {
      for (;;) {
        // Ordem (updated_at, id) com cursor composto: nenhuma linha se perde entre páginas, mesmo com horários iguais.
        let q = supabase.from(this.opts.table).select('*').order('updated_at', { ascending: true }).order('id', { ascending: true }).limit(PAGE);
        // Valores entre aspas no filtro, com aspas e barras escapadas (o id é texto livre).
        const aspas = (v: string) => `"${v.replace(/[\\"]/g, m => '\\' + m)}"`;
        if (this.cursor && this.cursorId) q = q.or(`updated_at.gt.${aspas(this.cursor)},and(updated_at.eq.${aspas(this.cursor)},id.gt.${aspas(this.cursorId)})`);
        else if (this.cursor) q = q.gt('updated_at', this.cursor);
        if (this.opts.filter) q = this.opts.filter(q);
        const { data, error } = await q;
        if (epoca !== this.epoca) return; // o cache foi limpo (troca de rede) enquanto lia: descarta
        if (error) throw error;
        const rows = (data ?? []) as T[];
        rows.forEach(r => {
          if (this.outbox.has(r.id)) return; // alteração local pendente tem prioridade
          if (r.deleted_at) this.items.delete(r.id); else this.items.set(r.id, r);
        });
        if (rows.length) { const ult = rows[rows.length - 1]; this.cursor = ult.updated_at ?? this.cursor; this.cursorId = ult.id; }
        if (rows.length < PAGE) break;
      }
      this.pulledOnce = true;
      this.save();
      this.status = 'ok';
      this.emit();
    } catch {
      if (epoca === this.epoca) this.setStatus('error');
    }
  }

  async sync() { await this.flush(); await this.pull(); }
}

/* ---------- Só leitura (dono da plataforma visitando outra rede como auditor) ---------- */
let somenteLeitura = false;
let aoBloquear: (() => void) | null = null;
let ultimoAviso = 0;
/** Enquanto ligado, nenhuma coleção grava (o banco também barra). `aviso` explica ao usuário, no máximo a cada 4 s. */
export function setSomenteLeitura(on: boolean) { somenteLeitura = on; }
/** Mensagem mostrada quando algo tenta gravar no modo só leitura (definida pelo layout, que tem os avisos). */
export function setAvisoSomenteLeitura(aviso: (() => void) | null) { aoBloquear = aviso; }
export const ehSomenteLeitura = () => somenteLeitura;
function bloqueado() {
  if (!somenteLeitura) return false;
  if (Date.now() - ultimoAviso > 4000) { ultimoAviso = Date.now(); aoBloquear?.(); }
  return true;
}

/** Liga/desliga a sincronização com o servidor para todas as coleções (sessão com acesso). */
export function setSyncEnabled(on: boolean) {
  syncEnabled = on && !!supabase;
  registry.forEach(c => { c.status = syncEnabled ? 'idle' : 'local'; });
  recalcularAtividade();
}

/* ---------- Atividade geral (para a barra de sincronização do app) ---------- */
type Atividade = { sincronizando: number; erro: boolean };
let atividade: Atividade = { sincronizando: 0, erro: false };
const ouvintesAtividade = new Set<() => void>();
function recalcularAtividade() {
  const sincronizando = registry.filter(c => c.status === 'syncing').length;
  const erro = registry.some(c => c.status === 'error');
  if (sincronizando === atividade.sincronizando && erro === atividade.erro) return;
  atividade = { sincronizando, erro };
  ouvintesAtividade.forEach(fn => fn());
}
const assinarAtividade = (fn: () => void) => { ouvintesAtividade.add(fn); return () => { ouvintesAtividade.delete(fn); }; };
/** Quantas coleções estão sincronizando agora e se alguma falhou (para o aviso no alto da tela). */
export function useAtividadeSync() {
  return useSyncExternalStore(assinarAtividade, () => atividade, () => atividade);
}
export const isSyncEnabled = () => syncEnabled;
export async function syncAll() { await Promise.all(registry.map(c => c.sync())); }
export async function flushAll() { await Promise.all(registry.map(c => c.flush())); }
/** Chaves "nevoeiro.*" do aparelho que não são dados de empresa (ficam quando outra empresa entra no aparelho). */
const PREFERENCIAS_DO_APARELHO = new Set([
  'nevoeiro.auth.ultimo-email', 'nevoeiro.preferencias.v1', 'nevoeiro.modulos.recentes.v1', 'nevoeiro.coleta.dispositivo',
  'nevoeiro.display-escala.v1', 'nevoeiro.display-theme.v1',
]);
const ehPreferencia = (k: string) => PREFERENCIAS_DO_APARELHO.has(k) || k.startsWith('nevoeiro.perfil.');

/**
 * Limpa o cache local de todas as coleções (troca de empresa no aparelho).
 * Os módulos são carregados sob demanda: a coleção de um módulo que ainda não foi aberto nesta sessão não está no
 * registro, e o cache dela (da empresa anterior) apareceria quando o módulo abrisse. Por isso também são apagados
 * do aparelho todos os outros dados "nevoeiro.*" (caches, rascunhos, produtos da contagem e telas abertas), menos
 * as preferências do aparelho. A sessão de login e os tutoriais vistos usam outras chaves e não são tocados.
 */
export async function resetAll() {
  await Promise.all(registry.map(c => c.whenLoaded()));
  registry.forEach(c => c.reset());
  try {
    const registradas = new Set(registry.map(c => c.chave));
    const sobras = (await AsyncStorage.getAllKeys()).filter(k => k.startsWith('nevoeiro.') && !ehPreferencia(k) && !registradas.has(k));
    if (sobras.length) await AsyncStorage.multiRemove(sobras);
  } catch { /* armazenamento indisponível: o registro acima já limpou o que estava em uso */ }
}

/** Hook: lista viva da coleção e seu estado. */
export function useCollection<T extends SyncRow>(c: Collection<T>) {
  return useSyncExternalStore(c.subscribe, c.getSnapshot, c.getSnapshot);
}

/** Estado resumido de várias coleções, para o selo "Sincronizado / Sem sincronizar". */
export function combinedStatus(states: SyncStatus[]): SyncStatus {
  if (states.includes('error')) return 'error';
  if (states.includes('syncing')) return 'syncing';
  if (states.every(s => s === 'local')) return 'local';
  return states.includes('ok') ? 'ok' : 'idle';
}
