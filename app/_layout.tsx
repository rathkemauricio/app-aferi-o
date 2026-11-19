import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { type ReactNode, useContext, useMemo } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { AuthProvider, useAuth } from '../lib/auth';
import { isSupabaseConfigured } from '../lib/supabase';
import { AvisosHost } from '../ui/avisos';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { TUTORIAIS } from '../lib/tutoriais';
import { armazenamentoAsync, TutorialProvider } from '../tutoriais';
import { SheetHost } from '../ui/kit';
import { ThemeContext, ThemeProvider } from '../ui/theme';
import { Zoom } from '../ui/zoom';
import { AvisoAtualizacao } from '../components/AvisoAtualizacao';
import { SemServidor } from '../components/SemServidor';

// Evita que o navegador trate a página como inglês e ofereça/aplique tradução automática.
if (Platform.OS === 'web' && typeof document !== 'undefined') {
  document.documentElement.lang = 'pt-BR';
  document.documentElement.setAttribute('translate', 'no');
}

/**
 * Casca do app com rotas protegidas:
 * - sem sessão: o site (/inicio, /como-funciona, /comecar) e /login (e /redefinir-senha, aberta pelo link do e-mail);
 * - com sessão, conta não liberada: /aguardando;
 * - conta liberada: área (app) com a central e os módulos.
 * Sem servidor configurado não há "modo local": a tela fica bloqueada (é preciso saber quem faz cada atividade).
 */
function Shell() {
  const { mode, colors } = useContext(ThemeContext);
  const { ready, userEmail, ativo, perfilPronto } = useAuth();
  if (!isSupabaseConfigured) return <SemServidor />;
  const logado = !isSupabaseConfigured || !!userEmail;
  const liberado = !isSupabaseConfigured || (logado && ativo);
  // Visitante: no navegador vê o site; no app do celular vai direto para o login.
  const paraVisitante = Platform.OS === 'web' ? '/inicio' : '/login';

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
      {/* Destinos explícitos quando a guarda falha (o padrão do Expo Router é a primeira rota livre pelo nome do arquivo). */}
      <Stack.Protected guard={liberado} redirectTo={logado ? '/aguardando' : paraVisitante}>
        <Stack.Screen name="(app)" />
      </Stack.Protected>
      <Stack.Protected guard={logado && !liberado} redirectTo={logado ? '/' : paraVisitante}>
        <Stack.Screen name="aguardando" />
      </Stack.Protected>
      <Stack.Protected guard={!logado} redirectTo={liberado ? '/' : '/aguardando'}>
        {/* Site público (visitante): apresentação e cadastro da empresa; o endereço raiz cai aqui. */}
        <Stack.Screen name="inicio" />
        <Stack.Screen name="como-funciona" />
        <Stack.Screen name="comecar" />
        <Stack.Screen name="login" />
      </Stack.Protected>
      <Stack.Screen name="redefinir-senha" />
    </Stack>
  </>;
}

const ARMAZENAMENTO_TUTORIAIS = armazenamentoAsync(AsyncStorage);

/** Tutoriais interativos (pasta tutoriais/) com as cores do tema do app. Fica por fora do Zoom: o destaque mede a tela real. */
function Tutoriais({ children }: { children: ReactNode }) {
  const { colors } = useContext(ThemeContext);
  const tema = useMemo(() => ({ cartao: colors.surface, borda: colors.border, texto: colors.text, textoSuave: colors.textMuted, destaque: colors.accent, sobreDestaque: colors.primaryText }), [colors]);
  return <TutorialProvider tutoriais={TUTORIAIS} armazenamento={ARMAZENAMENTO_TUTORIAIS} chave="easyaudit.tutoriais.vistos.v1" tema={tema}>{children}</TutorialProvider>;
}

export default function RootLayout() {
  // GestureHandlerRootView: necessário para os gestos (ex.: deslizar atividade em Tempos e Movimentos).
  // KeyboardAvoidingView global: no Android (edge-to-edge, obrigatório no RN atual) a janela não encolhe sozinha
  // quando o teclado abre. Aqui o app inteiro ganha um espaço do tamanho do teclado embaixo, então as telas encolhem,
  // a rolagem continua funcionando e a ScrollView leva o campo em foco para cima do teclado.
  // Zoom: tamanho de fontes e ícones escolhido em Minha conta (o app inteiro, inclusive as janelas Sheet).
  // SheetHost: desenha as janelas (Sheet) dentro dessa área, para que elas também subam com o teclado.
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider>
        <AuthProvider>
          <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'web' ? undefined : 'padding'}>
            <Tutoriais>
            <Zoom>
              <SheetHost>
                <Shell />
              </SheetHost>
              <AvisoAtualizacao />
              {/* Toasts e confirmações do app (no lugar do alert/confirm do navegador e do Alert do Android). */}
              <AvisosHost />
            </Zoom>
            </Tutoriais>
          </KeyboardAvoidingView>
        </AuthProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
