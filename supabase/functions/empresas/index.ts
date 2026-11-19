// Empresas (clientes do EasyAudit): cadastro pelo site e painel do dono da plataforma.
//
// Chamada do app (supabase.functions.invoke('empresas', { body })), com o JWT de quem está logado:
//   { acao: 'criar', nome?, documento?, telefone?, plano_id? }
//        conta sem empresa cria a própria empresa (aguardando liberação) e vira administradora dela.
//        Sem os campos, usa os dados guardados no cadastro do site (user_metadata.empresa_pendente). → { ok, empresa_id }
//   Dono da plataforma:
//   { acao: 'listar' }                               → { ok, empresas: [...com contas ativas e administradores], planos }
//   { acao: 'atualizar', id, status?, plano_id?, limite_contas?, modulos?, nome? }  → { ok }
//        ao liberar uma empresa (status 'ativa'), os administradores dela recebem um e-mail.
//   { acao: 'salvar_plano', id, nome?, descricao?, preco_mensal?, limite_contas?, modulos?, ativo? } → { ok }
//
// Publicar: npx supabase functions deploy empresas --no-verify-jwt
// Secrets opcionais: APP_URL (endereço do EasyAudit na web, para os links dos e-mails) e DONO_EMAIL.
import { createClient } from 'npm:@supabase/supabase-js@2.57.0';
import { contaDe, DONO_EMAIL, ehDono } from '../_shared/conta.ts';
import { APP_URL, enviar, esc, layout } from '../_shared/mailer.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false, autoRefreshToken: false } });

// Mesmos ids de modules/registry.ts.
const MODULOS = ['afericoes', 'tempos', 'croqui', 'auditoria', 'riscos', 'inventarios', 'agenda', 'coleta', 'tanques'];
const texto = (v: unknown, max: number) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const soModulos = (v: unknown) => (Array.isArray(v) ? [...new Set(v.map(String).filter(m => MODULOS.includes(m)))] : null);

type Pedido = { nome?: unknown; documento?: unknown; telefone?: unknown; plano_id?: unknown };

async function criar(body: Pedido, conta: NonNullable<Awaited<ReturnType<typeof contaDe>>>, origem: string) {
  if (conta.perfil?.empresa_id) return json(409, { erro: 'Esta conta já faz parte de uma empresa.' });
  const meta = (conta.user.user_metadata ?? {}) as Record<string, unknown>;
  const pendente = (meta.empresa_pendente ?? {}) as Pedido;
  const dados = body.nome ? body : pendente;
  const nome = texto(dados.nome, 120);
  if (nome.length < 2) return json(400, { erro: 'Informe o nome da empresa.' });
  const { data: plano } = await admin.from('planos').select('id,nome,limite_contas,modulos,ativo').eq('id', texto(dados.plano_id, 40) || 'essencial').maybeSingle();
  if (!plano?.ativo) return json(400, { erro: 'Escolha um dos planos disponíveis.' });

  const { data: emp, error } = await admin.from('empresas').insert({
    nome, documento: texto(dados.documento, 30), telefone: texto(dados.telefone, 30), plano_id: plano.id,
    limite_contas: plano.limite_contas, modulos: plano.modulos, status: 'aguardando', criado_por: conta.user.id,
  }).select('id').single();
  if (error || !emp) throw new Error(`Não foi possível cadastrar a empresa: ${error?.message ?? ''}`);
  const nomePessoa = texto(meta.nome, 80) || conta.perfil?.nome || '';
  const { error: e2 } = await admin.from('profiles').update({ empresa_id: emp.id, papel: 'admin', ativo: true, modulos: [], ...(nomePessoa ? { nome: nomePessoa } : {}) }).eq('user_id', conta.user.id);
  if (e2) {
    await admin.from('empresas').delete().eq('id', emp.id);
    throw new Error(`Não foi possível ligar a sua conta à empresa: ${e2.message}`);
  }
  if (meta.empresa_pendente) await admin.auth.admin.updateUserById(conta.user.id, { user_metadata: { ...meta, empresa_pendente: null } });

  // Aviso ao dono da plataforma (falha no e-mail não desfaz o cadastro).
  const base = APP_URL;
  await enviar({
    para: DONO_EMAIL,
    assunto: `Nova empresa aguardando liberação: ${nome}`,
    html: layout({
      titulo: 'Nova empresa no EasyAudit',
      paragrafos: [
        `<b>${esc(nome)}</b> se cadastrou no plano <b>${esc(plano.nome)}</b> (até ${plano.limite_contas} contas).`,
        `Administrador: ${esc(nomePessoa || conta.user.email)} (${esc(conta.user.email)})${texto(dados.telefone, 30) ? `, telefone ${esc(texto(dados.telefone, 30))}` : ''}${texto(dados.documento, 30) ? `, CNPJ ${esc(texto(dados.documento, 30))}` : ''}.`,
        'A empresa só vê o sistema depois que você liberar em Empresas e planos.',
      ],
      botao: base ? { texto: 'Abrir Empresas e planos', url: `${base}/plataforma` } : undefined,
    }),
  }).catch(e => console.error('empresas: aviso ao dono', e));
  return json(200, { ok: true, empresa_id: emp.id });
}

async function listar() {
  const [{ data: empresas, error }, { data: planos }, { data: perfis }] = await Promise.all([
    admin.from('empresas').select('*').order('created_at', { ascending: false }),
    admin.from('planos').select('*').order('ordem'),
    admin.from('profiles').select('empresa_id,email,nome,papel,ativo').not('empresa_id', 'is', null),
  ]);
  if (error) throw new Error(error.message);
  const lista = (empresas ?? []).map(e => {
    const contas = (perfis ?? []).filter(p => p.empresa_id === e.id);
    return {
      ...e,
      contas_ativas: contas.filter(p => p.ativo).length,
      administradores: contas.filter(p => p.papel === 'admin').map(p => ({ email: p.email, nome: p.nome })),
    };
  });
  return json(200, { ok: true, empresas: lista, planos: planos ?? [] });
}

async function atualizar(body: Record<string, unknown>, origem: string) {
  const id = texto(body.id, 60);
  const { data: atual } = await admin.from('empresas').select('id,nome,status').eq('id', id).maybeSingle();
  if (!atual) return json(404, { erro: 'Empresa não encontrada.' });
  const mudar: Record<string, unknown> = {};
  if (body.status !== undefined) {
    if (!['aguardando', 'ativa', 'suspensa'].includes(String(body.status))) return json(400, { erro: 'Situação inválida.' });
    mudar.status = body.status;
  }
  if (body.nome !== undefined) { const n = texto(body.nome, 120); if (n.length < 2) return json(400, { erro: 'Nome inválido.' }); mudar.nome = n; }
  if (body.plano_id !== undefined) {
    const { data: plano } = await admin.from('planos').select('id,limite_contas,modulos').eq('id', texto(body.plano_id, 40)).maybeSingle();
    if (!plano) return json(400, { erro: 'Plano não encontrado.' });
    // Trocar de plano aplica o limite e os módulos do plano (ajustáveis depois, um a um).
    Object.assign(mudar, { plano_id: plano.id, limite_contas: plano.limite_contas, modulos: plano.modulos });
  }
  if (body.limite_contas !== undefined) {
    const n = Math.floor(Number(body.limite_contas));
    if (!(n >= 1 && n <= 100000)) return json(400, { erro: 'Limite de contas inválido.' });
    mudar.limite_contas = n;
  }
  if (body.modulos !== undefined) { const m = soModulos(body.modulos); if (!m?.length) return json(400, { erro: 'Deixe ao menos um módulo.' }); mudar.modulos = m; }
  if (!Object.keys(mudar).length) return json(200, { ok: true });
  const { error } = await admin.from('empresas').update(mudar).eq('id', id);
  if (error) throw new Error(error.message);

  if (mudar.status === 'ativa' && atual.status !== 'ativa') {
    const { data: adms } = await admin.from('profiles').select('email,nome').eq('empresa_id', id).eq('papel', 'admin').eq('ativo', true);
    const base = APP_URL;
    for (const a of adms ?? []) {
      await enviar({
        para: a.email,
        assunto: `${atual.nome} liberada no EasyAudit`,
        html: layout({
          titulo: 'Sua empresa foi liberada',
          paragrafos: [
            `Olá${a.nome ? `, ${esc(a.nome)}` : ''}! A <b>${esc(atual.nome)}</b> já pode usar o EasyAudit.`,
            'Entre com o seu e-mail e senha. Em Usuários e permissões você convida a sua equipe e escolhe os módulos de cada pessoa.',
          ],
          botao: base ? { texto: 'Entrar no EasyAudit', url: base } : undefined,
        }),
      }).catch(e => console.error('empresas: aviso de liberação', e));
    }
  }
  return json(200, { ok: true });
}

async function salvarPlano(body: Record<string, unknown>) {
  const id = texto(body.id, 40);
  if (!/^[a-z0-9-]{2,40}$/.test(id)) return json(400, { erro: 'Identificador do plano inválido.' });
  const mudar: Record<string, unknown> = {};
  if (body.nome !== undefined) mudar.nome = texto(body.nome, 60);
  if (body.descricao !== undefined) mudar.descricao = texto(body.descricao, 300);
  if (body.preco_mensal !== undefined) {
    const p = body.preco_mensal === null || body.preco_mensal === '' ? null : Number(body.preco_mensal);
    if (p !== null && !(p >= 0)) return json(400, { erro: 'Preço inválido.' });
    mudar.preco_mensal = p;
  }
  if (body.limite_contas !== undefined) {
    const n = Math.floor(Number(body.limite_contas));
    if (!(n >= 1 && n <= 100000)) return json(400, { erro: 'Limite de contas inválido.' });
    mudar.limite_contas = n;
  }
  if (body.modulos !== undefined) { const m = soModulos(body.modulos); if (!m?.length) return json(400, { erro: 'Deixe ao menos um módulo.' }); mudar.modulos = m; }
  if (body.ativo !== undefined) mudar.ativo = body.ativo === true;
  const { error } = await admin.from('planos').update(mudar).eq('id', id);
  if (error) throw new Error(error.message);
  return json(200, { ok: true });
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const conta = await contaDe(admin, req);
    if (!conta) return json(401, { erro: 'Sessão expirada. Entre de novo no EasyAudit.' });
    const body = await req.json().catch(() => ({}));
    const origem = (req.headers.get('Origin') ?? '').replace(/\/$/, '');
    if (body.acao === 'criar') return await criar(body, conta, origem);
    if (!ehDono(conta.user)) return json(403, { erro: 'Somente o dono do EasyAudit administra as empresas.' });
    switch (body.acao) {
      case 'listar': return await listar();
      case 'atualizar': return await atualizar(body, origem);
      case 'salvar_plano': return await salvarPlano(body);
      default: return json(400, { erro: 'Ação desconhecida.' });
    }
  } catch (e) {
    return json(500, { erro: e instanceof Error ? e.message : 'Erro inesperado no servidor.' });
  }
});
