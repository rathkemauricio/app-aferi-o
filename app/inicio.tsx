import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { type LayoutChangeEvent, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, useAnimatedRef, useAnimatedScrollHandler, useReducedMotion, useSharedValue } from 'react-native-reanimated';
import { CenaHero } from '../components/site/CenaHero';
import { Historia } from '../components/site/Historia';
import { EASE, Revela, useEmVista } from '../components/site/motion';
import { Setores } from '../components/site/Setores';
import { BotaoSite, CTA_EMPRESA, Faixa, SITE_CORES, SiteFooter, SiteNav, SiteTema, useSite } from '../components/site/SiteChrome';
import { COMBUSTIVEIS_PADRAO } from '../lib/combustiveis';
import { supabase } from '../lib/supabase';
import { CroquiCanvas } from '../modules/croqui/Canvas';
import { type BombaCadastro, layoutInicial, PALETA_ESCURA, tipoDoCombustivel } from '../modules/croqui/model';
import { MODULES } from '../modules/registry';
import { CheckIcon, WarningCircleIcon } from '../ui/icons';

const C = SITE_CORES;
const MENTA = '#5fd39a';
type Plano = { id: string; nome: string; descricao: string; preco_mensal: number | null; limite_contas: number; modulos: string[]; ordem: number };
const nomeModulo = (id: string) => MODULES.find(m => m.id === id)?.name ?? id;
const preco = (v: number | null) => (v === null ? 'Sob consulta' : `${v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })}/mês`);

/* ---------- Croqui real com a aferição avançando bomba a bomba ---------- */
const BOMBAS: BombaCadastro[] = [
  ['Gasolina comum', 'Gasolina aditivada', 'Etanol', 'Gasolina comum'], ['Gasolina comum', 'Etanol'], ['Diesel S10', 'Diesel S10', 'Diesel S500'],
  ['Gasolina comum', 'Gasolina aditivada', 'Etanol', 'Gasolina comum'], ['Diesel S10', 'Diesel S500'], ['Gasolina comum', 'Etanol'],
].map((fuels, i) => ({ id: `ex-${i + 1}`, number: `Bomba 0${i + 1}`, nozzles: fuels.map((f, j) => ({ id: `ex-${i + 1}-${j}`, number: String(i * 4 + j + 1).padStart(2, '0'), fuel: f })) }));
// Sequência da visita: bomba em andamento (amarelo), aferida (verde) e uma com não conformidade (vermelho).
const PASSOS = 14;
function corNoPasso(i: number, passo: number) {
  const feita = passo >= i * 2 + 2, andando = passo === i * 2 || passo === i * 2 + 1;
  if (feita) return i === 4 ? '#dc2626' : '#16a34a';
  return andando ? '#d97706' : undefined;
}
function CroquiAoVivo() {
  const reduz = useReducedMotion();
  const { ref, visto } = useEmVista(false, '0px');
  const [passo, setPasso] = useState(reduz ? PASSOS - 1 : 0);
  useEffect(() => {
    if (reduz || !visto) return;
    const id = setInterval(() => setPasso(x => (x + 1) % PASSOS), 750);
    return () => clearInterval(id);
  }, [reduz, visto]);
  const items = useMemo(() => layoutInicial(BOMBAS, nome => tipoDoCombustivel(nome, COMBUSTIVEIS_PADRAO)), []);
  const destaques = useMemo(() => {
    const d: Record<string, string> = {};
    items.forEach(it => { const i = BOMBAS.findIndex(b => b.id === it.ref); const cor = i >= 0 ? corNoPasso(i, passo) : undefined; if (cor) d[it.id] = cor; });
    return d;
  }, [items, passo]);
  const paleta = useMemo(() => ({ ...PALETA_ESCURA, ground: '#0f1c36', grid: '#17284a', panel: '#101d37', border: '#22345a', accent: MENTA }), []);
  return (
    <View ref={ref} style={st.moldura}>
      <CroquiCanvas items={items} bandeira="branca" mostrarNomes={false} paleta={paleta} destaques={destaques} enquadrar />
    </View>
  );
}

const MUDA = [
  'Cada registro com o nome de quem fez e o horário.',
  'Funciona sem internet e envia quando o sinal volta.',
  'Relatório em PDF no fim da visita, pronto para enviar.',
  'Cada pessoa vê só os módulos que usa.',
  'Os dados da sua empresa ficam separados das outras.',
];

export default function Inicio() {
  return <SiteTema><Pagina /></SiteTema>;
}

function Pagina() {
  const router = useRouter();
  const { desktop } = useSite();
  const s = useMemo(() => estilos(desktop), [desktop]);
  const reduz = useReducedMotion();
  const scroll = useAnimatedRef<Animated.ScrollView>();
  const scrollY = useSharedValue(0);
  const aoRolar = useAnimatedScrollHandler(e => { scrollY.value = e.contentOffset.y; });
  const [vh, setVh] = useState(0);
  const [yHistoria, setYHistoria] = useState(0);
  const [yPlanos, setYPlanos] = useState(0);
  const ir = useCallback((y: number) => scroll.current?.scrollTo({ y, animated: !reduz }), [scroll, reduz]);

  const [planos, setPlanos] = useState<Plano[] | null>(null);
  const [erroPlanos, setErroPlanos] = useState(false);
  const carregarPlanos = useCallback(async () => {
    setErroPlanos(false);
    if (!supabase) { setErroPlanos(true); return; }
    const { data, error } = await supabase.from('planos').select('id,nome,descricao,preco_mensal,limite_contas,modulos,ordem').eq('ativo', true).order('ordem');
    if (error) setErroPlanos(true); else setPlanos((data ?? []) as Plano[]);
  }, []);
  useEffect(() => { void carregarPlanos(); }, [carregarPlanos]);

  const entrada = (atraso: number) => (reduz ? undefined : FadeInDown.duration(700).delay(atraso).easing(EASE));

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <SiteNav onComoFunciona={() => ir(yHistoria)} onPlanos={() => ir(yPlanos - 24)} />
      <Animated.ScrollView ref={scroll} onScroll={aoRolar} scrollEventThrottle={16} onLayout={(e: LayoutChangeEvent) => setVh(e.nativeEvent.layout.height)} style={{ backgroundColor: C.bg }}>
        {/* Abertura */}
        <Faixa style={s.hero}>
          <View style={s.heroTexto}>
            <Animated.Text entering={entrada(0)} style={s.h1} accessibilityRole="header">Sua operação não cabe mais no papel.</Animated.Text>
            <Animated.Text entering={entrada(120)} style={s.sub}>Auditorias, inventários, aferições e medições de qualquer unidade, no celular e no painel, com o nome de quem fez.</Animated.Text>
            <Animated.View entering={entrada(240)} style={s.ctas}>
              <BotaoSite titulo={CTA_EMPRESA} grande onPress={() => router.push('/criar-empresa')} />
              <BotaoSite titulo="Ver como funciona" tipo="secundario" grande onPress={() => ir(yHistoria)} />
            </Animated.View>
          </View>
          <Animated.View entering={reduz ? undefined : FadeIn.duration(900).delay(200).easing(EASE)} style={s.heroCena}>
            <CenaHero />
          </Animated.View>
        </Faixa>

        {/* O problema, contado pela rolagem (filha direta do conteúdo: a posição medida é a da página). */}
        <View onLayout={e => setYHistoria(e.nativeEvent.layout.y)} />
        {vh ? <Historia scrollY={scrollY} vh={vh} desktop={desktop} /> : null}

        {/* Setores */}
        <Faixa style={s.secao}>
          <Revela><Text style={s.h2} accessibilityRole="header">Do posto à fábrica, o mesmo padrão em todas as unidades.</Text></Revela>
          <Revela atraso={80}><Text style={s.corpo}>Para redes de postos, supermercados, indústrias, centros de distribuição e franquias.</Text></Revela>
          <View style={{ marginTop: 32 }}><Setores desktop={desktop} /></View>
        </Faixa>

        {/* Ao vivo: o croqui de verdade do sistema */}
        <Faixa style={[s.secao, desktop && { flexDirection: 'row', alignItems: 'center', gap: 56 }]}>
          <View style={{ flex: desktop ? 0.8 : undefined, gap: 14 }}>
            <Revela><Text style={s.h2} accessibilityRole="header">Acompanhe enquanto a equipe trabalha.</Text></Revela>
            <Revela atraso={80}><Text style={s.corpo}>O contorno de cada bomba muda de cor conforme a aferição avança: amarelo em andamento, verde aferida, vermelho com não conformidade. É o croqui de verdade do sistema.</Text></Revela>
          </View>
          <Revela atraso={120} style={{ flex: desktop ? 1.2 : undefined, marginTop: desktop ? 0 : 24 }}><CroquiAoVivo /></Revela>
        </Faixa>

        {/* O que muda */}
        <Faixa style={s.secao}>
          <Revela><Text style={s.h2} accessibilityRole="header">O que muda no dia seguinte.</Text></Revela>
          <View style={{ marginTop: 28, gap: desktop ? 22 : 16 }}>
            {MUDA.map((m, i) => (
              <Revela key={m} atraso={i * 90} distancia={18}>
                <View style={s.muda}>
                  <View style={s.mudaCheck}><CheckIcon size={desktop ? 18 : 15} color={C.primaryText} weight="bold" /></View>
                  <Text style={s.mudaTxt}>{m}</Text>
                </View>
              </Revela>
            ))}
          </View>
        </Faixa>

        {/* Planos */}
        <View onLayout={e => setYPlanos(e.nativeEvent.layout.y)}>
          <Faixa style={s.secao}>
            <Revela><Text style={s.h2} accessibilityRole="header">Planos por tamanho de equipe.</Text></Revela>
            <Revela atraso={80}><Text style={s.corpo}>Comece com poucas contas e aumente quando a operação crescer. Contas inativas não contam.</Text></Revela>
            {erroPlanos ? (
              <View style={s.aviso}>
                <WarningCircleIcon size={20} color="#f1bd65" />
                <Text style={[s.corpo, { flex: 1 }]}>Não foi possível carregar os planos agora.</Text>
                <BotaoSite titulo="Tentar de novo" tipo="secundario" onPress={() => void carregarPlanos()} />
              </View>
            ) : (
              <View style={[s.planos, desktop && { flexDirection: 'row', alignItems: 'stretch' }]}>
                {(planos ?? [null, null, null]).map((p, i) => {
                  if (!p) return <View key={i} style={[s.plano, desktop && { flex: 1 }, { minHeight: 380, opacity: 0.5 }]} />;
                  const destaque = p.ordem === 2;
                  const semPreco = p.preco_mensal === null;
                  return (
                    <Revela key={p.id} atraso={i * 90} style={desktop ? { flex: 1 } : undefined}>
                      <View style={[s.plano, { flex: 1 }, destaque && s.planoDestaque]}>
                        <Text style={[s.planoNome, destaque && { color: MENTA }]}>{p.nome}</Text>
                        <Text style={s.planoGrande}>{semPreco ? `${p.limite_contas} contas` : preco(p.preco_mensal)}</Text>
                        <Text style={s.planoSub}>{semPreco ? 'Preço sob consulta' : `Até ${p.limite_contas} contas`}</Text>
                        <Text style={s.planoDesc}>{p.descricao}</Text>
                        <View style={{ gap: 9, flex: 1, marginTop: 4 }}>
                          {p.modulos.map(id => (
                            <View key={id} style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
                              <CheckIcon size={15} color={MENTA} weight="bold" />
                              <Text style={s.planoItem}>{nomeModulo(id)}</Text>
                            </View>
                          ))}
                        </View>
                        <BotaoSite titulo={CTA_EMPRESA} tipo={destaque ? 'primario' : 'secundario'} onPress={() => router.push(`/criar-empresa?plano=${p.id}`)} style={{ marginTop: 18 }} />
                      </View>
                    </Revela>
                  );
                })}
              </View>
            )}
          </Faixa>
        </View>

        {/* Fechamento */}
        <Faixa style={[s.secao, { paddingBottom: 48 }]}>
          <Revela>
            <View style={s.final}>
              <Text style={[s.h2, { flex: desktop ? 1 : undefined }]}>Chega de papel. Comece pela sua operação.</Text>
              <BotaoSite titulo={CTA_EMPRESA} grande onPress={() => router.push('/criar-empresa')} />
            </View>
          </Revela>
        </Faixa>
        <SiteFooter />
      </Animated.ScrollView>
    </View>
  );
}

const st = StyleSheet.create({
  moldura: { borderRadius: 24, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface, padding: 12 },
});

const estilos = (desktop: boolean) => StyleSheet.create({
  hero: { flexDirection: desktop ? 'row' : 'column', alignItems: 'center', gap: desktop ? 40 : 28, paddingTop: desktop ? 72 : 40, paddingBottom: desktop ? 56 : 24 },
  heroTexto: { flex: desktop ? 1 : undefined, maxWidth: 600, gap: 22 },
  h1: { color: C.text, fontSize: desktop ? 56 : 38, lineHeight: desktop ? 60 : 43, fontWeight: '800', letterSpacing: desktop ? -2 : -1.2 },
  sub: { color: C.textMuted, fontSize: desktop ? 19 : 16.5, lineHeight: desktop ? 30 : 25, maxWidth: 520 },
  ctas: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 6 },
  heroCena: { flex: desktop ? 1.05 : undefined, width: desktop ? undefined : '100%' },
  secao: { paddingTop: desktop ? 120 : 72, gap: 12 },
  h2: { color: C.text, fontSize: desktop ? 40 : 28, lineHeight: desktop ? 46 : 34, fontWeight: '800', letterSpacing: desktop ? -1.2 : -0.7, maxWidth: 760 },
  corpo: { color: C.textMuted, fontSize: desktop ? 17 : 15.5, lineHeight: desktop ? 27 : 24, maxWidth: 640 },
  muda: { flexDirection: 'row', alignItems: 'center', gap: desktop ? 20 : 14 },
  mudaCheck: { width: desktop ? 36 : 28, height: desktop ? 36 : 28, borderRadius: 99, backgroundColor: MENTA, alignItems: 'center', justifyContent: 'center' },
  mudaTxt: { flex: 1, color: C.text, fontSize: desktop ? 28 : 19, lineHeight: desktop ? 36 : 26, fontWeight: '700', letterSpacing: desktop ? -0.6 : -0.3 },
  planos: { gap: 16, marginTop: 32 },
  plano: { borderRadius: 24, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface, padding: 26, gap: 10 },
  planoDestaque: { borderColor: MENTA, backgroundColor: '#0f2a2a' },
  planoNome: { color: C.textMuted, fontSize: 14, fontWeight: '800', letterSpacing: 0.4 },
  planoGrande: { color: C.text, fontSize: 36, fontWeight: '800', letterSpacing: -1 },
  planoSub: { color: C.textMuted, fontSize: 14, fontWeight: '700', marginTop: -6 },
  planoDesc: { color: C.textMuted, fontSize: 14.5, lineHeight: 21 },
  planoItem: { color: C.text, fontSize: 14.5 },
  aviso: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderColor: C.border, borderRadius: 16, padding: 16, marginTop: 24 },
  final: { borderRadius: 28, padding: desktop ? 48 : 28, gap: 24, flexDirection: desktop ? 'row' : 'column', alignItems: desktop ? 'center' : 'flex-start', backgroundColor: '#0f2a2a', borderWidth: 1, borderColor: '#1d4a40' },
});
