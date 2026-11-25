import { empresaAtual } from '../../lib/auth';
import { Platform } from 'react-native';
import { supabase } from '../../lib/supabase';
import { chamar } from './store';

// O PDF da relação de códigos de barra é pesado (milhares de páginas): no navegador é lido aqui mesmo e só o
// resultado vai ao servidor; no app, o servidor extrai os textos em lotes. A montagem dos itens fica em barrasLeitura.ts.
import { lerItensBarras, type Texto } from './barrasLeitura';
export { lerItensBarras, type ItemBarras, type Texto } from './barrasLeitura';

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
  // A 2ª pasta é a empresa: o servidor só deixa cada rede enviar, ler e apagar os PDFs dela.
  const empresa = empresaAtual();
  if (!empresa) throw new Error('Entre de novo no EasyAudit para importar o PDF.');
  const caminho = `${pasta}/${empresa}/${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}.pdf`;
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
