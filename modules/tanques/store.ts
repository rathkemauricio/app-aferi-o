import { useMemo } from 'react';
import { useCombustiveis } from '../../lib/combustiveis';
import { ehCD, useFiliais, useFilialDoc } from '../../lib/data';
import { combustivelDoTanque, type CroquiDoc } from '../croqui/model';
import { Collection, combinedStatus, useCollection } from '../../lib/sync';
import { tabelasCol } from './arqueacao';
import { tanquesCol } from './cadastro';
import { hojeIso, type LinhaTanque, type Medicao, uid } from './model';

/** Medições sincronizadas (web e app; funcionam sem internet e enviam depois). */
export const medicoesCol = new Collection<Medicao>({ table: 'tq_medicoes', storageKey: 'nevoeiro.tanques.medicoes.v1' });

export function useTanques() {
  const f = useFiliais();
  const m = useCollection(medicoesCol);
  const tq = useCollection(tanquesCol);
  const tb = useCollection(tabelasCol);
  const combustiveis = useCombustiveis();
  const medicoes = useMemo(() => [...m.list].sort((a, b) => b.data.localeCompare(a.data) || (b.updated_at ?? '').localeCompare(a.updated_at ?? '')), [m.list]);
  // Centro de distribuição não tem tanques: fica fora da Conferência de Estoque.
  return { filiais: f.filiais.filter(x => !ehCD(x)), medicoes, combustiveis, loaded: f.loaded && m.loaded && tq.loaded && tb.loaded, status: combinedStatus([f.status, m.status, tq.status, tb.status]) };
}

export const linhaVazia = (tanque = '', combustivel = ''): LinhaTanque => ({ id: uid('tq'), tanque, combustivel, metragem: null, litros: null, informada: null });

/** Tanque do croqui da filial: número (o rótulo sem a palavra "Tanque") e combustível. */
export type TanqueCroqui = { tanque: string; combustivel: string };
/** Tanques desenhados no croqui da filial, em ordem de número. */
export function tanquesDoCroqui(doc: CroquiDoc | undefined): TanqueCroqui[] {
  return (doc?.items ?? []).filter(i => i.type === 'tanque')
    .map((i, n) => ({ tanque: i.label.trim().replace(/^tanque\s*/i, '') || String(n + 1), combustivel: combustivelDoTanque(i) }))
    .sort((a, b) => a.tanque.localeCompare(b.tanque, 'pt-BR', { numeric: true }));
}
/** Croqui da filial (para os tanques da medição). */
export function useTanquesDoCroqui(filialId: string | undefined) {
  const { payload } = useFilialDoc<CroquiDoc>(filialId, 'croqui');
  return useMemo(() => tanquesDoCroqui(payload), [payload]);
}

const mesmoTanque = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
/** Última medição da filial com tanques (de preferência finalizada): de onde vem a "Informada". */
const ultimaDaFilial = (filialId: string, anteriores: Medicao[], exceto?: string) => {
  const daFilial = anteriores.filter(x => x.filial_id === filialId && x.id !== exceto && x.tanques.length);
  return daFilial.find(x => x.status === 'finalizada') ?? daFilial[0];
};
/** Linha nova de um tanque, com a informada = litros dele na última medição. */
function linhaComInformada(tanque: string, combustivel: string, ultima: Medicao | undefined): LinhaTanque {
  const ant = ultima?.tanques.find(l => mesmoTanque(l.tanque, tanque));
  return { ...linhaVazia(tanque, combustivel || ant?.combustivel || ''), informada: ant?.litros ?? null, ...(ant && ant.litros !== null ? { informadaDe: ultima!.data } : {}) };
}

/**
 * Nova medição da filial: os tanques vêm do croqui da filial (número e combustível) ou, sem tanques no croqui, da
 * última medição. A "Informada" de cada tanque = litros medidos nele na última medição. O resto fica em branco.
 */
export function novaMedicao(filialId: string, responsavel: string, anteriores: Medicao[], croqui: TanqueCroqui[] = []): string {
  const ultima = ultimaDaFilial(filialId, anteriores);
  const base: TanqueCroqui[] = croqui.length ? croqui : ultima ? ultima.tanques.map(l => ({ tanque: l.tanque, combustivel: l.combustivel })) : [];
  const tanques = base.length ? base.map(x => linhaComInformada(x.tanque, x.combustivel, ultima)) : [linhaVazia('1')];
  const id = uid('med');
  medicoesCol.put({ id, filial_id: filialId, data: hojeIso(), medido_em: null, status: 'rascunho', tanques, combustiveis: [], obs: '', responsavel_nome: responsavel });
  return id;
}

/**
 * Atualiza os tanques de uma medição em andamento pelo croqui: tanques que já estavam (mesmo número) mantêm o que
 * foi digitado (e passam a ter o combustível do croqui); os novos entram com a informada da última medição; os que
 * não estão no croqui saem.
 */
export function aplicarCroqui(m: Medicao, croqui: TanqueCroqui[], anteriores: Medicao[]) {
  const ultima = ultimaDaFilial(m.filial_id, anteriores, m.id);
  const tanques = croqui.map(x => {
    const ja = m.tanques.find(l => mesmoTanque(l.tanque, x.tanque));
    return ja ? { ...ja, combustivel: x.combustivel || ja.combustivel } : linhaComInformada(x.tanque, x.combustivel, ultima);
  });
  medicoesCol.put({ ...m, tanques });
}
