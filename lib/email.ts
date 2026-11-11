// Envio de e-mails pelo servidor (Edge Function "notificar", com Nodemailer). O app nunca fala com o SMTP direto.
import { supabase } from './supabase';

export type PedidoEmail =
  | { acao: 'conta_pendente' }
  | { acao: 'conta_alterada'; user_id: string }
  | { acao: 'relatorio'; para: string[]; titulo: string; html: string; pdf_base64?: string; nome_arquivo?: string };

export type ResultadoEmail = { ok: true } | { ok: false; erro: string };

const EMAIL_RE = /^[^\s@<>(),;:"]+@[^\s@<>(),;:"]+\.[^\s@<>(),;:"]+$/;

/** Separa uma lista digitada ("a@x.com, b@y.com; c@z.com") em e-mails normalizados, sem repetir. */
export function separarEmails(texto: string) {
  return [...new Set(texto.split(/[\s,;]+/).map(e => e.trim().toLowerCase()).filter(Boolean))];
}
export const emailValido = (email: string) => EMAIL_RE.test(email);

export async function enviarEmail(pedido: PedidoEmail): Promise<ResultadoEmail> {
  if (!supabase) return { ok: false, erro: 'O app está em modo local, sem servidor para enviar e-mails.' };
  const { error } = await supabase.functions.invoke('notificar', { body: pedido });
  if (!error) return { ok: true };
  // Erro HTTP da função: a mensagem em português vem no corpo ({ erro }).
  let erro = 'Não foi possível falar com o servidor. Verifique a conexão.';
  try {
    const resposta = (error as { context?: Response }).context;
    const corpo = resposta ? await resposta.json() : null;
    if (corpo?.erro) erro = String(corpo.erro);
  } catch { /* corpo não era JSON */ }
  return { ok: false, erro };
}
