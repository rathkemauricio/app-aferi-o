import type { SyncRow } from '../../lib/sync';

// Módulo Medição de Tanques (planilha de conferência de estoque de combustível).
// A venda (e o recebimento) é unificada por combustível: com mais de um tanque do mesmo combustível não dá para
// atribuí-la a cada tanque. Por isso a conferência é por combustível:
//   Total = Σ litros medidos nos tanques do combustível + Venda
//   Resultado final = Σ informada (litros da medição anterior de cada tanque) + Recebimento − Total
//   (negativo = falta; positivo = sobra). Ex. com um tanque: 5689 + 1289 = 6978; 1968 + 5000 − 6978 = −10.

export type LinhaTanque = {
  id: string;
  tanque: string;
  /** id do catálogo de combustíveis (o mesmo de Aferições e Croqui). */
  combustivel: string;
  /** Altura medida na régua (cm). */
  metragem: number | null;
  /** Estoque medido em litros (lido na tabela do tanque). */
  litros: number | null;
  /** Nome da tabela de arqueação de onde saíram os litros (calculados pela altura); some se os litros forem digitados. */
  litrosTabela?: string;
  /** Estoque informado (litros): os litros medidos na medição anterior do mesmo tanque (preenchido sozinho, editável). */
  informada: number | null;
  /** Data (AAAA-MM-DD) da medição anterior de onde veio a informada; some se ela for digitada à mão. */
  informadaDe?: string;
  /** Formato antigo (venda/recebimento por tanque): só lido para converter medições antigas. */
  venda?: number | null;
  recebimento?: number | null;
};
/** Venda e recebimento do período, por combustível (valores unificados das bombas e das notas). */
export type ValoresCombustivel = { combustivel: string; venda: number | null; recebimento: number | null };
export type Medicao = SyncRow & {
  filial_id: string; data: string; medido_em: string | null; status: 'rascunho' | 'finalizada';
  tanques: LinhaTanque[]; combustiveis?: ValoresCombustivel[]; obs: string; responsavel_nome: string;
};

/** Combustíveis presentes nos tanques, na ordem em que aparecem. */
export const combustiveisDaMedicao = (m: Pick<Medicao, 'tanques'>) => [...new Set(m.tanques.map(l => l.combustivel).filter(Boolean))];

/** Venda/recebimento de cada combustível da medição (medições antigas: soma do que estava por tanque). */
export function valoresPorCombustivel(m: Pick<Medicao, 'tanques' | 'combustiveis'>): ValoresCombustivel[] {
  return combustiveisDaMedicao(m).map(c => {
    const salvo = (m.combustiveis ?? []).find(x => x.combustivel === c);
    if (salvo) return salvo;
    const doc = m.tanques.filter(l => l.combustivel === c);
    const soma = (k: 'venda' | 'recebimento') => (doc.some(l => typeof l[k] === 'number') ? doc.reduce((s, l) => s + (l[k] ?? 0), 0) : null);
    return { combustivel: c, venda: soma('venda'), recebimento: soma('recebimento') };
  });
}

export type Conferencia = {
  combustivel: string; tanques: string[]; litros: number; informada: number; venda: number | null; recebimento: number | null;
  total: number; resultado: number; pct: number | null; completa: boolean;
};
/** Conferência por combustível e geral. */
export function resumo(m: Pick<Medicao, 'tanques' | 'combustiveis'>) {
  const valores = valoresPorCombustivel(m);
  const porCombustivel: Conferencia[] = valores.map(v => {
    const doc = m.tanques.filter(l => l.combustivel === v.combustivel);
    const litros = doc.reduce((s, l) => s + (l.litros ?? 0), 0);
    const informada = doc.reduce((s, l) => s + (l.informada ?? 0), 0);
    const total = litros + (v.venda ?? 0);
    const resultado = informada + (v.recebimento ?? 0) - total;
    const completa = v.venda !== null && v.recebimento !== null && doc.every(l => l.litros !== null && l.informada !== null);
    return { combustivel: v.combustivel, tanques: doc.map(l => l.tanque), litros, informada, venda: v.venda, recebimento: v.recebimento, total, resultado, pct: v.venda ? (resultado / v.venda) * 100 : null, completa };
  });
  const s = (k: 'litros' | 'informada' | 'total' | 'resultado') => porCombustivel.reduce((a, x) => a + x[k], 0);
  const venda = porCombustivel.reduce((a, x) => a + (x.venda ?? 0), 0), recebimento = porCombustivel.reduce((a, x) => a + (x.recebimento ?? 0), 0);
  const geral: Conferencia = {
    combustivel: 'Total', tanques: m.tanques.map(l => l.tanque), litros: s('litros'), informada: s('informada'), venda, recebimento,
    total: s('total'), resultado: s('resultado'), pct: venda ? (s('resultado') / venda) * 100 : null, completa: porCombustivel.every(x => x.completa),
  };
  return { porCombustivel, geral };
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
