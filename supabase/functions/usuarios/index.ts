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
//   { acao: 'acesso_filial', filial_id, email }  e-mail de acesso da filial: cria (ou troca o e-mail de) a conta da
//        filial, que só usa Contagens e só vê as contagens da própria filial, e envia o link para criar a senha → { ok }
//   { acao: 'bloquear_filial', filial_id }       tira o acesso da filial (a conta é inativada; o e-mail fica) → { ok }
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

/** Contas ativas que ocupam vaga do plano (as contas de filial não ocupam). */
async function contasAtivas(empresaId: string) {
  const { count } = await admin.from('profiles').select('user_id', { count: 'exact', head: true }).eq('empresa_id', empresaId).eq('ativo', true).is('filial_id', null);
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

// ---------- Acesso da filial ----------
async function filialDaEmpresa(id: string, ctx: Ctx) {
  const { data } = await admin.from('filiais').select('id,codigo,nome,email').eq('id', id).eq('empresa_id', ctx.empresa.id).is('deleted_at', null).maybeSingle();
  return data;
}

async function emailDaFilial(ctx: Ctx, para: string, filial: string, link: string) {
  await enviar({
    para,
    assunto: `Acesso da filial ${filial} ao EasyAudit · ${ctx.empresa.nome}`,
    html: layout({
      titulo: 'Acesso da filial ao EasyAudit',
      paragrafos: [
        `<b>${esc(ctx.euNome)}</b> liberou o acesso da filial <b>${esc(filial)}</b> ao EasyAudit da empresa <b>${esc(ctx.empresa.nome)}</b>.`,
        'Com este e-mail a filial usa o módulo <b>Contagens</b>: abre a contagem do estoque, conta pelo celular (câmera, digitando ou pela lista) e vê o relatório.',
        'Toque no botão para criar a senha. Depois é só entrar no app ou no painel web com este e-mail e essa senha.',
        'O link vale por pouco tempo. Se expirar, peça ao administrador para enviar de novo.',
      ],
      botao: { texto: 'Criar a senha da filial', url: link },
      rodape: 'Se você não esperava este e-mail, ignore-o.',
    }),
  });
}

async function acessoFilial(body: { filial_id?: string; email?: string }, ctx: Ctx) {
  const f = await filialDaEmpresa(String(body.filial_id ?? ''), ctx);
  if (!f) return json(404, { erro: 'Filial não encontrada na sua empresa.' });
  const email = String(body.email ?? '').trim().toLowerCase();
  if (!EMAIL_RE.test(email)) return json(400, { erro: 'Informe um e-mail válido para a filial.' });
  const rotulo = `${f.codigo} · ${f.nome}`;
  const nome = `Filial ${rotulo}`.slice(0, 80);
  const voltar = `${enderecoApp(ctx)}/redefinir-senha?convite=1`;
  const perfilFilial = { empresa_id: ctx.empresa.id, filial_id: f.id, email, nome, papel: 'usuario', modulos: ['coleta'], ativo: true };

  const { data: daFilial } = await admin.from('profiles').select('user_id,email').eq('filial_id', f.id).maybeSingle();
  const { data: doEmail } = await admin.from('profiles').select('user_id,empresa_id,filial_id').eq('email', email).maybeSingle();
  if (doEmail && doEmail.user_id !== daFilial?.user_id) {
    if (doEmail.empresa_id && doEmail.empresa_id !== ctx.empresa.id) return json(409, { erro: `${email} já pertence a outra empresa no EasyAudit.` });
    if (doEmail.filial_id) return json(409, { erro: `${email} já é o acesso de outra filial.` });
    if (doEmail.empresa_id) return json(409, { erro: `${email} já é uma conta da auditoria. Use um e-mail próprio da filial.` });
  }

  let userId: string;
  let link: string | undefined;
  if (daFilial) {
    // A filial já tem conta: troca o e-mail (se mudou), reativa e manda o link de novo.
    userId = daFilial.user_id;
    if (daFilial.email !== email) {
      const { error } = await admin.auth.admin.updateUserById(userId, { email, email_confirm: true });
      if (error) return emailEmUso(error) ? json(409, { erro: `Já existe outra conta com ${email}.` }) : json(500, { erro: error.message });
    }
    await admin.auth.admin.updateUserById(userId, { ban_duration: 'none' });
    const { error } = await admin.from('profiles').update(perfilFilial).eq('user_id', userId);
    if (error) return json(500, { erro: `Não foi possível preparar a conta da filial: ${error.message}` });
    const { data: l } = await admin.auth.admin.generateLink({ type: 'recovery', email, options: { redirectTo: voltar } });
    link = l?.properties?.action_link;
  } else if (doEmail) {
    // Conta criada sozinha com este e-mail, sem empresa: vira a conta da filial.
    userId = doEmail.user_id;
    const { error } = await admin.from('profiles').update(perfilFilial).eq('user_id', userId);
    if (error) return json(500, { erro: `Não foi possível ligar a conta à filial: ${error.message}` });
    await admin.auth.admin.updateUserById(userId, { ban_duration: 'none' });
    const { data: l } = await admin.auth.admin.generateLink({ type: 'recovery', email, options: { redirectTo: voltar } });
    link = l?.properties?.action_link;
  } else {
    const { data, error } = await admin.auth.admin.generateLink({ type: 'invite', email, options: { data: { nome }, redirectTo: voltar } });
    if (error || !data.user || !data.properties?.action_link) {
      if (emailEmUso(error)) return json(409, { erro: `Já existe uma conta com ${email}.` });
      throw new Error(error?.message || 'Falha ao gerar o convite.');
    }
    userId = data.user.id;
    link = data.properties.action_link;
    const { error: e2 } = await admin.from('profiles').update(perfilFilial).eq('user_id', userId);
    if (e2) {
      await admin.auth.admin.deleteUser(userId).catch(() => undefined);
      return json(500, { erro: `Não foi possível preparar a conta da filial: ${e2.message}` });
    }
  }
  const { error: e3 } = await admin.from('filiais').update({ email }).eq('id', f.id).eq('empresa_id', ctx.empresa.id);
  if (e3) throw new Error(`Conta pronta, mas o e-mail não foi gravado na filial: ${e3.message}`);
  if (link) await emailDaFilial(ctx, email, rotulo, link);
  return json(200, { ok: true, user_id: userId });
}

async function bloquearFilial(body: { filial_id?: string }, ctx: Ctx) {
  const f = await filialDaEmpresa(String(body.filial_id ?? ''), ctx);
  if (!f) return json(404, { erro: 'Filial não encontrada na sua empresa.' });
  const { data: p } = await admin.from('profiles').select('user_id').eq('filial_id', f.id).eq('empresa_id', ctx.empresa.id).maybeSingle();
  if (!p) return json(200, { ok: true });
  const { error } = await admin.from('profiles').update({ ativo: false }).eq('user_id', p.user_id);
  if (error) throw new Error(error.message);
  const { error: e1 } = await admin.auth.admin.updateUserById(p.user_id, { ban_duration: BANIDO });
  if (e1) throw new Error(`Acesso marcado como bloqueado, mas o login não: ${e1.message}`);
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
    if ((body.acao === 'convidar' || body.acao === 'reenviar' || body.acao === 'acesso_filial') && !enderecoApp(ctx)) {
      return json(400, { erro: 'Envie o convite pelo painel web (ou configure APP_URL no servidor) para o link apontar para o EasyAudit.' });
    }
    switch (body.acao) {
      case 'convidar': return await convidar(body, ctx);
      case 'reenviar': return await reenviar(body, ctx);
      case 'criar': return await criar(body, ctx);
      case 'editar': return await editar(body, ctx);
      case 'status': return await status(body, ctx);
      case 'acesso_filial': return await acessoFilial(body, ctx);
      case 'bloquear_filial': return await bloquearFilial(body, ctx);
      default: return json(400, { erro: 'Ação desconhecida.' });
    }
  } catch (e) {
    return json(500, { erro: e instanceof Error ? e.message : 'Erro inesperado no servidor.' });
  }
});
