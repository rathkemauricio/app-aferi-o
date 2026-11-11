// Send Email Hook do Supabase Auth: todos os e-mails de login (confirmação de cadastro, redefinição de
// senha, troca de e-mail, convite, link mágico, códigos e avisos de segurança) saem por aqui, via Nodemailer.
//
// Publicar:  npx supabase functions deploy send-email --no-verify-jwt
// Ativar:    painel do Supabase → Authentication → Hooks → Send Email → HTTPS → URL desta função.
// Secret:    SEND_EMAIL_HOOK_SECRET = valor "v1,whsec_..." gerado nessa mesma tela.
import { Webhook } from 'https://esm.sh/standardwebhooks@1.0.0';
import { enviar, esc, layout } from '../_shared/mailer.ts';

type HookPayload = {
  user: { id: string; email: string; new_email?: string; user_metadata?: Record<string, unknown> };
  email_data: {
    token: string;
    token_hash: string;
    redirect_to: string;
    email_action_type: string;
    site_url: string;
    token_new: string;
    token_hash_new: string;
    old_email?: string;
  };
};

const SUPABASE_URL = (Deno.env.get('SUPABASE_URL') ?? '').replace(/\/$/, '');
const HOOK_SECRET = (Deno.env.get('SEND_EMAIL_HOOK_SECRET') ?? '').replace('v1,whsec_', '');

// O Supabase Auth dá ao hook HTTP 5 segundos no total, já contando as novas tentativas. Conectar e enviar
// pelo Gmail leva 1–3 s, então a função responde na hora e envia em segundo plano (EdgeRuntime.waitUntil).
// Falhas de envio aparecem em Edge Functions → send-email → Logs.
declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void } | undefined;

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

/** Link de verificação do Supabase Auth (confirma e redireciona para o app). */
function linkVerificacao(tokenHash: string, tipo: string, redirectTo: string, siteUrl: string) {
  const p = new URLSearchParams({ token: tokenHash, type: tipo });
  const destino = redirectTo || siteUrl;
  if (destino) p.set('redirect_to', destino);
  return `${SUPABASE_URL}/auth/v1/verify?${p}`;
}

type Envio = { para: string; assunto: string; html: string };

function montar(payload: HookPayload): Envio[] {
  const { user, email_data: d } = payload;
  const tipo = d.email_action_type;
  const link = (hash: string, t = tipo) => linkVerificacao(hash, t, d.redirect_to, d.site_url);
  const email = user.email;
  // Link que volta para o app instalado (postora://, exp://): só abre no celular.
  const destino = d.redirect_to || d.site_url;
  const dicaApp = destino && !/^https?:\/\//i.test(destino)
    ? ['<i>Abra este e-mail no celular em que o Postora está instalado: o botão abre o app direto na tela certa.</i>']
    : [];

  switch (tipo) {
    case 'signup':
      return [{
        para: email,
        assunto: 'Confirme seu e-mail no Postora',
        html: layout({
          titulo: 'Confirme seu e-mail',
          paragrafos: [
            'Você criou uma conta no Postora com este endereço. Confirme o e-mail para continuar.',
            'Depois da confirmação, o administrador precisa liberar o seu acesso e escolher os módulos que você vai usar.',
            ...dicaApp,
          ],
          botao: { texto: 'Confirmar e-mail', url: link(d.token_hash) },
          rodape: 'Se você não criou uma conta no Postora, ignore este e-mail.',
        }),
      }];

    case 'recovery':
      return [{
        para: email,
        assunto: 'Redefinir sua senha do Postora',
        html: layout({
          titulo: 'Redefinir senha',
          paragrafos: ['Recebemos um pedido para redefinir a senha da sua conta no Postora. Toque no botão para criar uma nova senha.', ...dicaApp],
          botao: { texto: 'Criar nova senha', url: link(d.token_hash) },
          rodape: 'Se você não pediu a redefinição, ignore este e-mail: sua senha continua a mesma.',
        }),
      }];

    case 'invite':
      return [{
        para: email,
        assunto: 'Você foi convidado para o Postora',
        html: layout({
          titulo: 'Convite para o Postora',
          paragrafos: ['Você recebeu um convite para usar o Postora. Aceite pelo botão abaixo e defina sua senha.', ...dicaApp],
          botao: { texto: 'Aceitar convite', url: link(d.token_hash) },
        }),
      }];

    case 'magiclink':
      return [{
        para: email,
        assunto: 'Seu link de acesso ao Postora',
        html: layout({
          titulo: 'Entrar no Postora',
          paragrafos: ['Use o botão abaixo para entrar na sua conta. O link vale por pouco tempo e só pode ser usado uma vez.', ...dicaApp],
          botao: { texto: 'Entrar no Postora', url: link(d.token_hash) },
        }),
      }];

    case 'email':
      return [{
        para: email,
        assunto: 'Seu código de acesso ao Postora',
        html: layout({
          titulo: 'Código de acesso',
          paragrafos: ['Use este código para entrar no Postora:'],
          codigo: d.token,
          botao: d.token_hash ? { texto: 'Entrar no Postora', url: link(d.token_hash) } : undefined,
        }),
      }];

    case 'reauthentication':
      return [{
        para: email,
        assunto: 'Código de confirmação do Postora',
        html: layout({
          titulo: 'Confirme que é você',
          paragrafos: ['Use este código para confirmar a alteração na sua conta:'],
          codigo: d.token,
        }),
      }];

    case 'email_change': {
      const novo = user.new_email || email;
      const envios: Envio[] = [];
      // Com "Secure email change" ligado chegam dois tokens. Os nomes vêm invertidos por compatibilidade:
      // e-mail atual → token_hash_new; e-mail novo → token_hash.
      if (d.token_hash_new && email && email !== novo) {
        envios.push({
          para: email,
          assunto: 'Confirme a troca de e-mail no Postora',
          html: layout({
            titulo: 'Confirme a troca de e-mail',
            paragrafos: [`Foi pedida a troca do e-mail da sua conta no Postora para <b>${esc(novo)}</b>. Confirme pelo botão abaixo.`, ...dicaApp],
            botao: { texto: 'Confirmar troca', url: link(d.token_hash_new) },
            rodape: 'Se você não pediu esta troca, não confirme e altere a sua senha.',
          }),
        });
      }
      envios.push({
        para: novo,
        assunto: 'Confirme seu novo e-mail no Postora',
        html: layout({
          titulo: 'Confirme seu novo e-mail',
          paragrafos: [`Este endereço foi informado como o novo e-mail da conta${email && email !== novo ? ` <b>${esc(email)}</b>` : ''} no Postora. Confirme pelo botão abaixo.`, ...dicaApp],
          botao: { texto: 'Confirmar novo e-mail', url: link(d.token_hash) },
        }),
      });
      return envios;
    }

    case 'password_changed_notification':
      return [aviso(email, 'Sua senha do Postora foi alterada', 'Senha alterada', 'A senha da sua conta no Postora acabou de ser alterada.')];
    case 'email_changed_notification':
      return [aviso(d.old_email || email, 'O e-mail da sua conta no Postora foi alterado', 'E-mail alterado',
        `O e-mail da sua conta no Postora foi alterado${user.email ? ` para <b>${esc(user.email)}</b>` : ''}.`)];
    case 'phone_changed_notification':
      return [aviso(email, 'O telefone da sua conta no Postora foi alterado', 'Telefone alterado', 'O telefone da sua conta no Postora foi alterado.')];
    case 'identity_linked_notification':
    case 'identity_unlinked_notification':
      return [aviso(email, 'Forma de login alterada no Postora', 'Forma de login alterada', 'Uma forma de login foi vinculada ou desvinculada da sua conta no Postora.')];
    case 'mfa_factor_enrolled_notification':
    case 'mfa_factor_unenrolled_notification':
      return [aviso(email, 'Verificação em duas etapas alterada no Postora', 'Verificação em duas etapas', 'A verificação em duas etapas da sua conta no Postora foi alterada.')];

    default:
      // Tipo novo/desconhecido: envia um e-mail genérico com link (se houver) para não travar o login.
      return [{
        para: email,
        assunto: 'Ação na sua conta do Postora',
        html: layout({
          titulo: 'Ação na sua conta',
          paragrafos: ['Recebemos uma solicitação para a sua conta no Postora.'],
          codigo: d.token_hash ? undefined : d.token || undefined,
          botao: d.token_hash ? { texto: 'Continuar', url: link(d.token_hash) } : undefined,
        }),
      }];
  }
}

function aviso(para: string, assunto: string, titulo: string, texto: string): Envio {
  return {
    para,
    assunto,
    html: layout({ titulo, paragrafos: [texto], rodape: 'Se não foi você, altere sua senha imediatamente e fale com o administrador do Postora.' }),
  };
}

Deno.serve(async req => {
  if (req.method !== 'POST') return json(405, { error: { http_code: 405, message: 'Método não permitido.' } });

  const corpo = await req.text();
  let payload: HookPayload;
  try {
    payload = new Webhook(HOOK_SECRET).verify(corpo, Object.fromEntries(req.headers)) as HookPayload;
  } catch {
    return json(401, { error: { http_code: 401, message: 'Assinatura do hook inválida (confira SEND_EMAIL_HOOK_SECRET).' } });
  }

  const tipo = payload.email_data?.email_action_type;
  const falha = (err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    console.error('send-email: falha ao enviar', tipo, message);
    return message;
  };

  let envios: Envio[];
  try {
    envios = montar(payload).filter(x => x.para);
  } catch (err) {
    return json(500, { error: { http_code: 500, message: `E-mail não montado: ${falha(err)}` } });
  }
  const envio = (async () => { for (const e of envios) await enviar(e); })();

  if (typeof EdgeRuntime !== 'undefined') {
    EdgeRuntime.waitUntil(envio.then(() => console.log('send-email: enviado', tipo, envios.length), falha));
    return json(200, {});
  }
  // Fora do Supabase (testes locais): espera o envio e informa a falha.
  try {
    await envio;
    return json(200, {});
  } catch (err) {
    return json(500, { error: { http_code: 500, message: `Não foi possível enviar o e-mail: ${falha(err)}` } });
  }
});
