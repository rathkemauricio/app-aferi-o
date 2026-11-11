// Avisos por e-mail chamados pelo app (supabase.functions.invoke('notificar', { body })):
//
//   { acao: 'conta_pendente' }                       conta nova (já com e-mail confirmado) avisa os administradores; só uma vez por conta
//   { acao: 'conta_alterada', user_id }              administrador liberou ou bloqueou a conta → avisa o dono da conta
//   { acao: 'relatorio', para, titulo, html, pdf_base64?, nome_arquivo? }
//                                                    envia o relatório de aferição (PDF anexado; sem PDF, vai no corpo)
//
// Publicar: npx supabase functions deploy notificar --no-verify-jwt
// O JWT do usuário é conferido aqui dentro (as chaves novas do Supabase não são JWT, por isso --no-verify-jwt).
// Secret opcional: APP_URL (endereço do Postora na web) para os links dos avisos.
import { createClient, type User } from 'npm:@supabase/supabase-js@2.57.0';
import { EMAIL_RE, enviar, esc, layout } from '../_shared/mailer.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const APP_URL = (Deno.env.get('APP_URL') ?? '').replace(/\/$/, '');

// Mesmos ids e nomes de modules/registry.ts.
const MODULOS: Record<string, string> = { afericoes: 'Aferições', tempos: 'Tempos e Movimentos', croqui: 'Croqui' };

type Perfil = { user_id: string; email: string; nome: string | null; papel: 'admin' | 'usuario'; ativo: boolean; modulos: string[] | null };

async function perfilDe(userId: string) {
  const { data, error } = await admin.from('profiles').select('user_id,email,nome,papel,ativo,modulos').eq('user_id', userId).maybeSingle();
  if (error) throw new Error(`Falha ao ler o perfil: ${error.message}`);
  return data as Perfil | null;
}

const nomeDe = (p: Perfil) => p.nome?.trim() || p.email;

// ── Ações ────────────────────────────────────────────────────────────────────────────────────────

async function contaPendente(user: User, perfil: Perfil | null) {
  if (!perfil || perfil.ativo || perfil.papel === 'admin') return json(200, { ok: true, enviado: false });
  if (user.app_metadata?.aviso_admin_em) return json(200, { ok: true, enviado: false }); // já avisou

  const { data: admins, error } = await admin.from('profiles').select('email').eq('papel', 'admin').eq('ativo', true);
  if (error) throw new Error(`Falha ao listar administradores: ${error.message}`);
  const para = [...new Set((admins ?? []).map(a => String(a.email).toLowerCase()).filter(e => EMAIL_RE.test(e)))];
  if (!para.length) return json(200, { ok: true, enviado: false });

  await enviar({
    para,
    assunto: `Nova conta aguardando aprovação: ${perfil.email}`,
    html: layout({
      titulo: 'Nova conta aguardando aprovação',
      paragrafos: [
        `<b>${esc(nomeDe(perfil))}</b>${perfil.nome ? ` (${esc(perfil.email)})` : ''} criou uma conta no Postora e confirmou o e-mail.`,
        'A conta ainda não vê nenhum dado. Para liberar, abra o Postora em <b>Minha conta → Usuários e permissões</b> e escolha os módulos.',
      ],
      botao: APP_URL ? { texto: 'Abrir usuários e permissões', url: `${APP_URL}/usuarios` } : undefined,
      rodape: 'Você recebeu este aviso porque é administrador do Postora.',
    }),
  });

  await admin.auth.admin.updateUserById(user.id, {
    app_metadata: { ...user.app_metadata, aviso_admin_em: new Date().toISOString() },
  });
  return json(200, { ok: true, enviado: true });
}

async function contaAlterada(perfil: Perfil | null, body: Record<string, unknown>) {
  if (!perfil?.ativo || perfil.papel !== 'admin') return json(403, { erro: 'Somente o administrador pode enviar este aviso.' });
  const alvo = await perfilDe(String(body.user_id ?? ''));
  if (!alvo || !EMAIL_RE.test(alvo.email)) return json(404, { erro: 'Conta não encontrada.' });

  if (alvo.ativo) {
    const mods = alvo.papel === 'admin'
      ? ['todos os módulos (administrador)']
      : (alvo.modulos ?? []).map(m => MODULOS[m] ?? m);
    await enviar({
      para: alvo.email,
      assunto: 'Seu acesso ao Postora foi liberado',
      html: layout({
        titulo: 'Acesso liberado',
        paragrafos: [
          `Olá${alvo.nome ? `, ${esc(alvo.nome)}` : ''}! O administrador liberou a sua conta no Postora.`,
          mods.length
            ? `Módulos liberados: <b>${mods.map(esc).join(', ')}</b>.`
            : 'Ainda não há módulos liberados para a sua conta. Fale com o administrador.',
          'Abra o app e entre com o seu e-mail e senha.',
        ],
        botao: APP_URL ? { texto: 'Abrir o Postora', url: APP_URL } : undefined,
      }),
    });
  } else {
    await enviar({
      para: alvo.email,
      assunto: 'Seu acesso ao Postora foi bloqueado',
      html: layout({
        titulo: 'Acesso bloqueado',
        paragrafos: [
          'O administrador bloqueou o acesso da sua conta no Postora. Os registros que você fez continuam guardados.',
          'Se achar que isso foi um engano, fale com o administrador.',
        ],
      }),
    });
  }
  return json(200, { ok: true, enviado: true });
}

async function relatorio(user: User, perfil: Perfil | null, body: Record<string, unknown>) {
  const pode = perfil?.ativo && (perfil.papel === 'admin' || (perfil.modulos ?? []).includes('afericoes'));
  if (!pode) return json(403, { erro: 'Sua conta não tem acesso ao módulo Aferições.' });

  const para = Array.isArray(body.para)
    ? [...new Set(body.para.map(e => String(e).trim().toLowerCase()).filter(Boolean))]
    : [];
  if (!para.length || para.length > 10 || !para.every(e => EMAIL_RE.test(e))) {
    return json(400, { erro: 'Informe de 1 a 10 e-mails válidos.' });
  }
  const html = typeof body.html === 'string' ? body.html : '';
  if (!html || html.length > 2_000_000) return json(400, { erro: 'Relatório inválido.' });
  const pdf = typeof body.pdf_base64 === 'string' ? body.pdf_base64 : '';
  if (pdf.length > 12_000_000) return json(413, { erro: 'O PDF é grande demais para enviar por e-mail.' });

  const titulo = String(body.titulo ?? 'Relatório de aferição').replace(/\s+/g, ' ').trim().slice(0, 150) || 'Relatório de aferição';
  const arquivo = String(body.nome_arquivo ?? 'relatorio-afericao').replace(/[^\w.-]+/g, '-').slice(0, 80) || 'relatorio-afericao';
  const remetente = perfil!.nome?.trim() ? `${perfil!.nome.trim()} (${user.email})` : String(user.email);

  if (pdf) {
    await enviar({
      para,
      assunto: titulo,
      responderPara: user.email,
      html: layout({
        titulo,
        paragrafos: [`<b>${esc(remetente)}</b> enviou o relatório de aferição pelo Postora. O PDF está em anexo.`],
        rodape: 'Para responder, use “Responder”: a resposta vai direto para quem enviou o relatório.',
      }),
      anexos: [{ filename: `${arquivo}.pdf`, content: pdf, encoding: 'base64', contentType: 'application/pdf' }],
    });
  } else {
    // Sem PDF (versão web): o próprio relatório vai no corpo do e-mail, com uma faixa de identificação.
    const faixa = `<div style="font-family:Arial,sans-serif;font-size:13px;padding:10px 14px;margin-bottom:12px;background:#eef0ff;color:#3f37c9;border-radius:8px">Enviado por <b>${esc(remetente)}</b> pelo Postora.</div>`;
    const corpo = /<body[^>]*>/i.test(html) ? html.replace(/<body[^>]*>/i, m => m + faixa) : faixa + html;
    await enviar({ para, assunto: titulo, responderPara: user.email, html: corpo });
  }
  return json(200, { ok: true, enviado: true });
}

// ── Entrada ──────────────────────────────────────────────────────────────────────────────────────

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json(405, { erro: 'Método não permitido.' });

  const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const { data: auth, error: authErr } = await admin.auth.getUser(jwt);
  if (authErr || !auth?.user) return json(401, { erro: 'Sessão inválida. Entre novamente no app.' });
  const user = auth.user;

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body.acao !== 'string') return json(400, { erro: 'Pedido inválido.' });

  try {
    const perfil = await perfilDe(user.id);
    switch (body.acao) {
      case 'conta_pendente': return await contaPendente(user, perfil);
      case 'conta_alterada': return await contaAlterada(perfil, body);
      case 'relatorio': return await relatorio(user, perfil, body);
      default: return json(400, { erro: 'Ação desconhecida.' });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('notificar:', body.acao, message);
    return json(500, { erro: `Não foi possível enviar o e-mail: ${message}` });
  }
});
