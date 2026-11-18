import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform, useColorScheme } from 'react-native';
import { createContext, createElement, type ReactNode, useCallback, useEffect, useMemo, useState } from 'react';

// Tokens visuais do app (marca EasyAudit): azul-marinho e verde-menta, neutros frios e cores semânticas só para status.
// Tema claro: botões principais em azul-marinho. Tema escuro: fundo marinho e botões em verde-menta.
export const color = {
  bg: '#f2f4f7',
  surface: '#ffffff',
  surfaceMuted: '#f7f8fa',
  border: '#e3e7ee',
  borderStrong: '#cdd4df',
  text: '#0f1f3d',
  textMuted: '#55607a',
  textFaint: '#6f7891',

  accent: '#0f1f3d',
  accentPressed: '#0a1630',
  accentSoft: '#e6ecf5',
  accentText: '#1f3d6e',
  primaryText: '#ffffff',

  success: '#157a3c',
  successSoft: '#e3f6ec',
  warning: '#9a5b00',
  warningSoft: '#fdf3e0',
  danger: '#b42318',
  dangerSoft: '#fdecea',
  neutralSoft: '#eef0f4',

  /** Verde-menta da marca (setas dos cartões, etiquetas de destaque). */
  mint: '#5fd39a',
  /** Texto sobre o verde-menta. */
  onMint: '#0f1f3d',
};

// Tons de categoria para os quadradinhos de ícone (filiais, bombas, bicos, aferições).
export const tint = {
  indigo: { bg: '#e6ecf5', fg: '#1f3d6e' },
  sky: { bg: '#e6f1f8', fg: '#1f5f8b' },
  emerald: { bg: '#e3f6ec', fg: '#17865a' },
  amber: { bg: '#fdf3e0', fg: '#9a5b00' },
  slate: { bg: '#eef0f3', fg: '#4a5263' },
  rose: { bg: '#fdecee', fg: '#c43d48' },
} as const;
export type Tint = keyof typeof tint;

// Raio: cards 16, controles 12, quadradinhos de ícone 10, etiquetas em pílula.
export const radius = Platform.OS === 'web'
  ? { card: 10, control: 8, tile: 6, pill: 999 }
  : { card: 16, control: 12, tile: 10, pill: 999 };

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 28 };

/** Mantém o limite compacto em telas nativas e libera a largura disponível na web. */
export const pageMaxWidth = (nativeWidth: number): number | '100%' => Platform.OS === 'web' ? '100%' : nativeWidth;

export const type = {
  title: { fontSize: 24, fontWeight: '800' as const, letterSpacing: -0.4, color: color.text },
  section: { fontSize: 17, fontWeight: '700' as const, letterSpacing: -0.2, color: color.text },
  body: { fontSize: 14, color: color.text },
  bodyStrong: { fontSize: 14, fontWeight: '600' as const, color: color.text },
  caption: { fontSize: 12.5, color: color.textMuted, lineHeight: 18 },
  label: { fontSize: 12.5, fontWeight: '600' as const, color: color.textMuted },
};

export const shadow = {
  card: { shadowColor: '#1b2333', shadowOpacity: 0.05, shadowRadius: 10, shadowOffset: { width: 0, height: 3 }, elevation: 1 },
  sheet: { shadowColor: '#1b2333', shadowOpacity: 0.16, shadowRadius: 28, shadowOffset: { width: 0, height: -6 }, elevation: 12 },
};


export type ThemeMode = 'light' | 'dark';
export type ThemeColors = { [K in keyof typeof color]: string };
export const darkColor: ThemeColors = {
  bg: '#0d1628', surface: '#17233a', surfaceMuted: '#1d2b45', border: '#28395a', borderStrong: '#3a4d70',
  text: '#eef2f8', textMuted: '#b6c1d3', textFaint: '#8d99b0', accent: '#5fd39a', accentPressed: '#4cc189',
  accentSoft: '#1b3a36', accentText: '#7fe0b0', primaryText: '#0f1f3d', success: '#5dcc88', successSoft: '#173326', warning: '#f1bd65',
  warningSoft: '#382d19', danger: '#ff8278', dangerSoft: '#3b2224', neutralSoft: '#26344d', mint: '#5fd39a', onMint: '#0f1f3d',
};
/** Preferência de tema do aparelho: claro, escuro ou automático (segue o tema do celular/computador). */
export type PreferenciaTema = ThemeMode | 'auto';
export const ThemeContext = createContext<{
  mode: ThemeMode; colors: ThemeColors; toggleTheme: () => void; escala: number; setEscala: (e: number) => void;
  preferenciaTema: PreferenciaTema; setPreferenciaTema: (p: PreferenciaTema) => void;
}>({
  mode: 'light', colors: color, toggleTheme: () => undefined, escala: 1, setEscala: () => undefined, preferenciaTema: 'light', setPreferenciaTema: () => undefined,
});
const THEME_KEY = 'nevoeiro.display-theme.v1';
const ESCALA_KEY = 'nevoeiro.display-escala.v1';
/** Tamanhos de fontes e ícones oferecidos em Configurações (o app inteiro é ampliado por igual). */
export const ESCALAS = [0.85, 1, 1.15, 1.3, 1.5] as const;

export function ThemeProvider({ children }: { children: ReactNode }) {
  const sistema = useColorScheme();
  const [preferenciaTema, setPref] = useState<PreferenciaTema>('light');
  const [escala, setEscalaState] = useState(1);
  useEffect(() => { void AsyncStorage.getItem(THEME_KEY).then(saved => { if (saved === 'dark' || saved === 'light' || saved === 'auto') setPref(saved); }).catch(() => undefined); }, []);
  useEffect(() => { void AsyncStorage.getItem(ESCALA_KEY).then(v => { const n = Number(v); if (v && (ESCALAS as readonly number[]).includes(n)) setEscalaState(n); }).catch(() => undefined); }, []);
  const setEscala = useCallback((e: number) => { setEscalaState(e); void AsyncStorage.setItem(ESCALA_KEY, String(e)).catch(() => undefined); }, []);
  const setPreferenciaTema = useCallback((p: PreferenciaTema) => { setPref(p); void AsyncStorage.setItem(THEME_KEY, p).catch(() => undefined); }, []);
  const mode: ThemeMode = preferenciaTema === 'auto' ? (sistema === 'dark' ? 'dark' : 'light') : preferenciaTema;
  // Atalho (ícone de sol/lua): fixa o tema oposto ao que está na tela.
  const toggleTheme = useCallback(() => setPreferenciaTema(mode === 'light' ? 'dark' : 'light'), [mode, setPreferenciaTema]);
  // Mesmas cores no app e na web (marca EasyAudit).
  const colors = mode === 'dark' ? darkColor : color;
  const value = useMemo(() => ({ mode, colors, toggleTheme, escala, setEscala, preferenciaTema, setPreferenciaTema }), [mode, colors, toggleTheme, escala, setEscala, preferenciaTema, setPreferenciaTema]);
  return createElement(ThemeContext.Provider, { value }, children);
}

export function createTypography(colors: ThemeColors) {
  return {
    title: { fontSize: 24, fontWeight: '800' as const, letterSpacing: -0.4, color: colors.text },
    section: { fontSize: 17, fontWeight: '700' as const, letterSpacing: -0.2, color: colors.text },
    body: { fontSize: 14, color: colors.text },
    bodyStrong: { fontSize: 14, fontWeight: '600' as const, color: colors.text },
    caption: { fontSize: 12.5, color: colors.textMuted, lineHeight: 18 },
    label: { fontSize: 12.5, fontWeight: '600' as const, color: colors.textMuted },
  };
}
