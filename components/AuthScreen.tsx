import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
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
  type ViewStyle,
} from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  FadeIn,
  FadeInDown,
  FadeOut,
  interpolateColor,
  Keyframe,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Linking from 'expo-linking';
import { supabase } from '../lib/supabase';
import {
  ArrowRightIcon,
  CheckCircleIcon,
  CheckIcon,
  EnvelopeIcon,
  EyeIcon,
  EyeSlashIcon,
  GasPumpIcon,
  type Icon,
  LockSimpleIcon,
  SquaresFourIcon,
  TimerIcon,
  WarningCircleIcon,
  XIcon,
} from '../ui/icons';

/* ---------- Paleta ---------- */
export const C = {
  bg: '#07060f',
  panel: '#0d0b1a',
  border: 'rgba(139, 92, 246, 0.28)',
  text: '#f5f3ff',
  muted: '#9a93b8',
  faint: '#5f5880',
  line: 'rgba(196, 181, 253, 0.16)',
  lineFocus: '#a5b4fc',
  primary: '#4f46e5',
  primaryPressed: '#4338ca',
  accent: '#a5b4fc',
  ok: '#4ade80',
  error: '#f87171',
};

/* ---------- Movimento ---------- */
const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1);
const EASE_DRIFT = Easing.inOut(Easing.sin);

/** Entrada escalonada: cada item sobe 12px e aparece, 55ms depois do anterior. Respeita "reduzir movimento" do sistema. */
const enter = (i: number, base = 0) =>
  FadeInDown.duration(460).delay(base + i * 55).easing(EASE_OUT).withInitialValues({ transform: [{ translateY: 12 }] });

const cardEnter = new Keyframe({
  0: { opacity: 0, transform: [{ scale: 0.97 }] },
  100: { opacity: 1, transform: [{ scale: 1 }], easing: EASE_OUT },
}).duration(520);

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
  const focus = useSharedValue(0);

  useEffect(() => {
    focus.set(withTiming(focused ? 1 : 0, { duration: 180, easing: EASE_OUT }));
  }, [focused, focus]);

  const rowStyle = useAnimatedStyle(() => ({
    borderColor: invalid ? C.error : interpolateColor(focus.get(), [0, 1], [C.line, C.lineFocus]),
    backgroundColor: interpolateColor(focus.get(), [0, 1], ['rgba(255,255,255,0.035)', 'rgba(165,180,252,0.07)']),
  }));
  const glowStyle = useAnimatedStyle(() => ({ opacity: focus.get() }));

  return (
    <View style={f.field}>
      <Text style={[f.label, focused && f.labelFocus, invalid && { color: C.error }]}>{label}</Text>
      <View>
        <Animated.View pointerEvents="none" style={[f.glow, invalid && f.glowInvalid, glowStyle]} />
        <Animated.View style={[f.row, rowStyle]}>
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
        </Animated.View>
      </View>
    </View>
  );
}

/* ---------- Medidor de força ---------- */
export function PasswordStrength({ value }: { value: string }) {
  const { score, level } = strengthOf(value);
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.set(withTiming(score / PASSWORD_RULES.length, { duration: 260, easing: EASE_OUT }));
  }, [score, progress]);

  // Barra absoluta e sem filhos: animar a largura não força o layout de mais nada.
  const barStyle = useAnimatedStyle(() => ({ width: `${progress.get() * 100}%` }));

  return (
    <View style={m.wrap}>
      <View style={m.head}>
        <Text style={m.title}>Força da senha</Text>
        {level && <Text style={[m.level, { color: level.color }]}>{level.label}</Text>}
      </View>
      <View style={m.track}>
        <Animated.View style={[m.bar, { backgroundColor: level?.color ?? 'transparent' }, barStyle]} />
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

/* ---------- Arte do painel (formas flutuando devagar) ---------- */
type DriftProps = { style: ViewStyle; dx?: number; dy?: number; spin?: number; baseRotate?: number; duration: number; delay?: number };

/** Forma decorativa que vai e volta em loop suave. Fica parada com "reduzir movimento" ligado. */
function Drift({ style, dx = 0, dy = 0, spin = 0, baseRotate = 0, duration, delay = 0 }: DriftProps) {
  const reduced = useReducedMotion();
  const t = useSharedValue(0);

  useEffect(() => {
    if (reduced) return;
    t.set(withDelay(delay, withRepeat(withTiming(1, { duration, easing: EASE_DRIFT }), -1, true)));
    return () => cancelAnimation(t);
  }, [reduced, duration, delay, t]);

  const anim = useAnimatedStyle(() => ({
    transform: [
      { translateX: t.get() * dx },
      { translateY: t.get() * dy },
      { rotate: `${baseRotate + t.get() * spin}deg` },
    ],
  }));

  return <Animated.View style={[art.abs, style, anim]} />;
}

/** Arco girando continuamente. */
function Orbit({ style, duration }: { style: ViewStyle; duration: number }) {
  const reduced = useReducedMotion();
  const r = useSharedValue(0);

  useEffect(() => {
    if (reduced) return;
    r.set(withRepeat(withTiming(360, { duration, easing: Easing.linear }), -1, false));
    return () => cancelAnimation(r);
  }, [reduced, duration, r]);

  const anim = useAnimatedStyle(() => ({ transform: [{ rotate: `${r.get()}deg` }] }));
  return <Animated.View style={[art.abs, style, anim]} />;
}

/** Pontinho que acende e apaga. */
function Twinkle({ top, left, size = 4, duration, delay = 0 }: { top: number | `${number}%`; left: number | `${number}%`; size?: number; duration: number; delay?: number }) {
  const reduced = useReducedMotion();
  const o = useSharedValue(0.35);

  useEffect(() => {
    if (reduced) return;
    o.set(withDelay(delay, withRepeat(withTiming(1, { duration, easing: EASE_DRIFT }), -1, true)));
    return () => cancelAnimation(o);
  }, [reduced, duration, delay, o]);

  const anim = useAnimatedStyle(() => ({ opacity: o.get() }));
  return <Animated.View style={[art.abs, art.star, { top, left, width: size, height: size, borderRadius: size / 2 }, anim]} />;
}

function Artwork({ compact }: { compact: boolean }) {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Drift duration={9000} dx={24} dy={18} style={{ width: 420, height: 420, borderRadius: 210, top: -140, left: -120, backgroundColor: '#2e1065', opacity: 0.9 }} />
      <Drift duration={11000} delay={600} dx={-20} dy={26} style={{ width: 300, height: 300, borderRadius: 150, top: compact ? -40 : 80, right: -110, backgroundColor: '#5b21b6', opacity: 0.55 }} />
      <Drift duration={13000} dx={10} dy={-14} spin={8} style={{ width: 360, height: 360, borderRadius: 180, top: compact ? -90 : 40, left: compact ? 80 : 30, borderWidth: 34, borderColor: 'rgba(124, 58, 237, 0.55)' }} />
      <Orbit duration={36000} style={{ width: 300, height: 300, borderRadius: 150, top: compact ? -60 : 70, left: compact ? 110 : 60, borderWidth: 2, borderColor: 'transparent', borderTopColor: 'rgba(221, 214, 254, 0.55)', borderRightColor: 'rgba(221, 214, 254, 0.18)' }} />
      <Drift duration={10000} delay={300} dx={-12} dy={16} style={{ width: 230, height: 230, borderRadius: 115, top: compact ? 10 : 200, left: compact ? -40 : -60, borderWidth: 18, borderColor: 'rgba(167, 139, 250, 0.35)' }} />
      <Drift duration={8000} dx={18} dy={-10} baseRotate={-32} spin={4} style={{ width: 260, height: 90, borderRadius: 45, top: compact ? 40 : 250, left: compact ? 150 : 140, backgroundColor: 'rgba(196, 181, 253, 0.22)' }} />
      <Drift duration={7000} delay={900} dx={26} dy={-8} baseRotate={-32} style={{ width: 180, height: 14, borderRadius: 7, top: compact ? 130 : 380, left: compact ? 40 : 60, backgroundColor: 'rgba(221, 214, 254, 0.35)' }} />
      <Drift duration={12000} dx={-16} dy={-20} style={{ width: 120, height: 120, borderRadius: 60, bottom: -50, right: 40, backgroundColor: '#7c3aed', opacity: 0.35 }} />
      <Twinkle top="18%" left="72%" duration={1800} />
      <Twinkle top="34%" left="58%" size={3} duration={2400} delay={500} />
      <Twinkle top="12%" left="40%" size={3} duration={2100} delay={1100} />
      <Twinkle top="48%" left="86%" size={5} duration={2800} delay={300} />
      {!compact && <Twinkle top="62%" left="70%" size={3} duration={2200} delay={800} />}
    </View>
  );
}

function Brand() {
  return (
    <Animated.View entering={FadeIn.duration(500).delay(120)} style={p.brandRow}>
      <View style={p.logoWrap}>
        <Image source={require('../assets/favicon.png')} style={{ width: 30, height: 30 }} accessibilityLabel="Postora" />
      </View>
      <Text style={p.brandText}>postora</Text>
    </Animated.View>
  );
}

/* ---------- Destaques que giram no painel ---------- */
const SLIDES: { icon: Icon; title: string; text: string }[] = [
  { icon: GasPumpIcon, title: 'Aferições de bombas', text: 'Registre e acompanhe as aferições de todas as filiais em um só lugar.' },
  { icon: TimerIcon, title: 'Tempos e movimentos', text: 'Colete tempos em campo, dimensione equipes e acompanhe o painel.' },
  { icon: SquaresFourIcon, title: 'Croquis e auditorias', text: 'Desenhe o croqui do posto, audite riscos e controle inventários.' },
];

function Dot({ active, onPress, label }: { active: boolean; onPress: () => void; label: string }) {
  const w = useSharedValue(active ? 34 : 18);
  useEffect(() => { w.set(withTiming(active ? 34 : 18, { duration: 280, easing: EASE_OUT })); }, [active, w]);
  const anim = useAnimatedStyle(() => ({ width: w.get() }));
  return (
    <Pressable onPress={onPress} hitSlop={{ top: 14, bottom: 14, left: 4, right: 4 }} accessibilityRole="button" accessibilityLabel={label}>
      <Animated.View style={[p.dot, active && p.dotActive, anim]} />
    </Pressable>
  );
}

function Hero() {
  const [slide, setSlide] = useState(0);

  useEffect(() => {
    const id = setTimeout(() => setSlide(i => (i + 1) % SLIDES.length), 5000);
    return () => clearTimeout(id);
  }, [slide]);

  const { icon: SlideIcon, title, text } = SLIDES[slide];

  return (
    <Animated.View entering={enter(1, 200)}>
      <Text style={p.eyebrow}>GESTÃO DE POSTOS</Text>
      <View style={p.slideBox}>
        <Animated.View
          key={slide}
          entering={FadeInDown.duration(420).easing(EASE_OUT).withInitialValues({ transform: [{ translateY: 10 }] })}
          exiting={FadeOut.duration(180)}
          style={p.slide}
          accessibilityLiveRegion="polite"
        >
          <View style={p.slideHead}>
            <View style={p.badge}><SlideIcon size={16} color="#ede9fe" weight="duotone" /></View>
            <Text style={p.heroTitle}>{title}</Text>
          </View>
          <Text style={p.heroText}>{text}</Text>
        </Animated.View>
      </View>
      <View style={p.dots}>
        {SLIDES.map((sl, i) => (
          <Dot key={sl.title} active={i === slide} onPress={() => setSlide(i)} label={`Ver destaque: ${sl.title}`} />
        ))}
      </View>
    </Animated.View>
  );
}

/* ---------- Mensagem de erro / sucesso ---------- */
function Feedback({ kind, message, nonce }: { kind: 'error' | 'info'; message: string; nonce: number }) {
  const reduced = useReducedMotion();
  const x = useSharedValue(0);

  // Balança de leve a cada erro novo, mesmo que a mensagem seja a mesma.
  useEffect(() => {
    if (kind !== 'error' || reduced) return;
    x.set(withSequence(
      withTiming(-7, { duration: 45 }),
      withTiming(7, { duration: 70 }),
      withTiming(-4, { duration: 60 }),
      withTiming(3, { duration: 55 }),
      withTiming(0, { duration: 50, easing: EASE_OUT }),
    ));
  }, [nonce, kind, reduced, x]);

  const shake = useAnimatedStyle(() => ({ transform: [{ translateX: x.get() }] }));
  const isError = kind === 'error';
  const FbIcon = isError ? WarningCircleIcon : CheckCircleIcon;

  return (
    <Animated.View style={shake}>
      <Animated.View entering={FadeInDown.duration(260).easing(EASE_OUT).withInitialValues({ transform: [{ translateY: 6 }] })} style={[s.feedback, isError ? s.feedbackError : s.feedbackInfo]} accessibilityLiveRegion="polite">
        <FbIcon size={16} color={isError ? C.error : C.ok} weight="fill" />
        <Text style={[s.feedbackText, { color: isError ? '#fecaca' : '#bbf7d0' }]}>{message}</Text>
      </Animated.View>
    </Animated.View>
  );
}

/* ---------- Botão principal ---------- */
function PrimaryButton({ label, onPress, disabled, busy }: { label: string; onPress: () => void; disabled: boolean; busy: boolean }) {
  const pressed = useSharedValue(0);

  const btnStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 - pressed.get() * 0.03 }],
    backgroundColor: interpolateColor(pressed.get(), [0, 1], [C.primary, C.primaryPressed]),
  }));
  const arrowStyle = useAnimatedStyle(() => ({ transform: [{ translateX: pressed.get() * 4 }] }));

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      onPressIn={() => pressed.set(withTiming(1, { duration: 100, easing: EASE_OUT }))}
      onPressOut={() => pressed.set(withTiming(0, { duration: 160, easing: EASE_OUT }))}
      pressRetentionOffset={20}
      accessibilityRole="button"
      accessibilityState={{ disabled, busy }}
    >
      <Animated.View style={[s.primaryBtn, !disabled && s.primaryBtnGlow, disabled && s.primaryBtnDisabled, btnStyle]}>
        {busy ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <>
            <Text style={s.primaryBtnText}>{label}</Text>
            <Animated.View style={arrowStyle}><ArrowRightIcon size={16} color="#fff" weight="bold" /></Animated.View>
          </>
        )}
      </Animated.View>
    </Pressable>
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
  const [error, setErrorText] = useState('');
  const [errorNonce, setErrorNonce] = useState(0);
  const [info, setInfo] = useState('');
  const [podeReenviar, setPodeReenviar] = useState(false);

  // Na primeira abertura os campos entram depois do cartão; nas trocas de modo, logo em seguida.
  const firstMount = useRef(true);
  useEffect(() => { firstMount.current = false; }, []);
  const baseDelay = firstMount.current ? 220 : 0;

  /** Define o erro e conta a ocorrência (para a mensagem balançar de novo mesmo quando o texto se repete). */
  const setError = (msg: string) => { setErrorText(msg); if (msg) setErrorNonce(n => n + 1); };

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

  const titulo = mode === 'login' ? 'Bem-vindo de volta' : mode === 'signup' ? 'Crie sua conta' : 'Recuperar acesso';
  const subtitulo = mode === 'login' ? 'Entre com o e-mail e a senha da sua conta.' : mode === 'signup' ? 'Crie uma senha forte para proteger sua conta.' : 'Informe o e-mail da conta. Enviaremos um link para criar uma nova senha.';
  const botao = mode === 'login' ? 'Entrar' : mode === 'signup' ? 'Criar conta' : 'Enviar link';

  let step = 0;
  const next = () => enter(step++, baseDelay);

  const form = (
    <View style={[s.formPanel, wide ? s.formPanelWide : s.formPanelCompact]}>
      <Animated.View entering={FadeIn.duration(400).delay(baseDelay)} style={s.topSwitch}>
        <Text style={s.topSwitchText}>{mode === 'signup' ? 'Já tem uma conta?' : 'Não tem uma conta?'}</Text>
        <Pressable onPress={() => switchMode(mode === 'signup' ? 'login' : 'signup')} style={({ pressed }) => [s.outlineBtn, pressed && s.outlineBtnPressed]}>
          <Text style={s.outlineBtnText}>{mode === 'signup' ? 'Entrar' : 'Criar conta'}</Text>
        </Pressable>
      </Animated.View>

      {/* Chave no modo: a troca entre entrar / criar / recuperar remonta o corpo e refaz a entrada escalonada. */}
      <View key={mode} style={s.formBody}>
        <Animated.Text entering={next()} style={s.title} accessibilityRole="header">{titulo}</Animated.Text>
        <Animated.Text entering={next()} style={s.subtitle}>{subtitulo}</Animated.Text>

        <Animated.View entering={next()}>
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
        </Animated.View>

        {mode !== 'forgot' && (
          <Animated.View entering={next()}>
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
          </Animated.View>
        )}

        {mode === 'login' && (
          <Animated.View entering={next()} style={s.forgot}>
            <Pressable onPress={() => switchMode('forgot')} hitSlop={8} accessibilityRole="link" style={({ pressed }) => pressed && { opacity: 0.6 }}>
              <Text style={s.link}>Esqueci a senha</Text>
            </Pressable>
          </Animated.View>
        )}

        {mode === 'signup' && (
          <Animated.View entering={next()}>
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
          </Animated.View>
        )}

        {error ? <Feedback key={`e${errorNonce}`} kind="error" message={error} nonce={errorNonce} /> : null}
        {info ? <Feedback key={`i${info}`} kind="info" message={info} nonce={0} /> : null}
        {podeReenviar && emailValid ? (
          <Pressable onPress={() => void reenviar()} disabled={busy} hitSlop={8} style={s.centerLink} accessibilityRole="button">
            <Text style={s.link}>Reenviar e-mail de confirmação</Text>
          </Pressable>
        ) : null}

        <Animated.View entering={next()}>
          <PrimaryButton label={botao} onPress={() => void submit()} disabled={!canSubmit} busy={busy} />
        </Animated.View>

        {mode === 'forgot' && (
          <Animated.View entering={next()} style={s.centerLink}>
            <Pressable onPress={() => switchMode('login')} hitSlop={8} accessibilityRole="link" style={({ pressed }) => pressed && { opacity: 0.6 }}>
              <Text style={s.link}>Voltar para o login</Text>
            </Pressable>
          </Animated.View>
        )}
      </View>
    </View>
  );

  return (
    <SafeAreaView style={s.safe}>
      {wide && (
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          <Drift duration={14000} dx={40} dy={30} style={{ width: 520, height: 520, borderRadius: 260, top: -200, right: -160, backgroundColor: '#4c1d95', opacity: 0.18 }} />
          <Drift duration={16000} delay={1000} dx={-30} dy={-40} style={{ width: 460, height: 460, borderRadius: 230, bottom: -220, left: -140, backgroundColor: '#3730a3', opacity: 0.16 }} />
        </View>
      )}
      <View style={s.flex}>
        <ScrollView contentContainerStyle={[s.scroll, wide && s.scrollWide]} keyboardShouldPersistTaps="handled">
          <Animated.View entering={cardEnter} style={[s.card, wide ? s.cardWide : s.cardCompact]}>
            <View style={[s.artPanel, wide ? s.artPanelWide : s.artPanelCompact]}>
              <Artwork compact={!wide} />
              <Brand />
              <Hero />
            </View>
            {form}
          </Animated.View>
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
  cardWide: { flexDirection: 'row', width: '100%', maxWidth: 1040, minHeight: 620, borderRadius: 28, borderWidth: 1, borderColor: C.border, boxShadow: '0 30px 80px rgba(0, 0, 0, 0.55), 0 0 0 1px rgba(255,255,255,0.02) inset' },
  cardCompact: { flex: 1 },
  artPanel: { overflow: 'hidden', justifyContent: 'space-between', backgroundColor: '#120a2e' },
  artPanelWide: { flex: 1.1, padding: 34, margin: 10, borderRadius: 20 },
  artPanelCompact: { height: 250, padding: 22, paddingBottom: 38 },
  formPanel: { backgroundColor: C.panel },
  formPanelWide: { flex: 1, paddingHorizontal: 48, paddingVertical: 28 },
  formPanelCompact: { flex: 1, paddingHorizontal: 22, paddingTop: 18, paddingBottom: 32, marginTop: -22, borderTopLeftRadius: 26, borderTopRightRadius: 26, boxShadow: '0 -12px 30px rgba(7, 6, 15, 0.6)' },
  topSwitch: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 10 },
  topSwitchText: { color: C.muted, fontSize: 12 },
  outlineBtn: { borderWidth: 1, borderColor: 'rgba(165, 180, 252, 0.5)', borderRadius: 999, paddingVertical: 7, paddingHorizontal: 16 },
  outlineBtnPressed: { backgroundColor: 'rgba(165, 180, 252, 0.12)', transform: [{ scale: 0.97 }] },
  outlineBtnText: { color: C.text, fontSize: 12, fontWeight: '700' },
  formBody: { flex: 1, justifyContent: 'center', width: '100%', maxWidth: 380, alignSelf: 'center', paddingTop: 24, gap: 4 },
  title: { color: C.text, fontSize: 26, fontWeight: '800', textAlign: 'center', letterSpacing: -0.3 },
  subtitle: { color: C.muted, fontSize: 13.5, textAlign: 'center', marginTop: 6, marginBottom: 12, lineHeight: 19 },
  matchText: { fontSize: 12, marginTop: 6 },
  feedback: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginTop: 14, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1 },
  feedbackError: { backgroundColor: 'rgba(248, 113, 113, 0.08)', borderColor: 'rgba(248, 113, 113, 0.3)' },
  feedbackInfo: { backgroundColor: 'rgba(74, 222, 128, 0.08)', borderColor: 'rgba(74, 222, 128, 0.3)' },
  feedbackText: { flex: 1, fontSize: 12.5, lineHeight: 18 },
  primaryBtn: { marginTop: 22, height: 50, borderRadius: 14, backgroundColor: C.primary, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  primaryBtnGlow: { boxShadow: '0 10px 28px rgba(79, 70, 229, 0.45)' },
  primaryBtnDisabled: { opacity: 0.4 },
  primaryBtnText: { color: '#fff', fontSize: 15, fontWeight: '800', letterSpacing: 0.3 },
  link: { color: C.accent, fontSize: 13, fontWeight: '700' },
  forgot: { alignSelf: 'flex-end', marginTop: 10, paddingVertical: 4 },
  centerLink: { alignSelf: 'center', marginTop: 14, paddingVertical: 4 },
});

const f = StyleSheet.create({
  field: { marginTop: 14 },
  label: { color: C.muted, fontSize: 12, fontWeight: '700', marginBottom: 6, marginLeft: 2 },
  labelFocus: { color: C.accent },
  row: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 14, minHeight: 50, paddingHorizontal: 14 },
  glow: { position: 'absolute', top: -4, left: -4, right: -4, bottom: -4, borderRadius: 18, borderWidth: 4, borderColor: 'rgba(129, 140, 248, 0.18)' },
  glowInvalid: { borderColor: 'rgba(248, 113, 113, 0.18)' },
  leading: { width: 28, alignItems: 'flex-start', justifyContent: 'center' },
  input: { flex: 1, color: C.text, fontSize: 15, paddingVertical: 12 },
  eye: { paddingLeft: 10, paddingVertical: 8 },
});

const m = StyleSheet.create({
  wrap: { marginTop: 16 },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { color: C.muted, fontSize: 12 },
  level: { fontSize: 12, fontWeight: '800' },
  track: { height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.08)', marginTop: 8, overflow: 'hidden' },
  bar: { position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: 3 },
  reqTitle: { color: C.muted, fontSize: 12, marginTop: 14, marginBottom: 4 },
  req: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 2 },
  reqText: { fontSize: 12.5 },
  okText: { color: C.ok },
  pendingText: { color: C.faint },
});

const p = StyleSheet.create({
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  logoWrap: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(237, 233, 254, 0.08)', borderWidth: 1, borderColor: 'rgba(237, 233, 254, 0.14)' },
  brandText: { color: '#fff', fontSize: 20, fontWeight: '800', letterSpacing: 0.2 },
  eyebrow: { color: C.accent, fontSize: 11, fontWeight: '800', letterSpacing: 1.6, marginBottom: 8 },
  slideBox: { height: 82 },
  slide: { position: 'absolute', left: 0, right: 0, top: 0 },
  slideHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  badge: { width: 28, height: 28, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(237, 233, 254, 0.12)', borderWidth: 1, borderColor: 'rgba(237, 233, 254, 0.18)' },
  heroTitle: { color: '#fff', fontSize: 20, fontWeight: '800', letterSpacing: -0.2 },
  heroText: { color: 'rgba(237, 233, 254, 0.75)', fontSize: 13, marginTop: 8, maxWidth: 320, lineHeight: 19 },
  dots: { flexDirection: 'row', gap: 6, marginTop: 10 },
  dot: { width: 18, height: 3, borderRadius: 2, backgroundColor: 'rgba(237, 233, 254, 0.3)' },
  dotActive: { backgroundColor: '#ede9fe' },
});

const art = StyleSheet.create({
  abs: { position: 'absolute' },
  star: { backgroundColor: '#ede9fe' },
});
