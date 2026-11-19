import { useEffect } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { cancelAnimation, Easing, type SharedValue, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { BarcodeIcon, CheckIcon, DropIcon, FactoryIcon, GasPumpIcon, PackageIcon, ShoppingCartIcon, StorefrontIcon, TruckIcon } from '../../ui/icons';
import { EASE, fase, Palco, Revela, sai, useEmVista } from './motion';
import { SITE_CORES } from './SiteChrome';

// Setores atendidos, cada um com uma vinheta em ciclo (300 × 140 lógicos) que só roda quando está na tela.
const C = SITE_CORES;
const MENTA = '#5fd39a', PAPEL = '#f4f3ef';
const VW = 300, VH = 140;

/** Relógio da vinheta: 0 → 1 em `ms`, em ciclo, só enquanto visível (e parado com "reduzir movimento"). */
function useCiclo(ms: number, visto: boolean, reduz: boolean, parado = 0.6) {
  const t = useSharedValue(parado);
  useEffect(() => {
    if (reduz || !visto) { cancelAnimation(t); if (reduz) t.value = parado; return; }
    t.value = 0;
    t.value = withRepeat(withTiming(1, { duration: ms, easing: Easing.linear }), -1, false);
    return () => cancelAnimation(t);
  }, [ms, visto, reduz, parado, t]);
  return t;
}

/* ---------- Vinhetas ---------- */
function Posto({ t }: { t: SharedValue<number> }) {
  const gota = useAnimatedStyle(() => { const v = fase(t.value, 0.05, 0.45); return { opacity: v > 0 && v < 1 ? 1 - fase(v, 0.75, 1) : 0, transform: [{ translateY: 54 + v * 50 }, { scale: 0.7 + v * 0.3 }] }; });
  const nivel = useAnimatedStyle(() => ({ height: `${18 + sai(fase(t.value, 0.1, 0.85)) * 74}%` }));
  return (
    <>
      <View style={[st.abs, { left: 46, top: 24 }]}><GasPumpIcon size={84} color={C.text} weight="duotone" /></View>
      <Animated.View style={[st.abs, { left: 128 }, gota]}><DropIcon size={22} color={MENTA} weight="fill" /></Animated.View>
      <View style={[st.abs, st.tanque, { left: 196, top: 22 }]}>
        <Animated.View style={[st.tanqueNivel, nivel]} />
        {[0.25, 0.5, 0.75].map(f => <View key={f} style={[st.marca, { bottom: `${f * 100}%` }]} />)}
      </View>
    </>
  );
}
function Mercado({ t }: { t: SharedValue<number> }) {
  const feixe = useAnimatedStyle(() => { const v = Math.sin(t.value * Math.PI * 2) * 0.5 + 0.5; return { transform: [{ translateX: 150 + v * 64 }] }; });
  const ok = useAnimatedStyle(() => { const v = sai(fase(t.value, 0.55, 0.65)) * (1 - fase(t.value, 0.9, 1)); return { opacity: v, transform: [{ scale: 0.6 + v * 0.4 }] }; });
  const carrinho = useAnimatedStyle(() => ({ transform: [{ translateX: 22 + Math.sin(t.value * Math.PI * 2) * 6 }] }));
  return (
    <>
      <Animated.View style={[st.abs, { top: 40 }, carrinho]}><ShoppingCartIcon size={76} color={C.text} weight="duotone" /></Animated.View>
      <View style={[st.abs, { left: 146, top: 26 }]}><BarcodeIcon size={84} color={PAPEL} weight="regular" /></View>
      <Animated.View style={[st.abs, st.feixe, { top: 32 }, feixe]} />
      <Animated.View style={[st.abs, st.selo, { left: 236, top: 22 }, ok]}><CheckIcon size={16} color="#0a1428" weight="bold" /></Animated.View>
    </>
  );
}
function Caixa({ t, k }: { t: SharedValue<number>; k: number }) {
  const anim = useAnimatedStyle(() => {
    const v = (t.value + k / 3) % 1; // posição ao longo da esteira, em ciclo
    return { opacity: fase(v, 0, 0.08) * (1 - fase(v, 0.86, 0.96)), transform: [{ translateX: 18 + v * 190 }, { translateY: 70 }] };
  });
  return <Animated.View style={[st.abs, anim]}><PackageIcon size={34} color={PAPEL} weight="duotone" /></Animated.View>;
}
function Industria({ t }: { t: SharedValue<number> }) {
  return (
    <>
      <View style={[st.abs, { left: 206, top: 20 }]}><FactoryIcon size={84} color={C.text} weight="duotone" /></View>
      <View style={[st.abs, st.esteira, { left: 14, top: 106, width: 210 }]} />
      {[0, 1, 2, 3, 4, 5].map(i => <View key={i} style={[st.abs, st.rolo, { left: 22 + i * 38, top: 112 }]} />)}
      {[0, 1, 2].map(k => <Caixa key={k} t={t} k={k} />)}
    </>
  );
}
function Faixas({ t }: { t: SharedValue<number> }) {
  const anim = useAnimatedStyle(() => ({ transform: [{ translateX: -((t.value * 60) % 60) }] }));
  return (
    <Animated.View style={[st.abs, { top: 120, flexDirection: 'row', gap: 24 }, anim]}>
      {Array.from({ length: 9 }, (_, i) => <View key={i} style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: '#34486f' }} />)}
    </Animated.View>
  );
}
function Logistica({ t }: { t: SharedValue<number> }) {
  const caminhao = useAnimatedStyle(() => ({ transform: [{ translateX: 96 }, { translateY: 26 + Math.abs(Math.sin(t.value * Math.PI * 8)) * -2 }] }));
  return (
    <>
      <Faixas t={t} />
      <Animated.View style={[st.abs, caminhao]}><TruckIcon size={92} color={C.text} weight="duotone" /></Animated.View>
    </>
  );
}
function Loja({ t, i }: { t: SharedValue<number>; i: number }) {
  const ok = useAnimatedStyle(() => { const v = sai(fase(t.value, 0.12 + i * 0.22, 0.2 + i * 0.22)) * (1 - fase(t.value, 0.9, 1)); return { opacity: v, transform: [{ scale: 0.5 + v * 0.5 }] }; });
  return (
    <View style={[st.abs, { left: 22 + i * 92, top: 36 }]}>
      <StorefrontIcon size={62} color={C.text} weight="duotone" />
      <Animated.View style={[st.abs, st.selo, { left: 44, top: -8 }, ok]}><CheckIcon size={14} color="#0a1428" weight="bold" /></Animated.View>
    </View>
  );
}
function Franquias({ t }: { t: SharedValue<number> }) {
  return <>{[0, 1, 2].map(i => <Loja key={i} t={t} i={i} />)}</>;
}

type Setor = { nome: string; texto: string; usa: string[]; cena: (props: { t: SharedValue<number> }) => React.ReactNode; ms: number };
const SETORES: Setor[] = [
  { nome: 'Postos de combustível', texto: 'Aferição de bombas e bicos, medição de tanques e o croqui de cada posto.', usa: ['Aferições', 'Medição de Tanques', 'Croqui'], cena: Posto, ms: 2600 },
  { nome: 'Supermercados', texto: 'Contagem de estoque com coletor, inventário por categoria e prevenção de perdas.', usa: ['Coleta', 'Inventários', 'Mapa de Risco'], cena: Mercado, ms: 2400 },
  { nome: 'Indústrias', texto: 'Tempos e movimentos, auditoria de processos e medição de tanques.', usa: ['Tempos e Movimentos', 'Auditoria', 'Medição de Tanques'], cena: Industria, ms: 3600 },
  { nome: 'Logística e distribuição', texto: 'Inventários, checklists nas unidades e agenda de visitas.', usa: ['Inventários', 'Auditoria', 'Agenda'], cena: Logistica, ms: 900 },
  { nome: 'Redes e franquias', texto: 'O mesmo checklist em todas as lojas, com plano de ação e relatório por unidade.', usa: ['Auditoria', 'Agenda', 'Mapa de Risco'], cena: Franquias, ms: 3200 },
];

function Cartao({ s, flex }: { s: Setor; flex: number }) {
  const reduz = useReducedMotion();
  const { ref, visto } = useEmVista(false, '0px');
  const t = useCiclo(s.ms, visto, reduz);
  const hover = useSharedValue(0);
  const anim = useAnimatedStyle(() => ({ transform: [{ translateY: hover.value * -4 }], borderColor: hover.value > 0.5 ? '#34486f' : C.border }));
  const Cena = s.cena;
  return (
    <Pressable style={{ flex }} accessible={false}
      onHoverIn={() => { if (Platform.OS === 'web' && !reduz) hover.value = withTiming(1, { duration: 200, easing: EASE }); }}
      onHoverOut={() => { hover.value = withTiming(0, { duration: 240, easing: EASE }); }}>
      <Animated.View ref={ref} style={[st.cartao, anim]}>
        <View style={st.vinheta}><Palco largura={VW} altura={VH} maxAltura={150}><Cena t={t} /></Palco></View>
        <Text style={st.nome}>{s.nome}</Text>
        <Text style={st.texto}>{s.texto}</Text>
        <View style={st.chips}>{s.usa.map(u => <Text key={u} style={st.chip}>{u}</Text>)}</View>
      </Animated.View>
    </Pressable>
  );
}

/** Mosaico dos setores: 2 cartões na primeira linha e 3 na segunda (no celular, um por linha). */
export function Setores({ desktop }: { desktop: boolean }) {
  const linhas = desktop ? [[0, 1], [2, 3, 4]] : SETORES.map((_, i) => [i]);
  return (
    <View style={{ gap: 16 }}>
      {linhas.map((l, li) => (
        <View key={li} style={{ flexDirection: 'row', gap: 16 }}>
          {l.map((i, k) => (
            <Revela key={i} atraso={k * 90} style={{ flex: desktop && li === 0 && k === 0 ? 1.35 : 1 }}>
              <Cartao s={SETORES[i]} flex={1} />
            </Revela>
          ))}
        </View>
      ))}
    </View>
  );
}

const st = StyleSheet.create({
  abs: { position: 'absolute', left: 0, top: 0 },
  cartao: { flex: 1, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 24, padding: 22, gap: 10 },
  vinheta: { borderRadius: 16, backgroundColor: '#0b1730', overflow: 'hidden', marginBottom: 6 },
  nome: { color: C.text, fontSize: 19, fontWeight: '800', letterSpacing: -0.3 },
  texto: { color: C.textMuted, fontSize: 14.5, lineHeight: 21 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
  chip: { color: '#7fe0b0', fontSize: 12, fontWeight: '700', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, backgroundColor: '#13362f' },
  tanque: { width: 54, height: 100, borderRadius: 10, borderWidth: 2, borderColor: '#34486f', overflow: 'hidden', justifyContent: 'flex-end' },
  tanqueNivel: { width: '100%', backgroundColor: MENTA, opacity: 0.85 },
  marca: { position: 'absolute', right: 0, width: 10, height: 2, backgroundColor: '#0b1730' },
  feixe: { width: 3, height: 74, borderRadius: 2, backgroundColor: '#ff5b4f', shadowColor: '#ff5b4f', shadowOpacity: 0.8, shadowRadius: 6, shadowOffset: { width: 0, height: 0 } },
  selo: { width: 26, height: 26, borderRadius: 13, backgroundColor: MENTA, alignItems: 'center', justifyContent: 'center' },
  esteira: { height: 4, borderRadius: 2, backgroundColor: '#34486f' },
  rolo: { width: 10, height: 10, borderRadius: 5, borderWidth: 2, borderColor: '#34486f' },
});
