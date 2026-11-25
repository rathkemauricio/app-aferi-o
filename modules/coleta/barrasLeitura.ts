// Leitura da "Relação de Códigos de Barra por Categoria" do ERP (base de códigos de barra da rede ou da filial).
// Módulo puro (sem React Native nem Supabase): roda no app, no navegador e em scripts.
//
// Dois layouts reconhecidos (o mesmo relatório do Petros com opções diferentes):
//   A) com o código de barras desenhado: cada dígito é um texto solto seguido de ">" (até 3 por linha),
//      e o código interno + descrição ficam ao lado ("7790  ENER. MONSTER GREEN 473 ML").
//   B) lista por categoria: cabeçalho da categoria na margem, "7790 -" e a descrição na mesma linha, o EAN
//      principal na coluna da direita e os demais EANs nas linhas logo abaixo (às vezes vários na mesma linha).
// Regra comum: linhas na ordem da página (de cima para baixo); EANs pertencem ao último produto visto.

export type ItemBarras = { codigo: string; nome: string; categoria: string; eans: string[] };
export type Texto = { x: number; y: number; s: string };

const TITULO = /rela[çc][ãa]o de c[óo]digos de barra/i;
const EAN = /^\d{8,14}$/;
/** Anotações que aparecem na coluna do código de barras no lugar do EAN ("SEM GTIN", "NÃO USAR"...). */
const NOTA_COLUNA = /^(sem gtin|n[ãa]o usar|n[ãa]o exist\w*|excluir\b.*)$/i;

/** Separa textos que o PDF juntou: "7790 - DESCRIÇÃO" e vários EANs no mesmo texto. */
function separar(t: Texto): Texto[] {
  const prod = t.s.match(/^(\d{1,14})\s+-\s+(.+)$/);
  if (prod) return [{ ...t, s: prod[1] }, { ...t, x: t.x + 1, s: prod[2].trim() }];
  if (/^\d{8,14}(\s+\d{8,14})+$/.test(t.s)) return t.s.split(/\s+/).map((s, i) => ({ ...t, x: t.x + i, s }));
  return [t];
}

/** Monta os itens a partir dos textos de cada página (coordenadas do PDF: y cresce para cima). */
export function lerItensBarras(paginas: Texto[][]) {
  const itens = new Map<string, ItemBarras>();
  let categoria = '', atual: ItemBarras | null = null, eansSoltos = 0;
  for (const textos of paginas) {
    const linhas = new Map<number, Texto[]>();
    textos.flatMap(separar).forEach(t => { const y = Math.round(t.y); const l = linhas.get(y) ?? []; l.push(t); linhas.set(y, l); });
    for (const [, l] of [...linhas.entries()].sort((a, b) => b[0] - a[0])) {
      l.sort((a, b) => a.x - b.x);
      if (l.some(t => TITULO.test(t.s))) continue;
      // Junta os dígitos soltos do código de barras desenhado (layout A) até o ">".
      const eans: string[] = [], resto: Texto[] = [];
      let dig = '';
      for (const t of l) {
        if (/^\d$/.test(t.s)) { dig += t.s; continue; }
        if (t.s === '>') { if (dig) eans.push(dig); dig = ''; continue; }
        if (dig) { resto.push({ ...t, s: dig }); dig = ''; }
        resto.push(t);
      }
      if (dig) eans.push(dig);
      // Produto: primeiro texto é o código interno ("7790" ou "7790 -") e o seguinte é a descrição.
      const cod = resto[0]?.s.match(/^(\d{1,14})\s*-?$/);
      const prox = resto[1]?.s;
      if (cod && prox && !EAN.test(prox) && !/^\d+$/.test(prox)) {
        const nome = resto.slice(1).filter(t => !EAN.test(t.s) && !NOTA_COLUNA.test(t.s)).map(t => t.s).join(' ').replace(/^"(.*)"$/, '$1').replace(/""/g, '"').trim();
        atual = itens.get(cod[1]) ?? { codigo: cod[1], nome, categoria, eans: [] };
        itens.set(cod[1], atual);
        resto.slice(2).forEach(t => { if (EAN.test(t.s)) eans.push(t.s); });
      } else {
        resto.forEach(t => { if (EAN.test(t.s)) eans.push(t.s); });
        const txt = resto.filter(t => !/^\d+$/.test(t.s) && !NOTA_COLUNA.test(t.s));
        // Cabeçalho de categoria (layout B): só texto, encostado na margem esquerda.
        if (txt.length && !eans.length && txt[0].x < 40) { categoria = txt.map(t => t.s).join(' ').trim(); atual = null; }
      }
      for (const e of eans) {
        if (/^0+$/.test(e)) continue;
        if (atual) { if (!atual.eans.includes(e)) atual.eans.push(e); } else eansSoltos++;
      }
    }
  }
  const lista = [...itens.values()];
  return { itens: lista, eans: lista.reduce((n, i) => n + i.eans.length, 0), semEan: lista.filter(i => !i.eans.length).length, eansSoltos };
}
