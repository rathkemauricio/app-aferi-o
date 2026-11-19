import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { cancelAnimation, Easing, type SharedValue, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { CheckIcon } from '../../ui/icons';
import { Celular, fase, Folha, Palco, Planilha, sai, useEmVista } from './motion';

// Cena da abertura (560 × 460 lógicos): papéis e planilhas soltos voam para o celular e viram registros.
// Um relógio só (t: 0 → 1 em 7 s, em ciclo) comanda tudo; fora da tela o ciclo para.
const W = 560, H = 460;
const CEL = { x: 340, y: 50, w: 170 }; // celular: 170 × 340
const ALVO = { x: CEL.x + CEL.w / 2, y: CEL.y + CEL.w };
const MENTA = '#5fd39a';

type Peca = { tipo: 'folha' | 'planilha'; x: number; y: number; r: number; cor?: string };
const PECAS: Peca[] = [
  { tipo: 'folha', x: 24, y: 36, r: -12 },
  { tipo: 'planilha', x: 138, y: 14, r: 7, cor: '#1f8a5b' },
  { tipo: 'folha', x: 62, y: 190, r: 9 },
  { tipo: 'folha', x: 196, y: 150, r: -6 },
  { tipo: 'planilha', x: 8, y: 318, r: -6, cor: '#2f6fd6' },
  { tipo: 'folha', x: 196, y: 312, r: 12 },
  { tipo: 'planilha', x: 214, y: 30, r: -10, cor: '#c98a1b' },
  { tipo: 'folha', x: 118, y: 350, r: -8 },
];
const TAM = { folha: { w: 72, h: 95 }, planilha: { w: 120, h: 84 } };

function PecaAnimada({ p, i, t, reduz }: { p: Peca; i: number; t: SharedValue<number>; reduz: boolean }) {
  const { w, h } = TAM[p.tipo];
  const s = 0.3 + i * 0.019, b = 0.84 + i * 0.012;
  const anim = useAnimatedStyle(() => {
    if (reduz) return { opacity: 0.9, transform: [{ translateX: p.x }, { translateY: p.y }, { rotate: `${p.r}deg` }] };
    const tt = t.value;
    const voo = sai(fase(tt, s, s + 0.12));
    const volta = sai(fase(tt, b, b + 0.12));
    // Flutuar parado: duas voltas por ciclo, contínuo na emenda do ciclo.
    const ang = 2 * Math.PI * 2 * tt + i;
    const dx = Math.sin(ang) * 4 * (1 - voo), dy = Math.cos(ang) * 5 * (1 - voo);
    if (tt >= b) {
      return { opacity: volta, transform: [{ translateX: p.x }, { translateY: p.y - 140 * (1 - volta) }, { rotate: `${p.r}deg` }, { scale: 1 }] };
    }
    const x = p.x + (ALVO.x - w / 2 - p.x) * voo + dx;
    const y = p.y + (ALVO.y - h / 2 - p.y) * voo + dy;
    return { opacity: 1 - fase(voo, 0.7, 1), transform: [{ translateX: x }, { translateY: y }, { rotate: `${p.r * (1 - voo)}deg` }, { scale: 1 - 0.82 * voo }] };
  });
  return (
    <Animated.View style={[st.abs, { zIndex: 1 }, anim]}>
      {p.tipo === 'folha' ? <Folha w={w} /> : <Planilha w={w} cor={p.cor} />}
    </Animated.View>
  );
}

function Linha({ j, t, reduz }: { j: number; t: SharedValue<number>; reduz: boolean }) {
  const anim = useAnimatedStyle(() => {
    if (reduz) return { opacity: 1, transform: [{ translateX: 0 }] };
    const a = sai(fase(t.value, 0.47 + j * 0.045, 0.53 + j * 0.045));
    const fora = fase(t.value, 0.82, 0.9);
    return { opacity: a * (1 - fora), transform: [{ translateX: (1 - a) * 16 }] };
  });
  const larg = [0.72, 0.55, 0.8, 0.62, 0.7, 0.5][j];
  return (
    <Animated.View style={[st.linha, anim]}>
      <View style={st.check}><CheckIcon size={11} color="#0a1428" weight="bold" /></View>
      <View style={{ flex: 1, gap: 4 }}>
        <View style={{ height: 6, width: `${larg * 100}%`, borderRadius: 3, backgroundColor: '#22345a' }} />
        <View style={{ height: 5, width: `${larg * 70}%`, borderRadius: 3, backgroundColor: '#cfd4da' }} />
      </View>
    </Animated.View>
  );
}

export function CenaHero() {
  const reduz = useReducedMotion();
  const { ref, visto } = useEmVista(false, '0px');
  const t = useSharedValue(0);
  useEffect(() => {
    if (reduz || !visto) { cancelAnimation(t); return; }
    t.value = 0;
    t.value = withRepeat(withTiming(1, { duration: 7000, easing: Easing.linear }), -1, false);
    return () => cancelAnimation(t);
  }, [reduz, visto, t]);
  // Brilho menta atrás do celular quando a lista se completa.
  const brilho = useAnimatedStyle(() => {
    const a = reduz ? 1 : fase(t.value, 0.6, 0.72) * (1 - fase(t.value, 0.82, 0.92));
    return { opacity: 0.22 + a * 0.5, transform: [{ scale: 0.92 + a * 0.08 }] };
  });

  return (
    <View ref={ref} style={{ width: '100%' }}>
      <Palco largura={W} altura={H}>
        <Animated.View style={[st.brilho, brilho]} />
        <View style={[st.abs, { left: CEL.x, top: CEL.y, zIndex: 2 }]}>
          <Celular w={CEL.w}>
            {Array.from({ length: 6 }, (_, j) => <Linha key={j} j={j} t={t} reduz={reduz} />)}
          </Celular>
        </View>
        {PECAS.map((p, i) => <PecaAnimada key={i} p={p} i={i} t={t} reduz={reduz} />)}
      </Palco>
    </View>
  );
}

const st = StyleSheet.create({
  abs: { position: 'absolute', left: 0, top: 0 },
  linha: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#ffffff', borderRadius: 10, paddingVertical: 8, paddingHorizontal: 8 },
  check: { width: 18, height: 18, borderRadius: 9, backgroundColor: MENTA, alignItems: 'center', justifyContent: 'center' },
  brilho: { position: 'absolute', left: CEL.x - 45, top: CEL.y + 50, width: CEL.w + 90, height: CEL.w + 90, borderRadius: 999, backgroundColor: '#5fd39a33' },
});
