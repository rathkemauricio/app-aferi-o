import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Linking from 'expo-linking';
import { supabase } from '../lib/supabase';
import { CheckIcon, EnvelopeIcon, EyeIcon, EyeSlashIcon, LockSimpleIcon, XIcon } from '../ui/icons';

/* ---------- Paleta ---------- */
export const C = {
  bg: '#07060f',
  panel: '#0d0b1a',
  border: 'rgba(139, 92, 246, 0.28)',
  text: '#f5f3ff',
  muted: '#9a93b8',
  faint: '#5f5880',
  line: 'rgba(196, 181, 253, 0.22)',
  lineFocus: '#a5b4fc',
  primary: '#4f46e5',
  primaryPressed: '#4338ca',
  accent: '#a5b4fc',
  ok: '#4ade80',
  error: '#f87171',
};

/* ---------- Regras de senha ---------- */
export const PASSWORD_RULES: { label: string; test: (v: string) => boolean }[] = [
  { label: 'Mínimo de 8 caracteres', test: v => v.length >= 8 },
  { label: 'Pelo menos uma letra maiúscula', test: v => /[A-Z]/.test(v) },
  { label: 'Pelo menos uma letra minúscula', test: v => /[a-z]/.test(v) },
  { label: 'Pelo menos um número', test: v => /\d/.test(v) },
  { label: 'Pelo menos um caractere especial', test: v => /[^A-Za-z0-9\s]/.test(v) },
  { label: 'Sem espaços', test: v => !/\s/.test(v) },
];

export const isStrongPassword = (v: string) => PASSWORD_RULES.every(r => r.test(v));

const STRENGTH_LEVELS = [
  { min: 0, label: 'Fraca', color: '#ef4444' },
  { min: 3, label: 'Regular', color: '#f97316' },
  { min: 4, label: 'Boa', color: '#eab308' },
  { min: 5, label: 'Forte', color: '#22c55e' },
];

function strengthOf(value: string) {
  if (!value) return { score: 0, level: null as null | (typeof STRENGTH_LEVELS)[number] };
  const score = PASSWORD_RULES.filter(r => r.test(value)).length;
  const level = [...STRENGTH_LEVELS].reverse().find(l => score >= l.min)!;
  return { score, level };
}

/* ---------- Campos ---------- */
type InputProps = TextInputProps & { label: string; leading?: ReactNode; secure?: boolean; invalid?: boolean };

export function AuthInput({ label, leading, secure = false, invalid = false, ...rest }: InputProps) {
  const [focused, setFocused] = useState(false);
  const [visible, setVisible] = useState(false);
  return (
    <View style={f.field}>
      <Text style={f.label}>{label}</Text>
      <View style={[f.row, focused && f.rowFocus, invalid && f.rowInvalid]}>
        {leading ? <View style={f.leading}>{leading}</View> : null}
        <TextInput
          {...rest}
          secureTextEntry={secure && !visible}
          placeholderTextColor={C.faint}
          autoCapitalize="none"
          autoCorrect={false}
          onFocus={e => { setFocused(true); rest.onFocus?.(e); }}
          onBlur={e => { setFocused(false); rest.onBlur?.(e); }}
          style={[f.input, Platform.OS === 'web' && ({ outlineStyle: 'none' } as object)]}
        />
        {secure && (
          <Pressable
            onPress={() => setVisible(v => !v)}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={visible ? 'Ocultar senha' : 'Mostrar senha'}
            style={f.eye}
          >
            {visible ? <EyeSlashIcon size={20} color={C.muted} /> : <EyeIcon size={20} color={C.muted} />}
          </Pressable>
        )}
      </View>
    </View>
  );
}

/* ---------- Medidor de força ---------- */
export function PasswordStrength({ value }: { value: string }) {
  const { score, level } = strengthOf(value);
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(progress, { toValue: score / PASSWORD_RULES.length, duration: 260, useNativeDriver: false }).start();
  }, [score, progress]);

  const width = progress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });

  return (
    <View style={m.wrap}>
      <View style={m.head}>
        <Text style={m.title}>Força da senha</Text>
        {level && <Text style={[m.level, { color: level.color }]}>{level.label}</Text>}
      </View>
      <View style={m.track}>
        <Animated.View style={[m.bar, { width, backgroundColor: level?.color ?? 'transparent' }]} />
      </View>
      <Text style={m.reqTitle}>Requisitos:</Text>
      {PASSWORD_RULES.map(rule => {
        const ok = rule.test(value);
        return (
          <View key={rule.label} style={m.req} accessibilityLabel={`${rule.label}: ${ok ? 'atendido' : 'pendente'}`}>
            {ok ? <CheckIcon size={14} color={C.ok} weight="bold" /> : <XIcon size={14} color={C.faint} weight="bold" />}
            <Text style={[m.reqText, ok ? m.okText : m.pendingText]}>{rule.label}</Text>
          </View>
        );
      })}
    </View>
  );
}

/* ---------- Arte do painel ---------- */
function Artwork({ compact }: { compact: boolean }) {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <View style={[art.blob, { width: 420, height: 420, borderRadius: 210, top: -140, left: -120, backgroundColor: '#2e1065', opacity: 0.9 }]} />
      <View style={[art.blob, { width: 300, height: 300, borderRadius: 150, top: compact ? -40 : 80, right: -110, backgroundColor: '#5b21b6', opacity: 0.55 }]} />
      <View style={[art.ring, { width: 360, height: 360, borderRadius: 180, top: compact ? -90 : 40, left: compact ? 80 : 30, borderWidth: 34, borderColor: 'rgba(124, 58, 237, 0.55)' }]} />
      <View style={[art.ring, { width: 230, height: 230, borderRadius: 115, top: compact ? 10 : 200, left: compact ? -40 : -60, borderWidth: 18, borderColor: 'rgba(167, 139, 250, 0.35)' }]} />
      <View style={[art.blob, { width: 260, height: 90, borderRadius: 45, top: compact ? 40 : 250, left: compact ? 150 : 140, backgroundColor: 'rgba(196, 181, 253, 0.22)', transform: [{ rotate: '-32deg' }] }]} />
      <View style={[art.blob, { width: 180, height: 14, borderRadius: 7, top: compact ? 130 : 380, left: compact ? 40 : 60, backgroundColor: 'rgba(221, 214, 254, 0.35)', transform: [{ rotate: '-32deg' }] }]} />
      <View style={[art.blob, { width: 120, height: 120, borderRadius: 60, bottom: -50, right: 40, backgroundColor: '#7c3aed', opacity: 0.35 }]} />
    </View>
  );
}

function Brand() {
  return (
    <View style={p.brandRow}>
      <Image source={require('../assets/favicon.png')} style={{ width: 34, height: 34 }} accessibilityLabel="Postora" />
      <Text style={p.brandText}>postora</Text>
    </View>
  );
}

/* ---------- Mensagens de erro do Supabase em português ---------- */
export function traduzirErro(e: { message?: string; status?: number; code?: string } | null | undefined): string {
  const msg = (e?.message ?? '').toLowerCase();
  if (!e) return '';
  if (msg.includes('invalid login credentials')) return 'E-mail ou senha incorretos.';
  if (msg.includes('email not confirmed')) return 'Este e-mail ainda não foi confirmado. Abra o link que enviamos ou reenvie a confirmação.';
  if (msg.includes('user already registered') || e.code === 'user_already_exists') return 'Já existe uma conta com este e-mail. Use Entrar ou Esqueci a senha.';
  if (e.status === 429 || msg.includes('rate limit') || msg.includes('security purposes')) return 'Muitas tentativas em pouco tempo. Aguarde alguns minutos e tente de novo.';
  if (msg.includes('password') && (msg.includes('weak') || msg.includes('should'))) return 'A senha não atende à política de segurança do servidor. Use uma senha mais forte.';
  if (msg.includes('same password') || msg.includes('different from the old')) return 'A nova senha precisa ser diferente da atual.';
  if (msg.includes('signups not allowed') || msg.includes('signup is disabled')) return 'O cadastro de novas contas está desativado. Fale com o administrador.';
  if (msg.includes('failed to fetch') || msg.includes('network')) return 'Sem conexão com o servidor. Verifique sua internet.';
  return e.message ?? 'Não foi possível concluir. Tente novamente.';
}

const ULTIMO_EMAIL = 'nevoeiro.auth.ultimo-email';

/* ---------- Tela ---------- */
type Mode = 'login' | 'signup' | 'forgot';

export default function AuthScreen() {
  const { width } = useWindowDimensions();
  const wide = width >= 820;

  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [podeReenviar, setPodeReenviar] = useState(false);

  // Lembra o último e-mail usado neste aparelho.
  useEffect(() => { void AsyncStorage.getItem(ULTIMO_EMAIL).then(v => { if (v) setEmail(e => e || v); }).catch(() => undefined); }, []);

  const emailValid = /^\S+@\S+\.\S+$/.test(email.trim());
  const strong = isStrongPassword(password);
  const confirmMismatch = confirm.length > 0 && confirm !== password;

  const canSubmit = useMemo(() => {
    if (busy) return false;
    if (mode === 'login') return emailValid && password.length > 0;
    if (mode === 'forgot') return emailValid;
    return emailValid && strong && confirm === password;
  }, [busy, mode, emailValid, password, strong, confirm]);

  const switchMode = (next: Mode) => {
    setMode(next);
    setPassword('');
    setConfirm('');
    setError('');
    setInfo('');
    setPodeReenviar(false);
  };

  const submit = async () => {
    if (!supabase || !canSubmit) return;
    const mail = email.trim().toLowerCase();
    setError(''); setInfo(''); setPodeReenviar(false);
    setBusy(true);
    try {
      if (mode === 'login') {
        const { error: err } = await supabase.auth.signInWithPassword({ email: mail, password });
        if (err) { setError(traduzirErro(err)); setPodeReenviar((err.message ?? '').toLowerCase().includes('email not confirmed')); }
        else void AsyncStorage.setItem(ULTIMO_EMAIL, mail).catch(() => undefined);
        // Com sucesso, a casca do app detecta a sessão e abre a central de módulos.
      } else if (mode === 'signup') {
        const { data, error: err } = await supabase.auth.signUp({ email: mail, password, options: { emailRedirectTo: Linking.createURL('/login') } });
        if (err) setError(traduzirErro(err));
        else if (!data.session) {
          void AsyncStorage.setItem(ULTIMO_EMAIL, mail).catch(() => undefined);
          switchMode('login');
          setInfo(`Conta criada. Abra o link de confirmação enviado para ${mail} e depois entre. O administrador precisa liberar o seu acesso.`);
          setPodeReenviar(true);
        }
      } else {
        const { error: err } = await supabase.auth.resetPasswordForEmail(mail, { redirectTo: Linking.createURL('/redefinir-senha') });
        if (err) setError(traduzirErro(err));
        else setInfo(`Se existir uma conta com ${mail}, enviamos um link para criar uma nova senha. Abra o link neste aparelho.`);
      }
    } catch {
      setError('Sem conexão com o servidor. Verifique sua internet e tente novamente.');
    } finally {
      setBusy(false);
    }
  };

  const reenviar = async () => {
    if (!supabase || !emailValid) return;
    setBusy(true);
    const { error: err } = await supabase.auth.resend({ type: 'signup', email: email.trim().toLowerCase(), options: { emailRedirectTo: Linking.createURL('/login') } });
    setBusy(false);
    if (err) setError(traduzirErro(err)); else { setError(''); setInfo('Enviamos um novo link de confirmação. Verifique também a caixa de spam.'); }
  };

  const titulo = mode === 'login' ? 'Acesso exclusivo à plataforma.' : mode === 'signup' ? 'Crie sua conta.' : 'Recuperar acesso.';
  const subtitulo = mode === 'login' ? 'Entre com o e-mail e a senha da sua conta.' : mode === 'signup' ? 'Crie uma senha forte para proteger sua conta.' : 'Informe o e-mail da conta. Enviaremos um link para criar uma nova senha.';
  const botao = mode === 'login' ? 'Entrar' : mode === 'signup' ? 'Criar conta' : 'Enviar link';

  const form = (
    <View style={[s.formPanel, wide ? s.formPanelWide : s.formPanelCompact]}>
      <View style={s.topSwitch}>
        <Text style={s.topSwitchText}>{mode === 'signup' ? 'Já tem uma conta?' : 'Não tem uma conta?'}</Text>
        <Pressable onPress={() => switchMode(mode === 'signup' ? 'login' : 'signup')} style={({ pressed }) => [s.outlineBtn, pressed && { opacity: 0.7 }]}>
          <Text style={s.outlineBtnText}>{mode === 'signup' ? 'Entrar' : 'Criar conta'}</Text>
        </Pressable>
      </View>

      <View style={s.formBody}>
        <Text style={s.title} accessibilityRole="header">{titulo}</Text>
        <Text style={s.subtitle}>{subtitulo}</Text>

        <AuthInput
          label="E-mail"
          leading={<EnvelopeIcon size={18} color={C.accent} />}
          value={email}
          onChangeText={setEmail}
          placeholder="seu@email.com"
          keyboardType="email-address"
          autoComplete="email"
          textContentType="emailAddress"
          returnKeyType={mode === 'forgot' ? 'send' : 'next'}
          onSubmitEditing={mode === 'forgot' ? () => void submit() : undefined}
        />

        {mode !== 'forgot' && (
          <AuthInput
            label={mode === 'login' ? 'Senha' : 'Nova senha'}
            leading={<LockSimpleIcon size={18} color={C.accent} />}
            secure
            value={password}
            onChangeText={setPassword}
            placeholder={mode === 'login' ? 'Digite sua senha' : 'Digite sua nova senha'}
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            textContentType={mode === 'login' ? 'password' : 'newPassword'}
            returnKeyType={mode === 'login' ? 'go' : 'next'}
            onSubmitEditing={mode === 'login' ? () => void submit() : undefined}
          />
        )}

        {mode === 'login' && (
          <Pressable onPress={() => switchMode('forgot')} hitSlop={8} style={s.forgot} accessibilityRole="link">
            <Text style={s.link}>Esqueci a senha</Text>
          </Pressable>
        )}

        {mode === 'signup' && (
          <>
            <PasswordStrength value={password} />
            <AuthInput
              label="Confirmar nova senha"
              leading={<LockSimpleIcon size={18} color={C.accent} />}
              secure
              invalid={confirmMismatch}
              value={confirm}
              onChangeText={setConfirm}
              placeholder="Confirme sua nova senha"
              autoComplete="new-password"
              textContentType="newPassword"
              onSubmitEditing={() => void submit()}
            />
            {confirm.length > 0 && (
              <Text style={[s.matchText, { color: confirmMismatch ? C.error : C.ok }]}>
                {confirmMismatch ? 'As senhas não coincidem' : 'As senhas coincidem'}
              </Text>
            )}
          </>
        )}

        {error ? <Text style={s.error} accessibilityLiveRegion="polite">{error}</Text> : null}
        {info ? <Text style={s.info} accessibilityLiveRegion="polite">{info}</Text> : null}
        {podeReenviar && emailValid ? (
          <Pressable onPress={() => void reenviar()} disabled={busy} hitSlop={8} style={s.centerLink} accessibilityRole="button">
            <Text style={s.link}>Reenviar e-mail de confirmação</Text>
          </Pressable>
        ) : null}

        <Pressable
          onPress={() => void submit()}
          disabled={!canSubmit}
          accessibilityRole="button"
          style={({ pressed }) => [s.primaryBtn, pressed && { backgroundColor: C.primaryPressed }, !canSubmit && s.primaryBtnDisabled]}
        >
          {busy ? <ActivityIndicator color="#fff" /> : <Text style={s.primaryBtnText}>{botao}</Text>}
        </Pressable>

        {mode === 'forgot' && (
          <Pressable onPress={() => switchMode('login')} hitSlop={8} style={s.centerLink} accessibilityRole="link">
            <Text style={s.link}>Voltar para o login</Text>
          </Pressable>
        )}
      </View>
    </View>
  );

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.flex}>
        <ScrollView contentContainerStyle={[s.scroll, wide && s.scrollWide]} keyboardShouldPersistTaps="handled">
          <View style={[s.card, wide ? s.cardWide : s.cardCompact]}>
            <View style={[s.artPanel, wide ? s.artPanelWide : s.artPanelCompact]}>
              <Artwork compact={!wide} />
              <Brand />
              <View>
                <Text style={p.heroTitle}>Gestão de postos</Text>
                <Text style={p.heroText}>Aferições, tempos e movimentos e croquis de todas as filiais em um só lugar.</Text>
                <View style={p.dots}>
                  <View style={[p.dot, p.dotActive]} />
                  <View style={p.dot} />
                  <View style={p.dot} />
                </View>
              </View>
            </View>
            {form}
          </View>
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

/* ---------- Estilos ---------- */
const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  flex: { flex: 1 },
  scroll: { flexGrow: 1 },
  scrollWide: { justifyContent: 'center', alignItems: 'center', padding: 32 },
  card: { backgroundColor: C.panel, overflow: 'hidden' },
  cardWide: { flexDirection: 'row', width: '100%', maxWidth: 1040, minHeight: 600, borderRadius: 24, borderWidth: 1, borderColor: C.border },
  cardCompact: { flex: 1 },
  artPanel: { overflow: 'hidden', justifyContent: 'space-between', backgroundColor: '#120a2e' },
  artPanelWide: { flex: 1.1, padding: 32, margin: 10, borderRadius: 18 },
  artPanelCompact: { height: 230, padding: 22 },
  formPanel: { backgroundColor: C.panel },
  formPanelWide: { flex: 1, paddingHorizontal: 48, paddingVertical: 28 },
  formPanelCompact: { flex: 1, paddingHorizontal: 22, paddingTop: 18, paddingBottom: 32, marginTop: -22, borderTopLeftRadius: 24, borderTopRightRadius: 24 },
  topSwitch: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 10 },
  topSwitchText: { color: C.muted, fontSize: 12 },
  outlineBtn: { borderWidth: 1, borderColor: C.accent, borderRadius: 8, paddingVertical: 7, paddingHorizontal: 14 },
  outlineBtnText: { color: C.text, fontSize: 12, fontWeight: '700' },
  formBody: { flex: 1, justifyContent: 'center', width: '100%', maxWidth: 380, alignSelf: 'center', paddingTop: 24, gap: 4 },
  title: { color: C.text, fontSize: 22, fontWeight: '800', textAlign: 'center' },
  subtitle: { color: C.muted, fontSize: 13, textAlign: 'center', marginTop: 6, marginBottom: 14 },
  matchText: { fontSize: 12, marginTop: 6 },
  error: { color: C.error, fontSize: 12, marginTop: 12, textAlign: 'center' },
  info: { color: C.ok, fontSize: 12, marginTop: 12, textAlign: 'center', lineHeight: 18 },
  primaryBtn: { marginTop: 24, height: 46, borderRadius: 10, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center' },
  primaryBtnDisabled: { opacity: 0.4 },
  primaryBtnText: { color: '#fff', fontSize: 14, fontWeight: '800', letterSpacing: 0.3 },
  link: { color: C.accent, fontSize: 13, fontWeight: '700' },
  forgot: { alignSelf: 'flex-end', marginTop: 10, paddingVertical: 4 },
  centerLink: { alignSelf: 'center', marginTop: 12, paddingVertical: 4 },
});

const f = StyleSheet.create({
  field: { marginTop: 14 },
  label: { color: C.muted, fontSize: 12, fontWeight: '700', marginBottom: 4 },
  row: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1.5, borderBottomColor: C.line, minHeight: 44 },
  rowFocus: { borderBottomColor: C.lineFocus },
  rowInvalid: { borderBottomColor: C.error },
  leading: { width: 26, alignItems: 'flex-start', justifyContent: 'center' },
  input: { flex: 1, color: C.text, fontSize: 15, paddingVertical: 10 },
  eye: { paddingLeft: 10, paddingVertical: 8 },
});

const m = StyleSheet.create({
  wrap: { marginTop: 16 },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { color: C.muted, fontSize: 12 },
  level: { fontSize: 12, fontWeight: '800' },
  track: { height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.08)', marginTop: 8, overflow: 'hidden' },
  bar: { height: '100%', borderRadius: 3 },
  reqTitle: { color: C.muted, fontSize: 12, marginTop: 14, marginBottom: 4 },
  req: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 2 },
  reqText: { fontSize: 12.5 },
  okText: { color: C.ok },
  pendingText: { color: C.faint },
});

const p = StyleSheet.create({
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  logo: { width: 28, height: 28, borderRadius: 14, borderWidth: 2, borderColor: '#c4b5fd', alignItems: 'center', justifyContent: 'center' },
  logoDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#c4b5fd' },
  brandText: { color: '#fff', fontSize: 20, fontWeight: '800', letterSpacing: 0.2 },
  brandAccent: { color: C.accent, fontWeight: '600' },
  heroTitle: { color: '#fff', fontSize: 20, fontWeight: '800' },
  heroText: { color: 'rgba(237, 233, 254, 0.75)', fontSize: 13, marginTop: 4, maxWidth: 300 },
  dots: { flexDirection: 'row', gap: 6, marginTop: 14 },
  dot: { width: 18, height: 3, borderRadius: 2, backgroundColor: 'rgba(237, 233, 254, 0.3)' },
  dotActive: { width: 34, backgroundColor: '#ede9fe' },
});

const art = StyleSheet.create({
  blob: { position: 'absolute' },
  ring: { position: 'absolute', backgroundColor: 'transparent' },
});

