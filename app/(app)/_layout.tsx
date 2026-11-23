import { Stack, usePathname, useRouter } from 'expo-router';
import { useContext, useEffect, useState } from 'react';
import { AppState, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DesktopShell } from '../../components/DesktopShell';
import { useAuth } from '../../lib/auth';
import { acompanhando, usePresenca } from '../../lib/presenca';
import { isSupabaseConfigured } from '../../lib/supabase';
import { flushAll, setAvisoSomenteLeitura, setSyncEnabled, syncAll } from '../../lib/sync';
import { EyeIcon } from '../../ui/icons';
import { notify } from '../../ui/kit';
import { ThemeContext } from '../../ui/theme';

/** Área logada: liga a sincronização (ao entrar, ao voltar ao app e a cada minuto, se houver pendências). */
export default function AppLayout() {
  const { colors } = useContext(ThemeContext);
  const pathname = usePathname();
  usePresenca(pathname);
  useEffect(() => {
    if (!isSupabaseConfigured) return;
    setSyncEnabled(true);
    void syncAll();
    const app = AppState.addEventListener('change', s => { if (s === 'active') void syncAll(); else void flushAll(); });
    const timer = setInterval(() => { void flushAll(); }, 60_000);
    // Acompanhando a coleta de outra pessoa (lista "Quem está online"): traz as novidades a cada 15 s.
    const vivo = setInterval(() => { if (acompanhando()) void syncAll(); }, 15_000);
    return () => { app.remove(); clearInterval(timer); clearInterval(vivo); void flushAll(); setSyncEnabled(false); };
  }, []);
  useEffect(() => {
    setAvisoSomenteLeitura(() => notify('Visita só para ver', 'Você está nesta rede como auditor e não pode alterar nada. Para trabalhar, saia da visita na faixa do alto.', { tom: 'info' }));
    return () => setAvisoSomenteLeitura(null);
  }, []);
  const stack = <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }} />;
  const conteudo = <View style={s.flex}><FaixaVisita />{stack}</View>;
  return Platform.OS === 'web' ? <DesktopShell>{conteudo}</DesktopShell> : conteudo;
}

/** Faixa no alto enquanto o dono da plataforma visita outra rede como auditor (só leitura). */
function FaixaVisita() {
  const { visita, visitar } = useAuth();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [saindo, setSaindo] = useState(false);
  if (!visita) return null;
  const sair = async () => {
    setSaindo(true);
    const erro = await visitar(null);
    setSaindo(false);
    if (erro) { notify('Não deu para sair da visita', erro); return; }
    router.replace('/plataforma');
  };
  return (
    <View style={[s.faixa, { backgroundColor: '#9a5b00', paddingTop: Platform.OS === 'web' ? 8 : insets.top + 6 }]}>
      <EyeIcon size={18} color="#fff" />
      <Text style={s.texto} numberOfLines={2}>Visitando <Text style={s.forte}>{visita.nome}</Text> como auditor · só para ver</Text>
      <Pressable accessibilityRole="button" onPress={() => { void sair(); }} disabled={saindo} style={({ pressed }) => [s.botao, pressed && { opacity: 0.7 }]}>
        <Text style={s.botaoTexto}>{saindo ? 'Saindo…' : 'Sair da visita'}</Text>
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  flex: { flex: 1 },
  faixa: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingBottom: 8 },
  texto: { flex: 1, color: '#fff', fontSize: 13 },
  forte: { fontWeight: '700' },
  botao: { backgroundColor: 'rgba(255,255,255,0.22)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999 },
  botaoTexto: { color: '#fff', fontWeight: '700', fontSize: 13 },
});
