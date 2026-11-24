// Análises do site (Google Analytics 4) para dentro do EasyAudit — só o dono da plataforma.
//
//   { acao: 'resumo', dias: 7 | 30 | 90 }  →  { configurado, periodo, totais, anterior, porDia, paginas, canais, aparelhos,
//                                              cidades, eventos, agora }
//
// Secrets (o dono grava; a função só lê):
//   GA_PROPERTY_ID  número da propriedade GA4 (Administrador → Detalhes da propriedade), ex.: 412345678
//   GA_SA_JSON      chave JSON da conta de serviço do Google Cloud (o arquivo inteiro ou em base64), com a
//                   "Google Analytics Data API" ativada e o e-mail da conta adicionado como Leitor na propriedade.
// Publicar: npx supabase functions deploy analytics --no-verify-jwt
import { admin } from '../_shared/ator.ts';
import { contaDe, ehDono } from '../_shared/conta.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const PROPRIEDADE = (Deno.env.get('GA_PROPERTY_ID') ?? '').replace(/^properties\//, '').trim();
const BRUTO = (Deno.env.get('GA_SA_JSON') ?? '').trim();

type ContaServico = { client_email: string; private_key: string };
function contaServico(): ContaServico | null {
  if (!BRUTO) return null;
  try {
    const texto = BRUTO.startsWith('{') ? BRUTO : new TextDecoder().decode(Uint8Array.from(atob(BRUTO), c => c.charCodeAt(0)));
    const j = JSON.parse(texto);
    return j.client_email && j.private_key ? { client_email: j.client_email, private_key: j.private_key } : null;
  } catch { return null; }
}

/* ---------- Token OAuth da conta de serviço (JWT RS256 assinado aqui; vale 1 h, guardado em memória) ---------- */
let tokenCache: { valor: string; ate: number } | null = null;
const b64url = (b: ArrayBuffer | Uint8Array | string) => {
  const bytes = typeof b === 'string' ? new TextEncoder().encode(b) : b instanceof Uint8Array ? b : new Uint8Array(b);
  let s = ''; bytes.forEach(x => { s += String.fromCharCode(x); });
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
async function token(sa: ContaServico) {
  if (tokenCache && tokenCache.ate > Date.now() + 60_000) return tokenCache.valor;
  const agora = Math.floor(Date.now() / 1000);
  const cab = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const corpo = b64url(JSON.stringify({ iss: sa.client_email, scope: 'https://www.googleapis.com/auth/analytics.readonly', aud: 'https://oauth2.googleapis.com/token', iat: agora, exp: agora + 3600 }));
  const pem = sa.private_key.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
  const der = Uint8Array.from(atob(pem), c => c.charCodeAt(0));
  const chave = await crypto.subtle.importKey('pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const assinatura = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', chave, new TextEncoder().encode(`${cab}.${corpo}`));
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${cab}.${corpo}.${b64url(assinatura)}` }),
  });
  const j = await r.json().catch(() => null);
  if (!r.ok || !j?.access_token) throw new Error(`O Google recusou a chave da conta de serviço: ${j?.error_description ?? j?.error ?? `HTTP ${r.status}`}`);
  tokenCache = { valor: j.access_token, ate: Date.now() + (Number(j.expires_in) || 3600) * 1000 };
  return tokenCache.valor;
}

async function ga(caminho: string, corpo: unknown, sa: ContaServico) {
  const r = await fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${PROPRIEDADE}:${caminho}`, {
    method: 'POST', headers: { Authorization: `Bearer ${await token(sa)}`, 'Content-Type': 'application/json' }, body: JSON.stringify(corpo),
  });
  const j = await r.json().catch(() => null);
  if (!r.ok) {
    const msg = String(j?.error?.message ?? `HTTP ${r.status}`);
    if (r.status === 403) throw new Error(`Sem permissão na propriedade ${PROPRIEDADE}: adicione ${sa.client_email} como Leitor em Administrador → Gerenciamento de acesso da propriedade, e ative a Google Analytics Data API no Google Cloud. (${msg.slice(0, 160)})`);
    throw new Error(`Google Analytics: ${msg.slice(0, 300)}`);
  }
  return j;
}

type Linha = { dimensionValues?: { value: string }[]; metricValues?: { value: string }[] };
const linhas = (rel: { rows?: Linha[] } | undefined) => (rel?.rows ?? []).map(l => ({ d: (l.dimensionValues ?? []).map(x => x.value), m: (l.metricValues ?? []).map(x => Number(x.value) || 0) }));

async function resumo(dias: number, sa: ContaServico) {
  const atual = { startDate: `${dias - 1}daysAgo`, endDate: 'today' };
  const anterior = { startDate: `${2 * dias - 1}daysAgo`, endDate: `${dias}daysAgo` };
  const top = (dim: string, met: string, limit: number) => ({ dateRanges: [atual], dimensions: [{ name: dim }], metrics: [{ name: met }], orderBys: [{ metric: { metricName: met }, desc: true }], limit });
  const [lote, totais, agora] = await Promise.all([
    ga('batchRunReports', { requests: [
      { dateRanges: [atual], dimensions: [{ name: 'date' }], metrics: [{ name: 'activeUsers' }, { name: 'sessions' }, { name: 'screenPageViews' }], orderBys: [{ dimension: { dimensionName: 'date' } }], limit: 400 },
      { ...top('pagePath', 'screenPageViews', 10), metrics: [{ name: 'screenPageViews' }, { name: 'activeUsers' }] },
      top('sessionDefaultChannelGroup', 'sessions', 8),
      top('deviceCategory', 'activeUsers', 5),
      top('city', 'activeUsers', 10),
    ] }, sa),
    ga('runReport', {
      dateRanges: [atual, anterior],
      metrics: ['activeUsers', 'newUsers', 'sessions', 'screenPageViews', 'averageSessionDuration', 'engagementRate'].map(name => ({ name })),
    }, sa),
    ga('runRealtimeReport', { metrics: [{ name: 'activeUsers' }] }, sa).catch(() => null),
  ]);
  const eventos = await ga('runReport', { dateRanges: [atual], dimensions: [{ name: 'eventName' }], metrics: [{ name: 'eventCount' }], dimensionFilter: { filter: { fieldName: 'eventName', inListFilter: { values: ['sign_up', 'page_view'] } } } }, sa);
  const [porDia, paginas, canais, aparelhos, cidades] = (lote.reports ?? []).map(linhas);
  // runReport com 2 períodos: cada linha traz a dimensão "dateRange" (date_range_0 = atual, date_range_1 = anterior).
  const t = linhas(totais);
  const NOMES = ['visitantes', 'novos', 'sessoes', 'visualizacoes', 'duracaoMediaSeg', 'engajamento'];
  const periodo = (k: number) => { const l = t.find(x => x.d.includes(`date_range_${k}`)) ?? t[k]; return Object.fromEntries(NOMES.map((n, i) => [n, l?.m[i] ?? 0])); };
  const ev = Object.fromEntries(linhas(eventos).map(l => [l.d[0], l.m[0]]));
  return {
    configurado: true, dias,
    totais: periodo(0), anterior: periodo(1),
    porDia: (porDia ?? []).map(l => ({ data: `${l.d[0].slice(0, 4)}-${l.d[0].slice(4, 6)}-${l.d[0].slice(6, 8)}`, visitantes: l.m[0], sessoes: l.m[1], visualizacoes: l.m[2] })),
    paginas: (paginas ?? []).map(l => ({ pagina: l.d[0], visualizacoes: l.m[0], visitantes: l.m[1] })),
    canais: (canais ?? []).map(l => ({ canal: l.d[0], sessoes: l.m[0] })),
    aparelhos: (aparelhos ?? []).map(l => ({ aparelho: l.d[0], visitantes: l.m[0] })),
    cidades: (cidades ?? []).map(l => ({ cidade: l.d[0], visitantes: l.m[0] })),
    cadastros: ev.sign_up ?? 0,
    agora: agora ? linhas(agora)[0]?.m[0] ?? 0 : null,
  };
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json(405, { erro: 'Use POST.' });
  try {
    const conta = await contaDe(admin, req);
    if (!conta) return json(401, { erro: 'Sessão expirada. Entre de novo no EasyAudit.' });
    if (!ehDono(conta.user)) return json(403, { erro: 'Somente o dono do EasyAudit vê as análises do site.' });
    const sa = contaServico();
    const faltam = [...(!PROPRIEDADE ? ['GA_PROPERTY_ID'] : []), ...(!sa ? ['GA_SA_JSON'] : [])];
    if (faltam.length) return json(200, { configurado: false, faltam });
    const body = await req.json().catch(() => ({}));
    const dias = [7, 30, 90].includes(Number(body.dias)) ? Number(body.dias) : 30;
    return json(200, await resumo(dias, sa!));
  } catch (e) {
    console.error('analytics', e);
    return json(502, { erro: e instanceof Error ? e.message : 'Erro ao consultar o Google Analytics.' });
  }
});
