import { supabase } from './supabase';

/**
 * E-mails de acesso (recuperar senha, criar conta, reenviar confirmação) pela função "acesso" do servidor:
 * saem no layout do EasyAudit e com o link no endereço da web, que abre em qualquer aparelho.
 * Devolve a mensagem de erro em português, ou null se deu certo.
 */
export async function pedirAcesso(body: { acao: 'recuperar' | 'confirmar' } | { acao: 'cadastrar'; senha: string; dados?: Record<string, unknown> }, email: string): Promise<string | null> {
  if (!supabase) return 'O app está sem servidor configurado.';
  try {
    const { error } = await supabase.functions.invoke('acesso', { body: { ...body, email } });
    if (!error) return null;
    try { const r = (error as { context?: Response }).context; const c = r ? await r.json() : null; if (c?.erro) return String(c.erro); } catch { /* sem JSON */ }
    return 'Não foi possível falar com o servidor. Verifique a internet e tente de novo.';
  } catch {
    return 'Sem conexão com o servidor. Verifique a internet e tente de novo.';
  }
}

/** Endereço do EasyAudit na web (links que saem do app abrem aqui em qualquer aparelho). */
export const URL_WEB = (process.env.EXPO_PUBLIC_APP_URL || 'https://postoaudit.vercel.app').replace(/\/$/, '');
