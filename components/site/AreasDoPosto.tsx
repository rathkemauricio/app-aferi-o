import { useEffect } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { cancelAnimation, Easing, type SharedValue, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { BarcodeIcon, CheckIcon, DropIcon, GasPumpIcon, ShoppingCartIcon, StorefrontIcon, TimerIcon } from '../../ui/icons';
import { EASE, fase, Palco, Revela, sai, useEmVista } from './motion';
import { SITE_CORES } from './SiteChrome';

// Áreas do posto que o EasyAudit cobre, cada uma com uma vinheta em ciclo (300 × 140 lógicos) que só roda
// quando está na tela.
const C = SITE_CORES;
const MENTA = '#5fd39a', TINTA = '#0f1f3d', LINHA = '#c9d2df';
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
/** Pista: o bico enche a medida-padrão da aferição. */
function Pista({ t }: { t: SharedValue<number> }) {
  const gota = useAnimatedStyle(() => { const v = fase(t.value, 0.05, 0.45); return { opacity: v > 0 && v < 1 ? 1 - fase(v, 0.75, 1) : 0, transform: [{ translateY: 54 + v * 50 }, { scale: 0.7 + v * 0.3 }] }; });
  const nivel = useAnimatedStyle(() => ({ height: `${18 + sai(fase(t.value, 0.1, 0.85)) * 74}%` }));
  return (
    <>
      <View style={[st.abs, { left: 46, top: 24 }]}><GasPumpIcon size={84} color={C.text} weight="duotone" /></View>
      <Animated.View style={[st.abs, { left: 128 }, gota]}><DropIcon size={22} color={MENTA} weight="fill" /></Animated.View>
      <View style={[st.abs, st.medida, { left: 196, top: 22 }]}>
        <Animated.View style={[st.medidaNivel, nivel]} />
        {[0.25, 0.5, 0.75].map(f => <View key={f} style={[st.marca, { bottom: `${f * 100}%` }]} />)}
      </View>
    </>
  );
}

/** Tanques: a régua desce no tanque enterrado, volta molhada até o nível e o resultado aparece. */
const REGUA = 96, MOLHADA = 34;
function Tanques({ t }: { t: SharedValue<number> }) {
  const regua = useAnimatedStyle(() => {
    const desce = sai(fase(t.value, 0.05, 0.32)), sobe = sai(fase(t.value, 0.5, 0.72));
    return { transform: [{ translateY: -40 + (desce - sobe) * 68 }] };
  });
  const molhada = useAnimatedStyle(() => ({ opacity: fase(t.value, 0.3, 0.34) * (1 - fase(t.value, 0.9, 0.98)) }));
  const resultado = useAnimatedStyle(() => { const v = sai(fase(t.value, 0.7, 0.8)) * (1 - fase(t.value, 0.9, 0.98)); return { opacity: v, transform: [{ scale: 0.7 + v * 0.3 }] }; });
  return (
    <>
      <View style={[st.abs, { left: 14, top: 4 }]}><GasPumpIcon size={44} color={C.text} weight="duotone" /></View>
      <View style={[st.abs, st.solo]} />
      <View style={[st.abs, st.tanque]}><View style={st.tanqueNivel} /></View>
      <Animated.View style={[st.abs, st.regua, regua]}>
        {Array.from({ length: 7 }, (_, i) => <View key={i} style={[st.reguaMarca, { top: 10 + i * 12 }]} />)}
        <Animated.View style={[st.reguaMolhada, molhada]} />
      </Animated.View>
      <Animated.View style={[st.abs, st.resultado, resultado]}><Text style={st.resultadoTxt}>+7 L</Text></Animated.View>
    </>
  );
}

/** Loja de conveniência: o coletor lê o código de barras e confirma. */
function Conveniencia({ t }: { t: SharedValue<number> }) {
  const feixe = useAnimatedStyle(() => { const v = Math.sin(t.value * Math.PI * 2) * 0.5 + 0.5; return { transform: [{ translateX: 150 + v * 64 }] }; });
  const ok = useAnimatedStyle(() => { const v = sai(fase(t.value, 0.55, 0.65)) * (1 - fase(t.value, 0.9, 1)); return { opacity: v, transform: [{ scale: 0.6 + v * 0.4 }] }; });
  const carrinho = useAnimatedStyle(() => ({ transform: [{ translateX: 22 + Math.sin(t.value * Math.PI * 2) * 6 }] }));
  return (
    <>
      <Animated.View style={[st.abs, { top: 40 }, carrinho]}><ShoppingCartIcon size={76} color={C.text} weight="duotone" /></Animated.View>
      <View style={[st.abs, { left: 146, top: 26 }]}><BarcodeIcon size={84} color={TINTA} weight="regular" /></View>
      <Animated.View style={[st.abs, st.feixe, { top: 32 }, feixe]} />
      <Animated.View style={[st.abs, st.selo, { left: 236, top: 22 }, ok]}><CheckIcon size={16} color={TINTA} weight="bold" /></Animated.View>
    </>
  );
}

/** Equipe: o cronômetro marca e as barras do dimensionamento crescem uma a uma. */
const BARRAS = [150, 84, 118];
function Barra({ t, i }: { t: SharedValue<number>; i: number }) {
  const anim = useAnimatedStyle(() => ({ width: BARRAS[i] * sai(fase(t.value, 0.08 + i * 0.14, 0.32 + i * 0.14)) * (1 - fase(t.value, 0.88, 0.98)) }));
  return <Animated.View style={[st.abs, st.barra, { left: 124, top: 40 + i * 26 }, i === 0 && { backgroundColor: MENTA }, anim]} />;
}
function Equipe({ t }: { t: SharedValue<number> }) {
  const pulso = useAnimatedStyle(() => ({ transform: [{ scale: 1 + Math.max(0, Math.sin(t.value * Math.PI * 6)) * 0.04 }] }));
  return (
    <>
      <Animated.View style={[st.abs, { left: 22, top: 26 }, pulso]}><TimerIcon size={84} color={C.text} weight="duotone" /></Animated.View>
      {BARRAS.map((_, i) => <View key={`f${i}`} style={[st.abs, st.barraFundo, { left: 124, top: 40 + i * 26 }]} />)}
      {BARRAS.map((_, i) => <Barra key={i} t={t} i={i} />)}
    </>
  );
}

/** Toda a rede: o mesmo checklist confirmado posto a posto. */
function Posto({ t, i }: { t: SharedValue<number>; i: number }) {
  const ok = useAnimatedStyle(() => { const v = sai(fase(t.value, 0.12 + i * 0.22, 0.2 + i * 0.22)) * (1 - fase(t.value, 0.9, 1)); return { opacity: v, transform: [{ scale: 0.5 + v * 0.5 }] }; });
  return (
    <View style={[st.abs, { left: 22 + i * 92, top: 36 }]}>
      <StorefrontIcon size={62} color={C.text} weight="duotone" />
      <Animated.View style={[st.abs, st.selo, { left: 44, top: -8 }, ok]}><CheckIcon size={14} color={TINTA} weight="bold" /></Animated.View>
    </View>
  );
}
function Rede({ t }: { t: SharedValue<number> }) {
  return <>{[0, 1, 2].map(i => <Posto key={i} t={t} i={i} />)}</>;
}

type Area = { nome: string; texto: string; usa: string[]; cena: (props: { t: SharedValue<number> }) => React.ReactNode; ms: number };
const AREAS: Area[] = [
  { nome: 'Pista', texto: 'Aferição de bombas e bicos com a medida-padrão, bico por bico, com o resultado de cada um no relatório.', usa: ['Aferições'], cena: Pista, ms: 2600 },
  { nome: 'Tanques', texto: 'Medição pela régua com a tabela de arqueação, venda e recebimento: sobra ou falta na hora.', usa: ['Conferência de Estoque'], cena: Tanques, ms: 3400 },
  { nome: 'Loja de conveniência', texto: 'Contagem de estoque com coletor de código de barras, até 3 contagens e relatório de divergências.', usa: ['Contagens', 'Inventários'], cena: Conveniencia, ms: 2400 },
  { nome: 'Equipe', texto: 'Cronometragem dos atendimentos e dimensionamento da equipe de cada posto.', usa: ['Tempos e Movimentos'], cena: Equipe, ms: 3600 },
  { nome: 'Toda a rede', texto: 'O mesmo checklist em todos os postos, com plano de ação, mapa de risco e ranking das filiais.', usa: ['Auditoria', 'Mapa de Risco', 'Agenda'], cena: Rede, ms: 3200 },
];

function Cartao({ a, flex }: { a: Area; flex: number }) {
  const reduz = useReducedMotion();
  const { ref, visto } = useEmVista(false, '0px');
  const t = useCiclo(a.ms, visto, reduz);
  const hover = useSharedValue(0);
  const anim = useAnimatedStyle(() => ({ transform: [{ translateY: hover.value * -3 }], borderColor: hover.value > 0.5 ? C.borderStrong : C.border }));
  const Cena = a.cena;
  return (
    <Pressable style={{ flex }} accessible={false}
      onHoverIn={() => { if (Platform.OS === 'web' && !reduz) hover.value = withTiming(1, { duration: 200, easing: EASE }); }}
      onHoverOut={() => { hover.value = withTiming(0, { duration: 240, easing: EASE }); }}>
      <Animated.View ref={ref} style={[st.cartao, anim]}>
        <View style={st.vinheta}><Palco largura={VW} altura={VH} maxAltura={150}><Cena t={t} /></Palco></View>
        <Text style={st.nome}>{a.nome}</Text>
        <Text style={st.texto}>{a.texto}</Text>
        <View style={st.chips}>{a.usa.map(u => <Text key={u} style={st.chip}>{u}</Text>)}</View>
      </Animated.View>
    </Pressable>
  );
}

/** Mosaico das áreas do posto: 2 cartões na primeira linha e 3 na segunda (no celular, um por linha). */
export function AreasDoPosto({ desktop }: { desktop: boolean }) {
  const linhas = desktop ? [[0, 1], [2, 3, 4]] : AREAS.map((_, i) => [i]);
  return (
    <View style={{ gap: 16 }}>
      {linhas.map((l, li) => (
        <View key={li} style={{ flexDirection: 'row', gap: 16 }}>
          {l.map((i, k) => (
            <Revela key={i} atraso={k * 90} style={{ flex: desktop && li === 0 && k === 0 ? 1.35 : 1 }}>
              <Cartao a={AREAS[i]} flex={1} />
            </Revela>
          ))}
        </View>
      ))}
    </View>
  );
}

const st = StyleSheet.create({
  abs: { position: 'absolute', left: 0, top: 0 },
  cartao: { flex: 1, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 18, padding: 20, gap: 10 },
  vinheta: { borderRadius: 14, backgroundColor: '#f1f4f8', overflow: 'hidden', marginBottom: 6 },
  nome: { color: C.text, fontSize: 19, fontWeight: '800', letterSpacing: -0.3 },
  texto: { color: C.textMuted, fontSize: 14.5, lineHeight: 21 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
  chip: { color: '#14305e', fontSize: 12, fontWeight: '700', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, backgroundColor: '#e9eef7' },
  // Pista
  medida: { width: 54, height: 100, borderRadius: 10, borderWidth: 2, borderColor: LINHA, overflow: 'hidden', justifyContent: 'flex-end', backgroundColor: '#ffffff' },
  medidaNivel: { width: '100%', backgroundColor: MENTA, opacity: 0.9 },
  marca: { position: 'absolute', right: 0, width: 10, height: 2, backgroundColor: LINHA },
  // Tanques: solo a partir de y = 50; tanque deitado de 66 a 126; régua centrada no tanque (x = 150).
  solo: { left: 0, top: 50, width: VW, height: VH - 50, backgroundColor: '#e3e8ef' },
  tanque: { left: 70, top: 66, width: 160, height: 60, borderRadius: 30, borderWidth: 2, borderColor: LINHA, backgroundColor: '#ffffff', overflow: 'hidden', justifyContent: 'flex-end' },
  tanqueNivel: { height: '60%', backgroundColor: MENTA, opacity: 0.9 },
  regua: { left: 146, top: 0, width: 8, height: REGUA, borderRadius: 2, backgroundColor: '#f3c86b', borderWidth: 1, borderColor: '#c99a33', overflow: 'hidden' },
  reguaMarca: { position: 'absolute', left: 0, width: 4, height: 1.5, backgroundColor: '#8a6516' },
  reguaMolhada: { position: 'absolute', left: 0, right: 0, bottom: 0, height: MOLHADA, backgroundColor: MENTA },
  resultado: { left: 222, top: 14, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: MENTA },
  resultadoTxt: { color: TINTA, fontSize: 13, fontWeight: '800' },
  // Conveniência e rede
  feixe: { width: 3, height: 74, borderRadius: 2, backgroundColor: '#ff5b4f', shadowColor: '#ff5b4f', shadowOpacity: 0.8, shadowRadius: 6, shadowOffset: { width: 0, height: 0 } },
  selo: { width: 26, height: 26, borderRadius: 13, backgroundColor: MENTA, alignItems: 'center', justifyContent: 'center' },
  // Equipe
  barraFundo: { width: 150, height: 12, borderRadius: 6, backgroundColor: '#dde3ec' },
  barra: { height: 12, borderRadius: 6, backgroundColor: TINTA },
});
