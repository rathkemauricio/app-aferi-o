// Empresas (clientes do EasyAudit): cadastro pelo site e painel do dono da plataforma.
//
// Chamada do app (supabase.functions.invoke('empresas', { body })), com o JWT de quem está logado:
//   { acao: 'criar', nome?, documento?, telefone?, plano_id? }
//        conta sem empresa cria a própria empresa (o posto, pelo app, ou a rede, pelo site) e vira administradora
//        dela. A empresa já nasce ativa, com todos os módulos (vazios) e o limite de contas do plano (padrão:
//        essencial); o dono ajusta depois em Empresas e planos. Sem os campos, usa os dados guardados no cadastro
//        do site (user_metadata.empresa_pendente). → { ok, empresa_id }
//   Conta sem empresa, para entrar numa rede que já usa o EasyAudit (só pede; quem libera é o administrador dela):
//   { acao: 'redes' }                  → { ok, redes: [{ id, nome }], pedido: { id, empresa_id, empresa_nome, status, created_at } | null }
//   { acao: 'pedir_acesso', empresa_id } → { ok }   (um pedido aberto por conta: pedir outra rede cancela o anterior)
//   { acao: 'cancelar_pedido' }        → { ok }
//   Dono da plataforma:
//   { acao: 'listar' }  → { ok, empresas: [...com contas, administradores e pedidos de acesso pendentes], planos, sem_rede: [contas sem rede] }
//   { acao: 'mover_conta', user_id, empresa_id | null, papel, modulos }
//        muda a conta de rede (ou a tira de qualquer rede); a pessoa recebe um e-mail → { ok }
//   { acao: 'aceitar_pedido', pedido_id, papel, modulos } / { acao: 'recusar_pedido', pedido_id }
//        responde o pedido de quem quer entrar numa rede (no lugar do administrador dela) → { ok }
//   { acao: 'atualizar', id, status?, plano_id?, limite_contas?, modulos?, nome? }  → { ok }
//        ao liberar uma empresa (status 'ativa'), os administradores dela recebem um e-mail.
//   { acao: 'salvar_plano', id, nome?, descricao?, preco_mensal?, limite_contas?, modulos?, ativo? } → { ok }
//   { acao: 'criar_para', nome, plano_id, modulos?, limite_contas?, documento?, telefone?, admin_nome, admin_email }
//        cria a empresa já liberada e convida o administrador dela por e-mail (ele cria a senha). → { ok, empresa_id }
//
// Publicar: npx supabase functions deploy empresas --no-verify-jwt
// Secrets opcionais: APP_URL (endereço do EasyAudit na web, para os links dos e-mails) e DONO_EMAIL.
import { admin, entrarComoAtor, registrarAcao } from '../_shared/ator.ts';
import { contaDe, DONO_EMAIL, ehDono } from '../_shared/conta.ts';
import { APP_URL, EMAIL_RE, enviar, esc, layout } from '../_shared/mailer.ts';
import { responderPedido } from '../_shared/pedidos.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

// Mesmos ids de modules/registry.ts.
const MODULOS = ['afericoes', 'tempos', 'croqui', 'auditoria', 'riscos', 'inventarios', 'agenda', 'coleta', 'tanques'];
const texto = (v: unknown, max: number) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const soModulos = (v: unknown) => (Array.isArray(v) ? [...new Set(v.map(String).filter(m => MODULOS.includes(m)))] : null);

type Pedido = { nome?: unknown; documento?: unknown; telefone?: unknown; plano_id?: unknown };
type Conta = NonNullable<Awaited<ReturnType<typeof contaDe>>>;

async function criar(body: Pedido, conta: Conta, origem: string) {
  if (conta.perfil?.empresa_id) return json(409, { erro: 'Esta conta já faz parte de uma empresa.' });
  const meta = (conta.user.user_metadata ?? {}) as Record<string, unknown>;
  const pendente = (meta.empresa_pendente ?? {}) as Pedido;
  const dados = body.nome ? body : pendente;
  const nome = texto(dados.nome, 120);
  if (nome.length < 2) return json(400, { erro: 'Informe o nome da empresa.' });
  const { data: plano } = await admin.from('planos').select('id,nome,limite_contas,modulos,ativo').eq('id', texto(dados.plano_id, 40) || 'essencial').maybeSingle();
  if (!plano?.ativo) return json(400, { erro: 'Escolha um dos planos disponíveis.' });

  // Cadastro por conta própria: a pessoa já entra como dona, com todos os módulos (vazios).
  const { data: emp, error } = await admin.from('empresas').insert({
    nome, documento: texto(dados.documento, 30), telefone: texto(dados.telefone, 30), plano_id: plano.id,
    limite_contas: plano.limite_contas, modulos: MODULOS, status: 'ativa', criado_por: conta.user.id,
  }).select('id').single();
  if (error || !emp) throw new Error(`Não foi possível cadastrar a empresa: ${error?.message ?? ''}`);
  const nomePessoa = texto(meta.nome, 80) || conta.perfil?.nome || '';
  const { error: e2 } = await admin.from('profiles').update({ empresa_id: emp.id, papel: 'admin', ativo: true, modulos: [], ...(nomePessoa ? { nome: nomePessoa } : {}) }).eq('user_id', conta.user.id);
  if (e2) {
    await admin.from('empresas').delete().eq('id', emp.id);
    throw new Error(`Não foi possível ligar a sua conta à empresa: ${e2.message}`);
  }
  if (meta.empresa_pendente) await admin.auth.admin.updateUserById(conta.user.id, { user_metadata: { ...meta, empresa_pendente: null } });
  // Quem cadastra o próprio posto desiste de entrar numa rede: o pedido aberto, se houver, é cancelado.
  await admin.from('pedidos_acesso').update({ status: 'cancelado', decidido_em: new Date().toISOString() }).eq('user_id', conta.user.id).eq('status', 'pendente');

  // Aviso ao dono da plataforma (falha no e-mail não desfaz o cadastro).
  const base = APP_URL;
  await enviar({
    para: DONO_EMAIL,
    assunto: `Nova empresa no EasyAudit: ${nome}`,
    html: layout({
      titulo: 'Nova empresa no EasyAudit',
      paragrafos: [
        `<b>${esc(nome)}</b> se cadastrou no plano <b>${esc(plano.nome)}</b> (até ${plano.limite_contas} contas), com todos os módulos.`,
        `Administrador: ${esc(nomePessoa || conta.user.email)} (${esc(conta.user.email)})${texto(dados.telefone, 30) ? `, telefone ${esc(texto(dados.telefone, 30))}` : ''}${texto(dados.documento, 30) ? `, CNPJ ${esc(texto(dados.documento, 30))}` : ''}.`,
        'A empresa já está usando o sistema, com os módulos vazios. Plano, contas e módulos se ajustam (ou a empresa se suspende) em Empresas e planos.',
      ],
      botao: base ? { texto: 'Abrir Empresas e planos', url: `${base}/plataforma` } : undefined,
    }),
  }).catch(e => console.error('empresas: aviso ao dono', e));
  return json(200, { ok: true, empresa_id: emp.id });
}

/* ---------- Conta sem empresa pedindo para entrar numa rede ---------- */
async function pedidoAberto(userId: string) {
  const { data } = await admin.from('pedidos_acesso').select('id,empresa_id,status,created_at,empresas(nome)')
    .eq('user_id', userId).order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (!data) return null;
  // deno-lint-ignore no-explicit-any
  return { id: data.id, empresa_id: data.empresa_id, empresa_nome: ((data as any).empresas?.nome as string) ?? '', status: data.status, created_at: data.created_at };
}

/** Redes que já usam o EasyAudit (só o nome) e o último pedido da conta. Só para conta sem empresa. */
async function redes(conta: Conta) {
  if (conta.perfil?.empresa_id) return json(409, { erro: 'Esta conta já faz parte de uma empresa.' });
  const { data, error } = await admin.from('empresas').select('id,nome').eq('status', 'ativa').order('nome');
  if (error) throw new Error(error.message);
  return json(200, { ok: true, redes: data ?? [], pedido: await pedidoAberto(conta.user.id) });
}

async function pedirAcesso(body: Record<string, unknown>, conta: Conta) {
  if (conta.perfil?.empresa_id) return json(409, { erro: 'Esta conta já faz parte de uma empresa.' });
  if (conta.perfil?.filial_id) return json(403, { erro: 'Conta de filial não pede acesso a outra rede.' });
  const empresaId = texto(body.empresa_id, 60);
  const { data: emp } = await admin.from('empresas').select('id,nome,status').eq('id', empresaId).maybeSingle();
  if (!emp || emp.status !== 'ativa') return json(404, { erro: 'Rede não encontrada. Atualize a lista e escolha de novo.' });
  const email = (conta.user.email ?? '').toLowerCase();
  const nome = conta.perfil?.nome?.trim() || texto((conta.user.user_metadata ?? {}).nome, 80);

  // Um pedido aberto por conta: pedir outra rede cancela o anterior; pedir a mesma de novo não duplica.
  const atual = await pedidoAberto(conta.user.id);
  if (atual?.status === 'pendente' && atual.empresa_id === emp.id) return json(200, { ok: true });
  await admin.from('pedidos_acesso').update({ status: 'cancelado', decidido_em: new Date().toISOString() }).eq('user_id', conta.user.id).eq('status', 'pendente');
  const { error } = await admin.from('pedidos_acesso').insert({ empresa_id: emp.id, user_id: conta.user.id, email, nome });
  if (error) throw new Error(`Não foi possível registrar o pedido: ${error.message}`);

  // Avisa os administradores da rede (falha no e-mail não desfaz o pedido).
  const { data: adms } = await admin.from('profiles').select('email,nome').eq('empresa_id', emp.id).eq('papel', 'admin').eq('ativo', true).is('filial_id', null);
  for (const a of adms ?? []) {
    await enviar({
      para: a.email,
      assunto: `Pedido de acesso à ${emp.nome}`,
      html: layout({
        etiqueta: 'Pedido de acesso',
        titulo: 'Alguém pediu para entrar na sua rede',
        paragrafos: [
          `Olá${a.nome ? `, ${esc(a.nome)}` : ''}! <b style="color:#0f1f3d">${esc(nome || email)}</b> (${esc(email)}) pediu acesso à <b style="color:#0f1f3d">${esc(emp.nome)}</b> no EasyAudit.`,
          'A conta ainda não vê nenhum dado da rede. Para liberar, abra Usuários e permissões, escolha os módulos e aprove. Se não conhece a pessoa, recuse.',
        ],
        botao: APP_URL ? { texto: 'Abrir Usuários e permissões', url: `${APP_URL}/usuarios` } : undefined,
      }),
    }).catch(e => console.error('empresas: aviso de pedido', e));
  }
  await registrarAcao({ userId: conta.user.id, empresaId: emp.id, acao: 'pediu acesso à rede', tabela: 'funcao:empresas', alvo: email });
  return json(200, { ok: true });
}

async function cancelarPedido(conta: Conta) {
  const { error } = await admin.from('pedidos_acesso').update({ status: 'cancelado', decidido_em: new Date().toISOString() }).eq('user_id', conta.user.id).eq('status', 'pendente');
  if (error) throw new Error(error.message);
  return json(200, { ok: true });
}

/** Dono da plataforma: cria uma empresa já liberada para outra pessoa, que vira a administradora dela. */
async function criarPara(body: Record<string, unknown>, conta: NonNullable<Awaited<ReturnType<typeof contaDe>>>) {
  const nome = texto(body.nome, 120);
  const adminNome = texto(body.admin_nome, 80);
  const email = texto(body.admin_email, 200).toLowerCase();
  if (nome.length < 2) return json(400, { erro: 'Informe o nome da empresa.' });
  if (!adminNome) return json(400, { erro: 'Informe o nome do administrador da empresa.' });
  if (!EMAIL_RE.test(email)) return json(400, { erro: 'Informe um e-mail válido para o administrador.' });
  const { data: plano } = await admin.from('planos').select('id,nome,limite_contas,modulos').eq('id', texto(body.plano_id, 40)).maybeSingle();
  if (!plano) return json(400, { erro: 'Escolha um plano.' });
  const modulos = soModulos(body.modulos) ?? (plano.modulos as string[]);
  if (!modulos.length) return json(400, { erro: 'Deixe ao menos um módulo para a empresa.' });
  const limite = body.limite_contas === undefined || body.limite_contas === '' ? plano.limite_contas : Math.floor(Number(body.limite_contas));
  if (!(limite >= 1 && limite <= 100000)) return json(400, { erro: 'Limite de contas inválido.' });

  const { data: existente } = await admin.from('profiles').select('user_id,empresa_id,nome').eq('email', email).maybeSingle();
  if (existente?.empresa_id) return json(409, { erro: `${email} já pertence a uma empresa no EasyAudit. Use outro e-mail para o administrador.` });

  const { data: emp, error } = await admin.from('empresas').insert({
    nome, documento: texto(body.documento, 30), telefone: texto(body.telefone, 30), plano_id: plano.id,
    limite_contas: limite, modulos, status: 'ativa', criado_por: conta.user.id,
  }).select('id').single();
  if (error || !emp) throw new Error(`Não foi possível criar a empresa: ${error?.message ?? ''}`);
  const desfazer = async () => { await admin.from('empresas').delete().eq('id', emp.id); };
  const voltar = `${APP_URL}/redefinir-senha?convite=1`;
  const perfil = { empresa_id: emp.id, email, nome: existente?.nome || adminNome, papel: 'admin', modulos: [], ativo: true };

  let link: string | undefined;
  if (existente) {
    const { error: e1 } = await admin.from('profiles').update(perfil).eq('user_id', existente.user_id);
    if (e1) { await desfazer(); return json(500, { erro: `Não foi possível ligar a conta à empresa: ${e1.message}` }); }
    await admin.auth.admin.updateUserById(existente.user_id, { ban_duration: 'none' });
    const { data: l } = await admin.auth.admin.generateLink({ type: 'recovery', email, options: { redirectTo: voltar } });
    link = l?.properties?.action_link;
  } else {
    const { data, error: e2 } = await admin.auth.admin.generateLink({ type: 'invite', email, options: { data: { nome: adminNome }, redirectTo: voltar } });
    if (e2 || !data.user || !data.properties?.action_link) { await desfazer(); throw new Error(e2?.message || 'Falha ao gerar o convite.'); }
    const { error: e3 } = await admin.from('profiles').update(perfil).eq('user_id', data.user.id);
    if (e3) { await admin.auth.admin.deleteUser(data.user.id).catch(() => undefined); await desfazer(); return json(500, { erro: `Não foi possível preparar a conta: ${e3.message}` }); }
    link = data.properties.action_link;
  }
  if (link) {
    await enviar({
      para: email,
      assunto: `${nome} já está no EasyAudit`,
      html: layout({
        etiqueta: 'Nova empresa',
        titulo: 'A sua empresa já está no EasyAudit',
        paragrafos: [`Olá, ${esc(adminNome.split(' ')[0])}! A <b style="color:#0f1f3d">${esc(nome)}</b> foi cadastrada no EasyAudit e você é o administrador dela.`],
        destaques: [{ rotulo: 'Empresa', valor: nome }, { rotulo: 'Plano', valor: String(plano.nome) }, { rotulo: 'Contas', valor: `até ${limite}` }, { rotulo: 'Seu login', valor: email }],
        passos: [
          'Toque no botão abaixo e crie a sua senha.',
          `Entre no app do celular ou em <a href="${APP_URL}/login" style="color:#0f1f3d;font-weight:700">${esc(APP_URL.replace(/^https?:\/\//, ''))}</a>.`,
          'Em Usuários e permissões, crie as contas da sua equipe e das filiais.',
        ],
        botao: { texto: 'Criar minha senha', url: link },
        rodape: 'O link vale por pouco tempo. Se expirar, use "Esqueci a senha" na tela de entrada.',
      }),
    });
  }
  return json(200, { ok: true, empresa_id: emp.id });
}

async function listar() {
  const [{ data: empresas, error }, { data: planos }, { data: perfis }, { data: pedidos }] = await Promise.all([
    admin.from('empresas').select('*').order('created_at', { ascending: false }),
    admin.from('planos').select('*').order('ordem'),
    admin.from('profiles').select('user_id,empresa_id,email,nome,papel,ativo,modulos,filial_id,created_at').order('created_at'),
    admin.from('pedidos_acesso').select('id,empresa_id,email,nome,created_at').eq('status', 'pendente').order('created_at'),
  ]);
  if (error) throw new Error(error.message);
  const conta = (p: NonNullable<typeof perfis>[number]) => ({
    user_id: p.user_id, email: p.email, nome: p.nome, papel: p.papel, ativo: p.ativo, modulos: p.modulos ?? [], filial: !!p.filial_id, created_at: p.created_at,
  });
  const lista = (empresas ?? []).map(e => {
    const contas = (perfis ?? []).filter(p => p.empresa_id === e.id);
    return {
      ...e,
      contas_ativas: contas.filter(p => p.ativo && !p.filial_id).length,
      administradores: contas.filter(p => p.papel === 'admin').map(p => ({ email: p.email, nome: p.nome })),
      // Todas as contas da rede (o dono pode mudar uma conta de rede).
      contas: contas.map(conta),
      // Quem pediu para entrar nesta rede e ainda espera resposta.
      pedidos: (pedidos ?? []).filter(p => p.empresa_id === e.id).map(({ empresa_id: _e, ...p }) => p),
    };
  });
  // Contas que ainda não fazem parte de nenhuma rede (criaram a conta e não escolheram, ou foram tiradas de uma rede).
  const semRede = (perfis ?? []).filter(p => !p.empresa_id).map(conta);
  return json(200, { ok: true, empresas: lista, planos: planos ?? [], sem_rede: semRede });
}

/**
 * Dono da plataforma: muda uma conta de rede (ou a tira de qualquer rede, com empresa_id nulo). A conta entra na
 * rede de destino com o papel e os módulos escolhidos; os registros que ela já fez continuam na rede de origem.
 */
async function moverConta(body: Record<string, unknown>, conta: Conta) {
  const userId = texto(body.user_id, 60);
  const destino = body.empresa_id ? texto(body.empresa_id, 60) : null;
  const { data: p } = await admin.from('profiles').select('user_id,email,nome,empresa_id,filial_id,empresas(nome)').eq('user_id', userId).maybeSingle();
  if (!p) return json(404, { erro: 'Conta não encontrada.' });
  if (p.filial_id) return json(400, { erro: 'Conta de filial fica presa à filial dela. Bloqueie o acesso da filial e crie outro na rede de destino.' });
  if ((p.empresa_id ?? null) === destino) return json(400, { erro: destino ? 'A conta já está nessa rede.' : 'A conta já está sem rede.' });
  // deno-lint-ignore no-explicit-any
  const origem = ((p as any).empresas?.nome as string) ?? '';

  let mudar: Record<string, unknown>;
  let nomeDestino = '';
  if (destino) {
    const { data: emp } = await admin.from('empresas').select('id,nome,modulos,limite_contas').eq('id', destino).maybeSingle();
    if (!emp) return json(404, { erro: 'Rede de destino não encontrada.' });
    nomeDestino = emp.nome;
    const papel = body.papel === 'admin' ? 'admin' : 'usuario';
    const modulos = Array.isArray(body.modulos) ? [...new Set(body.modulos.map(String).filter(m => (emp.modulos ?? []).includes(m)))] : [];
    if (papel === 'usuario' && !modulos.length) return json(400, { erro: 'Marque ao menos um módulo para a conta na rede de destino.' });
    const { count } = await admin.from('profiles').select('user_id', { count: 'exact', head: true }).eq('empresa_id', emp.id).eq('ativo', true).is('filial_id', null);
    if ((count ?? 0) >= emp.limite_contas) return json(409, { erro: `A ${emp.nome} já usa todas as ${emp.limite_contas} contas do plano. Aumente o limite dela antes.` });
    mudar = { empresa_id: emp.id, papel, modulos: papel === 'admin' ? [] : modulos, ativo: true };
  } else {
    // Sem rede: volta para a tela de escolher entre cadastrar o posto ou pedir acesso a uma rede.
    mudar = { empresa_id: null, papel: 'usuario', modulos: [], ativo: false };
  }
  const { error } = await admin.from('profiles').update(mudar).eq('user_id', p.user_id);
  if (error) return json(/limite de contas/i.test(error.message) ? 409 : 500, { erro: `Não foi possível mudar a conta de rede: ${error.message}` });
  await admin.from('pedidos_acesso').update({ status: 'cancelado', decidido_em: new Date().toISOString(), decidido_por: conta.user.id }).eq('user_id', p.user_id).eq('status', 'pendente');
  if (destino) await admin.auth.admin.updateUserById(p.user_id, { ban_duration: 'none' });

  await enviar({
    para: p.email,
    assunto: destino ? `Sua conta agora é da ${nomeDestino}` : 'Sua conta saiu da rede no EasyAudit',
    html: layout({
      etiqueta: 'Sua conta',
      titulo: destino ? 'Sua conta mudou de rede' : 'Sua conta saiu da rede',
      paragrafos: destino
        ? [`Olá${p.nome ? `, ${esc(p.nome)}` : ''}! A sua conta no EasyAudit agora faz parte da <b style="color:#0f1f3d">${esc(nomeDestino)}</b>${origem ? ` (antes: ${esc(origem)})` : ''}.`,
          'Entre com o mesmo e-mail e senha: você passa a ver os dados e os módulos da nova rede.']
        : [`Olá${p.nome ? `, ${esc(p.nome)}` : ''}! A sua conta no EasyAudit não faz mais parte da ${esc(origem || 'rede')}.`,
          'Ao entrar, você pode cadastrar o seu posto ou pedir acesso a outra rede.'],
      botao: APP_URL ? { texto: 'Entrar no EasyAudit', url: `${APP_URL}/login` } : undefined,
    }),
  }).catch(e => console.error('empresas: aviso de mudança de rede', e));
  await registrarAcao({ userId: conta.user.id, empresaId: (p.empresa_id as string | null) ?? null, acao: destino ? `mudou a conta para a rede ${nomeDestino}` : 'tirou a conta da rede', tabela: 'funcao:empresas', alvo: p.email });
  if (destino) await registrarAcao({ userId: conta.user.id, empresaId: destino, acao: `recebeu a conta vinda de ${origem || 'nenhuma rede'}`, tabela: 'funcao:empresas', alvo: p.email });
  return json(200, { ok: true });
}

/**
 * Visita do dono: entra numa rede para acompanhar ("só ver", o banco barra toda gravação) ou para administrar
 * (`editar: true`, grava como administrador da rede). Sem empresa_id = sai da visita.
 */
async function visitar(body: Record<string, unknown>, conta: NonNullable<Awaited<ReturnType<typeof contaDe>>>) {
  const id = texto(body.empresa_id, 60);
  const editar = body.editar === true;
  const atual = conta.perfil?.visitando ?? null;
  if (!id) {
    const { error } = await admin.from('profiles').update({ visitando: null, visita_edita: false }).eq('user_id', conta.user.id);
    if (error) throw new Error(error.message);
    if (atual) await registrarAcao({ userId: conta.user.id, empresaId: atual, acao: 'saiu da visita à rede', tabela: 'funcao:empresas', alvo: atual });
    return json(200, { ok: true });
  }
  const { data: emp } = await admin.from('empresas').select('id,nome,status').eq('id', id).maybeSingle();
  if (!emp) return json(404, { erro: 'Rede não encontrada.' });
  if (emp.status !== 'ativa') return json(409, { erro: 'Só dá para entrar em rede ativa. Reative a rede antes.' });
  // A própria rede é o mesmo que sair da visita.
  const visitando = emp.id === conta.perfil?.empresa_id ? null : emp.id;
  const { error } = await admin.from('profiles').update({ visitando, visita_edita: !!visitando && editar }).eq('user_id', conta.user.id);
  if (error) throw new Error(error.message);
  if (visitando) await registrarAcao({ userId: conta.user.id, empresaId: emp.id, acao: editar ? `entrou na rede ${emp.nome} para administrar (pode alterar)` : `entrou na rede ${emp.nome} como auditor (só ver)`, tabela: 'funcao:empresas', alvo: emp.id });
  return json(200, { ok: true, nome: emp.nome });
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
    entrarComoAtor(conta.user.id); // rastreabilidade: as gravações ficam em nome de quem pediu
    const body = await req.json().catch(() => ({}));
    const origem = (req.headers.get('Origin') ?? '').replace(/\/$/, '');
    if (body.acao === 'criar') return await criar(body, conta, origem);
    if (body.acao === 'redes') return await redes(conta);
    if (body.acao === 'pedir_acesso') return await pedirAcesso(body, conta);
    if (body.acao === 'cancelar_pedido') return await cancelarPedido(conta);
    if (!ehDono(conta.user)) return json(403, { erro: 'Somente o dono do EasyAudit administra as empresas.' });
    switch (body.acao) {
      case 'listar': return await listar();
      case 'atualizar': return await atualizar(body, origem);
      case 'salvar_plano': return await salvarPlano(body);
      case 'criar_para': return await criarPara(body, conta);
      case 'mover_conta': return await moverConta(body, conta);
      case 'visitar': return await visitar(body, conta);
      case 'aceitar_pedido':
      case 'recusar_pedido': {
        const res = await responderPedido({
          pedidoId: texto(body.pedido_id, 60), aceitar: body.acao === 'aceitar_pedido', papel: body.papel, modulos: body.modulos,
          quem: { id: conta.user.id, nome: 'O EasyAudit' },
        });
        return json(res.status, res.body);
      }
      default: return json(400, { erro: 'Ação desconhecida.' });
    }
  } catch (e) {
    return json(500, { erro: e instanceof Error ? e.message : 'Erro inesperado no servidor.' });
  }
});
