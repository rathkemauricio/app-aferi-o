// Contas da empresa, pelo administrador da empresa (tela "Usuários e permissões").
//
// Chamada do app (supabase.functions.invoke('usuarios', { body })), com o JWT de quem está logado:
//   { acao: 'convidar', email, nome, papel: 'usuario'|'admin', modulos: string[] }
//        convida por e-mail para a empresa de quem chamou: a pessoa recebe o link, cria a própria senha e entra
//        já com o papel e os módulos escolhidos. Conta que já existe sem empresa é ligada à empresa. → { ok, user_id }
//   { acao: 'reenviar', user_id }      envia de novo o link de acesso (convite não aceito ou senha esquecida) → { ok }
//   { acao: 'criar', email, nome, senha, papel, modulos }   (antigo) cria a conta com senha inicial → { ok, user_id }
//   { acao: 'editar', user_id, nome?, email?, senha? }      altera nome, e-mail e/ou senha de uma conta da empresa → { ok }
//   { acao: 'status', user_id, ativo }                      inativa ou reativa uma conta da empresa → { ok }
//
// Regras: só administrador ativo de empresa ativa; só contas da própria empresa; módulos limitados aos do plano;
// contas ativas limitadas ao plano (o banco também confere, pelo gatilho profiles_limite_contas).
//
// Publicar: npx supabase functions deploy usuarios --no-verify-jwt
// Secret opcional: APP_URL (endereço do EasyAudit na web) para o link do convite; sem ele, usa o endereço de onde
// o administrador chamou (painel web).
import { createClient } from 'npm:@supabase/supabase-js@2.57.0';
import { contaDe, type Empresa } from '../_shared/conta.ts';
import { EMAIL_RE, enviar, esc, layout } from '../_shared/mailer.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false, autoRefreshToken: false } });
const APP_URL = (Deno.env.get('APP_URL') ?? '').replace(/\/$/, '');

const emailEmUso = (error: unknown) => /already|registered|exists/i.test(String((error as { message?: string })?.message ?? '')) || (error as { code?: string } | null)?.code === 'email_exists';
const limiteAtingido = (error: unknown) => /limite de contas/i.test(String((error as { message?: string })?.message ?? ''));
/** Login bloqueado "para sempre" no servidor (a pessoa não consegue entrar nem renovar a sessão). */
const BANIDO = '876000h';

type Ctx = { empresa: Empresa; eu: string; euNome: string; origem: string };
type Convite = { email?: string; nome?: string; senha?: string; papel?: string; modulos?: unknown };

const enderecoApp = (ctx: Ctx) => APP_URL || ctx.origem;

async function contasAtivas(empresaId: string) {
  const { count } = await admin.from('profiles').select('user_id', { count: 'exact', head: true }).eq('empresa_id', empresaId).eq('ativo', true);
  return count ?? 0;
}
function lerConvite(body: Convite, empresa: Empresa) {
  const email = String(body.email ?? '').trim().toLowerCase();
  const nome = String(body.nome ?? '').trim().slice(0, 80);
  const papel = body.papel === 'admin' ? 'admin' : 'usuario';
  // Só módulos do plano da empresa.
  const modulos = Array.isArray(body.modulos) ? [...new Set(body.modulos.map(String).filter(m => empresa.modulos.includes(m)))] : [];
  return { email, nome, papel, modulos };
}
function validar(c: ReturnType<typeof lerConvite>) {
  if (!EMAIL_RE.test(c.email)) return 'Informe um e-mail válido.';
  if (!c.nome) return 'Informe o nome da pessoa (aparece nos registros e relatórios).';
  if (c.papel === 'usuario' && !c.modulos.length) return 'Marque ao menos um módulo para a conta.';
  return null;
}
const semVaga = (empresa: Empresa, usadas: number) =>
  json(409, { erro: `O plano da empresa permite ${empresa.limite_contas} conta(s) ativa(s) e todas estão em uso (${usadas}). Inative uma conta ou fale com o EasyAudit para aumentar o plano.` });

async function emailDeAcesso(ctx: Ctx, para: string, nome: string, link: string, novo: boolean) {
  await enviar({
    para,
    assunto: novo ? `Convite para o EasyAudit · ${ctx.empresa.nome}` : `Seu acesso ao EasyAudit · ${ctx.empresa.nome}`,
    html: layout({
      titulo: novo ? 'Você foi convidado para o EasyAudit' : 'Acesso ao EasyAudit',
      paragrafos: [
        `Olá${nome ? `, ${esc(nome)}` : ''}! <b>${esc(ctx.euNome)}</b> ${novo ? 'convidou você para usar' : 'liberou o seu acesso a'} o EasyAudit da empresa <b>${esc(ctx.empresa.nome)}</b>.`,
        novo ? 'Toque no botão para criar a sua senha. Depois é só entrar no app ou no painel web com o seu e-mail e essa senha.'
          : 'Toque no botão para definir a sua senha e entrar.',
        'O link vale por pouco tempo. Se expirar, peça ao administrador para enviar de novo.',
      ],
      botao: { texto: novo ? 'Criar minha senha' : 'Definir senha e entrar', url: link },
      rodape: 'Se você não esperava este convite, ignore este e-mail.',
    }),
  });
}

async function convidar(body: Convite, ctx: Ctx) {
  const c = lerConvite(body, ctx.empresa);
  const erro = validar(c);
  if (erro) return json(400, { erro });
  const usadas = await contasAtivas(ctx.empresa.id);
  if (usadas >= ctx.empresa.limite_contas) return semVaga(ctx.empresa, usadas);
  const voltar = `${enderecoApp(ctx)}/redefinir-senha?convite=1`;

  // Conta que já existe (a pessoa criou sozinha, antes do convite).
  const { data: existente } = await admin.from('profiles').select('user_id,empresa_id,nome').eq('email', c.email).maybeSingle();
  if (existente) {
    if (existente.empresa_id === ctx.empresa.id) return json(409, { erro: `${c.email} já é uma conta da sua empresa. Procure-a na lista para liberar ou alterar os módulos.` });
    if (existente.empresa_id) return json(409, { erro: `${c.email} já pertence a outra empresa no EasyAudit.` });
    const { error } = await admin.from('profiles').update({ empresa_id: ctx.empresa.id, nome: existente.nome || c.nome, papel: c.papel, modulos: c.papel === 'admin' ? [] : c.modulos, ativo: true }).eq('user_id', existente.user_id);
    if (error) return limiteAtingido(error) ? semVaga(ctx.empresa, usadas) : json(500, { erro: `Não foi possível ligar a conta à empresa: ${error.message}` });
    await admin.auth.admin.updateUserById(existente.user_id, { ban_duration: 'none' });
    const { data: l } = await admin.auth.admin.generateLink({ type: 'recovery', email: c.email, options: { redirectTo: voltar } });
    if (l?.properties?.action_link) await emailDeAcesso(ctx, c.email, existente.nome || c.nome, l.properties.action_link, false);
    return json(200, { ok: true, user_id: existente.user_id, existente: true });
  }

  const { data, error } = await admin.auth.admin.generateLink({ type: 'invite', email: c.email, options: { data: { nome: c.nome }, redirectTo: voltar } });
  if (error || !data.user || !data.properties?.action_link) {
    if (emailEmUso(error)) return json(409, { erro: `Já existe uma conta com ${c.email}.` });
    throw new Error(error?.message || 'Falha ao gerar o convite.');
  }
  // O gatilho do banco já criou o perfil (sem empresa); aqui ele entra na empresa com o papel e os módulos.
  const { error: e2 } = await admin.from('profiles').update({ empresa_id: ctx.empresa.id, email: c.email, nome: c.nome, papel: c.papel, ativo: true, modulos: c.papel === 'admin' ? [] : c.modulos }).eq('user_id', data.user.id);
  if (e2) {
    await admin.auth.admin.deleteUser(data.user.id).catch(() => undefined); // não deixa conta solta
    return limiteAtingido(e2) ? semVaga(ctx.empresa, usadas) : json(500, { erro: `Não foi possível preparar a conta: ${e2.message}` });
  }
  await emailDeAcesso(ctx, c.email, c.nome, data.properties.action_link, true);
  return json(200, { ok: true, user_id: data.user.id });
}

async function alvoDaEmpresa(id: string, ctx: Ctx) {
  const { data } = await admin.from('profiles').select('user_id,email,nome,empresa_id,ativo').eq('user_id', id).maybeSingle();
  return data && data.empresa_id === ctx.empresa.id ? data : null;
}

async function reenviar(body: { user_id?: string }, ctx: Ctx) {
  const alvo = await alvoDaEmpresa(String(body.user_id ?? ''), ctx);
  if (!alvo) return json(404, { erro: 'Conta não encontrada na sua empresa.' });
  if (!alvo.ativo) return json(400, { erro: 'A conta está inativa. Reative-a antes de enviar o acesso.' });
  const { data, error } = await admin.auth.admin.generateLink({ type: 'recovery', email: alvo.email, options: { redirectTo: `${enderecoApp(ctx)}/redefinir-senha?convite=1` } });
  if (error || !data.properties?.action_link) throw new Error(error?.message || 'Falha ao gerar o link.');
  await emailDeAcesso(ctx, alvo.email, alvo.nome ?? '', data.properties.action_link, false);
  return json(200, { ok: true });
}

async function criar(body: Convite, ctx: Ctx) {
  const c = lerConvite(body, ctx.empresa);
  const erro = validar(c);
  if (erro) return json(400, { erro });
  const senha = String(body.senha ?? '');
  if (senha.length < 8) return json(400, { erro: 'A senha inicial precisa ter pelo menos 8 caracteres.' });
  const usadas = await contasAtivas(ctx.empresa.id);
  if (usadas >= ctx.empresa.limite_contas) return semVaga(ctx.empresa, usadas);
  const { data, error } = await admin.auth.admin.createUser({ email: c.email, password: senha, email_confirm: true, user_metadata: { nome: c.nome } });
  if (error || !data.user) {
    if (emailEmUso(error)) return json(409, { erro: `Já existe uma conta com ${c.email}. Use "Convidar" para ligá-la à sua empresa.` });
    if (/password/i.test(error?.message ?? '')) return json(400, { erro: `Senha recusada pelo servidor: ${error?.message}` });
    throw new Error(error?.message || 'Falha ao criar a conta.');
  }
  const { error: e2 } = await admin.from('profiles').update({ empresa_id: ctx.empresa.id, email: c.email, nome: c.nome, papel: c.papel, ativo: true, modulos: c.papel === 'admin' ? [] : c.modulos }).eq('user_id', data.user.id);
  if (e2) {
    await admin.auth.admin.deleteUser(data.user.id).catch(() => undefined);
    return limiteAtingido(e2) ? semVaga(ctx.empresa, usadas) : json(500, { erro: `Conta criada, mas o perfil não foi salvo: ${e2.message}` });
  }
  return json(200, { ok: true, user_id: data.user.id });
}

async function editar(body: { user_id?: string; nome?: string; email?: string; senha?: string }, ctx: Ctx) {
  const id = String(body.user_id ?? '');
  if (!id) return json(400, { erro: 'Conta não informada.' });
  if (id === ctx.eu) return json(400, { erro: 'Para alterar o seu e-mail ou a sua senha, use Minha conta.' });
  const alvo = await alvoDaEmpresa(id, ctx);
  if (!alvo) return json(404, { erro: 'Conta não encontrada na sua empresa.' });
  const nome = body.nome === undefined ? undefined : String(body.nome).trim().slice(0, 80);
  const email = body.email === undefined ? undefined : String(body.email).trim().toLowerCase();
  const senha = body.senha ? String(body.senha) : undefined;
  if (nome !== undefined && !nome) return json(400, { erro: 'O nome não pode ficar vazio.' });
  if (email !== undefined && !EMAIL_RE.test(email)) return json(400, { erro: 'Informe um e-mail válido.' });
  if (senha !== undefined && senha.length < 8) return json(400, { erro: 'A nova senha precisa ter pelo menos 8 caracteres.' });

  const mudancaAuth: Record<string, unknown> = {};
  if (email !== undefined && email !== alvo.email) { mudancaAuth.email = email; mudancaAuth.email_confirm = true; }
  if (senha !== undefined) mudancaAuth.password = senha;
  if (nome !== undefined) mudancaAuth.user_metadata = { nome };
  if (Object.keys(mudancaAuth).length) {
    const { error } = await admin.auth.admin.updateUserById(id, mudancaAuth);
    if (error) {
      if (emailEmUso(error)) return json(409, { erro: `Já existe outra conta com ${email}.` });
      if (/password/i.test(error.message)) return json(400, { erro: `Senha recusada pelo servidor: ${error.message}` });
      throw new Error(error.message);
    }
  }
  const perfil: Record<string, unknown> = {};
  if (nome !== undefined) perfil.nome = nome;
  if (email !== undefined) perfil.email = email;
  if (Object.keys(perfil).length) {
    const { error } = await admin.from('profiles').update(perfil).eq('user_id', id);
    if (error) throw new Error(`Login alterado, mas o perfil não foi salvo: ${error.message}`);
  }
  return json(200, { ok: true });
}

async function status(body: { user_id?: string; ativo?: boolean }, ctx: Ctx) {
  const id = String(body.user_id ?? '');
  if (!id) return json(400, { erro: 'Conta não informada.' });
  if (id === ctx.eu) return json(400, { erro: 'Você não pode inativar a própria conta.' });
  const alvo = await alvoDaEmpresa(id, ctx);
  if (!alvo) return json(404, { erro: 'Conta não encontrada na sua empresa.' });
  const ativo = body.ativo === true;
  if (ativo && !alvo.ativo) {
    const usadas = await contasAtivas(ctx.empresa.id);
    if (usadas >= ctx.empresa.limite_contas) return semVaga(ctx.empresa, usadas);
  }
  // Perfil primeiro: se o limite do plano barrar, o login nem é liberado.
  const { error: e2 } = await admin.from('profiles').update({ ativo }).eq('user_id', id);
  if (e2) return limiteAtingido(e2) ? semVaga(ctx.empresa, await contasAtivas(ctx.empresa.id)) : json(500, { erro: `Não foi possível ${ativo ? 'reativar' : 'inativar'} a conta: ${e2.message}` });
  const { error: e1 } = await admin.auth.admin.updateUserById(id, { ban_duration: ativo ? 'none' : BANIDO });
  if (e1) throw new Error(`Perfil ${ativo ? 'liberado' : 'bloqueado'}, mas o login não: ${e1.message}`);
  return json(200, { ok: true });
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const conta = await contaDe(admin, req);
    if (!conta) return json(401, { erro: 'Sessão expirada. Entre de novo no EasyAudit.' });
    if (!conta.admin || !conta.empresa) return json(403, { erro: 'Somente o administrador da empresa cadastra usuários.' });
    const ctx: Ctx = {
      empresa: conta.empresa, eu: conta.user.id,
      euNome: conta.perfil?.nome?.trim() || conta.user.email || 'O administrador',
      origem: (req.headers.get('Origin') ?? '').replace(/\/$/, ''),
    };
    const body = await req.json().catch(() => ({}));
    if ((body.acao === 'convidar' || body.acao === 'reenviar') && !enderecoApp(ctx)) {
      return json(400, { erro: 'Envie o convite pelo painel web (ou configure APP_URL no servidor) para o link apontar para o EasyAudit.' });
    }
    switch (body.acao) {
      case 'convidar': return await convidar(body, ctx);
      case 'reenviar': return await reenviar(body, ctx);
      case 'criar': return await criar(body, ctx);
      case 'editar': return await editar(body, ctx);
      case 'status': return await status(body, ctx);
      default: return json(400, { erro: 'Ação desconhecida.' });
    }
  } catch (e) {
    return json(500, { erro: e instanceof Error ? e.message : 'Erro inesperado no servidor.' });
  }
});
