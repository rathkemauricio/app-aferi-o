import * as Linking from 'expo-linking';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AuthInput, C, isStrongPassword, PasswordStrength, traduzirErro } from '../components/AuthScreen';
import { supabase } from '../lib/supabase';
import { Logo } from '../components/Logo';
import { CheckCircleIcon, LockSimpleIcon, WarningCircleIcon } from '../ui/icons';

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
        setMotivo(m === 'sem-sessao' || !m ? 'Este link já foi usado ou não é válido. Cada link do e-mail funciona uma vez só: peça um novo e use o e-mail mais recente.' : m.toLowerCase().includes('expired') ? 'O link expirou (ele vale por pouco tempo). Peça um novo e abra o e-mail mais recente.' : traduzirErro({ message: m }));
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
  /** Volta ao login (com `novoLink`, já na tela de recuperar o acesso). */
  const irParaLogin = async (novoLink: boolean) => {
    await supabase?.auth.signOut();
    if (novoLink && Platform.OS === 'web' && typeof window !== 'undefined') window.location.assign('/login?recuperar=1');
    else router.replace('/login');
  };

  // Convite (conta nova) ou troca de senha: muda só o texto.
  const convite = (Platform.OS === 'web' && typeof window !== 'undefined' ? window.location.href : urlNativa ?? '').includes('convite=1');
  const titulo = fase === 'concluido' ? (convite ? 'Tudo pronto!' : 'Senha alterada!') : convite ? 'Crie a sua senha' : 'Criar nova senha';
  const icone = fase === 'concluido' ? <CheckCircleIcon size={30} color={C.accent} weight="fill" />
    : fase === 'invalido' ? <WarningCircleIcon size={30} color={C.error} weight="duotone" />
    : <LockSimpleIcon size={28} color={C.accent} weight="duotone" />;

  return (
    <SafeAreaView style={st.safe} edges={['top']}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={st.scroll} keyboardShouldPersistTaps="handled">
        <View style={st.topo}>
          <Logo claro altura={24} />
        </View>
        <View style={st.faixaMenta} />
        <View style={st.card}>
          <View style={[st.icon, fase === 'invalido' && { backgroundColor: 'rgba(192,54,44,0.1)' }]}>{icone}</View>
          <Text style={st.title} accessibilityRole="header">{titulo}</Text>

          {fase === 'verificando' && <><ActivityIndicator color={C.accent} style={{ marginTop: 12 }} /><Text style={st.sub}>Conferindo o link do e-mail…</Text></>}

          {fase === 'invalido' && <>
            <Text style={st.sub}>{motivo}</Text>
            <Pressable style={({ pressed }) => [st.btn, pressed && { opacity: 0.85 }]} onPress={() => void irParaLogin(true)} accessibilityRole="button"><Text style={st.btnText}>Pedir um novo link</Text></Pressable>
            <Pressable style={st.linkBox} onPress={() => void irParaLogin(false)} accessibilityRole="link" hitSlop={8}><Text style={st.link}>Voltar para o login</Text></Pressable>
          </>}

          {fase === 'pronto' && <>
            <Text style={st.sub}>{convite ? 'Bem-vindo ao EasyAudit! Crie uma senha forte para a sua conta.' : 'Escolha uma senha forte. Ela passa a valer no app e no painel web.'}</Text>
            <AuthInput label={convite ? 'Senha' : 'Nova senha'} leading={<LockSimpleIcon size={18} color={C.accent} />} secure value={senha} onChangeText={setSenha}
              placeholder="Digite a senha" autoComplete="new-password" textContentType="newPassword" />
            <PasswordStrength value={senha} />
            <AuthInput label="Confirmar a senha" leading={<LockSimpleIcon size={18} color={C.accent} />} secure value={confirma} onChangeText={setConfirma}
              invalid={confirma.length > 0 && confirma !== senha} placeholder="Repita a senha" autoComplete="new-password" textContentType="newPassword"
              onSubmitEditing={() => void salvar()} />
            {confirma.length > 0 && <Text style={{ color: confirma === senha ? C.ok : C.error, fontSize: 12, marginTop: 6 }}>{confirma === senha ? 'As senhas coincidem' : 'As senhas não coincidem'}</Text>}
            {erro ? <Text style={st.erro}>{erro}</Text> : null}
            <Pressable style={({ pressed }) => [st.btn, !pode && { opacity: 0.4 }, pressed && pode && { opacity: 0.85 }]} disabled={!pode} onPress={() => void salvar()} accessibilityRole="button">
              {busy ? <ActivityIndicator color="#fff" /> : <Text style={st.btnText}>{convite ? 'Criar senha e entrar' : 'Salvar nova senha'}</Text>}
            </Pressable>
          </>}

          {fase === 'concluido' && <>
            <Text style={st.sub}>{convite ? 'A sua senha foi criada e você já está conectado.' : 'A nova senha já vale. Você já está conectado.'} No celular, entre no app EasyAudit com o seu e-mail e esta senha.</Text>
            <Pressable style={({ pressed }) => [st.btn, pressed && { opacity: 0.85 }]} onPress={() => router.replace('/')} accessibilityRole="button"><Text style={st.btnText}>Abrir o EasyAudit</Text></Pressable>
          </>}
        </View>
        <Text style={st.rodape}>EasyAudit · auditorias, contagens e aferições sem papel</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.navy },
  scroll: { flexGrow: 1, alignItems: 'center', backgroundColor: C.bg, paddingBottom: 32 },
  topo: { width: '100%', backgroundColor: C.navy, alignItems: 'center', paddingTop: 28, paddingBottom: 72 },
  faixaMenta: { width: '100%', height: 4, backgroundColor: C.mint },
  card: { width: '92%', maxWidth: 440, marginTop: -52, backgroundColor: C.panel, borderRadius: 22, borderWidth: 1, borderColor: C.border, paddingHorizontal: 24, paddingTop: 26, paddingBottom: 24, gap: 6, boxShadow: '0 24px 60px rgba(15, 31, 61, 0.16)' },
  icon: { alignSelf: 'center', width: 60, height: 60, borderRadius: 18, backgroundColor: 'rgba(95,211,154,0.16)', alignItems: 'center', justifyContent: 'center' },
  title: { color: C.text, fontSize: 24, fontWeight: '800', textAlign: 'center', marginTop: 10, letterSpacing: -0.3 },
  sub: { color: C.muted, fontSize: 13.5, textAlign: 'center', marginTop: 4, marginBottom: 10, lineHeight: 20 },
  erro: { color: C.error, fontSize: 12.5, marginTop: 12, textAlign: 'center' },
  btn: { marginTop: 20, height: 50, borderRadius: 999, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center' },
  btnText: { color: '#fff', fontSize: 15, fontWeight: '800' },
  linkBox: { alignSelf: 'center', marginTop: 14, paddingVertical: 4 },
  link: { color: C.accent, fontSize: 13.5, fontWeight: '700' },
  rodape: { color: C.faint, fontSize: 12, marginTop: 22, textAlign: 'center' },
});
