// Sincronização do módulo Agenda com o Google Agenda de cada usuário.
//
// Chamadas do app (supabase.functions.invoke('google-agenda', { body })), com o JWT do usuário:
//   { acao: 'status' }        → { conectado, email, sincronizado_em }
//   { acao: 'conectar' }      → { url } endereço de autorização do Google (abrir no navegador)
//   { acao: 'sincronizar' }   → envia ao Google os eventos pendentes e traz as mudanças feitas lá
//   { acao: 'desconectar' }   → revoga o acesso e apaga os tokens (os eventos continuam no app)
// Retorno do Google (GET ?code&state): troca o código pelos tokens e mostra a página "conectado".
//
// Publicar: npx supabase functions deploy google-agenda --no-verify-jwt
//   (o retorno do Google não traz JWT; nas outras ações o JWT é conferido aqui dentro)
// Secrets:  GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET (Google Cloud → APIs e serviços → Credenciais,
//           tipo "Aplicativo da Web", URI de redirecionamento = <SUPABASE_URL>/functions/v1/google-agenda)
//           APP_URL (opcional): para onde a página de retorno leva o usuário depois de conectar.
import { createClient } from 'npm:@supabase/supabase-js@2.57.0';
import { contaDe } from '../_shared/conta.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const SUPABASE_URL = (Deno.env.get('SUPABASE_URL') ?? '').replace(/\/$/, '');
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const CLIENT_ID = Deno.env.get('GOOGLE_CLIENT_ID') ?? '';
const CLIENT_SECRET = Deno.env.get('GOOGLE_CLIENT_SECRET') ?? '';
const APP_URL = (Deno.env.get('APP_URL') ?? '').replace(/\/$/, '');
const REDIRECT_URI = `${SUPABASE_URL}/functions/v1/google-agenda`;
const FUSO = 'America/Sao_Paulo';
const ESCOPOS = ['openid', 'email', 'https://www.googleapis.com/auth/calendar.events'];
const API = 'https://www.googleapis.com/calendar/v3';

const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

type Conexao = { user_id: string; email: string; refresh_token: string; access_token: string | null; expira_em: string | null; calendario: string; sync_token: string | null; sincronizado_em: string | null };
type Evento = {
  id: string; titulo: string; descricao: string; local: string; data: string; data_fim: string | null; hora_inicio: string | null; hora_fim: string | null;
  filial_id: string | null; origem: 'app' | 'google'; google_id: string | null; google_pendente: boolean; dono: string; deleted_at: string | null;
};
type GEvento = {
  id: string; status?: string; summary?: string; description?: string; location?: string;
  start?: { date?: string; dateTime?: string; timeZone?: string }; end?: { date?: string; dateTime?: string; timeZone?: string };
  extendedProperties?: { private?: Record<string, string> };
};

// ── Estado assinado (liga o retorno do Google ao usuário que pediu a conexão) ─────────────────────
const enc = new TextEncoder();
const b64url = (b: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
async function assinar(texto: string) {
  const chave = await crypto.subtle.importKey('raw', enc.encode(SERVICE_KEY), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64url(await crypto.subtle.sign('HMAC', chave, enc.encode(texto)));
}
async function criarEstado(userId: string) { const base = `${userId}.${Date.now()}`; return `${base}.${await assinar(base)}`; }
async function lerEstado(estado: string): Promise<string | null> {
  const [uid, ts, sig] = estado.split('.');
  if (!uid || !ts || !sig) return null;
  if (Date.now() - Number(ts) > 15 * 60_000) return null; // vale 15 minutos
  return (await assinar(`${uid}.${ts}`)) === sig ? uid : null;
}

// ── Tokens do Google ─────────────────────────────────────────────────────────────────────────────
async function trocarToken(params: Record<string, string>) {
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: CLIENT_ID, client_secret: CLIENT_SECRET, ...params }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error_description || j.error || 'O Google recusou a autorização.');
  return j as { access_token: string; expires_in: number; refresh_token?: string; id_token?: string };
}

async function acesso(c: Conexao): Promise<string> {
  if (c.access_token && c.expira_em && Date.parse(c.expira_em) > Date.now() + 60_000) return c.access_token;
  const t = await trocarToken({ grant_type: 'refresh_token', refresh_token: c.refresh_token });
  c.access_token = t.access_token;
  c.expira_em = new Date(Date.now() + t.expires_in * 1000).toISOString();
  await admin.from('agenda_google').update({ access_token: c.access_token, expira_em: c.expira_em }).eq('user_id', c.user_id);
  return c.access_token;
}

async function google(c: Conexao, caminho: string, init: RequestInit = {}) {
  const token = await acesso(c);
  return fetch(`${API}${caminho}`, { ...init, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) } });
}

// ── Conversão app ↔ Google (datas e horas sempre no fuso de São Paulo) ────────────────────────────
const somaDia = (iso: string, n: number) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const somaHora = (hhmm: string, min: number) => { const [h, m] = hhmm.split(':').map(Number); const t = Math.min(23 * 60 + 59, h * 60 + m + min); return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`; };

function paraGoogle(e: Evento) {
  const fim = e.data_fim && e.data_fim >= e.data ? e.data_fim : e.data;
  const corpo: Record<string, unknown> = {
    summary: e.titulo || '(sem título)', description: e.descricao || undefined, location: e.local || undefined,
    extendedProperties: { private: { postoraId: e.id } },
  };
  if (!e.hora_inicio) { corpo.start = { date: e.data }; corpo.end = { date: somaDia(fim, 1) }; }
  else {
    corpo.start = { dateTime: `${e.data}T${e.hora_inicio}:00`, timeZone: FUSO };
    corpo.end = { dateTime: `${fim}T${e.hora_fim && (fim > e.data || e.hora_fim > e.hora_inicio) ? e.hora_fim : somaHora(e.hora_inicio, 60)}:00`, timeZone: FUSO };
  }
  return corpo;
}

const fmtLocal = new Intl.DateTimeFormat('en-CA', { timeZone: FUSO, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
function local(dateTime: string) {
  const p = Object.fromEntries(fmtLocal.formatToParts(new Date(dateTime)).map(x => [x.type, x.value]));
  return { data: `${p.year}-${p.month}-${p.day}`, hora: `${p.hour}:${p.minute}` };
}

function doGoogle(g: GEvento, userId: string, id: string): Omit<Evento, 'deleted_at'> & { deleted_at: null } {
  let data = '', data_fim: string | null = null, hora_inicio: string | null = null, hora_fim: string | null = null;
  if (g.start?.date) {
    data = g.start.date;
    const ultimo = g.end?.date ? somaDia(g.end.date, -1) : data;
    data_fim = ultimo > data ? ultimo : null;
  } else if (g.start?.dateTime) {
    const i = local(g.start.dateTime), f = g.end?.dateTime ? local(g.end.dateTime) : i;
    data = i.data; hora_inicio = i.hora; hora_fim = f.hora; data_fim = f.data > i.data ? f.data : null;
  }
  return {
    id, titulo: g.summary ?? '', descricao: g.description ?? '', local: g.location ?? '', data, data_fim, hora_inicio, hora_fim,
    filial_id: null, origem: 'google', google_id: g.id, google_pendente: false, dono: userId, deleted_at: null,
  };
}

const mesmoConteudo = (a: Partial<Evento>, b: Partial<Evento>) =>
  (['titulo', 'descricao', 'local', 'data', 'data_fim', 'hora_inicio', 'hora_fim', 'google_id'] as const).every(k => (a[k] ?? null) === (b[k] ?? null)) && !a.deleted_at === !b.deleted_at;

// ── Ações ────────────────────────────────────────────────────────────────────────────────────────
async function conexaoDe(userId: string) {
  const { data, error } = await admin.from('agenda_google').select('*').eq('user_id', userId).maybeSingle();
  if (error) throw new Error(`Falha ao ler a conexão com o Google: ${error.message}`);
  return data as Conexao | null;
}

async function status(userId: string) {
  const c = await conexaoDe(userId);
  return json(200, { ok: true, configurado: !!(CLIENT_ID && CLIENT_SECRET), conectado: !!c, email: c?.email ?? null, sincronizado_em: c?.sincronizado_em ?? null });
}

async function conectar(userId: string) {
  if (!CLIENT_ID || !CLIENT_SECRET) return json(400, { erro: 'A integração com o Google ainda não foi configurada no servidor (GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET).' });
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.search = new URLSearchParams({
    client_id: CLIENT_ID, redirect_uri: REDIRECT_URI, response_type: 'code', scope: ESCOPOS.join(' '),
    access_type: 'offline', prompt: 'consent', include_granted_scopes: 'true', state: await criarEstado(userId),
  }).toString();
  return json(200, { ok: true, url: url.toString() });
}

/** Envia ao Google o que mudou no app e traz o que mudou no Google (leitura incremental por syncToken). */
async function sincronizar(userId: string, emp: string) {
  const c = await conexaoDe(userId);
  if (!c) return json(200, { ok: true, conectado: false });
  const cal = encodeURIComponent(c.calendario || 'primary');
  let enviados = 0, recebidos = 0;

  // 1) Pendentes do app → Google
  const { data: pend, error } = await admin.from('agenda_eventos').select('*').eq('dono', userId).eq('google_pendente', true).limit(200);
  if (error) throw new Error(`Falha ao ler os eventos: ${error.message}`);
  for (const e of (pend ?? []) as Evento[]) {
    if (e.deleted_at) {
      if (e.google_id) {
        const r = await google(c, `/calendars/${cal}/events/${encodeURIComponent(e.google_id)}`, { method: 'DELETE' });
        if (!r.ok && r.status !== 404 && r.status !== 410) continue; // tenta de novo na próxima
      }
      await admin.from('agenda_eventos').update({ google_pendente: false }).eq('id', e.id);
      enviados++;
      continue;
    }
    const corpo = JSON.stringify(paraGoogle(e));
    let r = e.google_id ? await google(c, `/calendars/${cal}/events/${encodeURIComponent(e.google_id)}`, { method: 'PATCH', body: corpo }) : null;
    if (!r || r.status === 404 || r.status === 410) r = await google(c, `/calendars/${cal}/events`, { method: 'POST', body: corpo });
    if (!r.ok) continue;
    const g = await r.json() as GEvento;
    await admin.from('agenda_eventos').update({ google_id: g.id, google_pendente: false }).eq('id', e.id);
    enviados++;
  }

  // 2) Mudanças no Google → app
  let syncToken = c.sync_token;
  let pageToken: string | undefined;
  let novoToken: string | null = null;
  for (let pagina = 0; pagina < 20; pagina++) {
    const q = new URLSearchParams({ singleEvents: 'true', showDeleted: 'true', maxResults: '250' });
    if (syncToken) q.set('syncToken', syncToken);
    else q.set('timeMin', new Date(Date.now() - 90 * 86_400_000).toISOString()); // primeira leitura: últimos 90 dias em diante
    if (pageToken) q.set('pageToken', pageToken);
    const r = await google(c, `/calendars/${cal}/events?${q}`);
    if (r.status === 410) { syncToken = null; pageToken = undefined; continue; } // token expirou: refaz a leitura completa
    if (!r.ok) throw new Error('O Google não respondeu à leitura da agenda. Tente de novo em instantes.');
    const j = await r.json() as { items?: GEvento[]; nextPageToken?: string; nextSyncToken?: string };
    const itens = j.items ?? [];
    if (itens.length) {
      const gids = itens.map(i => i.id);
      const { data: existentes } = await admin.from('agenda_eventos').select('*').eq('dono', userId).in('google_id', gids);
      const porGid = new Map(((existentes ?? []) as Evento[]).map(e => [e.google_id!, e]));
      for (const g of itens) {
        const atual = porGid.get(g.id);
        if (atual?.google_pendente) continue; // alteração local ainda não enviada vence
        if (g.status === 'cancelled') {
          if (atual && !atual.deleted_at) { await admin.from('agenda_eventos').update({ deleted_at: new Date().toISOString() }).eq('id', atual.id); recebidos++; }
          continue;
        }
        const id = atual?.id ?? g.extendedProperties?.private?.postoraId ?? `g-${g.id}`;
        const novo = doGoogle(g, userId, id);
        if (!novo.data) continue;
        if (atual && mesmoConteudo(atual, novo)) continue;
        // Evento novo vindo do Google entra na empresa de quem sincronizou (multiempresa).
        const linha = atual ? { ...novo, origem: atual.origem, filial_id: atual.filial_id } : { ...novo, empresa_id: emp };
        const { error: e2 } = await admin.from('agenda_eventos').upsert(linha, { onConflict: 'id' });
        if (!e2) recebidos++;
      }
    }
    if (j.nextPageToken) { pageToken = j.nextPageToken; continue; }
    novoToken = j.nextSyncToken ?? null;
    break;
  }
  const agora = new Date().toISOString();
  await admin.from('agenda_google').update({ sync_token: novoToken ?? syncToken, sincronizado_em: agora }).eq('user_id', userId);
  return json(200, { ok: true, conectado: true, email: c.email, enviados, recebidos, sincronizado_em: agora });
}

async function desconectar(userId: string) {
  const c = await conexaoDe(userId);
  if (c) {
    await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(c.refresh_token)}`, { method: 'POST' }).catch(() => undefined);
    await admin.from('agenda_google').delete().eq('user_id', userId);
    await admin.from('agenda_eventos').update({ google_pendente: false }).eq('dono', userId).eq('google_pendente', true);
  }
  return json(200, { ok: true, conectado: false });
}

// ── Retorno do Google ────────────────────────────────────────────────────────────────────────────
const pagina = (titulo: string, texto: string, ok: boolean) => new Response(
  `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${titulo}</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f5f6f8;font:16px/1.5 -apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#1b2230}
main{max-width:420px;margin:16px;padding:28px;background:#fff;border:1px solid #e3e6ec;border-radius:16px;text-align:center}
h1{font-size:20px;margin:0 0 8px;color:${ok ? '#16834a' : '#b42318'}}a{display:inline-block;margin-top:16px;padding:10px 18px;border-radius:10px;background:#4f46e5;color:#fff;text-decoration:none;font-weight:700}</style></head>
<body><main><h1>${titulo}</h1><p>${texto}</p>${APP_URL ? `<a href="${APP_URL}/agenda">Voltar ao EasyAudit</a>` : '<p>Pode fechar esta janela e voltar ao EasyAudit.</p>'}</main></body></html>`,
  { status: ok ? 200 : 400, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
);

async function retornoGoogle(url: URL) {
  if (url.searchParams.get('error')) return pagina('Conexão cancelada', 'A permissão do Google Agenda não foi concedida.', false);
  const userId = await lerEstado(url.searchParams.get('state') ?? '');
  const code = url.searchParams.get('code');
  if (!userId || !code) return pagina('Link expirado', 'Volte ao EasyAudit e toque em "Conectar Google Agenda" de novo.', false);
  try {
    const t = await trocarToken({ grant_type: 'authorization_code', code, redirect_uri: REDIRECT_URI });
    let email = '';
    if (t.id_token) { try { email = JSON.parse(atob(t.id_token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).email ?? ''; } catch { /* sem e-mail */ } }
    const antiga = await conexaoDe(userId);
    const refresh = t.refresh_token ?? antiga?.refresh_token;
    if (!refresh) return pagina('Não foi possível conectar', 'O Google não liberou o acesso contínuo. Remova o EasyAudit em myaccount.google.com/permissions e conecte de novo.', false);
    const { error } = await admin.from('agenda_google').upsert({
      user_id: userId, email, refresh_token: refresh, access_token: t.access_token,
      expira_em: new Date(Date.now() + t.expires_in * 1000).toISOString(), sync_token: null,
    }, { onConflict: 'user_id' });
    if (error) throw new Error(error.message);
    // Tudo o que já existe no app vai para o Google na primeira sincronização.
    await admin.from('agenda_eventos').update({ google_pendente: true }).eq('dono', userId).is('google_id', null).is('deleted_at', null);
    return pagina('Google Agenda conectado', `${email ? `A conta <b>${email.replace(/[<>&"]/g, '')}</b> está ligada à sua agenda.` : 'Sua conta Google está ligada à agenda.'} Os eventos começam a sincronizar quando você voltar ao app.`, true);
  } catch (e) {
    return pagina('Não foi possível conectar', e instanceof Error ? e.message : 'Tente de novo.', false);
  }
}

// ── Entrada ──────────────────────────────────────────────────────────────────────────────────────
Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const url = new URL(req.url);
  if (req.method === 'GET') return retornoGoogle(url);
  try {
    const conta = await contaDe(admin, req);
    if (!conta) return json(401, { erro: 'Sessão expirada. Entre de novo no EasyAudit.' });
    if (!conta.libera('agenda') || !conta.empresa) return json(403, { erro: 'O módulo Agenda não está liberado para esta conta.' });
    const u = { user: conta.user };
    const { acao } = await req.json().catch(() => ({ acao: '' }));
    switch (acao) {
      case 'status': return await status(u.user.id);
      case 'conectar': return await conectar(u.user.id);
      case 'sincronizar': return await sincronizar(u.user.id, conta.empresa.id);
      case 'desconectar': return await desconectar(u.user.id);
      default: return json(400, { erro: 'Ação desconhecida.' });
    }
  } catch (e) {
    return json(500, { erro: e instanceof Error ? e.message : 'Erro inesperado no servidor.' });
  }
});
