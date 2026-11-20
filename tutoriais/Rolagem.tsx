import { type ComponentRef, forwardRef, useEffect, useRef } from 'react';
import { ScrollView, type ScrollViewProps } from 'react-native';
import { useTutorialOpcional } from './contexto';

/**
 * ScrollView que o tutorial sabe rolar: quando o elemento explicado está fora da parte visível, o tutorial rola
 * esta área até ele. Use no lugar de ScrollView nas telas com <Alvo> (aceita as mesmas propriedades).
 * Fora de um <TutorialProvider> é um ScrollView comum.
 */
type Instancia = ComponentRef<typeof ScrollView>;
export const RolagemTutorial = forwardRef<Instancia, ScrollViewProps>(function RolagemTutorial(props, refExterna) {
  const ctx = useTutorialOpcional();
  const ref = useRef<Instancia | null>(null);
  const y = useRef(0);
  useEffect(() => {
    if (!ctx) return;
    const item = { ref, posicao: () => y.current };
    ctx.registrarRolagem(item);
    return () => ctx.removerRolagem(item);
  }, [ctx]);
  return (
    <ScrollView
      {...props}
      ref={no => {
        ref.current = no;
        if (typeof refExterna === 'function') refExterna(no); else if (refExterna) refExterna.current = no;
      }}
      scrollEventThrottle={props.scrollEventThrottle ?? 16}
      onScroll={e => { y.current = e.nativeEvent.contentOffset.y; props.onScroll?.(e); }}
    />
  );
});
