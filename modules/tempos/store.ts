import AsyncStorage from '@react-native-async-storage/async-storage';
import { useMemo, useSyncExternalStore } from 'react';
import { type ConfigRow, configCol, useConfig, useFiliais } from '../../lib/data';
import { Collection, combinedStatus, useCollection } from '../../lib/sync';
import { type Atendimento, ATIVIDADES_PADRAO, type Atividade, CFG_ATIVIDADES, CFG_PARAMETROS, CFG_VEICULOS, type Coleta, type Parametros, PARAMETROS_PADRAO, type Veiculo, VEICULOS_PADRAO } from './model';

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
export type ColetasView = { name: 'home' } | { name: 'coleta'; coletaId: string } | { name: 'atendimento'; coletaId: string; atendimentoId: string };
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
};

export function useTm() {
  const f = useFiliais();
  const c = useCollection(coletasCol);
  const a = useCollection(atendimentosCol);
  const p = useCollection(planoCol);
  const cfg = useCollection(configCol);
  const d = useDrafts();
  const atvCfg = useConfig<{ lista: Atividade[] }>(CFG_ATIVIDADES, { lista: ATIVIDADES_PADRAO });
  const parametros = useConfig<Parametros>(CFG_PARAMETROS, PARAMETROS_PADRAO);
  const veiculosCfg = useConfig<{ lista: Veiculo[] }>(CFG_VEICULOS, { lista: VEICULOS_PADRAO });
  const data = useMemo<TmData>(() => ({
    filiais: f.filiais,
    coletas: [...c.list].sort((x, y) => y.data.localeCompare(x.data)),
    atendimentos: a.list,
    rascunhos: d.list,
    atividades: atvCfg.lista,
    parametros,
    plano: p.list,
    veiculos: veiculosCfg.lista,
  }), [f.filiais, c.list, a.list, d.list, atvCfg, parametros, p.list, veiculosCfg]);
  return {
    data,
    loaded: c.loaded && a.loaded && p.loaded && cfg.loaded && d.loaded && f.loaded,
    status: combinedStatus([c.status, a.status, p.status, f.status, cfg.status]),
  };
}

export const salvarAtividades = (lista: Atividade[]) => configCol.put({ id: CFG_ATIVIDADES, valor: { lista } } as ConfigRow);
export const salvarVeiculos = (lista: Veiculo[]) => configCol.put({ id: CFG_VEICULOS, valor: { lista } } as ConfigRow);
export const salvarParametros = (v: Parametros) => configCol.put({ id: CFG_PARAMETROS, valor: v } as ConfigRow);
export const sincronizarModulo = () => Promise.all([coletasCol.sync(), atendimentosCol.sync(), planoCol.sync(), configCol.sync()]);
