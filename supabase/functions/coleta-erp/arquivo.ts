// Leitura do arquivo exportado pelo ERP (PDF do relatório de saldos do Petros ou CSV/TXT).
// O PDF é transformado em linhas de texto (agrupando os pedaços pela altura na página) e cada linha
// de produto é reconhecida pelo padrão: código interno · [EAN] · descrição · … · saldo (último número).
// Cabeçalhos de grupo/categoria ("GRUPO: BEBIDAS", "Categoria - Tabacaria") definem a categoria dos itens abaixo.
// AJUSTAR quando chegar o PDF de exemplo do Petros: só as funções `linhaProduto` e `cabecalhoCategoria`.
import { getDocumentProxy } from 'npm:unpdf@0.12.1';
import type { ProdutoErp } from './petros.ts';

const numeroBR = (s: string) => Number(s.replace(/\./g, '').replace(',', '.'));
const NUM = /^-?[\d.]*\d(,\d+)?$/;
const TITULO_BARRAS = /rela[çc][ãa]o de c[óo]digos de barra/i;

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

/**
 * Textos com coordenadas de um lote de páginas (usado pelo app no celular para a relação de códigos de barra:
 * o PDF inteiro passa do limite de CPU da função, então o app pede de pouco em pouco e monta a base no aparelho).
 */
export async function textosDasPaginas(bytes: Uint8Array, de: number, ate: number) {
  const pdf = await getDocumentProxy(bytes);
  const paginas: [number, number, string][][] = [];
  const fim = Math.min(ate, pdf.numPages);
  for (let n = Math.max(1, de); n <= fim; n++) {
    const page = await pdf.getPage(n);
    const conteudo = await page.getTextContent();
    // deno-lint-ignore no-explicit-any
    paginas.push((conteudo.items as any[]).filter(it => it.str?.trim()).map(it => [Math.round(it.transform[4] * 10) / 10, Math.round(it.transform[5] * 10) / 10, it.str.trim()]));
    page.cleanup();
  }
  return { total: pdf.numPages, paginas };
}

function cabecalhoCategoria(linha: string): string | null {
  // "Categoria do Item: AB LUBRIFICANTES BR TB/BD/GL" (Conferência de Estoque), "GRUPO: BEBIDAS", "Categoria - Tabacaria"
  const m = linha.match(/^\s*(?:grupo|subgrupo|categoria(?:\s+do\s+item)?|departamento|se[cç][aã]o)\s*[:\-–]\s*(?:\d+\s*[-–]\s*)?(.+?)\s*$/i);
  return m ? m[1].replace(/\s{2,}/g, ' ').trim() : null;
}

/** Linhas de cabeçalho/rodapé/totais do relatório (não são produto nem erro de leitura). */
const RUIDO = /^\s*(total\b|empresa:|data da contagem|respons[áa]vel|adaptive|p[áa]gina|local estoque|denomina[çc][ãa]o|rn\s*-)/i;

/**
 * "RN - Conferência de Estoque - Custo" do Petros/Adaptive (sem código de barras):
 *   16426-GALAO PLASTICO 5 LTS  [Localização]  UN  2  R$ 10,92  R$ 21,84  (1a/2a Contagem em branco)
 * Saldo = "Qtd Atual" (número logo antes do primeiro R$); custo unitário = primeiro R$.
 */
function linhaConferencia(linha: string): Omit<ProdutoErp, 'categoria'> | null {
  const partes = linha.split(/\s{2,}|\t/).map(p => p.trim()).filter(Boolean);
  const m = partes[0]?.match(/^(\d{1,14})\s*-\s*(.+)$/);
  const iRs = partes.findIndex(p => /^R\$/.test(p));
  if (!m || iRs < 2 || !NUM.test(partes[iRs - 1])) return null;
  const saldo = numeroBR(partes[iRs - 1]);
  const custo = numeroBR(partes[iRs].replace(/^R\$\s*/, ''));
  return Number.isFinite(saldo) ? { codigo: m[1], eans: [], nome: m[2].trim(), saldo, custo: Number.isFinite(custo) ? custo : null } : null;
}

function linhaProduto(linha: string): Omit<ProdutoErp, 'categoria'> | null {
  if (/R\$/.test(linha)) return linhaConferencia(linha);
  // "7790 - DESCRIÇÃO" (código com hífen, como na relação de barras) vira "7790  DESCRIÇÃO".
  const partes = linha.replace(/^\s*(\d{1,14})\s+-\s+/, '$1  ').split(/\s{2,}|\t/).map(p => p.trim()).filter(Boolean);
  if (partes.length < 3 || !/^\d{1,14}$/.test(partes[0])) return null;
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

/** Data e hora impressas no relatório (ex.: "Emitido em 16/11/2026 10:15"), no fuso de Brasília. */
export function dataDoRelatorio(linhas: string[]): string | null {
  for (const l of linhas.slice(0, 40)) {
    const m = l.match(/(\d{2})\/(\d{2})\/(\d{4})\D{1,12}?(\d{2}):(\d{2})(?::(\d{2}))?/);
    if (!m) continue;
    const t = Date.parse(`${m[3]}-${m[2]}-${m[1]}T${m[4]}:${m[5]}:${m[6] ?? '00'}-03:00`);
    if (!Number.isNaN(t)) return new Date(t).toISOString();
  }
  return null;
}

function doTextoRelatorio(linhas: string[]) {
  const out: ProdutoErp[] = [];
  let categoria = 'Sem categoria';
  let ignoradas = 0;
  for (const l of linhas) {
    if (TITULO_BARRAS.test(l) || RUIDO.test(l)) continue;
    const cat = cabecalhoCategoria(l);
    if (cat) { categoria = cat; continue; }
    const p = linhaProduto(l);
    if (p) out.push({ ...p, categoria }); else if (/\d/.test(l)) ignoradas++;
  }
  // "Empresa: NEVOEIRO 18" → número da filial no ERP (para conferir com a filial do inventário).
  const empresa = linhas.slice(0, 10).map(l => l.match(/empresa:\s*.*?(\d+)\s*(?:\s{2,}|$)/i)?.[1]).find(Boolean) ?? null;
  return { produtos: out, ignoradas, saldoEm: dataDoRelatorio(linhas), empresa };
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
  return { produtos, ignoradas, saldoEm: null as string | null, empresa: null as string | null };
}

export async function lerArquivo(nome: string, base64: string) {
  const bytes = base64ParaBytes(base64);
  const ehPdf = bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46; // %PDF
  if (ehPdf) {
    const linhas = await linhasDoPdf(bytes);
    if (linhas.slice(0, 5).some(l => TITULO_BARRAS.test(l))) throw new Error(`"${nome}" é a relação de códigos de barra, não o relatório de saldos. Importe-a em "Bases de códigos de barra" e escolha aqui o PDF de saldos da filial.`);
    const r = doTextoRelatorio(linhas);
    if (!r.produtos.length) throw new Error(`Não reconheci produtos com saldo no PDF "${nome}". Envie o arquivo ao suporte para ajustar a leitura do relatório do Petros.`);
    return r;
  }
  const texto = new TextDecoder('utf-8').decode(bytes);
  return /[;\t]/.test(texto.split('\n')[0] ?? '') || /codigo|descri/i.test(texto.split('\n')[0] ?? '') ? doCsv(texto) : doTextoRelatorio(texto.split(/\r?\n/));
}
