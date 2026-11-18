import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform, useColorScheme } from 'react-native';
import { createContext, createElement, type ReactNode, useCallback, useEffect, useMemo, useState } from 'react';

// Tokens visuais do app (marca EasyAudit): azul-marinho e verde-menta, neutros frios e cores semânticas só para status.
// Tema claro: botões principais em azul-marinho. Tema escuro: fundo marinho e botões em verde-menta.
export const color = {
  bg: '#eef1f6',
  surface: '#dde6f2',
  surfaceMuted: '#cfdaea',
  border: '#c3cfe0',
  borderStrong: '#aebdd3',
  text: '#0f1f3d',
  textMuted: '#3f4d68',
  textFaint: '#5d6a84',

  accent: '#0f1f3d',
  accentPressed: '#0a1630',
  accentSoft: '#c6d4ea',
  accentText: '#14305e',
  primaryText: '#ffffff',

  success: '#157a3c',
  successSoft: '#cdeedb',
  warning: '#9a5b00',
  warningSoft: '#f6e3bd',
  danger: '#b42318',
  dangerSoft: '#f6d3cf',
  neutralSoft: '#d3dce9',

  /** Cor de destaque do tema (setas dos cartões, etiquetas, o visto do logo). */
  mint: '#5fd39a',
  /** Texto sobre a cor de destaque. */
  onMint: '#0f1f3d',

  /** Texto direto sobre o fundo da página (títulos, seções, avisos). Nos temas com cartões claros sobre fundo
   *  escuro, é diferente do `text` (que é o texto dos cartões). */
  onBg: '#0f1f3d',
  onBgMuted: '#3f4d68',
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
  onBg: '#eef2f8', onBgMuted: '#b6c1d3',
};
/* ---------- Temas de preferência ---------- */
// Cada tema é uma paleta completa e sólida (fundo, cartões, botões e destaques preenchidos), não só ícones e
// letras coloridos. O usuário escolhe em Configurações; o atalho de sol/lua troca para o tema "par" (claro ↔ escuro).
export type Tema = { id: string; nome: string; modo: ThemeMode; par: string; cores: ThemeColors };
const completar = (base: ThemeColors, c: Partial<ThemeColors>): ThemeColors => {
  const r = { ...base, ...c };
  return { ...r, onBg: c.onBg ?? r.text, onBgMuted: c.onBgMuted ?? r.textMuted };
};
const claro = (id: string, nome: string, par: string, c: Partial<ThemeColors>): Tema => ({ id, nome, modo: 'light', par, cores: completar(color, c) });
const escuro = (id: string, nome: string, par: string, c: Partial<ThemeColors>): Tema => ({ id, nome, modo: 'dark', par, cores: completar(darkColor, c) });
/** Fundo escuro com cartões claros: o texto dos cartões é escuro e o texto sobre o fundo (`onBg`) é claro. */
const misto = (id: string, nome: string, par: string, c: Partial<ThemeColors>): Tema => ({ id, nome, modo: 'light', par, cores: completar(color, c) });

export const TEMAS: Tema[] = [
  claro('claro', 'EasyAudit claro', 'escuro', {}),
  escuro('escuro', 'EasyAudit escuro', 'claro', {}),
  claro('azul-vermelho', 'Clara, Azul e Vermelho', 'grafite-vermelho', {
    bg: '#f6f3ec', surface: '#cfe3f3', surfaceMuted: '#bcd6ec', border: '#a9c8e3', borderStrong: '#8fb5d6',
    text: '#0f2340', textMuted: '#36506e', textFaint: '#56708e', accent: '#d7263d', accentPressed: '#b81d31', accentSoft: '#f5d2d6', accentText: '#a3192b',
    primaryText: '#ffffff', neutralSoft: '#dbe7f2', mint: '#d7263d', onMint: '#ffffff',
  }),
  claro('areia-oliva', 'Areia, Oliva e Amarelo', 'verde-lima', {
    bg: '#ecdcbc', surface: '#ddc89e', surfaceMuted: '#d1b98a', border: '#c4a978', borderStrong: '#ad925f',
    text: '#2f2d12', textMuted: '#55522a', textFaint: '#6c6838', accent: '#5d6a24', accentPressed: '#4b5619', accentSoft: '#d6d29a', accentText: '#4a5418',
    primaryText: '#ffffff', neutralSoft: '#e2d0aa', mint: '#d9b43a', onMint: '#2f2d12',
  }),
  claro('cinza-roxo', 'Branco, Cinza e Roxo', 'roxo-ambar', {
    bg: '#f3f1ec', surface: '#e2ddd5', surfaceMuted: '#d5cfc5', border: '#c8c1b5', borderStrong: '#afa797',
    text: '#231d2e', textMuted: '#4c4556', textFaint: '#685f70', accent: '#4b2a8a', accentPressed: '#3b2070', accentSoft: '#ddd1f0', accentText: '#4b2a8a',
    primaryText: '#ffffff', neutralSoft: '#e8e3dc', mint: '#6b3fc0', onMint: '#ffffff',
  }),
  claro('creme-laranja', 'Creme, Marinho e Laranja', 'grafite-laranja', {
    bg: '#f4ecdc', surface: '#ead9b8', surfaceMuted: '#e0cba3', border: '#d5bd92', borderStrong: '#bfa374',
    text: '#1b2340', textMuted: '#454a63', textFaint: '#62667c', accent: '#f26a12', accentPressed: '#d65a08', accentSoft: '#fbd8bf', accentText: '#b84d05',
    primaryText: '#ffffff', neutralSoft: '#efe2c8', mint: '#f26a12', onMint: '#ffffff',
  }),
  escuro('verde-lima', 'Verde-escuro e Lima', 'areia-oliva', {
    bg: '#0f2f25', surface: '#1b4535', surfaceMuted: '#245442', border: '#2d6250', borderStrong: '#3d7863',
    text: '#eef7e8', textMuted: '#bfd6c4', textFaint: '#97b3a0', accent: '#c5ef4a', accentPressed: '#b2dc35', accentSoft: '#344f22', accentText: '#d6f77a',
    primaryText: '#0f2f25', successSoft: '#1e4a32', neutralSoft: '#22503f', mint: '#c5ef4a', onMint: '#0f2f25',
  }),
  misto('grafite-vermelho', 'Grafite, Branco e Vermelho', 'azul-vermelho', {
    bg: '#222224', surface: '#f1f1f2', surfaceMuted: '#e2e2e5', border: '#d2d2d6', borderStrong: '#b4b4bb',
    text: '#1d1d1f', textMuted: '#74747c', textFaint: '#8b8b92', onBg: '#f4f4f4', onBgMuted: '#c4c4c8',
    accent: '#ef3b2d', accentPressed: '#d42f22', accentSoft: '#fbd5d1', accentText: '#c9261a', primaryText: '#ffffff', neutralSoft: '#e7e7ea', mint: '#ef3b2d', onMint: '#ffffff',
  }),
  escuro('petroleo', 'Petróleo (Teal)', 'claro', {
    bg: '#0c3237', surface: '#18525a', surfaceMuted: '#1f5f68', border: '#276d76', borderStrong: '#358490',
    text: '#eaf6f7', textMuted: '#b6d4d7', textFaint: '#8fb4b8', accent: '#2ec4cc', accentPressed: '#20aeb6', accentSoft: '#164a50', accentText: '#6fdfe5',
    primaryText: '#06292d', neutralSoft: '#1c5a62', mint: '#2ec4cc', onMint: '#06292d',
  }),
  misto('roxo-ambar', 'Roxo, Bege e Amarelo', 'cinza-roxo', {
    bg: '#1b1530', surface: '#f3e1c8', surfaceMuted: '#e8d2b2', border: '#dcc29e', borderStrong: '#c9aa7f',
    text: '#2a2040', textMuted: '#7a6c80', textFaint: '#8e8299', onBg: '#f5eedf', onBgMuted: '#c9bfd9',
    accent: '#8b4ee8', accentPressed: '#7a3fd4', accentSoft: '#e6d8fb', accentText: '#6a2fc9', primaryText: '#ffffff', neutralSoft: '#eedcc0', mint: '#8b4ee8', onMint: '#ffffff',
  }),
  escuro('grafite-laranja', 'Escura, Cinza e Laranja', 'creme-laranja', {
    bg: '#1f1f21', surface: '#3a3a3d', surfaceMuted: '#444448', border: '#4f4f53', borderStrong: '#636368',
    text: '#f5f5f5', textMuted: '#c7c7cb', textFaint: '#9d9da3', accent: '#ff6a13', accentPressed: '#e85c08', accentSoft: '#4a3020', accentText: '#ff9a5c',
    primaryText: '#ffffff', neutralSoft: '#38383b', mint: '#ff6a13', onMint: '#ffffff',
  }),
  misto('roxo-lima', 'Escuro, Creme e Verde-Lima', 'areia-oliva', {
    bg: '#2a1637', surface: '#f3eedd', surfaceMuted: '#e8e1c9', border: '#dcd3b5', borderStrong: '#c6bb98',
    text: '#2a1637', textMuted: '#7a6c84', textFaint: '#91859a', onBg: '#f6f0dc', onBgMuted: '#cdbfd8',
    accent: '#a8e23c', accentPressed: '#95cf2a', accentSoft: '#e3f3c0', accentText: '#4f7a0a', primaryText: '#2a1637', neutralSoft: '#ede6d0', mint: '#a8e23c', onMint: '#2a1637',
  }),
  misto('azul-laranja', 'Azul, Off-White e Laranja', 'creme-laranja', {
    bg: '#1b44a0', surface: '#f5f1e8', surfaceMuted: '#ebe4d4', border: '#ddd4c0', borderStrong: '#c7bca4',
    text: '#16213d', textMuted: '#6d7390', textFaint: '#858aa2', onBg: '#ffffff', onBgMuted: '#d5e1fa',
    accent: '#ff6a13', accentPressed: '#e85c08', accentSoft: '#fde0cc', accentText: '#c24f05', primaryText: '#ffffff', neutralSoft: '#efe9dc', mint: '#ff6a13', onMint: '#ffffff',
  }),
];
export const temaPorId = (id: string) => TEMAS.find(t => t.id === id);

/** Preferência de tema do aparelho: o id de um tema ou 'auto' (EasyAudit claro/escuro conforme o aparelho). */
export type PreferenciaTema = string;
export const ThemeContext = createContext<{
  mode: ThemeMode; colors: ThemeColors; toggleTheme: () => void; escala: number; setEscala: (e: number) => void;
  preferenciaTema: PreferenciaTema; setPreferenciaTema: (p: PreferenciaTema) => void; tema: Tema;
}>({
  mode: 'light', colors: color, toggleTheme: () => undefined, escala: 1, setEscala: () => undefined, preferenciaTema: 'claro', setPreferenciaTema: () => undefined, tema: TEMAS[0],
});
const THEME_KEY = 'nevoeiro.display-theme.v1';
const ESCALA_KEY = 'nevoeiro.display-escala.v1';
/** Tamanhos de fontes e ícones oferecidos em Configurações (o app inteiro é ampliado por igual). */
export const ESCALAS = [0.85, 1, 1.15, 1.3, 1.5] as const;

export function ThemeProvider({ children }: { children: ReactNode }) {
  const sistema = useColorScheme();
  const [preferenciaTema, setPref] = useState<PreferenciaTema>('claro');
  const [escala, setEscalaState] = useState(1);
  useEffect(() => {
    void AsyncStorage.getItem(THEME_KEY).then(saved => {
      // Valores antigos: 'light' e 'dark' viram os temas EasyAudit claro e escuro.
      const v = saved === 'light' ? 'claro' : saved === 'dark' ? 'escuro' : saved;
      if (v && (v === 'auto' || temaPorId(v))) setPref(v);
    }).catch(() => undefined);
  }, []);
  useEffect(() => { void AsyncStorage.getItem(ESCALA_KEY).then(v => { const n = Number(v); if (v && (ESCALAS as readonly number[]).includes(n)) setEscalaState(n); }).catch(() => undefined); }, []);
  const setEscala = useCallback((e: number) => { setEscalaState(e); void AsyncStorage.setItem(ESCALA_KEY, String(e)).catch(() => undefined); }, []);
  const setPreferenciaTema = useCallback((p: PreferenciaTema) => { setPref(p); void AsyncStorage.setItem(THEME_KEY, p).catch(() => undefined); }, []);
  const tema = (preferenciaTema === 'auto' ? temaPorId(sistema === 'dark' ? 'escuro' : 'claro') : temaPorId(preferenciaTema)) ?? TEMAS[0];
  const mode = tema.modo;
  // Atalho (ícone de sol/lua): vai para o tema par (claro ↔ escuro) do tema atual.
  const toggleTheme = useCallback(() => setPreferenciaTema(tema.par), [tema.par, setPreferenciaTema]);
  const colors = tema.cores;
  const value = useMemo(() => ({ mode, colors, toggleTheme, escala, setEscala, preferenciaTema, setPreferenciaTema, tema }), [mode, colors, toggleTheme, escala, setEscala, preferenciaTema, setPreferenciaTema, tema]);
  return createElement(ThemeContext.Provider, { value }, children);
}

export function createTypography(colors: ThemeColors) {
  return {
    title: { fontSize: 24, fontWeight: '800' as const, letterSpacing: -0.4, color: colors.onBg },
    /** Legenda escrita direto sobre o fundo da página (fora de cartões). */
    captionBg: { fontSize: 12.5, color: colors.onBgMuted, lineHeight: 18 },
    section: { fontSize: 17, fontWeight: '700' as const, letterSpacing: -0.2, color: colors.text },
    body: { fontSize: 14, color: colors.text },
    bodyStrong: { fontSize: 14, fontWeight: '600' as const, color: colors.text },
    caption: { fontSize: 12.5, color: colors.textMuted, lineHeight: 18 },
    label: { fontSize: 12.5, fontWeight: '600' as const, color: colors.textMuted },
  };
}
