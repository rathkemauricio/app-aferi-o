import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';

// Módulos usados por último (só no app do celular): a tela inicial mostra o mais recente em cima.
// Fica só neste aparelho. Na web a ordem continua a do catálogo.
const CHAVE = 'nevoeiro.modulos.recentes.v1';
let usos: Record<string, number> = {};
const ouvintes = new Set<(u: Record<string, number>) => void>();
const avisar = () => ouvintes.forEach(f => f(usos));
if (Platform.OS !== 'web') {
  void AsyncStorage.getItem(CHAVE).then(v => { if (v) { usos = { ...JSON.parse(v), ...usos }; avisar(); } }).catch(() => undefined);
}

/** Registra que o módulo foi aberto agora. */
export function marcarUsoModulo(id: string) {
  if (Platform.OS === 'web') return;
  usos = { ...usos, [id]: Date.now() };
  void AsyncStorage.setItem(CHAVE, JSON.stringify(usos)).catch(() => undefined);
  // Reordena depois que a tela do módulo já abriu (o cartão não "pula" na frente da pessoa).
  setTimeout(avisar, 600);
}

/** Ordena os módulos: no app, o aberto por último primeiro; na web, a ordem original. */
export function useOrdemRecentes<T extends { id: string }>(lista: T[]): T[] {
  const [u, setU] = useState(usos);
  useEffect(() => { ouvintes.add(setU); return () => { ouvintes.delete(setU); }; }, []);
  if (Platform.OS === 'web') return lista;
  return [...lista].sort((a, b) => (u[b.id] ?? 0) - (u[a.id] ?? 0));
}
