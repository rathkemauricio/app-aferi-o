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

/** Gera o PDF de um HTML: impressão no navegador, compartilhamento do arquivo no celular. */
export async function imprimirHtml(html: string, titulo: string, paisagem = false) {
  if (Platform.OS === 'web') {
    // expo-print chama window.print() na página atual na web e ignora `html`.
    // Use uma janela própria para imprimir somente o documento solicitado.
    const janela = window.open('', '_blank');
    if (!janela) throw new Error('Permita a abertura de janelas pop-up para imprimir.');
    janela.document.open();
    janela.document.write(html);
    janela.document.close();
    await new Promise<void>(resolve => {
      janela.requestAnimationFrame(() => janela.requestAnimationFrame(() => resolve()));
    });
    janela.document.title = titulo;
    janela.focus();
    janela.print();
    janela.close();
    return;
  }
  const file = await Print.printToFileAsync({ html, ...(paisagem ? { width: 842, height: 595 } : {}) });
  if (!(await Sharing.isAvailableAsync())) throw new Error('Este aparelho não oferece compartilhamento de arquivos.');
  await Sharing.shareAsync(file.uri, { mimeType: 'application/pdf', dialogTitle: titulo, UTI: 'com.adobe.pdf' });
}
