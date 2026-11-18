import { useMemo } from 'react';
import { Collection, type SyncRow, useCollection } from '../../lib/sync';
import { type TabelaArqueacao, tabelasCol } from './arqueacao';
import { uid } from './model';

// Cadastro dos tanques de cada filial (número e combustível). A nova medição vem com eles prontos.
// A tabela de arqueação de cada tanque fica na própria tabela (`TabelaArqueacao.tanques`).

export type TanqueFilial = SyncRow & { filial_id: string; numero: string; combustivel: string };

export const tanquesCol = new Collection<TanqueFilial>({ table: 'tq_tanques', storageKey: 'nevoeiro.tanques.cadastro.v1' });

const norm = (t: string) => t.trim().toLowerCase();
export const ordenarTanques = <T extends { numero: string }>(l: T[]) => [...l].sort((a, b) => a.numero.localeCompare(b.numero, 'pt-BR', { numeric: true }));

/** Tanques cadastrados da filial, em ordem de número. */
export function useTanquesFilial(filialId: string | undefined) {
  const c = useCollection(tanquesCol);
  return useMemo(() => ordenarTanques(c.list.filter(t => t.filial_id === filialId)), [c.list, filialId]);
}

/** Próximo número livre (1, 2, 3 …). */
export function proximoNumero(cadastro: TanqueFilial[]) {
  const usados = new Set(cadastro.map(t => norm(t.numero)));
  let n = 1;
  while (usados.has(String(n))) n++;
  return String(n);
}

/** Grava o tanque; se o número mudou, a tabela de arqueação acompanha o novo número. */
export function salvarTanque(t: TanqueFilial, numeroAntigo: string | null, tabelas: TabelaArqueacao[]) {
  tanquesCol.put({ ...t, numero: t.numero.trim() });
  if (numeroAntigo && norm(numeroAntigo) !== norm(t.numero)) {
    for (const tab of tabelas) {
      if (tab.tanques.some(x => norm(x) === norm(numeroAntigo))) tabelasCol.put({ ...tab, tanques: tab.tanques.map(x => (norm(x) === norm(numeroAntigo) ? t.numero.trim() : x)) });
    }
  }
}

/** Garante o tanque no cadastro da filial (ex.: ao escolher a tabela de um tanque na medição). */
export function garantirTanque(cadastro: TanqueFilial[], filialId: string, numero: string, combustivel: string) {
  if (!numero.trim() || cadastro.some(t => norm(t.numero) === norm(numero))) return;
  tanquesCol.put({ id: uid('tqf'), filial_id: filialId, numero: numero.trim(), combustivel });
}
