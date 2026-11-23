import AsyncStorage from '@react-native-async-storage/async-storage';
import { useMemo, useSyncExternalStore } from 'react';
import { type ConfigRow, configCol, ehCD, useConfig, useFiliais } from '../../lib/data';
import { Collection, combinedStatus, useCollection } from '../../lib/sync';
import { type Atendimento, ATIVIDADES_CD, ATIVIDADES_PADRAO, type Atividade, CFG_ATIVIDADES, CFG_SETORES_CD, SETORES, SETORES_CD, type TipoOperacao, CFG_PARAMETROS, CFG_VEICULOS, type Coleta, type Parametros, PARAMETROS_PADRAO, type StatusFilial, type Veiculo, VEICULOS_PADRAO } from './model';

/* ---------- Coleções sincronizadas ---------- */
export const coletasCol = new Collection<Coleta>({ table: 'tm_coletas', storageKey: 'nevoeiro.tempos.coletas.v2' });
export const atendimentosCol = new Collection<Atendimento>({ table: 'tm_atendimentos', storageKey: 'nevoeiro.tempos.atendimentos.v2' });
export type Plano = { id: string; filial_id: string | null; problema: string; causa: string; acao: string; responsavel: string; prazo: string | null; indicador: string; beneficio_h: number; status: 'Aberto' | 'Em andamento' | 'Concluído'; updated_at?: string; deleted_at?: string | null };
export const planoCol = new Collection<Plano>({ table: 'tm_plano', storageKey: 'nevoeiro.tempos.plano.v2' });

/* ---------- Rascunhos: atendimentos em andamento (somente no aparelho) ----------
   O cronômetro nunca é gravado continuamente no servidor. Cada mudança (iniciar etapa, pausar,
   retomar...) é salva no aparelho na hora; o servidor só recebe o atendimento quando finalizado. */
const DRAFT_KEY = 'nevoeiro.tempos.rascunhos.v2';
class DraftStore {
  private map = new Map<string, Atendimento>();
  private listeners = new Set<() => void>();
  private snap: { list: Atendimento[]; loaded: boolean } = { list: [], loaded: false };
  ready: Promise<void>;
  constructor() {
    this.ready = AsyncStorage.getItem(DRAFT_KEY)
      .then(raw => { if (raw) (JSON.parse(raw) as Atendimento[]).forEach(a => this.map.set(a.id, a)); })
      .catch(() => undefined)
      .finally(() => this.emit(true));
  }
  private emit(loaded = this.snap.loaded) { this.snap = { list: [...this.map.values()], loaded }; this.listeners.forEach(l => l()); }
  private save() { void AsyncStorage.setItem(DRAFT_KEY, JSON.stringify([...this.map.values()])).catch(() => undefined); }
  subscribe = (fn: () => void) => { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; };
  getSnapshot = () => this.snap;
  get(id: string) { return this.map.get(id); }
  put(a: Atendimento) { this.map.set(a.id, a); this.save(); this.emit(); }
  remove(id: string) { this.map.delete(id); this.save(); this.emit(); }
  removeWhere(fn: (a: Atendimento) => boolean) { [...this.map.values()].filter(fn).forEach(a => this.map.delete(a.id)); this.save(); this.emit(); }
}
export const drafts = new DraftStore();
export const useDrafts = () => useSyncExternalStore(drafts.subscribe, drafts.getSnapshot, drafts.getSnapshot);

/* ---------- Estado da tela (volta exatamente onde o usuário estava) ---------- */
export type ColetasView = { name: 'home' } | { name: 'filial'; filialId: string } | { name: 'analise'; filialId: string } | { name: 'coleta'; coletaId: string } | { name: 'atendimento'; coletaId: string; atendimentoId: string };
export type Tab = 'coletas' | 'painel' | 'historico' | 'gestao';
export type GestaoAba = 'dimensionamento' | 'plano' | 'cadastros';
export type UiState = { tab: Tab; stack: ColetasView[]; filialId: string; gestao: GestaoAba };
const UI_KEY = 'nevoeiro.tempos.ui.v2';
export const UI_PADRAO: UiState = { tab: 'coletas', stack: [{ name: 'home' }], filialId: '', gestao: 'dimensionamento' };
export const loadUi = async (): Promise<UiState> => {
  try { const raw = await AsyncStorage.getItem(UI_KEY); return raw ? { ...UI_PADRAO, ...(JSON.parse(raw) as UiState) } : UI_PADRAO; } catch { return UI_PADRAO; }
};
export const saveUi = (s: UiState) => { void AsyncStorage.setItem(UI_KEY, JSON.stringify(s)).catch(() => undefined); };

/* ---------- Visão consolidada para as telas ---------- */
export type TmData = {
  filiais: ReturnType<typeof useFiliais>['filiais'];
  coletas: Coleta[];
  atendimentos: Atendimento[]; // finalizados
  rascunhos: Atendimento[];    // em andamento (aparelho)
  atividades: Atividade[];
  parametros: Parametros;
  plano: Plano[];
  veiculos: Veiculo[];
  /** Situação das coletas por filial (finalizada por quem e quando). */
  statusFiliais: StatusFilial[];
  /** Setores do centro de distribuição (editáveis em Cadastros). */
  setoresCd: string[];
};

/** Tipo de operação da unidade: CD quando classificada como "Centro de distribuição" no cadastro da filial. */
export const tipoDe = (d: Pick<TmData, 'filiais'>, filialId: string): TipoOperacao => (ehCD(d.filiais.find(f => f.id === filialId)) ? 'cd' : 'posto');
/** Setores do tipo de operação (posto: fixos; CD: os cadastrados). */
export const setoresDoTipo = (d: Pick<TmData, 'setoresCd'>, tipo: TipoOperacao): string[] => (tipo === 'cd' ? d.setoresCd : [...SETORES]);
/** Todos os setores (filtros do Painel e cadastro de atividades). */
export const todosSetores = (d: Pick<TmData, 'setoresCd'>) => [...SETORES, ...d.setoresCd.filter(x => !(SETORES as readonly string[]).includes(x))];
/** Tipo de operação a que o setor pertence. */
export const tipoDoSetor = (d: Pick<TmData, 'setoresCd'>, setor: string): TipoOperacao => (d.setoresCd.includes(setor) && !(SETORES as readonly string[]).includes(setor) ? 'cd' : 'posto');

export function useTm() {
  const f = useFiliais();
  const c = useCollection(coletasCol);
  const a = useCollection(atendimentosCol);
  const p = useCollection(planoCol);
  const st = useCollection(statusCol);
  const cfg = useCollection(configCol);
  const d = useDrafts();
  const atvCfg = useConfig<{ lista: Atividade[] }>(CFG_ATIVIDADES, { lista: ATIVIDADES_PADRAO });
  const parametros = useConfig<Parametros>(CFG_PARAMETROS, PARAMETROS_PADRAO);
  const veiculosCfg = useConfig<{ lista: Veiculo[] }>(CFG_VEICULOS, { lista: VEICULOS_PADRAO });
  const setoresCdCfg = useConfig<{ lista: string[] }>(CFG_SETORES_CD, { lista: SETORES_CD });
  const data = useMemo<TmData>(() => ({
    filiais: f.filiais,
    coletas: [...c.list].sort((x, y) => y.data.localeCompare(x.data)),
    atendimentos: a.list,
    rascunhos: d.list,
    // Padrão do CD entra na lista da rede (o que o administrador desativou ou editou continua como ele deixou).
    atividades: [...atvCfg.lista, ...ATIVIDADES_CD.filter(x => !atvCfg.lista.some(y => y.id === x.id))],
    parametros,
    plano: p.list,
    veiculos: veiculosCfg.lista,
    statusFiliais: st.list,
    setoresCd: Array.isArray(setoresCdCfg.lista) ? setoresCdCfg.lista : SETORES_CD,
  }), [f.filiais, c.list, a.list, d.list, atvCfg, parametros, p.list, veiculosCfg, st.list, setoresCdCfg]);
  return {
    data,
    loaded: c.loaded && a.loaded && p.loaded && cfg.loaded && d.loaded && f.loaded && st.loaded,
    status: combinedStatus([c.status, a.status, p.status, f.status, cfg.status, st.status]),
  };
}

export const salvarAtividades = (lista: Atividade[]) => configCol.put({ id: CFG_ATIVIDADES, valor: { lista } } as ConfigRow);
export const salvarVeiculos = (lista: Veiculo[]) => configCol.put({ id: CFG_VEICULOS, valor: { lista } } as ConfigRow);
/** Grava a lista de setores do CD. */
export const salvarSetoresCd = (lista: string[]) => configCol.put({ id: CFG_SETORES_CD, valor: { lista } } as ConfigRow);
export const salvarParametros = (v: Parametros) => configCol.put({ id: CFG_PARAMETROS, valor: v } as ConfigRow);
export const sincronizarModulo = () => Promise.all([coletasCol.sync(), atendimentosCol.sync(), planoCol.sync(), configCol.sync(), statusCol.sync()]);

/* ---------- Finalização das coletas da filial ---------- */
export const statusCol = new Collection<StatusFilial>({ table: 'tm_filiais_status', storageKey: 'nevoeiro.tempos.status-filiais.v1' });
export const statusDaFilial = (d: TmData, filialId: string) => d.statusFiliais.find(x => x.id === filialId && !x.deleted_at);
export const finalizada = (d: TmData, filialId: string) => !!statusDaFilial(d, filialId)?.finalizado_em;
/** Finaliza as coletas da filial (quem finalizou é gravado pelo servidor; o nome vai junto para exibir). */
export const finalizarFilial = (filialId: string, nome: string, resumo: Record<string, unknown>) =>
  statusCol.put({ id: filialId, finalizado_em: new Date().toISOString(), finalizado_por_nome: nome, resumo });
export const reabrirFilial = (filialId: string) => statusCol.put({ id: filialId, finalizado_em: null, finalizado_por_nome: '', resumo: {} });
