// E-mails de acesso do EasyAudit, no layout da marca e com os links sempre no endereço da web (APP_URL):
// os modelos padrão do Supabase voltavam para o endereço de quem pediu (localhost no computador, esquema do app
// no celular) e o link não abria para os outros.
//
// Chamada pública (sem login), supabase.functions.invoke('acesso', { body }):
//   { acao: 'recuperar', email }                  link para criar uma nova senha → { ok }
//   { acao: 'cadastrar', email, senha, dados? }   cria a conta (sem confirmar) e envia o link de confirmação → { ok }
//        dados = user_metadata (ex.: { nome, empresa_pendente }), como no signUp
//   { acao: 'confirmar', email }                  envia de novo o link de confirmação do cadastro → { ok }
//
// Respostas iguais exista ou não a conta (não revela quem tem cadastro). O mesmo e-mail só recebe outro link do
// mesmo tipo depois de 1 minuto (tabela envios_acesso).
//
// Publicar: npx supabase functions deploy acesso --no-verify-jwt
import { createClient } from 'npm:@supabase/supabase-js@2.57.0';
import { APP_URL, EMAIL_RE, enviar, esc, layout } from '../_shared/mailer.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false, autoRefreshToken: false } });
const SITE = APP_URL.replace(/^https?:\/\//, '');
const linkSite = (caminho = '') => `<a href="${APP_URL}${caminho}" style="color:#0f1f3d;font-weight:700">${esc(SITE)}${esc(caminho)}</a>`;

/* ---------- Proteção contra abuso (função pública) ---------- */
/** IP de quem chamou (o primeiro do x-forwarded-for, que o Supabase preenche). */
const ipDe = (req: Request) => (req.headers.get('x-forwarded-for') ?? req.headers.get('cf-connecting-ip') ?? '').split(',')[0].trim() || 'sem-ip';
/** Conta o uso da chave na janela (contador no banco) e diz se ainda está dentro do limite. Se o contador falhar, deixa passar. */
async function dentroDoLimite(chave: string, max: number, minutos: number) {
  const { data, error } = await admin.rpc('contar_uso', { p_chave: chave, p_minutos: minutos, p_inc: 1 });
  if (error) { console.error('acesso: limite', error.message); return true; }
  return Number(data) <= max;
}
const muitoUso = () => json(429, { erro: 'Muitas tentativas a partir desta conexão. Aguarde alguns minutos e tente de novo.' });

/** Mesmas regras da tela de cadastro (components/AuthScreen.tsx, PASSWORD_RULES): o servidor confere também. */
const senhaForte = (s: string) => s.length >= 8 && s.length <= 72 && /[A-Z]/.test(s) && /[a-z]/.test(s) && /\d/.test(s) && /[^A-Za-z0-9]/.test(s) && !/\s/.test(s);

/** Dados guardados na conta no cadastro: só os campos que o app usa, com tamanho limitado. */
function dadosDoCadastro(v: unknown): Record<string, unknown> {
  const d = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
  const txt = (x: unknown, max: number) => String(x ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
  const out: Record<string, unknown> = {};
  if (txt(d.nome, 80)) out.nome = txt(d.nome, 80);
  const e = d.empresa_pendente && typeof d.empresa_pendente === 'object' ? d.empresa_pendente as Record<string, unknown> : null;
  if (e && txt(e.nome, 120)) out.empresa_pendente = { nome: txt(e.nome, 120), documento: txt(e.documento, 30), telefone: txt(e.telefone, 30) };
  return out;
}

/** true se pode enviar agora (e marca o envio); false se já enviou este tipo para o e-mail há menos de 1 minuto. */
async function podeEnviar(email: string, tipo: string) {
  const { data } = await admin.from('envios_acesso').select('enviado_em').eq('email', email).eq('tipo', tipo).maybeSingle();
  if (data && Date.now() - new Date(data.enviado_em).getTime() < 60_000) return false;
  await admin.from('envios_acesso').upsert({ email, tipo, enviado_em: new Date().toISOString() });
  return true;
}

type Conta = { id: string; confirmada: boolean; nome: string };
async function contaDoEmail(email: string): Promise<Conta | null> {
  const { data: p } = await admin.from('profiles').select('user_id,nome').eq('email', email).maybeSingle();
  if (!p) return null;
  const { data } = await admin.auth.admin.getUserById(p.user_id);
  if (!data.user) return null;
  return { id: data.user.id, confirmada: !!data.user.email_confirmed_at, nome: String(p.nome ?? data.user.user_metadata?.nome ?? '') };
}
const ola = (nome: string) => `Olá${nome ? `, ${esc(nome.split(' ')[0])}` : ''}!`;

async function emailRecuperar(email: string, nome: string, link: string) {
  await enviar({
    para: email,
    assunto: 'Crie uma nova senha · EasyAudit',
    html: layout({
      etiqueta: 'Recuperar acesso',
      titulo: 'Vamos criar uma nova senha',
      paragrafos: [`${ola(nome)} Recebemos um pedido para trocar a senha da sua conta no EasyAudit. Toque no botão e escolha a nova senha.`],
      destaques: [{ rotulo: 'Conta', valor: email }],
      botao: { texto: 'Criar nova senha', url: link },
      passos: [
        'Toque no botão abaixo. A página de nova senha abre no navegador.',
        'Crie a nova senha e confirme.',
        `Depois, entre no app do celular ou em ${linkSite('/login')} com a nova senha.`,
      ],
      rodape: 'O link vale por pouco tempo e só pode ser usado uma vez. Se você não pediu a troca de senha, ignore este e-mail: a sua senha continua a mesma.',
    }),
  });
}

async function emailConfirmar(email: string, nome: string, link: string) {
  await enviar({
    para: email,
    assunto: 'Confirme o seu e-mail · EasyAudit',
    html: layout({
      etiqueta: 'Confirmação de cadastro',
      titulo: 'Falta só confirmar o seu e-mail',
      paragrafos: [`${ola(nome)} A sua conta no EasyAudit foi criada. Confirme o e-mail para entrar.`],
      destaques: [{ rotulo: 'Conta', valor: email }],
      botao: { texto: 'Confirmar meu e-mail', url: link },
      passos: [
        'Toque no botão abaixo para confirmar.',
        `Entre no app do celular ou em ${linkSite('/login')} com o seu e-mail e a senha que você criou.`,
        'Para ver os dados da sua empresa, a conta precisa do convite do administrador (ou cadastre a sua empresa ao entrar).',
      ],
      rodape: 'O link vale por pouco tempo. Se você não criou esta conta, ignore este e-mail.',
    }),
  });
}

/** Cadastro com um e-mail que já tem conta confirmada: avisa o dono do e-mail em vez de revelar na tela. */
async function emailJaTemConta(email: string, nome: string) {
  await enviar({
    para: email,
    assunto: 'Você já tem uma conta no EasyAudit',
    html: layout({
      etiqueta: 'Aviso',
      titulo: 'Você já tem uma conta',
      paragrafos: [`${ola(nome)} Alguém tentou criar uma conta no EasyAudit com este e-mail, mas ele já está cadastrado.`],
      passos: [
        `Para entrar, use ${linkSite('/login')} ou o app do celular.`,
        'Se esqueceu a senha, toque em "Esqueci a senha" na tela de entrada.',
      ],
      botao: { texto: 'Entrar no EasyAudit', url: `${APP_URL}/login` },
      rodape: 'Se não foi você, pode ignorar este e-mail: nada muda na sua conta.',
    }),
  });
}

async function recuperar(email: string) {
  const conta = await contaDoEmail(email);
  if (!conta || !(await podeEnviar(email, 'recuperar'))) return json(200, { ok: true });
  const { data, error } = await admin.auth.admin.generateLink({ type: 'recovery', email, options: { redirectTo: `${APP_URL}/redefinir-senha` } });
  if (error || !data.properties?.action_link) throw new Error(error?.message || 'Falha ao gerar o link.');
  await emailRecuperar(email, conta.nome, data.properties.action_link);
  return json(200, { ok: true });
}

/** Link que confirma o e-mail de uma conta que ainda não confirmou (o link de acesso também confirma). */
async function linkConfirmacao(email: string) {
  const { data, error } = await admin.auth.admin.generateLink({ type: 'magiclink', email, options: { redirectTo: `${APP_URL}/login?confirmado=1` } });
  if (error || !data.properties?.action_link) throw new Error(error?.message || 'Falha ao gerar o link.');
  return data.properties.action_link;
}

async function confirmar(email: string) {
  const conta = await contaDoEmail(email);
  if (!conta || conta.confirmada || !(await podeEnviar(email, 'confirmar'))) return json(200, { ok: true });
  await emailConfirmar(email, conta.nome, await linkConfirmacao(email));
  return json(200, { ok: true });
}

async function cadastrar(email: string, senha: string, dados: Record<string, unknown>) {
  if (!senhaForte(senha)) return json(400, { erro: 'A senha precisa ter de 8 a 72 caracteres, com letra maiúscula, letra minúscula, número e caractere especial, sem espaços.' });
  const nome = String(dados.nome ?? '').slice(0, 80);
  const existente = await contaDoEmail(email);
  if (existente) {
    // Mesma resposta de uma conta nova (não revela quem tem cadastro); o dono do e-mail recebe o aviso certo.
    if (await podeEnviar(email, 'cadastrar')) {
      if (existente.confirmada) await emailJaTemConta(email, existente.nome);
      else await emailConfirmar(email, existente.nome, await linkConfirmacao(email));
    }
    return json(200, { ok: true });
  }
  if (!(await podeEnviar(email, 'cadastrar'))) return json(429, { erro: 'Aguarde 1 minuto antes de tentar de novo.' });
  const { data, error } = await admin.auth.admin.generateLink({ type: 'signup', email, password: senha, options: { data: dados, redirectTo: `${APP_URL}/login?confirmado=1` } });
  if (error || !data.properties?.action_link) {
    const m = error?.message ?? '';
    if (/password/i.test(m)) return json(400, { erro: `Senha recusada: ${m}` });
    if (/already|registered|exists/i.test(m)) return json(200, { ok: true });
    throw new Error(m || 'Falha ao criar a conta.');
  }
  await emailConfirmar(email, nome, data.properties.action_link);
  return json(200, { ok: true });
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    if (req.method !== 'POST') return json(405, { erro: 'Método não permitido.' });
    const body = await req.json().catch(() => ({}));
    const email = String(body.email ?? '').trim().toLowerCase();
    if (email.length > 254 || !EMAIL_RE.test(email)) return json(400, { erro: 'Informe um e-mail válido.' });
    // Limite por conexão: 20 pedidos por hora no total e 5 cadastros por hora (contra criação de contas em massa e
    // envio de e-mails em série para endereços de terceiros).
    const ip = ipDe(req);
    if (!(await dentroDoLimite(`acesso:${ip}`, 20, 60))) return muitoUso();
    if (body.acao === 'cadastrar' && !(await dentroDoLimite(`acesso-cadastro:${ip}`, 5, 60))) return muitoUso();
    switch (body.acao) {
      case 'recuperar': return await recuperar(email);
      case 'confirmar': return await confirmar(email);
      case 'cadastrar': return await cadastrar(email, String(body.senha ?? ''), dadosDoCadastro(body.dados));
      default: return json(400, { erro: 'Ação desconhecida.' });
    }
  } catch (e) {
    // Detalhe técnico só no registro do servidor; quem chamou recebe uma mensagem genérica.
    console.error('acesso', e);
    return json(500, { erro: 'Não foi possível concluir agora. Tente de novo em instantes.' });
  }
});
