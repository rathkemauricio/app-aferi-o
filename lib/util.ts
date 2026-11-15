import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';
import type { Filial } from './data';

/* ---------- Ligação de nomes antigos ao cadastro único de filiais ----------
   Os sistemas antigos identificam a unidade pelo número: "NEVOEIRO 01", "2 Pista (Santa Cruz)", "Filial 10".
   A filial correspondente é a que tem o mesmo número no código (ou, se o código não tiver número, no nome). */
export function numeroDe(texto: string | null | undefined): number | null {
  const m = String(texto ?? '').match(/\d+/);
  return m ? Number(m[0]) : null;
}

export function filialPorNumero(filiais: Filial[], n: number | null): Filial | undefined {
  if (n === null) return undefined;
  return filiais.find(f => numeroDe(f.codigo) === n) ?? filiais.find(f => !numeroDe(f.codigo) && numeroDe(f.nome) === n);
}

export const rotuloFilial = (f: Filial) => `${f.codigo} · ${f.nome}`;

/* ---------- Números e datas (pt-BR, sem depender do Intl do aparelho) ---------- */
export function fmtNum(v: number | null | undefined, casas = 2, minCasas = 0): string {
  const n = Number(v ?? 0);
  if (!Number.isFinite(n)) return '0';
  const neg = n < 0;
  let s = Math.abs(n).toFixed(casas);
  if (casas > minCasas) s = s.replace(new RegExp(`0{1,${casas - minCasas}}$`), '').replace(/\.$/, '');
  const [int, dec] = s.split('.');
  const milhar = int.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${neg ? '-' : ''}${milhar}${dec ? ',' + dec : ''}`;
}
export const fmtMoeda = (v: number | null | undefined) => `${Number(v ?? 0) < 0 ? '-' : ''}R$ ${fmtNum(Math.abs(Number(v ?? 0)), 2, 2)}`;

export const hojeISO = () => { const d = new Date(); return isoDe(d); };
export const isoDe = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const dataBR = (iso: string | null | undefined) => { const p = String(iso ?? '').slice(0, 10).split('-'); return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : ''; };
export const isoValida = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T12:00:00`));
/** Dias de hoje até a data (negativo = já passou). */
export function diasAte(iso: string | null | undefined): number | null {
  if (!iso || !isoValida(iso.slice(0, 10))) return null;
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  const hoje = new Date(); const a = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  return Math.round((new Date(y, m - 1, d).getTime() - a.getTime()) / 86_400_000);
}
export const esc = (v: unknown) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] ?? c));
export const uid = (p: string) => `${p}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

/* ---------- Impressão / PDF (o mesmo documento na web e no app) ----------
   Na web o expo-print chama window.print() na página atual e ignora o HTML; por isso a web imprime
   o relatório num iframe oculto. No app, o PDF sai sempre em A4 (retrato ou paisagem).
   Para a folha sair idêntica nos dois, todo HTML passa por `normalizarImpressao`:
   - página A4 com margem zero: o navegador não tem onde pôr o cabeçalho/rodapé dele (data, endereço, título);
   - a margem que o relatório pediu em @page vira espaçamento real, repetido em todas as páginas
     (laterais no conteúdo; topo e base em thead/tfoot, que o Chromium repete a cada folha — web e app);
   - cores de fundo sempre impressas (no navegador vêm desligadas por padrão). */
const A4 = { retrato: { width: 595, height: 842 }, paisagem: { width: 842, height: 595 } };

/** Margens do @page do relatório (forma abreviada do CSS: 1 a 4 valores). Sem @page: 10mm. */
function margensDoHtml(html: string) {
  const m = /@page\s*\{[^}]*?margin\s*:\s*([^;}]+)/i.exec(html);
  const v = (m?.[1] ?? '10mm').trim().split(/\s+/).slice(0, 4);
  const [t, r = t, b = t, l = r] = v;
  return { t, r, b, l };
}

export function normalizarImpressao(html: string, paisagem = false) {
  if (html.includes('data-impressao-normalizada')) return html;
  const { t, r, b, l } = margensDoHtml(html);
  const css = `<style data-impressao-normalizada>
@page{size:A4 ${paisagem ? 'landscape' : 'portrait'};margin:0}
html,body{margin:0!important;padding:0!important;background:#fff}
*{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}
table.__folha{width:100%!important;border-collapse:collapse!important;border:0!important;margin:0!important;font-size:inherit!important;background:none!important}
table.__folha>thead,table.__folha>tfoot,table.__folha>tbody,table.__folha>*>tr{background:none!important;border:0!important;break-inside:auto!important;page-break-inside:auto!important}
table.__folha>thead{display:table-header-group!important}table.__folha>tfoot{display:table-footer-group!important}
table.__folha>*>tr>td{border:0!important;padding:0!important;background:none!important;text-align:left!important;vertical-align:top!important;font:inherit!important;color:inherit!important}
table.__folha>tbody>tr>td>.__conteudo{padding:0 ${r} 0 ${l}}
</style>`;
  const abre = `<table class="__folha" role="presentation"><thead><tr><td style="height:${t}"></td></tr></thead><tfoot><tr><td style="height:${b}"></td></tr></tfoot><tbody><tr><td><div class="__conteudo">`;
  const fecha = '</div></td></tr></tbody></table>';
  let out = /<\/head>/i.test(html) ? html.replace(/<\/head>/i, `${css}</head>`) : `${css}${html}`;
  out = /<body[^>]*>/i.test(out) ? out.replace(/<body([^>]*)>/i, `<body$1>${abre}`) : `${abre}${out}`;
  out = /<\/body>/i.test(out) ? out.replace(/<\/body>/i, `${fecha}</body>`) : `${out}${fecha}`;
  return out;
}

function esperarImagens(doc: Document, limiteMs = 8000) {
  const pendentes = Array.from(doc.images).filter(img => !img.complete);
  if (!pendentes.length) return Promise.resolve();
  return Promise.race([
    Promise.all(pendentes.map(img => new Promise<void>(ok => { img.addEventListener('load', () => ok(), { once: true }); img.addEventListener('error', () => ok(), { once: true }); }))).then(() => undefined),
    new Promise<void>(ok => setTimeout(ok, limiteMs)),
  ]);
}

async function imprimirNaWeb(html: string, titulo: string, paisagem: boolean) {
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  // Largura de uma folha A4 (96 dpi), fora da tela: o layout antes de imprimir já é o da folha, como no app.
  frame.setAttribute('style', `position:fixed;left:-20000px;top:0;width:${paisagem ? 1123 : 794}px;height:${paisagem ? 794 : 1123}px;border:0;visibility:hidden`);
  document.body.appendChild(frame);
  const doc = frame.contentDocument;
  const win = frame.contentWindow;
  if (!doc || !win) { frame.remove(); throw new Error('O navegador não permitiu preparar a impressão.'); }
  doc.open(); doc.write(html); doc.close();
  doc.title = titulo;
  await new Promise<void>(ok => (doc.readyState === 'complete' ? ok() : win.addEventListener('load', () => ok(), { once: true })));
  await esperarImagens(doc);
  const remover = () => setTimeout(() => frame.remove(), 500);
  win.addEventListener('afterprint', remover, { once: true });
  setTimeout(() => frame.remove(), 120_000); // garantia, caso o navegador não avise o fim da impressão
  win.focus();
  win.print();
}

/** Imprime / gera o PDF de um HTML: diálogo de impressão no navegador, PDF A4 compartilhado no celular. */
export async function imprimirHtml(bruto: string, titulo: string, paisagem = false) {
  const html = normalizarImpressao(bruto, paisagem);
  if (Platform.OS === 'web') { await imprimirNaWeb(html, titulo, paisagem); return; }
  const file = await Print.printToFileAsync({ html, margins: { left: 0, right: 0, top: 0, bottom: 0 }, ...(paisagem ? A4.paisagem : A4.retrato) });
  if (!(await Sharing.isAvailableAsync())) throw new Error('O PDF foi gerado, mas este aparelho não oferece compartilhamento de arquivos.');
  await Sharing.shareAsync(file.uri, { mimeType: 'application/pdf', dialogTitle: titulo, UTI: 'com.adobe.pdf' });
}

/** PDF A4 em base64 (só no app; na web devolve undefined e o relatório vai no corpo do e-mail). */
export async function pdfBase64(html: string, paisagem = false): Promise<string | undefined> {
  if (Platform.OS === 'web') return undefined;
  return (await Print.printToFileAsync({ html: normalizarImpressao(html, paisagem), base64: true, margins: { left: 0, right: 0, top: 0, bottom: 0 }, ...(paisagem ? A4.paisagem : A4.retrato) })).base64;
}
