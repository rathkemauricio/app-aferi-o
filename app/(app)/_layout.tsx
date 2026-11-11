import { Stack } from 'expo-router';
import { useContext, useEffect } from 'react';
import { AppState } from 'react-native';
import { isSupabaseConfigured } from '../../lib/supabase';
import { flushAll, setSyncEnabled, syncAll } from '../../lib/sync';
import { ThemeContext } from '../../ui/theme';

/** Área logada: liga a sincronização (ao entrar, ao voltar ao app e a cada minuto, se houver pendências). */
export default function AppLayout() {
  const { colors } = useContext(ThemeContext);
  useEffect(() => {
    if (!isSupabaseConfigured) return;
    setSyncEnabled(true);
    void syncAll();
    const app = AppState.addEventListener('change', s => { if (s === 'active') void syncAll(); else void flushAll(); });
    const timer = setInterval(() => { void flushAll(); }, 60_000);
    return () => { app.remove(); clearInterval(timer); void flushAll(); setSyncEnabled(false); };
  }, []);
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }} />;
}
