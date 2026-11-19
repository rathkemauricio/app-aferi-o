// Quem está chamando a função: conta, empresa e módulos liberados (multiempresa).
// As funções usam a chave de serviço (passa por cima das regras do banco), então TODA leitura e gravação
// precisa filtrar pela empresa de quem chamou (empresa_id) e toda inserção precisa gravar empresa_id.
import type { SupabaseClient, User } from 'npm:@supabase/supabase-js@2.57.0';

export type Empresa = { id: string; nome: string; status: 'aguardando' | 'ativa' | 'suspensa'; modulos: string[]; limite_contas: number; plano_id: string };
export type Conta = {
  user: User;
  perfil: { user_id: string; email: string; nome: string | null; papel: 'admin' | 'usuario'; ativo: boolean; modulos: string[]; empresa_id: string | null } | null;
  empresa: Empresa | null;
  /** Conta ativa, empresa ativa e módulo no plano da empresa (administrador: todos do plano; usuário: os liberados). */
  libera: (modulo: string) => boolean;
  /** Administrador ativo de empresa ativa. */
  admin: boolean;
};

/** Dono da plataforma (mesmo e-mail de private.dono_plataforma() no banco); DONO_EMAIL no servidor substitui. */
export const DONO_EMAIL = (Deno.env.get('DONO_EMAIL') ?? 'mauriciotestesdev@gmail.com').toLowerCase();
export const ehDono = (u: User) => (u.email ?? '').toLowerCase() === DONO_EMAIL && !!u.email_confirmed_at;

/** Mesma empresa da migração 20261119000100_multiempresa (dados que já existiam). */
export const REDE_NEVOEIRO = '0e7e0e10-0000-4000-8000-000000000001';

export async function contaDe(admin: SupabaseClient, req: Request): Promise<Conta | null> {
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const { data: u, error } = await admin.auth.getUser(token);
  if (error || !u.user) return null;
  const { data: p } = await admin.from('profiles')
    .select('user_id,email,nome,papel,ativo,modulos,empresa_id,empresas(id,nome,status,modulos,limite_contas,plano_id)')
    .eq('user_id', u.user.id).maybeSingle();
  // deno-lint-ignore no-explicit-any
  const empresa = ((p as any)?.empresas ?? null) as Empresa | null;
  const perfil = p ? { ...p, modulos: (p.modulos as string[] | null) ?? [] } as Conta['perfil'] : null;
  const ok = !!perfil?.ativo && empresa?.status === 'ativa';
  return {
    user: u.user, perfil, empresa,
    admin: ok && perfil!.papel === 'admin',
    libera: (m: string) => ok && (empresa!.modulos ?? []).includes(m) && (perfil!.papel === 'admin' || perfil!.modulos.includes(m)),
  };
}
