import { createContext, type ReactNode, type RefObject, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { View } from 'react-native';
import { Camada } from './Camada';
import type { Armazenamento, ElementoAlvo, Passo, RotulosTutorial, TemaTutorial, Tutorial } from './tipos';

export const TEMA_PADRAO: TemaTutorial = {
  veu: 'rgba(8, 16, 34, 0.62)', cartao: '#ffffff', borda: '#e2e7ef', texto: '#0f1f3d', textoSuave: '#4a5873',
  destaque: '#0f1f3d', sobreDestaque: '#ffffff', pulso: '#5fd39a',
};
export const ROTULOS_PADRAO: RotulosTutorial = {
  proximo: 'Próximo', voltar: 'Voltar', pular: 'Pular', concluir: 'Concluir', toqueParaSeguir: 'Toque no destaque para continuar',
  progresso: (a, t) => `${a} de ${t}`,
};

/** Guarda só na memória (some ao fechar o app). Use `armazenamentoAsync` para guardar de verdade. */
const memoria = new Map<string, string>();
const ARMAZENAMENTO_MEMORIA: Armazenamento = { ler: async k => memoria.get(k) ?? null, gravar: async (k, v) => { memoria.set(k, v); } };
/** Adaptador para qualquer armazenamento no formato do AsyncStorage (getItem/setItem). */
export const armazenamentoAsync = (s: { getItem: (k: string) => Promise<string | null>; setItem: (k: string, v: string) => Promise<void> }): Armazenamento =>
  ({ ler: k => s.getItem(k).catch(() => null), gravar: (k, v) => s.setItem(k, v).catch(() => undefined) });

type Ctx = {
  tutoriais: Tutorial[];
  ativo: { tutorial: Tutorial; indice: number } | null;
  iniciar: (id: string) => void;
  parar: (concluido?: boolean) => void;
  avancar: () => void;
  voltar: () => void;
  vistos: Set<string>;
  /** Já viu (concluiu ou pulou) este tutorial. */
  jaVisto: (id: string) => boolean;
  /** Esquece os tutoriais vistos (todos ou um). */
  esquecer: (id?: string) => void;
  carregado: boolean;
  registrar: (id: string, ref: RefObject<ElementoAlvo | null>) => void;
  remover: (id: string, ref: RefObject<ElementoAlvo | null>) => void;
  alvo: (id: string) => RefObject<ElementoAlvo | null> | undefined;
  tocou: (id: string) => void;
  tema: TemaTutorial;
  rotulos: RotulosTutorial;
};
const Contexto = createContext<Ctx | null>(null);

/**
 * Envolve o app (de preferência por fora de qualquer transform/zoom, para o destaque cair no lugar certo).
 * Desenha a camada do tutorial por cima dos filhos.
 */
export function TutorialProvider({ tutoriais, children, armazenamento = ARMAZENAMENTO_MEMORIA, chave = 'tutoriais.vistos.v1', tema, rotulos, aoConcluir }: {
  tutoriais: Tutorial[];
  children: ReactNode;
  armazenamento?: Armazenamento;
  /** Chave onde a lista de tutoriais vistos é guardada. */
  chave?: string;
  tema?: Partial<TemaTutorial>;
  rotulos?: Partial<RotulosTutorial>;
  /** Chamado ao terminar (concluído = chegou ao fim; senão, pulou). */
  aoConcluir?: (id: string, concluido: boolean) => void;
}) {
  const alvos = useRef(new Map<string, RefObject<ElementoAlvo | null>>());
  const [ativo, setAtivo] = useState<Ctx['ativo']>(null);
  const [vistos, setVistos] = useState<Set<string>>(new Set());
  const [carregado, setCarregado] = useState(false);
  const temaFinal = useMemo(() => ({ ...TEMA_PADRAO, ...tema }), [tema]);
  const rotulosFinal = useMemo(() => ({ ...ROTULOS_PADRAO, ...rotulos }), [rotulos]);
  const ativoRef = useRef(ativo);
  ativoRef.current = ativo;

  useEffect(() => {
    void armazenamento.ler(chave).then(v => { try { if (v) setVistos(new Set(JSON.parse(v) as string[])); } catch { /* corrompido */ } }).finally(() => setCarregado(true));
  }, [armazenamento, chave]);
  const guardar = useCallback((s: Set<string>) => { setVistos(s); void armazenamento.gravar(chave, JSON.stringify([...s])); }, [armazenamento, chave]);

  const parar = useCallback((concluido = false) => {
    const a = ativoRef.current;
    if (!a) return;
    setAtivo(null);
    guardar(new Set([...vistosRef.current, a.tutorial.id]));
    aoConcluir?.(a.tutorial.id, concluido);
  }, [guardar, aoConcluir]);
  const vistosRef = useRef(vistos);
  vistosRef.current = vistos;

  const iniciar = useCallback((id: string) => {
    const t = tutoriais.find(x => x.id === id);
    if (t?.passos.length) setAtivo({ tutorial: t, indice: 0 });
  }, [tutoriais]);
  const avancar = useCallback(() => {
    const a = ativoRef.current;
    if (!a) return;
    if (a.indice >= a.tutorial.passos.length - 1) parar(true);
    else setAtivo({ ...a, indice: a.indice + 1 });
  }, [parar]);
  const voltar = useCallback(() => {
    const a = ativoRef.current;
    if (a && a.indice > 0) setAtivo({ ...a, indice: a.indice - 1 });
  }, []);
  /** Passo opcional sem alvo na tela: segue na mesma direção. */
  const pularPasso = useCallback((direcao: 1 | -1) => {
    const a = ativoRef.current;
    if (!a) return;
    const n = a.indice + direcao;
    if (n < 0) setAtivo({ ...a, indice: 0 });
    else if (n >= a.tutorial.passos.length) parar(true);
    else setAtivo({ ...a, indice: n });
  }, [parar]);

  const valor = useMemo<Ctx>(() => ({
    tutoriais, ativo, iniciar, parar, avancar, voltar, vistos, carregado,
    jaVisto: id => vistos.has(id),
    esquecer: id => guardar(id ? new Set([...vistos].filter(x => x !== id)) : new Set()),
    registrar: (id, ref) => { alvos.current.set(id, ref); },
    remover: (id, ref) => { if (alvos.current.get(id) === ref) alvos.current.delete(id); },
    alvo: id => alvos.current.get(id),
    tocou: id => {
      const a = ativoRef.current;
      const p: Passo | undefined = a?.tutorial.passos[a.indice];
      if (p?.alvo === id && p.acao === 'toque') avancar();
    },
    tema: temaFinal, rotulos: rotulosFinal,
  }), [tutoriais, ativo, iniciar, parar, avancar, voltar, vistos, carregado, guardar, temaFinal, rotulosFinal]);

  return (
    <Contexto.Provider value={valor}>
      <View style={{ flex: 1 }}>
        {children}
        {ativo ? <Camada key={ativo.tutorial.id} pularPasso={pularPasso} /> : null}
      </View>
    </Contexto.Provider>
  );
}

/** Contexto ou null (fora do provider). */
export const useTutorialOpcional = () => useContext(Contexto);

export function useTutorialInterno() {
  const c = useContext(Contexto);
  if (!c) throw new Error('Use os tutoriais dentro de <TutorialProvider>.');
  return c;
}

/** API pública: iniciar, saber se já viu, recomeçar. */
export function useTutorial() {
  const c = useContext(Contexto);
  return {
    disponivel: !!c,
    tutoriais: c?.tutoriais ?? [],
    emAndamento: c?.ativo?.tutorial.id ?? null,
    iniciar: (id: string) => c?.iniciar(id),
    parar: () => c?.parar(false),
    jaVisto: (id: string) => c?.jaVisto(id) ?? false,
    esquecer: (id?: string) => c?.esquecer(id),
    carregado: c?.carregado ?? false,
  };
}

/**
 * Abre o tutorial sozinho na primeira vez (por aparelho), quando `quando` for verdadeiro.
 * Ex.: useTutorialAutomatico('primeiros-passos', telaPronta)
 */
export function useTutorialAutomatico(id: string, quando = true, esperaMs = 900) {
  const c = useContext(Contexto);
  const ja = useRef(false);
  useEffect(() => {
    if (!c || !c.carregado || !quando || ja.current || c.ativo || c.jaVisto(id)) return;
    ja.current = true;
    const t = setTimeout(() => c.iniciar(id), esperaMs);
    return () => clearTimeout(t);
  }, [c, id, quando, esperaMs]);
}
