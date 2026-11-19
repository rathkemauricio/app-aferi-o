import * as Linking from 'expo-linking';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, FadeInDown, useReducedMotion } from 'react-native-reanimated';
import { isStrongPassword, PASSWORD_RULES, traduzirErro } from '../components/AuthScreen';
import { CTA_EMPRESA, Faixa, SiteFooter, SiteNav, useSite } from '../components/site/SiteChrome';
import { emailValido } from '../lib/email';
import { supabase } from '../lib/supabase';
import { MODULES } from '../modules/registry';
import { CheckCircleIcon, CheckIcon, EnvelopeIcon, WarningCircleIcon } from '../ui/icons';
import { Button, Field } from '../ui/kit';
import type { ThemeColors } from '../ui/theme';

type Plano = { id: string; nome: string; preco_mensal: number | null; limite_contas: number; modulos: string[]; ordem: number };
const EASE = Easing.bezier(0.23, 1, 0.32, 1);
const preco = (v: number | null) => (v === null ? 'Sob consulta' : `${v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })}/mês`);
const nomeModulo = (id: string) => MODULES.find(m => m.id === id)?.name ?? id;

/**
 * Cadastro da empresa pelo site: dados da empresa, plano e o acesso do administrador.
 * Cria a conta (com confirmação por e-mail) e guarda os dados da empresa na própria conta; no primeiro acesso,
 * a empresa é criada aguardando a liberação do dono do EasyAudit (função "empresas", ação "criar").
 */
export default function CriarEmpresa() {
  const router = useRouter();
  const params = useLocalSearchParams<{ plano?: string }>();
  const { colors, desktop } = useSite();
  const s = useMemo(() => estilos(colors, desktop), [colors, desktop]);
  const reduz = useReducedMotion();

  const [planos, setPlanos] = useState<Plano[] | null>(null);
  const [plano, setPlano] = useState(params.plano ?? '');
  const [f, setF] = useState({ empresa: '', documento: '', telefone: '', nome: '', email: '', senha: '' });
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [enviadoPara, setEnviadoPara] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase) return;
    void supabase.from('planos').select('id,nome,preco_mensal,limite_contas,modulos,ordem').eq('ativo', true).order('ordem').then(({ data }) => {
      const lista = (data ?? []) as Plano[];
      setPlanos(lista);
      setPlano(p => (lista.some(x => x.id === p) ? p : lista.find(x => x.ordem === 2)?.id ?? lista[0]?.id ?? ''));
    });
  }, []);
  const escolhido = planos?.find(p => p.id === plano) ?? null;
  const campo = (k: keyof typeof f) => (v: string) => { setF(x => ({ ...x, [k]: v })); setErro(''); };

  const enviar = async () => {
    if (!supabase || enviando) return;
    const email = f.email.trim().toLowerCase();
    if (f.empresa.trim().length < 2) { setErro('Informe o nome da empresa.'); return; }
    if (!escolhido) { setErro('Escolha um plano.'); return; }
    if (!f.nome.trim()) { setErro('Informe o seu nome (aparece nos registros e relatórios).'); return; }
    if (!emailValido(email)) { setErro('Confira o e-mail digitado.'); return; }
    if (!isStrongPassword(f.senha)) { setErro(`A senha precisa ter: ${PASSWORD_RULES.filter(r => !r.test(f.senha)).map(r => r.label.toLowerCase()).join(', ')}.`); return; }
    setEnviando(true);
    try {
      const { data, error } = await supabase.auth.signUp({
        email, password: f.senha,
        options: {
          emailRedirectTo: Linking.createURL('/login'),
          data: { nome: f.nome.trim(), empresa_pendente: { nome: f.empresa.trim(), documento: f.documento.trim(), telefone: f.telefone.trim(), plano_id: escolhido.id } },
        },
      });
      if (error) { setErro(traduzirErro(error)); return; }
      // Com confirmação de e-mail ligada não há sessão: a pessoa confirma e entra. Sem confirmação, a casca já assume.
      if (!data.session) setEnviadoPara(email);
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
              <Button title="Ir para o login" onPress={() => router.replace('/login')} />
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
            <Text style={s.h1} accessibilityRole="header">{CTA_EMPRESA}</Text>
            <Text style={s.corpo}>Você vira o administrador da empresa e convida a sua equipe depois da liberação.</Text>

            <Text style={s.grupo}>Empresa</Text>
            <Field label="Nome da empresa" value={f.empresa} onChangeText={campo('empresa')} placeholder="Ex.: Rede de Postos Horizonte" maxLength={120} />
            <View style={[s.linha, !desktop && { flexDirection: 'column' }]}>
              <View style={{ flex: 1 }}><Field label="CNPJ (opcional)" value={f.documento} onChangeText={campo('documento')} keyboardType="numbers-and-punctuation" maxLength={30} /></View>
              <View style={{ flex: 1 }}><Field label="Telefone (opcional)" value={f.telefone} onChangeText={campo('telefone')} keyboardType="phone-pad" maxLength={30} /></View>
            </View>

            <Text style={s.grupo}>Plano</Text>
            {!planos ? <ActivityIndicator color={colors.accent} style={{ alignSelf: 'flex-start' }} /> : (
              <View style={{ gap: 8 }} accessibilityRole="radiogroup">
                {planos.map(p => {
                  const on = p.id === plano;
                  return (
                    <Pressable key={p.id} accessibilityRole="radio" accessibilityState={{ selected: on }} onPress={() => setPlano(p.id)}
                      style={({ pressed }) => [s.opcao, { borderColor: on ? colors.accent : colors.border, backgroundColor: on ? colors.accentSoft : colors.surface }, pressed && { transform: [{ scale: 0.99 }] }]}>
                      <View style={[s.radio, { borderColor: on ? colors.accent : colors.borderStrong }]}>{on ? <View style={[s.radioMiolo, { backgroundColor: colors.accent }]} /> : null}</View>
                      <View style={{ flex: 1 }}>
                        <Text style={[s.opcaoNome, on && { color: colors.accentText }]}>{p.nome}</Text>
                        <Text style={s.opcaoInfo}>Até {p.limite_contas} contas · {p.modulos.length} módulos</Text>
                      </View>
                      {p.preco_mensal !== null ? <Text style={[s.opcaoPreco, on && { color: colors.accentText }]}>{preco(p.preco_mensal)}</Text> : null}
                    </Pressable>
                  );
                })}
              </View>
            )}

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
            <Button title={enviando ? 'Criando…' : CTA_EMPRESA} disabled={enviando} onPress={() => void enviar()} />
            <Pressable accessibilityRole="link" onPress={() => router.push('/login')}>
              <Text style={[s.corpo, { fontSize: 14 }]}>Já tem conta? <Text style={{ color: colors.accentText, fontWeight: '700' }}>Entrar</Text></Text>
            </Pressable>
          </Animated.View>

          {/* Resumo do plano escolhido. */}
          {escolhido ? (
            <View style={[s.resumo, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={s.resumoTitulo}>Plano {escolhido.nome}</Text>
              <Text style={s.resumoPreco}>{escolhido.preco_mensal === null ? `${escolhido.limite_contas} contas` : preco(escolhido.preco_mensal)}</Text>
              <Text style={s.corpo}>{escolhido.preco_mensal === null ? 'Preço sob consulta. ' : `Até ${escolhido.limite_contas} contas ativas. `}Contas inativas não contam.</Text>
              <View style={{ gap: 8, marginTop: 6 }}>
                {escolhido.modulos.map(id => (
                  <View key={id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <CheckIcon size={15} color={colors.accent} weight="bold" />
                    <Text style={s.resumoItem}>{nomeModulo(id)}</Text>
                  </View>
                ))}
              </View>
              <View style={[s.nota, { borderTopColor: colors.border }]}>
                <CheckCircleIcon size={18} color={colors.success} weight="duotone" />
                <Text style={[s.corpo, { flex: 1, fontSize: 13.5, lineHeight: 20 }]}>Sem cobrança automática: a empresa é liberada pelo EasyAudit e o plano pode mudar depois.</Text>
              </View>
            </View>
          ) : null}
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
  opcao: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1.5, borderRadius: 14, paddingVertical: 12, paddingHorizontal: 14 },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  radioMiolo: { width: 10, height: 10, borderRadius: 5 },
  opcaoNome: { color: c.text, fontSize: 15, fontWeight: '800' },
  opcaoInfo: { color: c.textMuted, fontSize: 13 },
  opcaoPreco: { color: c.text, fontSize: 14, fontWeight: '700' },
  erro: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, borderWidth: 1, borderRadius: 12, padding: 12 },
  resumo: { width: desktop ? 360 : '100%', borderRadius: 20, borderWidth: 1, padding: 24, gap: 6, marginTop: desktop ? 96 : 0 },
  resumoTitulo: { color: c.text, fontSize: 15, fontWeight: '800' },
  resumoPreco: { color: c.text, fontSize: 26, fontWeight: '800', letterSpacing: -0.5 },
  resumoItem: { color: c.text, fontSize: 14.5 },
  nota: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', borderTopWidth: 1, paddingTop: 14, marginTop: 12 },
  selo: { width: 64, height: 64, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: c.accentSoft },
});
