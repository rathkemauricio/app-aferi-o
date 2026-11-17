import type { SyncRow } from '../../lib/sync';

// Módulo Medição de Tanques (planilha de conferência de estoque de combustível).
// Por tanque:  Total = Litros (estoque medido) + Venda
//              Resultado final = Informada + Recebimento − Total   (negativo = falta; positivo = sobra)
// Ex.: litros 5689 + venda 1289 = total 6978; informada 1968 + recebimento 5000 − 6978 = −10 (faltaram 10 L).

export type LinhaTanque = {
  id: string;
  tanque: string;
  /** id do catálogo de combustíveis (o mesmo de Aferições e Croqui). */
  combustivel: string;
  /** Altura medida na régua (cm). */
  metragem: number | null;
  /** Estoque medido em litros (pela tabela do tanque). */
  litros: number | null;
  /** Litros vendidos no período. */
  venda: number | null;
  /** Estoque informado (litros): os litros medidos na medição anterior do mesmo tanque (preenchido sozinho, editável). */
  informada: number | null;
  /** Data (AAAA-MM-DD) da medição anterior de onde veio a informada; some se ela for digitada à mão. */
  informadaDe?: string;
  /** Combustível recebido no período (litros). */
  recebimento: number | null;
};
export type Medicao = SyncRow & {
  filial_id: string; data: string; medido_em: string | null; status: 'rascunho' | 'finalizada';
  tanques: LinhaTanque[]; obs: string; responsavel_nome: string;
};

export const total = (l: LinhaTanque) => (l.litros ?? 0) + (l.venda ?? 0);
export const resultado = (l: LinhaTanque) => (l.informada ?? 0) + (l.recebimento ?? 0) - total(l);
/** Resultado sobre a venda (ex.: −10 L em 1.289 L vendidos = −0,78%). */
export const pctVenda = (l: Pick<LinhaTanque, 'venda'>, res: number) => (l.venda ? (res / l.venda) * 100 : null);
export const linhaCompleta = (l: LinhaTanque) => [l.litros, l.venda, l.informada, l.recebimento].every(v => v !== null && Number.isFinite(v));

export type Soma = { combustivel: string; tanques: number; litros: number; venda: number; total: number; informada: number; recebimento: number; resultado: number; pct: number | null };
/** Totais por combustível e geral. */
export function resumo(m: Pick<Medicao, 'tanques'>) {
  const por = new Map<string, Soma>();
  const geral: Soma = { combustivel: 'Total', tanques: 0, litros: 0, venda: 0, total: 0, informada: 0, recebimento: 0, resultado: 0, pct: null };
  m.tanques.forEach(l => {
    const s = por.get(l.combustivel) ?? { combustivel: l.combustivel, tanques: 0, litros: 0, venda: 0, total: 0, informada: 0, recebimento: 0, resultado: 0, pct: null };
    for (const x of [s, geral]) {
      x.tanques++; x.litros += l.litros ?? 0; x.venda += l.venda ?? 0; x.total += total(l);
      x.informada += l.informada ?? 0; x.recebimento += l.recebimento ?? 0; x.resultado += resultado(l);
    }
    por.set(l.combustivel, s);
  });
  [...por.values(), geral].forEach(x => { x.pct = x.venda ? (x.resultado / x.venda) * 100 : null; });
  return { porCombustivel: [...por.values()], geral };
}

export const uid = (p: string) => `${p}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
export const hojeIso = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
export const dataBR = (iso: string) => { const p = iso.split('-'); return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : iso; };
/** Litros com milhar e até 2 casas: 6.978 · 5.689,5 */
export const fmtL = (v: number | null | undefined) => (v === null || v === undefined || !Number.isFinite(v) ? '—' : v.toLocaleString('pt-BR', { maximumFractionDigits: 2 }));
export const fmtSinal = (v: number) => `${v > 0 ? '+' : ''}${fmtL(v)}`;
/** "1.234,5" ou "1234.5" → número; vazio → null. */
export function lerNumero(txt: string): number | null {
  const t = txt.trim();
  if (!t) return null;
  const n = Number(t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t);
  return Number.isFinite(n) ? n : null;
}
