import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { GestureDetector, type PanGestureConfig, usePanGesture } from 'react-native-gesture-handler';
import Animated, { type AnimatedRef, measure, ReduceMotion, scrollTo, type SharedValue, useAnimatedStyle, useFrameCallback, useSharedValue, withSpring } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { DotsSixVerticalIcon } from '../../ui/icons';

// Blocos arrastáveis (arrastar e soltar para ordenar). O gesto e a animação rodam na thread de UI; só a ordem final
// volta ao JS (onSoltar). Cada bloco tem a mesma altura; o bloco arrastado segue o dedo e os outros abrem espaço com mola.

const ALTURA = 58;
const VAO = 8;
const PASSO = ALTURA + VAO;
const MOLA = { duration: 260, dampingRatio: 0.9, reduceMotion: ReduceMotion.System } as const;
/** Faixa perto da borda da tela que faz a lista rolar sozinha durante o arrasto, e a velocidade máxima (px por quadro). */
const BORDA = 96;
const VEL_MAX = 16;

/**
 * Rolagem da tela onde a lista está (Animated.ScrollView com useAnimatedRef + useScrollOffset). Com ela, segurar o
 * bloco perto da borda de cima/baixo rola a tela sozinha: dá para levar o último bloco até o topo numa lista longa.
 */
export type Rolagem = { ref: AnimatedRef<Animated.ScrollView>; offset: SharedValue<number>; conteudo: SharedValue<number> };
export const RolagemArrastavel = createContext<Rolagem | null>(null);

const NA_WEB = Platform.OS === 'web';
/**
 * Rolagem atual da tela. No navegador lê direto do elemento (o valor do useScrollOffset chegava atrasado e o bloco
 * escorregava ~100 px para longe do dedo); no celular, o valor do Reanimated é atualizado na thread de UI.
 */
function rolagemAtual(rol: Rolagem) {
  'worklet';
  if (NA_WEB) {
    const el = rol.ref() as unknown as { scrollTop?: number } | null;
    if (el && typeof el.scrollTop === 'number') return el.scrollTop;
  }
  return rol.offset.get();
}

type Props<T> = {
  itens: T[];
  chave: (item: T) => string;
  /** Conteúdo do bloco (o puxador fica à esquerda). `indice` acompanha o arrasto ao vivo (numeração 1, 2, 3…). */
  render: (item: T, indice: number) => ReactNode;
  /** Sem permissão para ordenar: só a lista, sem puxador. */
  somenteLeitura?: boolean;
  /** Nova ordem (chaves), ao soltar um bloco num lugar diferente. */
  onSoltar: (chaves: string[]) => void;
  cores: { fundo: string; borda: string; ativo: string; icone: string };
};

/** Ordem atual (chaves) a partir das posições. */
function ordemDe(pos: Record<string, number>) {
  'worklet';
  return Object.keys(pos).sort((a, b) => pos[a] - pos[b]);
}

export function ListaArrastavel<T>({ itens, chave, render, onSoltar, cores, somenteLeitura = false }: Props<T>) {
  const ids = useMemo(() => itens.map(chave), [itens, chave]);
  const assinatura = ids.join('|');
  const pos = useSharedValue<Record<string, number>>(Object.fromEntries(ids.map((id, i) => [id, i])));
  // Ordem durante o arrasto (só muda quando um bloco troca de casa), para a numeração acompanhar ao vivo.
  const [viva, setViva] = useState<string[]>(ids);
  // Lista mudou (gravada, outro filtro, item novo): volta às posições da lista.
  useEffect(() => { pos.set(Object.fromEntries(ids.map((id, i) => [id, i]))); setViva(ids); }, [assinatura]); // eslint-disable-line react-hooks/exhaustive-deps
  // Callbacks estáveis: o gesto não é recriado no meio do arrasto quando a numeração re-renderiza a lista.
  const ref = useRef({ assinatura, onSoltar });
  ref.current = { assinatura, onSoltar };
  const aoSoltar = useCallback((nova: string[]) => { setViva(nova); if (nova.join('|') !== ref.current.assinatura) ref.current.onSoltar(nova); }, []);
  const indice = useMemo(() => new Map(viva.map((id, i) => [id, i])), [viva]);
  return (
    <View style={[{ height: Math.max(0, ids.length * PASSO - VAO) }, Platform.OS === 'web' ? ({ userSelect: 'none' } as object) : null]}>
      {itens.map((item, i) => {
        const id = ids[i];
        return (
          <Bloco key={id} id={id} pos={pos} total={ids.length} cores={cores} onFim={aoSoltar} onMudou={setViva} somenteLeitura={somenteLeitura}>
            {render(item, indice.get(id) ?? i)}
          </Bloco>
        );
      })}
    </View>
  );
}

/**
 * No navegador, o puxador "prende" o ponteiro ao ser pressionado (pointer capture): sem isso, um movimento rápido que
 * saísse da área do puxador deixava de chegar ao gesto e o bloco parava no meio (no celular o sistema já faz isso).
 */
const capturaNaWeb = NA_WEB ? {
  onPointerDown: (e: { currentTarget: unknown; nativeEvent: { pointerId?: number } }) => {
    const alvo = e.currentTarget as { setPointerCapture?: (id: number) => void } | null;
    if (alvo?.setPointerCapture && e.nativeEvent.pointerId !== undefined) { try { alvo.setPointerCapture(e.nativeEvent.pointerId); } catch { /* ponteiro já solto */ } }
  },
} : {};

function Bloco({ id, pos, total, cores, onFim, onMudou, somenteLeitura, children }: {
  id: string; pos: SharedValue<Record<string, number>>; total: number; cores: Props<unknown>['cores'];
  onFim: (nova: string[]) => void; onMudou: (nova: string[]) => void; somenteLeitura: boolean; children: ReactNode;
}) {
  const ativo = useSharedValue(false);
  const y = useSharedValue(0);
  const inicio = useSharedValue(0);
  const trans = useSharedValue(0);
  const vel = useSharedValue(0);
  /** Última rolagem real já descontada na posição do bloco. */
  const rolagemVista = useSharedValue(0);
  const rol = useContext(RolagemArrastavel);

  /** Põe o bloco sob o dedo e, se mudou de casa, reorganiza os outros. */
  const posicionar = () => {
    'worklet';
    const yy = Math.max(-VAO, Math.min((total - 1) * PASSO + VAO, inicio.get() + trans.get()));
    y.set(yy);
    const alvo = Math.max(0, Math.min(total - 1, Math.round(yy / PASSO)));
    const atual = pos.get();
    if (atual[id] === alvo) return;
    // Tira o bloco do lugar e insere na posição de destino; os outros andam uma casa.
    const ordem = ordemDe(atual).filter(k => k !== id);
    ordem.splice(alvo, 0, id);
    const nova: Record<string, number> = {};
    ordem.forEach((k, i) => { nova[k] = i; });
    pos.set(nova);
    scheduleOnRN(onMudou, ordem);
  };

  // A cada quadro durante o arrasto: (1) a rolagem REAL da tela (a pedida aqui ou qualquer outra) é descontada na posição
  // do bloco, para ele ficar sempre sob o dedo; (2) perto da borda, pede mais rolagem (mais rápido quanto mais perto).
  const quadro = useFrameCallback(() => {
    if (!ativo.get() || !rol) return;
    const real = rolagemAtual(rol);
    const andou = real - rolagemVista.get();
    if (andou !== 0) { rolagemVista.set(real); inicio.set(inicio.get() + andou); posicionar(); }
    if (vel.get() === 0) return;
    const m = measure(rol.ref);
    const max = Math.max(0, rol.conteudo.get() - (m ? m.height : 0));
    const novo = Math.max(0, Math.min(max, real + vel.get()));
    if (novo !== real) scrollTo(rol.ref, 0, novo, false);
  }, false);
  // Estável entre renderizações: o objeto do useFrameCallback muda a cada render, e um gesto recriado no meio do arrasto
  // (a numeração ao vivo re-renderiza a lista) parava de receber o movimento do dedo.
  const quadroRef = useRef(quadro);
  quadroRef.current = quadro;
  const ligarQuadro = useCallback((on: boolean) => quadroRef.current.setActive(on), []);

  const config = useMemo((): PanGestureConfig => ({
    // No celular, segurar um instante no puxador antes de arrastar (a rolagem da tela continua funcionando).
    activateAfterLongPress: Platform.OS === 'web' ? 0 : 120,
    minDistance: 1,
    enabled: !somenteLeitura,
    onActivate: () => {
      'worklet';
      inicio.set((pos.get()[id] ?? 0) * PASSO);
      y.set(inicio.get());
      trans.set(0);
      vel.set(0);
      if (rol) rolagemVista.set(rolagemAtual(rol));
      ativo.set(true);
      scheduleOnRN(ligarQuadro, true);
    },
    onUpdate: e => {
      'worklet';
      if (!ativo.get()) return;
      trans.set(e.translationY);
      posicionar();
      // Perto da borda da tela visível: rolar (mais rápido quanto mais perto da borda).
      if (rol) {
        const m = measure(rol.ref);
        if (m) {
          const topo = m.pageY, base = m.pageY + m.height, py = e.absoluteY;
          vel.set(py < topo + BORDA ? -VEL_MAX * Math.min(1, (topo + BORDA - py) / BORDA)
            : py > base - BORDA ? VEL_MAX * Math.min(1, (py - (base - BORDA)) / BORDA) : 0);
        }
      }
    },
    onFinalize: () => {
      'worklet';
      vel.set(0);
      if (!ativo.get()) return;
      ativo.set(false);
      scheduleOnRN(ligarQuadro, false);
      scheduleOnRN(onFim, ordemDe(pos.get()));
    },
  }), [id, total, onFim, onMudou, somenteLeitura, rol, ligarQuadro]); // eslint-disable-line react-hooks/exhaustive-deps
  const pan = usePanGesture(config);
  const estilo = useAnimatedStyle(() => {
    const destino = (pos.get()[id] ?? 0) * PASSO;
    const arrastando = ativo.get();
    return {
      top: arrastando ? y.get() : withSpring(destino, MOLA),
      zIndex: arrastando ? 10 : 0,
      transform: [{ scale: withSpring(arrastando ? 1.02 : 1, MOLA) }],
      shadowOpacity: arrastando ? 0.18 : 0,
      elevation: arrastando ? 6 : 0,
      borderColor: arrastando ? cores.ativo : cores.borda,
    };
  });
  return (
    <Animated.View style={[st.bloco, { backgroundColor: cores.fundo }, estilo]}>
      <GestureDetector gesture={pan}>
        <View style={st.puxador} accessibilityLabel="Arrastar para mudar a ordem" {...capturaNaWeb}>
          <DotsSixVerticalIcon size={22} color={cores.icone} weight="bold" style={somenteLeitura ? { opacity: 0.25 } : undefined} />
        </View>
      </GestureDetector>
      <View style={st.conteudo}>{children}</View>
    </Animated.View>
  );
}

const st = StyleSheet.create({
  bloco: {
    position: 'absolute', left: 0, right: 0, height: ALTURA, borderWidth: 1, borderRadius: 12, flexDirection: 'row', alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowRadius: 10,
  },
  puxador: { width: 44, height: '100%', alignItems: 'center', justifyContent: 'center', ...(Platform.OS === 'web' ? { cursor: 'grab', touchAction: 'none', userSelect: 'none' } as object : {}) },
  conteudo: { flex: 1, paddingRight: 12, justifyContent: 'center' },
});
