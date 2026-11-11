import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';

const PERFIL_KEY = (id: string) => `nevoeiro.perfil.${id}`;
type PerfilCache = { papel: Papel; ativo: boolean; modulos: string[]; nome?: string; avatar?: string | null };

// Sessão compartilhada por todos os módulos. Nenhum módulo deve ler o Supabase Auth diretamente.
export type Papel = 'admin' | 'usuario';

type AuthState = {
  ready: boolean;
  userEmail: string | null;
  userId: string | null;
  /** Papel do usuário. Nulo enquanto carrega ou no modo local (sem Supabase). */
  papel: Papel | null;
  /** Conta liberada pelo administrador. No modo local é sempre verdadeiro. */
  ativo: boolean;
  isAdmin: boolean;
  /** Módulos liberados pelo administrador para esta conta (administrador acessa todos). */
  modulos: string[];
  /** Nome de exibição e foto (data URL) da própria conta. */
  nome: string;
  avatar: string | null;
  podeAcessar: (modulo: string) => boolean;
  perfilPronto: boolean;
  recarregarPerfil: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthState>({
  ready: false, userEmail: null, userId: null, papel: null, ativo: false, isAdmin: false, modulos: [], nome: '', avatar: null, podeAcessar: () => false, perfilPronto: false,
  recarregarPerfil: async () => undefined, signOut: async () => undefined,
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(!supabase);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [papel, setPapel] = useState<Papel | null>(null);
  const [ativo, setAtivo] = useState(!supabase);
  const [perfilPronto, setPerfilPronto] = useState(!supabase);
  const [modulos, setModulos] = useState<string[]>([]);
  const [nome, setNome] = useState('');
  const [avatar, setAvatar] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession()
      .then(({ data }) => { setUserEmail(data.session?.user.email ?? null); setUserId(data.session?.user.id ?? null); })
      .finally(() => setReady(true));
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserEmail(session?.user.email ?? null);
      setUserId(session?.user.id ?? null);
      setReady(true);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const recarregarPerfil = useCallback(async () => {
    if (!supabase || !userId) { setPapel(null); setModulos([]); setNome(''); setAvatar(null); setAtivo(!supabase); setPerfilPronto(!supabase || !userId); return; }
    const { data, error } = await supabase.from('profiles').select('papel,ativo,modulos,nome,avatar').eq('user_id', userId).maybeSingle();
    if (error) {
      // Sem conexão: usa o último perfil conhecido neste aparelho (o banco continua aplicando as regras ao sincronizar).
      const raw = await AsyncStorage.getItem(PERFIL_KEY(userId)).catch(() => null);
      const c = raw ? (JSON.parse(raw) as PerfilCache) : null;
      setPapel(c?.papel ?? null); setAtivo(c ? c.ativo : true); setModulos(c?.modulos ?? []); setNome(c?.nome ?? ''); setAvatar(c?.avatar ?? null);
    } else {
      const perfil: PerfilCache = { papel: (data?.papel as Papel) ?? 'usuario', ativo: !!data?.ativo, modulos: Array.isArray(data?.modulos) ? (data.modulos as string[]) : [], nome: (data?.nome as string) ?? '', avatar: (data?.avatar as string | null) ?? null };
      setPapel(perfil.papel); setAtivo(perfil.ativo); setModulos(perfil.modulos); setNome(perfil.nome ?? ''); setAvatar(perfil.avatar ?? null);
      void AsyncStorage.setItem(PERFIL_KEY(userId), JSON.stringify(perfil)).catch(() => undefined);
    }
    setPerfilPronto(true);
  }, [userId]);

  useEffect(() => { setPerfilPronto(false); void recarregarPerfil(); }, [recarregarPerfil]);

  const signOut = useCallback(async () => { await supabase?.auth.signOut(); }, []);
  const value = useMemo(() => {
    const isAdmin = !supabase || papel === 'admin';
    return {
      ready, userEmail, userId, papel, ativo, isAdmin, modulos, nome, avatar, perfilPronto, recarregarPerfil, signOut,
      podeAcessar: (m: string) => isAdmin || modulos.includes(m),
    };
  }, [ready, userEmail, userId, papel, ativo, modulos, nome, avatar, perfilPronto, recarregarPerfil, signOut]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
