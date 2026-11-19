import { useRouter } from 'expo-router';
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  View,
  type ViewStyle,
} from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  Extrapolation,
  FadeInDown,
  interpolate,
  interpolateColor,
  Keyframe,
  type SharedValue,
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
import { useTela } from '../ui/zoom';
import { pedirAcesso } from '../lib/acesso';
import { supabase } from '../lib/supabase';
import { Logo } from './Logo';
import {
  ArrowRightIcon,
  CheckCircleIcon,
  CheckIcon,
  EnvelopeIcon,
  EyeIcon,
  EyeSlashIcon,
  LockSimpleIcon,
  WarningCircleIcon,
  XIcon,
} from '../ui/icons';

/* ---------- Paleta (marca EasyAudit: azul-marinho e verde-menta) ---------- */
export const C = {
  bg: '#e9edf2',
  panel: '#ffffff',
  border: '#dde3eb',
  text: '#0f1f3d',
  muted: '#5b6680',
  faint: '#8a93a6',
  line: '#d6dce6',
  lineFocus: '#0f1f3d',
  primary: '#0f1f3d',
  primaryPressed: '#0a1630',
  accent: '#17865a',
  ok: '#1a8f58',
  error: '#c0362c',
  navy: '#0f1f3d',
  mint: '#5fd39a',
};

/* ---------- Movimento ---------- */
const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1);
/** Painel atravessando a tela: começa e termina suave. */
const EASE_IN_OUT = Easing.bezier(0.77, 0, 0.175, 1);
const EASE_DRIFT = Easing.inOut(Easing.sin);

/** Entrada escalonada: cada item sobe 12px e aparece, 55ms depois do anterior. Respeita "reduzir movimento" do sistema. */
const enter = (i: number, base = 0) =>
  // Na web, a entrada de layout do Reanimated dentro de uma coluna com transform deixa os itens com
  // position:absolute presos (campos sobrepostos). Lá a troca já é feita pelo painel deslizante.
  Platform.OS === 'web' ? undefined
    : FadeInDown.duration(460).delay(base + i * 55).easing(EASE_OUT).withInitialValues({ transform: [{ translateY: 12 }] });

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
  { min: 0, label: 'Fraca', color: '#d93b30' },
  { min: 3, label: 'Regular', color: '#e07a12' },
  { min: 4, label: 'Boa', color: '#c99a06' },
  { min: 5, label: 'Forte', color: '#1a8f58' },
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
    backgroundColor: interpolateColor(focus.get(), [0, 1], ['#f6f8fb', '#ffffff']),
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

/* ---------- Arte do painel azul-marinho (formas flutuando devagar) ---------- */
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

function ArteMarca({ compacto }: { compacto: boolean }) {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Drift duration={11000} dx={22} dy={16} style={{ width: 380, height: 380, borderRadius: 190, top: compacto ? -230 : -150, right: -150, backgroundColor: 'rgba(95, 211, 154, 0.10)' }} />
      <Drift duration={13000} delay={500} dx={-18} dy={22} spin={6} style={{ width: 300, height: 300, borderRadius: 150, bottom: compacto ? -220 : -120, left: -110, borderWidth: 30, borderColor: 'rgba(95, 211, 154, 0.12)' }} />
      <Drift duration={9000} delay={300} dx={14} dy={-12} style={{ width: 140, height: 140, borderRadius: 70, top: compacto ? 30 : 140, left: compacto ? 210 : 260, borderWidth: 2, borderColor: 'rgba(255, 255, 255, 0.10)' }} />
      <Drift duration={8000} dx={20} dy={-8} baseRotate={-32} style={{ width: 160, height: 12, borderRadius: 6, top: compacto ? 96 : 230, left: compacto ? -30 : 40, backgroundColor: 'rgba(95, 211, 154, 0.22)' }} />
    </View>
  );
}

/* ---------- Painel da marca: troca de lado (entrar ↔ criar conta) ---------- */
function BotaoContorno({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} pressRetentionOffset={20} accessibilityRole="button" hitSlop={6}
      style={({ pressed }) => [pm.botao, pressed && pm.botaoPressionado]}>
      <Text style={pm.botaoTxt}>{label}</Text>
      <ArrowRightIcon size={15} color="#ffffff" weight="bold" />
    </Pressable>
  );
}

const DESTAQUES = ['Aferições, contagens e conferência de estoque', 'Relatórios em PDF no app e no painel', 'Cada atividade registrada com quem fez'];

/**
 * Painel azul-marinho. Na tela larga ele cobre metade do cartão e atravessa para o outro lado na troca;
 * o texto convida para o lado oposto ao formulário que está à mostra.
 */
function PainelMarca({ p, lado, onTrocar }: { p: SharedValue<number>; lado: 0 | 1; onTrocar: (m: Mode) => void }) {
  const router = useRouter();
  const blocoCriar = useAnimatedStyle(() => ({
    opacity: interpolate(p.get(), [0, 0.45], [1, 0], Extrapolation.CLAMP),
    transform: [{ translateX: interpolate(p.get(), [0, 1], [0, -36]) }],
  }));
  const blocoEntrar = useAnimatedStyle(() => ({
    opacity: interpolate(p.get(), [0.55, 1], [0, 1], Extrapolation.CLAMP),
    transform: [{ translateX: interpolate(p.get(), [0, 1], [36, 0]) }],
  }));
  return (
    <View style={pm.painel}>
      <ArteMarca compacto={false} />
      <Logo claro altura={30} />
      <View style={pm.textos}>
        <Animated.View style={[pm.bloco, blocoCriar]} pointerEvents={lado === 0 ? 'auto' : 'none'} {...oculto(lado !== 0)}>
          <Text style={pm.titulo}>Novo por aqui?</Text>
          <Text style={pm.texto}>Se a sua empresa já usa o EasyAudit, peça um convite ao administrador. Para usar na sua empresa, cadastre-a.</Text>
          <BotaoContorno label="Começar agora" onPress={() => router.push('/comecar')} />
        </Animated.View>
        <Animated.View style={[pm.bloco, pm.sobreposto, blocoEntrar]} pointerEvents={lado === 1 ? 'auto' : 'none'} {...oculto(lado !== 1)}>
          <Text style={pm.titulo}>Já tem conta?</Text>
          <Text style={pm.texto}>Entre com o seu e-mail e a sua senha para continuar de onde parou.</Text>
          <BotaoContorno label="Entrar" onPress={() => onTrocar('login')} />
        </Animated.View>
      </View>
      <View style={pm.destaques}>
        {DESTAQUES.map(d => (
          <View key={d} style={pm.destaque}>
            <CheckCircleIcon size={16} color={C.mint} weight="fill" />
            <Text style={pm.destaqueTxt}>{d}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

/** Topo do celular: marca e frase, no mesmo azul-marinho. */
function TopoMarca() {
  return (
    <View style={pm.topo}>
      <ArteMarca compacto />
      <Logo claro altura={26} />
      <Text style={pm.topoTxt}>Auditorias, contagens e aferições da rede em um só lugar.</Text>
    </View>
  );
}

/** Celular: Entrar | Criar conta, com a pílula deslizando junto com os formulários. */
function Alternador({ p, lado, onTrocar }: { p: SharedValue<number>; lado: 0 | 1; onTrocar: (m: Mode) => void }) {
  const [w, setW] = useState(0);
  const metade = Math.max(0, (w - 8) / 2);
  const pilula = useAnimatedStyle(() => ({ transform: [{ translateX: p.get() * metade }] }), [metade]);
  return (
    <View style={sw.trilho} onLayout={e => setW(e.nativeEvent.layout.width)} accessibilityRole="tablist">
      {w ? <Animated.View style={[sw.pilula, { width: metade }, pilula]} /> : null}
      {(['login', 'signup'] as const).map((md, i) => (
        <Pressable key={md} style={sw.opcao} onPress={() => onTrocar(md)} accessibilityRole="tab" accessibilityState={{ selected: lado === i }} hitSlop={4}>
          <Text style={[sw.txt, lado === i && sw.txtOn]}>{md === 'login' ? 'Entrar' : 'Criar conta'}</Text>
        </Pressable>
      ))}
    </View>
  );
}

/** Lado que não está à mostra: sem toque e fora do leitor de tela. */
const oculto = (h: boolean) => ({ accessibilityElementsHidden: h, importantForAccessibility: h ? 'no-hide-descendants' as const : 'auto' as const });

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
        <Text style={[s.feedbackText, { color: isError ? '#8f1d16' : '#14532d' }]}>{message}</Text>
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
            <Animated.View style={arrowStyle}><ArrowRightIcon size={16} color={C.mint} weight="bold" /></Animated.View>
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
  if (msg.includes('banned') || e.code === 'user_banned') return 'Este usuário está inativo. Fale com o administrador do EasyAudit.';
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

/**
 * Entrar / Criar conta com painel deslizante:
 * - tela larga (web): cartão com o formulário de um lado e o painel azul-marinho do outro; na troca o painel
 *   atravessa o cartão e o formulário passa para o lado oposto;
 * - celular: os dois formulários lado a lado num trilho que desliza (o de entrar sai pela esquerda e o de criar
 *   conta entra pela direita), com a pílula de Entrar | Criar conta acompanhando.
 * Com "reduzir movimento" ligado, nada desliza: os formulários só trocam com um esmaecimento curto.
 */
export default function AuthScreen() {
  const { width } = useTela();
  const wide = width >= 820;
  const reduced = useReducedMotion();

  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setErrorText] = useState('');
  const [errorNonce, setErrorNonce] = useState(0);
  const [info, setInfo] = useState('');
  const [podeReenviar, setPodeReenviar] = useState(false);
  /** Recuperar acesso: e-mail para onde o link foi enviado (mostra a confirmação no lugar do formulário). */
  const [enviadoPara, setEnviadoPara] = useState<string | null>(null);
  /** Segundos até poder pedir outro link. */
  const [espera, setEspera] = useState(0);
  useEffect(() => {
    if (espera <= 0) return;
    const t = setTimeout(() => setEspera(v => v - 1), 1000);
    return () => clearTimeout(t);
  }, [espera]);
  // Volta do link de confirmação do cadastro (web): avisa e limpa o endereço.
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    if (/[?&]recuperar=1/.test(window.location.search)) { setMode('forgot'); window.history.replaceState(null, '', window.location.pathname); }
    if (/[?&]confirmado=1/.test(window.location.search)) {
      setInfo('E-mail confirmado. Agora é só entrar com o seu e-mail e a senha.');
      window.history.replaceState(null, '', window.location.pathname);
    }
  }, []);

  // Lado à mostra: 0 = entrar (ou recuperar a senha), 1 = criar conta.
  const lado: 0 | 1 = mode === 'signup' ? 1 : 0;
  /** Progresso da troca (0 → 1), animado. */
  const p = useSharedValue<number>(lado);
  /** Lado de destino, sem animação (posição usada com "reduzir movimento"). */
  const alvo = useSharedValue<number>(lado);
  useEffect(() => {
    alvo.set(lado);
    p.set(withTiming(lado, reduced ? { duration: 180, easing: EASE_OUT } : { duration: wide ? 640 : 460, easing: EASE_IN_OUT }));
  }, [lado, reduced, wide, p, alvo]);

  // Na primeira abertura os campos entram depois do cartão; nas trocas, logo em seguida.
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
    if (next === mode) return;
    setMode(next);
    setPassword('');
    setConfirm('');
    setError('');
    setInfo('');
    setPodeReenviar(false);
    setEnviadoPara(null);
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
        // Pelo servidor: o e-mail de confirmação sai no layout do EasyAudit, com o link na web.
        const err = await pedirAcesso({ acao: 'cadastrar', senha: password }, mail);
        if (err) setError(err);
        else {
          void AsyncStorage.setItem(ULTIMO_EMAIL, mail).catch(() => undefined);
          switchMode('login');
          setInfo(`Conta criada. Abra o link de confirmação enviado para ${mail} e depois entre. Para ver os dados, a conta precisa do convite do administrador da sua empresa (ou cadastre a sua empresa ao entrar).`);
          setPodeReenviar(true);
        }
      } else {
        const err = await pedirAcesso({ acao: 'recuperar' }, mail);
        if (err) setError(err);
        else { setEnviadoPara(mail); setEspera(60); void AsyncStorage.setItem(ULTIMO_EMAIL, mail).catch(() => undefined); }
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
    const err = await pedirAcesso({ acao: 'confirmar' }, email.trim().toLowerCase());
    setBusy(false);
    if (err) setError(err); else { setError(''); setInfo('Enviamos um novo link de confirmação. Verifique também a caixa de spam.'); }
  };

  /** Conteúdo de um formulário (o de entrar/recuperar ou o de criar conta). Só o lado à mostra recebe as mensagens. */
  const corpo = (md: Mode, ativo: boolean) => {
    let step = 0;
    const next = () => enter(step++, baseDelay);
    // Link de recuperação enviado: confirmação no lugar do formulário.
    if (md === 'forgot' && enviadoPara) return (
      <View key="enviado" style={s.formBody}>
        <Animated.View entering={next()} style={s.seloEnviado}><EnvelopeIcon size={30} color={C.accent} weight="duotone" /></Animated.View>
        <Animated.Text entering={next()} style={s.title} accessibilityRole="header">Confira o seu e-mail</Animated.Text>
        <Animated.Text entering={next()} style={s.subtitle}>Se existir uma conta com <Text style={{ color: C.text, fontWeight: '800' }}>{enviadoPara}</Text>, enviamos um link para criar uma nova senha.</Animated.Text>
        <Animated.View entering={next()} style={s.dicas}>
          {['Abra o e-mail "Crie uma nova senha · EasyAudit".', 'Toque em Criar nova senha: a página abre no navegador.', 'Não chegou? Veja a caixa de spam ou promoções.'].map((d, i) => (
            <View key={i} style={s.dica}><View style={s.dicaNum}><Text style={s.dicaNumTxt}>{i + 1}</Text></View><Text style={s.dicaTxt}>{d}</Text></View>
          ))}
        </Animated.View>
        {ativo && error ? <Feedback key={`e${errorNonce}`} kind="error" message={error} nonce={errorNonce} /> : null}
        <Animated.View entering={next()}>
          <PrimaryButton label={espera > 0 ? `Reenviar em ${espera}s` : 'Reenviar o link'} onPress={() => void submit()} disabled={!ativo || espera > 0 || busy} busy={ativo && busy} />
        </Animated.View>
        <Animated.View entering={next()} style={s.centerLink}>
          <Pressable onPress={() => switchMode('login')} hitSlop={8} accessibilityRole="link" style={({ pressed }) => pressed && { opacity: 0.6 }}>
            <Text style={s.link}>Voltar para o login</Text>
          </Pressable>
        </Animated.View>
      </View>
    );
    const titulo = md === 'login' ? 'Bem-vindo de volta' : md === 'signup' ? 'Crie sua conta' : 'Recuperar acesso';
    const subtitulo = md === 'login' ? 'Entre com o e-mail e a senha da sua conta.' : md === 'signup' ? 'Crie uma senha forte para proteger sua conta.' : 'Informe o e-mail da conta. Enviaremos um link para criar uma nova senha.';
    const botao = md === 'login' ? 'Entrar' : md === 'signup' ? 'Criar conta' : 'Enviar link';
    return (
      // Chave no modo: trocar entre entrar e recuperar remonta o corpo e refaz a entrada escalonada.
      <View key={md} style={s.formBody}>
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
            returnKeyType={md === 'forgot' ? 'send' : 'next'}
            onSubmitEditing={md === 'forgot' ? () => void submit() : undefined}
          />
        </Animated.View>

        {md !== 'forgot' && (
          <Animated.View entering={next()}>
            <AuthInput
              label={md === 'login' ? 'Senha' : 'Nova senha'}
              leading={<LockSimpleIcon size={18} color={C.accent} />}
              secure
              value={password}
              onChangeText={setPassword}
              placeholder={md === 'login' ? 'Digite sua senha' : 'Digite sua nova senha'}
              autoComplete={md === 'login' ? 'current-password' : 'new-password'}
              textContentType={md === 'login' ? 'password' : 'newPassword'}
              returnKeyType={md === 'login' ? 'go' : 'next'}
              onSubmitEditing={md === 'login' ? () => void submit() : undefined}
            />
          </Animated.View>
        )}

        {md === 'login' && (
          <Animated.View entering={next()} style={s.forgot}>
            <Pressable onPress={() => switchMode('forgot')} hitSlop={8} accessibilityRole="link" style={({ pressed }) => pressed && { opacity: 0.6 }}>
              <Text style={s.link}>Esqueci a senha</Text>
            </Pressable>
          </Animated.View>
        )}

        {md === 'signup' && (
          <Animated.View entering={next()}>
            {/* Medidor só no lado à mostra: no celular o trilho não fica com espaço sobrando embaixo do login. */}
            {ativo ? <PasswordStrength value={password} /> : null}
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

        {ativo && error ? <Feedback key={`e${errorNonce}`} kind="error" message={error} nonce={errorNonce} /> : null}
        {ativo && info ? <Feedback key={`i${info}`} kind="info" message={info} nonce={0} /> : null}
        {ativo && podeReenviar && emailValid ? (
          <Pressable onPress={() => void reenviar()} disabled={busy} hitSlop={8} style={s.centerLink} accessibilityRole="button">
            <Text style={s.link}>Reenviar e-mail de confirmação</Text>
          </Pressable>
        ) : null}

        <Animated.View entering={next()}>
          <PrimaryButton label={botao} onPress={() => void submit()} disabled={!ativo || !canSubmit} busy={ativo && busy} />
        </Animated.View>

        {md === 'forgot' && (
          <Animated.View entering={next()} style={s.centerLink}>
            <Pressable onPress={() => switchMode('login')} hitSlop={8} accessibilityRole="link" style={({ pressed }) => pressed && { opacity: 0.6 }}>
              <Text style={s.link}>Voltar para o login</Text>
            </Pressable>
          </Animated.View>
        )}
      </View>
    );
  };
  const modoEntrar: Mode = mode === 'forgot' ? 'forgot' : 'login';

  /* ----- Tela larga: painel atravessando o cartão ----- */
  const [larguraCartao, setLarguraCartao] = useState(0);
  const metade = (larguraCartao || Math.min(width - 64, 1040)) / 2;
  // A posição é lida direto em cada estilo (na web o Reanimated só acompanha os valores usados ali dentro).
  const colEntrar = useAnimatedStyle(() => ({
    opacity: interpolate(p.get(), [0, 0.5], [1, 0], Extrapolation.CLAMP),
    transform: [{ translateX: (reduced ? alvo.get() : p.get()) * metade }],
  }), [metade, reduced]);
  const colCriar = useAnimatedStyle(() => ({
    opacity: interpolate(p.get(), [0.5, 1], [0, 1], Extrapolation.CLAMP),
    transform: [{ translateX: (reduced ? alvo.get() : p.get()) * metade }],
  }), [metade, reduced]);
  const painel = useAnimatedStyle(() => ({ transform: [{ translateX: -(reduced ? alvo.get() : p.get()) * metade }] }), [metade, reduced]);

  /* ----- Celular: trilho com os dois formulários ----- */
  const [larguraTrilho, setLarguraTrilho] = useState(0);
  const coluna = larguraTrilho || Math.max(0, width - 28);
  const trilho = useAnimatedStyle(() => ({ transform: [{ translateX: -(reduced ? alvo.get() : p.get()) * coluna }] }), [coluna, reduced]);
  const opEntrar = useAnimatedStyle(() => ({ opacity: interpolate(p.get(), [0, 1], [1, 0]) }));
  const opCriar = useAnimatedStyle(() => ({ opacity: interpolate(p.get(), [0, 1], [0, 1]) }));

  if (wide) {
    return (
      <SafeAreaView style={s.safe}>
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          <Drift duration={14000} dx={40} dy={30} style={{ width: 520, height: 520, borderRadius: 260, top: -200, right: -160, backgroundColor: 'rgba(15, 31, 61, 0.06)' }} />
          <Drift duration={16000} delay={1000} dx={-30} dy={-40} style={{ width: 460, height: 460, borderRadius: 230, bottom: -220, left: -140, backgroundColor: 'rgba(95, 211, 154, 0.12)' }} />
        </View>
        <ScrollView contentContainerStyle={s.scrollWide} keyboardShouldPersistTaps="handled">
          <Animated.View entering={cardEnter} style={s.cardWide} onLayout={e => setLarguraCartao(e.nativeEvent.layout.width)}>
            <Animated.View style={[s.colunaLarga, { width: metade }, colEntrar]} pointerEvents={lado === 0 ? 'auto' : 'none'} {...oculto(lado !== 0)}>
              <ScrollView contentContainerStyle={s.colunaScroll} keyboardShouldPersistTaps="handled">{corpo(modoEntrar, lado === 0)}</ScrollView>
            </Animated.View>
            <Animated.View style={[s.colunaLarga, { width: metade }, colCriar]} pointerEvents={lado === 1 ? 'auto' : 'none'} {...oculto(lado !== 1)}>
              <ScrollView contentContainerStyle={s.colunaScroll} keyboardShouldPersistTaps="handled">{corpo('signup', lado === 1)}</ScrollView>
            </Animated.View>
            <Animated.View style={[s.colunaLarga, { width: metade, left: metade }, painel]}>
              <PainelMarca p={p} lado={lado} onTrocar={switchMode} />
            </Animated.View>
          </Animated.View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.safeCompacto} edges={['top']}>
      <ScrollView style={s.fundoCompacto} contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
        <TopoMarca />
        <Animated.View entering={cardEnter} style={s.areaCompacta}>
          {mode === 'forgot' ? null : <Alternador p={p} lado={lado} onTrocar={switchMode} />}
          <View style={s.janela} onLayout={e => setLarguraTrilho(e.nativeEvent.layout.width)}>
            <Animated.View style={[s.trilho, { width: coluna * 2 }, trilho]}>
              <Animated.View style={[s.colunaCompacta, { width: coluna }, opEntrar]} pointerEvents={lado === 0 ? 'auto' : 'none'} {...oculto(lado !== 0)}>
                {corpo(modoEntrar, lado === 0)}
              </Animated.View>
              <Animated.View style={[s.colunaCompacta, { width: coluna }, opCriar]} pointerEvents={lado === 1 ? 'auto' : 'none'} {...oculto(lado !== 1)}>
                {corpo('signup', lado === 1)}
              </Animated.View>
            </Animated.View>
          </View>
        </Animated.View>
      </ScrollView>
    </SafeAreaView>
  );
}

/* ---------- Estilos ---------- */
const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  safeCompacto: { flex: 1, backgroundColor: C.navy },
  fundoCompacto: { backgroundColor: C.panel },
  scroll: { flexGrow: 1 },
  scrollWide: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  cardWide: { width: '100%', maxWidth: 1040, height: 680, borderRadius: 28, overflow: 'hidden', backgroundColor: C.panel, borderWidth: 1, borderColor: C.border, boxShadow: '0 30px 70px rgba(15, 31, 61, 0.18)' },
  colunaLarga: { position: 'absolute', top: 0, bottom: 0, left: 0 },
  colunaScroll: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 48, paddingVertical: 28 },
  areaCompacta: { flex: 1, backgroundColor: C.panel, marginTop: -24, borderTopLeftRadius: 26, borderTopRightRadius: 26, paddingHorizontal: 22, paddingTop: 20, paddingBottom: 32 },
  // Folga de 8px nas laterais: o contorno de foco dos campos não é cortado pela janela do trilho.
  janela: { overflow: 'hidden', marginHorizontal: -8 },
  colunaCompacta: { paddingHorizontal: 8 },
  trilho: { flexDirection: 'row', alignItems: 'flex-start' },
  formBody: { width: '100%', maxWidth: 380, alignSelf: 'center', paddingTop: 12, gap: 4 },
  title: { color: C.text, fontSize: 26, fontWeight: '800', textAlign: 'center', letterSpacing: -0.3 },
  subtitle: { color: C.muted, fontSize: 13.5, textAlign: 'center', marginTop: 6, marginBottom: 12, lineHeight: 19 },
  matchText: { fontSize: 12, marginTop: 6 },
  feedback: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginTop: 14, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1 },
  feedbackError: { backgroundColor: 'rgba(192, 54, 44, 0.07)', borderColor: 'rgba(192, 54, 44, 0.3)' },
  feedbackInfo: { backgroundColor: 'rgba(26, 143, 88, 0.08)', borderColor: 'rgba(26, 143, 88, 0.3)' },
  feedbackText: { flex: 1, fontSize: 12.5, lineHeight: 18 },
  primaryBtn: { marginTop: 22, height: 50, borderRadius: 14, backgroundColor: C.primary, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  primaryBtnGlow: { boxShadow: '0 10px 24px rgba(15, 31, 61, 0.28)' },
  primaryBtnDisabled: { opacity: 0.4 },
  primaryBtnText: { color: '#fff', fontSize: 15, fontWeight: '800', letterSpacing: 0.3 },
  link: { color: C.accent, fontSize: 13, fontWeight: '700' },
  forgot: { alignSelf: 'flex-end', marginTop: 10, paddingVertical: 4 },
  centerLink: { alignSelf: 'center', marginTop: 14, paddingVertical: 4 },
  seloEnviado: { alignSelf: 'center', width: 64, height: 64, borderRadius: 20, backgroundColor: 'rgba(95,211,154,0.16)', alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  dicas: { backgroundColor: C.bg, borderRadius: 14, padding: 14, gap: 10, marginBottom: 6, borderWidth: 1, borderColor: C.border },
  dica: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  dicaNum: { width: 22, height: 22, borderRadius: 11, backgroundColor: C.navy, alignItems: 'center', justifyContent: 'center' },
  dicaNumTxt: { color: '#fff', fontSize: 12, fontWeight: '800' },
  dicaTxt: { flex: 1, color: C.text, fontSize: 13.5, lineHeight: 19 },
});

const f = StyleSheet.create({
  field: { marginTop: 14 },
  label: { color: C.muted, fontSize: 12, fontWeight: '700', marginBottom: 6, marginLeft: 2 },
  labelFocus: { color: C.text },
  row: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 14, minHeight: 50, paddingHorizontal: 14 },
  glow: { position: 'absolute', top: -4, left: -4, right: -4, bottom: -4, borderRadius: 18, borderWidth: 4, borderColor: 'rgba(95, 211, 154, 0.32)' },
  glowInvalid: { borderColor: 'rgba(192, 54, 44, 0.18)' },
  leading: { width: 28, alignItems: 'flex-start', justifyContent: 'center' },
  input: { flex: 1, color: C.text, fontSize: 15, paddingVertical: 12 },
  eye: { paddingLeft: 10, paddingVertical: 8 },
});

const m = StyleSheet.create({
  wrap: { marginTop: 16 },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { color: C.muted, fontSize: 12 },
  level: { fontSize: 12, fontWeight: '800' },
  track: { height: 6, borderRadius: 3, backgroundColor: '#e6eaf0', marginTop: 8, overflow: 'hidden' },
  bar: { position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: 3 },
  reqTitle: { color: C.muted, fontSize: 12, marginTop: 14, marginBottom: 4 },
  req: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 2 },
  reqText: { fontSize: 12.5 },
  okText: { color: C.ok },
  pendingText: { color: C.faint },
});

const pm = StyleSheet.create({
  painel: { flex: 1, overflow: 'hidden', backgroundColor: C.navy, padding: 40, justifyContent: 'space-between' },
  textos: { minHeight: 200, justifyContent: 'center' },
  bloco: { gap: 12 },
  sobreposto: { position: 'absolute', left: 0, right: 0 },
  titulo: { color: '#ffffff', fontSize: 28, fontWeight: '800', letterSpacing: -0.4 },
  texto: { color: 'rgba(255, 255, 255, 0.78)', fontSize: 14, lineHeight: 21, maxWidth: 360 },
  botao: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8, borderWidth: 1.5, borderColor: 'rgba(255, 255, 255, 0.75)', borderRadius: 999, paddingVertical: 11, paddingHorizontal: 22 },
  botaoPressionado: { backgroundColor: 'rgba(255, 255, 255, 0.12)', transform: [{ scale: 0.97 }] },
  botaoTxt: { color: '#ffffff', fontSize: 14, fontWeight: '800', letterSpacing: 0.2 },
  destaques: { gap: 10 },
  destaque: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  destaqueTxt: { color: 'rgba(255, 255, 255, 0.82)', fontSize: 13 },
  topo: { overflow: 'hidden', backgroundColor: C.navy, paddingHorizontal: 22, paddingTop: 26, paddingBottom: 52, gap: 12 },
  topoTxt: { color: 'rgba(255, 255, 255, 0.8)', fontSize: 14, lineHeight: 20, maxWidth: 300 },
});

const sw = StyleSheet.create({
  trilho: { flexDirection: 'row', backgroundColor: '#eef1f5', borderRadius: 999, padding: 4, marginBottom: 6 },
  pilula: { position: 'absolute', top: 4, bottom: 4, left: 4, borderRadius: 999, backgroundColor: C.navy },
  opcao: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 11 },
  txt: { color: C.muted, fontSize: 14, fontWeight: '700' },
  txtOn: { color: '#ffffff' },
});

const art = StyleSheet.create({
  abs: { position: 'absolute' },
});
