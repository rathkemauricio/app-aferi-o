import { Platform } from 'react-native';

/**
 * Google Analytics 4 no SITE público (início, como funciona, cadastro e login). A área logada não é medida (não manda
 * dados de clientes ao Google). Só carrega depois que o visitante aceita os cookies de análise (LGPD).
 * Os números voltam para o EasyAudit pela função `analytics` (tela Análises do site, só o dono da plataforma).
 *
 * Código de medição (G-XXXXXXX, é público): variável EXPO_PUBLIC_GA_ID no build (Vercel) ou a constante abaixo.
 */
const GA_ID_FIXO = '';
export const GA_ID = (process.env.EXPO_PUBLIC_GA_ID || GA_ID_FIXO).trim();

/** Páginas medidas (o site); qualquer outra rota é da área logada. */
export const PAGINAS_DO_SITE = ['/inicio', '/como-funciona', '/comecar', '/login'];
export const ehPaginaDoSite = (rota: string) => PAGINAS_DO_SITE.includes(rota.split('?')[0]);

export type Consentimento = 'aceito' | 'recusado' | null;
const CHAVE = 'easyaudit.cookies-analise.v1';
type JanelaComGtag = Window & { dataLayer?: unknown[]; gtag?: (...args: unknown[]) => void };
const naWeb = () => Platform.OS === 'web' && typeof window !== 'undefined' && !!GA_ID;

export function consentimento(): Consentimento {
  if (!naWeb()) return null;
  try { const v = window.localStorage.getItem(CHAVE); return v === 'aceito' || v === 'recusado' ? v : null; } catch { return null; }
}

let carregado = false;
function carregar() {
  if (!naWeb() || carregado) return;
  carregado = true;
  const w = window as JanelaComGtag;
  w.dataLayer = w.dataLayer || [];
  // eslint-disable-next-line prefer-rest-params
  w.gtag = function gtag() { (w.dataLayer as unknown[]).push(arguments); };
  // Só análise; nada de anúncios. IP anonimizado; page_view manual (o site é uma SPA).
  w.gtag('consent', 'default', { analytics_storage: 'granted', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' });
  w.gtag('js', new Date());
  w.gtag('config', GA_ID, { send_page_view: false, anonymize_ip: true });
  const s = document.createElement('script');
  s.async = true;
  s.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(GA_ID)}`;
  document.head.appendChild(s);
}

/** Grava a escolha do visitante; aceitando, carrega o GA na hora. */
export function definirConsentimento(v: Exclude<Consentimento, null>) {
  if (!naWeb()) return;
  try { window.localStorage.setItem(CHAVE, v); } catch { /* sem armazenamento: vale só nesta visita */ }
  if (v === 'aceito') carregar();
  else (window as JanelaComGtag).gtag?.('consent', 'update', { analytics_storage: 'denied' });
}

/** Visita a uma página do site (só se o visitante aceitou). */
export function registrarPagina(rota: string, titulo?: string) {
  if (!naWeb() || consentimento() !== 'aceito') return;
  carregar();
  (window as JanelaComGtag).gtag?.('event', 'page_view', { page_path: rota, page_location: `${window.location.origin}${rota}`, page_title: titulo ?? document.title });
}

/** Evento do site (ex.: sign_up quando a rede é cadastrada). */
export function eventoDoSite(nome: string, params: Record<string, string | number> = {}) {
  if (!naWeb() || consentimento() !== 'aceito') return;
  carregar();
  (window as JanelaComGtag).gtag?.('event', nome, params);
}
