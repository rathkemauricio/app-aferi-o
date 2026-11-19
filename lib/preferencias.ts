import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';

// Configurações personalizadas deste aparelho (celular ou navegador). Não vão para o servidor:
// cada coletor pode ter as suas (ex.: sons desligados, teclado sempre na tela).
export type Preferencias = {
  /** Sons da coleta (correto, salvo, barrado). */
  sons: boolean;
  /** Tela de coleta: simples (quadro amarelo e botões grandes) ou completa (layout anterior). */
  layoutColeta: 'simples' | 'completo';
  /** Teclado na tela já ligado ao abrir a coleta (celular sem leitor de código). */
  tecladoColeta: boolean;
  /** Celular sem leitor de código: como contar (câmera, digitando o código ou marcando na lista). */
  modoSemLeitor: 'camera' | 'digitar' | 'lista';
  /** Pedir confirmação ao salvar quantidade acima deste valor (0 = nunca pedir). */
  confirmarAcima: number;
  /** Filial já escolhida ao abrir inventário (id da filial). */
  filialPadrao: string | null;
  /** Tipo já escolhido ao abrir inventário. */
  tipoPadrao: 'completo' | 'parcial';
};
export const PADRAO: Preferencias = { layoutColeta: 'simples', sons: true, tecladoColeta: false, modoSemLeitor: 'lista', confirmarAcima: 100, filialPadrao: null, tipoPadrao: 'completo' };

const CHAVE = 'nevoeiro.preferencias.v1';
let atual: Preferencias = PADRAO;
const ouvintes = new Set<() => void>();
void AsyncStorage.getItem(CHAVE).then(v => {
  if (!v) return;
  try { atual = { ...PADRAO, ...(JSON.parse(v) as Partial<Preferencias>) }; ouvintes.forEach(f => f()); } catch { /* corrompido: fica o padrão */ }
}).catch(() => undefined);

/** Valor atual (fora de componentes, ex.: ao tocar um som). */
export const preferencias = () => atual;
export function setPreferencia<K extends keyof Preferencias>(chave: K, valor: Preferencias[K]) {
  atual = { ...atual, [chave]: valor };
  void AsyncStorage.setItem(CHAVE, JSON.stringify(atual)).catch(() => undefined);
  ouvintes.forEach(f => f());
}
export function restaurarPadrao() {
  atual = PADRAO;
  void AsyncStorage.removeItem(CHAVE).catch(() => undefined);
  ouvintes.forEach(f => f());
}
/** Hook: preferências vivas (a tela redesenha ao mudar). */
export function usePreferencias() {
  return useSyncExternalStore(f => { ouvintes.add(f); return () => { ouvintes.delete(f); }; }, () => atual, () => atual);
}
