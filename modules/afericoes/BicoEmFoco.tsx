import { type ReactNode, useContext, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Platform, Pressable, type StyleProp, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import Svg, { Circle, Ellipse, G, Path, Polygon, Rect, Text as SvgText } from 'react-native-svg';
import { CrosshairIcon } from '../../ui/icons';
import { radius, space, ThemeContext } from '../../ui/theme';

// Destaque do bico em aferição: bonequinho 3D (bomba com rosto, segurando o bico numerado),
// indicador flutuante que fica visível em qualquer rolagem e brilho no cartão do croqui.

const nativo = Platform.OS !== 'web';

/** Verdadeiro quando o aparelho pede menos movimento (aí as animações ficam paradas). */
function useReduzirMovimento() {
  const [reduzir, setReduzir] = useState(false);
  useEffect(() => {
    let vivo = true;
    void AccessibilityInfo.isReduceMotionEnabled().then(v => { if (vivo) setReduzir(v); }).catch(() => undefined);
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduzir);
    return () => { vivo = false; sub.remove(); };
  }, []);
  return reduzir;
}

/** Valor que vai e volta (0 → 1 → 0) sem parar enquanto o componente existe. */
function useVaiVem(duracao: number, ativo = true) {
  const v = useRef(new Animated.Value(0)).current;
  const reduzir = useReduzirMovimento();
  useEffect(() => {
    if (!ativo || reduzir) { v.setValue(0); return; }
    const ida = { duration: duracao, easing: Easing.inOut(Easing.sin), useNativeDriver: nativo };
    const loop = Animated.loop(Animated.sequence([Animated.timing(v, { toValue: 1, ...ida }), Animated.timing(v, { toValue: 0, ...ida })]));
    loop.start();
    return () => loop.stop();
  }, [v, duracao, ativo, reduzir]);
  return v;
}

/** Escurece (f < 0) ou clareia (f > 0) uma cor #rrggbb. */
function tom(hex: string, f: number) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  const n = parseInt(m[1], 16), alvo = f < 0 ? 0 : 255, k = Math.abs(f);
  const c = [n >> 16, (n >> 8) & 255, n & 255].map(x => Math.round(x + (alvo - x) * k));
  return `#${c.map(x => x.toString(16).padStart(2, '0')).join('')}`;
}

/** Bomba em perspectiva com rostinho, mangueira e o bico numerado na mão, flutuando. */
export function Bico3D({ numero, cor, size = 72, animar = true }: { numero: string; cor: string; size?: number; animar?: boolean }) {
  const v = useVaiVem(900, animar);
  const frente = cor, lado = tom(cor, -0.32), topo = tom(cor, 0.35), txt = numero.length > 2 ? 15 : 19;
  const sobe = v.interpolate({ inputRange: [0, 1], outputRange: [0, -size * 0.07] });
  const sombra = v.interpolate({ inputRange: [0, 1], outputRange: [1, 0.78] });
  return (
    <View style={{ width: size, height: size * 1.15 }} accessibilityRole="image" accessibilityLabel={`Bico ${numero} em aferição`}>
      <Animated.View style={{ position: 'absolute', left: size * 0.16, right: size * 0.16, bottom: 0, height: size * 0.1, borderRadius: size, backgroundColor: '#000', opacity: 0.18, transform: [{ scaleX: sombra }] }} />
      <Animated.View style={{ transform: [{ translateY: sobe }] }}>
        <Svg width={size} height={size * 1.08} viewBox="0 0 100 108">
          {/* corpo: frente, lateral e topo */}
          <Polygon points="16,30 60,40 60,98 16,88" fill={frente} />
          <Polygon points="60,40 80,29 80,87 60,98" fill={lado} />
          <Polygon points="16,30 36,19 80,29 60,40" fill={topo} />
          <Path d="M16 30 L60 40 L80 29" stroke="#ffffff" strokeOpacity={0.35} strokeWidth={1.2} fill="none" />
          {/* visor com rosto */}
          <Polygon points="21,37 55,45 55,61 21,53" fill="#ffffff" opacity={0.95} />
          <Ellipse cx={31} cy={47.5} rx={2.6} ry={3.2} fill="#1b1f24" />
          <Ellipse cx={45} cy={50.8} rx={2.6} ry={3.2} fill="#1b1f24" />
          <Path d="M32 54.5 Q38 59 44 57.2" stroke="#1b1f24" strokeWidth={1.8} fill="none" strokeLinecap="round" />
          {/* número do bico */}
          <Circle cx={38} cy={76} r={13} fill="#ffffff" />
          <SvgText x={38} y={76} dy={txt * 0.36} fontSize={txt} fontWeight="800" fill={lado} textAnchor="middle">{numero.slice(0, 3)}</SvgText>
          {/* mangueira e bico na mão */}
          <Path d="M80 46 C96 50 96 70 88 78" stroke="#22262b" strokeWidth={4} fill="none" strokeLinecap="round" />
          <G transform="rotate(-28 88 82)">
            <Rect x={81} y={78} width={15} height={8} rx={2.5} fill="#22262b" />
            <Rect x={93} y={80} width={9} height={3.4} rx={1.5} fill="#9aa3ad" />
          </G>
          {/* base */}
          <Polygon points="12,88 60,99 84,86 84,90 60,104 12,92" fill={tom(cor, -0.5)} opacity={0.9} />
        </Svg>
      </Animated.View>
    </View>
  );
}

/** Cartão com contorno que "respira" (brilho de destaque enquanto a aferição está em andamento). */
export function Brilho({ cor, ativo, children, style }: { cor: string; ativo: boolean; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const v = useVaiVem(1100, ativo);
  return (
    <View style={style}>
      {children}
      {ativo ? <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { borderRadius: radius.card, borderWidth: 2.5, borderColor: cor, opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0.35, 1] }) }]} /> : null}
    </View>
  );
}

/** Indicador fixo do bico em aferição: aparece sobre a tela em qualquer rolagem; tocar leva ao bico. */
export function BicoFlutuante({ bomba, numero, combustivel, cor, progresso, bottom, onPress }: {
  bomba: string; numero: string; combustivel: string; cor: string; progresso: string; bottom: number; onPress: () => void;
}) {
  const { colors } = useContext(ThemeContext);
  const entrada = useRef(new Animated.Value(0)).current;
  useEffect(() => { Animated.spring(entrada, { toValue: 1, damping: 18, stiffness: 220, useNativeDriver: nativo }).start(); }, [entrada]);
  return (
    <Animated.View pointerEvents="box-none" style={[f.wrap, { bottom, opacity: entrada, transform: [{ translateY: entrada.interpolate({ inputRange: [0, 1], outputRange: [24, 0] }) }] }]}>
      <Pressable accessibilityRole="button" accessibilityLabel={`Aferindo ${bomba}, bico ${numero}, ${combustivel}. Toque para ir ao bico.`} onPress={onPress}
        style={({ pressed }) => [f.card, { backgroundColor: colors.surface, borderColor: cor }, pressed && { transform: [{ scale: 0.97 }] }]}>
        <Bico3D numero={numero} cor={cor} size={46} />
        <View style={{ flexShrink: 1 }}>
          <View style={f.linha}>
            <CrosshairIcon size={12} color={cor} weight="bold" />
            <Text style={[f.kicker, { color: cor }]}>AFERINDO AGORA</Text>
          </View>
          <Text style={[f.titulo, { color: colors.text }]} numberOfLines={1}>{bomba} · Bico {numero}</Text>
          <Text style={[f.sub, { color: colors.textMuted }]} numberOfLines={1}>{combustivel} · {progresso}</Text>
        </View>
      </Pressable>
    </Animated.View>
  );
}

const f = StyleSheet.create({
  wrap: { position: 'absolute', left: space.lg, right: space.lg, alignItems: 'flex-end' },
  card: {
    flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: 6, paddingLeft: 8, paddingRight: 14, borderRadius: 18, borderWidth: 2, maxWidth: 340,
    shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 8,
  },
  linha: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  kicker: { fontSize: 10.5, fontWeight: '800', letterSpacing: 0.6 },
  titulo: { fontSize: 15, fontWeight: '800', fontVariant: ['tabular-nums'] },
  sub: { fontSize: 12 },
});
