import { type ReactNode, useEffect, useMemo } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { GestureDetector, type PanGestureConfig, usePanGesture } from 'react-native-gesture-handler';
import Animated, { ReduceMotion, type SharedValue, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { DotsSixVerticalIcon } from '../../ui/icons';

// Blocos arrastáveis (arrastar e soltar para ordenar). O gesto e a animação rodam na thread de UI; só a ordem final
// volta ao JS (onSoltar). Cada bloco tem a mesma altura; o bloco arrastado segue o dedo e os outros abrem espaço com mola.

const ALTURA = 58;
const VAO = 8;
const PASSO = ALTURA + VAO;
const MOLA = { duration: 260, dampingRatio: 0.9, reduceMotion: ReduceMotion.System } as const;

type Props<T> = {
  itens: T[];
  chave: (item: T) => string;
  /** Conteúdo do bloco (o puxador fica à esquerda). */
  render: (item: T, indice: number) => ReactNode;
  /** Nova ordem (chaves), ao soltar um bloco num lugar diferente. */
  onSoltar: (chaves: string[]) => void;
  cores: { fundo: string; borda: string; ativo: string; icone: string };
};

/** Ordem atual (chaves) a partir das posições. */
function ordemDe(pos: Record<string, number>) {
  'worklet';
  return Object.keys(pos).sort((a, b) => pos[a] - pos[b]);
}

export function ListaArrastavel<T>({ itens, chave, render, onSoltar, cores }: Props<T>) {
  const ids = useMemo(() => itens.map(chave), [itens, chave]);
  const assinatura = ids.join('|');
  const pos = useSharedValue<Record<string, number>>(Object.fromEntries(ids.map((id, i) => [id, i])));
  // Lista mudou (gravada, outro setor, item novo): volta às posições da lista.
  useEffect(() => { pos.set(Object.fromEntries(ids.map((id, i) => [id, i]))); }, [assinatura]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <View style={{ height: Math.max(0, ids.length * PASSO - VAO) }}>
      {itens.map((item, i) => {
        const id = ids[i];
        return (
          <Bloco key={id} id={id} pos={pos} total={ids.length} cores={cores}
            onFim={(nova: string[]) => { if (nova.join('|') !== assinatura) onSoltar(nova); }}>
            {render(item, i)}
          </Bloco>
        );
      })}
    </View>
  );
}

function Bloco({ id, pos, total, cores, onFim, children }: {
  id: string; pos: SharedValue<Record<string, number>>; total: number; cores: Props<unknown>['cores']; onFim: (nova: string[]) => void; children: ReactNode;
}) {
  const ativo = useSharedValue(false);
  const y = useSharedValue(0);
  const inicio = useSharedValue(0);
  const config = useMemo((): PanGestureConfig => ({
    // No celular, segurar um instante no puxador antes de arrastar (a rolagem da tela continua funcionando).
    activateAfterLongPress: Platform.OS === 'web' ? 0 : 120,
    minDistance: 1,
    onActivate: () => {
      'worklet';
      inicio.set((pos.get()[id] ?? 0) * PASSO);
      y.set(inicio.get());
      ativo.set(true);
    },
    onUpdate: e => {
      'worklet';
      if (!ativo.get()) return;
      const yy = Math.max(-VAO, Math.min((total - 1) * PASSO + VAO, inicio.get() + e.translationY));
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
    },
    onFinalize: () => {
      'worklet';
      if (!ativo.get()) return;
      ativo.set(false);
      scheduleOnRN(onFim, ordemDe(pos.get()));
    },
  }), [id, total, onFim]); // eslint-disable-line react-hooks/exhaustive-deps
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
        <View style={st.puxador} accessibilityLabel="Arrastar para mudar a ordem">
          <DotsSixVerticalIcon size={22} color={cores.icone} weight="bold" />
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
