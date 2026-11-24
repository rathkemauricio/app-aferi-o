import { usePathname } from 'expo-router';
import { useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { consentimento, definirConsentimento, ehPaginaDoSite, GA_ID, registrarPagina } from '../../lib/analytics';

/**
 * Medição do site (Google Analytics 4): registra as páginas públicas visitadas e mostra o aviso de cookies de análise
 * (aceitar ou recusar) enquanto o visitante não escolheu. Fora do site (área logada) não faz nada.
 */
export function AnalyticsDoSite() {
  const rota = usePathname();
  const doSite = Platform.OS === 'web' && !!GA_ID && ehPaginaDoSite(rota);
  const [escolha, setEscolha] = useState(consentimento);
  useEffect(() => { if (doSite && escolha === 'aceito') registrarPagina(rota); }, [rota, doSite, escolha]);
  if (!doSite || escolha) return null;
  const escolher = (v: 'aceito' | 'recusado') => { definirConsentimento(v); setEscolha(v); };
  return (
    <View style={st.faixa} accessibilityRole="alert">
      <Text style={st.texto}>
        Usamos cookies de análise (Google Analytics) para saber quantas pessoas visitam o site e melhorar as páginas. Nada de anúncios.
      </Text>
      <View style={st.botoes}>
        <Pressable accessibilityRole="button" onPress={() => escolher('recusado')} style={({ pressed }) => [st.botao, st.recusar, pressed && { opacity: 0.7 }]}>
          <Text style={st.recusarTxt}>Recusar</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={() => escolher('aceito')} style={({ pressed }) => [st.botao, st.aceitar, pressed && { opacity: 0.8 }]}>
          <Text style={st.aceitarTxt}>Aceitar</Text>
        </Pressable>
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  faixa: {
    position: 'absolute', left: 16, right: 16, bottom: 16, maxWidth: 720, alignSelf: 'center', marginHorizontal: 'auto',
    backgroundColor: '#0f1f3d', borderRadius: 14, padding: 16, gap: 12, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center',
    shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, zIndex: 50,
  },
  texto: { flex: 1, minWidth: 220, color: '#e8eef8', fontSize: 13.5, lineHeight: 19 },
  botoes: { flexDirection: 'row', gap: 8 },
  botao: { height: 40, paddingHorizontal: 18, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  recusar: { borderWidth: 1, borderColor: 'rgba(255,255,255,0.35)' },
  recusarTxt: { color: '#e8eef8', fontWeight: '700' },
  aceitar: { backgroundColor: '#5fd39a' },
  aceitarTxt: { color: '#0f1f3d', fontWeight: '800' },
});
