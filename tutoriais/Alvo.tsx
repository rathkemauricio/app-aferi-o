import { type ReactNode, useEffect, useRef } from 'react';
import { Platform, type StyleProp, View, type ViewStyle } from 'react-native';
import { useTutorialOpcional } from './contexto';
import type { ElementoAlvo } from './tipos';

/**
 * Marca um elemento que o tutorial pode destacar. Não muda o comportamento do filho:
 * só envolve numa View (use `style` para manter o layout, ex.: { flex: 1 }).
 *
 *   <Alvo id="botao-salvar"><Button title="Salvar" ... /></Alvo>
 */
export function Alvo({ id, children, style }: { id: string; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const ref = useRef<ElementoAlvo>(null);
  const ctx = useTutorialOpcional(); // fora do <TutorialProvider> o Alvo só desenha o filho
  useEffect(() => {
    if (!ctx) return;
    ctx.registrar(id, ref);
    return () => ctx.remover(id, ref);
  }, [ctx, id]);
  // Passos de "toque": o toque no próprio elemento avança o tutorial (o elemento continua funcionando normalmente).
  const tocou = () => ctx?.tocou(id);
  const tocouRef = useRef(tocou);
  tocouRef.current = tocou;
  // Web: escuta o clique na fase de captura (botões e Pressables param a propagação do clique antes de subir).
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const el = ref.current as unknown as { addEventListener?: (t: string, f: () => void, o: boolean) => void; removeEventListener?: (t: string, f: () => void, o: boolean) => void } | null;
    if (!el?.addEventListener) return;
    const ouvir = () => tocouRef.current();
    el.addEventListener('click', ouvir, true);
    return () => el.removeEventListener?.('click', ouvir, true);
  }, []);
  return (
    <View ref={ref} collapsable={false} style={style} onTouchEnd={Platform.OS === 'web' ? undefined : tocou}>
      {children}
    </View>
  );
}
