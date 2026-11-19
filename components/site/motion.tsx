import { type ComponentRef, type ReactNode, useEffect, useRef, useState } from 'react';
import { Platform, View, type ViewStyle } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';

/** Curvas do site: saída forte para entradas e respostas; ida e volta para o que se move na tela. */
export const EASE = Easing.bezier(0.23, 1, 0.32, 1);
export const EASE_IN_OUT = Easing.bezier(0.77, 0, 0.175, 1);

/** Limita entre 0 e 1 (worklet). */
export const c01 = (v: number) => { 'worklet'; return Math.min(1, Math.max(0, v)); };
/** Fase local: 0 antes de `a`, 1 depois de `b`, linear entre os dois (worklet). */
export const fase = (t: number, a: number, b: number) => { 'worklet'; return c01((t - a) / (b - a)); };
/** Saída forte aplicada a uma fase 0..1 (worklet): começa rápido e assenta devagar. */
export const sai = (t: number) => { 'worklet'; return 1 - Math.pow(1 - t, 3); };

/**
 * Quando o elemento entra na tela (IntersectionObserver no navegador; no app, já visível).
 * `uma`: dispara uma vez só (revelar). Sem `uma`: liga e desliga (pausar animações em loop fora da tela).
 */
export function useEmVista(uma = true, margem = '0px 0px -10% 0px') {
  const ref = useRef<ComponentRef<typeof View>>(null);
  const semIO = Platform.OS !== 'web' || typeof IntersectionObserver === 'undefined';
  const [visto, setVisto] = useState(semIO);
  useEffect(() => {
    if (semIO) return;
    const el = ref.current as unknown as Element | null;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { setVisto(true); if (uma) io.disconnect(); } else if (!uma) setVisto(false);
    }, { rootMargin: margem, threshold: 0.12 });
    io.observe(el);
    return () => io.disconnect();
  }, [semIO, uma, margem]);
  return { ref, visto };
}

/** Revela o conteúdo ao entrar na tela: sobe 24 px e aparece (sem movimento com "reduzir movimento"). */
export function Revela({ children, atraso = 0, style, distancia = 24 }: { children: ReactNode; atraso?: number; style?: ViewStyle; distancia?: number }) {
  const reduz = useReducedMotion();
  const { ref, visto } = useEmVista(true);
  const v = useSharedValue(reduz ? 1 : 0);
  useEffect(() => {
    if (!visto) return;
    v.value = reduz ? 1 : withDelay(atraso, withTiming(1, { duration: 700, easing: EASE }));
  }, [visto, reduz, atraso, v]);
  const anim = useAnimatedStyle(() => ({ opacity: v.value, transform: [{ translateY: (1 - v.value) * distancia }] }));
  return <Animated.View ref={ref} style={[style, anim]}>{children}</Animated.View>;
}

/**
 * Palco de cena desenhado num tamanho fixo (largura × altura lógicas) e ampliado ou reduzido para a largura real,
 * pelo centro, para as cenas ficarem idênticas no celular e no computador.
 */
export function Palco({ largura, altura, children, maxAltura, style }: { largura: number; altura: number; children: ReactNode; maxAltura?: number; style?: ViewStyle }) {
  const [w, setW] = useState(0);
  const k = w ? Math.min(w / largura, maxAltura ? maxAltura / altura : Infinity) : 0;
  return (
    <View onLayout={e => setW(e.nativeEvent.layout.width)} style={[{ width: '100%', height: k ? altura * k : altura * 0.6, overflow: 'hidden' }, style]}>
      {k ? (
        <View pointerEvents="none" style={{ position: 'absolute', width: largura, height: altura, left: (w - largura) / 2, top: (altura * k - altura) / 2, transform: [{ scale: k }] }}>
          {children}
        </View>
      ) : null}
    </View>
  );
}

/* ---------- Formas das cenas (geométricas, na paleta da marca) ---------- */

const PAPEL = '#ffffff';
const LINHA = '#d5dbe4';
/** Sombra leve das peças (fundo claro): borda fina e sombra difusa, sem brilho. */
const PECA = { borderWidth: 1, borderColor: '#e1e6ee', shadowColor: '#0f1f3d', shadowOpacity: 0.09, shadowRadius: 14, shadowOffset: { width: 0, height: 6 } };

/** Folha de formulário impresso: cabeçalho, linhas e um campo de assinatura. */
export function Folha({ w = 64, cor = PAPEL }: { w?: number; cor?: string }) {
  const h = w * 1.32;
  return (
    <View style={[PECA, { width: w, height: h, borderRadius: w * 0.07, backgroundColor: cor, padding: w * 0.12, gap: w * 0.07 }]}>
      <View style={{ height: w * 0.09, width: '55%', borderRadius: 2, backgroundColor: '#22345a' }} />
      {[0.92, 0.78, 0.86, 0.6, 0.82, 0.7].map((f, i) => <View key={i} style={{ height: w * 0.05, width: `${f * 100}%`, borderRadius: 2, backgroundColor: LINHA }} />)}
      <View style={{ marginTop: 'auto', height: w * 0.14, width: '45%', alignSelf: 'flex-end', borderBottomWidth: 1.5, borderBottomColor: '#9aa3b0' }} />
    </View>
  );
}

/** Planilha: cabeçalho colorido e grade de células. */
export function Planilha({ w = 120, cor = '#1f8a5b', destaque }: { w?: number; cor?: string; destaque?: [number, number, string][] }) {
  const cols = 4, linhas = 5, cw = (w - 12) / cols, ch = cw * 0.42;
  return (
    <View style={[PECA, { width: w, borderRadius: 6, backgroundColor: PAPEL, padding: 6 }]}>
      <View style={{ height: ch, borderRadius: 2, backgroundColor: cor, marginBottom: 2 }} />
      {Array.from({ length: linhas }, (_, r) => (
        <View key={r} style={{ flexDirection: 'row' }}>
          {Array.from({ length: cols }, (_, c) => {
            const d = destaque?.find(x => x[0] === r && x[1] === c);
            return <View key={c} style={{ width: cw, height: ch, borderWidth: 0.6, borderColor: LINHA, backgroundColor: d ? d[2] : 'transparent' }} />;
          })}
        </View>
      ))}
    </View>
  );
}

/** Celular: moldura marinho e tela clara (o conteúdo vem de fora). */
export function Celular({ w = 170, children }: { w?: number; children?: ReactNode }) {
  const h = w * 2;
  return (
    <View style={{ width: w, height: h, borderRadius: w * 0.17, backgroundColor: '#0f1f3d', padding: w * 0.045, shadowColor: '#0f1f3d', shadowOpacity: 0.18, shadowRadius: 26, shadowOffset: { width: 0, height: 14 } }}>
      <View style={{ flex: 1, borderRadius: w * 0.13, backgroundColor: '#f4f6f9', overflow: 'hidden', paddingTop: w * 0.16, paddingHorizontal: w * 0.08, gap: w * 0.055 }}>
        <View style={{ position: 'absolute', top: w * 0.05, alignSelf: 'center', width: w * 0.3, height: w * 0.06, borderRadius: 99, backgroundColor: '#0f1f3d' }} />
        {children}
      </View>
    </View>
  );
}
