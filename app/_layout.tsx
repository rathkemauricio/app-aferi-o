import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useContext } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { AuthProvider, useAuth } from '../lib/auth';
import { isSupabaseConfigured } from '../lib/supabase';
import { SheetHost } from '../ui/kit';
import { ThemeContext, ThemeProvider } from '../ui/theme';

// Evita que o navegador trate a página como inglês e ofereça/aplique tradução automática.
if (Platform.OS === 'web' && typeof document !== 'undefined') {
  document.documentElement.lang = 'pt-BR';
  document.documentElement.setAttribute('translate', 'no');
}

/**
 * Casca do app com rotas protegidas:
 * - sem sessão: só /login (e /redefinir-senha, aberta pelo link do e-mail);
 * - com sessão, conta não liberada: /aguardando;
 * - conta liberada (ou modo local sem Supabase): área (app) com a central e os módulos.
 */
function Shell() {
  const { mode, colors } = useContext(ThemeContext);
  const { ready, userEmail, ativo, perfilPronto } = useAuth();
  const logado = !isSupabaseConfigured || !!userEmail;
  const liberado = !isSupabaseConfigured || (logado && ativo);

  if (!ready || (userEmail && !perfilPronto)) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg }}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  return <>
    <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
      <Stack.Protected guard={liberado}>
        <Stack.Screen name="(app)" />
      </Stack.Protected>
      <Stack.Protected guard={logado && !liberado}>
        <Stack.Screen name="aguardando" />
      </Stack.Protected>
      <Stack.Protected guard={!logado}>
        <Stack.Screen name="login" />
      </Stack.Protected>
      <Stack.Screen name="redefinir-senha" />
    </Stack>
  </>;
}

export default function RootLayout() {
  // GestureHandlerRootView: necessário para os gestos (ex.: deslizar atividade em Tempos e Movimentos).
  // KeyboardAvoidingView global: no Android (edge-to-edge, obrigatório no RN atual) a janela não encolhe sozinha
  // quando o teclado abre. Aqui o app inteiro ganha um espaço do tamanho do teclado embaixo, então as telas encolhem,
  // a rolagem continua funcionando e a ScrollView leva o campo em foco para cima do teclado.
  // SheetHost: desenha as janelas (Sheet) dentro dessa área, para que elas também subam com o teclado.
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider>
        <AuthProvider>
          <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'web' ? undefined : 'padding'}>
            <SheetHost>
              <Shell />
            </SheetHost>
          </KeyboardAvoidingView>
        </AuthProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
