import * as DocumentPicker from 'expo-document-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { useMemo } from 'react';
import { Linking, Platform } from 'react-native';
import { useFiliais } from '../../lib/data';
import { supabase } from '../../lib/supabase';
import { Collection, combinedStatus, useCollection } from '../../lib/sync';
import { hojeISO, numeroDe, uid } from '../../lib/util';
import { type Atividade, calcProxima, CRITS, type Evidencia, type Notas, type Pontuacao, risco, riscoDe, type Tarefa, type Unidade, type Visita } from './model';

/* ---------- Coleções (sincronizadas, funcionam sem internet) ---------- */
export const unidadesCol = new Collection<Unidade>({ table: 'rm_unidades', storageKey: 'nevoeiro.riscos.unidades.v1' });
export const pontuacoesCol = new Collection<Pontuacao>({ table: 'rm_pontuacoes', storageKey: 'nevoeiro.riscos.pontuacoes.v1' });
export const atividadesCol = new Collection<Atividade>({ table: 'rm_atividades', storageKey: 'nevoeiro.riscos.atividades.v1' });
export const visitasCol = new Collection<Visita>({ table: 'rm_visitas', storageKey: 'nevoeiro.riscos.visitas.v1' });
export const syncRiscos = () => Promise.all([unidadesCol.sync(), pontuacoesCol.sync(), atividadesCol.sync(), visitasCol.sync()]);

export function useRiscos() {
  const f = useFiliais();
  const u = useCollection(unidadesCol), p = useCollection(pontuacoesCol), a = useCollection(atividadesCol), v = useCollection(visitasCol);
  const unidades = useMemo(() => [...u.list].sort((x, y) => x.nome.localeCompare(y.nome, 'pt-BR', { numeric: true })), [u.list]);
  return {
    filiais: f.filiais, unidades, pontuacoes: p.list, atividades: a.list, visitas: v.list,
    loaded: u.loaded && p.loaded && a.loaded && v.loaded && f.loaded,
    status: combinedStatus([u.status, p.status, a.status, v.status, f.status]),
  };
}
export type DadosRiscos = ReturnType<typeof useRiscos>;

/** Grava a unidade recalculando a próxima visita pela última revisão e pela classe de risco. */
export function salvarUnidade(u: Unidade) {
  unidadesCol.put({ ...u, proxima_visita: calcProxima(u.ultima_revisao, riscoDe(u).cl) ?? (u.ultima_revisao ? null : u.proxima_visita) });
}

/** Visita do planejamento (unidade + data): o id é fixo, então dois aparelhos caem na mesma visita. */
export const idVisita = (unidadeId: string, data: string) => `${unidadeId}:${data}`;
export function adicionarTarefas(unidadeId: string, data: string, novas: Omit<Tarefa, 'id' | 'status' | 'prodLancada' | 'acaoLancada' | 'criada'>[]) {
  const id = idVisita(unidadeId, data);
  const atual = visitasCol.get(id) ?? { id, unidade_id: unidadeId, data, tarefas: [] };
  const tarefas = [...atual.tarefas, ...novas.map(t => ({ ...t, id: uid('pt'), status: 'Pendente' as const, prodLancada: false, acaoLancada: false, criada: new Date().toISOString() }))];
  visitasCol.put({ ...atual, tarefas });
}

/* ---------- Evidências (Storage, bucket privado) ---------- */
export const BUCKET = 'riscos-evidencias';
export type Arquivo = { dados: Uint8Array; nome: string; tipo: string };
const LIMITE = 10 * 1024 * 1024;

function base64ParaBytes(b64: string) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

/** Foto (câmera ou galeria, reduzida) ou documento (PDF, Word, Excel). Devolve null se o usuário cancelar. */
export async function escolherEvidencia(origem: 'camera' | 'galeria' | 'arquivo'): Promise<Arquivo | null> {
  if (origem === 'arquivo') {
    const r = await DocumentPicker.getDocumentAsync({
      copyToCacheDirectory: true, multiple: false,
      type: ['image/*', 'application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
    });
    if (r.canceled || !r.assets?.[0]) return null;
    const a = r.assets[0];
    if ((a.size ?? 0) > LIMITE) throw new Error('Arquivo maior que 10 MB.');
    const buf = a.file ? await a.file.arrayBuffer() : await (await fetch(a.uri)).arrayBuffer();
    if (buf.byteLength > LIMITE) throw new Error('Arquivo maior que 10 MB.');
    return { dados: new Uint8Array(buf), nome: a.name || 'evidencia', tipo: a.mimeType || 'application/octet-stream' };
  }
  if (origem === 'camera') {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) throw new Error('Permita o uso da câmera nas configurações do aparelho.');
  }
  const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 1 };
  const r = origem === 'camera' ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
  if (r.canceled || !r.assets?.[0]) return null;
  const a = r.assets[0];
  const maior = Math.max(a.width ?? 0, a.height ?? 0);
  const acoes: ImageManipulator.Action[] = maior > 1600 ? [{ resize: (a.width ?? 0) >= (a.height ?? 0) ? { width: 1600 } : { height: 1600 } }] : [];
  const out = await ImageManipulator.manipulateAsync(a.uri, acoes, { compress: 0.65, format: ImageManipulator.SaveFormat.JPEG, base64: true });
  if (!out.base64) return null;
  return { dados: base64ParaBytes(out.base64), nome: `foto-${hojeISO()}.jpg`, tipo: 'image/jpeg' };
}

/** Envia a evidência para a pasta da unidade. Precisa de internet. */
export async function enviarEvidencia(unidadeId: string, arq: Arquivo): Promise<Evidencia> {
  if (!supabase) throw new Error('Evidências precisam do servidor: o app está em modo local.');
  const ext = (arq.nome.match(/\.([a-z0-9]{1,5})$/i)?.[1] ?? (arq.tipo === 'image/jpeg' ? 'jpg' : 'bin')).toLowerCase();
  const path = `${unidadeId}/${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}.${ext}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, arq.dados, { contentType: arq.tipo, upsert: false });
  if (error) throw new Error(error.message.includes('fetch') ? 'Sem conexão com o servidor. Tente de novo com internet.' : error.message);
  return { path, nome: arq.nome, tipo: arq.tipo };
}

export async function abrirEvidencia(ev: Evidencia) {
  if (!supabase) throw new Error('Sem servidor configurado.');
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(ev.path, 600);
  if (error || !data?.signedUrl) throw new Error('Não foi possível abrir a evidência. Verifique a conexão.');
  if (Platform.OS === 'web') window.open(data.signedUrl, '_blank'); else await Linking.openURL(data.signedUrl);
}
export async function apagarEvidencia(ev: Evidencia | null | undefined) {
  if (ev && supabase) await supabase.storage.from(BUCKET).remove([ev.path]).catch(() => undefined);
}

/* ---------- Importação do backup do HTML antigo (botão "Backup" do Mapa de Risco) ----------
   Unidades são associadas pelo nome; notas do "Histórico de Auditorias" pelo número da filial.
   Evidências gravadas dentro do navegador não são importadas (ficam citadas na observação). */
type Velho = Record<string, unknown>;
const brIso = (v: unknown) => { const m = String(v ?? '').match(/^(\d{2})\/(\d{2})\/(\d{4})$/); return m ? `${m[3]}-${m[2]}-${m[1]}` : /^\d{4}-\d{2}-\d{2}$/.test(String(v ?? '')) ? String(v) : null; };
const n5 = (v: unknown) => Math.max(0, Math.min(5, Math.round(Number(v) || 0)));

export async function lerArquivoJson(): Promise<unknown | null> {
  const r = await DocumentPicker.getDocumentAsync({ type: ['application/json', 'text/plain', '*/*'], copyToCacheDirectory: true, multiple: false });
  if (r.canceled || !r.assets?.[0]) return null;
  const a = r.assets[0];
  const texto = a.file ? await a.file.text() : await (await fetch(a.uri)).text();
  return JSON.parse(texto);
}

export function importarBackup(dados: unknown, anoNotas: number) {
  const d = (dados ?? {}) as { mapa?: Velho[]; auditoria?: Velho[]; pontuacoesPrograma?: Velho[]; produtividade?: Velho[]; planejamento?: Velho[] };
  const r = { unidades: 0, novas: 0, notas: 0, pontuacoes: 0, atividades: 0, visitas: 0 };
  const porNome = new Map(unidadesCol.list().map(u => [u.nome.trim().toLowerCase(), u]));
  const resolver = (nome: unknown) => porNome.get(String(nome ?? '').trim().toLowerCase());

  const novasUnidades: Unidade[] = [];
  (d.mapa ?? []).forEach(m => {
    const nome = String(m.u ?? '').trim();
    if (!nome) return;
    const atual = resolver(nome);
    const crit = { p: n5(m.p), c: n5(m.c), cx: n5(m.cx), pe: n5(m.pe), h: n5(m.h) };
    const ur = brIso(m.ur);
    const u: Unidade = { ...(atual ?? { id: uid('rmu'), nome, filial_id: null, notas: {} }), ...crit, ultima_revisao: ur, proxima_visita: calcProxima(ur, risco(crit.p, crit.c, crit.cx, crit.pe, crit.h).cl) ?? brIso(m.pv) } as Unidade;
    if (!atual) r.novas++;
    r.unidades++;
    porNome.set(nome.toLowerCase(), u);
    novasUnidades.push(u);
  });

  // Notas mensais: linha "Filial N" vale para todas as unidades com o número N.
  const comNotas = new Map<string, Unidade>();
  (d.auditoria ?? []).forEach(a => {
    const n = numeroDe(String(a.f ?? ''));
    const meses = Array.isArray(a.m) ? (a.m as unknown[]) : [];
    if (n === null) return;
    [...porNome.values()].filter(u => numeroDe(u.nome) === n).forEach(u => {
      const base = comNotas.get(u.id) ?? u;
      const notas: Notas = { ...(base.notas ?? {}) };
      meses.forEach((v, i) => { if (v !== null && v !== '' && Number.isFinite(Number(v))) { notas[`${anoNotas}-${String(i + 1).padStart(2, '0')}`] = Number(v); r.notas++; } });
      comNotas.set(u.id, { ...base, notas });
    });
  });
  const finais = new Map<string, Unidade>();
  novasUnidades.forEach(u => finais.set(u.id, u));
  comNotas.forEach((u, id) => finais.set(id, { ...(finais.get(id) ?? u), notas: u.notas }));
  if (finais.size) unidadesCol.putMany([...finais.values()]);

  const pts: Pontuacao[] = [];
  (d.pontuacoesPrograma ?? []).forEach(x => {
    const u = resolver(x.unit); const periodo = String(x.period ?? '');
    if (!u || !/^\d{4}-\d{2}$/.test(periodo)) return;
    const nota = x.nota !== undefined ? Number(x.nota) : Number(x.audit) / 10;
    const crit = { p: n5(x.p) || u.p || 1, c: n5(x.c) || u.c || 1, cx: n5(x.cx) || u.cx || 1, pe: n5(x.pe) || u.pe || 1, h: n5(x.h) || u.h || 1 };
    if (!Number.isFinite(nota)) return;
    pts.push({ id: `${u.id}:${periodo}`, unidade_id: u.id, periodo, nota: Math.max(0, Math.min(10, nota)), ...crit, planos: Math.max(0, Math.min(100, Number(x.plans ?? x.action ?? 100) || 0)), obs: String(x.note ?? '') });
  });
  if (pts.length) { pontuacoesCol.putMany(pts); r.pontuacoes = pts.length; }

  const ativ: Atividade[] = [];
  (d.produtividade ?? []).forEach(x => {
    const u = resolver(x.unit); const data = brIso(x.date);
    if (!u || !data || !String(x.task ?? '').trim()) return;
    const ev = (x.evidence as { name?: string } | null)?.name;
    ativ.push({
      id: uid('rma'), unidade_id: u.id, data, tarefa: String(x.task), categoria: String(x.category ?? 'Checklist'),
      obs: [String(x.note ?? ''), ev ? `(Evidência no navegador antigo: ${ev})` : ''].filter(Boolean).join(' '),
      status: x.status === 'Pendente' ? 'Pendente' : 'Concluído', levar_proxima: x.carryToNextVisit === true, proxima_visita: brIso(x.nextVisitDate),
      evidencia: null, concluido_em: typeof x.completedAt === 'string' ? x.completedAt : null,
    });
  });
  if (ativ.length) { atividadesCol.putMany(ativ); r.atividades = ativ.length; }

  const vis: Visita[] = [];
  (d.planejamento ?? []).forEach(x => {
    const u = resolver(x.filial); const data = brIso(x.date);
    if (!u || !data) return;
    const tarefas = (Array.isArray(x.tasks) ? (x.tasks as Velho[]) : []).map(t => ({
      id: uid('pt'), titulo: String(t.title ?? ''), desc: String(t.desc ?? ''), categoria: String(t.category ?? 'Checklist'), obs: String(t.note ?? ''), evidencia: null,
      status: (['Concluída', 'Não concluída'].includes(String(t.status)) ? t.status : 'Pendente') as Tarefa['status'], levar: t.carryToNextVisit !== false,
      prodLancada: !!t.prodPushed, acaoLancada: !!t.actionPushed, criada: String(t.createdAt ?? new Date().toISOString()),
    }));
    const id = idVisita(u.id, data);
    const atual = visitasCol.get(id) ?? vis.find(v => v.id === id);
    const v = { id, unidade_id: u.id, data, tarefas: [...(atual?.tarefas ?? []), ...tarefas] };
    const i = vis.findIndex(z => z.id === id);
    if (i >= 0) vis[i] = v; else vis.push(v);
  });
  if (vis.length) { visitasCol.putMany(vis); r.visitas = vis.length; }
  return r;
}

export const critsVazios = () => Object.fromEntries(CRITS.map(k => [k, 0])) as Record<(typeof CRITS)[number], number>;
