import type { SyncRow } from '../../lib/sync';

// Módulo Coleta (Contagem de Estoque).
// Hierarquia: Filial → Inventário (produtos e saldos congelados do ERP) → Contagens (grupo de categorias) → 3 rodadas.
//
// Regras das rodadas:
//   1ª: todos os itens do escopo (saldo diferente de zero nas categorias da contagem).
//   Ao finalizar a 1ª: corretos (coletado = saldo) ficam fechados; divergentes, saldo negativo e não coletados vão para a 2ª.
//   Ao finalizar a 2ª: fecham os corretos e os divergentes confirmados (2ª = 1ª); os demais (não coletados ou
//   com 2ª diferente da 1ª) vão para a 3ª, que confirma divergentes e não encontrados.
//   Resultado final do item: última quantidade coletada (sem coleta = 0) comparada ao saldo.

export type Classe = 'pista' | 'conveniencia';
export type ClasseContagem = 'completa' | 'pista' | 'conveniencia' | 'mista';
export type StatusRodada = 'aguardando' | 'andamento' | 'finalizada';
export type Rodada = 1 | 2 | 3;

/** custo e venda: valores unitários dos PDFs de custo e de preço de venda (null quando não vieram). */
export type Produto = { codigo: string; eans: string[]; nome: string; categoria: string; classe: Classe; saldo: number; custo: number | null; venda: number | null };

export type Inventario = SyncRow & {
  codigo: string; filial_id: string; tipo: 'completo' | 'parcial'; status: 'carregando' | 'aberto' | 'encerrado';
  fonte: 'arquivo' | 'petros'; arquivo: string; itens_total: number;
  erp_em: string | null; encerrado_em: string | null; enviado_erp_em: string | null;
  /** PDF com o preço de venda (o `arquivo` é o de custo). */
  arquivo_venda?: string;
  /** Data/hora impressa no relatório de saldos (quando o PDF traz); senão vale erp_em. */
  saldo_em?: string | null;
  /** Itens com saldo sem nenhum código de barras na base da filial. */
  sem_barras?: number;
};
/** Base fixa de códigos de barra da filial (id = filial_id). Os itens ficam no servidor (ce_barras). */
export type BaseBarras = SyncRow & { arquivo: string; itens: number; eans: number; importado_em: string | null };
export type Contagem = SyncRow & {
  inventario_id: string; nome: string; classe: ClasseContagem; categorias: string[]; rodadas: StatusRodada[];
  /** Pausada: não recebe leituras até ser retomada. */
  pausada?: boolean;
};
/** Soma das leituras de um item numa rodada, feitas por um aparelho. `hist`: [hora, quantidade], mais recente primeiro. */
export type Coleta = SyncRow & {
  inventario_id: string; contagem_id: string; rodada: Rodada; codigo: string; qtd: number; hist: [string, number][]; dispositivo: string;
};

export const ROTULO_CLASSE: Record<ClasseContagem, string> = { completa: 'Pista e Conveniência', pista: 'Pista', conveniencia: 'Conveniência', mista: 'Pista e Conveniência' };
export const ROTULO_RODADA: Record<StatusRodada, string> = { aguardando: 'Aguardando', andamento: 'Em andamento', finalizada: 'Finalizada' };

/* ---------- Escopo ---------- */
/**
 * Itens da contagem: saldo diferente de zero e, se não for completa, nas categorias escolhidas.
 * Com `q`, entram também os itens zerados no ERP (vindos da base de códigos de barra) que foram coletados
 * nesta contagem: estoque físico sem saldo no sistema, que vira sobra.
 */
export const escopo = (c: Pick<Contagem, 'classe' | 'categorias'>, produtos: Produto[], q?: Map<string, Qtds>) =>
  produtos.filter(p => (p.saldo !== 0 && (c.classe === 'completa' || c.categorias.includes(p.categoria))) || (!!q && p.saldo === 0 && q.has(p.codigo)));

/** Texto sem acento e em minúsculas (pesquisa). */
export const normalizar = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
/** O produto bate com a pesquisa (nome, código interno ou código de barras)? Todas as palavras precisam aparecer. */
export function bateBusca(p: Produto, termo: string) {
  const t = normalizar(termo.trim());
  if (!t) return true;
  if (/^\d+$/.test(t)) return p.codigo.includes(t) || p.eans.some(e => e.includes(t));
  const nome = normalizar(`${p.nome} ${p.codigo}`);
  return t.split(/\s+/).every(w => nome.includes(w));
}

export function categoriasDe(produtos: Produto[], classe?: Classe) {
  const m = new Map<string, { nome: string; classe: Classe; itens: number }>();
  produtos.forEach(p => {
    if (p.saldo === 0 || (classe && p.classe !== classe)) return;
    const c = m.get(p.categoria) ?? { nome: p.categoria, classe: p.classe, itens: 0 };
    c.itens++; m.set(p.categoria, c);
  });
  return [...m.values()].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}

/* ---------- Quantidades por rodada ---------- */
export type Qtds = [number | null, number | null, number | null];
/** codigo → quantidade coletada em cada rodada (soma de todos os aparelhos; null = não coletado). */
export function quantidades(coletas: Coleta[], contagemId: string) {
  const m = new Map<string, Qtds>();
  coletas.forEach(c => {
    if (c.contagem_id !== contagemId) return;
    const q = m.get(c.codigo) ?? [null, null, null];
    q[c.rodada - 1] = (q[c.rodada - 1] ?? 0) + c.qtd;
    m.set(c.codigo, q);
  });
  return m;
}

export type Situacao = 'correto' | 'divergente' | 'negativo' | 'nao_coletado';
const avaliar = (p: Produto, q: number | null): Situacao => (p.saldo < 0 ? 'negativo' : q === null ? 'nao_coletado' : q === p.saldo ? 'correto' : 'divergente');

/** Itens que participam da rodada (a 1ª tem o escopo inteiro; as seguintes, só o que sobrou da anterior). */
export function itensDaRodada(r: Rodada, itens: Produto[], q: Map<string, Qtds>): Produto[] {
  if (r === 1) return itens;
  const r2 = itens.filter(p => avaliar(p, q.get(p.codigo)?.[0] ?? null) !== 'correto');
  if (r === 2) return r2;
  return r2.filter(p => {
    const [q1, q2] = q.get(p.codigo) ?? [null, null, null];
    if (q2 !== null && q2 === p.saldo) return false;      // corrigido na 2ª
    if (q2 !== null && q1 !== null && q2 === q1) return false; // divergência confirmada
    return true;
  });
}

/** Motivo de o item estar na rodada (rótulo da lista de itens). */
export function motivo(p: Produto, r: Rodada, q: Qtds) {
  if (r === 1) return '';
  const ant = q[r - 2];
  if (p.saldo < 0) return 'Saldo negativo';
  if (ant === null) return `Não coletado na ${r - 1}ª`;
  return `Divergente na ${r - 1}ª`;
}

/** Situação do item dentro da rodada em andamento (cor e etiqueta na lista). */
export function situacaoNaRodada(p: Produto, r: Rodada, q: Qtds): 'correto' | 'pendente' | 'divergente' {
  const v = q[r - 1];
  if (v === null) return 'pendente';
  return v === p.saldo ? 'correto' : 'divergente';
}

/** Resumo ao finalizar a rodada: quantos fecham e quantos seguem. */
export function resumoRodada(r: Rodada, itens: Produto[], q: Map<string, Qtds>) {
  const daRodada = itensDaRodada(r, itens, q);
  const res = { total: daRodada.length, corretos: 0, divergentes: 0, negativos: 0, naoColetados: 0, confirmados: 0, seguem: 0 };
  daRodada.forEach(p => {
    const qq = q.get(p.codigo) ?? [null, null, null];
    const s = avaliar(p, qq[r - 1]);
    if (s === 'correto') res.corretos++;
    else if (s === 'negativo') res.negativos++;
    else if (s === 'nao_coletado') res.naoColetados++;
    else if (r === 2 && qq[0] !== null && qq[1] === qq[0]) res.confirmados++;
    else res.divergentes++;
  });
  res.seguem = r === 3 ? 0 : itensDaRodada((r + 1) as Rodada, itens, q).length;
  return res;
}

export type Final = 'correto' | 'divergente' | 'nao_encontrado';
/** Resultado final do item na contagem (última quantidade coletada nas rodadas de que participou). */
export function resultadoFinal(p: Produto, q: Qtds): { qtd: number; status: Final; coletado: boolean } {
  const ult = q[2] ?? q[1] ?? q[0];
  const qtd = ult ?? 0;
  const status: Final = qtd === p.saldo ? 'correto' : qtd === 0 && p.saldo > 0 ? 'nao_encontrado' : 'divergente';
  return { qtd, status, coletado: ult !== null };
}

export const rodadaAtual = (c: Contagem): Rodada | null => {
  const i = c.rodadas.indexOf('andamento');
  return i < 0 ? null : ((i + 1) as Rodada);
};
export const concluida = (c: Contagem) => c.rodadas.every(r => r === 'finalizada');

/** Finaliza a rodada: abre a próxima se tiver itens; senão, encerra a contagem. */
export function finalizarRodada(c: Contagem, r: Rodada, itens: Produto[], q: Map<string, Qtds>): StatusRodada[] {
  const rod = [...c.rodadas];
  rod[r - 1] = 'finalizada';
  if (r < 3 && itensDaRodada((r + 1) as Rodada, itens, q).length) rod[r] = 'andamento';
  else for (let i = r; i < 3; i++) rod[i] = 'finalizada';
  return rod;
}
/** Reabre a última rodada que teve itens (as seguintes voltam a aguardar). */
export function reabrir(c: Contagem, itens: Produto[], q: Map<string, Qtds>): StatusRodada[] {
  let alvo = 3;
  while (alvo > 1 && !itensDaRodada(alvo as Rodada, itens, q).length) alvo--;
  return c.rodadas.map((_, i) => (i + 1 < alvo ? 'finalizada' : i + 1 === alvo ? 'andamento' : 'aguardando'));
}

/* ---------- Progresso e relatório ---------- */
export function progressoContagem(c: Contagem, itens: Produto[], q: Map<string, Qtds>) {
  const r = rodadaAtual(c);
  if (!r) return 1;
  const lista = itensDaRodada(r, itens, q);
  return lista.length ? lista.filter(p => q.get(p.codigo)?.[r - 1] !== null && q.get(p.codigo)?.[r - 1] !== undefined).length / lista.length : 1;
}

/** Por categoria: itens com saldo e quantos deles já tiveram alguma coleta no inventário. */
export function progressoPorCategoria(produtos: Produto[], coletas: Coleta[]) {
  const coletados = new Set(coletas.map(c => c.codigo));
  const m = new Map<string, { coletados: number; total: number; pct: number }>();
  produtos.forEach(p => {
    if (p.saldo === 0) return;
    const x = m.get(p.categoria) ?? { coletados: 0, total: 0, pct: 0 };
    x.total++; if (coletados.has(p.codigo)) x.coletados++;
    x.pct = x.coletados / x.total;
    m.set(p.categoria, x);
  });
  return m;
}

/** Itens distintos com alguma coleta, sobre o total de itens com saldo (não muda ao finalizar contagens). */
export function progressoInventario(produtos: Produto[], coletas: Coleta[]) {
  const total = produtos.filter(p => p.saldo !== 0).length;
  const comSaldo = new Set(produtos.filter(p => p.saldo !== 0).map(p => p.codigo));
  const coletados = new Set(coletas.filter(c => comSaldo.has(c.codigo)).map(c => c.codigo)).size;
  return { coletados, total, pct: total ? coletados / total : 0 };
}

export type LinhaRelatorio = { produto: Produto; qtd: number; status: Final; contagem: string; diferenca: number; coletado: boolean; difCusto: number | null; difVenda: number | null };
/** Faltas (negativas), sobras e resultado em R$, a custo e a preço de venda. */
export type Valores = { faltas: number; sobras: number; resultado: number };
const somaValores = (difs: (number | null)[]): Valores => {
  const v = { faltas: 0, sobras: 0, resultado: 0 };
  difs.forEach(d => { if (d === null) return; if (d < 0) v.faltas += d; else v.sobras += d; v.resultado += d; });
  return v;
};
const vezes = (dif: number, unit: number | null) => (unit === null ? null : Math.round(dif * unit * 100) / 100);
/**
 * Resultado do inventário: cada item entra uma vez, pela contagem mais recente em que foi coletado
 * (ou, sem coleta, pela mais recente que o incluía). Itens com saldo fora de qualquer contagem ficam de fora.
 */
export function relatorio(produtos: Produto[], contagens: Contagem[], coletas: Coleta[]) {
  const ord = [...contagens].sort((a, b) => (b.updated_at ?? '').localeCompare(a.updated_at ?? ''));
  const qPor = new Map(ord.map(c => [c.id, quantidades(coletas, c.id)]));
  const porItem = new Map<string, LinhaRelatorio>();
  const porContagem = ord.map(c => {
    const q = qPor.get(c.id)!, itens = escopo(c, produtos, q);
    const r = { contagem: c, itens: itens.length, corretos: 0, divergentes: 0, naoEncontrados: 0 };
    itens.forEach(p => {
      const f = resultadoFinal(p, q.get(p.codigo) ?? [null, null, null]);
      if (f.status === 'correto') r.corretos++; else if (f.status === 'divergente') r.divergentes++; else r.naoEncontrados++;
      const ja = porItem.get(p.codigo);
      if (!ja || (!ja.coletado && f.coletado)) {
        const dif = f.qtd - p.saldo;
        porItem.set(p.codigo, { produto: p, qtd: f.qtd, status: f.status, contagem: c.nome, diferenca: dif, coletado: f.coletado, difCusto: vezes(dif, p.custo), difVenda: vezes(dif, p.venda) });
      }
    });
    return r;
  });
  const linhas = [...porItem.values()].sort((a, b) => a.produto.nome.localeCompare(b.produto.nome, 'pt-BR'));
  return {
    linhas, porContagem,
    corretos: linhas.filter(l => l.status === 'correto').length,
    divergentes: linhas.filter(l => l.status === 'divergente').length,
    naoEncontrados: linhas.filter(l => l.status === 'nao_encontrado').length,
    custo: somaValores(linhas.map(l => l.difCusto)),
    venda: somaValores(linhas.map(l => l.difVenda)),
    temCusto: linhas.some(l => l.produto.custo !== null),
    temVenda: linhas.some(l => l.produto.venda !== null),
  };
}

/* ---------- Consolidado no formato do módulo Inventários ---------- */
/**
 * Mesmas métricas da base histórica de inventários:
 *   sistema = soma dos saldos; contagem = soma do contado; falta/sobra = soma das diferenças negativas/positivas;
 *   resultado = sobra − falta (= contagem − sistema); valores em R$ a custo e a venda;
 *   acurácia = contagem ÷ sistema × 100; eficiência = (1 − (falta + sobra) ÷ sistema) × 100.
 */
export type Consolidado = {
  nome: string; itens: number; sistema: number; contagem: number; faltas: number; sobras: number; resultado: number;
  custo: Valores; venda: Valores; temCusto: boolean; temVenda: boolean; acuracia: number | null; eficiencia: number | null;
};
type LinhaValor = { produto: Produto; qtd: number; diferenca: number; difCusto: number | null; difVenda: number | null };
export function consolidar(nome: string, linhas: LinhaValor[]): Consolidado {
  const r = { nome, itens: linhas.length, sistema: 0, contagem: 0, faltas: 0, sobras: 0 };
  linhas.forEach(l => { r.sistema += l.produto.saldo; r.contagem += l.qtd; if (l.diferenca < 0) r.faltas -= l.diferenca; else r.sobras += l.diferenca; });
  const arred = (v: number) => Math.round(v * 100) / 100;
  return {
    ...r, resultado: r.sobras - r.faltas,
    custo: somaValores(linhas.map(l => l.difCusto)), venda: somaValores(linhas.map(l => l.difVenda)),
    temCusto: linhas.some(l => l.produto.custo !== null), temVenda: linhas.some(l => l.produto.venda !== null),
    acuracia: r.sistema > 0 ? arred((r.contagem / r.sistema) * 100) : null,
    eficiencia: r.sistema > 0 ? arred((1 - (r.faltas + r.sobras) / r.sistema) * 100) : null,
  };
}
/** Total do inventário e uma linha por categoria (ordem alfabética). */
export function porCategoria(linhas: LinhaValor[]) {
  const m = new Map<string, LinhaValor[]>();
  linhas.forEach(l => { const g = m.get(l.produto.categoria) ?? []; g.push(l); m.set(l.produto.categoria, g); });
  return { total: consolidar('Total', linhas), categorias: [...m.entries()].sort((a, b) => a[0].localeCompare(b[0], 'pt-BR')).map(([n, g]) => consolidar(n, g)) };
}

/* ---------- Detalhamento de uma contagem: itens com falta e sobra ---------- */
export type LinhaDetalhe = LinhaValor & { coletado: boolean };
/** Resultado de cada item da contagem (última quantidade coletada; sem coleta = 0), só os que têm diferença. */
export function detalheContagem(c: Pick<Contagem, 'classe' | 'categorias'>, produtos: Produto[], q: Map<string, Qtds>) {
  const linhas: LinhaDetalhe[] = escopo(c, produtos, q).map(p => {
    const f = resultadoFinal(p, q.get(p.codigo) ?? [null, null, null]);
    const dif = f.qtd - p.saldo;
    return { produto: p, qtd: f.qtd, diferenca: dif, coletado: f.coletado, difCusto: vezes(dif, p.custo), difVenda: vezes(dif, p.venda) };
  });
  const ord = (a: LinhaDetalhe, b: LinhaDetalhe) => a.diferenca - b.diferenca || a.produto.nome.localeCompare(b.produto.nome, 'pt-BR');
  return {
    total: consolidar('Contagem', linhas),
    faltas: linhas.filter(l => l.diferenca < 0 && l.coletado).sort(ord),
    naoColetados: linhas.filter(l => l.diferenca < 0 && !l.coletado).sort(ord),
    sobras: linhas.filter(l => l.diferenca > 0).sort((a, b) => b.diferenca - a.diferenca || a.produto.nome.localeCompare(b.produto.nome, 'pt-BR')),
  };
}

/* ---------- Utilidades ---------- */
export const fmtQ = (v: number | null | undefined) => (v === null || v === undefined ? '—' : v.toLocaleString('pt-BR', { maximumFractionDigits: 3 }));
export const horaAgora = () => new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
export const uid = (p: string) => `${p}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
/** Próximo código INV-AAAA-NNN do ano. */
export function proximoCodigo(existentes: string[]) {
  const ano = new Date().getFullYear();
  const n = existentes.map(c => c.match(new RegExp(`^INV-${ano}-(\\d+)$`))?.[1]).filter(Boolean).map(Number);
  return `INV-${ano}-${String((n.length ? Math.max(...n) : 0) + 1).padStart(3, '0')}`;
}
/** Resultado em CSV (separador ;) para importar no ERP enquanto a API não está ligada. */
export function resultadoCsv(inv: Inventario, linhas: LinhaRelatorio[]) {
  const cel = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  const num = (v: number) => String(v).replace('.', ',');
  const opc = (v: number | null) => (v === null ? '' : num(v));
  return [
    ['inventario', 'codigo', 'ean', 'produto', 'categoria', 'classe', 'saldo_erp', 'contado', 'diferenca', 'custo_unit', 'venda_unit', 'diferenca_custo_rs', 'diferenca_venda_rs', 'situacao', 'contagem'].map(cel).join(';'),
    ...linhas.map(l => [inv.codigo, l.produto.codigo, l.produto.eans[0] ?? '', l.produto.nome, l.produto.categoria, l.produto.classe, num(l.produto.saldo), num(l.qtd), num(l.diferenca), opc(l.produto.custo), opc(l.produto.venda), opc(l.difCusto), opc(l.difVenda), l.status, l.contagem].map(v => cel(v)).join(';')),
  ].join('\n');
}
