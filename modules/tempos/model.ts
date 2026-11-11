import type { SyncRow } from '../../lib/sync';

// Modelo do módulo Tempos e Movimentos.
// Hierarquia: Filial (cadastro único) → Data → Coleta → Atendimentos → Etapas.

export const SETORES = ['Pista de abastecimento', 'Loja e conveniência', 'Gerência e administração', 'Estoque e recebimento'] as const;
export const CLASSES = ['Operacional', 'Atendimento', 'Administrativa', 'Organização e apoio', 'Controle', 'Espera', 'Retrabalho'] as const;
export const DEMANDAS = ['Pico', 'Movimento normal', 'Baixo movimento'] as const;
export const TURNOS = ['Manhã', 'Tarde', 'Noite'] as const;
export const TODOS_SETORES = '';

export type Atividade = { id: string; nome: string; setor: string; classe: string; ref: number | null; ativo?: boolean };
export type Parametros = { ritmo: number; tol: number };

/** Etapa cronometrada. Horários ISO; `fim` nulo = em andamento. Pausas: [início, fim|null]. */
export type Etapa = { ordem: number; atividade_id: string; inicio: string | null; fim: string | null; duracao_s: number; pausas: [string, string | null][] };

/** Linha de tm_atendimentos. Só vai ao servidor depois de finalizado; enquanto isso fica como rascunho no aparelho. */
export type Atendimento = SyncRow & {
  coleta_id: string;
  tipo: 'completo' | 'isolada';
  funcionario: string;
  /** Tipo de veículo atendido (id do catálogo de veículos); vazio se não informado. */
  veiculo?: string;
  inicio: string | null;
  fim: string | null;
  duracao_s: number;
  etapas: Etapa[];
  volume: number | null;
  deslocamentos: number | null;
  obs: string;
  origem: 'app' | 'importado';
};

/** Linha de tm_coletas. */
export type Coleta = SyncRow & { filial_id: string; data: string; setor: string; funcao: string; turno: string; demanda: string; auditor: string };

/* ---------- Utilidades ---------- */
export const uid = (p: string) => `${p}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
export const hoje = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
export const dataBR = (v: string) => { const p = v.split('-'); return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : v; };
export const horaBR = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '--:--:--');
export const ms = (iso: string) => Date.parse(iso);

/** Segundos pausados na etapa (pausa aberta conta até `agora`). */
export const pausaSeg = (e: Etapa, agora = Date.now()) => e.pausas.reduce((s, [i, f]) => s + Math.max(0, ((f ? ms(f) : agora) - ms(i)) / 1000), 0);
export const etapaPausada = (e: Etapa) => !e.fim && e.pausas.length > 0 && e.pausas[e.pausas.length - 1][1] === null;
/** Duração líquida da etapa: em andamento é calculada ao vivo; encerrada usa o valor gravado. */
export const duracaoEtapa = (e: Etapa, agora = Date.now()) =>
  !e.fim && e.inicio ? Math.max(0, (agora - ms(e.inicio)) / 1000 - pausaSeg(e, agora)) : e.duracao_s;
/** Tempo total do atendimento = soma das etapas (intervalos entre etapas e pausas não contam). */
export const duracaoAtendimento = (a: Atendimento, agora = Date.now()) => (a.fim ? a.duracao_s : a.etapas.reduce((s, e) => s + duracaoEtapa(e, agora), 0));
export const etapaAberta = (a: Atendimento) => a.etapas.find(e => !e.fim) ?? null;

export const fmtCrono = (seg: number) => { const m = Math.floor(seg / 60), s = seg - m * 60; return `${String(m).padStart(2, '0')}:${s.toFixed(1).padStart(4, '0').replace('.', ',')}`; };
/** Duração curta para listas: 1:35 ou 1h 05min. */
export const fmtDur = (seg: number) => { const s = Math.round(seg); const h = Math.floor(s / 3600), mi = Math.floor((s % 3600) / 60), ss = s % 60; return h ? `${h}h ${String(mi).padStart(2, '0')}min` : `${mi}:${String(ss).padStart(2, '0')}`; };
export const fmtMin = (seg: number) => (seg / 60).toLocaleString('pt-BR', { maximumFractionDigits: 1 });
export const num = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 1 });
export const normNome = (s: string) => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\b(de|da|do|para)\b/g, '').replace(/[^a-z0-9]/g, '');

/* ---------- Catálogo inicial (planilha de referência do ETM) ---------- */
const P = SETORES[0], L = SETORES[1], G = SETORES[2], E = SETORES[3];
const SEED: [string, string, string, number?][] = [
  ['Abordagem', P, 'Atendimento'], ['Abastecimento', P, 'Operacional', 8], ['Limpeza de para-brisa', P, 'Atendimento', 3],
  ['Calibragem pneu sem estepe', P, 'Operacional', 6], ['Calibragem pneu com estepe', P, 'Operacional', 10],
  ['Verificação de água e óleo', P, 'Atendimento'], ['Pagamento', P, 'Atendimento'],
  ['Deslocamento bomba até o caixa', P, 'Atendimento'], ['Posicionamento na pista', P, 'Operacional'],
  ['Troca de óleo carro', P, 'Operacional'], ['Troca de óleo moto', P, 'Operacional'], ['Troca de óleo caminhão', P, 'Operacional'],
  ['Lubrificação sem truck', P, 'Operacional'], ['Varrição caminhão carreta', P, 'Organização e apoio'], ['Varrição caminhão bi-trem', P, 'Organização e apoio'],
  ['Lavagem', P, 'Operacional'], ['Trocador', P, 'Operacional'], ['Limpeza da pista', P, 'Organização e apoio', 25],
  ['Limpeza de canaletas', P, 'Organização e apoio', 40], ['Limpeza de banheiros', P, 'Organização e apoio'], ['Limpeza de bombas', P, 'Organização e apoio'],
  ['Limpeza de ilhas', P, 'Organização e apoio'], ['Medição de tanque por tanque', P, 'Controle'], ['Verificação ordem de frete', P, 'Controle'],
  ['Atendimento no caixa', L, 'Atendimento'], ['Reposição de produtos', L, 'Organização e apoio'],
  ['Fechamento de caixa', G, 'Administrativa'], ['Conferência de documentos', G, 'Administrativa'],
  ['Recebimento de mercadorias', E, 'Operacional'], ['Conferência de notas', E, 'Administrativa'], ['Contagem de estoque', E, 'Controle'],
  ['Espera', TODOS_SETORES, 'Espera'], ['Retrabalho', TODOS_SETORES, 'Retrabalho'],
];
export const ATIVIDADES_PADRAO: Atividade[] = SEED.map(([nome, setor, classe, ref], i) => ({ id: `atv-${i}`, nome, setor, classe, ref: ref ?? null, ativo: true }));
export const PARAMETROS_PADRAO: Parametros = { ritmo: 1, tol: 15 };

/* ---------- Tipos de veículo (catálogo editável pelo administrador) ---------- */
export type Veiculo = { id: string; nome: string; ativo?: boolean };
export const CFG_VEICULOS = 'tm.veiculos';
export const VEICULOS_PADRAO: Veiculo[] = [
  ['passeio', 'Carro de passeio'], ['suv', 'SUV / caminhonete'], ['utilitario', 'Utilitário / van'], ['moto', 'Moto'],
  ['taxi_app', 'Táxi / aplicativo'], ['frota', 'Veículo de frota'], ['caminhao_leve', 'Caminhão leve (3/4, VUC)'],
  ['caminhao_toco', 'Caminhão toco'], ['caminhao_truck', 'Caminhão truck'], ['cavalo', 'Cavalo mecânico (sem reboque)'],
  ['carreta', 'Carreta'], ['bitrem', 'Bitrem'], ['rodotrem', 'Rodotrem'], ['onibus', 'Ônibus'], ['micro_onibus', 'Micro-ônibus'],
  ['agricola', 'Trator / máquina agrícola'], ['maquina', 'Máquina pesada'], ['vasilhame', 'Galão / vasilhame'], ['outro', 'Outro'],
].map(([id, nome]) => ({ id, nome, ativo: true }));
export const CFG_ATIVIDADES = 'tm.atividades';
export const CFG_PARAMETROS = 'tm.parametros';

/** Ordem sugerida de um atendimento completo na pista. As etapas intermediárias são opcionais. */
export const SEQUENCIA_PISTA = ['Abordagem', 'Abastecimento', 'Limpeza de para-brisa', 'Calibragem pneu sem estepe', 'Calibragem pneu com estepe', 'Verificação de água e óleo', 'Pagamento'];
