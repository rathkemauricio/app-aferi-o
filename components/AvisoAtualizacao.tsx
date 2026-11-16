import * as Updates from 'expo-updates';
import { useEffect, useRef } from 'react';
import { AppState, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/**
 * Atualizações automáticas (EAS Update): o app procura ao abrir e ao voltar para a tela (no máximo a cada
 * 15 minutos). Quando uma atualização termina de baixar, mostra a faixa "Atualização pronta" — um toque
 * reinicia o app já atualizado. Sem o toque, ela entra sozinha na próxima vez que o app for aberto.
 */
const INTERVALO = 15 * 60 * 1000;

export function AvisoAtualizacao() {
  const ativo = Platform.OS !== 'web' && Updates.isEnabled && !__DEV__;
  const { isUpdatePending } = Updates.useUpdates();
  const ultima = useRef(0);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (!ativo) return;
    const procurar = async () => {
      if (Date.now() - ultima.current < INTERVALO) return;
      ultima.current = Date.now();
      try {
        const r = await Updates.checkForUpdateAsync();
        if (r.isAvailable) await Updates.fetchUpdateAsync();
      } catch { /* sem internet: tenta na próxima */ }
    };
    void procurar();
    const sub = AppState.addEventListener('change', s => { if (s === 'active') void procurar(); });
    return () => sub.remove();
  }, [ativo]);

  if (!ativo || !isUpdatePending) return null;
  return (
    <View pointerEvents="box-none" style={[StyleSheet.absoluteFill, { justifyContent: 'flex-end', paddingBottom: Math.max(insets.bottom, 12) + 70, paddingHorizontal: 16 }]}>
      <Pressable accessibilityRole="button" accessibilityLabel="Atualização pronta. Toque para atualizar o app agora." onPress={() => void Updates.reloadAsync()}
        style={({ pressed }) => [st.faixa, pressed && { opacity: 0.85 }]}>
        <Text style={st.tit}>Atualização pronta</Text>
        <Text style={st.txt}>Toque aqui para atualizar o app agora</Text>
      </Pressable>
    </View>
  );
}

const st = StyleSheet.create({
  faixa: { backgroundColor: '#1e9e55', borderRadius: 14, paddingVertical: 12, paddingHorizontal: 16, alignItems: 'center', elevation: 6, shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 8, shadowOffset: { width: 0, height: 3 } },
  tit: { color: '#fff', fontSize: 17, fontWeight: '800' },
  txt: { color: '#eafff2', fontSize: 14, fontWeight: '600' },
});
