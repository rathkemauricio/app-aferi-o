// Cadastro de usuários pelo administrador (tela "Usuários e permissões").
//
// Chamada do app (supabase.functions.invoke('usuarios', { body })), com o JWT de quem está logado:
//   { acao: 'criar', email, nome, senha, papel: 'usuario'|'admin', modulos: string[] }
//        cria a conta já confirmada e liberada, com o papel e os módulos escolhidos → { ok, user_id }
//   { acao: 'editar', user_id, nome?, email?, senha? }
//        altera nome, e-mail (login, já confirmado) e/ou senha de outra conta → { ok }
//   { acao: 'status', user_id, ativo: boolean }
//        inativa (perfil sem acesso + login bloqueado no servidor) ou reativa a conta → { ok }
//
// A própria conta do administrador não passa por aqui (e-mail e senha: Minha conta; papel e acesso: protegidos).
//
// Só administrador ativo pode chamar. A senha inicial é definida pelo administrador; a pessoa troca
// depois em Minha conta → Alterar senha.
//
// Publicar: npx supabase functions deploy usuarios --no-verify-jwt
// O JWT do usuário é conferido aqui dentro (as chaves novas do Supabase não são JWT, por isso --no-verify-jwt).
import { createClient } from 'npm:@supabase/supabase-js@2.57.0';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false, autoRefreshToken: false } });

// Mesmos ids de modules/registry.ts.
const MODULOS = ['afericoes', 'tempos', 'croqui', 'auditoria', 'riscos', 'inventarios', 'agenda', 'coleta', 'tanques'];
const EMAIL_RE = /^[^\s@<>(),;:"]+@[^\s@<>(),;:"]+\.[^\s@<>(),;:"]+$/;

type Criar = { email?: string; nome?: string; senha?: string; papel?: string; modulos?: unknown };
type Editar = { user_id?: string; nome?: string; email?: string; senha?: string };
type Status = { user_id?: string; ativo?: boolean };
const emailEmUso = (error: unknown) => /already|registered|exists/i.test(String((error as { message?: string })?.message ?? '')) || (error as { code?: string } | null)?.code === 'email_exists';
/** Login bloqueado "para sempre" no servidor (a pessoa não consegue entrar nem renovar a sessão). */
const BANIDO = '876000h';

async function criar(body: Criar) {
  const email = String(body.email ?? '').trim().toLowerCase();
  const nome = String(body.nome ?? '').trim().slice(0, 80);
  const senha = String(body.senha ?? '');
  const papel = body.papel === 'admin' ? 'admin' : 'usuario';
  const modulos = Array.isArray(body.modulos) ? [...new Set(body.modulos.map(String).filter(m => MODULOS.includes(m)))] : [];
  if (!EMAIL_RE.test(email)) return json(400, { erro: 'Informe um e-mail válido.' });
  if (!nome) return json(400, { erro: 'Informe o nome da pessoa (aparece nos registros e relatórios).' });
  if (senha.length < 8) return json(400, { erro: 'A senha inicial precisa ter pelo menos 8 caracteres.' });
  if (papel === 'usuario' && !modulos.length) return json(400, { erro: 'Marque ao menos um módulo para a conta.' });

  const { data, error } = await admin.auth.admin.createUser({ email, password: senha, email_confirm: true, user_metadata: { nome } });
  if (error || !data.user) {
    const msg = error?.message ?? '';
    if (emailEmUso(error)) {
      return json(409, { erro: `Já existe uma conta com ${email}. Procure-a na lista para liberar ou alterar os módulos.` });
    }
    if (/password/i.test(msg)) return json(400, { erro: `Senha recusada pelo servidor: ${msg}` });
    throw new Error(msg || 'Falha ao criar a conta.');
  }
  // O gatilho do banco já criou o perfil (bloqueado); aqui ele é liberado com o papel e os módulos.
  const { error: e2 } = await admin.from('profiles').upsert({ user_id: data.user.id, email, nome, papel, ativo: true, modulos: papel === 'admin' ? [] : modulos });
  if (e2) throw new Error(`Conta criada, mas o perfil não foi salvo: ${e2.message}`);
  return json(200, { ok: true, user_id: data.user.id });
}

async function editar(body: Editar, eu: string) {
  const id = String(body.user_id ?? '');
  if (!id) return json(400, { erro: 'Conta não informada.' });
  if (id === eu) return json(400, { erro: 'Para alterar o seu e-mail ou a sua senha, use Minha conta.' });
  const { data: alvo } = await admin.from('profiles').select('user_id,email,nome').eq('user_id', id).maybeSingle();
  if (!alvo) return json(404, { erro: 'Conta não encontrada.' });
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

async function status(body: Status, eu: string) {
  const id = String(body.user_id ?? '');
  if (!id) return json(400, { erro: 'Conta não informada.' });
  if (id === eu) return json(400, { erro: 'Você não pode inativar a própria conta.' });
  const ativo = body.ativo === true;
  const { error: e1 } = await admin.auth.admin.updateUserById(id, { ban_duration: ativo ? 'none' : BANIDO });
  if (e1) throw new Error(`Não foi possível ${ativo ? 'liberar' : 'bloquear'} o login: ${e1.message}`);
  const { error: e2 } = await admin.from('profiles').update({ ativo }).eq('user_id', id);
  if (e2) throw new Error(`Login ${ativo ? 'liberado' : 'bloqueado'}, mas o perfil não foi salvo: ${e2.message}`);
  return json(200, { ok: true });
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
    const { data: u, error } = await admin.auth.getUser(token);
    if (error || !u.user) return json(401, { erro: 'Sessão expirada. Entre de novo no EasyAudit.' });
    const { data: p } = await admin.from('profiles').select('papel,ativo').eq('user_id', u.user.id).maybeSingle();
    if (!p?.ativo || p.papel !== 'admin') return json(403, { erro: 'Somente o administrador cadastra usuários.' });
    const body = await req.json().catch(() => ({}));
    switch (body.acao) {
      case 'criar': return await criar(body);
      case 'editar': return await editar(body, u.user.id);
      case 'status': return await status(body, u.user.id);
      default: return json(400, { erro: 'Ação desconhecida.' });
    }
  } catch (e) {
    return json(500, { erro: e instanceof Error ? e.message : 'Erro inesperado no servidor.' });
  }
});
