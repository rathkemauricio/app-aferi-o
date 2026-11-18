import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { GestureDetector, GestureHandlerRootView, usePanGesture, type PanGestureConfig } from 'react-native-gesture-handler';
import Animated, { cancelAnimation, Easing, useAnimatedProps, useReducedMotion, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, ClipPath, Defs, G, Line, LinearGradient, Path, Rect, Stop, Text as SvgText } from 'react-native-svg';
import { scheduleOnRN } from 'react-native-worklets';
import { ArrowRightIcon, CheckIcon, XIcon } from '../../ui/icons';
import { darkColor, ThemeContext } from '../../ui/theme';
import { faixa, Roleta } from '../afericoes/Roleta';
import { fmtL, lerNumero, type LinhaTanque } from './model';

/*
 * Medição de tanques interativa (opcional; a tela normal continua igual):
 * o tanque subterrâneo em corte, com a régua entrando pela boca de visita. Arraste para cima ou para baixo
 * (no desenho) para marcar a altura em cm, ou gire a roleta ao lado para o ajuste fino; o combustível sobe
 * e desce junto e a régua mostra a parte molhada. Os litros vêm da tabela do tanque e são digitados.
 */

const NAVY = '#0b1426', PAINEL = '#13213b', PAINEL2 = '#1b2c4b', LINHA = '#2a3d62', FG = '#eef2f8', MUTED = '#9fb0c9', MINT = '#5fd39a';
/** Diâmetro de referência do desenho (cm): a escala da régua vai de 0 a 260 cm. */
const DIAM = 260;
const VALORES_CM = faixa(0, 300, 1);
// Desenho (viewBox 300 × 330): tanque em corte com centro (150, 200) e raio 115 → fundo em y 315, topo em y 85.
const CX = 150, CY = 200, R = 115, FUNDO = CY + R, ALTURA = 2 * R;
const yDoCm = (cm: number) => { 'worklet'; return FUNDO - (Math.min(cm, DIAM) / DIAM) * ALTURA; };

const AnimatedRect = Animated.createAnimatedComponent(Rect);
const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedLine = Animated.createAnimatedComponent(Line);

export function MedicaoInterativa({ tanques, filial, nomeComb, corComb, onMudar, onFechar }: {
  tanques: LinhaTanque[];
  filial: string;
  nomeComb: (id: string) => string;
  corComb: (id: string) => string;
  onMudar: (id: string, patch: Partial<LinhaTanque>) => void;
  onFechar: () => void;
}) {
  const insets = useSafeAreaInsets();
  const reduz = useReducedMotion();
  const primeiroPendente = Math.max(0, tanques.findIndex(l => l.metragem === null || l.litros === null));
  const [atual, setAtual] = useState(primeiroPendente);
  const t = tanques[atual];
  const cor = t ? corComb(t.combustivel) : MINT;

  /* ----- Nível (cm): arraste no desenho ou roleta ----- */
  const nivel = useSharedValue(t?.metragem ?? 0);
  const fase = useSharedValue(0);
  const [cm, setCm] = useState<number | null>(t?.metragem ?? null);
  const [litrosTxt, setLitrosTxt] = useState(t?.litros !== null && t?.litros !== undefined ? String(t.litros).replace('.', ',') : '');
  useEffect(() => {
    const l = tanques[atual];
    setCm(l?.metragem ?? null);
    setLitrosTxt(l?.litros !== null && l?.litros !== undefined ? String(l.litros).replace('.', ',') : '');
    nivel.set(reduz ? (l?.metragem ?? 0) : withTiming(l?.metragem ?? 0, { duration: 350, easing: Easing.out(Easing.cubic) }));
  }, [atual]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!reduz) fase.set(withRepeat(withTiming(Math.PI * 2, { duration: 1600, easing: Easing.linear }), -1, false));
    return () => cancelAnimation(fase);
  }, [reduz, fase]);

  const gravarRef = useRef((v: number) => { if (t) onMudar(t.id, { metragem: v }); });
  gravarRef.current = (v: number) => { if (t) onMudar(t.id, { metragem: v }); };
  const gravar = useCallback((v: number) => gravarRef.current(v), []);
  const definir = (v: number) => { setCm(v); nivel.set(reduz ? v : withTiming(v, { duration: 220, easing: Easing.out(Easing.cubic) })); gravar(v); };

  const alturaDesenho = useSharedValue(330);
  const ultimo = useSharedValue(-1);
  const configPan = useMemo((): PanGestureConfig => ({
    onBegin: ev => {
      'worklet';
      const y = (ev.y / alturaDesenho.get()) * 330;
      const v = Math.max(0, Math.min(DIAM, Math.round(((FUNDO - y) / ALTURA) * DIAM)));
      nivel.set(v); ultimo.set(v); scheduleOnRN(setCm, v);
    },
    onUpdate: ev => {
      'worklet';
      const y = (ev.y / alturaDesenho.get()) * 330;
      const v = Math.max(0, Math.min(DIAM, Math.round(((FUNDO - y) / ALTURA) * DIAM)));
      nivel.set(v);
      if (v !== ultimo.get()) { ultimo.set(v); scheduleOnRN(setCm, v); }
    },
    onFinalize: () => { 'worklet'; if (ultimo.get() >= 0) scheduleOnRN(gravar, ultimo.get()); },
  }), [alturaDesenho, nivel, ultimo, gravar]);
  const pan = usePanGesture(configPan);

  /* ----- Desenho animado ----- */
  const liqProps = useAnimatedProps(() => { const y = yDoCm(nivel.get()); return { y, height: Math.max(0, FUNDO + 4 - y) }; });
  const ondaProps = useAnimatedProps(() => {
    const y = yDoCm(nivel.get());
    const amp = nivel.get() > 1 ? 2.2 : 0;
    let d = `M${CX - R} ${y + 6}`;
    for (let x = CX - R; x <= CX + R; x += 10) d += ` L${x} ${y + Math.sin(x / 15 + fase.get()) * amp}`;
    return { d: `${d} L${CX + R} ${FUNDO + 6} L${CX - R} ${FUNDO + 6} Z` };
  });
  const molhadoProps = useAnimatedProps(() => { const y = yDoCm(nivel.get()); return { y, height: Math.max(0, FUNDO - y) }; });
  const linhaProps = useAnimatedProps(() => { const y = yDoCm(nivel.get()); return { y1: y, y2: y }; });

  /* ----- Litros (tabela do tanque) ----- */
  const mudarLitros = (txt: string) => { setLitrosTxt(txt); if (!t) return; const n = lerNumero(txt); if (n !== null || !txt.trim()) onMudar(t.id, { litros: n }); };

  const medidos = tanques.filter(l => l.metragem !== null && l.litros !== null).length;
  const proximo = () => {
    const prox = tanques.findIndex((l, i) => i > atual && (l.metragem === null || l.litros === null));
    const alvo = prox >= 0 ? prox : tanques.findIndex(l => l.metragem === null || l.litros === null);
    if (alvo >= 0 && alvo !== atual) setAtual(alvo); else onFechar();
  };
  const ctxTema = useContext(ThemeContext);
  const temaEscuro = useMemo(() => ({ ...ctxTema, mode: 'dark' as const, colors: { ...darkColor, bg: NAVY, surface: PAINEL, surfaceMuted: PAINEL2, accent: MINT, primaryText: NAVY, campo: NAVY } }), [ctxTema]);
  if (!t) return null;
  const pct = cm === null ? null : Math.round((Math.min(cm, DIAM) / DIAM) * 100);

  return (
    <Modal visible animationType={reduz ? 'none' : 'slide'} presentationStyle="fullScreen" statusBarTranslucent onRequestClose={onFechar}>
      <GestureHandlerRootView style={{ flex: 1, backgroundColor: NAVY }}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={[e.corpo, { paddingTop: insets.top + 10, paddingBottom: insets.bottom + 24 }]} keyboardShouldPersistTaps="handled">
            {/* Topo */}
            <View style={e.linha}>
              <Pressable accessibilityRole="button" accessibilityLabel="Fechar a medição interativa" onPress={onFechar} hitSlop={10} style={e.redondo}><XIcon size={20} color={FG} weight="bold" /></Pressable>
              <View style={{ flex: 1 }}>
                <Text style={e.titulo} numberOfLines={1}>Tanque {t.tanque || '?'} · {t.combustivel ? nomeComb(t.combustivel) : 'sem combustível'}</Text>
                <Text style={e.sub} numberOfLines={1}>{filial}</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={e.prog}>{medidos} de {tanques.length}</Text>
                <Text style={e.sub}>tanques medidos</Text>
              </View>
            </View>

            {/* Tanques da medição */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {tanques.map((l, i) => {
                const on = i === atual, feito = l.metragem !== null && l.litros !== null;
                return (
                  <Pressable key={l.id} accessibilityRole="button" accessibilityState={{ selected: on }} onPress={() => setAtual(i)}
                    style={[e.chip, on && { backgroundColor: FG, borderColor: FG }]}>
                    <View style={[e.gota, { backgroundColor: corComb(l.combustivel) }]}><Text style={e.gotaTxt}>{l.tanque || '?'}</Text></View>
                    <Text style={[e.chipTxt, on && { color: NAVY }]} numberOfLines={1}>{l.combustivel ? nomeComb(l.combustivel) : 'Tanque'}</Text>
                    {feito ? <CheckIcon size={14} color={on ? NAVY : MINT} weight="bold" /> : null}
                  </Pressable>
                );
              })}
            </ScrollView>

            {/* Tanque em corte com a régua */}
            <View style={e.cena}>
              <GestureDetector gesture={pan}>
                <View style={{ flex: 1 }} onLayout={ev => alturaDesenho.set(ev.nativeEvent.layout.height)}
                  accessibilityRole="adjustable" accessibilityLabel={`Altura do combustível: ${cm === null ? 'não medida' : `${cm} centímetros`}`}
                  accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
                  onAccessibilityAction={ev => definir(Math.max(0, Math.min(300, (cm ?? 0) + (ev.nativeEvent.actionName === 'increment' ? 1 : -1))))}>
                  <Svg viewBox="0 0 300 330" style={{ width: '100%', aspectRatio: 300 / 330 }}>
                    <Defs>
                      <ClipPath id="corte"><Circle cx={CX} cy={CY} r={R} /></ClipPath>
                      <LinearGradient id="comb" x1="0" y1="0" x2="0" y2="1"><Stop offset="0" stopColor="#ffb08f" stopOpacity={0.95} /><Stop offset="1" stopColor={cor} /></LinearGradient>
                    </Defs>
                    {/* chão e boca de visita */}
                    <Rect x={0} y={20} width={300} height={44} fill="#2a2f3a" />
                    <Rect x={0} y={60} width={300} height={4} fill="#3b4252" />
                    <Rect x={128} y={44} width={44} height={42} fill="#1d2433" stroke="#4a5263" strokeWidth={2} />
                    {/* tanque */}
                    <Circle cx={CX} cy={CY} r={R} fill="#0d1a30" />
                    <G clipPath="url(#corte)">
                      <AnimatedRect x={CX - R} width={2 * R} fill="url(#comb)" animatedProps={liqProps} />
                      <AnimatedPath fill="url(#comb)" animatedProps={ondaProps} />
                    </G>
                    <Circle cx={CX} cy={CY} r={R} fill="none" stroke="#cfd4da" strokeWidth={3} />
                    {/* régua: parte molhada na cor do combustível */}
                    <Rect x={144} y={8} width={12} height={FUNDO - 8} rx={3} fill="#e8d9a8" />
                    <AnimatedRect x={144} width={12} fill={cor} opacity={0.9} animatedProps={molhadoProps} />
                    {Array.from({ length: DIAM / 10 + 1 }, (_, k) => {
                      const v = k * 10, y = yDoCm(v), forte = v % 50 === 0;
                      return (
                        <G key={v}>
                          <Line x1={144} x2={forte ? 152 : 148} y1={y} y2={y} stroke="#3a2f12" strokeWidth={forte ? 1.4 : 0.9} />
                          {forte ? <SvgText x={162} y={y + 3} fill="#cfd4da" fontSize={9}>{v}</SvgText> : null}
                        </G>
                      );
                    })}
                    <AnimatedLine x1={CX - R} x2={CX + R} stroke={MINT} strokeWidth={1.5} strokeDasharray="6 5" animatedProps={linhaProps} />
                    <SvgText x={CX} y={CY + 60} textAnchor="middle" fill="#cfd4da" opacity={0.45} fontWeight="700" fontSize={14}>{t.combustivel ? nomeComb(t.combustivel) : ''}</SvgText>
                  </Svg>
                </View>
              </GestureDetector>
              <ThemeContext.Provider value={temaEscuro}>
                <View style={{ width: 92, gap: 6, justifyContent: 'center' }}>
                  <Text style={[e.sub, { textAlign: 'center' }]}>Ajuste fino</Text>
                  <View style={e.campoRoleta}>
                    <Roleta rotulo="Altura em centímetros" valores={VALORES_CM} valor={cm === null ? '' : String(cm)} vazio={cm === null} formatar={v => `${v} cm`}
                      onChange={v => definir(Number(v))} altura={42} visiveis={3} />
                  </View>
                </View>
              </ThemeContext.Provider>
            </View>

            {/* Leitura */}
            <View style={e.leitura}>
              <Text style={[e.num, { color: cm === null ? MUTED : FG }]}>{cm === null ? '—' : cm}</Text>
              <Text style={e.un}>cm</Text>
              {pct !== null ? <View style={e.tag}><Text style={e.tagTxt}>{pct}% da régua</Text></View> : null}
            </View>
            <Text style={e.sub}>Arraste no tanque para marcar a altura do combustível; use a roleta para o ajuste fino. Escala do desenho: 0 a {DIAM} cm.</Text>

            {/* Litros */}
            <View style={e.caixa}>
              <Text style={e.rot}>Litros (tabela do tanque)</Text>
              <TextInput value={litrosTxt} onChangeText={mudarLitros} keyboardType="decimal-pad" placeholder="0" placeholderTextColor="#6b7891"
                style={e.litros} accessibilityLabel="Litros pela tabela do tanque" />
              <Text style={e.sub}>Informada (medição anterior): <Text style={{ color: FG, fontWeight: '800' }}>{fmtL(t.informada)} L</Text></Text>
            </View>

            <Pressable accessibilityRole="button" onPress={proximo} style={[e.btn, { backgroundColor: MINT, flexDirection: 'row', gap: 8 }]}>
              <Text style={[e.btnTxt, { color: NAVY }]}>{tanques.some((l, i) => i !== atual && (l.metragem === null || l.litros === null)) ? 'Próximo tanque' : 'Concluir'}</Text>
              <ArrowRightIcon size={18} color={NAVY} weight="bold" />
            </Pressable>
            <Text style={[e.sub, { textAlign: 'center' }]}>Venda, recebimento e a conferência por combustível continuam na tela normal da medição.</Text>
          </ScrollView>
        </KeyboardAvoidingView>
      </GestureHandlerRootView>
    </Modal>
  );
}

const e = StyleSheet.create({
  corpo: { paddingHorizontal: 16, gap: 14, backgroundColor: NAVY },
  linha: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  redondo: { width: 40, height: 40, borderRadius: 12, backgroundColor: PAINEL2, alignItems: 'center', justifyContent: 'center' },
  titulo: { color: FG, fontSize: 18, fontWeight: '800' },
  sub: { color: MUTED, fontSize: 12 },
  prog: { color: MINT, fontSize: 14, fontWeight: '800', fontVariant: ['tabular-nums'] },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6, paddingLeft: 6, paddingRight: 12, borderRadius: 999, backgroundColor: PAINEL2, borderWidth: 1, borderColor: LINHA },
  gota: { minWidth: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  gotaTxt: { color: '#fff', fontSize: 12, fontWeight: '800' },
  chipTxt: { color: FG, fontSize: 13, fontWeight: '700', maxWidth: 150 },
  cena: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: PAINEL, borderRadius: 18, padding: 10 },
  campoRoleta: { borderRadius: 12, borderWidth: 1, borderColor: LINHA, backgroundColor: NAVY, overflow: 'hidden' },
  leitura: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  num: { fontSize: 44, fontWeight: '800', fontVariant: ['tabular-nums'], letterSpacing: -1 },
  un: { color: MUTED, fontWeight: '700' },
  tag: { marginLeft: 'auto', borderRadius: 999, paddingHorizontal: 9, paddingVertical: 4, backgroundColor: '#5fd39a22' },
  tagTxt: { color: MINT, fontWeight: '700', fontSize: 12 },
  caixa: { backgroundColor: PAINEL, borderRadius: 18, padding: 14, gap: 8 },
  rot: { color: FG, fontWeight: '800', fontSize: 15 },
  litros: { borderRadius: 12, borderWidth: 1.5, borderColor: LINHA, backgroundColor: '#ffffff', color: '#0f1f3d', fontSize: 26, fontWeight: '800', paddingHorizontal: 14, paddingVertical: 10, fontVariant: ['tabular-nums'] },
  btn: { borderRadius: 14, paddingVertical: 15, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center' },
  btnTxt: { color: FG, fontWeight: '800', fontSize: 15 },
});
