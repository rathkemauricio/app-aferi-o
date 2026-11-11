import type { Icon } from 'phosphor-react-native';
import { type ReactNode, useCallback, useEffect, useMemo, useRef } from 'react';
import { type LayoutChangeEvent, StyleSheet, Text, View } from 'react-native';
import { GestureDetector, type PanGestureConfig, usePanGesture } from 'react-native-gesture-handler';
import Animated, { Easing, Extrapolation, interpolate, ReduceMotion, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

// Deslizar para o lado para agir (ex.: encerrar ou descartar uma atividade em andamento).
// Gesto e animação rodam na thread de UI (gesture-handler + Reanimated); só a ação final volta ao JS.

const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1);
const VOLTA = { duration: 300, dampingRatio: 1, reduceMotion: ReduceMotion.System } as const;

/** Onde o dedo pararia se continuasse desacelerando: um peteleco rápido conta como deslizar até o fim. */
function projetar(velocidade: number, taxa = 0.998) {
  'worklet';
  return ((velocidade / 1000) * taxa) / (1 - taxa);
}
/** Resistência elástica para o lado sem ação disponível. */
function elastico(excesso: number, dimensao: number, k = 0.55) {
  'worklet';
  return (excesso * dimensao * k) / (dimensao + k * Math.abs(excesso));
}

export type AcaoDeslizar = { rotulo: string; cor: string; icone: Icon; habilitada?: boolean };
type Evento = 'direita' | 'esquerda' | 'bloqueada-direita' | 'bloqueada-esquerda';

type Props = {
  children: ReactNode;
  /** Ação ao deslizar para a direita (o card sai da tela antes de executar). */
  direita: AcaoDeslizar;
  /** Ação ao deslizar para a esquerda (o card volta ao lugar; use para pedir confirmação). */
  esquerda: AcaoDeslizar;
  onDireita: () => void;
  onEsquerda: () => void;
  /** Deslizou para um lado com a ação desabilitada. */
  onBloqueada?: (lado: 'direita' | 'esquerda') => void;
  raio?: number;
};

export function Deslizavel({ children, direita, esquerda, onDireita, onEsquerda, onBloqueada, raio = 16 }: Props) {
  const x = useSharedValue(0);
  const inicio = useSharedValue(0);
  const largura = useSharedValue(0);
  const direitaOk = useSharedValue(direita.habilitada !== false);
  const esquerdaOk = useSharedValue(esquerda.habilitada !== false);
  useEffect(() => { direitaOk.set(direita.habilitada !== false); }, [direita.habilitada, direitaOk]);
  useEffect(() => { esquerdaOk.set(esquerda.habilitada !== false); }, [esquerda.habilitada, esquerdaOk]);

  // Ações sempre atuais sem recriar o gesto.
  const acoes = useRef({ onDireita, onEsquerda, onBloqueada });
  acoes.current = { onDireita, onEsquerda, onBloqueada };
  const disparar = useCallback((ev: Evento) => {
    const a = acoes.current;
    if (ev === 'direita') {
      a.onDireita();
      setTimeout(() => x.set(0), 450); // se o card continuar na tela (ação recusada), volta ao lugar
    } else if (ev === 'esquerda') a.onEsquerda();
    else a.onBloqueada?.(ev === 'bloqueada-direita' ? 'direita' : 'esquerda');
  }, [x]);

  // Config memorizada: o gesture-handler reenvia a configuração ao nativo sempre que o objeto muda,
  // e a tela de coleta redesenha várias vezes por segundo (relógio ao vivo).
  const config = useMemo((): PanGestureConfig => ({
    activeOffsetX: [-12, 12], // só ativa com intenção horizontal: a rolagem vertical da tela continua livre
    failOffsetY: [-10, 10],
    onActivate: () => {
      'worklet';
      inicio.set(x.get()); // pegar o card no meio da volta continua de onde ele está
    },
    onUpdate: e => {
      'worklet';
      const w = largura.get() || 320;
      let v = inicio.get() + e.translationX;
      if (v > 0 && !direitaOk.get()) v = elastico(v, w);
      if (v < 0 && !esquerdaOk.get()) v = elastico(v, w);
      x.set(v);
    },
    onDeactivate: e => {
      'worklet';
      const w = largura.get() || 320;
      const limite = Math.min(140, w * 0.35);
      const destino = x.get() + projetar(e.velocityX);
      if (destino > limite && direitaOk.get()) {
        x.set(withTiming(w, { duration: 200, easing: EASE_OUT, reduceMotion: ReduceMotion.System }, fim => { if (fim) scheduleOnRN(disparar, 'direita'); }));
        return;
      }
      x.set(withSpring(0, { ...VOLTA, velocity: e.velocityX }));
      if (destino < -limite) scheduleOnRN(disparar, esquerdaOk.get() ? 'esquerda' : 'bloqueada-esquerda');
      else if (destino > limite) scheduleOnRN(disparar, 'bloqueada-direita');
    },
  }), [x, inicio, largura, direitaOk, esquerdaOk, disparar]);
  const pan = usePanGesture(config);

  const cartao = useAnimatedStyle(() => ({ transform: [{ translateX: x.get() }] }));
  const fundoDireita = useAnimatedStyle(() => ({ opacity: interpolate(x.get(), [0, 48], [0, 1], Extrapolation.CLAMP) }));
  const fundoEsquerda = useAnimatedStyle(() => ({ opacity: interpolate(x.get(), [-48, 0], [1, 0], Extrapolation.CLAMP) }));
  const IconeDireita = direita.icone, IconeEsquerda = esquerda.icone;

  return (
    <View onLayout={(e: LayoutChangeEvent) => largura.set(e.nativeEvent.layout.width)} style={{ borderRadius: raio }}>
      {/* Fundos só visuais: escondidos de leitores de tela (o card tem "Continuar", que leva às mesmas ações). */}
      <Animated.View pointerEvents="none" aria-hidden importantForAccessibility="no-hide-descendants" accessibilityElementsHidden
        style={[StyleSheet.absoluteFill, st.fundo, { borderRadius: raio, backgroundColor: direita.habilitada === false ? '#6b7280' : direita.cor, justifyContent: 'flex-start' }, fundoDireita]}>
        <IconeDireita size={20} color="#fff" weight="bold" />
        <Text style={st.rotulo}>{direita.habilitada === false ? 'Nada para gravar' : direita.rotulo}</Text>
      </Animated.View>
      <Animated.View pointerEvents="none" aria-hidden importantForAccessibility="no-hide-descendants" accessibilityElementsHidden
        style={[StyleSheet.absoluteFill, st.fundo, { borderRadius: raio, backgroundColor: esquerda.cor, justifyContent: 'flex-end' }, fundoEsquerda]}>
        <Text style={st.rotulo}>{esquerda.rotulo}</Text>
        <IconeEsquerda size={20} color="#fff" weight="bold" />
      </Animated.View>
      <GestureDetector gesture={pan}>
        <Animated.View style={cartao}>{children}</Animated.View>
      </GestureDetector>
    </View>
  );
}

const st = StyleSheet.create({
  fundo: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 20 },
  rotulo: { color: '#fff', fontSize: 14, fontWeight: '800' },
});
