import { type Href, useRouter } from 'expo-router';
import { type ReactNode, useContext, useMemo } from 'react';
import { Platform, Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import { Logo } from '../Logo';
import { color, ThemeContext, type ThemeColors } from '../../ui/theme';
import { useTela } from '../../ui/zoom';
import { EASE } from './motion';

/** Largura máxima do conteúdo do site. */
export const SITE_MAX = 1180;
/** As duas ações do site: começar (cadastro) e entender (página de como funciona). */
export const CTA_COMECAR = 'Começar agora';
export const CTA_ENTENDER = 'Entender se isso é para mim';
export const ROTA_COMECAR = '/comecar' as Href;
export const ROTA_ENTENDER = '/como-funciona' as Href;

/**
 * Paleta do site: clara e sóbria, com a tinta azul-marinho da marca e o verde-menta só nos detalhes (checks).
 * Travada em qualquer tema do aparelho; os campos e botões do sistema herdam esta paleta só dentro do site.
 */
export const SITE_CORES: ThemeColors = {
  ...color,
  bg: '#f7f8fa', surface: '#ffffff', surfaceMuted: '#f0f3f7', border: '#e2e7ef', borderStrong: '#cbd3df',
  text: '#0f1f3d', textMuted: '#4a5873', textFaint: '#76829a',
  accent: '#0f1f3d', accentPressed: '#0a1630', accentSoft: '#e9eef7', accentText: '#14305e', primaryText: '#ffffff',
  campo: '#ffffff', folha: '#f7f8fa', onBg: '#0f1f3d', onBgMuted: '#4a5873', neutralSoft: '#eef1f6',
};
/** Verde-menta da marca (só preenchimentos: checks, níveis, linhas de progresso). */
export const MENTA = '#5fd39a';

export function SiteTema({ children }: { children: ReactNode }) {
  const ctx = useContext(ThemeContext);
  const valor = useMemo(() => ({ ...ctx, mode: 'light' as const, colors: SITE_CORES }), [ctx]);
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
 * Botão do site (pílula). Toque: encolhe 3% para confirmar. Mouse: sobe 1 px (só no computador).
 * primario: azul-marinho; destaque: verde-menta com texto marinho; secundario: contorno; claro: branco sobre fundo escuro.
 */
export function BotaoSite({ titulo, onPress, tipo = 'primario', grande = false, pequeno = false, disabled = false, style }: {
  titulo: string; onPress: () => void; tipo?: 'primario' | 'destaque' | 'secundario' | 'claro'; grande?: boolean; pequeno?: boolean; disabled?: boolean; style?: ViewStyle;
}) {
  const reduz = useReducedMotion();
  const toque = useSharedValue(0);
  const hover = useSharedValue(0);
  const anim = useAnimatedStyle(() => ({ transform: [{ translateY: hover.value * -1 }, { scale: 1 - toque.value * 0.03 }] }));
  const t = (v: { value: number }, alvo: number, ms: number) => { v.value = reduz ? alvo : withTiming(alvo, { duration: ms, easing: EASE }); };
  const cor = tipo === 'primario' ? SITE_CORES.primaryText : SITE_CORES.text; // destaque: menta com texto marinho
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={onPress}
      onPressIn={() => t(toque, 1, 100)} onPressOut={() => t(toque, 0, 160)}
      onHoverIn={() => Platform.OS === 'web' && t(hover, 1, 160)} onHoverOut={() => t(hover, 0, 200)} style={style}>
      <Animated.View style={[st.botao, grande && st.botaoGrande, pequeno && st.botaoPequeno, st[tipo], disabled && { opacity: 0.55 }, anim]}>
        <Text numberOfLines={1} style={[st.botaoTxt, grande && { fontSize: 15.5 }, pequeno && st.botaoTxtPequeno, { color: cor }]}>{titulo}</Text>
      </Animated.View>
    </Pressable>
  );
}

function Marca() {
  const router = useRouter();
  return (
    <Pressable accessibilityRole="link" accessibilityLabel="EasyAudit, página inicial" onPress={() => router.push('/inicio')} style={({ pressed }) => [pressed && { opacity: 0.7 }]}>
      <Logo altura={22} />
    </Pressable>
  );
}

/** Topo do site: marca, menu central em maiúsculas pequenas e, à direita, Entrar e Começar agora (uma linha). */
export function SiteNav({ onPosto, onTelas }: { onPosto?: () => void; onTelas?: () => void }) {
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
        <View style={{ flex: 1, alignItems: 'flex-start' }}><Marca /></View>
        {desktop ? (
          <View style={st.navCentro}>
            {link('COMO FUNCIONA', () => router.push(ROTA_ENTENDER))}
            {link('NO POSTO', onPosto ?? (() => router.push('/inicio')))}
            {link('TELAS', onTelas ?? (() => router.push('/inicio')))}
          </View>
        ) : null}
        <View style={{ flex: 1, flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 8 }}>
          <BotaoSite titulo="ENTRAR" tipo="secundario" pequeno onPress={() => router.push('/login')} />
          {desktop ? <BotaoSite titulo={CTA_COMECAR.toUpperCase()} pequeno onPress={() => router.push(ROTA_COMECAR)} /> : null}
        </View>
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
        <Pressable accessibilityRole="link" onPress={() => router.push(ROTA_ENTENDER)}><Text style={st.navLinkTxt}>Como funciona</Text></Pressable>
        <Pressable accessibilityRole="link" onPress={() => router.push('/login')}><Text style={st.navLinkTxt}>Entrar</Text></Pressable>
        <Text style={st.rodapeTxt}>© {new Date().getFullYear()} EasyAudit</Text>
      </Faixa>
    </View>
  );
}

const st = StyleSheet.create({
  navFundo: { backgroundColor: '#ffffff', borderBottomWidth: 1, borderBottomColor: SITE_CORES.border },
  nav: { height: 68, flexDirection: 'row', alignItems: 'center' },
  navCentro: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  navLink: { paddingHorizontal: 12, height: 40, justifyContent: 'center', borderRadius: 8 },
  navLinkTxt: { fontSize: 12, fontWeight: '700', letterSpacing: 1.1, color: SITE_CORES.textMuted },
  botao: { height: 46, paddingHorizontal: 22, borderRadius: 999, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  botaoGrande: { height: 52, paddingHorizontal: 26 },
  botaoPequeno: { height: 38, paddingHorizontal: 16 },
  botaoTxtPequeno: { fontSize: 12, letterSpacing: 1, fontWeight: '800' },
  primario: { backgroundColor: SITE_CORES.accent, borderColor: SITE_CORES.accent },
  destaque: { backgroundColor: MENTA, borderColor: MENTA },
  secundario: { backgroundColor: '#ffffff', borderColor: SITE_CORES.borderStrong },
  claro: { backgroundColor: '#ffffff', borderColor: '#ffffff' },
  botaoTxt: { fontSize: 14.5, fontWeight: '700', letterSpacing: 0.1 },
  rodape: { borderTopWidth: 1, borderTopColor: SITE_CORES.border, paddingVertical: 30, backgroundColor: '#ffffff' },
  rodapeLinha: { flexDirection: 'row', alignItems: 'center', gap: 20, flexWrap: 'wrap' },
  rodapeTxt: { fontSize: 13, color: SITE_CORES.textFaint },
});
