import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, FadeInDown, useReducedMotion } from 'react-native-reanimated';
import { isStrongPassword, PASSWORD_RULES } from '../components/AuthScreen';
import { BotaoSite, Faixa, SiteFooter, SiteNav, SiteTema, useSite } from '../components/site/SiteChrome';
import { pedirAcesso } from '../lib/acesso';
import { emailValido } from '../lib/email';
import { supabase } from '../lib/supabase';
import { CheckCircleIcon, EnvelopeIcon, WarningCircleIcon } from '../ui/icons';
import { Field } from '../ui/kit';
import type { ThemeColors } from '../ui/theme';

const EASE = Easing.bezier(0.23, 1, 0.32, 1);

/** O que acontece depois do cadastro (o plano e os módulos são combinados na liberação). */
const PASSOS = [
  'Confirme o e-mail pelo link que enviamos.',
  'Entre com o e-mail e a senha: a rede fica aguardando a liberação.',
  'Quando a rede for liberada, você recebe um aviso e convida a equipe.',
];

/**
 * Cadastro da rede pelo site: dados da empresa e o acesso do administrador (sem escolha de plano: o servidor usa o
 * plano padrão e o dono do EasyAudit ajusta contas e módulos ao liberar).
 * Cria a conta (com confirmação por e-mail) e guarda os dados da empresa na própria conta; no primeiro acesso,
 * a empresa é criada aguardando a liberação do dono do EasyAudit (função "empresas", ação "criar").
 */
export default function Comecar() {
  return <SiteTema><Formulario /></SiteTema>;
}

function Formulario() {
  const router = useRouter();
  const { c: colors, desktop } = useSite();
  const s = useMemo(() => estilos(colors, desktop), [colors, desktop]);
  const reduz = useReducedMotion();

  const [f, setF] = useState({ empresa: '', documento: '', telefone: '', nome: '', email: '', senha: '' });
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [enviadoPara, setEnviadoPara] = useState<string | null>(null);
  const campo = (k: keyof typeof f) => (v: string) => { setF(x => ({ ...x, [k]: v })); setErro(''); };

  const enviar = async () => {
    if (!supabase || enviando) return;
    const email = f.email.trim().toLowerCase();
    if (f.empresa.trim().length < 2) { setErro('Informe o nome da empresa.'); return; }
    if (!f.nome.trim()) { setErro('Informe o seu nome (aparece nos registros e relatórios).'); return; }
    if (!emailValido(email)) { setErro('Confira o e-mail digitado.'); return; }
    if (!isStrongPassword(f.senha)) { setErro(`A senha precisa ter: ${PASSWORD_RULES.filter(r => !r.test(f.senha)).map(r => r.label.toLowerCase()).join(', ')}.`); return; }
    setEnviando(true);
    try {
      // Pelo servidor: o e-mail de confirmação sai no layout do EasyAudit, com o link na web.
      const erro = await pedirAcesso({
        acao: 'cadastrar', senha: f.senha,
        dados: { nome: f.nome.trim(), empresa_pendente: { nome: f.empresa.trim(), documento: f.documento.trim(), telefone: f.telefone.trim() } },
      }, email);
      if (erro) { setErro(erro); return; }
      setEnviadoPara(email);
    } catch {
      setErro('Sem conexão com o servidor. Verifique a internet e tente de novo.');
    } finally {
      setEnviando(false);
    }
  };

  if (enviadoPara) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <SiteNav />
        <ScrollView contentContainerStyle={{ flexGrow: 1 }}>
          <Faixa style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 72, gap: 14 }}>
            <Animated.View entering={reduz ? undefined : FadeInDown.duration(380).easing(EASE)} style={{ alignItems: 'center', gap: 14, maxWidth: 460 }}>
              <View style={s.selo}><EnvelopeIcon size={28} color={colors.accentText} weight="duotone" /></View>
              <Text style={[s.h1, { textAlign: 'center' }]}>Confirme o seu e-mail</Text>
              <Text style={[s.corpo, { textAlign: 'center' }]}>
                Enviamos um link para {enviadoPara}. Depois de confirmar, entre com esse e-mail e a sua senha: a {f.empresa.trim()} é cadastrada e fica aguardando a liberação do EasyAudit.
              </Text>
              <BotaoSite titulo="Ir para o login" grande onPress={() => router.replace('/login')} />
            </Animated.View>
          </Faixa>
          <SiteFooter />
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <SiteNav />
      <ScrollView keyboardShouldPersistTaps="handled">
        <Faixa style={s.pagina}>
          <Animated.View entering={reduz ? undefined : FadeInDown.duration(380).easing(EASE)} style={s.form}>
            <Text style={s.h1} accessibilityRole="header">Comece agora</Text>
            <Text style={s.corpo}>Cadastre a sua rede de postos no EasyAudit. Você vira o administrador e convida a sua equipe depois da liberação.</Text>

            <Text style={s.grupo}>Empresa</Text>
            <Field label="Nome da empresa" value={f.empresa} onChangeText={campo('empresa')} placeholder="Ex.: Rede de Postos Horizonte" maxLength={120} />
            <View style={[s.linha, !desktop && { flexDirection: 'column' }]}>
              <View style={{ flex: 1 }}><Field label="CNPJ (opcional)" value={f.documento} onChangeText={campo('documento')} keyboardType="numbers-and-punctuation" maxLength={30} /></View>
              <View style={{ flex: 1 }}><Field label="Telefone (opcional)" value={f.telefone} onChangeText={campo('telefone')} keyboardType="phone-pad" maxLength={30} /></View>
            </View>

            <Text style={s.grupo}>Seu acesso de administrador</Text>
            <Field label="Seu nome" value={f.nome} onChangeText={campo('nome')} placeholder="Como aparece nos registros e relatórios" maxLength={80} autoComplete="name" />
            <Field label="E-mail" value={f.email} onChangeText={campo('email')} placeholder="voce@empresa.com.br" keyboardType="email-address" autoCapitalize="none" autoComplete="email" />
            <Field label="Senha" value={f.senha} onChangeText={campo('senha')} secureTextEntry autoCapitalize="none" autoComplete="new-password"
              helper="Mínimo de 8 caracteres, com maiúscula, minúscula, número e caractere especial." />

            {erro ? (
              <View style={[s.erro, { borderColor: colors.danger }]} accessibilityLiveRegion="polite">
                <WarningCircleIcon size={18} color={colors.danger} />
                <Text style={[s.corpo, { flex: 1, color: colors.danger }]}>{erro}</Text>
              </View>
            ) : null}
            <BotaoSite titulo={enviando ? 'Enviando…' : 'Cadastrar e continuar'} grande disabled={enviando} onPress={() => void enviar()} style={{ marginTop: 6 }} />
            <Pressable accessibilityRole="link" onPress={() => router.push('/login')}>
              <Text style={[s.corpo, { fontSize: 14 }]}>Já tem conta? <Text style={{ color: colors.accentText, fontWeight: '700' }}>Entrar</Text></Text>
            </Pressable>
          </Animated.View>

          {/* O que acontece depois do cadastro. */}
          <View style={[s.resumo, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={s.resumoTitulo}>Depois do cadastro</Text>
            <View style={{ gap: 12, marginTop: 6 }}>
              {PASSOS.map((p, i) => (
                <View key={p} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
                  <View style={[s.passoNum, { backgroundColor: colors.accentSoft }]}><Text style={[s.passoNumTxt, { color: colors.accentText }]}>{i + 1}</Text></View>
                  <Text style={[s.resumoItem, { flex: 1 }]}>{p}</Text>
                </View>
              ))}
            </View>
            <View style={[s.nota, { borderTopColor: colors.border }]}>
              <CheckCircleIcon size={18} color={colors.success} weight="duotone" />
              <Text style={[s.corpo, { flex: 1, fontSize: 13.5, lineHeight: 20 }]}>Sem cobrança automática: o número de contas e os módulos são combinados com a gente na liberação.</Text>
            </View>
          </View>
        </Faixa>
        <SiteFooter />
      </ScrollView>
    </View>
  );
}

const estilos = (c: ThemeColors, desktop: boolean) => StyleSheet.create({
  pagina: { flexDirection: desktop ? 'row' : 'column', alignItems: 'flex-start', gap: desktop ? 56 : 28, paddingTop: desktop ? 56 : 28, paddingBottom: 24 },
  form: { flex: desktop ? 1 : undefined, width: desktop ? undefined : '100%', maxWidth: 560, gap: 12 },
  h1: { color: c.text, fontSize: desktop ? 36 : 28, lineHeight: desktop ? 42 : 34, fontWeight: '800', letterSpacing: -0.9 },
  corpo: { color: c.textMuted, fontSize: 15.5, lineHeight: 23 },
  grupo: { color: c.text, fontSize: 16, fontWeight: '800', marginTop: 18 },
  linha: { flexDirection: 'row', gap: 12 },
  erro: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, borderWidth: 1, borderRadius: 12, padding: 12 },
  resumo: { width: desktop ? 360 : '100%', borderRadius: 20, borderWidth: 1, padding: 24, gap: 6, marginTop: desktop ? 96 : 0 },
  resumoTitulo: { color: c.text, fontSize: 15, fontWeight: '800' },
  resumoItem: { color: c.text, fontSize: 14.5, lineHeight: 21 },
  passoNum: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  passoNumTxt: { fontSize: 13, fontWeight: '800' },
  nota: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', borderTopWidth: 1, paddingTop: 14, marginTop: 12 },
  selo: { width: 64, height: 64, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: c.accentSoft },
});
