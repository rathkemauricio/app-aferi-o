import { supabase } from './supabase';

/**
 * Rastreabilidade: registra no servidor um evento que não altera dados (entrar no sistema, exportar PDF).
 * As alterações de dados são registradas pelo próprio banco. Nunca derruba nem atrasa a ação do usuário.
 */
export type EventoRastro = 'entrou' | 'exportou PDF' | 'exportou arquivo';
export function registrarEvento(acao: EventoRastro, alvo?: string) {
  if (!supabase) return;
  void supabase.rpc('registrar_evento', { acao, alvo: alvo ?? null }).then(() => undefined, () => undefined);
}
