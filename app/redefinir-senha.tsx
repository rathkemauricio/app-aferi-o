import * as Linking from 'expo-linking';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AuthInput, C, isStrongPassword, PasswordStrength, traduzirErro } from '../components/AuthScreen';
import { supabase } from '../lib/supabase';
import { LockSimpleIcon } from '../ui/icons';

type Fase = 'verificando' | 'pronto' | 'invalido' | 'concluido';

/** Lê os parâmetros do link de recuperação (fragmento #... ou query ?...). */
function parametros(url: string | null) {
  const out: Record<string, string> = {};
  if (!url) return out;
  const partes = [url.split('#')[1] ?? '', (url.split('?')[1] ?? '').split('#')[0]];
  partes.forEach(p => p.split('&').forEach(kv => { const [k, v] = kv.split('='); if (k) out[decodeURIComponent(k)] = decodeURIComponent((v ?? '').replace(/\+/g, ' ')); }));
  return out;
}

/** Tela aberta pelo link "Esqueci a senha": cria a sessão de recuperação e define a nova senha. */
export default function RedefinirSenha() {
  const router = useRouter();
  // useLinkingURL (e não useURL): já começa com o ÚLTIMO link recebido. Com o app aberto, o link do e-mail
  // chega antes desta tela montar; o useURL só conhece o link que abriu o app e perdia os tokens.
  const urlNativa = Linking.useLinkingURL();
  const [fase, setFase] = useState<Fase>('verificando');
  const [motivo, setMotivo] = useState('');
  const [senha, setSenha] = useState('');
  const [confirma, setConfirma] = useState('');
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState('');

  useEffect(() => {
    if (!supabase) { setFase('invalido'); setMotivo('O app está no modo local, sem servidor de contas.'); return; }
    const client = supabase;
    const url = Platform.OS === 'web' && typeof window !== 'undefined' ? window.location.href : urlNativa;
    const p = parametros(url);
    let atual = true; // ignora o resultado se chegar outro link enquanto este é verificado
    void (async () => {
      try {
        if (p.error_description || p.error) throw new Error(p.error_description || p.error);
        if (p.access_token && p.refresh_token) {
          const { error } = await client.auth.setSession({ access_token: p.access_token, refresh_token: p.refresh_token });
          if (error) throw error;
        } else if (p.code) {
          const { error } = await client.auth.exchangeCodeForSession(p.code);
          if (error) throw error;
        }
        const { data } = await client.auth.getSession();
        if (!data.session) throw new Error('sem-sessao');
        if (!atual) return;
        // Remove os tokens da barra de endereço do navegador.
        if (Platform.OS === 'web' && typeof window !== 'undefined') window.history.replaceState(null, '', window.location.pathname);
        setFase('pronto');
      } catch (e) {
        if (!atual) return;
        const m = e instanceof Error ? e.message : '';
        setMotivo(m === 'sem-sessao' || !m ? 'O link é inválido ou já foi usado. Peça um novo link em "Esqueci a senha".' : m.toLowerCase().includes('expired') ? 'O link expirou. Peça um novo link em "Esqueci a senha".' : traduzirErro({ message: m }));
        setFase('invalido');
      }
    })();
    return () => { atual = false; };
  }, [urlNativa]);

  const pode = isStrongPassword(senha) && senha === confirma && !busy;
  const salvar = async () => {
    if (!supabase || !pode) return;
    setBusy(true); setErro('');
    const { error } = await supabase.auth.updateUser({ password: senha });
    setBusy(false);
    if (error) setErro(traduzirErro(error)); else setFase('concluido');
  };
  const irParaLogin = async () => { await supabase?.auth.signOut(); router.replace('/login'); };

  return (
    <SafeAreaView style={st.safe}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={st.scroll} keyboardShouldPersistTaps="handled">
          <View style={st.card}>
            <View style={st.icon}><LockSimpleIcon size={26} color={C.accent} weight="duotone" /></View>
            <Text style={st.title} accessibilityRole="header">Redefinir senha</Text>

            {fase === 'verificando' && <><ActivityIndicator color={C.accent} /><Text style={st.sub}>Verificando o link…</Text></>}

            {fase === 'invalido' && <>
              <Text style={st.sub}>{motivo}</Text>
              <Pressable style={st.btn} onPress={() => void irParaLogin()}><Text style={st.btnText}>Voltar para o login</Text></Pressable>
            </>}

            {fase === 'pronto' && <>
              <Text style={st.sub}>Crie uma senha forte para proteger sua conta.</Text>
              <AuthInput label="Nova senha" leading={<LockSimpleIcon size={18} color={C.accent} />} secure value={senha} onChangeText={setSenha}
                placeholder="Digite sua nova senha" autoComplete="new-password" textContentType="newPassword" />
              <PasswordStrength value={senha} />
              <AuthInput label="Confirmar nova senha" leading={<LockSimpleIcon size={18} color={C.accent} />} secure value={confirma} onChangeText={setConfirma}
                invalid={confirma.length > 0 && confirma !== senha} placeholder="Confirme sua nova senha" autoComplete="new-password" textContentType="newPassword"
                onSubmitEditing={() => void salvar()} />
              {confirma.length > 0 && <Text style={{ color: confirma === senha ? C.ok : C.error, fontSize: 12, marginTop: 6 }}>{confirma === senha ? 'As senhas coincidem' : 'As senhas não coincidem'}</Text>}
              {erro ? <Text style={st.erro}>{erro}</Text> : null}
              <Pressable style={[st.btn, !pode && { opacity: 0.4 }]} disabled={!pode} onPress={() => void salvar()} accessibilityRole="button">
                {busy ? <ActivityIndicator color="#fff" /> : <Text style={st.btnText}>Alterar senha</Text>}
              </Pressable>
            </>}

            {fase === 'concluido' && <>
              <Text style={st.sub}>Senha alterada. Você já está conectado com a nova senha.</Text>
              <Pressable style={st.btn} onPress={() => router.replace('/')}><Text style={st.btnText}>Continuar</Text></Pressable>
            </>}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  scroll: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  card: { width: '100%', maxWidth: 420, backgroundColor: C.panel, borderRadius: 20, borderWidth: 1, borderColor: C.border, padding: 24, gap: 6 },
  icon: { alignSelf: 'center', width: 52, height: 52, borderRadius: 14, backgroundColor: 'rgba(165,180,252,0.12)', alignItems: 'center', justifyContent: 'center' },
  title: { color: C.text, fontSize: 22, fontWeight: '800', textAlign: 'center', marginTop: 8 },
  sub: { color: C.muted, fontSize: 13, textAlign: 'center', marginTop: 4, marginBottom: 8, lineHeight: 19 },
  erro: { color: C.error, fontSize: 12, marginTop: 12, textAlign: 'center' },
  btn: { marginTop: 20, height: 46, borderRadius: 10, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center' },
  btnText: { color: '#fff', fontSize: 14, fontWeight: '800' },
});
