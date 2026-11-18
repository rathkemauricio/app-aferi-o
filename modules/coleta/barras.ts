import { Platform } from 'react-native';
import { supabase } from '../../lib/supabase';
import { chamar } from './store';

// Leitura da "Relação de Códigos de Barra por Categoria" do ERP (base fixa de cada filial).
//
// O PDF é pesado (milhares de páginas), por isso é lido no navegador e só o resultado vai ao servidor.
// Dois layouts reconhecidos (o mesmo relatório do Petros com opções diferentes):
//   A) com o código de barras desenhado: cada dígito é um texto solto seguido de ">" (até 3 por linha),
//      e o código interno + descrição ficam ao lado ("7790  ENER. MONSTER GREEN 473 ML").
//   B) lista por categoria: cabeçalho da categoria na margem, "7790 - DESCRIÇÃO" e EANs na mesma linha
//      ou nas linhas logo abaixo.
// Regra comum: linhas na ordem da página (de cima para baixo); EANs pertencem ao último produto visto.

export type ItemBarras = { codigo: string; nome: string; categoria: string; eans: string[] };
export type Texto = { x: number; y: number; s: string };

const TITULO = /rela[çc][ãa]o de c[óo]digos de barra/i;
const EAN = /^\d{8,14}$/;

/** Monta os itens a partir dos textos de cada página (coordenadas do PDF: y cresce para cima). */
export function lerItensBarras(paginas: Texto[][]) {
  const itens = new Map<string, ItemBarras>();
  let categoria = '', atual: ItemBarras | null = null, eansSoltos = 0;
  for (const textos of paginas) {
    const linhas = new Map<number, Texto[]>();
    textos.forEach(t => { const y = Math.round(t.y); const l = linhas.get(y) ?? []; l.push(t); linhas.set(y, l); });
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
        const nome = resto.slice(1).filter(t => !EAN.test(t.s)).map(t => t.s).join(' ').replace(/^"(.*)"$/, '$1').replace(/""/g, '"').trim();
        atual = itens.get(cod[1]) ?? { codigo: cod[1], nome, categoria, eans: [] };
        itens.set(cod[1], atual);
        resto.slice(2).forEach(t => { if (EAN.test(t.s)) eans.push(t.s); });
      } else {
        resto.forEach(t => { if (EAN.test(t.s)) eans.push(t.s); });
        const txt = resto.filter(t => !/^\d+$/.test(t.s));
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

/* ---------- PDF no navegador (pdf.js do cdnjs, carregado só quando precisa) ---------- */
const PDFJS = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174';
type PdfJs = {
  GlobalWorkerOptions: { workerSrc: string };
  getDocument: (src: { data: Uint8Array }) => { promise: Promise<{ numPages: number; getPage: (n: number) => Promise<{ getTextContent: () => Promise<{ items: { str?: string; transform: number[] }[] }>; cleanup: () => void }>; destroy: () => Promise<void> }> };
};
let carregando: Promise<PdfJs> | null = null;
function pdfjs(): Promise<PdfJs> {
  const w = globalThis as unknown as { pdfjsLib?: PdfJs; document: Document };
  if (w.pdfjsLib) return Promise.resolve(w.pdfjsLib);
  carregando ??= new Promise<PdfJs>((ok, falha) => {
    const s = w.document.createElement('script');
    s.src = `${PDFJS}/pdf.min.js`;
    s.onload = () => { const lib = w.pdfjsLib; if (!lib) { falha(new Error('Leitor de PDF indisponível.')); return; } lib.GlobalWorkerOptions.workerSrc = `${PDFJS}/pdf.worker.min.js`; ok(lib); };
    s.onerror = () => { carregando = null; falha(new Error('Não foi possível carregar o leitor de PDF. Confira a internet.')); };
    w.document.head.appendChild(s);
  });
  return carregando;
}

/** Navegador: lê o PDF inteiro aqui mesmo (rápido e sem limite de CPU). */
async function lerNoNavegador(arquivo: Blob, progresso?: Progresso) {
  const lib = await pdfjs();
  const doc = await lib.getDocument({ data: new Uint8Array(await arquivo.arrayBuffer()) }).promise;
  try {
    const paginas: Texto[][] = [];
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      const c = await page.getTextContent();
      paginas.push(c.items.filter(i => i.str?.trim()).map(i => ({ x: i.transform[4], y: i.transform[5], s: i.str!.trim() })));
      page.cleanup();
      if (n % 20 === 0 || n === doc.numPages) progresso?.(`Lendo página ${n.toLocaleString('pt-BR')} de ${doc.numPages.toLocaleString('pt-BR')}…`);
    }
    return paginas;
  } finally { void doc.destroy(); }
}

/* ---------- App (Android): o PDF vai para o servidor e a Edge Function devolve os textos em lotes ---------- */
const BUCKET = 'coleta-arquivos';
function base64ParaBytes(b64: string) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
async function lerArquivoBase64(uri: string) {
  const blob = await (await fetch(uri)).blob();
  if (blob.size > 30 * 1024 * 1024) throw new Error('Arquivo muito grande (limite de 30 MB).');
  const dataUri = await new Promise<string>((ok, falha) => { const fr = new FileReader(); fr.onload = () => ok(String(fr.result)); fr.onerror = () => falha(new Error('Não foi possível ler o arquivo.')); fr.readAsDataURL(blob); });
  return dataUri.slice(dataUri.indexOf(',') + 1);
}
async function lerNoServidor(uri: string, progresso?: Progresso, pasta: 'barras' | 'arqueacao' = 'barras') {
  if (!supabase) throw new Error('O app está em modo local: a importação precisa do servidor.');
  progresso?.('Enviando o PDF ao servidor…');
  const caminho = `${pasta}/${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}.pdf`;
  const { error } = await supabase.storage.from(BUCKET).upload(caminho, base64ParaBytes(await lerArquivoBase64(uri)), { contentType: 'application/pdf', upsert: false });
  if (error) throw new Error(`Não foi possível enviar o PDF: ${error.message}`);
  try {
    const paginas: Texto[][] = [];
    let de = 1, total = Infinity, lote = 60, falhas = 0;
    while (de <= total) {
      try {
        const r = await chamar<{ total: number; paginas: [number, number, string][][] }>({ acao: 'extrair_pdf', caminho, de, ate: de + lote - 1 });
        total = r.total;
        r.paginas.forEach(pg => paginas.push(pg.map(([x, y, s]) => ({ x, y, s }))));
        de += r.paginas.length || lote;
        falhas = 0;
        progresso?.(`Lendo página ${Math.min(de - 1, total).toLocaleString('pt-BR')} de ${total.toLocaleString('pt-BR')}…`);
      } catch (e) {
        // Lote pesado demais para a função (limite de CPU) ou rede instável: tenta de novo com lote menor.
        if (++falhas > 4) throw e;
        lote = Math.max(10, Math.floor(lote / 2));
      }
    }
    return paginas;
  } finally { void supabase.storage.from(BUCKET).remove([caminho]); }
}

type Progresso = (texto: string) => void;

/** Textos de cada página de um PDF (com posição): no navegador, localmente; no app, pelo servidor. */
export const lerTextosPdf = (arquivo: { uri: string; file?: Blob }, pasta: 'barras' | 'arqueacao', progresso?: Progresso) =>
  (Platform.OS === 'web' && arquivo.file ? lerNoNavegador(arquivo.file, progresso) : lerNoServidor(arquivo.uri, progresso, pasta));

/** Lê a relação de códigos de barra (PDF do Petros): no navegador, localmente; no app, pelo servidor. */
export async function lerPdfBarras(arquivo: { uri: string; file?: Blob }, progresso?: Progresso) {
  const paginas = Platform.OS === 'web' && arquivo.file ? await lerNoNavegador(arquivo.file, progresso) : await lerNoServidor(arquivo.uri, progresso);
  const r = lerItensBarras(paginas);
  if (!r.itens.length) throw new Error('Não reconheci produtos neste PDF. Use a "Relação de Códigos de Barra por Categoria" exportada do Petros.');
  return r;
}
