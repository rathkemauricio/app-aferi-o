import { useEffect, useRef } from 'react';
import { AppState, Platform } from 'react-native';
import { supabase } from './supabase';

/**
 * Quem está online (tabela `presenca`, migração 20261123000100_presenca).
 * A conta logada avisa a cada 30 s (e a cada mudança de tela ou de coleta) em que tela está e o que está coletando.
 * O administrador da rede vê as contas da rede; o dono da plataforma vê todas as redes.
 */

/** O que a pessoa está coletando agora, em qualquer módulo. */
export type Atividade = {
  /** Id do módulo (coleta, afericoes, tanques, auditoria, tempos…). */
  modulo: string;
  /** Ex.: "Contagem Bebidas", "Aferição de bicos". */
  titulo: string;
  filial?: string;
  /** Andamento em texto (ex.: "Rodada 1 · 120 de 340 itens"). */
  detalhe?: string;
  /** 0 a 100. */
  pct?: number;
  /** Últimos lançamentos, do mais novo para o mais antigo (ex.: "12:31 · Coca-Cola 2L +6"). */
  recentes?: string[];
  /** Rota para acompanhar (abre o mesmo registro em quem estiver olhando). */
  abrir?: string;
};

export const ONLINE_MS = 2 * 60_000;
const BATIDA_MS = 30_000;

let tela = '';
let atividade: Atividade | null = null;
let ligado = false;
let espera: ReturnType<typeof setTimeout> | null = null;
let ultimoEnvio = '';

const plataforma = () => (Platform.OS === 'web' ? 'navegador' : Platform.OS === 'ios' ? 'iPhone' : 'app Android');

function enviar(forcar = false) {
  if (!supabase || !ligado) return;
  const corpo = { p_tela: tela, p_atividade: atividade, p_plataforma: plataforma() };
  const chave = JSON.stringify(corpo);
  if (!forcar && chave === ultimoEnvio) return;
  ultimoEnvio = chave;
  void supabase.rpc('marcar_presenca', corpo).then(() => undefined, () => { ultimoEnvio = ''; });
}
/** Junta mudanças rápidas (ex.: várias leituras seguidas) num envio só. */
function agendar(ms = 3000) {
  if (espera) return;
  espera = setTimeout(() => { espera = null; enviar(); }, ms);
}

/** Liga os avisos de presença (área logada). Chame uma vez no layout. */
export function usePresenca(rota: string) {
  useEffect(() => { tela = rota; agendar(800); }, [rota]);
  useEffect(() => {
    if (!supabase) return;
    ligado = true;
    enviar(true);
    const t = setInterval(() => {
      // Navegador em segundo plano (outra aba) continua online por até 2 min; depois some da lista.
      if (Platform.OS === 'web' && typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      enviar(true);
    }, BATIDA_MS);
    const app = AppState.addEventListener('change', s => { if (s === 'active') enviar(true); });
    return () => { ligado = false; clearInterval(t); app.remove(); };
  }, []);
}

/**
 * Módulo informa o que está sendo coletado (null = nada). Some sozinho quando a tela fecha.
 * Use dentro da tela da coleta: `useAtividade(aberta ? { modulo: 'coleta', titulo: …, detalhe: … } : null)`.
 */
export function useAtividade(a: Atividade | null) {
  const chave = a ? JSON.stringify(a) : '';
  const meu = useRef<string | null>(null);
  useEffect(() => {
    atividade = a; meu.current = chave;
    agendar();
  }, [chave]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => {
    // Só limpa se ninguém pôs outra atividade depois desta.
    if (atividade && JSON.stringify(atividade) === meu.current) { atividade = null; agendar(500); }
  }, []);
}

/** Saiu da conta: some da lista na hora (antes de encerrar a sessão). */
export async function sairPresenca() {
  ligado = false;
  if (!supabase) return;
  await Promise.resolve(supabase.rpc('sair_presenca')).catch(() => undefined);
}

/** Linha da presença, como a tela "Quem está online" lê. */
export type Presenca = {
  user_id: string; empresa_id: string | null; filial_id: string | null; nome: string; email: string; papel: string;
  tela: string; atividade: Atividade | null; plataforma: string; visitando: string | null; desde: string; visto_em: string;
};
export const estaOnline = (p: Pick<Presenca, 'visto_em'>, agora = Date.now()) => agora - new Date(p.visto_em).getTime() < ONLINE_MS;

/** Nome da tela pela rota (/coleta → Contagens). */
const TELAS: Record<string, string> = {
  '': 'Início', coleta: 'Contagens', afericoes: 'Aferições', tanques: 'Conferência de Estoque', auditoria: 'Auditoria', tempos: 'Tempos e Movimentos',
  inventarios: 'Inventários', riscos: 'Mapa de Risco', agenda: 'Agenda', croqui: 'Croqui', filiais: 'Filiais', usuarios: 'Usuários e permissões',
  configuracoes: 'Configurações', conta: 'Minha conta', plataforma: 'Empresas e planos', rastro: 'Rastreabilidade', online: 'Quem está online',
  tutoriais: 'Tutoriais', bandeiras: 'Bandeiras', combustiveis: 'Combustíveis', wiki: 'Wiki',
};
export const nomeDaTela = (rota: string) => TELAS[(rota || '/').split('?')[0].split('/').filter(Boolean)[0] ?? ''] ?? rota;

/* ---------- Acompanhar a coleta de outra pessoa ---------- */
let acompanharAte = 0;
/** Quem abriu a coleta de outra pessoa pela lista "Quem está online": busca as novidades a cada 15 s por 30 min. */
export function acompanhar() { acompanharAte = Date.now() + 30 * 60_000; }
export const acompanhando = () => Date.now() < acompanharAte;
