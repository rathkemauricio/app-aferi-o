import { useEffect, useRef, useState } from 'react';
import { BackHandler, Platform, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Animated, {
  Easing, FadeIn, FadeInDown, FadeInUp, FadeOut, ReduceMotion, useAnimatedStyle, useReducedMotion, useSharedValue,
  withRepeat, withSpring, withTiming,
} from 'react-native-reanimated';
import { useTutorialInterno } from './contexto';
import type { ElementoAlvo } from './tipos';

type Ret = { x: number; y: number; w: number; h: number };
const esperar = (ms: number) => new Promise(r => setTimeout(r, ms));
const igual = (a: Ret | null, b: Ret | null) => !!a && !!b && Math.abs(a.x - b.x) < 1 && Math.abs(a.y - b.y) < 1 && Math.abs(a.w - b.w) < 1 && Math.abs(a.h - b.h) < 1;
const MOLA = { damping: 22, stiffness: 190, mass: 0.9 };

/** Camada do tutorial: véu com o recorte animado sobre o alvo, pulso nos passos de toque e o cartão do passo. */
export function Camada({ pularPasso }: { pularPasso: (direcao: 1 | -1) => void }) {
  const ctx = useTutorialInterno();
  const { tema: T, rotulos: R } = ctx;
  const { tutorial, indice } = ctx.ativo!;
  const passo = tutorial.passos[indice];
  const total = tutorial.passos.length;
  const ultimo = indice === total - 1;
  const toque = passo.acao === 'toque';
  const folga = passo.folga ?? 8;
  const raio = passo.raio ?? 14;
  const { width: W, height: H } = useWindowDimensions();
  const reduz = useReducedMotion();
  const raiz = useRef<ElementoAlvo>(null);
  const [ret, setRet] = useState<Ret | null>(null);
  const [pronto, setPronto] = useState(false);
  const anterior = useRef(indice);
  const direcao = useRef<1 | -1>(1);

  /** Mede o alvo do passo (em relação à camada). Tenta algumas vezes: o alvo pode montar depois de navegar. */
  const medir = async (tentativas = 8): Promise<Ret | null> => {
    if (!passo.alvo) return null;
    for (let i = 0; i < tentativas; i++) {
      const alvo = ctx.alvo(passo.alvo)?.current;
      const base = raiz.current;
      if (alvo && base) {
        const r = await new Promise<Ret | null>(ok => {
          base.measureInWindow((bx, by) => alvo.measureInWindow((x, y, w, h) => ok(w > 0 && h > 0 ? { x: x - bx, y: y - by, w, h } : null)));
        });
        if (r) return r;
      }
      await esperar(150);
    }
    return null;
  };

  /** Posição da camada na janela (para converter entre as coordenadas da janela e as da camada). */
  const origem = () => new Promise<{ x: number; y: number }>(ok => {
    const base = raiz.current;
    if (!base) { ok({ x: 0, y: 0 }); return; }
    base.measureInWindow((x, y) => ok({ x: x || 0, y: y || 0 }));
  });
  const naJanela = (el: { measureInWindow: (cb: (x: number, y: number, w: number, h: number) => void) => void }) =>
    new Promise<Ret | null>(ok => el.measureInWindow((x, y, w, h) => ok(w > 0 && h > 0 ? { x, y, w, h } : null)));

  /**
   * Se o alvo não está na parte visível, rola a área rolável que o contém até ele (RolagemTutorial; na web, sem
   * área registrada, usa scrollIntoView). Devolve true se rolou.
   */
  const trazerParaVista = async (r: Ret): Promise<boolean> => {
    const MARGEM = 10;
    const dentro = r.y >= MARGEM && (r.y + r.h <= H - MARGEM || (r.h > H * 0.6 && r.y < H * 0.4));
    if (dentro) return false;
    const alvoEl = passo.alvo ? ctx.alvo(passo.alvo)?.current : null;
    if (!alvoEl) return false;
    const o = await origem();
    const alvoJ = { x: r.x + o.x, y: r.y + o.y, w: r.w, h: r.h };
    // Área rolável que contém o alvo (pelo eixo horizontal); a mais estreita vence (a do conteúdo, não a da página).
    let melhor: { it: ReturnType<typeof ctx.rolagens>[number]; rect: Ret } | null = null;
    for (const it of ctx.rolagens()) {
      const no = it.ref.current as unknown as { measureInWindow?: (cb: (x: number, y: number, w: number, h: number) => void) => void } | null;
      if (!no?.measureInWindow) continue;
      const rect = await naJanela(no as { measureInWindow: (cb: (x: number, y: number, w: number, h: number) => void) => void });
      if (!rect) continue;
      const cx = alvoJ.x + alvoJ.w / 2;
      if (cx < rect.x - 2 || cx > rect.x + rect.w + 2) continue;
      if (!melhor || rect.w < melhor.rect.w) melhor = { it, rect };
    }
    if (melhor) {
      const { it, rect } = melhor;
      // Alvo alto demais para a janela: alinha o topo; senão, deixa ele no alto para sobrar espaço ao cartão embaixo.
      const aim = r.h > rect.h * 0.55 ? 12 : Math.min(rect.h * 0.22, 150);
      const y = Math.max(0, it.posicao() + (alvoJ.y - rect.y - aim));
      if (Math.abs(y - it.posicao()) < 2) return false;
      it.ref.current?.scrollTo({ y, animated: !reduz });
      return true;
    }
    if (Platform.OS === 'web') {
      const el = alvoEl as unknown as { scrollIntoView?: (o: object) => void };
      if (el.scrollIntoView) { el.scrollIntoView({ block: 'center', behavior: reduz ? 'auto' : 'smooth' }); return true; }
    }
    return false;
  };

  // Prepara o passo: roda o `antes`, espera, mede; passo opcional sem alvo na tela é pulado.
  useEffect(() => {
    direcao.current = indice >= anterior.current ? 1 : -1;
    anterior.current = indice;
    let vivo = true;
    setPronto(false);
    void (async () => {
      try { await passo.antes?.(); } catch { /* segue mesmo assim */ }
      const extra = passo.espera ?? (passo.antes ? 350 : 0);
      if (extra) await esperar(extra);
      if (!vivo) return;
      let r = await medir(passo.opcional ? 4 : 8);
      if (!vivo) return;
      if (passo.alvo && !r && passo.opcional) { pularPasso(direcao.current); return; }
      // Alvo fora da parte visível: rola até ele (até 2 tentativas) e mede de novo.
      for (let i = 0; r && i < 2; i++) {
        if (!(await trazerParaVista(r))) break;
        await esperar(reduz ? 80 : 520);
        if (!vivo) return;
        r = (await medir(2)) ?? r;
      }
      setRet(r);
      setPronto(true);
    })();
    return () => { vivo = false; };
  }, [indice]); // eslint-disable-line react-hooks/exhaustive-deps

  // Acompanha mudanças de layout (rolagem, teclado, janela redimensionada).
  useEffect(() => {
    if (!pronto || !passo.alvo) return;
    const t = setInterval(() => { void medir(1).then(r => { if (r) setRet(v => (igual(v, r) ? v : r)); }); }, 400);
    return () => clearInterval(t);
  }, [pronto, indice, W, H]); // eslint-disable-line react-hooks/exhaustive-deps

  // Recorte: sem alvo, encolhe no centro (véu inteiro).
  const hx = useSharedValue(W / 2), hy = useSharedValue(H / 2), hw = useSharedValue(0), hh = useSharedValue(0);
  useEffect(() => {
    const alvo = ret ? { x: ret.x - folga, y: ret.y - folga, w: ret.w + folga * 2, h: ret.h + folga * 2 } : { x: W / 2, y: H / 2, w: 0, h: 0 };
    const ir = (v: { value: number }, n: number) => { v.value = reduz ? n : withSpring(n, MOLA); };
    ir(hx, alvo.x); ir(hy, alvo.y); ir(hw, alvo.w); ir(hh, alvo.h);
  }, [ret, folga, W, H, reduz]); // eslint-disable-line react-hooks/exhaustive-deps
  const recorte = useAnimatedStyle(() => ({ left: hx.value, top: hy.value, width: hw.value, height: hh.value }));

  // Pulso em volta do destaque nos passos de toque.
  const pulso = useSharedValue(0);
  useEffect(() => {
    pulso.value = 0;
    if (toque && !reduz) pulso.value = withRepeat(withTiming(1, { duration: 1400, easing: Easing.out(Easing.quad) }), -1, false);
  }, [toque, reduz, indice]); // eslint-disable-line react-hooks/exhaustive-deps
  const anel = useAnimatedStyle(() => ({
    left: hx.value, top: hy.value, width: hw.value, height: hh.value,
    opacity: 0.85 * (1 - pulso.value), transform: [{ scale: 1 + pulso.value * 0.14 }],
  }));

  // Teclado (web) e botão voltar (Android).
  useEffect(() => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const tecla = (e: KeyboardEvent) => {
        if (e.key === 'Escape') { e.preventDefault(); ctx.parar(false); }
        else if ((e.key === 'ArrowRight' || e.key === 'Enter') && !toque) { e.preventDefault(); ctx.avancar(); }
        else if (e.key === 'ArrowLeft') { e.preventDefault(); ctx.voltar(); }
      };
      window.addEventListener('keydown', tecla);
      return () => window.removeEventListener('keydown', tecla);
    }
    const sub = BackHandler.addEventListener('hardwareBackPress', () => { ctx.parar(false); return true; });
    return () => sub.remove();
  }, [toque, ctx]);

  // Cartão: embaixo do alvo se couber, senão em cima; sem espaço nos dois, preso embaixo da tela. Sempre dentro da tela.
  const cw = Math.min(380, W - 24);
  const [altCartao, setAltCartao] = useState(210);
  const LIVRE = 12;
  const limitar = (v: number) => Math.min(Math.max(LIVRE, v), Math.max(LIVRE, H - altCartao - LIVRE));
  let cartaoPos: { left: number; top: number } = { left: (W - cw) / 2, top: limitar(H / 2 - altCartao / 2) };
  let seta: { x: number; lado: 'cima' | 'baixo' } | null = null;
  if (ret) {
    const abaixo = H - (ret.y + ret.h + folga) - 14;
    const acima = ret.y - folga - 14;
    const lado = passo.lado && passo.lado !== 'auto' ? passo.lado : abaixo >= altCartao ? 'baixo' : acima >= altCartao ? 'cima' : 'fixo';
    const left = Math.min(Math.max(12, ret.x + ret.w / 2 - cw / 2), W - cw - 12);
    const xSeta = Math.min(Math.max(18, ret.x + ret.w / 2 - left - 8), cw - 34);
    if (lado === 'baixo') {
      const top = ret.y + ret.h + folga + 14;
      cartaoPos = { left, top: limitar(top) };
      if (Math.abs(cartaoPos.top - top) < 4) seta = { x: xSeta, lado: 'cima' };
    } else if (lado === 'cima') {
      const top = ret.y - folga - 14 - altCartao;
      cartaoPos = { left, top: limitar(top) };
      if (Math.abs(cartaoPos.top - top) < 4) seta = { x: xSeta, lado: 'baixo' };
    } else cartaoPos = { left: (W - cw) / 2, top: limitar(H - altCartao - 16) };
  }

  const bloqueio = (estilo: object, k: string) => <Pressable key={k} accessible={false} style={[s.abs, estilo]} onPress={() => undefined} />;
  const r = ret ? { x: ret.x - folga, y: ret.y - folga, w: ret.w + folga * 2, h: ret.h + folga * 2 } : null;

  return (
    <Animated.View ref={raiz} entering={FadeIn.duration(200)} exiting={FadeOut.duration(160)} style={[StyleSheet.absoluteFill, s.camada]} pointerEvents="box-none">
      {/* Véu com o recorte (sombra enorme em volta de uma caixa vazada). */}
      <Animated.View pointerEvents="none" style={[s.abs, { borderRadius: raio, borderWidth: ret ? 2 : 0, borderColor: T.pulso, boxShadow: `0 0 0 ${Math.ceil(Math.max(W, H) * 2)}px ${T.veu}` }, recorte]} />
      {toque && ret ? <Animated.View pointerEvents="none" style={[s.abs, { borderRadius: raio + 4, borderWidth: 3, borderColor: T.pulso }, anel]} /> : null}

      {/* Bloqueia o resto da tela; nos passos de toque, o recorte fica livre para tocar no elemento de verdade. */}
      {toque && r ? [
        bloqueio({ left: 0, top: 0, right: 0, height: Math.max(0, r.y) }, 'c'),
        bloqueio({ left: 0, top: r.y + r.h, right: 0, bottom: 0 }, 'b'),
        bloqueio({ left: 0, top: r.y, width: Math.max(0, r.x), height: r.h }, 'e'),
        bloqueio({ left: r.x + r.w, top: r.y, right: 0, height: r.h }, 'd'),
      ] : bloqueio({ left: 0, top: 0, right: 0, bottom: 0 }, 'tudo')}

      {pronto ? (
        <Animated.View key={indice}
          entering={reduz ? FadeIn.duration(120) : (seta?.lado === 'baixo' ? FadeInDown : FadeInUp).springify().damping(18).stiffness(200).reduceMotion(ReduceMotion.System)}
          exiting={FadeOut.duration(90)}
          onLayout={e => { const h = Math.round(e.nativeEvent.layout.height); if (h && Math.abs(h - altCartao) > 2) setAltCartao(h); }}
          style={[s.cartao, { width: cw, backgroundColor: T.cartao, borderColor: T.borda }, cartaoPos]}
          accessibilityRole="alert" accessibilityLabel={`${passo.titulo}. ${passo.texto ?? ''}`}>
          {seta ? <View style={[s.seta, { left: seta.x, backgroundColor: T.cartao, borderColor: T.borda }, seta.lado === 'cima' ? s.setaCima : s.setaBaixo]} /> : null}
          <View style={s.topo}>
            <View style={s.pontos}>
              {total <= 12 ? tutorial.passos.map((_, i) => (
                <View key={i} style={[s.ponto, { backgroundColor: i === indice ? T.destaque : T.borda, width: i === indice ? 18 : 6 }]} />
              )) : null}
            </View>
            <Text style={[s.progresso, { color: T.textoSuave }]}>{R.progresso(indice + 1, total)}</Text>
          </View>
          <Text style={[s.titulo, { color: T.texto }]} accessibilityRole="header">{passo.titulo}</Text>
          {passo.texto ? <Text style={[s.texto, { color: T.textoSuave }]}>{passo.texto}</Text> : null}
          {toque ? (
            <View style={[s.dica, { backgroundColor: T.borda }]}>
              <View style={[s.dicaPonto, { backgroundColor: T.pulso }]} />
              <Text style={[s.dicaTxt, { color: T.texto }]}>{R.toqueParaSeguir}</Text>
            </View>
          ) : null}
          <View style={s.rodape}>
            {!ultimo ? (
              <Pressable accessibilityRole="button" onPress={() => ctx.parar(false)} hitSlop={8} style={({ pressed }) => [s.pular, pressed && { opacity: 0.6 }]}>
                <Text style={[s.pularTxt, { color: T.textoSuave }]}>{R.pular}</Text>
              </Pressable>
            ) : <View />}
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {indice > 0 ? (
                <Pressable accessibilityRole="button" onPress={ctx.voltar} style={({ pressed }) => [s.botao, { borderColor: T.borda, backgroundColor: T.cartao }, pressed && { opacity: 0.75 }]}>
                  <Text style={[s.botaoTxt, { color: T.texto }]}>{R.voltar}</Text>
                </Pressable>
              ) : null}
              <Pressable accessibilityRole="button" onPress={ctx.avancar}
                style={({ pressed }) => [s.botao, toque ? { borderColor: T.borda, backgroundColor: T.cartao } : { borderColor: T.destaque, backgroundColor: T.destaque }, pressed && { opacity: 0.85, transform: [{ scale: 0.97 }] }]}>
                <Text style={[s.botaoTxt, { color: toque ? T.texto : T.sobreDestaque }]}>{ultimo ? R.concluir : R.proximo}</Text>
              </Pressable>
            </View>
          </View>
        </Animated.View>
      ) : null}
    </Animated.View>
  );
}

const s = StyleSheet.create({
  camada: { zIndex: 2000, elevation: 2000 },
  abs: { position: 'absolute' },
  cartao: { position: 'absolute', borderRadius: 18, borderWidth: 1, paddingHorizontal: 18, paddingTop: 14, paddingBottom: 14, gap: 6, boxShadow: '0 18px 50px rgba(5, 12, 28, 0.35)', elevation: 12 },
  seta: { position: 'absolute', width: 16, height: 16, borderWidth: 1, transform: [{ rotate: '45deg' }] },
  setaCima: { top: -8, borderRightWidth: 0, borderBottomWidth: 0 },
  setaBaixo: { bottom: -8, borderLeftWidth: 0, borderTopWidth: 0 },
  topo: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 },
  pontos: { flexDirection: 'row', gap: 4, alignItems: 'center' },
  ponto: { height: 6, borderRadius: 3 },
  progresso: { fontSize: 12, fontWeight: '700', fontVariant: ['tabular-nums'] },
  titulo: { fontSize: 17, fontWeight: '800', letterSpacing: -0.2, lineHeight: 22 },
  texto: { fontSize: 14, lineHeight: 20 },
  dica: { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, marginTop: 4 },
  dicaPonto: { width: 8, height: 8, borderRadius: 4 },
  dicaTxt: { fontSize: 12.5, fontWeight: '700' },
  rodape: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 },
  pular: { paddingVertical: 6, paddingHorizontal: 2 },
  pularTxt: { fontSize: 13.5, fontWeight: '700' },
  botao: { height: 40, paddingHorizontal: 16, borderRadius: 999, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  botaoTxt: { fontSize: 14, fontWeight: '800' },
});
