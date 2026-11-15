import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Linking, Platform } from 'react-native';
import { useFiliais } from '../../lib/data';
import { isSupabaseConfigured, supabase } from '../../lib/supabase';
import { Collection, combinedStatus, type SyncRow, useCollection } from '../../lib/sync';

// Módulo Agenda: eventos do usuário (local-first) com sincronização do Google Agenda pela Edge Function "google-agenda".
// A cada alteração o evento fica com google_pendente = true; a função envia os pendentes e traz as mudanças do Google.

export type Evento = SyncRow & {
  titulo: string;
  descricao: string;
  local: string;
  /** AAAA-MM-DD (fuso de São Paulo). */
  data: string;
  data_fim: string | null;
  /** HH:MM; nulo = dia inteiro. */
  hora_inicio: string | null;
  hora_fim: string | null;
  filial_id: string | null;
  origem: 'app' | 'google';
  google_id: string | null;
  google_pendente: boolean;
};

export const eventosCol = new Collection<Evento>({ table: 'agenda_eventos', storageKey: 'nevoeiro.agenda.eventos.v1' });

/* ---------- Datas ---------- */
export const isoDe = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const hojeIso = () => isoDe(new Date());
export const dataDe = (iso: string) => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d); };
export const dataValida = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(dataDe(v).getTime());
export const horaValida = (v: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(v);
export const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
export const SEMANA = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
export const diaLongo = (iso: string) => {
  const d = dataDe(iso);
  return `${['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'][d.getDay()]}, ${d.getDate()} de ${MESES[d.getMonth()]}`;
};
/** O evento acontece neste dia (inclui eventos de vários dias). */
export const ocorreEm = (e: Evento, iso: string) => e.data <= iso && (e.data_fim ?? e.data) >= iso;
export const horario = (e: Evento) => (e.hora_inicio ? `${e.hora_inicio}${e.hora_fim ? `–${e.hora_fim}` : ''}` : 'Dia inteiro');
export const ordenar = (a: Evento, b: Evento) => a.data.localeCompare(b.data) || (a.hora_inicio ?? '').localeCompare(b.hora_inicio ?? '') || a.titulo.localeCompare(b.titulo);
export const uid = () => `ev-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export function useAgenda() {
  const f = useFiliais();
  const e = useCollection(eventosCol);
  const eventos = useMemo(() => [...e.list].sort(ordenar), [e.list]);
  return { eventos, filiais: f.filiais, loaded: e.loaded && f.loaded, status: combinedStatus([e.status, f.status]), pendentes: e.pending };
}

export function salvarEvento(ev: Evento) { eventosCol.put({ ...ev, google_pendente: true }); }
/** Exclusão lógica; o Google recebe a remoção na próxima sincronização. */
export function excluirEvento(ev: Evento) { eventosCol.put({ ...ev, google_pendente: true, deleted_at: new Date().toISOString() }); }

/* ---------- Google Agenda (Edge Function) ---------- */
export type StatusGoogle = { configurado: boolean; conectado: boolean; email: string | null; sincronizado_em: string | null };
type Resposta = StatusGoogle & { ok?: boolean; url?: string; erro?: string; enviados?: number; recebidos?: number };

async function chamar(acao: 'status' | 'conectar' | 'sincronizar' | 'desconectar'): Promise<Resposta> {
  if (!supabase) throw new Error('O app está em modo local: a sincronização com o Google precisa do servidor.');
  const { data, error } = await supabase.functions.invoke('google-agenda', { body: { acao } });
  if (!error) return data as Resposta;
  let erro = 'Não foi possível falar com o servidor. Verifique a conexão.';
  try {
    const r = (error as { context?: Response }).context;
    const corpo = r ? await r.json() : null;
    if (corpo?.erro) erro = String(corpo.erro);
  } catch { /* corpo não era JSON */ }
  throw new Error(erro);
}

/**
 * Estado da conexão com o Google e as ações. Sincroniza ao abrir o módulo, ao voltar ao app e
 * logo depois de cada alteração (com atraso curto, para juntar várias edições num envio só).
 */
export function useGoogleAgenda() {
  const [st, setSt] = useState<StatusGoogle | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const conectado = !!st?.conectado;
  const conectadoRef = useRef(conectado);
  conectadoRef.current = conectado;
  const rodando = useRef<Promise<void> | null>(null);

  const atualizarStatus = useCallback(async () => {
    if (!isSupabaseConfigured) return;
    try { const r = await chamar('status'); setSt(r); setErro(null); } catch (e) { setErro(e instanceof Error ? e.message : String(e)); }
  }, []);

  const sincronizar = useCallback(async () => {
    if (!isSupabaseConfigured || !conectadoRef.current) { await eventosCol.sync(); return; }
    if (rodando.current) return rodando.current;
    rodando.current = (async () => {
      setOcupado(true);
      try {
        await eventosCol.flush(); // o servidor precisa ter as alterações antes de enviá-las ao Google
        const r = await chamar('sincronizar');
        setSt(s => ({ configurado: s?.configurado ?? true, conectado: r.conectado, email: r.email ?? s?.email ?? null, sincronizado_em: r.sincronizado_em ?? s?.sincronizado_em ?? null }));
        setErro(null);
      } catch (e) { setErro(e instanceof Error ? e.message : String(e)); }
      finally { await eventosCol.sync().catch(() => undefined); setOcupado(false); rodando.current = null; }
    })();
    return rodando.current;
  }, []);

  const conectar = useCallback(async () => {
    const r = await chamar('conectar');
    if (!r.url) throw new Error('O servidor não devolveu o endereço de autorização do Google.');
    if (Platform.OS === 'web') window.open(r.url, '_blank', 'noopener');
    else await Linking.openURL(r.url);
    // Confere a conexão por alguns minutos (o usuário autoriza no navegador e volta).
    const ate = Date.now() + 3 * 60_000;
    const timer = setInterval(() => {
      void chamar('status').then(s => {
        setSt(s);
        if (s.conectado || Date.now() > ate) { clearInterval(timer); if (s.conectado) { conectadoRef.current = true; void sincronizar(); } }
      }).catch(() => { if (Date.now() > ate) clearInterval(timer); });
    }, 3000);
  }, [sincronizar]);

  const desconectar = useCallback(async () => {
    const r = await chamar('desconectar');
    setSt(s => ({ configurado: s?.configurado ?? true, conectado: r.conectado, email: null, sincronizado_em: null }));
  }, []);

  // Ao abrir: status e primeira sincronização; ao voltar ao app: sincroniza de novo.
  useEffect(() => { void atualizarStatus(); void eventosCol.sync(); }, [atualizarStatus]);
  useEffect(() => { if (conectado) void sincronizar(); }, [conectado, sincronizar]);
  useEffect(() => {
    const sub = AppState.addEventListener('change', s => { if (s === 'active') { void atualizarStatus(); if (conectadoRef.current) void sincronizar(); } });
    return () => sub.remove();
  }, [atualizarStatus, sincronizar]);

  // Depois de cada alteração local, envia ao Google (com atraso para agrupar edições).
  const espera = useRef<ReturnType<typeof setTimeout> | null>(null);
  const agendarEnvio = useCallback(() => {
    if (espera.current) clearTimeout(espera.current);
    espera.current = setTimeout(() => { void sincronizar(); }, 1500);
  }, [sincronizar]);
  useEffect(() => () => { if (espera.current) clearTimeout(espera.current); }, []);

  return { status: st, conectado, ocupado, erro, conectar, desconectar, sincronizar, agendarEnvio };
}
