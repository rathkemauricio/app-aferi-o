import { dataBR, esc } from '../../lib/util';
import { type Coleta, type Consolidado, type Contagem, fmtQ, type Inventario, percentualGeral, porCategoria, type Produto, relatorio } from './model';

// Impressão (PDF) do inventário e das contagens — o mesmo documento no painel web e no app.
// Letras maiores que as do relatório antigo (os itens saíam pequenos demais) e o detalhamento das faltas e
// sobras sempre numa folha própria, no fim. Ele também pode ser impresso sozinho ("só as divergências").

const NAVY = '#102a46';
export const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const sinal = (v: number) => `${v > 0 ? '+' : ''}${fmtQ(v)}`;
const cor = (v: number) => (v < 0 ? ' neg' : v > 0 ? ' pos' : '');

/** Item com falta ou sobra, como sai no detalhamento impresso. */
export type LinhaDivergente = {
  produto: Produto; qtd: number; diferenca: number; difCusto: number | null; difVenda: number | null;
  /** Falta, Sobra, Não encontrado, Não coletado. */
  situacao: string;
  /** Nome da contagem (no relatório geral do inventário). */
  contagem?: string;
};

/** Métrica do resumo: rótulo, valor e classe de cor ('neg' | 'pos' | ''). */
export type Metrica = [string, string, string?];

const CSS = `
@page{size:A4 landscape;margin:10mm}
body{font:12px Arial,sans-serif;color:#1b2230;margin:0}
h1{font-size:21px;margin:0 0 3px;color:${NAVY}}
.sub{color:#4a5263;font-size:12px;margin-bottom:10px;line-height:1.4}
h2{font-size:16px;margin:16px 0 7px;color:${NAVY}}
.grid{display:grid;grid-template-columns:repeat(6,1fr);gap:6px}
.m{background:#f2f4f7;border-radius:6px;padding:7px 9px}
.m span{display:block;color:#4a5263;font-size:11px;margin-bottom:2px}
.m b{font-size:17px;font-variant-numeric:tabular-nums}
table{width:100%;border-collapse:collapse}
thead{display:table-header-group}
th{background:${NAVY};color:#fff;text-align:left;padding:6px 6px;font-size:12px}
td{border-bottom:1px solid #d9dde5;padding:5px 6px}
.cat th{font-size:11px;padding:5px 4px}.cat td{font-size:11px;padding:4px}
.det td{font-size:13.5px;padding:6px 6px}.det th{font-size:12.5px}
.det td.prod{font-weight:600}
.n{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
.neg{color:#c0262d}.pos{color:#a86400}
.tot td{font-weight:700;background:#eef1f6;border-top:2px solid ${NAVY}}
.grp td{background:#e3e9f3;font-weight:700;color:${NAVY};font-size:13.5px;padding:6px}
tr{page-break-inside:avoid;break-inside:avoid}
.folha{break-before:page;page-break-before:always}
.nota{color:#4a5263;font-size:11px;margin-top:10px}
`;

const pagina = (titulo: string, corpo: string) =>
  `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${esc(titulo)}</title><style>${CSS}</style></head><body>${corpo}</body></html>`;

const grade = (m: Metrica[]) => `<div class="grid">${m.map(([r, v, cls]) => `<div class="m"><span>${esc(r)}</span><b class="${cls ?? ''}">${esc(v)}</b></div>`).join('')}</div>`;

/** Tabela das faltas e sobras, agrupada por categoria (maiores faltas primeiro). */
function tabelaDivergencias(linhas: LinhaDivergente[]) {
  const comContagem = linhas.some(l => l.contagem);
  const cols = comContagem ? 9 : 8;
  const porCat = new Map<string, LinhaDivergente[]>();
  linhas.forEach(l => { const g = porCat.get(l.produto.categoria) ?? []; g.push(l); porCat.set(l.produto.categoria, g); });
  const corpo = [...porCat.entries()].sort((a, b) => a[0].localeCompare(b[0], 'pt-BR')).map(([cat, g]) =>
    `<tr class="grp"><td colspan="${cols}">${esc(cat || 'Sem categoria')} · ${g.length.toLocaleString('pt-BR')} ${g.length === 1 ? 'item' : 'itens'}</td></tr>` +
    [...g].sort((a, b) => a.diferenca - b.diferenca || a.produto.nome.localeCompare(b.produto.nome, 'pt-BR')).map(l =>
      `<tr><td>${esc(l.produto.codigo)}</td><td class="prod">${esc(l.produto.nome)}</td><td class="n">${fmtQ(l.produto.saldo)}</td><td class="n">${fmtQ(l.qtd)}</td><td class="n${cor(l.diferenca)}"><b>${sinal(l.diferenca)}</b></td><td class="n">${l.difCusto === null ? '—' : brl(l.difCusto)}</td><td class="n">${l.difVenda === null ? '—' : brl(l.difVenda)}</td><td>${esc(l.situacao)}</td>${comContagem ? `<td>${esc(l.contagem ?? '')}</td>` : ''}</tr>`).join('')).join('');
  return `<table class="det"><thead><tr><th>Código</th><th>Produto</th><th class="n">Saldo</th><th class="n">Contado</th><th class="n">Dif.</th><th class="n">Dif. R$ custo</th><th class="n">Dif. R$ venda</th><th>Situação</th>${comContagem ? '<th>Contagem</th>' : ''}</tr></thead><tbody>${corpo || `<tr><td colspan="${cols}">Nenhuma falta ou sobra.</td></tr>`}</tbody></table>`;
}

/** Resumo das divergências (vai no topo da impressão só das divergências). */
function resumoDivergencias(linhas: LinhaDivergente[]): Metrica[] {
  let faltas = 0, sobras = 0, custo = 0, venda = 0;
  const temCusto = linhas.some(l => l.difCusto !== null), temVenda = linhas.some(l => l.difVenda !== null);
  linhas.forEach(l => { if (l.diferenca < 0) faltas -= l.diferenca; else sobras += l.diferenca; custo += l.difCusto ?? 0; venda += l.difVenda ?? 0; });
  const res = sobras - faltas;
  return [
    ['Itens com diferença', linhas.length.toLocaleString('pt-BR')],
    ['Falta (unidades)', fmtQ(faltas), faltas ? 'neg' : ''],
    ['Sobra (unidades)', fmtQ(sobras), sobras ? 'pos' : ''],
    ['Resultado (unidades)', sinal(res), cor(res).trim()],
    ['Resultado R$ (custo)', temCusto ? brl(Math.round(custo * 100) / 100) : '—', cor(custo).trim()],
    ['Resultado R$ (venda)', temVenda ? brl(Math.round(venda * 100) / 100) : '—', cor(venda).trim()],
  ];
}

const tituloDetalhe = (linhas: LinhaDivergente[]) => `Detalhamento: faltas e sobras (${linhas.length.toLocaleString('pt-BR')} ${linhas.length === 1 ? 'item' : 'itens'})`;

/** Relatório completo: resumo, categorias, contagens e, numa folha separada no fim, o detalhamento. */
export function htmlRelatorioInventario(o: {
  titulo: string; sub: string; resumo: Metrica[];
  categorias: Consolidado[]; total: Consolidado;
  tituloContagens: string;
  contagens: { nome: string; itens: number; sistema: number; contado: number; pct: number; corretos: number; divergentes: number; naoEncontrados: number }[];
  divergentes: LinhaDivergente[];
}) {
  const pct = (v: number | null) => (v === null ? '—' : `${fmtQ(v)}%`);
  const rs = (v: number, tem: boolean) => (tem ? brl(v) : '—');
  const linhaCat = (x: Consolidado, tot = false) => `<tr${tot ? ' class="tot"' : ''}><td>${esc(x.nome)}</td><td class="n">${fmtQ(x.itens)}</td><td class="n">${fmtQ(x.sistema)}</td><td class="n">${fmtQ(x.contagem)}</td><td class="n">${fmtQ(x.faltas)}</td><td class="n">${fmtQ(x.sobras)}</td><td class="n${cor(x.resultado)}">${sinal(x.resultado)}</td><td class="n">${rs(x.custo.faltas, x.temCusto)}</td><td class="n">${rs(x.custo.sobras, x.temCusto)}</td><td class="n${cor(x.custo.resultado)}">${rs(x.custo.resultado, x.temCusto)}</td><td class="n">${rs(x.venda.faltas, x.temVenda)}</td><td class="n">${rs(x.venda.sobras, x.temVenda)}</td><td class="n${cor(x.venda.resultado)}">${rs(x.venda.resultado, x.temVenda)}</td><td class="n">${pct(x.acuracia)}</td><td class="n">${pct(x.eficiencia)}</td></tr>`;
  const contagens = o.contagens.map(p => `<tr><td>${esc(p.nome)}</td><td class="n">${p.itens.toLocaleString('pt-BR')}</td><td class="n">${fmtQ(p.sistema)}</td><td class="n">${fmtQ(p.contado)}</td><td class="n"><b>${fmtQ(Math.round(p.pct * 1000) / 10)}%</b></td><td class="n">${p.corretos.toLocaleString('pt-BR')}</td><td class="n">${p.divergentes.toLocaleString('pt-BR')}</td><td class="n">${p.naoEncontrados.toLocaleString('pt-BR')}</td></tr>`).join('');
  return pagina(o.titulo, `
<h1>${esc(o.titulo)}</h1><div class="sub">${esc(o.sub)}</div>
<h2>Resumo</h2>${grade(o.resumo)}
<h2>Resultado por categoria</h2><table class="cat"><thead><tr><th>Categoria</th><th class="n">Itens</th><th class="n">Sistema</th><th class="n">Contagem</th><th class="n">Falta</th><th class="n">Sobra</th><th class="n">Resultado</th><th class="n">Falta R$ custo</th><th class="n">Sobra R$ custo</th><th class="n">Result. R$ custo</th><th class="n">Falta R$ venda</th><th class="n">Sobra R$ venda</th><th class="n">Result. R$ venda</th><th class="n">Acurácia</th><th class="n">Eficiência</th></tr></thead><tbody>${o.categorias.map(x => linhaCat(x)).join('')}${linhaCat(o.total, true)}</tbody></table>
<h2>${esc(o.tituloContagens)}</h2><table><thead><tr><th>Contagem</th><th class="n">Itens</th><th class="n">Sistema</th><th class="n">Contado</th><th class="n">Percentual</th><th class="n">Corretos</th><th class="n">Divergentes</th><th class="n">Não encontrados</th></tr></thead><tbody>${contagens}</tbody></table>
<p class="nota">Acurácia = contagem ÷ estoque sistema × 100. Eficiência = (1 − (falta + sobra) ÷ estoque sistema) × 100. Valores em R$ = diferença × preço unitário de custo ou de venda dos PDFs da carga. O detalhamento das faltas e sobras está na folha seguinte.</p>
<div class="folha"><h1>${esc(tituloDetalhe(o.divergentes))}</h1><div class="sub">${esc(o.titulo)} · ${esc(o.sub)}</div>${tabelaDivergencias(o.divergentes)}</div>`);
}

/** Só o detalhamento das faltas e sobras (com um resumo curto no topo). */
export function htmlDivergencias(o: { titulo: string; sub: string; divergentes: LinhaDivergente[]; nota?: string }) {
  return pagina(o.titulo, `
<h1>${esc(o.titulo)}</h1><div class="sub">${esc(o.sub)}</div>
${grade(resumoDivergencias(o.divergentes))}
<h2>${esc(tituloDetalhe(o.divergentes))}</h2>${tabelaDivergencias(o.divergentes)}
${o.nota ? `<p class="nota">${esc(o.nota)}</p>` : ''}`);
}

const dataHora = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');

/**
 * PDF do inventário (ou de uma contagem dele): completo, com o detalhamento numa folha separada no fim, ou só as
 * divergências. Usado pela tela do relatório e pela Agenda (realizado no dia).
 */
export function htmlDoInventario(o: {
  inv: Inventario; filialNome: string; usuario?: string; produtos: Produto[]; contagens: Contagem[]; coletas: Coleta[];
  /** Só esta contagem (senão, todas as do inventário). */
  contagem?: Contagem;
  soDivergencias?: boolean;
}) {
  const { inv, contagem: soDela } = o;
  const contagens = o.contagens.filter(x => x.inventario_id === inv.id && (!soDela || x.id === soDela.id));
  const rel = relatorio(o.produtos, contagens, o.coletas);
  const problemas = rel.linhas.filter(l => l.status !== 'correto');
  const enc = inv.status === 'encerrado';
  const cons = porCategoria(rel.linhas);
  const geral = !soDela ? percentualGeral(o.produtos, contagens, o.coletas) : null;
  const n = (v: number) => fmtQ(v);
  const pct = (v: number | null) => (v === null ? '—' : `${fmtQ(v)}%`);
  const rs = (v: number, tem: boolean) => (tem ? brl(v) : '—');
  const corT = (v: number) => cor(v).trim();
  const t = cons.total;
  const titulo = `${soDela ? `Relatório da contagem ${soDela.nome}` : 'Relatório do inventário'} · ${inv.codigo}`;
  const sub = `${o.filialNome} · ${inv.tipo === 'completo' ? 'Completo' : 'Parcial'} · Saldo do Petros de ${dataHora(inv.saldo_em ?? inv.erp_em)} · ${enc ? `Finalizado em ${dataBR(inv.encerrado_em)}` : 'Em andamento (parcial)'} · Emitido em ${new Date().toLocaleString('pt-BR')}${o.usuario ? ` · Responsável: ${o.usuario}` : ''}`;
  const divergentes: LinhaDivergente[] = problemas.map(l => ({ ...l, situacao: l.status === 'divergente' ? (l.diferenca < 0 ? 'Falta' : 'Sobra') : 'Não encontrado', contagem: l.contagem }));
  if (o.soDivergencias) return htmlDivergencias({ titulo: `Itens divergentes · ${soDela ? soDela.nome : 'inventário'} · ${inv.codigo}`, sub, divergentes });
  return htmlRelatorioInventario({
    titulo, sub,
    resumo: [
      ['Estoque sistema', n(t.sistema)], ['Contagem', n(t.contagem)], ['Falta', n(t.faltas), t.faltas ? 'neg' : ''], ['Sobra', n(t.sobras), t.sobras ? 'pos' : ''], ['Resultado', sinal(t.resultado), corT(t.resultado)],
      ['Falta R$ (custo)', rs(t.custo.faltas, t.temCusto), 'neg'], ['Sobra R$ (custo)', rs(t.custo.sobras, t.temCusto), 'pos'], ['Resultado R$ (custo)', rs(t.custo.resultado, t.temCusto), corT(t.custo.resultado)],
      ['Falta R$ (venda)', rs(t.venda.faltas, t.temVenda), 'neg'], ['Sobra R$ (venda)', rs(t.venda.sobras, t.temVenda), 'pos'], ['Resultado R$ (venda)', rs(t.venda.resultado, t.temVenda), corT(t.venda.resultado)],
      [soDela ? 'Percentual da contagem (acurácia)' : 'Percentual contado (acurácia)', pct(t.acuracia)], ['Eficiência', pct(t.eficiencia)],
      ...(geral ? [['Percentual geral do arquivo', `${fmtQ(Math.round(geral.pct * 1000) / 10)}%`], ['Itens do arquivo coletados', `${geral.coletados.toLocaleString('pt-BR')} de ${geral.itens.toLocaleString('pt-BR')}`]] as Metrica[] : []),
      ['Itens corretos', rel.corretos.toLocaleString('pt-BR')], ['Itens divergentes', rel.divergentes.toLocaleString('pt-BR')], ['Não encontrados', rel.naoEncontrados.toLocaleString('pt-BR')],
    ],
    categorias: cons.categorias, total: t,
    tituloContagens: soDela ? 'Resultado da contagem' : 'Resultado por contagem',
    contagens: rel.porContagem.map(p => ({ ...p, nome: p.contagem.nome })),
    divergentes,
  });
}
