import { useMemo } from 'react';
import { useCombustiveis } from '../../lib/combustiveis';
import { useFiliais } from '../../lib/data';
import { Collection, combinedStatus, useCollection } from '../../lib/sync';
import { hojeIso, type LinhaTanque, type Medicao, uid } from './model';

/** Medições sincronizadas (web e app; funcionam sem internet e enviam depois). */
export const medicoesCol = new Collection<Medicao>({ table: 'tq_medicoes', storageKey: 'nevoeiro.tanques.medicoes.v1' });

export function useTanques() {
  const f = useFiliais();
  const m = useCollection(medicoesCol);
  const combustiveis = useCombustiveis();
  const medicoes = useMemo(() => [...m.list].sort((a, b) => b.data.localeCompare(a.data) || (b.updated_at ?? '').localeCompare(a.updated_at ?? '')), [m.list]);
  return { filiais: f.filiais, medicoes, combustiveis, loaded: f.loaded && m.loaded, status: combinedStatus([f.status, m.status]) };
}

export const linhaVazia = (tanque = '', combustivel = ''): LinhaTanque => ({ id: uid('tq'), tanque, combustivel, metragem: null, litros: null, informada: null });

/**
 * Nova medição da filial: já vem com os tanques (número e combustível) da última medição finalizada dela e com a
 * "Informada" de cada tanque = litros medidos naquela medição. Os demais valores ficam em branco.
 */
export function novaMedicao(filialId: string, responsavel: string, anteriores: Medicao[]): string {
  const daFilial = anteriores.filter(x => x.filial_id === filialId && x.tanques.length);
  const ultima = daFilial.find(x => x.status === 'finalizada') ?? daFilial[0];
  const tanques = ultima
    ? ultima.tanques.map(l => ({ ...linhaVazia(l.tanque, l.combustivel), informada: l.litros, ...(l.litros !== null ? { informadaDe: ultima.data } : {}) }))
    : [linhaVazia('1')];
  const id = uid('med');
  medicoesCol.put({ id, filial_id: filialId, data: hojeIso(), medido_em: null, status: 'rascunho', tanques, combustiveis: [], obs: '', responsavel_nome: responsavel });
  return id;
}
