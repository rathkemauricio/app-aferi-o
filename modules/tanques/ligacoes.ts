import { docId, docsCol, saveFilialDoc } from '../../lib/data';
import type { Ligacao } from './arqueacao';

// Bombas e bicos do documento da filial ("Esquema das Ligações") → cadastro de equipamentos da filial
// (Aferições → Filiais). O croqui espelha esse cadastro sozinho, então as bombas aparecem lá também.

export type BicoEquip = { id: string; number: string; fuel: string; /** Tanque de onde o bico puxa (do documento). */ tanque?: string };
export type BombaEquip = { id: string; number: string; /** Marca/modelo (ex.: "Wayne 3B2201P"). */ modelo?: string; nozzles: BicoEquip[] };
export type LigacaoTanque = Ligacao & { tanque: string; /** Nome do combustível do tanque (como no cadastro de bicos). */ combustivel: string };

const uid = (p: string) => `${p}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const numero = (s: string) => { const m = String(s ?? '').match(/\d+/); return m ? Number(m[0]) : null; };
const mesmo = (a: string, b: string) => { const x = numero(a), y = numero(b); return x !== null && y !== null ? x === y : a.trim().toLowerCase() === b.trim().toLowerCase(); };
const dois = (s: string) => (/^\d$/.test(s.trim()) ? `0${s.trim()}` : s.trim());
const porNumero = <T extends { number: string }>(l: T[]) => [...l].sort((a, b) => (numero(a.number) ?? 1e9) - (numero(b.number) ?? 1e9) || a.number.localeCompare(b.number));

export const bombasDaFilial = (filialId: string): BombaEquip[] =>
  ((docsCol.get(docId(filialId, 'equipamentos'))?.payload as { pumps?: BombaEquip[] } | undefined)?.pumps ?? []);

/**
 * Junta as ligações no cadastro de bombas: bomba e bico são achados pelo número (cria os que faltam); o bico recebe
 * o combustível e o tanque do documento; a bomba recebe o modelo. Bombas e bicos fora do documento ficam como estão.
 */
export function aplicarLigacoes(bombas: BombaEquip[], ligacoes: LigacaoTanque[]) {
  const out = bombas.map(b => ({ ...b, nozzles: b.nozzles.map(n => ({ ...n })) }));
  let bombasNovas = 0, bicosNovos = 0, bicosAtualizados = 0;
  for (const l of ligacoes) {
    let b = out.find(x => mesmo(x.number, l.bomba));
    if (!b) { b = { id: uid('bomba'), number: `Bomba ${dois(l.bomba)}`, nozzles: [] }; out.push(b); bombasNovas++; }
    if (l.modelo) b.modelo = l.modelo;
    for (const nb of l.bicos) {
      const n = b.nozzles.find(x => mesmo(x.number, nb));
      if (n) {
        if (n.fuel !== (l.combustivel || n.fuel) || n.tanque !== l.tanque) bicosAtualizados++;
        n.fuel = l.combustivel || n.fuel; n.tanque = l.tanque;
      } else { b.nozzles.push({ id: uid('bico'), number: dois(nb), fuel: l.combustivel || 'Outro', tanque: l.tanque }); bicosNovos++; }
    }
    b.nozzles = porNumero(b.nozzles);
  }
  return { bombas: porNumero(out), bombasNovas, bicosNovos, bicosAtualizados };
}

/** Grava as ligações no cadastro de equipamentos da filial (precisa do módulo Aferições). */
export async function gravarLigacoes(filialId: string, ligacoes: LigacaoTanque[]) {
  if (!docsCol.pulledOnce) await docsCol.sync().catch(() => undefined); // não sobrescreve o cadastro com dado velho
  const r = aplicarLigacoes(bombasDaFilial(filialId), ligacoes);
  saveFilialDoc(filialId, 'equipamentos', { pumps: r.bombas });
  return r;
}
