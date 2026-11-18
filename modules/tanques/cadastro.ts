import { useMemo } from 'react';
import { Collection, type SyncRow, useCollection } from '../../lib/sync';
import { type TabelaArqueacao, tabelasCol } from './arqueacao';
import { uid } from './model';

// Cadastro dos tanques de cada filial (número, tipo, combustível e marca/modelo). A nova medição vem com eles prontos.
// Tanque bipartido/tripartido: cada compartimento é medido à parte (3A, 3B, 3C), com combustível e tabela próprios.
// A tabela de arqueação de cada tanque/compartimento fica na própria tabela (`TabelaArqueacao.tanques`).

export type TipoTanque = 'simples' | 'bipartido' | 'tripartido';
export const TIPOS: { id: TipoTanque; nome: string; partes: number }[] = [
  { id: 'simples', nome: 'Simples', partes: 1 },
  { id: 'bipartido', nome: 'Bipartido', partes: 2 },
  { id: 'tripartido', nome: 'Tripartido', partes: 3 },
];
const LETRAS = ['A', 'B', 'C'];

export type TanqueFilial = SyncRow & {
  filial_id: string; numero: string;
  /** Combustível do tanque simples (no compartimentado, o do compartimento A). */
  combustivel: string;
  tipo?: TipoTanque;
  /** Combustível de cada compartimento (A, B, C), no bipartido/tripartido. */
  combustiveis?: string[];
  /** Marca/modelo do tanque, como no PDF da tabela (opcional). */
  modelo?: string;
};

/** Um ponto de medição: o tanque simples ou um compartimento (com o número usado na medição e nas tabelas). */
export type PontoMedicao = { tanque: string; combustivel: string; compartimento: string | null };

export const tanquesCol = new Collection<TanqueFilial>({ table: 'tq_tanques', storageKey: 'nevoeiro.tanques.cadastro.v1' });

const norm = (t: string) => t.trim().toLowerCase();
export const ordenarTanques = <T extends { numero: string }>(l: T[]) => [...l].sort((a, b) => a.numero.localeCompare(b.numero, 'pt-BR', { numeric: true }));
const ordenarNumeros = (l: string[]) => [...l].sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true }));

export const partesDo = (tipo: TipoTanque | undefined) => TIPOS.find(x => x.id === tipo)?.partes ?? 1;
export const nomeTipo = (tipo: TipoTanque | undefined) => TIPOS.find(x => x.id === (tipo ?? 'simples'))?.nome ?? 'Simples';

/** Pontos de medição do tanque: simples → o próprio número; bipartido → 3A e 3B; tripartido → 3A, 3B e 3C. */
export function pontosDoTanque(t: Pick<TanqueFilial, 'numero' | 'combustivel' | 'tipo' | 'combustiveis'>): PontoMedicao[] {
  const n = t.numero.trim();
  const partes = partesDo(t.tipo);
  if (partes === 1) return [{ tanque: n, combustivel: t.combustivel, compartimento: null }];
  return LETRAS.slice(0, partes).map((l, i) => ({ tanque: `${n}${l}`, combustivel: t.combustiveis?.[i] ?? (i === 0 ? t.combustivel : ''), compartimento: l }));
}
/** Todos os pontos de medição da filial (na ordem dos tanques). */
export const pontosDaFilial = (cadastro: TanqueFilial[]) => ordenarTanques(cadastro).flatMap(pontosDoTanque);

/** Tanques cadastrados da filial, em ordem de número. */
export function useTanquesFilial(filialId: string | undefined) {
  const c = useCollection(tanquesCol);
  return useMemo(() => ordenarTanques(c.list.filter(t => t.filial_id === filialId)), [c.list, filialId]);
}

/** Próximo número livre (1, 2, 3 …). */
export function proximoNumero(cadastro: TanqueFilial[]) {
  const usados = new Set(cadastro.flatMap(t => [norm(t.numero), ...pontosDoTanque(t).map(p => norm(p.tanque))]));
  let n = 1;
  while (usados.has(String(n))) n++;
  return String(n);
}

/**
 * Grava o tanque e liga cada ponto de medição (tanque simples ou compartimento) à tabela escolhida.
 * `tabelasEscolhidas[i]` = id da tabela do ponto i (`null` = sem tabela). Os números antigos (renomeado ou mudou o tipo) saem das tabelas.
 */
export function salvarTanque(t: TanqueFilial, antigo: TanqueFilial | null, tabelasEscolhidas: (string | null)[], tabelas: TabelaArqueacao[]) {
  const tipo = t.tipo ?? 'simples';
  const combustiveis = partesDo(tipo) > 1 ? (t.combustiveis ?? []).slice(0, partesDo(tipo)) : [];
  const novo: TanqueFilial = { ...t, numero: t.numero.trim(), tipo, combustiveis, combustivel: combustiveis[0] ?? t.combustivel, modelo: (t.modelo ?? '').trim() };
  tanquesCol.put(novo);
  ligarTabelas(antigo ? pontosDoTanque(antigo).map(p => p.tanque) : [], pontosDoTanque(novo).map(p => p.tanque), tabelasEscolhidas, tabelas);
}

/** Tira o tanque do cadastro e das tabelas. */
export function excluirTanque(t: TanqueFilial, tabelas: TabelaArqueacao[]) {
  ligarTabelas(pontosDoTanque(t).map(p => p.tanque), [], [], tabelas);
  tanquesCol.remove(t.id);
}

function ligarTabelas(velhos: string[], novos: string[], escolhas: (string | null)[], tabelas: TabelaArqueacao[]) {
  const sair = new Set([...velhos, ...novos].map(norm));
  for (const tab of tabelas) {
    const lista = ordenarNumeros([...tab.tanques.filter(x => !sair.has(norm(x))), ...novos.filter((_, i) => escolhas[i] === tab.id)]);
    if (lista.join('|') !== ordenarNumeros(tab.tanques).join('|')) tabelasCol.put({ ...tab, tanques: lista });
  }
}

/** Garante o tanque no cadastro da filial (ex.: ao escolher a tabela de um tanque na medição). Compartimentos já cadastrados contam. */
export function garantirTanque(cadastro: TanqueFilial[], filialId: string, numero: string, combustivel: string) {
  if (!numero.trim() || cadastro.some(t => norm(t.numero) === norm(numero) || pontosDoTanque(t).some(p => norm(p.tanque) === norm(numero)))) return;
  tanquesCol.put({ id: uid('tqf'), filial_id: filialId, numero: numero.trim(), combustivel, tipo: 'simples', combustiveis: [], modelo: '' });
}
