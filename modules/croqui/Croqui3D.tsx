import type React from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, type GestureResponderEvent, type LayoutChangeEvent, PanResponder, Platform, Pressable, Text, View } from 'react-native';
import { SvgXml } from 'react-native-svg';
import { BANDEIRAS } from '../../lib/data';
import { useCatalogoCroqui } from './Canvas';
import { type Caixa, cameraPadrao, carroSvg, cena3d, cruzaCaixa, dentro, INCL_MAX, INCL_MIN, INCL_PADRAO, mangueiraSvg, moldura, projecao, type Pt, recorteSvg, svgCom, type Tela, type Vista } from './iso';
import { type Item, T } from './model';
import { bicoDaVisita, type Chave, planejarMovimento } from './movimento';
import { ligacoesDosBicos, subsoloSvg } from './subsolo';

/*
 * Croqui em 3D (maquete) com câmera livre: arrastar gira 360° em volta do posto e inclina (puxando para cima a câmera
 * passa para baixo do piso: a terra fica translúcida e os tanques e as ligações aparecem por baixo). Pinça (ou Ctrl +
 * rolagem) dá zoom; dois dedos (ou Shift + arrastar) movem. Tocar por cima mostra o subsolo em raio X.
 * Frentistas uniformizados (cores da bandeira) passeiam; carros chegam, o frentista abastece, recebe e o carro sai;
 * no subsolo, o combustível corre do tanque até o bico e pela mangueira até o carro.
 * Camadas por cima do piso: maquete · [subsolo] · mangueiras e carros · frentistas · carro na frente de quem está atrás
 * dele · volumes na frente do carro parado · [fluxo] · telhado e etiquetas · baloes. Por baixo: telhado, volumes e piso
 * · carros e frentistas · terra translúcida, tanques, fios e fluxo · etiquetas · baloes. Só visualização.
 */

/** Uniforme por bandeira (camisa, detalhes do boné e da faixa, calça). As demais usam as cores da bandeira. */
const UNIFORMES: Record<string, { camisa: string; detalhe: string; calca: string }> = {
  ipiranga: { camisa: '#0b4ea2', detalhe: '#ffcc00', calca: '#1c2b4a' },
  shell: { camisa: '#dd1d21', detalhe: '#ffd500', calca: '#2b2d33' },
  petrobras: { camisa: '#009b3a', detalhe: '#ffd500', calca: '#1f3b2c' },
};
function uniforme(bandeira: string) {
  const u = UNIFORMES[bandeira];
  if (u) return u;
  const b = BANDEIRAS[bandeira] ?? BANDEIRAS.branca ?? { c: '#6b7280', tc: '#ffffff' };
  return { camisa: b.c, detalhe: b.tc, calca: '#2f3640' };
}
const PELES = ['#f1c27d', '#c68642', '#8d5524', '#e0ac69', '#ffdbac'];
const nativo = Platform.OS !== 'web';
/** Proporção do quadro (a da câmera padrão); a maquete se ajusta dentro dele em qualquer ângulo. */
const ASPECTO = (() => { const m = moldura(projecao(cameraPadrao())); return m.w / m.h; })();
const ZOOM_MIN = 1, ZOOM_MAX = 3;
const limita = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
type Rel = Animated.Value;

/** Instantes (s) → linha do tempo 0–1 sempre crescente (o motor de animação exige). */
function linha(ts: number[], D: number) {
  const out: number[] = [];
  ts.forEach((t, i) => { const v = t / D; out.push(i && v <= out[i - 1] ? out[i - 1] + 1e-6 : v); });
  return out;
}
/** Opacidade 1 dentro das janelas [a, b] (em ordem) e 0 fora, com uma transição curta. */
function janelas(rel: Rel, D: number, js: [number, number][], f = 0.2) {
  const ts = [0], vs = [0];
  js.filter(([a, b]) => b > a).sort((x, y) => x[0] - y[0]).forEach(([a, b]) => { ts.push(Math.max(0, a - f), a, b, b + f); vs.push(0, 1, 1, 0); });
  ts.push(D); vs.push(0);
  return rel.interpolate({ inputRange: linha(ts, D), outputRange: vs, extrapolate: 'clamp' });
}
/** Percurso na tela (pixels) → posição x/y conforme a fase 0–1, com velocidade constante. */
function percurso(fase: Animated.AnimatedModulo, l: Tela[]) {
  const acum = [0];
  for (let i = 1; i < l.length; i++) acum.push(acum[i - 1] + Math.hypot(l[i].X - l[i - 1].X, l[i].Y - l[i - 1].Y));
  const tot = acum[acum.length - 1] || 1;
  const ent = linha(acum.map(a => a / tot), 1);
  return {
    x: fase.interpolate({ inputRange: ent, outputRange: l.map(p => p.X), extrapolate: 'clamp' }),
    y: fase.interpolate({ inputRange: ent, outputRange: l.map(p => p.Y), extrapolate: 'clamp' }),
  };
}

/** Frentista uniformizado: boné e faixa na cor de detalhe, camisa e calça do uniforme. */
function Frentista({ x, y, sobe, e, u, pele }: {
  x: Animated.AnimatedInterpolation<number>; y: Animated.AnimatedInterpolation<number>; sobe: Animated.AnimatedInterpolation<number>;
  e: number; u: { camisa: string; detalhe: string; calca: string }; pele: string;
}) {
  const larg = 9 * e, alt = 23 * e;
  return (
    <Animated.View pointerEvents="none" style={{ position: 'absolute', left: -larg / 2, top: -alt, width: larg, height: alt, alignItems: 'center', transform: [{ translateX: x }, { translateY: y }] }}>
      <Animated.View style={{ alignItems: 'center', transform: [{ translateY: sobe }] }}>
        <View style={{ width: 5.4 * e, height: 5.4 * e, borderRadius: 2.7 * e, backgroundColor: pele, overflow: 'hidden' }}>
          <View style={{ height: 2.3 * e, backgroundColor: u.detalhe }} />
        </View>
        <View style={{ position: 'absolute', top: 1.5 * e, left: 4.1 * e, width: 2.7 * e, height: 0.9 * e, borderRadius: 0.45 * e, backgroundColor: u.detalhe }} />
        <View style={{ width: 7 * e, height: 8.5 * e, marginTop: 0.6 * e, borderTopLeftRadius: 3 * e, borderTopRightRadius: 3 * e, borderBottomLeftRadius: 1.5 * e, borderBottomRightRadius: 1.5 * e, backgroundColor: u.camisa, overflow: 'hidden' }}>
          <View style={{ position: 'absolute', top: 4.2 * e, left: 0, right: 0, height: 1.3 * e, backgroundColor: u.detalhe }} />
        </View>
        <View style={{ flexDirection: 'row', gap: 1.2 * e }}>
          <View style={{ width: 2.2 * e, height: 5 * e, borderRadius: 1 * e, backgroundColor: u.calca }} />
          <View style={{ width: 2.2 * e, height: 5 * e, borderRadius: 1 * e, backgroundColor: u.calca }} />
        </View>
      </Animated.View>
      <View style={{ position: 'absolute', bottom: -1.5 * e, width: 9 * e, height: 3 * e, borderRadius: 4.5 * e, backgroundColor: 'rgba(11,26,16,0.22)' }} />
    </Animated.View>
  );
}

/** SVG parado num retângulo da tela, com opacidade animada. */
function Recorte({ xml, c, op }: { xml: string; c: { left: number; top: number; width: number; height: number }; op: Animated.AnimatedInterpolation<number> }) {
  return (
    <Animated.View pointerEvents="none" style={{ position: 'absolute', ...c, opacity: op }}>
      <SvgXml xml={xml} width={c.width} height={c.height} />
    </Animated.View>
  );
}

/** Botãozinho branco sobre a maquete. */
function BotaoMaquete({ titulo, onPress }: { titulo: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={titulo}
      style={({ pressed }) => ({ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, backgroundColor: pressed ? '#eef1f4' : 'rgba(255,255,255,0.95)', borderWidth: 1, borderColor: '#dfe3e8' })}>
      <Text style={{ fontSize: 12, fontWeight: '700', color: '#1f2937' }}>{titulo}</Text>
    </Pressable>
  );
}

type Gesto = { modo: 'girar' | 'mover' | 'pinca'; giro: number; incl: number; px: number; py: number; d0: number; cx0: number; cy0: number; z0: number; razao: number; moveu: boolean; t0: number };
const toquesDe = (e: GestureResponderEvent) => (e.nativeEvent.touches ?? []) as unknown as { pageX: number; pageY: number }[];

export function Croqui3D({ items, bandeira, mostrarNomes, vista, fundo, zoom = 1, pessoas = true, onDragChange, onZoom }: {
  items: Item[]; bandeira: string; mostrarNomes: boolean; vista: Vista; fundo: string; zoom?: number; pessoas?: boolean;
  /** Avisa enquanto a pessoa gira/move a maquete (para a tela não rolar junto). */
  onDragChange?: (arrastando: boolean) => void;
  /** Zoom mudou pela pinça ou Ctrl + rolagem. */
  onZoom?: (zoom: number) => void;
}) {
  const catalogo = useCatalogoCroqui();
  const [W, setW] = useState(0);
  const H = W ? Math.round(W / ASPECTO) : 0;
  const [reduzir, setReduzir] = useState(false);
  const [raioX, setRaioX] = useState(false);       // subsolo visível por cima (tanques e ligações)
  const [montouRaioX, setMontouRaioX] = useState(false);
  const [ajuste, setAjuste] = useState({ giro: 0, incl: INCL_PADRAO }); // câmera da pessoa (giro somado à "vista")
  const [arrastando, setArrastando] = useState(false);
  const [z, setZ] = useState(limita(zoom, ZOOM_MIN, ZOOM_MAX));
  useEffect(() => { setZ(limita(zoom, ZOOM_MIN, ZOOM_MAX)); }, [zoom]);
  useEffect(() => { void AccessibilityInfo.isReduceMotionEnabled().then(setReduzir).catch(() => undefined); }, []);

  const giro = 45 + 90 * vista + ajuste.giro;
  const P = useMemo(() => projecao({ giro, incl: ajuste.incl }), [giro, ajuste.incl]);
  const deCima = P.deCima;
  const cena = useMemo(() => cena3d(items, { bandeira, nomes: mostrarNomes, P }), [items, bandeira, mostrarNomes, P, catalogo]); // eslint-disable-line react-hooks/exhaustive-deps
  const nBombas = items.filter(i => T[i.type]?.k === 'b').length;
  const mov = useMemo(() => (pessoas ? planejarMovimento(items, { frentistas: Math.min(4, Math.max(2, nBombas)) }) : null), [items, pessoas, nBombas]);
  const ligacoes = useMemo(() => ligacoesDosBicos(items), [items]);
  const temTanque = items.some(i => T[i.type]?.k === 't');
  const mostraSubsolo = !deCima || montouRaioX;
  const subsolo = useMemo(() => (mostraSubsolo ? subsoloSvg(items, ligacoes, P) : ''), [mostraSubsolo, items, ligacoes, P]);

  // Enquadramento: a maquete inteira cabe no quadro W×H em qualquer ângulo; o zoom amplia e o deslocamento escolhe a parte.
  const quadro = useMemo(() => moldura(P), [P]);
  const s0 = W && H ? Math.min(W / quadro.w, H / quadro.h) : 0;
  const esc = s0 * z, Wd = W * z, Hd = H * z;
  const vb = useMemo<Caixa>(() => (s0 ? { x: quadro.x + quadro.w / 2 - W / (2 * s0), y: quadro.y + quadro.h / 2 - H / (2 * s0), w: W / s0, h: H / s0 } : { x: 0, y: 0, w: 1, h: 1 }), [quadro, s0, W, H]);
  const xmlBase = useMemo(() => svgCom(vb, cena.base), [vb, cena.base]);
  const xmlTopo = useMemo(() => svgCom(vb, cena.topo), [vb, cena.topo]);
  const xmlSubsolo = useMemo(() => (subsolo ? svgCom(vb, subsolo) : ''), [vb, subsolo]);

  // Deslocamento (quando ampliado) e pinça ao vivo: só transformações, sem redesenhar.
  const panX = useRef(new Animated.Value(0)).current, panY = useRef(new Animated.Value(0)).current;
  const pinca = useRef(new Animated.Value(1)).current;
  const pan = useRef({ x: 0, y: 0 });
  const moverPara = (x: number, y: number, w = W, h = H, zz = z) => {
    const p = { x: limita(x, w - w * zz, 0), y: limita(y, h - h * zz, 0) };
    pan.current = p; panX.setValue(p.x); panY.setValue(p.y);
  };
  // Zoom mudou: mantém no centro o mesmo ponto da maquete.
  const zAnt = useRef(z), wAnt = useRef(W);
  useEffect(() => {
    const zA = zAnt.current, wA = wAnt.current || W;
    zAnt.current = z; wAnt.current = W;
    if (!W || !H) return;
    const hA = Math.round(wA / ASPECTO) || H;
    const cx = (wA / 2 - pan.current.x) / (wA * zA), cy = (hA / 2 - pan.current.y) / (hA * zA);
    moverPara(W / 2 - cx * W * z, H / 2 - cy * H * z);
  }, [z, W, H]); // eslint-disable-line react-hooks/exhaustive-deps

  // Um relógio para o ciclo inteiro (todos em sincronia), o balanço do passo e o fluxo de combustível nos fios.
  const relogio = useRef(new Animated.Value(0)).current;
  const passo = useRef(new Animated.Value(0)).current;
  const fluxo = useRef(new Animated.Value(0)).current;
  const vRaioX = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    relogio.setValue(0);
    if (!mov || reduzir) return;
    const ciclo = Animated.loop(Animated.timing(relogio, { toValue: 1, duration: mov.duracao * 1000, easing: Easing.linear, useNativeDriver: nativo }));
    const balanca = Animated.loop(Animated.sequence([
      Animated.timing(passo, { toValue: 1, duration: 220, easing: Easing.inOut(Easing.quad), useNativeDriver: nativo }),
      Animated.timing(passo, { toValue: 0, duration: 220, easing: Easing.inOut(Easing.quad), useNativeDriver: nativo }),
    ]));
    const corre = Animated.loop(Animated.timing(fluxo, { toValue: 1, duration: 1500, easing: Easing.linear, useNativeDriver: nativo }));
    ciclo.start(); balanca.start(); corre.start();
    return () => { ciclo.stop(); balanca.stop(); corre.stop(); };
  }, [mov, reduzir, relogio, passo, fluxo]);
  useEffect(() => {
    Animated.timing(vRaioX, { toValue: raioX ? 1 : 0, duration: reduzir ? 0 : 260, easing: Easing.out(Easing.quad), useNativeDriver: nativo }).start();
  }, [raioX, reduzir, vRaioX]);

  // Pessoas, carros e baloes: recalculados quando a câmera para (durante o giro ficam escondidos).
  const anim = useMemo(() => {
    if (arrastando || !mov || !esc) return null;
    const D = mov.duracao;
    const naTela = (q: Tela): Tela => ({ X: (q.X - vb.x) * esc, Y: (q.Y - vb.y) * esc });
    const tela = (p: Pt, z2 = 0) => naTela(P.p(p, z2));
    const emPx = (c: Caixa) => ({ left: (c.x - vb.x) * esc, top: (c.y - vb.y) * esc, width: c.w * esc, height: c.h * esc });
    const ilhas = items.filter(i => i.type === 'ilha');
    const piso = (p: Pt) => (ilhas.some(il => dentro(il, p)) ? 6 : 0);
    const e = Math.max(0.55, esc);
    const s = Math.max(0.75, Math.min(1.35, esc));
    const trilhaXY = (tr: (Chave & { z?: number })[]) => {
      const ent = linha(tr.map(k => k.t), D), Q = tr.map(k => tela(k, k.z ?? 0));
      return {
        x: relogio.interpolate({ inputRange: ent, outputRange: Q.map(p => p.X), extrapolate: 'clamp' }),
        y: relogio.interpolate({ inputRange: ent, outputRange: Q.map(p => p.Y), extrapolate: 'clamp' }),
      };
    };

    const frentistas = mov.frentistas.map((f, i) => {
      const tr = f.trilha.map(k => ({ ...k, z: piso(k) }));
      const ts: number[] = [], vs: number[] = [];
      for (let k = 0; k < tr.length - 1; k++) {
        const m = Math.hypot(tr[k + 1].x - tr[k].x, tr[k + 1].y - tr[k].y) > 0.5 ? 1 : 0;
        ts.push(tr[k].t, Math.max(tr[k].t, tr[k + 1].t - 0.05)); vs.push(m, m);
      }
      const anda = ts.length >= 2 ? relogio.interpolate({ inputRange: linha(ts, D), outputRange: vs, extrapolate: 'clamp' }) : relogio.interpolate({ inputRange: [0, 1], outputRange: [0, 0] });
      const sobe = Animated.multiply(passo, anda).interpolate({ inputRange: [0, 1], outputRange: [0, -1.4 * e] });
      return { ...trilhaXY(tr), sobe, pele: PELES[(i * 3) % PELES.length] };
    });

    const visitas = mov.visitas.map(v => {
      const carro = carroSvg(P, v.dir, v.corCarro);
      const ancora = P.p(v.parada, 0);
      const pos = trilhaXY(v.carro);
      const caixaCarro = { left: carro.caixa.x * esc, top: carro.caixa.y * esc, width: carro.caixa.w * esc, height: carro.caixa.h * esc };
      const op = relogio.interpolate({ inputRange: linha([0, ...v.aparece, D], D), outputRange: [0, 0, 1, 1, 0, 0], extrapolate: 'clamp' });
      // Carro desenhado de novo por cima do frentista quando ele está do lado de lá do carro (acompanha o carro saindo).
      const pc = P.prof(v.parada);
      const atras: [number, number][] = [];
      if (P.prof(v.lugarBocal) < pc) atras.push(v.noBocal);
      if (P.prof(v.janela) < pc) atras.push(v.naJanela);
      const copia = atras.length ? janelas(relogio, D, atras, 0.1) : null;
      // Bombas, pilares e prédios na frente do carro parado: redesenhados por cima dele (só com a câmera por cima).
      let oclusao = null as null | { xml: string; c: ReturnType<typeof emPx>; op: Animated.AnimatedInterpolation<number> };
      if (deCima) {
        const cxTela = { x: carro.caixa.x + ancora.X, y: carro.caixa.y + ancora.Y, w: carro.caixa.w, h: carro.caixa.h };
        const frente = cena.volumes.filter(vol => vol.prof > pc + 0.5 && cruzaCaixa(vol.caixa, cxTela));
        if (frente.length) {
          const x0 = Math.min(...frente.map(f => f.caixa.x)), y0 = Math.min(...frente.map(f => f.caixa.y));
          const x1 = Math.max(...frente.map(f => f.caixa.x + f.caixa.w)), y1 = Math.max(...frente.map(f => f.caixa.y + f.caixa.h));
          const u = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
          oclusao = { xml: recorteSvg(frente, u), c: emPx(u), op: janelas(relogio, D, [[v.parado[0] - 0.6, v.parado[1] + 0.5]], 0.15) };
        }
      }
      // Mangueira do bico até a tampa do tanque do carro, enquanto abastece.
      const bico = bicoDaVisita(v, items);
      const mang = bico ? mangueiraSvg(P.p(bico.p, bico.z), P.p(v.bocal, 11)) : null;
      const abastecendo = janelas(relogio, D, [v.abastece], 0.25);
      // Fluxo (com o subsolo à mostra): do tanque, pelo fio, até o bico e pela mangueira até o carro.
      const lig = ligacoes.find(l => l.bombaId === v.bombaId && l.bico === v.bico);
      const caminho = [...(lig ? lig.caminho.map(c => P.p(c.p, c.z)) : []), ...(mang ? mang.pontos : [])].map(naTela);
      const N = 9;
      const gotas = caminho.length >= 2 ? Array.from({ length: N }, (_, k) => percurso(Animated.modulo(Animated.add(fluxo, k / N), 1), caminho)) : [];
      // Balões: barra do abastecimento e o pagamento na janela.
      const pb = tela(v.lugarBocal, 46), pj = tela(v.janela, 38);
      const [a, b] = v.abastece;
      const BARRA = 22 * s;
      const enche = relogio.interpolate({ inputRange: linha([0, a, b, D], D), outputRange: [0.02, 0.02, 1, 1], extrapolate: 'clamp' });
      const desloca = relogio.interpolate({ inputRange: linha([0, a, b, D], D), outputRange: [-BARRA * 0.49, -BARRA * 0.49, 0, 0], extrapolate: 'clamp' });
      const [p0, p1] = v.paga;
      const cobra = janelas(relogio, D, [[p0, p1 - 0.9]], 0.15), pago = janelas(relogio, D, [[p1 - 0.9, p1 + 0.3]], 0.15);
      const pula = relogio.interpolate({ inputRange: linha([0, p0 - 0.15, p0 + 0.1, p0 + 0.3, D], D), outputRange: [0.6, 0.6, 1.12, 1, 1], extrapolate: 'clamp' });
      return {
        carro, pos, caixaCarro, op, copia, oclusao, cor: v.cor,
        mang: mang ? { xml: mang.svg, c: emPx(mang.caixa), op: abastecendo } : null,
        gotas, abastecendo, pb, pj, BARRA, enche, desloca, cobra, pago, pula,
      };
    });
    return { frentistas, visitas, e, s };
  }, [arrastando, mov, esc, P, vb, deCima, cena, items, ligacoes, relogio, passo, fluxo]);

  // ---------- Gestos: arrastar gira e inclina; dois dedos (ou Shift) movem; pinça dá zoom; toque mostra os tanques ----------
  const mudarZoom = (n: number) => { const v = limita(n, ZOOM_MIN, ZOOM_MAX); setZ(v); onZoom?.(v); };
  const alternar = () => { if (!P.deCima) return; setMontouRaioX(true); setRaioX(r => !r); };
  const live = useRef({ ajuste, z, onDragChange, mudarZoom, alternar, moverPara });
  live.current = { ajuste, z, onDragChange, mudarZoom, alternar, moverPara };
  const gesto = useRef<Gesto | null>(null);
  const quadroPedido = useRef<number | null>(null), pendente = useRef<{ giro: number; incl: number } | null>(null);
  const aplicar = (a: { giro: number; incl: number }) => {
    pendente.current = a;
    if (quadroPedido.current === null) quadroPedido.current = requestAnimationFrame(() => { quadroPedido.current = null; if (pendente.current) setAjuste(pendente.current); });
  };
  const responder = useMemo(() => {
    const iniciarPinca = (G: Gesto, ts: { pageX: number; pageY: number }[]) => {
      G.modo = 'pinca';
      G.d0 = Math.hypot(ts[1].pageX - ts[0].pageX, ts[1].pageY - ts[0].pageY) || 1;
      G.cx0 = (ts[0].pageX + ts[1].pageX) / 2; G.cy0 = (ts[0].pageY + ts[1].pageY) / 2;
      G.px = pan.current.x; G.py = pan.current.y; G.razao = 1;
    };
    const fim = (soltou: boolean) => {
      const G = gesto.current, L = live.current;
      gesto.current = null;
      if (!G) return;
      if (!G.moveu) { L.onDragChange?.(false); if (soltou && Date.now() - G.t0 < 600) L.alternar(); return; }
      if (G.modo === 'pinca') { pinca.setValue(1); L.mudarZoom(G.z0 * G.razao); }
      if (pendente.current) { setAjuste(pendente.current); pendente.current = null; }
      setArrastando(false);
      L.onDragChange?.(false);
    };
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: e => {
        const L = live.current, ts = toquesDe(e);
        const shift = !!(e.nativeEvent as unknown as { shiftKey?: boolean }).shiftKey;
        const G: Gesto = { modo: shift ? 'mover' : 'girar', giro: L.ajuste.giro, incl: L.ajuste.incl, px: pan.current.x, py: pan.current.y, d0: 1, cx0: 0, cy0: 0, z0: L.z, razao: 1, moveu: false, t0: Date.now() };
        if (ts.length >= 2) iniciarPinca(G, ts);
        gesto.current = G;
        L.onDragChange?.(true); // trava a rolagem da tela já no toque
      },
      onPanResponderMove: (e, g) => {
        const G = gesto.current, L = live.current;
        if (!G) return;
        const ts = toquesDe(e);
        if (ts.length >= 2 && G.modo !== 'pinca') iniciarPinca(G, ts);
        if (!G.moveu) {
          if (G.modo !== 'pinca' && Math.abs(g.dx) + Math.abs(g.dy) < 6) return;
          G.moveu = true; setArrastando(true);
        }
        if (G.modo === 'pinca') {
          if (ts.length < 2) return;
          const d = Math.hypot(ts[1].pageX - ts[0].pageX, ts[1].pageY - ts[0].pageY);
          G.razao = limita(G.z0 * (d / G.d0), ZOOM_MIN, ZOOM_MAX) / G.z0;
          pinca.setValue(G.razao);
          L.moverPara(G.px + (ts[0].pageX + ts[1].pageX) / 2 - G.cx0, G.py + (ts[0].pageY + ts[1].pageY) / 2 - G.cy0);
        } else if (G.modo === 'mover') {
          L.moverPara(G.px + g.dx, G.py + g.dy);
        } else {
          aplicar({ giro: G.giro - g.dx * 0.45, incl: limita(G.incl + g.dy * 0.35, INCL_MIN, INCL_MAX) });
        }
      },
      onPanResponderRelease: () => fim(true),
      onPanResponderTerminate: () => fim(false),
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Web: Ctrl + rolagem (ou pinça do touchpad) dá zoom; a rolagem comum continua rolando a página.
  const caixaRef = useRef<React.ComponentRef<typeof View>>(null);
  useEffect(() => {
    if (Platform.OS !== 'web' || !W) return;
    const el = caixaRef.current as unknown as HTMLElement | null;
    if (!el || typeof el.addEventListener !== 'function') return;
    const roda = (ev: WheelEvent) => { if (!ev.ctrlKey) return; ev.preventDefault(); const L = live.current; L.mudarZoom(L.z * (ev.deltaY < 0 ? 1.12 : 1 / 1.12)); };
    el.addEventListener('wheel', roda, { passive: false });
    return () => el.removeEventListener('wheel', roda);
  }, [W > 0]); // eslint-disable-line react-hooks/exhaustive-deps

  const u = uniforme(bandeira);
  const temInferida = ligacoes.some(l => l.inferida);
  const mudouCamera = Math.abs(ajuste.giro) > 0.5 || Math.abs(ajuste.incl - INCL_PADRAO) > 0.5 || z > 1.01;
  const vistaPadrao = () => { setAjuste({ giro: 0, incl: INCL_PADRAO }); mudarZoom(1); };
  const porBaixo = () => setAjuste(a => ({ ...a, incl: deCima ? -32 : INCL_PADRAO }));

  const baloes = anim && !arrastando ? anim.visitas.map((v, i) => {
    const s = anim.s, Hb = 12 * s, Wb = v.BARRA + 18 * s;
    return (
      <View key={`b${i}`} pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0 }}>
        <Animated.View style={{ position: 'absolute', left: v.pb.X - Wb / 2, top: v.pb.Y - Hb, width: Wb, height: Hb, borderRadius: Hb / 2, backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#dfe3e8', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 3.5 * s, gap: 3 * s, opacity: v.abastecendo }}>
          <View style={{ width: 6.5 * s, height: 6.5 * s, borderRadius: 3.25 * s, backgroundColor: v.cor }} />
          <View style={{ width: v.BARRA, height: 4 * s, borderRadius: 2 * s, backgroundColor: '#e5e7eb', overflow: 'hidden' }}>
            <Animated.View style={{ width: v.BARRA, height: 4 * s, backgroundColor: v.cor, transform: [{ translateX: v.desloca }, { scaleX: v.enche }] }} />
          </View>
        </Animated.View>
        <Animated.View style={{ position: 'absolute', left: v.pj.X - 13 * s, top: v.pj.Y - Hb, width: 26 * s, height: Hb, borderRadius: Hb / 2, backgroundColor: '#16a34a', alignItems: 'center', justifyContent: 'center', opacity: v.cobra, transform: [{ scale: v.pula }] }}>
          <Text style={{ color: '#ffffff', fontWeight: '800', fontSize: 8 * s }}>R$</Text>
        </Animated.View>
        <Animated.View style={{ position: 'absolute', left: v.pj.X - 13 * s, top: v.pj.Y - Hb, width: 26 * s, height: Hb, borderRadius: Hb / 2, backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#16a34a', alignItems: 'center', justifyContent: 'center', opacity: v.pago }}>
          <Text style={{ color: '#16a34a', fontWeight: '800', fontSize: 8 * s }}>✓ pago</Text>
        </Animated.View>
      </View>
    );
  }) : null;

  const gotas = anim && (!deCima || montouRaioX) ? (
    <Animated.View pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0, width: Wd, height: Hd, opacity: deCima ? vRaioX : 1 }}>
      {anim.visitas.map((v, i) => v.gotas.map((g, k) => (
        <Animated.View key={`g${i}-${k}`} style={{
          position: 'absolute', left: -2.6 * anim.s, top: -2.6 * anim.s, width: 5.2 * anim.s, height: 5.2 * anim.s, borderRadius: 2.6 * anim.s,
          backgroundColor: v.cor, borderWidth: 1, borderColor: '#ffffff', opacity: v.abastecendo, transform: [{ translateX: g.x }, { translateY: g.y }],
        }} />
      )))}
    </Animated.View>
  ) : null;
  const camadaSubsolo = xmlSubsolo ? (
    <Animated.View pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0, opacity: deCima ? vRaioX : 1 }}>
      <SvgXml xml={xmlSubsolo} width={Wd} height={Hd} />
    </Animated.View>
  ) : null;
  const atores = anim ? <>
    {anim.visitas.map((v, i) => v.mang ? <Recorte key={`m${i}`} xml={v.mang.xml} c={v.mang.c} op={v.mang.op} /> : null)}
    {anim.visitas.map((v, i) => (
      <Animated.View key={`c${i}`} pointerEvents="none" style={{ position: 'absolute', ...v.caixaCarro, opacity: v.op, transform: [{ translateX: v.pos.x }, { translateY: v.pos.y }] }}>
        <SvgXml xml={v.carro.svg} width={v.caixaCarro.width} height={v.caixaCarro.height} />
      </Animated.View>
    ))}
    {anim.frentistas.map((f, i) => <Frentista key={`f${i}`} x={f.x} y={f.y} sobe={f.sobe} e={anim.e} u={u} pele={f.pele} />)}
    {anim.visitas.map((v, i) => v.copia ? (
      <Animated.View key={`k${i}`} pointerEvents="none" style={{ position: 'absolute', ...v.caixaCarro, opacity: v.copia, transform: [{ translateX: v.pos.x }, { translateY: v.pos.y }] }}>
        <SvgXml xml={v.carro.svg} width={v.caixaCarro.width} height={v.caixaCarro.height} />
      </Animated.View>
    ) : null)}
    {deCima && !raioX ? anim.visitas.map((v, i) => v.oclusao ? <Recorte key={`o${i}`} xml={v.oclusao.xml} c={v.oclusao.c} op={v.oclusao.op} /> : null) : null}
  </> : null;

  const desenho = W > 0 && s0 > 0 ? (
    <Animated.View pointerEvents="none" style={{ width: W, height: H, transform: [{ scale: pinca }] }}>
      <Animated.View style={{ position: 'absolute', left: 0, top: 0, width: Wd, height: Hd, transform: [{ translateX: panX }, { translateY: panY }] }}>
        <SvgXml xml={xmlBase} width={Wd} height={Hd} />
        {deCima ? <>{camadaSubsolo}{atores}{gotas}</> : <>{atores}{camadaSubsolo}{gotas}</>}
        {!arrastando ? <View style={{ position: 'absolute', left: 0, top: 0 }}><SvgXml xml={xmlTopo} width={Wd} height={Hd} /></View> : null}
        {baloes}
      </Animated.View>
    </Animated.View>
  ) : null;

  // Dica curta em telas estreitas (celular); completa no computador.
  const web = Platform.OS === 'web', estreita = W < 560;
  const tracejado = temInferida ? (estreita ? ' (tracejado: pelo combustível)' : ' (tracejado: ligado pelo combustível)') : '';
  const dica = !deCima
    ? (estreita ? `Por baixo do piso${tracejado}` : `Por baixo do piso: tanques e ligações${tracejado} · arraste para girar`)
    : raioX
      ? `Tanques e ligações${tracejado} · toque para voltar`
      : estreita
        ? 'Arraste para girar · para cima: por baixo · toque: tanques'
        : `Arraste para girar 360° · para cima: ver por baixo do piso · toque: ${temTanque ? 'tanques e ligações' : 'subsolo'}${web ? ' · Ctrl + rolar: zoom' : ''}`;
  const dicaMover = z > 1.01 && !estreita ? (web ? 'dois dedos ou Shift + arrastar movem' : 'dois dedos movem') : '';

  return (
    <View ref={caixaRef} onLayout={(e: LayoutChangeEvent) => setW(Math.round(e.nativeEvent.layout.width))}
      style={{ width: '100%', height: H || undefined, aspectRatio: H ? undefined : ASPECTO, borderRadius: 12, overflow: 'hidden', backgroundColor: fundo }}
      accessibilityLabel="Croqui em 3D do posto">
      {desenho}
      <View style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0 }} {...responder.panHandlers} />
      {W > 0 ? <>
        <View pointerEvents="none" style={{ position: 'absolute', left: 8, top: 8, maxWidth: W - 16, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.92)', borderWidth: 1, borderColor: '#dfe3e8' }}>
          <Text style={{ fontSize: 12, fontWeight: '700', color: '#1f2937' }} numberOfLines={2}>{dica}{dicaMover ? ` · ${dicaMover}` : ''}</Text>
        </View>
        <View style={{ position: 'absolute', right: 8, bottom: 8, flexDirection: 'row', gap: 6 }}>
          {mudouCamera ? <BotaoMaquete titulo="Vista padrão" onPress={vistaPadrao} /> : null}
          <BotaoMaquete titulo={deCima ? 'Ver por baixo' : 'Ver por cima'} onPress={porBaixo} />
        </View>
      </> : null}
    </View>
  );
}
