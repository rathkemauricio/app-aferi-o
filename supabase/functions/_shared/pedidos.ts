// Pedidos de acesso a uma rede (tabela pedidos_acesso): aprovar ou recusar.
// Usado pelo administrador da rede (função "usuarios", só os pedidos da própria empresa) e pelo dono da plataforma
// (função "empresas", qualquer rede). Aprovar liga a conta à empresa com o papel e os módulos escolhidos.
import { admin, registrarAcao } from './ator.ts';
import { APP_URL, enviar, esc, layout } from './mailer.ts';

export type Resposta = { status: number; body: Record<string, unknown> };
const r = (status: number, body: Record<string, unknown>): Resposta => ({ status, body });

/** Contas ativas que ocupam vaga do plano (as contas de filial não ocupam). */
async function contasAtivas(empresaId: string) {
  const { count } = await admin.from('profiles').select('user_id', { count: 'exact', head: true }).eq('empresa_id', empresaId).eq('ativo', true).is('filial_id', null);
  return count ?? 0;
}

async function aviso(para: string, nome: string, rede: string, quem: string, aceito: boolean) {
  await enviar({
    para,
    assunto: aceito ? `Acesso liberado · ${rede}` : `Pedido de acesso · ${rede}`,
    html: layout({
      etiqueta: 'Pedido de acesso',
      titulo: aceito ? 'Seu acesso foi liberado' : 'Pedido de acesso não aprovado',
      paragrafos: aceito
        ? [`Olá${nome ? `, ${esc(nome)}` : ''}! <b style="color:#0f1f3d">${esc(quem)}</b> aprovou o seu pedido e você já faz parte da <b style="color:#0f1f3d">${esc(rede)}</b> no EasyAudit.`,
          'Entre com o seu e-mail e a sua senha: os módulos liberados para você já aparecem.']
        : [`Olá${nome ? `, ${esc(nome)}` : ''}! O seu pedido de acesso à <b style="color:#0f1f3d">${esc(rede)}</b> não foi aprovado.`,
          'Se foi engano, fale com o administrador da rede. Você também pode cadastrar o seu próprio posto ao entrar no EasyAudit.'],
      botao: APP_URL ? { texto: 'Entrar no EasyAudit', url: `${APP_URL}/login` } : undefined,
    }),
  }).catch(e => console.error('pedidos: aviso', e));
}

/**
 * Responde um pedido pendente. `somenteEmpresa`: o administrador da rede só responde os pedidos da empresa dele
 * (o dono da plataforma responde de qualquer rede). `quem`: conta que respondeu (registro e e-mail).
 */
export async function responderPedido(o: {
  pedidoId: string; aceitar: boolean; papel?: unknown; modulos?: unknown; quem: { id: string; nome: string }; somenteEmpresa?: string;
}): Promise<Resposta> {
  const { data: p } = await admin.from('pedidos_acesso').select('id,user_id,email,nome,status,empresa_id,empresas(id,nome,modulos,limite_contas)').eq('id', o.pedidoId).maybeSingle();
  if (!p || (o.somenteEmpresa && p.empresa_id !== o.somenteEmpresa)) return r(404, { erro: 'Pedido não encontrado.' });
  // deno-lint-ignore no-explicit-any
  const emp = (p as any).empresas as { id: string; nome: string; modulos: string[]; limite_contas: number };
  if (p.status !== 'pendente') return r(409, { erro: 'Este pedido já foi respondido ou cancelado. Atualize a lista.' });
  const decidir = (status: string) => admin.from('pedidos_acesso').update({ status, decidido_em: new Date().toISOString(), decidido_por: o.quem.id }).eq('id', p.id);

  if (!o.aceitar) {
    const { error } = await decidir('recusado');
    if (error) throw new Error(error.message);
    await aviso(p.email, p.nome, emp.nome, o.quem.nome, false);
    await registrarAcao({ userId: o.quem.id, empresaId: emp.id, acao: 'recusou o pedido de acesso', tabela: 'funcao:pedidos', alvo: p.email });
    return r(200, { ok: true });
  }

  const papel = o.papel === 'admin' ? 'admin' : 'usuario';
  // Só módulos que a empresa tem no plano.
  const modulos = Array.isArray(o.modulos) ? [...new Set(o.modulos.map(String).filter(m => (emp.modulos ?? []).includes(m)))] : [];
  if (papel === 'usuario' && !modulos.length) return r(400, { erro: 'Marque ao menos um módulo para a conta.' });
  const { data: perfil } = await admin.from('profiles').select('user_id,empresa_id,nome').eq('user_id', p.user_id).maybeSingle();
  if (!perfil) { await decidir('cancelado'); return r(404, { erro: 'A conta que pediu acesso não existe mais.' }); }
  if (perfil.empresa_id) { await decidir('cancelado'); return r(409, { erro: `${p.email} já faz parte de outra empresa no EasyAudit.` }); }
  const usadas = await contasAtivas(emp.id);
  const semVaga = r(409, { erro: `O plano da ${emp.nome} permite ${emp.limite_contas} conta(s) ativa(s) e todas estão em uso (${usadas}). Inative uma conta ou aumente o plano.` });
  if (usadas >= emp.limite_contas) return semVaga;
  const { error } = await admin.from('profiles').update({
    empresa_id: emp.id, papel, modulos: papel === 'admin' ? [] : modulos, ativo: true, ...(perfil.nome ? {} : p.nome ? { nome: p.nome } : {}),
  }).eq('user_id', p.user_id);
  if (error) return /limite de contas/i.test(error.message) ? semVaga : r(500, { erro: `Não foi possível ligar a conta à empresa: ${error.message}` });
  await decidir('aceito');
  await admin.auth.admin.updateUserById(p.user_id, { ban_duration: 'none' });
  await aviso(p.email, perfil.nome || p.nome, emp.nome, o.quem.nome, true);
  await registrarAcao({ userId: o.quem.id, empresaId: emp.id, acao: 'aprovou o pedido de acesso', tabela: 'funcao:pedidos', alvo: p.email, detalhes: { papel, modulos } });
  return r(200, { ok: true });
}
