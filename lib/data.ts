import { useMemo } from 'react';
import { Collection, type SyncRow, useCollection } from './sync';

// Dados compartilhados entre módulos. Cada módulo lê daqui; nenhum mantém cadastro próprio de filiais.

export type Filial = SyncRow & { codigo: string; nome: string; cidade: string; uf: string; bandeira: string };
export type DocTipo = 'equipamentos' | 'croqui' | 'dimensionamento';
export type FilialDoc<P = unknown> = SyncRow & { filial_id: string; tipo: DocTipo; payload: P };
export type ConfigRow<V = unknown> = SyncRow & { valor: V };

export const filiaisCol = new Collection<Filial>({ table: 'filiais', storageKey: 'nevoeiro.shared.filiais.v1' });
export const docsCol = new Collection<FilialDoc>({ table: 'filial_docs', storageKey: 'nevoeiro.shared.filial_docs.v1' });
export const configCol = new Collection<ConfigRow>({ table: 'app_config', storageKey: 'nevoeiro.shared.app_config.v1' });

export const docId = (filialId: string, tipo: DocTipo) => `${filialId}:${tipo}`;
export const novoId = (p: string) => `${p}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export const ordenarFiliais = (a: Filial, b: Filial) =>
  a.codigo.localeCompare(b.codigo, 'pt-BR', { numeric: true }) || a.nome.localeCompare(b.nome, 'pt-BR');

/** Filiais ativas, ordenadas por código. */
export function useFiliais() {
  const snap = useCollection(filiaisCol);
  const list = useMemo(() => [...snap.list].sort(ordenarFiliais), [snap.list]);
  return { filiais: list, loaded: snap.loaded, status: snap.status };
}

/** Documento de uma filial (croqui, equipamentos, dimensionamento). */
export function useFilialDoc<P>(filialId: string | null | undefined, tipo: DocTipo) {
  const snap = useCollection(docsCol);
  const doc = filialId ? (snap.list.find(d => d.id === docId(filialId, tipo)) as FilialDoc<P> | undefined) : undefined;
  return { doc, payload: doc?.payload, loaded: snap.loaded };
}

export function saveFilialDoc<P>(filialId: string, tipo: DocTipo, payload: P) {
  docsCol.put({ id: docId(filialId, tipo), filial_id: filialId, tipo, payload });
}

/** Configuração global por chave, com valor padrão enquanto não existir no servidor. */
export function useConfig<V>(id: string, padrao: V): V {
  const snap = useCollection(configCol);
  const row = snap.list.find(c => c.id === id) as ConfigRow<V> | undefined;
  return row?.valor ?? padrao;
}
export const saveConfig = <V,>(id: string, valor: V) => configCol.put({ id, valor });

/* ---------- Bandeiras (usadas no cadastro e no croqui) ---------- */
export const BANDEIRAS: Record<string, { n: string; c: string; tc: string }> = {
  branca: { n: 'Bandeira branca', c: '#6b7280', tc: '#fff' },
  petrobras: { n: 'Petrobras', c: '#009b3a', tc: '#ffd500' },
  shell: { n: 'Shell', c: '#ffd500', tc: '#dd1d21' },
  ipiranga: { n: 'Ipiranga', c: '#0b4ea2', tc: '#ffcc00' },
  ale: { n: 'Ale', c: '#e30613', tc: '#fff' },
  texaco: { n: 'Texaco', c: '#d71920', tc: '#fff' },
};
