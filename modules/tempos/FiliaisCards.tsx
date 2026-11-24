import { type ReactNode, useEffect, useId, useRef, useState } from 'react';
import { Image, Platform, Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withRepeat, withTiming } from 'react-native-reanimated';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { supabase } from '../../lib/supabase';
import { ArrowRightIcon, CheckCircleIcon, SpinnerIcon } from '../../ui/icons';

/*
 * Cards das filiais no Tempos e Movimentos (aba Coletas).
 * - Filial em coleta: card escuro com o progresso da meta, barra com brilho e os auditores (modelo enviado pelo usuário).
 * - Demais filiais: cor sólida própria de cada filial, números que sobem ao abrir e uma barrinha embaixo.
 */

/** Saída forte: começa rápido e assenta devagar (mesma curva do site). */
const EASE = Easing.bezier(0.23, 1, 0.32, 1);
const DURACAO = 900;

/* ---------- Contagem dos números ---------- */
// Um único quadro de animação para todos os números da tela: cada quadro atualiza tudo de uma vez (uma renderização).
type Tick = (t: number) => void;
const ticks = new Set<Tick>();
let quadro = 0;
const rodar = (t: number) => { quadro = 0; ticks.forEach(f => f(t)); if (ticks.size) quadro = requestAnimationFrame(rodar); };
const assinar = (f: Tick) => { ticks.add(f); if (!quadro) quadro = requestAnimationFrame(rodar); return () => { ticks.delete(f); }; };
const saida = (p: number) => 1 - Math.pow(1 - p, 4);

/** Valor que sobe até `alvo` (e anda de um valor ao outro quando o dado muda). Com "reduzir movimento", vai direto. */
function useContagem(alvo: number, atraso: number) {
  const reduz = useReducedMotion();
  const atual = useRef(reduz ? alvo : 0);
  const [v, setV] = useState(atual.current);
  useEffect(() => {
    if (reduz) { atual.current = alvo; setV(alvo); return; }
    const de = atual.current;
    if (de === alvo) return;
    let t0 = 0;
    const parar = assinar(t => {
      if (!t0) t0 = t + atraso;
      const p = Math.min(1, Math.max(0, (t - t0) / DURACAO));
      atual.current = de + (alvo - de) * saida(p);
      setV(atual.current);
      if (p >= 1) parar();
    });
    return parar;
  }, [alvo, reduz, atraso]);
  return v;
}

/** Número inteiro que sobe (algarismos de largura fixa, para o texto não tremer). */
function Numero({ valor, atraso, style }: { valor: number; atraso: number; style: object }) {
  const v = useContagem(valor, atraso);
  return <Text style={[style, x.tabular]}>{Math.round(v).toLocaleString('pt-BR')}</Text>;
}

/** Progresso 0..1 animado da esquerda para a direita. */
function useProgresso(pct: number, atraso: number) {
  const reduz = useReducedMotion();
  const v = useSharedValue(reduz ? pct : 0);
  useEffect(() => { v.value = reduz ? pct : withDelay(atraso, withTiming(pct, { duration: DURACAO, easing: EASE })); }, [pct, reduz, atraso, v]);
  return useAnimatedStyle(() => ({ width: `${Math.max(0, Math.min(1, v.value)) * 100}%` }));
}

/* ---------- Cores ---------- */
/** Cores sólidas das filiais: fortes, sem neon, todas com letra branca legível (contraste acima de 5:1). */
const CORES = ['#1E5A6E', '#24614A', '#2F4FA2', '#A2472E', '#7C2D45', '#55642A', '#94621A', '#3B5470', '#363D4A', '#8A3B22'];
const hash = (s: string) => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h); };
/** Cor fixa da filial (a mesma em toda visita). */
export const corDaFilial = (id: string) => CORES[hash(id) % CORES.length];

/* ---------- Fotos dos auditores ---------- */
const fotos = new Map<string, string | null>();
/** Foto do perfil pelo nome do auditor (quem não tem foto ou não aparece para a conta fica com as iniciais). */
export function useFotos(nomes: string[]) {
  const chave = [...new Set(nomes.map(n => String(n ?? '').trim()).filter(Boolean))].sort().join('|');
  const [, setVersao] = useState(0);
  useEffect(() => {
    const faltam = chave ? chave.split('|').filter(n => !fotos.has(n.toLowerCase())) : [];
    if (!supabase || !faltam.length) return;
    faltam.forEach(n => fotos.set(n.toLowerCase(), null));
    void Promise.resolve(supabase.from('profiles').select('nome,avatar').in('nome', faltam)).then(({ data }) => {
      (data ?? []).forEach((p: { nome: string | null; avatar: string | null }) => { if (p.nome && p.avatar) fotos.set(p.nome.trim().toLowerCase(), p.avatar); });
      setVersao(v => v + 1);
    }, () => undefined);
  }, [chave]);
  return (nome: string) => fotos.get(nome.trim().toLowerCase()) ?? null;
}

/* ---------- Grade ---------- */
/** Grade de colunas iguais: quantas couberem com a largura mínima do card. */
export function Grade({ min, children }: { min: number; children: ReactNode[] }) {
  const [w, setW] = useState(0);
  const gap = 12;
  const cols = w ? Math.max(1, Math.floor((w + gap) / (min + gap))) : 1;
  const largura = w ? (w - gap * (cols - 1)) / cols : undefined;
  return (
    <View onLayout={e => setW(e.nativeEvent.layout.width)} style={x.grade}>
      {children.map((c, i) => <View key={i} style={{ width: largura ?? '100%' }}>{c}</View>)}
    </View>
  );
}

/** Toque: o card afunda um pouco; no computador, sobe 2 px com o mouse em cima. */
const pressionavel = ({ pressed, hovered }: { pressed: boolean; hovered?: boolean }): ViewStyle[] => [
  Platform.OS === 'web' ? ({ transitionProperty: 'transform', transitionDuration: '160ms', transitionTimingFunction: 'cubic-bezier(0.23, 1, 0.32, 1)' } as ViewStyle) : {},
  { transform: [{ scale: pressed ? 0.98 : 1 }, { translateY: hovered && !pressed ? -2 : 0 }] },
];

/* =====================================================================
   Card da filial em coleta (escuro, como o modelo)
   ===================================================================== */
export type DadosEmColeta = {
  titulo: string; etiqueta: string; pct: number; trilho: string; auditores: string[]; aoVivo: boolean;
  onPress: () => void; foto: (nome: string) => string | null; atraso: number;
};

export function CardEmColeta({ titulo, etiqueta, pct, trilho, auditores, aoVivo, onPress, foto, atraso }: DadosEmColeta) {
  const visiveis = auditores.slice(0, 4), mais = auditores.length - visiveis.length;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${titulo}, ${Math.round(pct * 100)}% da meta de coletas. Abrir a filial`} onPress={onPress}
      style={state => [x.escuro, ...pressionavel(state as { pressed: boolean; hovered?: boolean })]}>
      <Girando ativo={aoVivo}><SpinnerIcon size={28} color="#F4F5F6" /></Girando>
      <View style={x.tituloLinha}>
        <Text style={x.escuroTitulo} numberOfLines={1}>{titulo}</Text>
        {etiqueta ? <View style={x.etiqueta}><Text style={x.etiquetaTexto} numberOfLines={1}>{etiqueta}</Text></View> : null}
      </View>
      <View style={x.pctLinha}>
        <Numero valor={Math.round(pct * 100)} atraso={atraso} style={x.pct} />
        <Text style={x.pctSinal}>%</Text>
      </View>
      <BarraBrilho pct={pct} texto={trilho} atraso={atraso} />
      <Text style={x.auditores}>Auditores <Text style={x.auditoresN}>{auditores.length}</Text></Text>
      <View style={x.rodape}>
        <View style={x.avatares}>
          {visiveis.map(n => <Rosto key={n} nome={n} uri={foto(n)} />)}
          {mais > 0 ? <View style={[x.rosto, x.rostoMais]}><Text style={x.rostoTexto}>+{mais}</Text></View> : null}
          {!auditores.length ? <Text style={x.semAuditor}>Nenhum auditor informado</Text> : null}
        </View>
        {/* O card inteiro já abre a filial; o botão é a pista visual (um segundo Pressable abriria a tela duas vezes na web). */}
        <View style={x.botao}>
          <Text style={x.botaoTexto}>Mais detalhes</Text>
          <ArrowRightIcon size={15} color="#F4F5F6" weight="bold" />
        </View>
      </View>
    </Pressable>
  );
}

/** Ícone que gira em passos de 45° (como um indicador de atividade) enquanto há cronômetro rodando neste aparelho. */
function Girando({ ativo, children }: { ativo: boolean; children: ReactNode }) {
  const reduz = useReducedMotion();
  const v = useSharedValue(0);
  useEffect(() => {
    if (!ativo || reduz) { cancelAnimation(v); v.value = 0; return; }
    v.value = withRepeat(withTiming(8, { duration: 1000, easing: Easing.linear }), -1, false);
    return () => cancelAnimation(v);
  }, [ativo, reduz, v]);
  const st = useAnimatedStyle(() => ({ transform: [{ rotate: `${Math.floor(v.value) * 45}deg` }] }));
  return <Animated.View style={[x.icone, st]}>{children}</Animated.View>;
}

/**
 * Barra larga com degradê e brilho. O texto aparece claro sobre o trilho e escuro sobre a parte preenchida: a cópia
 * escura fica dentro do preenchimento (que recorta), então a troca de cor acompanha a barra enquanto ela anda.
 */
function BarraBrilho({ pct, texto, atraso }: { pct: number; texto: string; atraso: number }) {
  const [w, setW] = useState(0);
  const st = useProgresso(pct, atraso);
  const id = `brilho${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  // A cópia escura é só visual: o leitor de tela lê o texto uma vez.
  const rotulo = (cor: string, copia = false) => (
    <View pointerEvents="none" aria-hidden={copia} importantForAccessibility={copia ? 'no-hide-descendants' : 'auto'} style={[x.trilhoRotulo, { width: w || '100%' }]}>
      <Text style={[x.trilhoTexto, { color: cor }]} numberOfLines={1}>{texto}</Text>
    </View>
  );
  return (
    <View style={x.trilho} onLayout={e => setW(e.nativeEvent.layout.width)}>
      {rotulo('#E9ECEE')}
      {pct > 0 ? (
        <Animated.View style={[x.preenchido, st]}>
          <Svg width="100%" height="100%" style={StyleSheet.absoluteFill}>
            <Defs>
              <LinearGradient id={id} x1="0" y1="0" x2="1" y2="0">
                <Stop offset="0" stopColor="#C3F46B" />
                <Stop offset="1" stopColor="#5EF0D6" />
              </LinearGradient>
            </Defs>
            <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${id})`} />
          </Svg>
          {rotulo('#10291F', true)}
        </Animated.View>
      ) : null}
    </View>
  );
}

/** Rosto do auditor: foto do perfil ou as iniciais sobre a cor do nome. */
function Rosto({ nome, uri }: { nome: string; uri: string | null }) {
  const iniciais = nome.trim().split(/\s+/).slice(0, 2).map(p => p[0]).join('').toUpperCase() || '?';
  return (
    <View style={[x.rosto, !uri && { backgroundColor: corDaFilial(nome) }]} accessibilityLabel={nome}>
      {uri ? <Image source={{ uri }} style={x.rostoFoto} /> : <Text style={x.rostoTexto}>{iniciais}</Text>}
    </View>
  );
}

/* =====================================================================
   Card das demais filiais (cor sólida, números que sobem e barrinha)
   ===================================================================== */
export type DadosFilial = {
  codigo: string; nome: string; local: string; cor: string; etiqueta?: { texto: string; ok?: boolean };
  numeros: [number | [number, number], string][]; pct: number; rodape: string; onPress: () => void; atraso: number;
};

export function CardFilial({ codigo, nome, local, cor, etiqueta, numeros, pct, rodape, onPress, atraso }: DadosFilial) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${codigo} ${nome}. ${rodape}. Abrir a filial`} onPress={onPress}
      style={state => [x.solido, { backgroundColor: cor }, ...pressionavel(state as { pressed: boolean; hovered?: boolean })]}>
      <View style={x.solidoTopo}>
        <Text style={[x.solidoCodigo, x.tabular]} numberOfLines={1}>{codigo}</Text>
        {etiqueta ? (
          <View style={x.solidoEtiqueta}>
            {etiqueta.ok ? <CheckCircleIcon size={13} color="#FFFFFF" weight="fill" /> : null}
            <Text style={x.solidoEtiquetaTexto}>{etiqueta.texto}</Text>
          </View>
        ) : null}
      </View>
      <View>
        <Text style={x.solidoNome} numberOfLines={1}>{nome}</Text>
        {local ? <Text style={x.solidoLocal} numberOfLines={1}>{local}</Text> : null}
      </View>
      <View style={x.numeros}>
        {numeros.map(([v, rotulo], i) => (
          <View key={rotulo} style={x.numero}>
            {Array.isArray(v) ? (
              <View style={x.fracao}>
                <Numero valor={v[0]} atraso={atraso + i * 60} style={x.numeroValor} />
                <Text style={x.numeroDe}>/{v[1]}</Text>
              </View>
            ) : <Numero valor={v} atraso={atraso + i * 60} style={x.numeroValor} />}
            <Text style={x.numeroRotulo} numberOfLines={1}>{rotulo}</Text>
          </View>
        ))}
      </View>
      <Barrinha pct={pct} atraso={atraso} />
      <Text style={x.solidoRodape} numberOfLines={1}>{rodape}</Text>
    </Pressable>
  );
}

function Barrinha({ pct, atraso }: { pct: number; atraso: number }) {
  const st = useProgresso(pct, atraso);
  return <View style={x.barrinha}><Animated.View style={[x.barrinhaCheia, st]} /></View>;
}

const x = StyleSheet.create({
  tabular: { fontVariant: ['tabular-nums'] },
  grade: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },

  /* Em coleta */
  escuro: {
    padding: 22, gap: 14, borderRadius: 22, backgroundColor: '#242628',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)', borderTopColor: 'rgba(255,255,255,0.12)',
    boxShadow: '0 22px 44px -18px rgba(12, 18, 30, 0.55)',
  },
  icone: { width: 28, height: 28, alignSelf: 'flex-start' },
  tituloLinha: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 10 },
  escuroTitulo: { flexShrink: 1, fontSize: 20, fontWeight: '600', letterSpacing: -0.3, color: '#F4F5F6' },
  etiqueta: { maxWidth: '100%', paddingHorizontal: 12, paddingVertical: 5, borderRadius: 999, borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)', backgroundColor: 'rgba(255,255,255,0.03)' },
  etiquetaTexto: { fontSize: 13, color: '#C6CACE' },
  pctLinha: { flexDirection: 'row', alignItems: 'baseline', marginTop: -4 },
  pct: { fontSize: 46, fontWeight: '600', letterSpacing: -1.5, color: '#F6F7F8' },
  pctSinal: { fontSize: 46, fontWeight: '400', letterSpacing: -1, color: '#8E9398' },
  trilho: { height: 38, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.26)' },
  trilhoRotulo: { position: 'absolute', left: 0, top: 0, bottom: 0, justifyContent: 'center', alignItems: 'flex-end', paddingHorizontal: 16 },
  trilhoTexto: { fontSize: 15, fontWeight: '600', letterSpacing: -0.1 },
  preenchido: { position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: 999, overflow: 'hidden', boxShadow: '0 0 22px rgba(94, 240, 214, 0.5)' },
  auditores: { fontSize: 15, color: '#C9CDD1', marginTop: 2 },
  auditoresN: { color: '#7E848A', fontVariant: ['tabular-nums'] },
  rodape: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginTop: -4 },
  avatares: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rosto: { width: 42, height: 42, borderRadius: 12, borderWidth: 2, borderColor: 'rgba(255,255,255,0.16)', overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  rostoMais: { backgroundColor: 'rgba(255,255,255,0.08)' },
  rostoFoto: { width: '100%', height: '100%' },
  rostoTexto: { fontSize: 14, fontWeight: '700', color: '#FFFFFF' },
  semAuditor: { fontSize: 13, color: '#7E848A' },
  botao: {
    flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 18, height: 40, borderRadius: 999,
    backgroundColor: '#1A1C1E', borderWidth: 1, borderColor: 'rgba(255,255,255,0.22)',
  },
  botaoTexto: { fontSize: 14, fontWeight: '600', color: '#F4F5F6' },

  /* Demais filiais */
  solido: { padding: 16, gap: 12, borderRadius: 18, minHeight: 190 },
  solidoTopo: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  solidoCodigo: { fontSize: 12.5, fontWeight: '700', color: 'rgba(255,255,255,0.78)', letterSpacing: 0.2 },
  solidoEtiqueta: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 9, paddingVertical: 3, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.16)' },
  solidoEtiquetaTexto: { fontSize: 11.5, fontWeight: '700', color: '#FFFFFF' },
  solidoNome: { fontSize: 17, fontWeight: '700', letterSpacing: -0.2, color: '#FFFFFF' },
  solidoLocal: { fontSize: 12.5, color: 'rgba(255,255,255,0.8)', marginTop: 1 },
  numeros: { flexDirection: 'row', gap: 10, marginTop: 'auto' },
  numero: { flex: 1, minWidth: 0 },
  fracao: { flexDirection: 'row', alignItems: 'baseline' },
  numeroValor: { fontSize: 24, fontWeight: '700', letterSpacing: -0.6, color: '#FFFFFF' },
  numeroDe: { fontSize: 13, fontWeight: '600', color: 'rgba(255,255,255,0.72)', fontVariant: ['tabular-nums'] },
  numeroRotulo: { fontSize: 11.5, color: 'rgba(255,255,255,0.8)' },
  barrinha: { height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.22)', overflow: 'hidden' },
  barrinhaCheia: { height: '100%', borderRadius: 2, backgroundColor: '#FFFFFF' },
  solidoRodape: { fontSize: 12, fontWeight: '600', color: 'rgba(255,255,255,0.88)', marginTop: -4 },
});
