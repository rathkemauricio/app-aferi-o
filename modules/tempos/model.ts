import type { SyncRow } from '../../lib/sync';

// Modelo do módulo Tempos e Movimentos.
// Hierarquia: Filial (cadastro único) → Data → Coleta → Atendimentos → Etapas.

export const SETORES = ['Pista de abastecimento', 'Loja e conveniência', 'Gerência e administração', 'Estoque e recebimento'] as const;
export const CLASSES = ['Operacional', 'Atendimento', 'Administrativa', 'Organização e apoio', 'Controle', 'Espera', 'Retrabalho'] as const;
export const DEMANDAS = ['Pico', 'Movimento normal', 'Baixo movimento'] as const;
export const TURNOS = ['Manhã', 'Tarde', 'Noite'] as const;
export const TODOS_SETORES = '';

export type Atividade = {
  id: string; nome: string; setor: string; classe: string; ref: number | null; ativo?: boolean;
  /** Pode acontecer a qualquer momento do dia (ex.: entrega, descarga de caminhão): não tem lugar fixo na sequência. */
  qualquerHora?: boolean;
};
/** metaColetas: coletas por filial antes de finalizar (padrão 9 = 3 turnos × 3 demandas); ciclosMinimos: amostra por atividade (padrão 10). */
export type Parametros = { ritmo: number; tol: number; metaColetas?: number; ciclosMinimos?: number };
export const META_COLETAS_PADRAO = 9;
export const CICLOS_MINIMOS_PADRAO = 10;
export const metaColetas = (p: Parametros) => (p.metaColetas && p.metaColetas > 0 ? p.metaColetas : META_COLETAS_PADRAO);
export const ciclosMinimos = (p: Parametros) => (p.ciclosMinimos && p.ciclosMinimos > 0 ? p.ciclosMinimos : CICLOS_MINIMOS_PADRAO);

/** Linha de tm_filiais_status (id = filial_id): coletas da filial finalizadas por quem e quando. */
export type StatusFilial = SyncRow & { finalizado_em: string | null; finalizado_por_nome: string; resumo: Record<string, unknown> };

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
  /** Sinal da faixa de volume ('≥' ou '≤' o valor de `volume`); vazio = volume exato (registros antigos/importados). */
  volume_faixa?: '≥' | '≤' | '';
  deslocamentos: number | null;
  obs: string;
  origem: 'app' | 'importado';
};

/** Linha de tm_coletas. */
export type Coleta = SyncRow & { filial_id: string; data: string; setor: string; funcao: string; turno: string; demanda: string; auditor: string };

/**
 * Coleta do ciclo completo (pedido do usuário, 24/11/2026): todas as atividades cadastradas da filial, sem escolher setor.
 * O setor de cada registro sai sozinho da atividade cronometrada (ver `setoresDasEtapas` em calc.ts).
 */
export const COLETA_TODOS_SETORES = 'Todos os setores';
export const coletaDoCiclo = (c: Pick<Coleta, 'setor'>) => c.setor === COLETA_TODOS_SETORES;

/* ---------- Faixas de volume ---------- */
/** Faixa de volume em litros: ≤ ou ≥ um valor de 10 a 1000 (passos de 10). Usada no Dimensionamento e no volume do atendimento. */
export type Faixa = { op: '≤' | '≥'; l: number };
/** Faixas na ordem pedida: ≥ 10, ≤ 10, ≥ 20, ≤ 20 … até 1000 L. */
export const FAIXAS: Faixa[] = Array.from({ length: 100 }, (_, i) => (i + 1) * 10).flatMap(l => [{ op: '≥' as const, l }, { op: '≤' as const, l }]);
export const rotuloFaixa = (f?: Faixa) => (f ? `${f.op} ${f.l} L` : '');

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

/* ---------- Tipos de operação (cada unidade é medida pelos critérios do seu tipo) ---------- */
export type TipoOperacao = 'posto' | 'cd';
/** Setores iniciais do centro de distribuição (CD); o administrador cria, renomeia e apaga em Cadastros (config tm.setores_cd). */
export const SETORES_CD = ['Recebimento', 'Armazenagem', 'Separação e expedição', 'Inventário e controle', 'Administrativo do CD'];
export const CFG_SETORES_CD = 'tm.setores_cd';
/** Setores do posto (editáveis em Gestão → Dimensionamento → Setores e atividades); padrão = SETORES. */
export const CFG_SETORES_POSTO = 'tm.setores_posto';
/**
 * Sequência das atividades (Gestão → Sequência das atividades): ordem cronológica dos fatos, independente do setor.
 * Só informativa (impressão e relatório); NÃO muda a ordem do cronômetro nas coletas. Uma por tipo de operação.
 */
export const cfgSequencia = (tipo: 'posto' | 'cd') => `tm.sequencia.${tipo}`;
const [CR, CA, CS, CI, CAD] = SETORES_CD;
/**
 * Atividades padrão do CD (sem tempo de referência: o tempo vem da cronometragem). O administrador acrescenta as
 * próprias, edita e desativa em Cadastros (pedido do usuário, 23/11/2026: manter este padrão e cadastrar o resto).
 */
const SEED_CD: [string, string, string][] = [
  ['Descarga de caminhão', CR, 'Operacional'], ['Conferência de recebimento', CR, 'Controle'], ['Lançamento da nota de entrada', CR, 'Administrativa'],
  ['Etiquetagem', CR, 'Operacional'], ['Devolução ao fornecedor', CR, 'Operacional'],
  ['Endereçamento e guarda', CA, 'Operacional'], ['Movimentação com paleteira/empilhadeira', CA, 'Operacional'], ['Reabastecimento do picking', CA, 'Operacional'],
  ['Leitura do pedido', CS, 'Administrativa'], ['Separação de pedido', CS, 'Operacional'], ['Deslocamento entre endereços', CS, 'Operacional'],
  ['Conferência da separação', CS, 'Controle'], ['Embalagem e paletização', CS, 'Operacional'], ['Carregamento', CS, 'Operacional'],
  ['Emissão de documentos de transporte', CS, 'Administrativa'], ['Conferência de carga', CS, 'Controle'],
  ['Contagem cíclica', CI, 'Controle'], ['Tratativa de divergências', CI, 'Controle'], ['Organização e limpeza do armazém', CI, 'Organização e apoio'],
  ['Programação de cargas e rotas', CAD, 'Administrativa'], ['Atendimento a filiais e pedidos', CAD, 'Atendimento'], ['Lançamentos no sistema', CAD, 'Administrativa'],
];
export const ATIVIDADES_CD: Atividade[] = SEED_CD.map(([nome, setor, classe], i) => ({ id: `atv-cd-${i}`, nome, setor, classe, ref: null, ativo: true }));

/** O que muda de um tipo de operação para outro: setores, ciclo completo, blocos da planilha e o perfil da análise com IA. */
export const TIPOS_OPERACAO: Record<TipoOperacao, {
  nome: string;
  /** Ciclo completo cronometrado em sequência (no posto, o atendimento na pista; no CD, um ciclo com as etapas escolhidas na hora, ex.: um pedido ou uma carga). */
  ciclo: { nome: string; plural: string; setor: string | null; etapas: string[] };
  /** Perfil enviado à análise com IA (função analise-ia). */
  perfilIa: string;
}> = {
  posto: { nome: 'Posto de combustível', ciclo: { nome: 'Atendimento', plural: 'atendimentos', setor: SETORES[0], etapas: SEQUENCIA_PISTA_ETAPAS() }, perfilIa: 'posto_combustivel' },
  cd: { nome: 'Centro de distribuição', ciclo: { nome: 'Ciclo', plural: 'ciclos', setor: null, etapas: [] }, perfilIa: 'centro_distribuicao' },
};
function SEQUENCIA_PISTA_ETAPAS() { return ['Abordagem', 'Abastecimento', 'Limpeza de para-brisa', 'Calibragem pneu sem estepe', 'Calibragem pneu com estepe', 'Verificação de água e óleo', 'Pagamento']; }
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
export const SEQUENCIA_PISTA = TIPOS_OPERACAO.posto.ciclo.etapas;
