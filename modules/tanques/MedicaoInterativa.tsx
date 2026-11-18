import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { GestureDetector, GestureHandlerRootView, usePanGesture, type PanGestureConfig } from 'react-native-gesture-handler';
import Animated, { cancelAnimation, Easing, useAnimatedProps, useReducedMotion, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { ClipPath, Defs, G, Line, LinearGradient, Path, Rect, Stop, Text as SvgText } from 'react-native-svg';
import { scheduleOnRN } from 'react-native-worklets';
import { ArrowRightIcon, CheckIcon, XIcon } from '../../ui/icons';
import { darkColor, ThemeContext } from '../../ui/theme';
import { faixa, Roleta } from '../afericoes/Roleta';
import { alturaMaxima, litrosPelaTabela, type TabelaArqueacao, volumeTotal } from './arqueacao';
import { fmtL, lerNumero, type LinhaTanque } from './model';

/*
 * Medição de tanques interativa (opcional; a tela normal continua igual):
 * o tanque subterrâneo em corte, com a régua entrando pela boca de visita. Arraste para cima ou para baixo
 * (no desenho) para marcar a altura em cm, ou gire a roleta ao lado para o ajuste fino; o combustível sobe
 * e desce junto e a régua mostra a parte molhada. Com tabela de arqueação, a régua vai até o diâmetro do tanque e os
 * litros saem sozinhos da tabela; sem tabela, a escala é de referência (0 a 260 cm) e os litros são digitados.
 */

const NAVY = '#0b1426', PAINEL = '#13213b', PAINEL2 = '#1b2c4b', LINHA = '#2a3d62', FG = '#eef2f8', MUTED = '#9fb0c9', MINT = '#5fd39a';
/** Diâmetro de referência do desenho (cm) para tanque sem tabela de arqueação. */
const DIAM_REF = 260;
// Desenho (viewBox 340 × 320): tanque subterrâneo horizontal visto de lado (cilindro com tampos abaulados),
// do x 20 ao 320, topo em y 100 e fundo em y 300; boca de visita e régua no meio (x 170).
const VB_W = 340, VB_H = 320, CX = 170, TOPO = 100, FUNDO = 300, ALTURA = FUNDO - TOPO, X0 = 20, X1 = 320;
/** Contorno do tanque: corpo cilíndrico com tampos (calotas) elípticos nas pontas. */
const CASCO = `M70 ${TOPO} H270 A50 ${ALTURA / 2} 0 0 1 270 ${FUNDO} H70 A50 ${ALTURA / 2} 0 0 1 70 ${TOPO} Z`;
const yDoCm = (cm: number, diam: number) => { 'worklet'; return FUNDO - (Math.min(cm, diam) / diam) * ALTURA; };

const AnimatedRect = Animated.createAnimatedComponent(Rect);
const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedLine = Animated.createAnimatedComponent(Line);

export function MedicaoInterativa({ tanques, filial, nomeComb, corComb, tabelaDe, onMudar, onFechar }: {
  tanques: LinhaTanque[];
  filial: string;
  nomeComb: (id: string) => string;
  corComb: (id: string) => string;
  /** Tabela de arqueação do tanque (pelo número), se houver. */
  tabelaDe: (tanque: string) => TabelaArqueacao | undefined;
  onMudar: (id: string, patch: Partial<LinhaTanque>) => void;
  onFechar: () => void;
}) {
  const insets = useSafeAreaInsets();
  const reduz = useReducedMotion();
  const primeiroPendente = Math.max(0, tanques.findIndex(l => l.metragem === null || l.litros === null));
  const [atual, setAtual] = useState(primeiroPendente);
  const t = tanques[atual];
  const cor = t ? corComb(t.combustivel) : MINT;
  const tab = t ? tabelaDe(t.tanque) : undefined;
  const DIAM = tab ? Math.max(1, Math.ceil(alturaMaxima(tab))) : DIAM_REF;
  const valoresCm = useMemo(() => faixa(0, DIAM, 1), [DIAM]);
  const diam = useSharedValue(DIAM);
  useEffect(() => { diam.set(DIAM); }, [DIAM, diam]);

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
  // Litros recalculados por fora (tabela ligada ou corrigida, tela normal): o campo acompanha.
  useEffect(() => {
    const v = tanques[atual]?.litros ?? null;
    setLitrosTxt(txt => (lerNumero(txt) === v ? txt : v === null ? '' : String(v).replace('.', ',')));
  }, [tanques, atual]);
  useEffect(() => {
    if (!reduz) fase.set(withRepeat(withTiming(Math.PI * 2, { duration: 1600, easing: Easing.linear }), -1, false));
    return () => cancelAnimation(fase);
  }, [reduz, fase]);

  /** Grava a altura; com tabela, também os litros dela (e mostra no campo). */
  const gravarAltura = (v: number) => {
    if (!t) return;
    if (!tab) { onMudar(t.id, { metragem: v }); return; }
    const l = litrosPelaTabela(tab, v);
    onMudar(t.id, { metragem: v, litros: l, litrosTabela: tab.nome });
    setLitrosTxt(l === null ? '' : String(l).replace('.', ','));
  };
  const gravarRef = useRef(gravarAltura);
  gravarRef.current = gravarAltura;
  const gravar = useCallback((v: number) => gravarRef.current(v), []);
  /** Durante o arraste: mostra a altura e, com tabela, os litros dela (a gravação é ao soltar). */
  const mostrarRef = useRef((v: number) => { setCm(v); });
  mostrarRef.current = (v: number) => {
    setCm(v);
    if (tab) { const l = litrosPelaTabela(tab, v); setLitrosTxt(l === null ? '' : String(l).replace('.', ',')); }
  };
  const mostrar = useCallback((v: number) => mostrarRef.current(v), []);
  const definir = (v: number) => { setCm(v); nivel.set(reduz ? v : withTiming(v, { duration: 220, easing: Easing.out(Easing.cubic) })); gravar(v); };

  const alturaDesenho = useSharedValue(330);
  const ultimo = useSharedValue(-1);
  const configPan = useMemo((): PanGestureConfig => ({
    onBegin: ev => {
      'worklet';
      const y = (ev.y / alturaDesenho.get()) * VB_H;
      const v = Math.max(0, Math.min(diam.get(), Math.round(((FUNDO - y) / ALTURA) * diam.get())));
      nivel.set(v); ultimo.set(v); scheduleOnRN(mostrar, v);
    },
    onUpdate: ev => {
      'worklet';
      const y = (ev.y / alturaDesenho.get()) * VB_H;
      const v = Math.max(0, Math.min(diam.get(), Math.round(((FUNDO - y) / ALTURA) * diam.get())));
      nivel.set(v);
      if (v !== ultimo.get()) { ultimo.set(v); scheduleOnRN(mostrar, v); }
    },
    onFinalize: () => { 'worklet'; if (ultimo.get() >= 0) scheduleOnRN(gravar, ultimo.get()); },
  }), [alturaDesenho, nivel, ultimo, gravar, mostrar, diam]);
  const pan = usePanGesture(configPan);

  /* ----- Desenho animado ----- */
  const liqProps = useAnimatedProps(() => { const y = yDoCm(nivel.get(), diam.get()); return { y, height: Math.max(0, FUNDO + 4 - y) }; });
  const ondaProps = useAnimatedProps(() => {
    const y = yDoCm(nivel.get(), diam.get());
    const amp = nivel.get() > 1 ? 2.2 : 0;
    let d = `M${X0} ${y + 6}`;
    for (let x = X0; x <= X1; x += 10) d += ` L${x} ${y + Math.sin(x / 15 + fase.get()) * amp}`;
    return { d: `${d} L${X1} ${FUNDO + 6} L${X0} ${FUNDO + 6} Z` };
  });
  const molhadoProps = useAnimatedProps(() => { const y = yDoCm(nivel.get(), diam.get()); return { y, height: Math.max(0, FUNDO - y) }; });
  const linhaProps = useAnimatedProps(() => { const y = yDoCm(nivel.get(), diam.get()); return { y1: y, y2: y }; });

  /* ----- Litros (tabela do tanque) ----- */
  const mudarLitros = (txt: string) => { setLitrosTxt(txt); if (!t) return; const n = lerNumero(txt); if (n !== null || !txt.trim()) onMudar(t.id, { litros: n, litrosTabela: undefined }); };

  const medidos = tanques.filter(l => l.metragem !== null && l.litros !== null).length;
  const proximo = () => {
    const prox = tanques.findIndex((l, i) => i > atual && (l.metragem === null || l.litros === null));
    const alvo = prox >= 0 ? prox : tanques.findIndex(l => l.metragem === null || l.litros === null);
    if (alvo >= 0 && alvo !== atual) setAtual(alvo); else onFechar();
  };
  const ctxTema = useContext(ThemeContext);
  const temaEscuro = useMemo(() => ({ ...ctxTema, mode: 'dark' as const, colors: { ...darkColor, bg: NAVY, surface: PAINEL, surfaceMuted: PAINEL2, accent: MINT, primaryText: NAVY, campo: NAVY } }), [ctxTema]);
  if (!t) return null;
  const litrosAgora = lerNumero(litrosTxt);
  const pct = tab && litrosAgora !== null && volumeTotal(tab) ? Math.round((litrosAgora / volumeTotal(tab)) * 100) : cm === null ? null : Math.round((Math.min(cm, DIAM) / DIAM) * 100);

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
                  onAccessibilityAction={ev => definir(Math.max(0, Math.min(DIAM, (cm ?? 0) + (ev.nativeEvent.actionName === 'increment' ? 1 : -1))))}>
                  <Svg viewBox={`0 0 ${VB_W} ${VB_H}`} style={{ width: '100%', aspectRatio: VB_W / VB_H }}>
                    <Defs>
                      <ClipPath id="casco"><Path d={CASCO} /></ClipPath>
                      <LinearGradient id="comb" x1="0" y1="0" x2="0" y2="1"><Stop offset="0" stopColor="#ffb08f" stopOpacity={0.95} /><Stop offset="1" stopColor={cor} /></LinearGradient>
                      <LinearGradient id="aco" x1="0" y1="0" x2="0" y2="1"><Stop offset="0" stopColor="#d9dee6" /><Stop offset="0.5" stopColor="#aab3c0" /><Stop offset="1" stopColor="#7d8796" /></LinearGradient>
                      <LinearGradient id="terra" x1="0" y1="0" x2="0" y2="1"><Stop offset="0" stopColor="#4a3b2c" /><Stop offset="1" stopColor="#2b2219" /></LinearGradient>
                    </Defs>
                    {/* solo, laje de concreto da pista e terra em volta do tanque */}
                    <Rect x={0} y={34} width={VB_W} height={VB_H - 34} fill="url(#terra)" />
                    <Rect x={0} y={28} width={VB_W} height={12} fill="#8a8f98" />
                    <Rect x={0} y={28} width={VB_W} height={2} fill="#b8bdc5" />
                    {/* tubo de descarga (com engate) e respiro */}
                    <Rect x={96} y={24} width={10} height={TOPO - 22} fill="url(#aco)" />
                    <Rect x={91} y={18} width={20} height={9} rx={2} fill="#f2b233" />
                    <SvgText x={101} y={13} textAnchor="middle" fill="#cfd4da" fontSize={8}>descarga</SvgText>
                    <Rect x={250} y={6} width={7} height={TOPO - 4} fill="url(#aco)" />
                    <Path d="M244 8 H263 L259 2 H248 Z" fill="#aab3c0" />
                    <SvgText x={272} y={22} fill="#cfd4da" fontSize={8}>respiro</SvgText>
                    {/* boca de visita: pescoço, flange e tampa na laje */}
                    <Rect x={146} y={40} width={48} height={TOPO - 38} fill="url(#aco)" stroke="#5c6575" strokeWidth={1} />
                    <Rect x={138} y={38} width={64} height={6} rx={2} fill="#6b7483" />
                    <Rect x={140} y={26} width={60} height={5} rx={2} fill="#3a404b" />
                    {/* casco do tanque com o combustível */}
                    <Path d={CASCO} fill="#0d1a30" />
                    <G clipPath="url(#casco)">
                      <AnimatedRect x={X0} width={X1 - X0} fill="url(#comb)" animatedProps={liqProps} />
                      <AnimatedPath fill="url(#comb)" animatedProps={ondaProps} />
                    </G>
                    {/* cintas de reforço e contorno de aço */}
                    {[110, 230].map(x => <Line key={x} x1={x} x2={x} y1={TOPO} y2={FUNDO} stroke="#cfd4da" strokeOpacity={0.35} strokeWidth={3} />)}
                    <Path d={CASCO} fill="none" stroke="#cfd4da" strokeWidth={3.5} />
                    <SvgText x={52} y={84} textAnchor="middle" fill="#ffffff" opacity={0.75} fontWeight="700" fontSize={10}>{t.combustivel ? nomeComb(t.combustivel) : ''}</SvgText>
                    {/* régua pela boca de visita: parte molhada na cor do combustível */}
                    <Rect x={CX - 6} y={16} width={12} height={FUNDO - 16} rx={3} fill="#e8d9a8" />
                    <AnimatedRect x={CX - 6} width={12} fill={cor} opacity={0.9} animatedProps={molhadoProps} />
                    {Array.from({ length: Math.floor(DIAM / 10) + 1 }, (_, k) => {
                      const v = k * 10, y = yDoCm(v, DIAM), forte = v % 50 === 0;
                      return (
                        <G key={v}>
                          <Line x1={CX - 6} x2={forte ? CX + 2 : CX - 2} y1={y} y2={y} stroke="#3a2f12" strokeWidth={forte ? 1.4 : 0.9} />
                          {forte ? <SvgText x={CX + 10} y={y + 3} fill="#ffffff" fontSize={9} fontWeight="700">{v}</SvgText> : null}
                        </G>
                      );
                    })}
                    <AnimatedLine x1={X0} x2={X1} stroke={MINT} strokeWidth={1.5} strokeDasharray="6 5" animatedProps={linhaProps} />
                  </Svg>
                </View>
              </GestureDetector>
              <ThemeContext.Provider value={temaEscuro}>
                <View style={{ width: 92, gap: 6, justifyContent: 'center' }}>
                  <Text style={[e.sub, { textAlign: 'center' }]}>Ajuste fino</Text>
                  <View style={e.campoRoleta}>
                    <Roleta rotulo="Altura em centímetros" valores={valoresCm} valor={cm === null ? '' : String(Math.min(DIAM, Math.round(cm)))} vazio={cm === null} formatar={v => `${v} cm`}
                      onChange={v => definir(Number(v))} altura={42} visiveis={3} />
                  </View>
                </View>
              </ThemeContext.Provider>
            </View>

            {/* Leitura */}
            <View style={e.leitura}>
              <Text style={[e.num, { color: cm === null ? MUTED : FG }]}>{cm === null ? '—' : String(cm).replace('.', ',')}</Text>
              <Text style={e.un}>cm</Text>
              {pct !== null ? <View style={e.tag}><Text style={e.tagTxt}>{pct}% {tab ? 'do tanque' : 'da régua'}</Text></View> : null}
            </View>
            <Text style={e.sub}>Arraste no tanque para marcar a altura do combustível; use a roleta para o ajuste fino. {tab
              ? `Régua de 0 a ${DIAM} cm, pela tabela ${tab.nome}.`
              : `Sem tabela de arqueação: escala de referência de 0 a ${DIAM} cm (importe a tabela por PDF no painel web).`}</Text>

            {/* Litros */}
            <View style={e.caixa}>
              <Text style={e.rot}>{tab ? `Litros pela tabela ${tab.nome}` : 'Litros (tabela do tanque)'}</Text>
              <TextInput value={litrosTxt} onChangeText={mudarLitros} keyboardType="decimal-pad" placeholder="0" placeholderTextColor="#6b7891"
                style={e.litros} accessibilityLabel="Litros pela tabela do tanque" />
              {tab && cm !== null && cm > alturaMaxima(tab) ? <Text style={[e.sub, { color: '#ffb547' }]}>Altura acima da tabela ({alturaMaxima(tab)} cm): os litros ficam no volume total. Confira a medida.</Text> : null}
              {tab ? <Text style={e.sub}>{t.litrosTabela ? 'Calculado pela altura (dá para corrigir digitando).' : 'Digitado à mão; mexa na régua para calcular pela tabela.'}</Text> : null}
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
