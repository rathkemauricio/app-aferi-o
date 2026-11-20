import type { ThemeColors } from './theme';

/**
 * Cores das telas de coleta em tela cheia (Aferição interativa, Medição interativa, Modo cartões), tiradas do
 * tema escolhido. Fundo, painéis e campos vêm da família dos cartões (a que sempre contrasta com `text`), então a letra
 * fica legível em qualquer tema (claro, escuro ou de fundo escuro com cartões claros). Os desenhos (tanque, bomba,
 * medida-padrão) continuam com as cores próprias, como ilustrações.
 */
export type PaletaImersiva = {
  /** Fundo da tela. */ fundo: string;
  /** Painéis (cena, lista de itens). */ painel: string;
  /** Botões e chips sobre o fundo. */ painel2: string;
  /** Campos de digitação e caixinhas dentro dos painéis. */ campo: string;
  /** Contornos. */ linha: string;
  /** Texto principal e texto fraco. */ fg: string; muted: string;
  /** Botão principal, texto sobre ele, estado apertado e fundo suave (etiquetas). */ acao: string; acaoTxt: string; acaoPress: string; acaoSoft: string;
  /** Cor de destaque para texto (progresso, etiquetas). */ destaqueTxt: string;
  /** Erro e aviso em texto. */ perigo: string; aviso: string;
};

export const paletaImersiva = (c: ThemeColors): PaletaImersiva => ({
  fundo: c.surface, painel: c.surfaceMuted, painel2: c.border, campo: c.campo, linha: c.borderStrong,
  fg: c.text, muted: c.textMuted,
  acao: c.accent, acaoTxt: c.primaryText, acaoPress: c.accentPressed, acaoSoft: c.accentSoft,
  destaqueTxt: c.accentText, perigo: c.danger, aviso: c.warning,
});
