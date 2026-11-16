import { type ReactNode, useContext, useMemo, useState } from 'react';
import { useWindowDimensions, View } from 'react-native';
import { SafeAreaInsetsContext, useSafeAreaInsets } from 'react-native-safe-area-context';
import { ThemeContext } from './theme';

/**
 * Amplia (ou reduz) o app inteiro por igual — fontes, ícones e espaçamentos — conforme a escala escolhida
 * em Minha conta. Funciona como o zoom do navegador: a área interna é desenhada menor e escalada para caber
 * na tela, então os layouts se reorganizam sozinhos. A estrutura é sempre a mesma (trocar a escala não
 * desmonta as telas). As áreas seguras são divididas pela escala para não crescerem junto.
 */
export function Zoom({ children }: { children: ReactNode }) {
  const { escala: s } = useContext(ThemeContext);
  const insets = useSafeAreaInsets();
  const [tam, setTam] = useState<{ w: number; h: number } | null>(null);
  const ajustados = useMemo(() => ({ top: insets.top / s, bottom: insets.bottom / s, left: insets.left / s, right: insets.right / s }), [insets, s]);
  const interno = tam
    ? (() => {
      const w = tam.w / s, h = tam.h / s;
      // Escala a partir do centro e desloca para o canto superior esquerdo (não depende de transformOrigin).
      return { width: w, height: h, transform: [{ translateX: (w * (s - 1)) / 2 }, { translateY: (h * (s - 1)) / 2 }, { scale: s }] };
    })()
    : { flex: 1 };
  return (
    <View style={{ flex: 1, overflow: 'hidden' }} onLayout={e => { const { width, height } = e.nativeEvent.layout; setTam(t => (t && t.w === width && t.h === height ? t : { w: width, h: height })); }}>
      <View style={interno}>
        <SafeAreaInsetsContext.Provider value={ajustados}>{children}</SafeAreaInsetsContext.Provider>
      </View>
    </View>
  );
}

/** Como useWindowDimensions, mas no tamanho da área ampliada (largura/altura divididas pela escala). */
export function useTela() {
  const d = useWindowDimensions();
  const { escala } = useContext(ThemeContext);
  return useMemo(() => ({ ...d, width: d.width / escala, height: d.height / escala }), [d, escala]);
}
