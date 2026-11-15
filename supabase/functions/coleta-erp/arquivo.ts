// Leitura do arquivo exportado pelo ERP (PDF do relatório de saldos do Petros ou CSV/TXT).
// O PDF é transformado em linhas de texto (agrupando os pedaços pela altura na página) e cada linha
// de produto é reconhecida pelo padrão: código interno · [EAN] · descrição · … · saldo (último número).
// Cabeçalhos de grupo/categoria ("GRUPO: BEBIDAS", "Categoria - Tabacaria") definem a categoria dos itens abaixo.
// AJUSTAR quando chegar o PDF de exemplo do Petros: só as funções `linhaProduto` e `cabecalhoCategoria`.
import { getDocumentProxy } from 'npm:unpdf@0.12.1';
import type { ProdutoErp } from './petros.ts';

const numeroBR = (s: string) => Number(s.replace(/\./g, '').replace(',', '.'));
const NUM = /^-?[\d.]*\d(,\d+)?$/;

function base64ParaBytes(b64: string) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Texto do PDF linha a linha (pedaços com a mesma altura viram uma linha, em ordem da esquerda para a direita). */
async function linhasDoPdf(bytes: Uint8Array): Promise<string[]> {
  const pdf = await getDocumentProxy(bytes);
  const linhas: string[] = [];
  for (let n = 1; n <= pdf.numPages; n++) {
    const page = await pdf.getPage(n);
    const conteudo = await page.getTextContent();
    const porY = new Map<number, { x: number; s: string }[]>();
    // deno-lint-ignore no-explicit-any
    for (const it of conteudo.items as any[]) {
      if (!it.str?.trim()) continue;
      const y = Math.round(it.transform[5] / 2) * 2;
      const l = porY.get(y) ?? [];
      l.push({ x: it.transform[4], s: it.str.trim() });
      porY.set(y, l);
    }
    [...porY.entries()].sort((a, b) => b[0] - a[0]).forEach(([, l]) => linhas.push(l.sort((a, b) => a.x - b.x).map(p => p.s).join('  ')));
  }
  return linhas;
}

function cabecalhoCategoria(linha: string): string | null {
  const m = linha.match(/^\s*(?:grupo|subgrupo|categoria|departamento|se[cç][aã]o)\s*[:\-–]\s*(?:\d+\s*[-–]\s*)?(.+?)\s*$/i);
  return m ? m[1].replace(/\s{2,}/g, ' ').trim() : null;
}

function linhaProduto(linha: string): Omit<ProdutoErp, 'categoria'> | null {
  const partes = linha.split(/\s{2,}|\t/).map(p => p.trim()).filter(Boolean);
  if (partes.length < 3 || !/^\d{1,10}$/.test(partes[0])) return null;
  const codigo = partes[0];
  let i = 1;
  const eans: string[] = [];
  while (i < partes.length && /^\d{8,14}$/.test(partes[i])) eans.push(partes[i++]);
  const nome = partes[i];
  if (!nome || NUM.test(nome)) return null;
  const numeros = partes.slice(i + 1).filter(p => NUM.test(p));
  if (!numeros.length) return null;
  const saldo = numeroBR(numeros[numeros.length - 1]);
  return Number.isFinite(saldo) ? { codigo, eans, nome, saldo } : null;
}

function doTextoRelatorio(linhas: string[]) {
  const out: ProdutoErp[] = [];
  let categoria = 'Sem categoria';
  let ignoradas = 0;
  for (const l of linhas) {
    const cat = cabecalhoCategoria(l);
    if (cat) { categoria = cat; continue; }
    const p = linhaProduto(l);
    if (p) out.push({ ...p, categoria }); else if (/\d/.test(l)) ignoradas++;
  }
  return { produtos: out, ignoradas };
}

/** CSV/TXT com cabeçalho (separador ; , ou tab). Colunas reconhecidas pelo nome. */
function doCsv(texto: string) {
  const linhas = texto.replace(/^﻿/, '').split(/\r?\n/).filter(l => l.trim());
  const sep = [';', '\t', ','].find(s => linhas[0]?.includes(s)) ?? ';';
  const cel = (l: string) => l.split(sep).map(c => c.trim().replace(/^"|"$/g, '').replace(/""/g, '"'));
  const cab = cel(linhas[0] ?? '').map(c => c.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''));
  const col = (...nomes: string[]) => cab.findIndex(c => nomes.some(n => c === n || c.includes(n)));
  const ic = col('codigo', 'cod'), ie = col('ean', 'gtin', 'barras'), inome = col('descricao', 'produto', 'nome'), icat = col('categoria', 'grupo'), icl = col('classe', 'setor', 'departamento'), is = col('saldo', 'estoque', 'quantidade', 'qtd');
  if (ic < 0 || inome < 0 || is < 0) throw new Error('O arquivo precisa das colunas código, descrição e saldo (e, se tiver, EAN, categoria e setor).');
  const produtos: ProdutoErp[] = [];
  let ignoradas = 0;
  for (const l of linhas.slice(1)) {
    const c = cel(l);
    const codigo = c[ic], saldo = numeroBR(c[is] ?? '');
    if (!codigo || !Number.isFinite(saldo)) { ignoradas++; continue; }
    const setor = icl >= 0 ? c[icl] ?? '' : '';
    produtos.push({
      codigo, nome: c[inome] ?? '', saldo, categoria: (icat >= 0 && c[icat]) || 'Sem categoria',
      eans: ie >= 0 && c[ie] ? c[ie].split(/[|/ ]+/).filter(Boolean) : [],
      classe: /pista/i.test(setor) ? 'pista' : /conveni/i.test(setor) ? 'conveniencia' : undefined,
    });
  }
  return { produtos, ignoradas };
}

export async function lerArquivo(nome: string, base64: string) {
  const bytes = base64ParaBytes(base64);
  const ehPdf = bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46; // %PDF
  if (ehPdf) {
    const r = doTextoRelatorio(await linhasDoPdf(bytes));
    if (!r.produtos.length) throw new Error(`Não reconheci produtos no PDF "${nome}". Envie o arquivo ao suporte para ajustar a leitura do relatório do Petros.`);
    return r;
  }
  const texto = new TextDecoder('utf-8').decode(bytes);
  return /[;\t]/.test(texto.split('\n')[0] ?? '') || /codigo|descri/i.test(texto.split('\n')[0] ?? '') ? doCsv(texto) : doTextoRelatorio(texto.split(/\r?\n/));
}
