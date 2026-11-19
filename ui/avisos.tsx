import { useContext, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Platform, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  cancelAnimation, Easing, FadeIn, FadeInUp, FadeOut, FadeOutUp, LinearTransition, ReduceMotion, runOnJS, useAnimatedStyle,
  useReducedMotion, useSharedValue, withSpring, withTiming, ZoomIn, ZoomOut,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CheckCircleIcon, type Icon, InfoIcon, QuestionIcon, TrashIcon, WarningCircleIcon, XIcon } from './icons';
import { ThemeContext } from './theme';

// Avisos do app no lugar das caixas do navegador (alert/confirm) e do Alert do Android:
// - notify → toast: aparece no topo, some sozinho (barra de tempo), pausa com o mouse em cima ou o dedo segurando,
//   toque abre o texto inteiro, arrastar para o lado dispensa. Não pede "OK".
// - confirmAction → modal: pergunta com Cancelar e a ação (vermelha quando apaga/zera/bloqueia); Esc e Enter no teclado.

export type TomAviso = 'sucesso' | 'erro' | 'info';
type Toast = { id: number; titulo: string; texto: string; tom: TomAviso; fixo: boolean };
type Pergunta = { id: number; titulo: string; texto: string; rotulo: string; perigo: boolean; ok: () => void };

let seq = 0;
let toasts: Toast[] = [];
let perguntas: Pergunta[] = [];
let hosts = 0;
let versao = 0;
const ouvintes = new Set<() => void>();
const avisar = () => { versao++; ouvintes.forEach(f => f()); };
const assinar = (f: () => void) => { ouvintes.add(f); return () => { ouvintes.delete(f); }; };

/** Há um AvisosHost montado (senão o kit usa as caixas do sistema). */
export const avisosProntos = () => hosts > 0;

const ERRO = /(^|\s)(n[ãa]o\s|sem\s|falh|erro|inv[áa]lid|imposs|barrad|expir|aguarde|confira|escolha\s|informe\s|marque\s|limite|j[áa]\sexiste|recusad)|n[ãa]o foi poss[íi]vel/i;
const SUCESSO = /salv|enviad|criad|cri[ao]u|atualiz|finaliz|conclu|pront|copiad|importad|exportad|exclu[íi]d|ligad|liberad|cadastrad|alterad|corrigid|zerad|gerad|aprovad|encerrad|reabert|desfeit|sincroniz/i;
/** Tom pelo título (os avisos antigos não dizem se são erro ou sucesso). */
export const tomDe = (titulo: string): TomAviso => (ERRO.test(titulo) ? 'erro' : SUCESSO.test(titulo) ? 'sucesso' : 'info');

export function mostrarToast(titulo: string, texto = '', opcoes: { tom?: TomAviso; fixo?: boolean } = {}) {
  const t: Toast = { id: ++seq, titulo, texto, tom: opcoes.tom ?? tomDe(titulo), fixo: !!opcoes.fixo };
  // O mesmo aviso repetido não empilha: o antigo sai e o novo entra no topo.
  toasts = [t, ...toasts.filter(x => !(x.titulo === titulo && x.texto === texto))].slice(0, 4);
  avisar();
}
const fecharToast = (id: number) => { toasts = toasts.filter(t => t.id !== id); avisar(); };

const PERIGO = /exclu|apag|zerar|remov|bloque|inativ|descart|desfaz|sair|limpar/i;
export function perguntar(titulo: string, texto: string, rotulo: string, ok: () => void) {
  perguntas = [...perguntas, { id: ++seq, titulo, texto, rotulo, perigo: PERIGO.test(rotulo), ok }];
  avisar();
}
const responder = (id: number, confirmou: boolean) => {
  const p = perguntas.find(x => x.id === id);
  perguntas = perguntas.filter(x => x.id !== id);
  avisar();
  if (confirmou && p) setTimeout(p.ok, 0); // depois de fechar o modal (a ação pode abrir outro aviso)
};

/** Desenha os toasts e o modal de confirmação. Montado uma vez na raiz do app. */
export function AvisosHost() {
  useSyncExternalStore(assinar, () => versao, () => versao);
  useEffect(() => { hosts++; return () => { hosts--; }; }, []);
  const pergunta = perguntas[0];
  return (
    <View pointerEvents="box-none" style={[StyleSheet.absoluteFill, s.camada]}>
      {pergunta ? <Modal key={pergunta.id} p={pergunta} /> : null}
      <Pilha lista={toasts} />
    </View>
  );
}

/* ---------- Toasts ---------- */
function Pilha({ lista }: { lista: Toast[] }) {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const largo = width >= 900;
  return (
    <View pointerEvents="box-none" style={[s.pilha, largo ? { right: 20, top: 20, width: 400 } : { left: 12, right: 12, top: insets.top + 10 }]}>
      {lista.map(t => <ToastItem key={t.id} t={t} />)}
    </View>
  );
}

const ICONE: Record<TomAviso, Icon> = { sucesso: CheckCircleIcon, erro: WarningCircleIcon, info: InfoIcon };

function ToastItem({ t }: { t: Toast }) {
  const { colors: c } = useContext(ThemeContext);
  const reduz = useReducedMotion();
  const total = t.fixo ? 0 : Math.min(11000, Math.max(3800, 3800 + 38 * (t.titulo.length + t.texto.length)));
  const prog = useSharedValue(1);
  const dx = useSharedValue(0);
  const [aberto, setAberto] = useState(false);
  const fechar = () => fecharToast(t.id);
  const correr = () => {
    if (!total) return;
    prog.value = withTiming(0, { duration: Math.max(1, prog.value * total), easing: Easing.linear }, fim => { if (fim) runOnJS(fecharToast)(t.id); });
  };
  const pausar = () => cancelAnimation(prog);
  useEffect(() => { correr(); return pausar; }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const cor = t.tom === 'sucesso' ? c.success : t.tom === 'erro' ? c.danger : c.accentText;
  const fundoIcone = t.tom === 'sucesso' ? c.successSoft : t.tom === 'erro' ? c.dangerSoft : c.accentSoft;
  const Icone = ICONE[t.tom];

  // Arrastar para o lado dispensa; solto antes do limite, volta com mola.
  const arrasto = Gesture.Pan().activeOffsetX([-12, 12]).failOffsetY([-14, 14])
    .onBegin(() => { runOnJS(pausar)(); })
    .onUpdate(e => { dx.value = e.translationX; })
    .onEnd(e => {
      if (Math.abs(e.translationX) > 90 || Math.abs(e.velocityX) > 700) {
        dx.value = withTiming(Math.sign(e.translationX || e.velocityX) * 480, { duration: 160 }, () => runOnJS(fecharToast)(t.id));
      } else { dx.value = withSpring(0, { damping: 18, stiffness: 240 }); runOnJS(correr)(); }
    })
    .onFinalize((_, ok) => { if (!ok) runOnJS(correr)(); });
  const arrastado = useAnimatedStyle(() => ({ transform: [{ translateX: dx.value }], opacity: 1 - Math.min(0.6, Math.abs(dx.value) / 400) }));
  const barra = useAnimatedStyle(() => ({ width: `${prog.value * 100}%` }));

  return (
    <Animated.View
      entering={reduz ? FadeIn.duration(120) : FadeInUp.springify().damping(17).stiffness(210).reduceMotion(ReduceMotion.System)}
      exiting={reduz ? FadeOut.duration(100) : FadeOutUp.duration(170)}
      layout={reduz ? undefined : LinearTransition.springify().damping(20).stiffness(220)}
      style={s.toastCaixa}>
      <GestureDetector gesture={arrasto}>
        <Animated.View style={[s.toast, { backgroundColor: c.surface, borderColor: c.border }, arrastado]}>
          <Pressable accessibilityRole="alert" accessibilityLabel={`${t.titulo}. ${t.texto}`} onPress={() => setAberto(v => !v)}
            onHoverIn={pausar} onHoverOut={correr} onPressIn={pausar} onPressOut={correr} style={s.toastLinha}>
            <View style={[s.toastIcone, { backgroundColor: fundoIcone }]}><Icone size={20} color={cor} weight="fill" /></View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={[s.toastTit, { color: c.text }]} numberOfLines={aberto ? undefined : 2}>{t.titulo}</Text>
              {t.texto ? <Text style={[s.toastTxt, { color: c.textMuted }]} numberOfLines={aberto ? undefined : 3} selectable={aberto}>{t.texto}</Text> : null}
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel="Fechar aviso" hitSlop={10} onPress={fechar} style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [s.fechar, (pressed || hovered) && { backgroundColor: c.surfaceMuted }]}>
              <XIcon size={15} color={c.textMuted} weight="bold" />
            </Pressable>
          </Pressable>
          {total ? <View style={[s.trilho, { backgroundColor: c.surfaceMuted }]}><Animated.View style={[s.progresso, { backgroundColor: cor }, barra]} /></View> : null}
        </Animated.View>
      </GestureDetector>
    </Animated.View>
  );
}

/* ---------- Modal de confirmação ---------- */
function Modal({ p }: { p: Pergunta }) {
  const { colors: c } = useContext(ThemeContext);
  const reduz = useReducedMotion();
  const respondido = useRef(false);
  const fim = (sim: boolean) => { if (respondido.current) return; respondido.current = true; responder(p.id, sim); };
  // Teclado (web): Esc cancela, Enter confirma.
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); fim(false); }
      else if (e.key === 'Enter') { e.preventDefault(); fim(true); }
    };
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const corAcao = p.perigo ? c.danger : c.accent;
  const Icone = p.perigo ? TrashIcon : QuestionIcon;
  return (
    <View style={[StyleSheet.absoluteFill, s.centro]} accessibilityViewIsModal>
      <Animated.View entering={FadeIn.duration(160)} exiting={FadeOut.duration(140)} style={StyleSheet.absoluteFill}>
        <Pressable accessibilityLabel="Cancelar" style={[StyleSheet.absoluteFill, s.fundo]} onPress={() => fim(false)} />
      </Animated.View>
      <Animated.View
        entering={reduz ? FadeIn.duration(120) : ZoomIn.springify().damping(16).stiffness(240).reduceMotion(ReduceMotion.System)}
        exiting={reduz ? FadeOut.duration(100) : ZoomOut.duration(130)}
        style={[s.cartao, { backgroundColor: c.surface, borderColor: c.border }]}>
        <View style={[s.selo, { backgroundColor: p.perigo ? c.dangerSoft : c.accentSoft }]}><Icone size={26} color={p.perigo ? c.danger : c.accentText} weight="duotone" /></View>
        <Text style={[s.modalTit, { color: c.text }]} accessibilityRole="header">{p.titulo}</Text>
        {p.texto ? <Text style={[s.modalTxt, { color: c.textMuted }]}>{p.texto}</Text> : null}
        <View style={s.botoes}>
          <Botao rotulo="Cancelar" onPress={() => fim(false)} fundo={c.surface} borda={c.borderStrong} cor={c.text} />
          <Botao rotulo={p.rotulo} onPress={() => fim(true)} fundo={corAcao} borda={corAcao} cor={p.perigo ? '#ffffff' : c.primaryText} />
        </View>
      </Animated.View>
    </View>
  );
}

function Botao({ rotulo, onPress, fundo, borda, cor }: { rotulo: string; onPress: () => void; fundo: string; borda: string; cor: string }) {
  const toque = useSharedValue(0);
  const [hover, setHover] = useState(false);
  const anim = useAnimatedStyle(() => ({ transform: [{ scale: 1 - toque.value * 0.04 }] }));
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={{ flex: 1 }} onHoverIn={() => setHover(true)} onHoverOut={() => setHover(false)}
      onPressIn={() => { toque.value = withTiming(1, { duration: 90 }); }} onPressOut={() => { toque.value = withSpring(0, { damping: 14, stiffness: 300 }); }}>
      <Animated.View style={[s.botao, { backgroundColor: fundo, borderColor: borda }, hover && { opacity: 0.9 }, anim]}>
        <Text style={[s.botaoTxt, { color: cor }]} numberOfLines={1}>{rotulo}</Text>
      </Animated.View>
    </Pressable>
  );
}

const s = StyleSheet.create({
  camada: { zIndex: 1000, elevation: 1000 },
  pilha: { position: 'absolute', gap: 8 },
  toastCaixa: { width: '100%' },
  toast: { borderRadius: 16, borderWidth: 1, overflow: 'hidden', boxShadow: '0 14px 36px rgba(15, 31, 61, 0.18)', elevation: 8 },
  toastLinha: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingLeft: 12, paddingRight: 8, paddingVertical: 12 },
  toastIcone: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  toastTit: { fontSize: 14.5, fontWeight: '800', lineHeight: 19, marginTop: 1 },
  toastTxt: { fontSize: 13, lineHeight: 18 },
  fechar: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  trilho: { height: 3, width: '100%' },
  progresso: { height: 3 },
  centro: { alignItems: 'center', justifyContent: 'center', padding: 20 },
  fundo: { backgroundColor: 'rgba(10, 20, 40, 0.48)' },
  cartao: { width: '100%', maxWidth: 420, borderRadius: 22, borderWidth: 1, paddingHorizontal: 22, paddingTop: 24, paddingBottom: 20, alignItems: 'center', boxShadow: '0 30px 80px rgba(10, 20, 40, 0.35)', elevation: 16 },
  selo: { width: 56, height: 56, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  modalTit: { fontSize: 19, fontWeight: '800', textAlign: 'center', letterSpacing: -0.2 },
  modalTxt: { fontSize: 14, lineHeight: 21, textAlign: 'center', marginTop: 8 },
  botoes: { flexDirection: 'row', gap: 10, marginTop: 22, alignSelf: 'stretch' },
  botao: { height: 48, borderRadius: 14, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  botaoTxt: { fontSize: 15, fontWeight: '800' },
});
