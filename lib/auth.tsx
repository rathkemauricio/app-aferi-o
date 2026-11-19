import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';
import { resetAll } from './sync';

const PERFIL_KEY = (id: string) => `nevoeiro.perfil.${id}`;
/** Empresa cujos dados estão guardados neste aparelho (se entrar conta de outra empresa, o cache local é limpo). */
const EMPRESA_DO_APARELHO = 'easyaudit.empresa-do-aparelho';
export type EmpresaStatus = 'aguardando' | 'ativa' | 'suspensa';
export type Empresa = { id: string; nome: string; status: EmpresaStatus; modulos: string[]; limite_contas: number; plano_id: string };
type PerfilCache = { papel: Papel; ativo: boolean; modulos: string[]; nome?: string; avatar?: string | null; empresa?: Empresa | null };

// Sessão compartilhada por todos os módulos. Nenhum módulo deve ler o Supabase Auth diretamente.
export type Papel = 'admin' | 'usuario';

type AuthState = {
  ready: boolean;
  userEmail: string | null;
  userId: string | null;
  /** Papel do usuário. Nulo enquanto carrega ou no modo local (sem Supabase). */
  papel: Papel | null;
  /** Conta liberada pelo administrador E empresa ativa (pode usar o sistema). No modo local é sempre verdadeiro. */
  ativo: boolean;
  /** Empresa da conta (nula: conta sem empresa, ainda sem convite). */
  empresa: Empresa | null;
  /** Dono da plataforma EasyAudit (vê o painel Empresas e planos). */
  dono: boolean;
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
  ready: false, userEmail: null, userId: null, papel: null, ativo: false, empresa: null, dono: false, isAdmin: false, modulos: [], nome: '', avatar: null, podeAcessar: () => false, perfilPronto: false,
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
  const [empresa, setEmpresa] = useState<Empresa | null>(null);
  const [dono, setDono] = useState(false);

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
    if (!supabase || !userId) { setPapel(null); setModulos([]); setNome(''); setAvatar(null); setEmpresa(null); setDono(false); setAtivo(!supabase); setPerfilPronto(!supabase || !userId); return; }
    const { data, error } = await supabase.from('profiles').select('papel,ativo,modulos,nome,avatar,empresa_id,empresas(id,nome,status,modulos,limite_contas,plano_id)').eq('user_id', userId).maybeSingle();
    let perfil: PerfilCache | null;
    if (error) {
      // Sem conexão: usa o último perfil conhecido neste aparelho (o banco continua aplicando as regras ao sincronizar).
      const raw = await AsyncStorage.getItem(PERFIL_KEY(userId)).catch(() => null);
      perfil = raw ? (JSON.parse(raw) as PerfilCache) : null;
    } else {
      const emp = (data?.empresas ?? null) as unknown as Empresa | null;
      perfil = {
        papel: (data?.papel as Papel) ?? 'usuario', ativo: !!data?.ativo, modulos: Array.isArray(data?.modulos) ? (data.modulos as string[]) : [],
        nome: (data?.nome as string) ?? '', avatar: (data?.avatar as string | null) ?? null,
        empresa: emp ? { ...emp, modulos: Array.isArray(emp.modulos) ? emp.modulos : [] } : null,
      };
      void AsyncStorage.setItem(PERFIL_KEY(userId), JSON.stringify(perfil)).catch(() => undefined);
    }
    // Outra empresa neste aparelho: limpa o cache local antes de ligar a sincronização (dados de uma empresa
    // nunca vão para a outra). Na primeira vez (aparelho sem registro), só anota a empresa atual.
    const empId = perfil?.empresa?.id ?? null;
    if (empId) {
      const anterior = await AsyncStorage.getItem(EMPRESA_DO_APARELHO).catch(() => null);
      if (anterior && anterior !== empId) await resetAll();
      if (anterior !== empId) await AsyncStorage.setItem(EMPRESA_DO_APARELHO, empId).catch(() => undefined);
    }
    setPapel(perfil?.papel ?? null);
    // Perfil guardado antes da versão com empresas (sem o campo): vale só a liberação da conta (uso offline continua).
    setAtivo(perfil ? perfil.ativo && (perfil.empresa === undefined || perfil.empresa?.status === 'ativa') : !!error);
    setModulos(perfil?.modulos ?? []); setNome(perfil?.nome ?? ''); setAvatar(perfil?.avatar ?? null); setEmpresa(perfil?.empresa ?? null);
    setPerfilPronto(true);
    if (!error) void supabase.rpc('sou_dono').then(r => setDono(r.data === true), () => undefined);
  }, [userId]);

  useEffect(() => { setPerfilPronto(false); void recarregarPerfil(); }, [recarregarPerfil]);

  const signOut = useCallback(async () => { await supabase?.auth.signOut(); }, []);
  const value = useMemo(() => {
    const isAdmin = !supabase || papel === 'admin';
    // O plano da empresa limita os módulos; dentro dele, o administrador usa todos e o usuário, os liberados.
    const doPlano = (m: string) => !supabase || !empresa || empresa.modulos.includes(m);
    return {
      ready, userEmail, userId, papel, ativo, empresa, dono, isAdmin, modulos, nome, avatar, perfilPronto, recarregarPerfil, signOut,
      podeAcessar: (m: string) => doPlano(m) && (isAdmin || modulos.includes(m)),
    };
  }, [ready, userEmail, userId, papel, ativo, empresa, dono, modulos, nome, avatar, perfilPronto, recarregarPerfil, signOut]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);

/** Nome de quem está usando o app: o nome de exibição ou, sem ele, o login do e-mail (ex.: mauricio.rathke). */
export const nomeDoUsuario = (nome: string, email: string | null) => nome.trim() || email?.split('@')[0] || '';
/** Usuário logado, para preencher sozinho os campos "quem está fazendo" (aferidor, auditor, responsável pela coleta…). */
export function useUsuarioLogado() {
  const { nome, userEmail } = useAuth();
  return nomeDoUsuario(nome, userEmail);
}
