import { useRouter } from 'expo-router';
import { type ReactNode, useContext, useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Logo } from '../Logo';
import { Button } from '../../ui/kit';
import { ThemeContext, type ThemeColors } from '../../ui/theme';
import { useTela } from '../../ui/zoom';

/** Largura máxima do conteúdo do site e ponto em que o layout passa de uma para duas colunas. */
export const SITE_MAX = 1180;
export const CTA_EMPRESA = 'Criar minha empresa';

export function useSite() {
  const { colors, mode } = useContext(ThemeContext);
  const { width } = useTela();
  const desktop = width >= 960;
  const s = useMemo(() => estilos(colors), [colors]);
  return { colors, mode, desktop, width, s };
}

/** Faixa com a largura do site, centralizada, com o recuo lateral certo para celular e computador. */
export function Faixa({ children, style }: { children: ReactNode; style?: object }) {
  const { desktop } = useSite();
  return <View style={[{ width: '100%', maxWidth: SITE_MAX, alignSelf: 'center', paddingHorizontal: desktop ? 32 : 16 }, style]}>{children}</View>;
}

function Marca() {
  const { mode } = useSite();
  const router = useRouter();
  return (
    <Pressable accessibilityRole="link" accessibilityLabel="EasyAudit, página inicial" onPress={() => router.push('/inicio')} style={({ pressed }) => [pressed && { opacity: 0.7 }]}>
      <Logo altura={22} claro={mode === 'dark'} />
    </Pressable>
  );
}

/** Topo do site: marca, planos, entrar e a ação principal (uma linha em qualquer largura). */
export function SiteNav({ onPlanos }: { onPlanos?: () => void }) {
  const { s, desktop, colors } = useSite();
  const router = useRouter();
  return (
    <View style={s.navFundo}>
      <Faixa style={s.nav}>
        <Marca />
        <View style={{ flex: 1 }} />
        {desktop && onPlanos ? (
          <Pressable accessibilityRole="link" onPress={onPlanos} style={({ pressed }) => [s.navLink, pressed && { opacity: 0.6 }]}>
            <Text style={[s.navLinkTxt, { color: colors.textMuted }]}>Planos</Text>
          </Pressable>
        ) : null}
        <Pressable accessibilityRole="link" onPress={() => router.push('/login')} style={({ pressed }) => [s.navLink, pressed && { opacity: 0.6 }]}>
          <Text style={[s.navLinkTxt, { color: colors.text }]}>Entrar</Text>
        </Pressable>
        {desktop ? <Button title={CTA_EMPRESA} size="sm" onPress={() => router.push('/criar-empresa')} /> : null}
      </Faixa>
    </View>
  );
}

export function SiteFooter() {
  const { s, colors } = useSite();
  const router = useRouter();
  return (
    <View style={[s.rodape, { borderTopColor: colors.border }]}>
      <Faixa style={s.rodapeLinha}>
        <Marca />
        <View style={{ flex: 1 }} />
        <Pressable accessibilityRole="link" onPress={() => router.push('/login')}><Text style={[s.navLinkTxt, { color: colors.textMuted }]}>Entrar</Text></Pressable>
        <Text style={[s.rodapeTxt, { color: colors.textFaint }]}>© {new Date().getFullYear()} EasyAudit</Text>
      </Faixa>
    </View>
  );
}

const estilos = (c: ThemeColors) => StyleSheet.create({
  navFundo: { backgroundColor: c.bg, borderBottomWidth: 1, borderBottomColor: c.border },
  nav: { height: 64, flexDirection: 'row', alignItems: 'center', gap: 6 },
  navLink: { paddingHorizontal: 12, height: 40, justifyContent: 'center', borderRadius: 10 },
  navLinkTxt: { fontSize: 14, fontWeight: '600' },
  rodape: { borderTopWidth: 1, paddingVertical: 28, marginTop: 24 },
  rodapeLinha: { flexDirection: 'row', alignItems: 'center', gap: 16, flexWrap: 'wrap' },
  rodapeTxt: { fontSize: 13 },
});
