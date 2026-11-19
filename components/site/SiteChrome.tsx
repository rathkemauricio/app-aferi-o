import { useRouter } from 'expo-router';
import { type ReactNode, useContext, useMemo } from 'react';
import { Platform, Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import { Logo } from '../Logo';
import { darkColor, ThemeContext, type ThemeColors } from '../../ui/theme';
import { useTela } from '../../ui/zoom';
import { EASE } from './motion';

/** Largura máxima do conteúdo do site. */
export const SITE_MAX = 1200;
export const CTA_EMPRESA = 'Criar minha empresa';

/**
 * Paleta do site, travada no escuro da marca (azul-marinho, verde-menta e papel) em qualquer tema do aparelho:
 * no claro, a identidade se perderia. Os componentes do sistema (campos, botões) herdam esta paleta só dentro do site.
 */
export const SITE_CORES: ThemeColors = {
  ...darkColor,
  bg: '#0a1428', surface: '#101d37', surfaceMuted: '#162644', border: '#22345a', borderStrong: '#34486f',
  text: '#f2f4f8', textMuted: '#aab6cb', textFaint: '#7c89a3',
  accent: '#5fd39a', accentPressed: '#4cc189', accentSoft: '#13362f', accentText: '#7fe0b0', primaryText: '#0a1428',
  campo: '#0d1a33', folha: '#0a1428', onBg: '#f2f4f8', onBgMuted: '#aab6cb', neutralSoft: '#1c2c4c',
};
/** Papel das cenas (folhas, planilhas, telas). */
export const PAPEL = '#f4f3ef';

export function SiteTema({ children }: { children: ReactNode }) {
  const ctx = useContext(ThemeContext);
  const valor = useMemo(() => ({ ...ctx, mode: 'dark' as const, colors: SITE_CORES }), [ctx]);
  return <ThemeContext.Provider value={valor}>{children}</ThemeContext.Provider>;
}

export function useSite() {
  const { width, height } = useTela();
  const desktop = width >= 960;
  return { c: SITE_CORES, desktop, width, height };
}

/** Faixa com a largura do site, centralizada, com o recuo lateral de celular e computador. */
export function Faixa({ children, style }: { children: ReactNode; style?: ViewStyle | (ViewStyle | false | undefined)[] }) {
  const { desktop } = useSite();
  return <View style={[{ width: '100%', maxWidth: SITE_MAX, alignSelf: 'center', paddingHorizontal: desktop ? 40 : 18 }, style as ViewStyle]}>{children}</View>;
}

/**
 * Botão do site. Toque: encolhe 3% (160 ms) para confirmar o toque. Mouse: sobe 2 px (só no computador).
 * Primário em verde-menta com texto marinho; secundário com contorno.
 */
export function BotaoSite({ titulo, onPress, tipo = 'primario', grande = false, disabled = false, style }: {
  titulo: string; onPress: () => void; tipo?: 'primario' | 'secundario'; grande?: boolean; disabled?: boolean; style?: ViewStyle;
}) {
  const reduz = useReducedMotion();
  const toque = useSharedValue(0);
  const hover = useSharedValue(0);
  const anim = useAnimatedStyle(() => ({ transform: [{ translateY: hover.value * -2 }, { scale: 1 - toque.value * 0.03 }] }));
  const t = (v: { value: number }, alvo: number, ms: number) => { v.value = reduz ? alvo : withTiming(alvo, { duration: ms, easing: EASE }); };
  const prim = tipo === 'primario';
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={onPress}
      onPressIn={() => t(toque, 1, 100)} onPressOut={() => t(toque, 0, 160)}
      onHoverIn={() => Platform.OS === 'web' && t(hover, 1, 180)} onHoverOut={() => t(hover, 0, 220)} style={style}>
      <Animated.View style={[st.botao, grande && st.botaoGrande, prim ? st.botaoPrim : st.botaoSec, disabled && { opacity: 0.55 }, anim]}>
        <Text numberOfLines={1} style={[st.botaoTxt, grande && { fontSize: 16 }, { color: prim ? SITE_CORES.primaryText : SITE_CORES.text }]}>{titulo}</Text>
      </Animated.View>
    </Pressable>
  );
}

function Marca() {
  const router = useRouter();
  return (
    <Pressable accessibilityRole="link" accessibilityLabel="EasyAudit, página inicial" onPress={() => router.push('/inicio')} style={({ pressed }) => [pressed && { opacity: 0.7 }]}>
      <Logo altura={22} claro />
    </Pressable>
  );
}

/** Topo do site (uma linha em qualquer largura). */
export function SiteNav({ onComoFunciona, onPlanos }: { onComoFunciona?: () => void; onPlanos?: () => void }) {
  const { desktop } = useSite();
  const router = useRouter();
  const link = (rotulo: string, onPress: () => void) => (
    <Pressable key={rotulo} accessibilityRole="link" onPress={onPress} style={({ pressed }) => [st.navLink, pressed && { opacity: 0.6 }]}>
      <Text style={st.navLinkTxt}>{rotulo}</Text>
    </Pressable>
  );
  return (
    <View style={st.navFundo}>
      <Faixa style={st.nav}>
        <Marca />
        <View style={{ flex: 1 }} />
        {desktop && onComoFunciona ? link('Como funciona', onComoFunciona) : null}
        {desktop && onPlanos ? link('Planos', onPlanos) : null}
        {link('Entrar', () => router.push('/login'))}
        {desktop ? <BotaoSite titulo={CTA_EMPRESA} onPress={() => router.push('/criar-empresa')} style={{ marginLeft: 6 }} /> : null}
      </Faixa>
    </View>
  );
}

export function SiteFooter() {
  const router = useRouter();
  return (
    <View style={st.rodape}>
      <Faixa style={st.rodapeLinha}>
        <Marca />
        <View style={{ flex: 1 }} />
        <Pressable accessibilityRole="link" onPress={() => router.push('/login')}><Text style={st.navLinkTxt}>Entrar</Text></Pressable>
        <Text style={st.rodapeTxt}>© {new Date().getFullYear()} EasyAudit</Text>
      </Faixa>
    </View>
  );
}

const st = StyleSheet.create({
  navFundo: { backgroundColor: SITE_CORES.bg, borderBottomWidth: 1, borderBottomColor: '#ffffff14' },
  nav: { height: 68, flexDirection: 'row', alignItems: 'center', gap: 4 },
  navLink: { paddingHorizontal: 12, height: 40, justifyContent: 'center', borderRadius: 10 },
  navLinkTxt: { fontSize: 14, fontWeight: '600', color: SITE_CORES.textMuted },
  botao: { height: 44, paddingHorizontal: 20, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  botaoGrande: { height: 52, paddingHorizontal: 26 },
  botaoPrim: { backgroundColor: SITE_CORES.accent },
  botaoSec: { borderWidth: 1, borderColor: '#ffffff33', backgroundColor: '#ffffff08' },
  botaoTxt: { fontSize: 14.5, fontWeight: '800', letterSpacing: 0.1 },
  rodape: { borderTopWidth: 1, borderTopColor: '#ffffff14', paddingVertical: 32, backgroundColor: SITE_CORES.bg },
  rodapeLinha: { flexDirection: 'row', alignItems: 'center', gap: 18, flexWrap: 'wrap' },
  rodapeTxt: { fontSize: 13, color: SITE_CORES.textFaint },
});
