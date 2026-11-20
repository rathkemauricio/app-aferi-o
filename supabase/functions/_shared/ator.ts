// Rastreabilidade nas funções do servidor.
// As funções usam a chave de serviço, que passa por cima das regras do banco e não sabe quem pediu. Aqui, cada pedido
// roda "como" a conta que o fez: as gravações levam o cabeçalho x-ator, e o gatilho do banco (private.registrar_auditoria)
// registra a alteração em nome dessa conta. Só vale para a chave de serviço (conta comum não consegue se passar por outra).
//
// Uso na função:
//   import { admin, comoAtor, registrarAcao } from '../_shared/ator.ts';   // no lugar do createClient
//   ... depois de identificar a conta (contaDe):  return await comoAtor(conta.user.id, async () => { ...trata o pedido... });
import { AsyncLocalStorage } from 'node:async_hooks';
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.57.0';

const URL_SB = Deno.env.get('SUPABASE_URL')!;
const CHAVE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const OPCOES = { persistSession: false, autoRefreshToken: false } as const;

const base = createClient(URL_SB, CHAVE, { auth: OPCOES });
const pedido = new AsyncLocalStorage<SupabaseClient>();

/** Cliente de serviço: dentro de `comoAtor`, as gravações levam a conta de quem pediu; fora, é o cliente comum. */
export const admin: SupabaseClient = new Proxy(base, {
  get(_alvo, prop) {
    const c = pedido.getStore() ?? base;
    const v = Reflect.get(c, prop, c);
    return typeof v === 'function' ? v.bind(c) : v;
  },
});

/** Roda `fn` em nome da conta `userId` (as gravações no banco ficam registradas como feitas por ela). */
export function comoAtor<T>(userId: string, fn: () => Promise<T>): Promise<T> {
  const c = createClient(URL_SB, CHAVE, { auth: OPCOES, global: { headers: { 'x-ator': userId } } });
  return pedido.run(c, fn);
}

/**
 * Passa a rodar o resto do pedido em nome da conta `userId` (chame logo depois de identificar a conta).
 * Vale só para o pedido atual: cada pedido tem o seu contexto.
 */
export function entrarComoAtor(userId: string) {
  pedido.enterWith(createClient(URL_SB, CHAVE, { auth: OPCOES, global: { headers: { 'x-ator': userId } } }));
}

/**
 * Registra uma ação que não é a alteração de uma tabela (ex.: carregar os saldos do ERP, importar a base de códigos
 * de barra, enviar o resultado). Falha no registro nunca derruba a ação.
 */
export async function registrarAcao(o: {
  userId: string; empresaId?: string | null; acao: string; alvo?: string; filial?: string; detalhes?: Record<string, unknown>; tabela?: string;
}) {
  try {
    const { data: p } = await base.from('profiles').select('nome,email').eq('user_id', o.userId).maybeSingle();
    await base.from('auditoria_log').insert({
      empresa_id: o.empresaId ?? null, user_id: o.userId, usuario_nome: (p?.nome as string) || (p?.email as string) || null, usuario_email: (p?.email as string) ?? null,
      tabela: o.tabela ?? 'funcao', acao: o.acao, alvo: o.alvo?.slice(0, 160) ?? null, filial: o.filial ?? null, mudancas: o.detalhes ?? null, origem: 'servidor',
    });
  } catch (e) {
    console.error('registrarAcao', e);
  }
}
