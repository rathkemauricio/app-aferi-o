// Cadastro de usuários pelo administrador (tela "Usuários e permissões").
//
// Chamada do app (supabase.functions.invoke('usuarios', { body })), com o JWT de quem está logado:
//   { acao: 'criar', email, nome, senha, papel: 'usuario'|'admin', modulos: string[] }
//        cria a conta já confirmada e liberada, com o papel e os módulos escolhidos → { ok, user_id }
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
const MODULOS = ['afericoes', 'tempos', 'croqui', 'auditoria', 'riscos', 'inventarios', 'agenda', 'coleta'];
const EMAIL_RE = /^[^\s@<>(),;:"]+@[^\s@<>(),;:"]+\.[^\s@<>(),;:"]+$/;

type Criar = { email?: string; nome?: string; senha?: string; papel?: string; modulos?: unknown };

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
    if (/already|registered|exists/i.test(msg) || (error as { code?: string } | null)?.code === 'email_exists') {
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

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
    const { data: u, error } = await admin.auth.getUser(token);
    if (error || !u.user) return json(401, { erro: 'Sessão expirada. Entre de novo no Postora.' });
    const { data: p } = await admin.from('profiles').select('papel,ativo').eq('user_id', u.user.id).maybeSingle();
    if (!p?.ativo || p.papel !== 'admin') return json(403, { erro: 'Somente o administrador cadastra usuários.' });
    const body = await req.json().catch(() => ({}));
    switch (body.acao) {
      case 'criar': return await criar(body);
      default: return json(400, { erro: 'Ação desconhecida.' });
    }
  } catch (e) {
    return json(500, { erro: e instanceof Error ? e.message : 'Erro inesperado no servidor.' });
  }
});
