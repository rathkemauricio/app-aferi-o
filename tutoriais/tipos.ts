import type { ComponentRef } from 'react';
import type { View } from 'react-native';

// Tipos dos tutoriais interativos. Pasta independente: não importa nada do app (pode ser copiada para outro projeto).

/** Um passo do tutorial. */
export type Passo = {
  /** Id do <Alvo> destacado. Sem alvo, o cartão aparece no centro da tela (boas-vindas, conclusão). */
  alvo?: string;
  titulo: string;
  texto?: string;
  /**
   * 'ler' (padrão): a pessoa lê e toca em Próximo; o resto da tela fica bloqueado.
   * 'toque': a pessoa toca no próprio elemento destacado para seguir (ex.: abrir um menu de verdade).
   */
  acao?: 'ler' | 'toque';
  /** Onde fica o cartão em relação ao destaque. Padrão: onde couber (embaixo, senão em cima). */
  lado?: 'auto' | 'cima' | 'baixo';
  /** Espaço entre o elemento e a borda do destaque (px). Padrão 8. */
  folga?: number;
  /** Arredondamento do destaque (px). Padrão 14. */
  raio?: number;
  /** Se o alvo não estiver na tela (ex.: só existe no computador), pula o passo em vez de mostrar no centro. */
  opcional?: boolean;
  /** Roda antes de mostrar o passo (ex.: navegar para outra tela). O destaque espera terminar. */
  antes?: () => void | Promise<void>;
  /** Espera extra (ms) antes de medir o alvo, depois do `antes` (ex.: animação de abertura). Padrão 0. */
  espera?: number;
};

export type Tutorial = {
  id: string;
  titulo: string;
  descricao?: string;
  passos: Passo[];
};

/** Onde guardar quais tutoriais a pessoa já viu (AsyncStorage, localStorage, banco...). */
export type Armazenamento = {
  ler: (chave: string) => Promise<string | null>;
  gravar: (chave: string, valor: string) => Promise<void>;
};

/** Cores e formas do tutorial (tudo opcional; o padrão é azul-marinho com verde-menta). */
export type TemaTutorial = {
  /** Cor do fundo escurecido em volta do destaque. */
  veu: string;
  cartao: string;
  borda: string;
  texto: string;
  textoSuave: string;
  /** Cor do contorno do destaque, dos pontos de progresso e do botão principal. */
  destaque: string;
  /** Texto sobre o botão principal. */
  sobreDestaque: string;
  /** Pulso em volta do destaque nos passos de toque. */
  pulso: string;
};

/** Textos dos botões (para outro idioma). */
export type RotulosTutorial = {
  proximo: string; voltar: string; pular: string; concluir: string; toqueParaSeguir: string;
  /** Ex.: (2, 5) => '2 de 5' */
  progresso: (atual: number, total: number) => string;
};

/** Uma área rolável que o tutorial pode rolar (ver RolagemTutorial). */
export type ItemRolagem = { ref: { current: { scrollTo: (o: { y: number; animated?: boolean }) => void } | null }; posicao: () => number };

/** Elemento nativo de uma View (o que o tutorial mede). */
export type ElementoAlvo = ComponentRef<typeof View>;
