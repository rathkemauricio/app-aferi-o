import { useMemo } from 'react';
import { Collection, type SyncRow, useCollection } from '../../lib/sync';
import { type SecaoLida, type TabelaArqueacao, tabelasCol } from './arqueacao';
import { uid } from './model';

// Cadastro dos tanques de cada filial (número, combustível, capacidade, tipo e marca/modelo). A nova medição vem com eles.
// Bi/tripartido: cada compartimento é um tanque com número próprio, como nos documentos das filiais
// (ex.: tanques 3, 4 e 5 = um tanque ARXO tripartido 10/10/10). A tabela de cada tanque fica em `TabelaArqueacao.tanques`.

export type TipoTanque = 'simples' | 'bipartido' | 'tripartido';
export const TIPOS: { id: TipoTanque; nome: string }[] = [
  { id: 'simples', nome: 'Simples' },
  { id: 'bipartido', nome: 'Bipartido' },
  { id: 'tripartido', nome: 'Tripartido' },
];

export type TanqueFilial = SyncRow & {
  filial_id: string; numero: string; combustivel: string;
  /** Tanque físico de onde é o compartimento (simples, bipartido, tripartido). */
  tipo?: TipoTanque;
  /** Marca/modelo, como no documento (ex.: "ARXO 10.000 L"). */
  modelo?: string;
  /** Capacidade nominal em litros. */
  capacidade?: number | null;
};

export const tanquesCol = new Collection<TanqueFilial>({ table: 'tq_tanques', storageKey: 'nevoeiro.tanques.cadastro.v1' });

const norm = (t: string) => t.trim().toLowerCase();
const ordenarNumeros = (l: string[]) => [...l].sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true }));
export const ordenarTanques = <T extends { numero: string }>(l: T[]) => [...l].sort((a, b) => a.numero.localeCompare(b.numero, 'pt-BR', { numeric: true }));
export const nomeTipo = (tipo: TipoTanque | undefined) => TIPOS.find(x => x.id === (tipo ?? 'simples'))?.nome ?? 'Simples';

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

/** Liga números de tanque às tabelas: cada número sai das outras tabelas (um tanque usa uma só). */
function ligarTabelas(sair: string[], ligar: Map<string, string | null>, tabelas: TabelaArqueacao[], substituir = new Map<string, TabelaArqueacao>()) {
  const fora = new Set([...sair, ...ligar.keys()].map(norm));
  for (const tab of [...tabelas.filter(x => !substituir.has(x.id)), ...substituir.values()]) {
    const novos = [...ligar.entries()].filter(([, id]) => id === tab.id).map(([n]) => n);
    const lista = ordenarNumeros([...new Set([...tab.tanques.filter(x => !fora.has(norm(x))), ...novos])]);
    const antes = tabelas.find(x => x.id === tab.id);
    if (substituir.has(tab.id) || !antes || lista.join('|') !== ordenarNumeros(antes.tanques).join('|')) tabelasCol.put({ ...tab, tanques: lista });
  }
}

/** Grava o tanque e liga-o à tabela escolhida (`null` = sem tabela). Se o número mudou, o antigo sai das tabelas. */
export function salvarTanque(t: TanqueFilial, numeroAntigo: string | null, tabelaId: string | null, tabelas: TabelaArqueacao[]) {
  const numero = t.numero.trim();
  tanquesCol.put({ ...t, numero, tipo: t.tipo ?? 'simples', modelo: (t.modelo ?? '').trim(), capacidade: t.capacidade ?? null });
  ligarTabelas(numeroAntigo && norm(numeroAntigo) !== norm(numero) ? [numeroAntigo] : [], new Map([[numero, tabelaId]]), tabelas);
}

/** Tira o tanque do cadastro e das tabelas. */
export function excluirTanque(t: TanqueFilial, tabelas: TabelaArqueacao[]) {
  ligarTabelas([t.numero], new Map(), tabelas);
  tanquesCol.remove(t.id);
}

/** Garante o tanque no cadastro da filial (ex.: ao escolher a tabela de um tanque na medição). */
export function garantirTanque(cadastro: TanqueFilial[], filialId: string, numero: string, combustivel: string) {
  if (!numero.trim() || cadastro.some(t => norm(t.numero) === norm(numero))) return;
  tanquesCol.put({ id: uid('tqf'), filial_id: filialId, numero: numero.trim(), combustivel, tipo: 'simples', modelo: '', capacidade: null });
}

/** Seção do documento pronta para gravar: o combustível de cada tanque já escolhido (id do cadastro ou ''). */
export type SecaoImportar = SecaoLida & { combustiveis: string[] };

/**
 * Grava o documento da filial: uma tabela por seção (a de mesmo nome é substituída) e os tanques dela
 * (o de mesmo número é atualizado), cada um ligado à tabela da sua seção. Devolve o que foi feito.
 */
export function importarDocumento(filialId: string, secoes: SecaoImportar[], cadastro: TanqueFilial[], tabelas: TabelaArqueacao[], arquivo: string) {
  const ligar = new Map<string, string | null>();
  const substituir = new Map<string, TabelaArqueacao>();
  let novos = 0, atualizados = 0;
  for (const s of secoes) {
    const existente = tabelas.find(x => norm(x.nome) === norm(s.nome));
    const tab: TabelaArqueacao = {
      ...(existente ?? {}), id: existente?.id ?? uid('tab'), filial_id: filialId, nome: s.nome, tanques: existente?.tanques ?? [],
      capacidade: s.tabela.capacidade, diametro_cm: s.tabela.diametro_cm, comprimento_m: s.tabela.comprimento_m,
      pontos: s.tabela.pontos, arquivo,
    } as TabelaArqueacao;
    substituir.set(tab.id, tab);
    s.tanques.forEach((tq, i) => {
      const ja = cadastro.find(x => norm(x.numero) === norm(tq.numero));
      tanquesCol.put({
        ...(ja ?? { id: uid('tqf'), filial_id: filialId }), numero: tq.numero,
        combustivel: s.combustiveis[i] || ja?.combustivel || '', tipo: s.tipo, modelo: tq.modelo || s.modelo || ja?.modelo || '', capacidade: tq.capacidade ?? ja?.capacidade ?? null,
      } as TanqueFilial);
      if (ja) atualizados++; else novos++;
      ligar.set(tq.numero, tab.id);
    });
  }
  ligarTabelas([], ligar, tabelas, substituir);
  return { tabelas: secoes.length, novos, atualizados };
}
