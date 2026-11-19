import { useEffect } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import Animated, { cancelAnimation, Easing, type SharedValue, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { ArchiveIcon, BarcodeIcon, ClipboardTextIcon, GasPumpIcon, HourglassIcon, type Icon, RulerIcon, ShieldWarningIcon } from '../../ui/icons';
import { Palco, useEmVista } from './motion';
import { SITE_CORES } from './SiteChrome';

// Visual da abertura (600 × 560 lógicos): um arco com os módulos do sistema girando devagar sobre ele e,
// no centro, o print real da medição de tanques no celular. Fatos (sem números inventados) na lateral.
const C = SITE_CORES;
const W = 600, H = 560;
const CX = 300, CY = 285, RAIO = 248;
const MODULOS: Icon[] = [GasPumpIcon, RulerIcon, BarcodeIcon, ClipboardTextIcon, ArchiveIcon, ShieldWarningIcon, HourglassIcon];
const PASSO = (Math.PI * 2) / MODULOS.length;
const B = 54; // diâmetro do selo de cada módulo

function Selo({ i, ang, Icone }: { i: number; ang: SharedValue<number>; Icone: Icon }) {
  const anim = useAnimatedStyle(() => {
    const a = -Math.PI / 2 + i * PASSO + ang.value;
    return { transform: [{ translateX: CX + Math.cos(a) * RAIO - B / 2 }, { translateY: CY + Math.sin(a) * RAIO - B / 2 }] };
  });
  return (
    <Animated.View style={[st.selo, anim]}>
      <Icone size={24} color="#ffffff" weight="duotone" />
    </Animated.View>
  );
}

export function HeroOrbita() {
  const reduz = useReducedMotion();
  const { ref, visto } = useEmVista(false, '0px');
  const ang = useSharedValue(0.35);
  const flutua = useSharedValue(0);
  useEffect(() => {
    if (reduz || !visto) { cancelAnimation(ang); cancelAnimation(flutua); return; }
    // Uma volta a cada 70 s: movimento de fundo, que não disputa a leitura do texto.
    ang.value = withRepeat(withTiming(ang.value + Math.PI * 2, { duration: 70000, easing: Easing.linear }), -1, false);
    flutua.value = withRepeat(withTiming(1, { duration: 3200, easing: Easing.bezier(0.45, 0, 0.55, 1) }), -1, true);
    return () => { cancelAnimation(ang); cancelAnimation(flutua); };
  }, [reduz, visto, ang, flutua]);
  const celular = useAnimatedStyle(() => ({ transform: [{ translateY: -6 + flutua.value * 12 }] }));

  return (
    <View ref={ref} style={{ width: '100%' }}>
      <Palco largura={W} altura={H}>
        <View style={[st.anel, { left: CX - RAIO, top: CY - RAIO, width: RAIO * 2, height: RAIO * 2 }]} />
        <View style={[st.anelInterno, { left: CX - RAIO + 70, top: CY - RAIO + 70, width: (RAIO - 70) * 2, height: (RAIO - 70) * 2 }]} />
        {MODULOS.map((Icone, i) => <Selo key={i} i={i} ang={ang} Icone={Icone} />)}
        <Animated.View style={[st.celular, celular]}>
          <Image source={require('../../assets/site/celular-tanques.jpg')} style={st.tela} resizeMode="cover" accessibilityLabel="Tela do EasyAudit no celular: medição do tanque pela régua, com os litros calculados pela tabela" />
        </Animated.View>
      </Palco>
    </View>
  );
}

/** Fatos do produto, em coluna (no celular, em linha abaixo do visual). */
export const FATOS: [string, string][] = [
  ['9 módulos', 'num só app'],
  ['Sem internet', 'envia quando o sinal volta'],
  ['Android e web', 'celular e computador'],
];
export function Fatos({ linha = false }: { linha?: boolean }) {
  return (
    <View style={[{ gap: linha ? 18 : 26 }, linha && { flexDirection: 'row', flexWrap: 'wrap' }]}>
      {FATOS.map(([grande, pequeno]) => (
        <View key={grande} style={{ gap: 2, minWidth: linha ? 96 : undefined }}>
          <Text style={st.fatoGrande}>{grande}</Text>
          <Text style={st.fatoPequeno}>{pequeno}</Text>
        </View>
      ))}
    </View>
  );
}

const st = StyleSheet.create({
  anel: { position: 'absolute', borderRadius: 999, borderWidth: 1.5, borderColor: '#dfe5ee' },
  anelInterno: { position: 'absolute', borderRadius: 999, backgroundColor: '#eef2f7' },
  selo: {
    position: 'absolute', left: 0, top: 0, width: B, height: B, borderRadius: B / 2, backgroundColor: C.text, alignItems: 'center', justifyContent: 'center',
    shadowColor: '#0f1f3d', shadowOpacity: 0.18, shadowRadius: 12, shadowOffset: { width: 0, height: 6 },
  },
  celular: {
    position: 'absolute', left: CX - 112, top: CY - 232, width: 224, height: 464, borderRadius: 34, backgroundColor: '#0f1f3d', padding: 7,
    shadowColor: '#0f1f3d', shadowOpacity: 0.22, shadowRadius: 30, shadowOffset: { width: 0, height: 18 },
  },
  tela: { flex: 1, width: '100%', borderRadius: 28 },
  fatoGrande: { color: C.text, fontSize: 22, fontWeight: '800', letterSpacing: -0.5 },
  fatoPequeno: { color: C.textMuted, fontSize: 13 },
});
