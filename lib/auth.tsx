import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { registrarEvento } from './rastro';
import { supabase } from './supabase';
import { resetAll } from './sync';

/** Contas que já registraram a entrada nesta abertura do app. */
const JA_ENTROU = new Set<string>();
/** Empresa da conta logada, para quem não é componente (ex.: caminho dos arquivos enviados ao servidor). */
let empresaAtualId: string | null = null;
export const empresaAtual = () => empresaAtualId;
const PERFIL_KEY = (id: string) => `nevoeiro.perfil.${id}`;
/** Empresa cujos dados estão guardados neste aparelho (se entrar conta de outra empresa, o cache local é limpo). */
const EMPRESA_DO_APARELHO = 'easyaudit.empresa-do-aparelho';
/** Empresa dos dados guardados antes do registro acima existir (migração 20261119000100_multiempresa). */
const EMPRESA_ANTES_DO_REGISTRO = '0e7e0e10-0000-4000-8000-000000000001';
/** Escopo já limpo depois da correção do cache dos módulos carregados sob demanda (22/11/2026). */
const LIMPEZA_V2 = 'easyaudit.limpeza-caches.v2';
export type EmpresaStatus = 'aguardando' | 'ativa' | 'suspensa';
export type Empresa = { id: string; nome: string; status: EmpresaStatus; modulos: string[]; limite_contas: number; plano_id: string };
type PerfilCache = { papel: Papel; ativo: boolean; modulos: string[]; nome?: string; avatar?: string | null; empresa?: Empresa | null; filial?: string | null };

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
  /**
   * Conta de filial (id da filial): entra pelo e-mail da filial, só usa Contagens e só vê as contagens que a
   * própria filial abriu. Nula nas contas da auditoria (administrador e usuários).
   */
  filialConta: string | null;
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
  ready: false, userEmail: null, userId: null, papel: null, ativo: false, empresa: null, dono: false, isAdmin: false, filialConta: null, modulos: [], nome: '', avatar: null, podeAcessar: () => false, perfilPronto: false,
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
  const [filialConta, setFilialConta] = useState<string | null>(null);

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
    if (!supabase || !userId) { setPapel(null); setFilialConta(null); setModulos([]); setNome(''); setAvatar(null); setEmpresa(null); setDono(false); setAtivo(!supabase); setPerfilPronto(!supabase || !userId); return; }
    const { data, error } = await supabase.from('profiles').select('papel,ativo,modulos,nome,avatar,empresa_id,filial_id,empresas(id,nome,status,modulos,limite_contas,plano_id)').eq('user_id', userId).maybeSingle();
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
        filial: (data?.filial_id as string | null) ?? null,
      };
      void AsyncStorage.setItem(PERFIL_KEY(userId), JSON.stringify(perfil)).catch(() => undefined);
    }
    // Outra empresa (ou outra filial / auditoria) neste aparelho: limpa o cache local antes de ligar a sincronização
    // (dados de uma empresa nunca vão para a outra, e as contagens da auditoria não ficam no aparelho da filial).
    // Aparelho sem registro: o que estiver guardado é de antes das empresas, ou seja, da Rede Nevoeiro.
    const empId = perfil?.empresa?.id ? (perfil.filial ? `${perfil.empresa.id}|${perfil.filial}` : perfil.empresa.id) : null;
    if (empId) {
      const anterior = await AsyncStorage.getItem(EMPRESA_DO_APARELHO).catch(() => null);
      // Limpeza única (v2): aparelhos que já tinham trocado de empresa antes da correção podem ter cópias de módulos
      // ainda não abertos com dados da empresa anterior; apaga tudo uma vez e baixa de novo do servidor.
      const limpo = await AsyncStorage.getItem(LIMPEZA_V2).catch(() => null);
      if ((anterior ?? EMPRESA_ANTES_DO_REGISTRO) !== empId || limpo !== empId) {
        await resetAll();
        await AsyncStorage.setItem(LIMPEZA_V2, empId).catch(() => undefined);
      }
      if (anterior !== empId) await AsyncStorage.setItem(EMPRESA_DO_APARELHO, empId).catch(() => undefined);
    }
    empresaAtualId = perfil?.empresa?.id ?? null;
    setPapel(perfil?.papel ?? null);
    setFilialConta(perfil?.filial ?? null);
    // Perfil guardado antes da versão com empresas (sem o campo): vale só a liberação da conta (uso offline continua).
    setAtivo(perfil ? perfil.ativo && (perfil.empresa === undefined || perfil.empresa?.status === 'ativa') : !!error);
    setModulos(perfil?.modulos ?? []); setNome(perfil?.nome ?? ''); setAvatar(perfil?.avatar ?? null); setEmpresa(perfil?.empresa ?? null);
    setPerfilPronto(true);
    if (!error) void supabase.rpc('sou_dono').then(r => setDono(r.data === true), () => undefined);
    // Rastreabilidade: uma entrada por abertura do app/navegador (não a cada recarga do perfil).
    if (!error && perfil?.ativo && !JA_ENTROU.has(userId)) { JA_ENTROU.add(userId); registrarEvento('entrou', Platform.OS === 'web' ? 'navegador' : 'app'); }
  }, [userId]);

  useEffect(() => { setPerfilPronto(false); void recarregarPerfil(); }, [recarregarPerfil]);

  const signOut = useCallback(async () => { await supabase?.auth.signOut(); }, []);
  const value = useMemo(() => {
    const isAdmin = !supabase || (papel === 'admin' && !filialConta);
    // O plano da empresa limita os módulos; dentro dele, o administrador usa todos e o usuário, os liberados.
    const doPlano = (m: string) => !supabase || !empresa || empresa.modulos.includes(m);
    return {
      ready, userEmail, userId, papel, ativo, empresa, dono, isAdmin, filialConta, modulos, nome, avatar, perfilPronto, recarregarPerfil, signOut,
      // Conta de filial: só Contagens.
      podeAcessar: (m: string) => doPlano(m) && (filialConta ? m === 'coleta' : isAdmin || modulos.includes(m)),
    };
  }, [ready, userEmail, userId, papel, ativo, empresa, dono, filialConta, modulos, nome, avatar, perfilPronto, recarregarPerfil, signOut]);
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
