import { useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { type LayoutChangeEvent, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, useAnimatedRef, useAnimatedScrollHandler, useReducedMotion, useSharedValue } from 'react-native-reanimated';
import { AreasDoPosto } from '../components/site/AreasDoPosto';
import { Fatos, HeroOrbita } from '../components/site/HeroOrbita';
import { Historia } from '../components/site/Historia';
import { EASE, Revela } from '../components/site/motion';
import { BotaoSite, CTA_COMECAR, CTA_ENTENDER, Faixa, MENTA, ROTA_COMECAR, ROTA_ENTENDER, SITE_CORES, SiteFooter, SiteNav, SiteTema, useSite } from '../components/site/SiteChrome';
import { Telas } from '../components/site/Telas';
import { CheckIcon } from '../ui/icons';

// O módulo Croqui é privado: não aparece no site (nem texto, nem demonstração, nem nos prints).
const C = SITE_CORES;

const MUDA = [
  'Cada aferição, medição e contagem com o nome de quem fez e o horário.',
  'Funciona sem internet na pista e envia quando o sinal volta.',
  'Sobra e falta de combustível calculadas na hora.',
  'Relatório em PDF no fim da visita ao posto, pronto para enviar.',
  'Cada pessoa vê só os módulos que usa.',
  'Os dados da sua rede ficam separados das outras.',
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
  const [yPosto, setYPosto] = useState(0);
  const [yTelas, setYTelas] = useState(0);
  const ir = useCallback((y: number) => scroll.current?.scrollTo({ y, animated: !reduz }), [scroll, reduz]);

  const entrada = (atraso: number) => (reduz ? undefined : FadeInDown.duration(700).delay(atraso).easing(EASE));

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <SiteNav onPosto={() => ir(yPosto - 24)} onTelas={() => ir(yTelas - 24)} />
      <Animated.ScrollView ref={scroll} onScroll={aoRolar} scrollEventThrottle={16} onLayout={(e: LayoutChangeEvent) => setVh(e.nativeEvent.layout.height)} style={{ backgroundColor: C.bg }}>
        {/* Abertura: texto à esquerda; à direita, o arco com os módulos e o print real do celular. */}
        <Faixa style={s.hero}>
          <View style={s.heroTexto}>
            <Animated.View entering={entrada(0)} style={s.etiqueta}><Text style={s.etiquetaTxt}>Para redes de postos de combustível</Text></Animated.View>
            <Animated.Text entering={entrada(80)} style={s.h1} accessibilityRole="header">{'Auditoria de postos,\nsem papel.'}</Animated.Text>
            <Animated.Text entering={entrada(160)} style={s.sub}>Aferição de bombas, medição de tanques, contagem da conveniência e checklist da operação no celular, com o nome de quem fez e o relatório na hora.</Animated.Text>
            <Animated.View entering={entrada(240)} style={s.ctas}>
              <BotaoSite titulo={CTA_COMECAR} tipo="destaque" grande onPress={() => router.push(ROTA_COMECAR)} />
              <BotaoSite titulo={CTA_ENTENDER} tipo="secundario" grande onPress={() => router.push(ROTA_ENTENDER)} />
            </Animated.View>
          </View>
          <Animated.View entering={reduz ? undefined : FadeIn.duration(900).delay(150).easing(EASE)} style={s.heroCena}>
            <HeroOrbita />
          </Animated.View>
          <Animated.View entering={reduz ? undefined : FadeIn.duration(700).delay(450).easing(EASE)} style={s.heroFatos}>
            <Fatos linha={!desktop} />
          </Animated.View>
        </Faixa>

        {/* O problema, contado pela rolagem (filha direta do conteúdo: a posição medida é a da página). */}
        {vh ? <Historia scrollY={scrollY} vh={vh} desktop={desktop} /> : null}

        {/* Áreas do posto */}
        <View onLayout={e => setYPosto(e.nativeEvent.layout.y)}><Faixa style={s.secao}>
          <Revela><Text style={s.h2} accessibilityRole="header">Da pista à conveniência, cada área do posto.</Text></Revela>
          <Revela atraso={80}><Text style={s.corpo}>Feito por quem audita postos todos os dias: bombas, tanques, loja, equipe e a rede inteira no mesmo sistema.</Text></Revela>
          <View style={{ marginTop: 32 }}><AreasDoPosto desktop={desktop} /></View>
        </Faixa></View>

        {/* Telas reais do painel */}
        <View onLayout={e => setYTelas(e.nativeEvent.layout.y)}><Faixa style={s.secao}>
          <Revela><Text style={s.h2} accessibilityRole="header">Veja as telas.</Text></Revela>
          <Revela atraso={80}><Text style={s.corpo}>O painel web que a gestão usa para acompanhar a rede. A equipe faz as mesmas verificações pelo app no celular.</Text></Revela>
          <Revela atraso={120} style={{ marginTop: 24 }}><Telas desktop={desktop} /></Revela>
        </Faixa></View>

        {/* O que muda */}
        <Faixa style={s.secao}>
          <Revela><Text style={s.h2} accessibilityRole="header">O que muda no dia seguinte.</Text></Revela>
          <View style={{ marginTop: 28, gap: desktop ? 22 : 16 }}>
            {MUDA.map((m, i) => (
              <Revela key={m} atraso={i * 90} distancia={18}>
                <View style={s.muda}>
                  <View style={s.mudaCheck}><CheckIcon size={desktop ? 18 : 15} color={C.text} weight="bold" /></View>
                  <Text style={s.mudaTxt}>{m}</Text>
                </View>
              </Revela>
            ))}
          </View>
        </Faixa>

        {/* Fechamento */}
        <Faixa style={[s.secao, { paddingBottom: 48 }]}>
          <Revela>
            <View style={s.final}>
              <Text style={[s.h2, { flex: desktop ? 1 : undefined, color: '#ffffff' }]}>Chega de papel na pista. Comece pela sua rede.</Text>
              <View style={{ gap: 12, alignItems: desktop ? 'flex-end' : 'flex-start' }}>
                <BotaoSite titulo={CTA_COMECAR} tipo="claro" grande onPress={() => router.push(ROTA_COMECAR)} />
                <Text accessibilityRole="link" onPress={() => router.push(ROTA_ENTENDER)} style={s.finalLink}>{CTA_ENTENDER}</Text>
              </View>
            </View>
          </Revela>
        </Faixa>
        <SiteFooter />
      </Animated.ScrollView>
    </View>
  );
}

const estilos = (desktop: boolean) => StyleSheet.create({
  hero: { flexDirection: desktop ? 'row' : 'column', alignItems: 'center', gap: desktop ? 24 : 24, paddingTop: desktop ? 56 : 32, paddingBottom: desktop ? 40 : 16 },
  heroTexto: { flex: desktop ? 1.15 : undefined, maxWidth: 580, gap: 20 },
  etiqueta: { alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, borderWidth: 1, borderColor: C.border, backgroundColor: '#ffffff' },
  etiquetaTxt: { color: C.textMuted, fontSize: 12.5, fontWeight: '700' },
  heroFatos: { width: desktop ? 140 : '100%', alignSelf: desktop ? 'center' : 'stretch' },
  h1: { color: C.text, fontSize: desktop ? 46 : 34, lineHeight: desktop ? 52 : 40, fontWeight: '800', letterSpacing: desktop ? -1.4 : -1 },
  sub: { color: C.textMuted, fontSize: desktop ? 19 : 16.5, lineHeight: desktop ? 30 : 25, maxWidth: 520 },
  ctas: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 6 },
  heroCena: { flex: desktop ? 0.95 : undefined, width: desktop ? undefined : '100%', maxWidth: 520 },
  secao: { paddingTop: desktop ? 120 : 72, gap: 12 },
  h2: { color: C.text, fontSize: desktop ? 40 : 28, lineHeight: desktop ? 46 : 34, fontWeight: '800', letterSpacing: desktop ? -1.2 : -0.7, maxWidth: 760 },
  corpo: { color: C.textMuted, fontSize: desktop ? 17 : 15.5, lineHeight: desktop ? 27 : 24, maxWidth: 640 },
  muda: { flexDirection: 'row', alignItems: 'center', gap: desktop ? 20 : 14 },
  mudaCheck: { width: desktop ? 34 : 28, height: desktop ? 34 : 28, borderRadius: 99, backgroundColor: MENTA, alignItems: 'center', justifyContent: 'center' },
  mudaTxt: { flex: 1, color: C.text, fontSize: desktop ? 26 : 19, lineHeight: desktop ? 34 : 26, fontWeight: '700', letterSpacing: desktop ? -0.5 : -0.3 },
  final: { borderRadius: 20, padding: desktop ? 48 : 28, gap: 24, flexDirection: desktop ? 'row' : 'column', alignItems: desktop ? 'center' : 'flex-start', backgroundColor: C.text },
  finalLink: { color: '#c9d4e6', fontSize: 14.5, fontWeight: '600', textDecorationLine: 'underline' },
});
