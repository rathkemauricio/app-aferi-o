import { Platform, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import Animated, { type SharedValue, useAnimatedStyle, useDerivedValue, useReducedMotion, useSharedValue } from 'react-native-reanimated';
import { CheckCircleIcon, CheckIcon, ClipboardTextIcon, ClockIcon, KeyboardIcon, MagnifyingGlassIcon, TrashIcon, WarningCircleIcon } from '../../ui/icons';
import { c01, Celular, fase, Folha, Palco, Planilha, sai } from './motion';
import { Faixa, SITE_CORES } from './SiteChrome';

// "O problema", contado pela rolagem: a seção tem 4,5 telas de altura e o palco fica parado na tela (translateY
// acompanhando a rolagem) enquanto o progresso p (0 → 1) conduz quatro atos: papel demais, planilhas que não
// conversam, ação que não sai do lugar e a virada (tudo nasce digital).
const C = SITE_CORES;
const W = 560, H = 440;
const MENTA = '#3cbf83', AMBAR = '#b26a00', VERMELHO = '#d93b30';

const ATOS = [
  { titulo: 'Papel demais.', texto: 'Formulários impressos a cada visita. Viram pilha no arquivo e, um dia, vão para o lixo.' },
  { titulo: 'Planilhas que não conversam.', texto: 'Cada unidade com a sua versão, cada pessoa com o seu jeito. Na hora de decidir, ninguém sabe qual é a certa.' },
  { titulo: 'Ação que não sai do lugar.', texto: 'O problema aparece na operação, mas só vira ação dias depois, quando alguém digita tudo de novo.' },
  { titulo: 'Com o EasyAudit, tudo nasce digital.', texto: 'Checklists, contagens e medições feitos no celular, com quem fez e quando. O relatório sai na hora, e a ação também.' },
];

/* ---------- Ato 1: a pilha cresce e vai para o lixo ---------- */
function FolhaPilha({ j, p }: { j: number; p: SharedValue<number> }) {
  const x0 = 40 + ((j * 47) % 300), r0 = ((j * 37) % 40) - 20;
  const xf = 96 + (j % 2 ? 7 : -7) + ((j * 3) % 5), yf = 300 - j * 11, rf = ((j % 3) - 1) * 4;
  const anim = useAnimatedStyle(() => {
    const cai = sai(fase(p.value, 0.015 + j * 0.016, 0.05 + j * 0.016));
    const lixo = sai(fase(p.value, 0.19 + (9 - j) * 0.004, 0.235 + (9 - j) * 0.004));
    const x = x0 + (xf - x0) * cai + (400 - xf) * lixo;
    const y = -150 + (yf + 150) * cai + (330 - yf) * lixo;
    return {
      opacity: cai * (1 - fase(lixo, 0.6, 1)),
      transform: [{ translateX: x }, { translateY: y }, { rotate: `${r0 + (rf - r0) * cai}deg` }, { scale: 1 - 0.7 * lixo }],
    };
  });
  return <Animated.View style={[st.abs, anim]}><Folha w={78} /></Animated.View>;
}
function Ato1({ p }: { p: SharedValue<number> }) {
  const lixo = useAnimatedStyle(() => ({ opacity: fase(p.value, 0.12, 0.16) * (1 - fase(p.value, 0.245, 0.27)), transform: [{ translateY: (1 - fase(p.value, 0.12, 0.16)) * 20 }] }));
  const grupo = useAnimatedStyle(() => ({ opacity: 1 - fase(p.value, 0.245, 0.27) }));
  return (
    <Animated.View style={[StyleSheet.absoluteFill, grupo]}>
      <Animated.View style={[st.abs, { left: 380, top: 280 }, lixo]}><TrashIcon size={104} color="#76829a" weight="duotone" /></Animated.View>
      {Array.from({ length: 10 }, (_, j) => <FolhaPilha key={j} j={j} p={p} />)}
    </Animated.View>
  );
}

/* ---------- Ato 2: três planilhas se desencontram ---------- */
const PLAN = [
  { x: 40, y: 110, r: -6, cor: '#1f8a5b', dx: -34, dr: -8 },
  { x: 205, y: 150, r: 4, cor: '#2f6fd6', dx: 0, dr: 7 },
  { x: 370, y: 100, r: 8, cor: '#c98a1b', dx: 34, dr: 10 },
];
function PlanilhaSolta({ i, p }: { i: number; p: SharedValue<number> }) {
  const d = PLAN[i];
  const anim = useAnimatedStyle(() => {
    const entra = sai(fase(p.value, 0.26 + i * 0.02, 0.31 + i * 0.02));
    const separa = sai(fase(p.value, 0.32, 0.46));
    return {
      opacity: entra * (1 - fase(p.value, 0.49, 0.52)),
      transform: [{ translateX: d.x + d.dx * separa }, { translateY: d.y + (1 - entra) * 30 + (i === 1 ? 26 : -10) * separa }, { rotate: `${d.r + d.dr * separa}deg` }, { scale: 0.92 + entra * 0.08 }],
    };
  });
  return (
    <Animated.View style={[st.abs, anim]}>
      <Planilha w={150} cor={d.cor} destaque={i === 0 ? [[1, 2, '#fde9bf'], [3, 1, '#fcd9d5']] : i === 1 ? [[2, 0, '#fcd9d5'], [0, 3, '#fde9bf']] : [[4, 2, '#fcd9d5'], [1, 1, '#fde9bf']]} />
    </Animated.View>
  );
}
function Alerta({ x, y, p, a }: { x: number; y: number; p: SharedValue<number>; a: number }) {
  const anim = useAnimatedStyle(() => {
    const v = sai(fase(p.value, a, a + 0.03));
    return { opacity: v * (1 - fase(p.value, 0.49, 0.52)), transform: [{ translateX: x }, { translateY: y }, { scale: 0.6 + v * 0.4 }] };
  });
  return <Animated.View style={[st.abs, st.alerta, anim]}><WarningCircleIcon size={26} color={VERMELHO} weight="fill" /></Animated.View>;
}

/* ---------- Ato 3: o fluxo trava no "redigitado" ---------- */
const NOS = [
  { x: 70, icone: MagnifyingGlassIcon, rotulo: 'Visto' },
  { x: 205, icone: ClipboardTextIcon, rotulo: 'Anotado' },
  { x: 340, icone: KeyboardIcon, rotulo: 'Redigitado' },
  { x: 475, icone: CheckCircleIcon, rotulo: 'Resolvido' },
];
const Y_FLUXO = 200;
function Ato3({ p }: { p: SharedValue<number> }) {
  const grupo = useAnimatedStyle(() => ({ opacity: fase(p.value, 0.51, 0.55) * (1 - fase(p.value, 0.74, 0.77)), transform: [{ translateY: (1 - fase(p.value, 0.51, 0.55)) * 24 }] }));
  // O ponto anda rápido até "Anotado", devagar até "Redigitado" e para lá.
  const pos = useDerivedValue(() => {
    const a = fase(p.value, 0.54, 0.58), b = fase(p.value, 0.58, 0.68);
    return NOS[0].x + (NOS[1].x - NOS[0].x) * sai(a) + (NOS[2].x - NOS[1].x) * b;
  });
  const ponto = useAnimatedStyle(() => ({ transform: [{ translateX: pos.value - 9 }, { translateY: Y_FLUXO - 9 }] }));
  const trilho = useAnimatedStyle(() => ({ width: pos.value - NOS[0].x }));
  const relogio = useAnimatedStyle(() => ({
    opacity: fase(p.value, 0.63, 0.67),
    transform: [{ translateX: NOS[2].x - 18 }, { translateY: Y_FLUXO - 92 }, { rotate: `${c01((p.value - 0.6) / 0.15) * 720}deg` }],
  }));
  const espera = useAnimatedStyle(() => ({ opacity: fase(p.value, 0.66, 0.7) }));
  return (
    <Animated.View style={[StyleSheet.absoluteFill, grupo]}>
      <View style={[st.abs, { left: NOS[0].x, top: Y_FLUXO - 1.5, width: NOS[3].x - NOS[0].x, height: 3, borderRadius: 2, backgroundColor: '#dde3ec' }]} />
      <Animated.View style={[st.abs, { left: NOS[0].x, top: Y_FLUXO - 1.5, height: 3, borderRadius: 2, backgroundColor: MENTA }, trilho]} />
      {NOS.map((n, i) => (
        <View key={n.rotulo} style={[st.abs, { left: n.x - 32, top: Y_FLUXO - 32, alignItems: 'center', width: 64, opacity: i === 3 ? 0.35 : 1 }]}>
          <View style={[st.no, i === 2 && { borderColor: AMBAR }]}><n.icone size={26} color={i === 2 ? AMBAR : C.text} weight="duotone" /></View>
          <Text style={st.rotulo}>{n.rotulo}</Text>
        </View>
      ))}
      <Animated.View style={[st.abs, relogio]}><ClockIcon size={36} color={AMBAR} weight="bold" /></Animated.View>
      <Animated.Text style={[st.abs, st.espera, { left: NOS[2].x - 60, top: Y_FLUXO + 66, width: 120 }, espera]}>dias depois</Animated.Text>
      <Animated.View style={[st.abs, st.ponto, ponto]} />
    </Animated.View>
  );
}

/* ---------- Ato 4: tudo nasce digital ---------- */
function LinhaCelular({ j, p }: { j: number; p: SharedValue<number> }) {
  const anim = useAnimatedStyle(() => {
    const a = sai(fase(p.value, 0.8 + j * 0.022, 0.83 + j * 0.022));
    return { opacity: a, transform: [{ translateX: (1 - a) * 18 }] };
  });
  const larg = [0.72, 0.55, 0.8, 0.62, 0.7, 0.5][j];
  return (
    <Animated.View style={[st.linhaCel, anim]}>
      <View style={st.checkCel}><CheckIcon size={11} color="#0f1f3d" weight="bold" /></View>
      <View style={{ flex: 1, gap: 4 }}>
        <View style={{ height: 6, width: `${larg * 100}%`, borderRadius: 3, backgroundColor: '#0f1f3d' }} />
        <View style={{ height: 5, width: `${larg * 70}%`, borderRadius: 3, backgroundColor: '#cfd4da' }} />
      </View>
    </Animated.View>
  );
}
const ENTRADAS = [[-40, 40], [600, 30], [-50, 300], [610, 320], [140, 470], [420, 480]];
function FolhaEntrando({ j, p }: { j: number; p: SharedValue<number> }) {
  const [x0, y0] = ENTRADAS[j];
  const anim = useAnimatedStyle(() => {
    const v = sai(fase(p.value, 0.76 + j * 0.012, 0.81 + j * 0.012));
    return { opacity: (v > 0 ? 1 : 0) * (1 - fase(v, 0.65, 1)), transform: [{ translateX: x0 + (262 - x0) * v }, { translateY: y0 + (200 - y0) * v }, { scale: 1 - 0.7 * v }, { rotate: `${(1 - v) * (j % 2 ? 14 : -14)}deg` }] };
  });
  return <Animated.View style={[st.abs, anim]}><Folha w={46} /></Animated.View>;
}
function Ato4({ p }: { p: SharedValue<number> }) {
  const cel = useAnimatedStyle(() => { const v = sai(fase(p.value, 0.75, 0.8)); return { opacity: v, transform: [{ translateY: (1 - v) * 30 }, { scale: 0.94 + v * 0.06 }] }; });
  const halo = useAnimatedStyle(() => { const v = fase(p.value, 0.86, 0.95); return { opacity: fase(p.value, 0.76, 0.8) * (0.15 + v * 0.45), transform: [{ scale: 0.85 + v * 0.15 }] }; });
  return (
    <View style={StyleSheet.absoluteFill}>
      <Animated.View style={[st.halo, halo]} />
      <Animated.View style={[st.abs, { left: 195, top: 50 }, cel]}>
        <Celular w={170}>{Array.from({ length: 6 }, (_, j) => <LinhaCelular key={j} j={j} p={p} />)}</Celular>
      </Animated.View>
      {ENTRADAS.map((_, j) => <FolhaEntrando key={j} j={j} p={p} />)}
    </View>
  );
}

function TextoAto({ i, p, desktop }: { i: number; p: SharedValue<number>; desktop: boolean }) {
  const anim = useAnimatedStyle(() => {
    const ini = i / 4, fim = (i + 1) / 4;
    // Um texto sai antes de o próximo entrar (sem sobreposição na troca).
    const entra = i === 0 ? 1 : fase(p.value, ini + 0.004, ini + 0.04);
    const sai_ = i === 3 ? 0 : fase(p.value, fim - 0.036, fim - 0.004);
    return { opacity: entra * (1 - sai_), transform: [{ translateY: (1 - entra) * 22 - sai_ * 22 }] };
  });
  const a = ATOS[i];
  return (
    <Animated.View style={[StyleSheet.absoluteFill, { justifyContent: 'center' }, anim]} accessibilityElementsHidden={false}>
      <Text style={[st.titulo, !desktop && { fontSize: 28, lineHeight: 33, marginBottom: 8 }]}>{a.titulo}</Text>
      <Text style={[st.texto, !desktop && { fontSize: 16, lineHeight: 24 }]}>{a.texto}</Text>
    </Animated.View>
  );
}

function Progresso({ p, desktop }: { p: SharedValue<number>; desktop: boolean }) {
  const fill = useAnimatedStyle(() => (desktop ? { height: `${p.value * 100}%` } : { width: `${p.value * 100}%` }));
  return (
    <View style={desktop ? st.trilhoV : st.trilhoH}>
      <Animated.View style={[desktop ? st.fillV : st.fillH, fill]} />
    </View>
  );
}

/**
 * Seção fixa contada pela rolagem. `scrollY` é a rolagem da página; `vh`, a altura visível da área rolável.
 * Precisa ser filha direta do conteúdo da página (a posição medida em onLayout é a posição na página).
 */
export function Historia({ scrollY, vh, desktop }: { scrollY: SharedValue<number>; vh: number; desktop: boolean }) {
  const reduz = useReducedMotion();
  const topo = useSharedValue(0);
  const altura = Math.round(vh * (reduz ? 1 : 3.6));
  const p = useDerivedValue(() => (reduz ? 1 : c01((scrollY.value - topo.value) / Math.max(1, altura - vh))));
  // Palco parado na tela durante a seção. Na web, `position: sticky` do navegador: fica preso no mesmo quadro da
  // rolagem. (Empurrar com translateY a cada evento de rolagem chega um quadro atrasado e o palco treme.)
  const palcoNativo = useAnimatedStyle(() => ({ transform: [{ translateY: Math.min(Math.max(scrollY.value - topo.value, 0), Math.max(0, altura - vh)) }] }));
  const palco = Platform.OS === 'web' ? PRESO : palcoNativo;

  if (reduz) {
    // Sem movimento: os quatro atos em texto e a cena final.
    return (
      <Faixa style={{ paddingVertical: 80, gap: 28 }}>
        {ATOS.map(a => (
          <View key={a.titulo} style={{ gap: 6, maxWidth: 640 }}>
            <Text style={st.titulo}>{a.titulo}</Text>
            <Text style={st.texto}>{a.texto}</Text>
          </View>
        ))}
      </Faixa>
    );
  }

  return (
    <View onLayout={e => { topo.value = e.nativeEvent.layout.y; }} style={{ height: altura }}>
      <Animated.View style={[{ height: vh, overflow: 'hidden' }, palco]}>
        <Faixa style={{ flex: 1, flexDirection: desktop ? 'row' : 'column', alignItems: 'center', gap: desktop ? 48 : 12, paddingVertical: desktop ? 40 : 20 }}>
          {desktop ? <Progresso p={p} desktop /> : null}
          <View style={{ width: desktop ? undefined : '100%', flex: desktop ? 0.85 : undefined, height: desktop ? 300 : 210 }}>
            {ATOS.map((_, i) => <TextoAto key={i} i={i} p={p} desktop={desktop} />)}
          </View>
          {!desktop ? <Progresso p={p} desktop={false} /> : null}
          <View style={{ flex: desktop ? 1.3 : 1, width: desktop ? undefined : '100%', justifyContent: 'center' }}>
            <Palco largura={W} altura={H} maxAltura={desktop ? vh - 80 : Math.max(220, vh - 300)}>
              <Ato1 p={p} />
              {PLAN.map((_, i) => <PlanilhaSolta key={i} i={i} p={p} />)}
              <Alerta x={168} y={96} p={p} a={0.36} />
              <Alerta x={340} y={210} p={p} a={0.39} />
              <Ato3 p={p} />
              <Ato4 p={p} />
            </Palco>
          </View>
        </Faixa>
      </Animated.View>
    </View>
  );
}

/** Web: o palco gruda no topo da área rolável enquanto a seção passa. */
const PRESO = { position: 'sticky', top: 0 } as unknown as ViewStyle;

const st = StyleSheet.create({
  abs: { position: 'absolute', left: 0, top: 0 },
  titulo: { color: C.text, fontSize: 40, lineHeight: 46, fontWeight: '800', letterSpacing: -1.2, marginBottom: 14 },
  texto: { color: C.textMuted, fontSize: 18, lineHeight: 28, maxWidth: 460 },
  alerta: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#fde8e6', alignItems: 'center', justifyContent: 'center' },
  no: { width: 64, height: 64, borderRadius: 20, backgroundColor: C.surface, borderWidth: 1.5, borderColor: C.border, alignItems: 'center', justifyContent: 'center' },
  rotulo: { color: C.textMuted, fontSize: 13, fontWeight: '700', marginTop: 10 },
  espera: { color: AMBAR, fontSize: 13, fontWeight: '800', textAlign: 'center' },
  ponto: { width: 18, height: 18, borderRadius: 9, backgroundColor: MENTA, borderWidth: 3, borderColor: C.bg },
  linhaCel: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#ffffff', borderRadius: 10, paddingVertical: 8, paddingHorizontal: 8, borderWidth: 1, borderColor: '#e6eaf0' },
  checkCel: { width: 18, height: 18, borderRadius: 9, backgroundColor: '#5fd39a', alignItems: 'center', justifyContent: 'center' },
  halo: { position: 'absolute', left: 130, top: 80, width: 300, height: 300, borderRadius: 999, backgroundColor: '#e8eef7' },
  trilhoV: { width: 3, height: 220, borderRadius: 2, backgroundColor: '#dde3ec', overflow: 'hidden' },
  fillV: { width: 3, borderRadius: 2, backgroundColor: MENTA },
  trilhoH: { height: 3, width: '100%', borderRadius: 2, backgroundColor: '#dde3ec', overflow: 'hidden' },
  fillH: { height: 3, borderRadius: 2, backgroundColor: MENTA },
});
