import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { createContext, createElement, type ReactNode, useCallback, useEffect, useMemo, useState } from 'react';

// Tokens visuais do app. Um único acento (índigo), neutros frios e cores semânticas só para status.
export const color = {
  bg: '#f5f6f8',
  surface: '#ffffff',
  surfaceMuted: '#f9fafb',
  border: '#e5e7ec',
  borderStrong: '#d3d7df',
  text: '#141922',
  textMuted: '#596173',
  textFaint: '#6e7686',

  accent: '#4f46e5',
  accentPressed: '#4338ca',
  accentSoft: '#eef0ff',
  accentText: '#3f37c9',
  primaryText: '#ffffff',

  success: '#157a3c',
  successSoft: '#e8f6ee',
  warning: '#9a5b00',
  warningSoft: '#fdf3e0',
  danger: '#b42318',
  dangerSoft: '#fdecea',
  neutralSoft: '#eef0f3',
};

// Tons de categoria para os quadradinhos de ícone (filiais, bombas, bicos, aferições).
export const tint = {
  indigo: { bg: '#eef0ff', fg: '#4f46e5' },
  sky: { bg: '#e8f3fc', fg: '#1f6fb2' },
  emerald: { bg: '#e8f6ee', fg: '#157a3c' },
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
  bg: '#0c1420', surface: '#141f2c', surfaceMuted: '#1a2838', border: '#28384a', borderStrong: '#3a4d63',
  text: '#edf3fa', textMuted: '#b3c0cf', textFaint: '#8e9eb1', accent: '#9189ff', accentPressed: '#7c74ec',
  accentSoft: '#29284c', accentText: '#bcb7ff', primaryText: '#ffffff', success: '#5dcc88', successSoft: '#183325', warning: '#f1bd65',
  warningSoft: '#382d19', danger: '#ff8278', dangerSoft: '#3b2224', neutralSoft: '#273445',
};
const webColor: ThemeColors = {
  ...color, bg: '#eceeea', surface: '#fbfcf9', surfaceMuted: '#f2f3ef', border: '#e0e2dc', borderStrong: '#cdd0c8',
  text: '#242721', textMuted: '#62665e', textFaint: '#74786f', accent: '#efed53', accentPressed: '#dcd941',
  accentSoft: '#f6f5c8', accentText: '#303123', primaryText: '#292a22',
};
const webDarkColor: ThemeColors = {
  ...darkColor, accent: '#e5e250', accentPressed: '#cfcf40', accentSoft: '#3c3b26', accentText: '#f2ef57', primaryText: '#25261f',
};
export const ThemeContext = createContext<{ mode: ThemeMode; colors: ThemeColors; toggleTheme: () => void }>({
  mode: 'light', colors: color, toggleTheme: () => undefined,
});
const THEME_KEY = 'nevoeiro.display-theme.v1';

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<ThemeMode>('light');
  useEffect(() => { void AsyncStorage.getItem(THEME_KEY).then(saved => { if (saved === 'dark' || saved === 'light') setMode(saved); }).catch(() => undefined); }, []);
  const toggleTheme = useCallback(() => {
    setMode(current => {
      const next = current === 'light' ? 'dark' : 'light';
      void AsyncStorage.setItem(THEME_KEY, next).catch(() => undefined);
      return next;
    });
  }, []);
  const colors = Platform.OS === 'web'
    ? mode === 'dark' ? webDarkColor : webColor
    : mode === 'dark' ? darkColor : color;
  const value = useMemo(() => ({ mode, colors, toggleTheme }), [mode, colors, toggleTheme]);
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
