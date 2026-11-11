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

type Persisted<T> = { items: T[]; cursor: string | null; outbox: T[] };
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
  private listeners = new Set<() => void>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private pulling: Promise<void> | null = null;
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
      }
    } catch { /* cache corrompido: começa vazio e a leitura do servidor repõe */ }
    this.loaded = true;
    this.emit();
  }
  whenLoaded() { return this.loading; }
  private save() {
    const p: Persisted<T> = { items: [...this.items.values()], cursor: this.cursor, outbox: [...this.outbox.values()] };
    void AsyncStorage.setItem(this.opts.storageKey, JSON.stringify(p)).catch(() => undefined);
  }

  /* ---------- Leitura ---------- */
  get(id: string) { return this.items.get(id); }
  list() { return [...this.items.values()]; }

  /* ---------- Escrita local ---------- */
  private clean(item: T): T { return this.opts.softDelete === false ? item : ({ ...item, deleted_at: null } as T); }
  put(item: T) {
    const clean = this.clean(item);
    this.items.set(item.id, clean);
    this.outbox.set(item.id, clean);
    this.save(); this.emit(); this.scheduleFlush();
  }
  putMany(list: T[]) {
    list.forEach(item => { const clean = this.clean(item); this.items.set(item.id, clean); this.outbox.set(item.id, clean); });
    this.save(); this.emit(); this.scheduleFlush();
  }
  remove(id: string) {
    const cur = this.items.get(id);
    if (!cur) return;
    this.items.delete(id);
    this.outbox.set(id, { ...cur, deleted_at: new Date().toISOString() });
    this.save(); this.emit(); this.scheduleFlush();
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
    const { error } = await supabase.from(this.opts.table).upsert(rows as Record<string, unknown>[]);
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
    if (!this.pulling) this.pulling = this.doPull().finally(() => { this.pulling = null; });
    return this.pulling;
  }
  private async doPull() {
    if (!supabase) return;
    await this.loading;
    this.setStatus('syncing');
    try {
      for (;;) {
        let q = supabase.from(this.opts.table).select('*').order('updated_at', { ascending: true }).limit(PAGE);
        if (this.cursor) q = q.gt('updated_at', this.cursor);
        if (this.opts.filter) q = this.opts.filter(q);
        const { data, error } = await q;
        if (error) throw error;
        const rows = (data ?? []) as T[];
        rows.forEach(r => {
          if (this.outbox.has(r.id)) return; // alteração local pendente tem prioridade
          if (r.deleted_at) this.items.delete(r.id); else this.items.set(r.id, r);
        });
        if (rows.length) this.cursor = rows[rows.length - 1].updated_at ?? this.cursor;
        if (rows.length < PAGE) break;
      }
      this.pulledOnce = true;
      this.save();
      this.status = 'ok';
      this.emit();
    } catch {
      this.setStatus('error');
    }
  }

  async sync() { await this.flush(); await this.pull(); }
}

/** Liga/desliga a sincronização com o servidor para todas as coleções (sessão com acesso). */
export function setSyncEnabled(on: boolean) {
  syncEnabled = on && !!supabase;
  registry.forEach(c => { c.status = syncEnabled ? 'idle' : 'local'; });
}
export const isSyncEnabled = () => syncEnabled;
export async function syncAll() { await Promise.all(registry.map(c => c.sync())); }
export async function flushAll() { await Promise.all(registry.map(c => c.flush())); }

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
