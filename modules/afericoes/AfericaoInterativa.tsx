import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { GestureDetector, GestureHandlerRootView, usePanGesture, type PanGestureConfig } from 'react-native-gesture-handler';
import Animated, { cancelAnimation, Easing, ReduceMotion, useAnimatedProps, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { ClipPath, Defs, G, Line, LinearGradient, Path, Rect, Stop, Text as SvgText } from 'react-native-svg';
import { scheduleOnRN } from 'react-native-worklets';
import { ArrowRightIcon, CheckIcon, PlayIcon, ResetIcon, StopIcon, TimerIcon, XIcon } from '../../ui/icons';
import { darkColor, ThemeContext } from '../../ui/theme';
import { faixa, Roleta } from './Roleta';

const VALORES_VAZAO = faixa(0, 80, 1);
const VALORES_SEGUNDOS = faixa(0, 120, 1);

/*
 * Aferição interativa em tela cheia (opcional; o modo normal continua igual):
 * - roda dos bicos: arraste para cima/baixo para girar e trocar de bico;
 * - medida-padrão de 20 L: segure "Abastecer" e o líquido sobe; perto de 20 L entra no gargalo (−200 a +200 mL)
 *   e, ao soltar, a diferença vai para a régua;
 * - régua curva: arraste o botão direto (sem tocar antes para abrir nada), de 20 em 20 mL.
 * Grava nos mesmos campos da aferição normal: Lenta (critério 0), Rápida (1) e os itens C/OB/NC/NA.
 */

export type BicoInterativo = { id: string; numero: string; bomba: string; combustivel: string; cor: string };
type Dados = Record<string, { checks: string[]; notes: string[] }>;

const NAVY = '#0b1426', PAINEL = '#13213b', PAINEL2 = '#1b2c4b', LINHA = '#2a3d62', FG = '#eef2f8', MUTED = '#9fb0c9';
const MINT = '#5fd39a', VERMELHO = '#ff4d5e', AZUL = '#3d8bff', VERDE = '#12b05a';
const COR_RES: Record<string, string> = { C: VERDE, OB: AZUL, NC: VERMELHO, NA: '#7d8799' };
const PASSO = 0.42; // ângulo entre os bicos na roda (rad)

const AnimatedRect = Animated.createAnimatedComponent(Rect);
const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedLine = Animated.createAnimatedComponent(Line);

/* ---------- Medida-padrão (viewBox 170 × 300): corpo 0–19,8 L, gargalo 19,8–20,2 L ---------- */
const Y_CORPO = 290, H_CORPO = 162, Y_GARG = 108, H_GARG = 100;
function yDoVolume(v: number) {
  'worklet';
  if (v <= 19.8) return Y_CORPO - (v / 19.8) * H_CORPO;
  if (v <= 20.2) return Y_GARG - ((v - 19.8) / 0.4) * H_GARG;
  return 8;
}
const leituraMl = (v: number) => Math.max(-200, Math.min(200, Math.round(((v - 20) * 1000) / 20) * 20));

/* ---------- Régua (viewBox 96 × 300) ---------- */
const RY0 = 22, RY1 = 278, RX = 62;
const yDoValor = (v: number) => RY1 - ((v + 200) / 400) * (RY1 - RY0);

export function AfericaoInterativa({ filial, bicos, dados, criteriosCodigo, indiceCodigo, onCheck, onFechar, onModoNormal }: {
  filial: string;
  bicos: BicoInterativo[];
  dados: Dados;
  /** Itens C/OB/NC/NA (Luz, Mangueira, BICO, Lacres, Sump) e a posição de cada um nos critérios. */
  criteriosCodigo: string[];
  indiceCodigo: (criterio: string) => number;
  onCheck: (bicoId: string, indice: number, valor: string) => void;
  onFechar: () => void;
  /** Abre o bico atual no modo normal (vazão, desligamento, observações). */
  onModoNormal: (bicoId: string) => void;
}) {
  const insets = useSafeAreaInsets();
  const reduz = useReducedMotion();
  const primeiroPendente = Math.max(0, bicos.findIndex(b => !dados[b.id]));
  const [atual, setAtual] = useState(primeiroPendente);
  const [modo, setModo] = useState<'lenta' | 'rapida'>('lenta');
  const bico = bicos[atual];
  const checks = (bico && dados[bico.id]?.checks) ?? [];
  const idxModo = modo === 'lenta' ? 0 : 1;
  const salvo = checks[idxModo];
  const [valor, setValor] = useState(0);
  useEffect(() => { setValor(salvo !== undefined && salvo !== '' && !Number.isNaN(Number(salvo)) ? Number(salvo) : 0); }, [atual, modo]); // eslint-disable-line react-hooks/exhaustive-deps

  const gravarValor = useCallback((v: number) => { if (bico) onCheck(bico.id, idxModo, String(v)); }, [bico, idxModo, onCheck]);

  /* ----- Roda dos bicos ----- */
  const rot = useSharedValue(primeiroPendente);
  const rot0 = useSharedValue(0);
  const total = bicos.length;
  const irPara = useCallback((i: number) => {
    const n = Math.max(0, Math.min(total - 1, i));
    rot.set(reduz ? n : withSpring(n, { duration: 400, dampingRatio: 0.9 }));
    setAtual(n); vol.set(0);
  }, [total, reduz]); // eslint-disable-line react-hooks/exhaustive-deps
  const configRoda = useMemo((): PanGestureConfig => ({
    activeOffsetY: [-6, 6],
    onActivate: () => { 'worklet'; rot0.set(rot.get()); },
    onUpdate: e => { 'worklet'; rot.set(Math.max(-0.4, Math.min(total - 0.6, rot0.get() - e.translationY / 70))); },
    onDeactivate: e => {
      'worklet';
      const destino = Math.max(0, Math.min(total - 1, Math.round(rot.get() - e.velocityY / 900)));
      rot.set(withSpring(destino, { duration: 400, dampingRatio: 0.9, velocity: -e.velocityY / 70, reduceMotion: ReduceMotion.System }));
      scheduleOnRN(setAtual, destino);
    },
  }), [rot, rot0, total]);
  const panRoda = usePanGesture(configRoda);
  const RAIO = 230, CX = 150 - RAIO, CY = 112;
  const ticksStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${-rot.get() * PASSO}rad` }] }));

  /* ----- Medida-padrão enchendo ----- */
  const vol = useSharedValue(0);
  const fase = useSharedValue(0);
  const [enchendo, setEnchendo] = useState(false);
  const [litros, setLitros] = useState(0);
  useEffect(() => {
    if (!reduz) fase.set(withRepeat(withTiming(Math.PI * 2, { duration: 1400, easing: Easing.linear }), -1, false));
    return () => cancelAnimation(fase);
  }, [reduz, fase]);
  // Enquanto enche, o visor da bomba e a régua acompanham (10 vezes por segundo, não a cada quadro).
  useEffect(() => {
    if (!enchendo) return;
    const id = setInterval(() => { const v = vol.get(); setLitros(v); if (v >= 19.8) setValor(leituraMl(v)); }, 100);
    return () => clearInterval(id);
  }, [enchendo, vol]);
  const abastecer = () => {
    const v0 = vol.get();
    const rapida = modo === 'rapida';
    const tCorpo = Math.max(0, (19.6 - v0) / (rapida ? 6.5 : 3.2)) * 1000;
    const tFim = ((20.25 - Math.max(19.6, v0)) / (rapida ? 0.16 : 0.09)) * 1000;
    vol.set(withSequence(withTiming(Math.max(v0, 19.6), { duration: tCorpo, easing: Easing.linear }), withTiming(20.25, { duration: tFim, easing: Easing.linear })));
    setEnchendo(true);
  };
  const soltar = () => {
    if (!enchendo) return;
    cancelAnimation(vol);
    setEnchendo(false);
    const v = vol.get(); setLitros(v);
    if (v >= 19.8) { const ml = leituraMl(v); setValor(ml); gravarValor(ml); }
  };
  const esvaziar = () => { cancelAnimation(vol); vol.set(0); setLitros(0); setEnchendo(false); };
  const liqProps = useAnimatedProps(() => { const y = yDoVolume(vol.get()); return { y: y + 4, height: Math.max(0, 300 - y) }; });
  const ondaProps = useAnimatedProps(() => {
    const y = yDoVolume(vol.get());
    const amp = vol.get() > 0.05 ? 2.4 : 0;
    let d = `M0 ${y + 6}`;
    for (let x = 0; x <= 170; x += 10) d += ` L${x} ${y + Math.sin(x / 14 + fase.get()) * amp}`;
    return { d: `${d} L170 300 L0 300 Z` };
  });
  const jatoProps = useAnimatedProps(() => ({ strokeDashoffset: -fase.get() * 8 }));

  /* ----- Régua: arrastar direto o botão ----- */
  const alturaRegua = useSharedValue(300);
  const ultimo = useSharedValue(0);
  const aplicarRegua = useCallback((v: number) => setValor(v), []);
  const configRegua = useMemo((): PanGestureConfig => ({
    onBegin: e => {
      'worklet';
      const y = (e.y / alturaRegua.get()) * 300;
      const v = Math.max(-200, Math.min(200, Math.round((((RY1 - y) / (RY1 - RY0)) * 400 - 200) / 20) * 20));
      ultimo.set(v); scheduleOnRN(aplicarRegua, v);
    },
    onUpdate: e => {
      'worklet';
      const y = (e.y / alturaRegua.get()) * 300;
      const v = Math.max(-200, Math.min(200, Math.round((((RY1 - y) / (RY1 - RY0)) * 400 - 200) / 20) * 20));
      if (v !== ultimo.get()) { ultimo.set(v); scheduleOnRN(aplicarRegua, v); }
    },
    onFinalize: () => { 'worklet'; scheduleOnRN(gravarRef, ultimo.get()); },
  }), [alturaRegua, ultimo, aplicarRegua]); // eslint-disable-line react-hooks/exhaustive-deps
  const gravarAtual = useRef(gravarValor); gravarAtual.current = gravarValor;
  function gravarRef(v: number) { gravarAtual.current(v); }
  const panRegua = usePanGesture(configRegua);
  const fora = Math.abs(valor) > 100;
  const corRegua = fora ? VERMELHO : MINT;
  const yv = yDoValor(valor), b = 26;
  const dRegua = `M${RX} ${RY0} L${RX} ${yv - 46} C ${RX} ${yv - 22}, ${RX - b} ${yv - 22}, ${RX - b} ${yv} C ${RX - b} ${yv + 22}, ${RX} ${yv + 22}, ${RX} ${yv + 46} L${RX} ${RY1}`;

  /* ----- Vazão e desligamento em 60 s (roletas no campo + cronômetro; N/A para bombas que não desligam) ----- */
  const ctxTema = useContext(ThemeContext);
  const temaEscuro = useMemo(() => ({ ...ctxTema, mode: 'dark' as const, colors: { ...darkColor, bg: NAVY, surface: PAINEL, surfaceMuted: PAINEL2, accent: MINT, primaryText: NAVY } }), [ctxTema]);
  const iVazao = indiceCodigo('Vazão'), iDes = indiceCodigo('Des. 60s');
  const vazao = checks[iVazao] ?? '', des = checks[iDes] ?? '';
  const [cronoInicio, setCronoInicio] = useState<number | null>(null);
  const [agora, setAgora] = useState(0);
  useEffect(() => { if (cronoInicio === null) return; const id = setInterval(() => setAgora(Date.now()), 100); return () => clearInterval(id); }, [cronoInicio]);
  useEffect(() => { setCronoInicio(null); }, [atual]);
  const cronometro = () => {
    if (!bico) return;
    if (cronoInicio === null) { setCronoInicio(Date.now()); setAgora(Date.now()); return; }
    onCheck(bico.id, iDes, String(Math.max(0, Math.min(120, Math.round((Date.now() - cronoInicio) / 1000)))));
    setCronoInicio(null);
  };

  /* ----- Itens C/OB/NC/NA e conclusão do bico ----- */
  const marcar = (crit: string, v: string) => { if (!bico) return; const i = indiceCodigo(crit); onCheck(bico.id, i, checks[i] === v ? '' : v); };
  const tudoC = () => { if (!bico) return; criteriosCodigo.forEach(c => onCheck(bico.id, indiceCodigo(c), 'C')); };
  const resumo = (i: number) => { const ch = dados[bicos[i].id]?.checks ?? []; return ch.includes('NC') ? 'NC' : ch.includes('OB') ? 'OB' : ch.some(Boolean) ? 'C' : null; };
  const aferidos = bicos.filter(x => dados[x.id]).length;
  const proximo = () => {
    const prox = bicos.findIndex((x, i) => i > atual && !dados[x.id]);
    const alvo = prox >= 0 ? prox : bicos.findIndex(x => !dados[x.id]);
    if (alvo >= 0 && alvo !== atual) irPara(alvo); else onFechar();
  };
  const fmt = (v: string | undefined) => (v === undefined || v === '' ? '—' : `${Number(v) > 0 ? '+' : ''}${v} mL`);

  if (!bico) return null;
  return (
    <Modal visible animationType={reduz ? 'none' : 'slide'} presentationStyle="fullScreen" statusBarTranslucent onRequestClose={onFechar}>
      <GestureHandlerRootView style={{ flex: 1, backgroundColor: NAVY }}>
        <ScrollView contentContainerStyle={[e.corpo, { paddingTop: insets.top + 10, paddingBottom: insets.bottom + 24 }]} scrollEnabled={!enchendo} keyboardShouldPersistTaps="handled">
          {/* Topo */}
          <View style={e.linha}>
            <Pressable accessibilityRole="button" accessibilityLabel="Fechar a aferição interativa" onPress={onFechar} hitSlop={10} style={e.fechar}><XIcon size={20} color={FG} weight="bold" /></Pressable>
            <View style={{ flex: 1 }}>
              <Text style={e.titulo} numberOfLines={1}>{bico.bomba} · Bico {bico.numero}</Text>
              <Text style={e.sub} numberOfLines={1}>{filial} · {bico.combustivel}</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={e.prog}>{aferidos} de {total}</Text>
              <Text style={e.sub}>bicos aferidos</Text>
            </View>
          </View>

          {/* Roda dos bicos */}
          <GestureDetector gesture={panRoda}>
            <View style={e.roda} accessibilityLabel="Roda dos bicos: arraste para cima ou para baixo para trocar de bico">
              <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: CX - RAIO, top: CY - RAIO, width: RAIO * 2, height: RAIO * 2 }, ticksStyle]}>
                <Svg width={RAIO * 2} height={RAIO * 2}>
                  {Array.from({ length: 180 }, (_, k) => {
                    const a = (k / 180) * Math.PI * 2, longo = k % 4 === 0;
                    const r1 = RAIO - 22, r2 = RAIO - (longo ? 36 : 29);
                    return <Line key={k} x1={RAIO + r1 * Math.cos(a)} y1={RAIO + r1 * Math.sin(a)} x2={RAIO + r2 * Math.cos(a)} y2={RAIO + r2 * Math.sin(a)} stroke={longo ? MINT : LINHA} strokeWidth={longo ? 2 : 1.4} strokeLinecap="round" />;
                  })}
                </Svg>
              </Animated.View>
              {bicos.map((x, i) => <ChipBico key={x.id} i={i} rot={rot} bico={x} atual={i === atual} resultado={resumo(i)} cx={CX} cy={CY} raio={RAIO} onPress={() => irPara(i)} />)}
              <Text style={e.dicaRoda}>arraste para girar ↕</Text>
            </View>
          </GestureDetector>

          {/* Lenta / Rápida */}
          <View style={e.modo}>
            {(['lenta', 'rapida'] as const).map(m => (
              <Pressable key={m} accessibilityRole="button" accessibilityState={{ selected: modo === m }} onPress={() => { esvaziar(); setModo(m); }} style={[e.modoBtn, modo === m && { backgroundColor: MINT }]}>
                <Text style={[e.modoTxt, modo === m && { color: NAVY }]}>{m === 'lenta' ? 'Vazão lenta' : 'Vazão rápida'}</Text>
              </Pressable>
            ))}
          </View>

          {/* Cena: bomba, medida-padrão e régua */}
          <View style={e.cena}>
            <Svg viewBox="0 0 92 220" style={{ width: 76, height: 182 }}>
              <Rect x={6} y={20} width={62} height={196} rx={10} fill="#1f3358" />
              <Rect x={12} y={30} width={50} height={34} rx={5} fill="#0a1222" />
              <SvgText x={37} y={53} textAnchor="middle" fill={MINT} fontWeight="700" fontSize={15}>{litros.toFixed(2).replace('.', ',')}</SvgText>
              <SvgText x={37} y={76} textAnchor="middle" fill={MUTED} fontSize={8}>LITROS</SvgText>
              <Rect x={14} y={92} width={46} height={8} rx={4} fill={bico.cor} />
              <Rect x={0} y={12} width={74} height={14} rx={5} fill={LINHA} />
              <Path d="M68 120 C 90 120, 92 60, 88 30" stroke="#0f1a2e" strokeWidth={7} fill="none" strokeLinecap="round" />
              <Rect x={80} y={18} width={12} height={16} rx={3} fill="#cfd4da" />
            </Svg>
            <Svg viewBox="0 0 170 300" style={{ flex: 1, height: 250 }}>
              <Defs>
                <ClipPath id="formaLata"><Path d="M62 8 H108 V108 L150 128 V290 H20 V128 L62 108 Z" /></ClipPath>
                <LinearGradient id="comb" x1="0" y1="0" x2="0" y2="1"><Stop offset="0" stopColor="#ffb08f" /><Stop offset="1" stopColor={bico.cor} /></LinearGradient>
              </Defs>
              {enchendo ? <AnimatedLine x1={85} y1={-4} x2={85} y2={290} stroke="url(#comb)" strokeWidth={5} strokeDasharray="10 8" animatedProps={jatoProps} /> : null}
              <G clipPath="url(#formaLata)">
                <Rect x={0} y={0} width={170} height={300} fill="#0d1a30" />
                <AnimatedRect x={0} width={170} fill="url(#comb)" animatedProps={liqProps} />
                <AnimatedPath fill="url(#comb)" animatedProps={ondaProps} />
              </G>
              <Path d="M62 8 H108 V108 L150 128 V290 H20 V128 L62 108 Z" fill="none" stroke="#cfd4da" strokeWidth={3} />
              {Array.from({ length: 21 }, (_, k) => {
                const ml = -200 + k * 20, y = Y_GARG - ((ml + 200) / 400) * H_GARG, forte = ml % 100 === 0;
                return (
                  <G key={ml}>
                    <Line x1={forte ? 104 : 108} x2={114} y1={y} y2={y} stroke="#cfd4da" strokeWidth={forte ? 1.6 : 1} />
                    {forte ? <SvgText x={118} y={y + 3} fill="#cfd4da" fontSize={9}>{ml > 0 ? `+${ml}` : String(ml)}</SvgText> : null}
                  </G>
                );
              })}
              <SvgText x={85} y={210} textAnchor="middle" fill="#cfd4da" opacity={0.5} fontWeight="700" fontSize={22}>20 L</SvgText>
            </Svg>
            <GestureDetector gesture={panRegua}>
              <View style={{ width: 84, height: 250 }} onLayout={ev => alturaRegua.set(ev.nativeEvent.layout.height)}
                accessibilityRole="adjustable" accessibilityLabel={`Diferença: ${valor} mL`}
                accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
                onAccessibilityAction={ev => { const v = Math.max(-200, Math.min(200, valor + (ev.nativeEvent.actionName === 'increment' ? 20 : -20))); setValor(v); gravarValor(v); }}>
                <Svg viewBox="0 0 96 300" style={{ width: 84, height: 250 }}>
                  {Array.from({ length: 21 }, (_, k) => {
                    const v = -200 + k * 20, y = yDoValor(v), forte = v % 100 === 0;
                    return (
                      <G key={v}>
                        <Line x1={forte ? 72 : 76} x2={84} y1={y} y2={y} stroke={LINHA} strokeWidth={forte ? 2 : 1.2} />
                        {forte ? <SvgText x={v === 0 ? 20 : 8} y={y + 3} fill={MUTED} fontSize={9}>{v > 0 ? `+${v}` : String(v)}</SvgText> : null}
                      </G>
                    );
                  })}
                  <Path d={`M${RX - b} ${yv - 30} Q ${RX - b - 4} ${yv} ${RX - b} ${yv + 30}`} stroke={corRegua} strokeWidth={10} fill="none" opacity={0.35} strokeLinecap="round" />
                  <Path d={dRegua} stroke={corRegua} strokeWidth={3} fill="none" strokeLinecap="round" />
                  <G transform={`translate(${RX - b} ${yv})`}>
                    <Rect x={-15} y={-15} width={30} height={30} rx={15} fill={NAVY} stroke={corRegua} strokeWidth={2.5} />
                    <Path d="M-4 -3 L0 -7 L4 -3 M-4 3 L0 7 L4 3" stroke={FG} strokeWidth={1.8} fill="none" strokeLinecap="round" />
                  </G>
                </Svg>
              </View>
            </GestureDetector>
          </View>

          {/* Leitura */}
          <View style={e.leitura}>
            <Text style={[e.num, { color: corRegua }]}>{valor > 0 ? `+${valor}` : valor}</Text>
            <Text style={e.un}>mL</Text>
            <View style={[e.tol, { backgroundColor: fora ? '#ff4d5e26' : '#5fd39a22' }]}><Text style={{ color: fora ? '#ff8592' : MINT, fontWeight: '700', fontSize: 12 }}>{fora ? 'fora de ±100 mL' : 'dentro de ±100 mL'}</Text></View>
          </View>

          <View style={e.linha}>
            <Pressable accessibilityRole="button" accessibilityLabel="Segure para abastecer" onPressIn={abastecer} onPressOut={soltar}
              style={[e.btn, { flex: 1, backgroundColor: enchendo ? '#8ce9b9' : MINT }]}>
              <Text style={[e.btnTxt, { color: NAVY }]}>{enchendo ? 'Abastecendo…' : 'Segure para abastecer'}</Text>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={esvaziar} style={[e.btn, { backgroundColor: PAINEL2 }]}><Text style={e.btnTxt}>Esvaziar</Text></Pressable>
          </View>

          <View style={e.vals}>
            {([['Lenta', 0], ['Rápida', 1]] as const).map(([rot, i]) => (
              <View key={rot} style={[e.val, idxModo === i && { borderColor: MINT }]}>
                <Text style={e.sub}>{rot}</Text>
                <Text style={e.valNum}>{fmt(checks[i])}</Text>
              </View>
            ))}
          </View>

          {/* Itens do bico */}
          <View style={e.itens}>
            <View style={e.linha}>
              <Text style={[e.titulo, { fontSize: 15, flex: 1 }]}>Itens do bico</Text>
              <Pressable accessibilityRole="button" onPress={tudoC} style={[e.tudoC]}><CheckIcon size={14} color={NAVY} weight="bold" /><Text style={{ color: NAVY, fontWeight: '800', fontSize: 13 }}>Tudo C</Text></Pressable>
            </View>
            {criteriosCodigo.map(c => {
              const v = checks[indiceCodigo(c)] ?? '';
              return (
                <View key={c} style={e.item}>
                  <Text style={e.itemNome}>{c}</Text>
                  <View style={e.codigos}>
                    {(['C', 'OB', 'NC', 'NA'] as const).map(k => {
                      const on = v === k;
                      return (
                        <Pressable key={k} accessibilityRole="radio" accessibilityState={{ selected: on }} accessibilityLabel={`${c}: ${k}`} onPress={() => marcar(c, k)}
                          style={[e.cod, { borderColor: COR_RES[k], backgroundColor: on ? COR_RES[k] : 'transparent' }, on && k === 'NC' && { boxShadow: `0 0 10px 1px ${VERMELHO}99` }]}>
                          <Text style={[e.codTxt, { color: on ? '#fff' : COR_RES[k] }]}>{k}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              );
            })}
          </View>

          {/* Vazão e desligamento em 60 s */}
          <ThemeContext.Provider value={temaEscuro}>
            <View style={e.itens}>
              <Text style={[e.titulo, { fontSize: 15 }]}>Vazão e desligamento</Text>
              <View style={e.linha}>
                <View style={{ flex: 1, gap: 6 }}>
                  <Text style={e.sub}>Vazão (L/min){vazao === '' ? ' · não medida' : ''}</Text>
                  <View style={e.campoRoleta}>
                    <Roleta rotulo="Vazão em litros por minuto" valores={VALORES_VAZAO} valor={vazao} vazio={vazao === ''} onChange={v => onCheck(bico.id, iVazao, v)} altura={42} visiveis={3} />
                  </View>
                </View>
                <View style={{ flex: 1, gap: 6 }}>
                  <View style={e.linha}>
                    <Text style={[e.sub, { flex: 1 }]}>Des. 60s (s){des === '' ? ' · não medido' : ''}</Text>
                    <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: des === 'NA' }} accessibilityLabel="Des. 60s não se aplica"
                      onPress={() => { setCronoInicio(null); onCheck(bico.id, iDes, des === 'NA' ? '' : 'NA'); }}
                      style={[e.na, des === 'NA' && { backgroundColor: MUTED, borderColor: MUTED }]}>
                      <Text style={[e.naTxt, des === 'NA' && { color: NAVY }]}>N/A</Text>
                    </Pressable>
                  </View>
                  {des === 'NA' ? (
                    <View style={[e.campoRoleta, { height: 126, alignItems: 'center', justifyContent: 'center', padding: 10 }]}>
                      <Text style={[e.sub, { textAlign: 'center' }]}>Não desliga em 60 s. Toque em N/A para medir.</Text>
                    </View>
                  ) : (
                    <View style={e.campoRoleta}>
                      <Roleta rotulo="Tempo até desligar, em segundos" valores={VALORES_SEGUNDOS} valor={des} vazio={des === ''} formatar={v => `${v} s`} onChange={v => onCheck(bico.id, iDes, v)} altura={42} visiveis={3} />
                    </View>
                  )}
                </View>
              </View>
              {des !== 'NA' ? (
                <View style={e.crono}>
                  <TimerIcon size={20} color={MUTED} />
                  <Text style={e.cronoTxt}>{cronoInicio === null ? '0,0 s' : `${((agora - cronoInicio) / 1000).toFixed(1).replace('.', ',')} s`}</Text>
                  <Pressable accessibilityRole="button" onPress={cronometro} style={[e.cronoBtn, { backgroundColor: cronoInicio === null ? PAINEL2 : MINT }]}>
                    {cronoInicio === null ? <PlayIcon size={16} color={FG} weight="fill" /> : <StopIcon size={16} color={NAVY} weight="fill" />}
                    <Text style={{ color: cronoInicio === null ? FG : NAVY, fontWeight: '800' }}>{cronoInicio === null ? 'Iniciar' : 'Parar e salvar'}</Text>
                  </Pressable>
                  <Pressable accessibilityRole="button" accessibilityLabel="Zerar cronômetro" onPress={() => setCronoInicio(null)} hitSlop={8} style={e.cronoZerar}><ResetIcon size={18} color={MUTED} /></Pressable>
                </View>
              ) : null}
              <Text style={e.sub}>Deslize dentro do campo para girar a roleta. Cronômetro: inicie quando parar de abastecer e pare quando a bomba desligar; o tempo vai para o Des. 60s.</Text>
            </View>
          </ThemeContext.Provider>

          <View style={e.linha}>
            <Pressable accessibilityRole="button" onPress={() => onModoNormal(bico.id)} style={[e.btn, { backgroundColor: PAINEL2, flex: 1 }]}>
              <Text style={e.btnTxt}>Abrir no modo normal (observações)</Text>
            </Pressable>
          </View>
          <Pressable accessibilityRole="button" onPress={proximo} style={[e.btn, { backgroundColor: MINT, flexDirection: 'row', gap: 8, justifyContent: 'center' }]}>
            <Text style={[e.btnTxt, { color: NAVY }]}>{bicos.some((x, i) => i !== atual && !dados[x.id]) ? 'Próximo bico' : 'Concluir'}</Text>
            <ArrowRightIcon size={18} color={NAVY} weight="bold" />
          </Pressable>
          <Text style={[e.sub, { textAlign: 'center' }]}>Segure "Abastecer" para encher a medida-padrão: ao soltar, a diferença para 20 L vai para a régua. Arraste o botão da régua para ajustar.</Text>
        </ScrollView>
      </GestureHandlerRootView>
    </Modal>
  );
}

/** Bico na roda: posição no arco calculada a partir da rotação (no thread de animação). */
function ChipBico({ i, rot, bico, atual, resultado, cx, cy, raio, onPress }: {
  i: number; rot: { get: () => number }; bico: BicoInterativo; atual: boolean; resultado: string | null; cx: number; cy: number; raio: number; onPress: () => void;
}) {
  const estilo = useAnimatedStyle(() => {
    const a = (i - rot.get()) * PASSO;
    const vis = Math.abs(a) < 1.3;
    const esc = 1 - Math.min(0.28, Math.abs(a) * 0.35);
    return {
      opacity: vis ? 1 - Math.min(0.75, Math.abs(a) * 0.7) : 0,
      transform: [{ translateX: cx + raio * Math.cos(a) - 14 }, { translateY: cy + raio * Math.sin(a) - 19 }, { rotate: `${a * 0.35}rad` }, { scale: esc }],
    };
  });
  return (
    <Animated.View style={[e.chipBox, estilo]}>
      <Pressable accessibilityRole="button" accessibilityState={{ selected: atual }} accessibilityLabel={`Bico ${bico.numero}, ${bico.combustivel}${resultado ? `, ${resultado}` : ''}`} onPress={onPress}
        style={[e.chip, atual && { backgroundColor: FG, borderColor: FG }]}>
        <View style={[e.gota, { backgroundColor: bico.cor }]}><Text style={e.gotaTxt}>{bico.numero}</Text></View>
        <View>
          <Text style={[e.chipNome, atual && { color: NAVY }]}>Bico {bico.numero}</Text>
          <Text style={[e.chipSub, atual && { color: '#3e4e6a' }]} numberOfLines={1}>{bico.combustivel}</Text>
        </View>
        {resultado ? <View style={[e.selo, { backgroundColor: COR_RES[resultado] }]}><Text style={e.seloTxt}>{resultado}</Text></View> : null}
      </Pressable>
    </Animated.View>
  );
}

const e = StyleSheet.create({
  corpo: { paddingHorizontal: 16, gap: 14, backgroundColor: NAVY },
  linha: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  fechar: { width: 40, height: 40, borderRadius: 12, backgroundColor: PAINEL2, alignItems: 'center', justifyContent: 'center' },
  titulo: { color: FG, fontSize: 18, fontWeight: '800' },
  sub: { color: MUTED, fontSize: 12 },
  prog: { color: MINT, fontSize: 14, fontWeight: '800', fontVariant: ['tabular-nums'] },
  roda: { height: 224, borderRadius: 18, backgroundColor: PAINEL, overflow: 'hidden' },
  dicaRoda: { position: 'absolute', right: 12, bottom: 10, color: MUTED, fontSize: 11 },
  chipBox: { position: 'absolute', left: 0, top: 0 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6, paddingLeft: 6, paddingRight: 10, borderRadius: 999, backgroundColor: PAINEL2, borderWidth: 1, borderColor: LINHA },
  gota: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  gotaTxt: { color: '#fff', fontSize: 12, fontWeight: '800' },
  chipNome: { color: FG, fontSize: 13, fontWeight: '800' },
  chipSub: { color: MUTED, fontSize: 11 },
  selo: { borderRadius: 999, paddingHorizontal: 7, paddingVertical: 2, marginLeft: 2 },
  seloTxt: { color: '#fff', fontSize: 10.5, fontWeight: '900' },
  modo: { flexDirection: 'row', gap: 6, backgroundColor: PAINEL, padding: 5, borderRadius: 999 },
  modoBtn: { flex: 1, borderRadius: 999, paddingVertical: 10, alignItems: 'center' },
  modoTxt: { color: MUTED, fontWeight: '800', fontSize: 14 },
  cena: { flexDirection: 'row', alignItems: 'flex-end', gap: 6, backgroundColor: PAINEL, borderRadius: 18, paddingHorizontal: 10, paddingTop: 14, paddingBottom: 10 },
  leitura: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  num: { fontSize: 44, fontWeight: '800', fontVariant: ['tabular-nums'], letterSpacing: -1 },
  un: { color: MUTED, fontWeight: '700' },
  tol: { marginLeft: 'auto', borderRadius: 999, paddingHorizontal: 9, paddingVertical: 4 },
  btn: { borderRadius: 14, paddingVertical: 15, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center' },
  btnTxt: { color: FG, fontWeight: '800', fontSize: 15 },
  vals: { flexDirection: 'row', gap: 8 },
  val: { flex: 1, backgroundColor: PAINEL, borderRadius: 14, padding: 12, borderWidth: 1.5, borderColor: 'transparent' },
  valNum: { color: FG, fontSize: 22, fontWeight: '800', fontVariant: ['tabular-nums'] },
  itens: { backgroundColor: PAINEL, borderRadius: 18, padding: 12, gap: 10 },
  campoRoleta: { borderRadius: 12, borderWidth: 1, borderColor: LINHA, backgroundColor: NAVY, overflow: 'hidden' },
  na: { borderWidth: 1.5, borderColor: LINHA, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 },
  naTxt: { color: MUTED, fontWeight: '800', fontSize: 12 },
  crono: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: NAVY, borderRadius: 12, padding: 8, paddingLeft: 12 },
  cronoTxt: { flex: 1, color: FG, fontSize: 20, fontWeight: '800', fontVariant: ['tabular-nums'] },
  cronoBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10 },
  cronoZerar: { width: 38, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: PAINEL2 },
  tudoC: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: MINT, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  itemNome: { color: FG, fontWeight: '700', fontSize: 14, width: 86 },
  codigos: { flex: 1, flexDirection: 'row', gap: 6 },
  cod: { flex: 1, minHeight: 40, borderRadius: 10, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  codTxt: { fontWeight: '900', fontSize: 13 },
});
