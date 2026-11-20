import { useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, type LayoutChangeEvent, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { SvgXml } from 'react-native-svg';
import { BANDEIRAS } from '../../lib/data';
import { useCatalogoCroqui } from './Canvas';
import { type Caixa, carroSvg, cena3d, cruzaCaixa, dentro, girarVista, mangueiraSvg, projetar, type Pt, recorteSvg, type Vista } from './iso';
import { type Item, T } from './model';
import { bicoDaVisita, type Chave, planejarMovimento } from './movimento';
import { ligacoesDosBicos, subsoloSvg } from './subsolo';

/*
 * Croqui em 3D (maquete isométrica) com frentistas uniformizados (cores da bandeira) passeando pela pista e carros
 * que chegam de vez em quando: o frentista vai até o carro, abastece, recebe na janela do motorista e o carro sai.
 * Tocar na maquete mostra o subsolo: tanques enterrados e as ligações de cada tanque aos bicos, como fios; durante o
 * abastecimento o combustível corre do tanque até o bico e pela mangueira até o carro.
 * Camadas: maquete · [subsolo] · mangueiras e carros · frentistas · carro na frente de quem está atrás dele ·
 * volumes na frente do carro parado · [fluxo] · telhado e etiquetas · balões. Só visualização: editar é na planta.
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
type Tela = { X: number; Y: number };
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

export function Croqui3D({ items, bandeira, mostrarNomes, vista, fundo, zoom = 1, pessoas = true }: {
  items: Item[]; bandeira: string; mostrarNomes: boolean; vista: Vista; fundo: string; zoom?: number; pessoas?: boolean;
}) {
  const catalogo = useCatalogoCroqui();
  const [base, setBase] = useState(0);
  const [reduzir, setReduzir] = useState(false);
  const [raioX, setRaioX] = useState(false);       // subsolo visível (tanques e ligações)
  const [montouRaioX, setMontouRaioX] = useState(false);
  useEffect(() => { void AccessibilityInfo.isReduceMotionEnabled().then(setReduzir).catch(() => undefined); }, []);
  const cena = useMemo(() => cena3d(items, { bandeira, nomes: mostrarNomes, vista }), [items, bandeira, mostrarNomes, vista, catalogo]); // eslint-disable-line react-hooks/exhaustive-deps
  const nBombas = items.filter(i => T[i.type]?.k === 'b').length;
  const mov = useMemo(() => (pessoas ? planejarMovimento(items, { frentistas: Math.min(4, Math.max(2, nBombas)), vista }) : null), [items, pessoas, vista, nBombas]);
  const ligacoes = useMemo(() => ligacoesDosBicos(items), [items]);
  const temTanque = items.some(i => T[i.type]?.k === 't');
  const subsolo = useMemo(() => (montouRaioX ? subsoloSvg(items, ligacoes, vista, cena.vb) : ''), [montouRaioX, items, ligacoes, vista, cena.vb]);

  // No celular a maquete abre com pelo menos 760 px (rolagem para o lado), para as etiquetas ficarem legíveis.
  const w = base ? Math.max(base * zoom, 760) : 0, h = cena.vb.w ? w * (cena.vb.h / cena.vb.w) : 0;
  const esc = cena.vb.w ? w / cena.vb.w : 0;

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

  const anim = useMemo(() => {
    if (!mov || !esc) return null;
    const D = mov.duracao, vb = cena.vb;
    const G = (p: Pt) => girarVista(p, vista);
    const prof = (p: Pt) => { const g = G(p); return g.x + g.y; };
    const naTela = (q: Tela): Tela => ({ X: (q.X - vb.x) * esc, Y: (q.Y - vb.y) * esc });
    const tela = (p: Pt, z = 0) => naTela(projetar(p, z, vista));
    const emPx = (c: Caixa) => ({ left: (c.x - vb.x) * esc, top: (c.y - vb.y) * esc, width: c.w * esc, height: c.h * esc });
    const ilhas = items.filter(i => i.type === 'ilha');
    const piso = (p: Pt) => (ilhas.some(il => dentro(il, p)) ? 6 : 0);
    const e = Math.max(0.55, esc);
    const s = Math.max(0.75, Math.min(1.35, esc));
    const trilhaXY = (tr: (Chave & { z?: number })[]) => {
      const ent = linha(tr.map(k => k.t), D), P = tr.map(k => tela(k, k.z ?? 0));
      return {
        x: relogio.interpolate({ inputRange: ent, outputRange: P.map(p => p.X), extrapolate: 'clamp' }),
        y: relogio.interpolate({ inputRange: ent, outputRange: P.map(p => p.Y), extrapolate: 'clamp' }),
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
      const dirTela = { x: G({ x: v.parada.x + v.dir.x, y: v.parada.y + v.dir.y }).x - G(v.parada).x, y: G({ x: v.parada.x + v.dir.x, y: v.parada.y + v.dir.y }).y - G(v.parada).y };
      const carro = carroSvg(dirTela, v.corCarro);
      const ancora = projetar(v.parada, 0, vista);
      const pos = trilhaXY(v.carro);
      const caixaCarro = { left: carro.caixa.x * esc, top: carro.caixa.y * esc, width: carro.caixa.w * esc, height: carro.caixa.h * esc };
      const op = relogio.interpolate({ inputRange: linha([0, ...v.aparece, D], D), outputRange: [0, 0, 1, 1, 0, 0], extrapolate: 'clamp' });
      // Carro desenhado de novo por cima do frentista quando ele está do lado de lá do carro.
      const pc = prof(v.parada);
      const atras: [number, number][] = [];
      if (prof(v.lugarBocal) < pc) atras.push(v.noBocal);
      if (prof(v.janela) < pc) atras.push(v.naJanela);
      const copia = atras.length ? janelas(relogio, D, atras, 0.1) : null; // acompanha o carro (ele pode estar saindo)
      // Bombas, pilares e prédios na frente do carro parado: redesenhados por cima dele.
      const cxTela = { x: carro.caixa.x + ancora.X, y: carro.caixa.y + ancora.Y, w: carro.caixa.w, h: carro.caixa.h };
      const frente = cena.volumes.filter(vol => vol.prof > pc + 0.5 && cruzaCaixa(vol.caixa, cxTela));
      let oclusao = null as null | { xml: string; c: ReturnType<typeof emPx>; op: Animated.AnimatedInterpolation<number> };
      if (frente.length) {
        const x0 = Math.min(...frente.map(f => f.caixa.x)), y0 = Math.min(...frente.map(f => f.caixa.y));
        const x1 = Math.max(...frente.map(f => f.caixa.x + f.caixa.w)), y1 = Math.max(...frente.map(f => f.caixa.y + f.caixa.h));
        const u = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
        oclusao = { xml: recorteSvg(frente, u), c: emPx(u), op: janelas(relogio, D, [[v.parado[0] - 0.6, v.parado[1] + 0.5]], 0.15) };
      }
      // Mangueira do bico até a tampa do tanque do carro, enquanto abastece.
      const bico = bicoDaVisita(v, items);
      const mang = bico ? mangueiraSvg(projetar(bico.p, bico.z, vista), projetar(v.bocal, 11, vista)) : null;
      const abastecendo = janelas(relogio, D, [v.abastece], 0.25);
      // Fluxo (com o subsolo à mostra): do tanque, pelo fio, até o bico e pela mangueira até o carro.
      const lig = ligacoes.find(l => l.bombaId === v.bombaId && l.bico === v.bico);
      const caminho = [...(lig ? lig.caminho.map(c => projetar(c.p, c.z, vista)) : []), ...(mang ? mang.pontos : [])].map(naTela);
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
  }, [mov, esc, cena, vista, items, ligacoes, relogio, passo, fluxo]);

  const u = uniforme(bandeira);
  const alternar = () => { setMontouRaioX(true); setRaioX(r => !r); };
  const temInferida = ligacoes.some(l => l.inferida);

  const desenho = w > 0 ? (
    <Pressable onPress={alternar} accessibilityRole="button" accessibilityLabel={raioX ? 'Ocultar tanques e ligações' : 'Mostrar tanques e ligações'}
      style={{ width: w, height: h }}>
      <SvgXml xml={cena.base} width={w} height={h} />
      {subsolo ? (
        <Animated.View pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0, opacity: vRaioX }}>
          <SvgXml xml={subsolo} width={w} height={h} />
        </Animated.View>
      ) : null}
      {anim ? <>
        {anim.visitas.map((v, i) => v.mang ? <Recorte key={`m${vista}-${i}`} xml={v.mang.xml} c={v.mang.c} op={v.mang.op} /> : null)}
        {anim.visitas.map((v, i) => (
          <Animated.View key={`c${vista}-${i}`} pointerEvents="none" style={{ position: 'absolute', ...v.caixaCarro, opacity: v.op, transform: [{ translateX: v.pos.x }, { translateY: v.pos.y }] }}>
            <SvgXml xml={v.carro.svg} width={v.caixaCarro.width} height={v.caixaCarro.height} />
          </Animated.View>
        ))}
        {anim.frentistas.map((f, i) => <Frentista key={`f${vista}-${i}`} x={f.x} y={f.y} sobe={f.sobe} e={anim.e} u={u} pele={f.pele} />)}
        {anim.visitas.map((v, i) => v.copia ? (
          <Animated.View key={`k${vista}-${i}`} pointerEvents="none" style={{ position: 'absolute', ...v.caixaCarro, opacity: v.copia, transform: [{ translateX: v.pos.x }, { translateY: v.pos.y }] }}>
            <SvgXml xml={v.carro.svg} width={v.caixaCarro.width} height={v.caixaCarro.height} />
          </Animated.View>
        ) : null)}
        {!raioX ? anim.visitas.map((v, i) => v.oclusao ? <Recorte key={`o${vista}-${i}`} xml={v.oclusao.xml} c={v.oclusao.c} op={v.oclusao.op} /> : null) : null}
        {montouRaioX ? (
          <Animated.View pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0, width: w, height: h, opacity: vRaioX }}>
            {anim.visitas.map((v, i) => v.gotas.map((g, k) => (
              <Animated.View key={`g${vista}-${i}-${k}`} style={{
                position: 'absolute', left: -2.6 * anim.s, top: -2.6 * anim.s, width: 5.2 * anim.s, height: 5.2 * anim.s, borderRadius: 2.6 * anim.s,
                backgroundColor: v.cor, borderWidth: 1, borderColor: '#ffffff', opacity: v.abastecendo, transform: [{ translateX: g.x }, { translateY: g.y }],
              }} />
            )))}
          </Animated.View>
        ) : null}
      </> : null}
      <View pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0 }}><SvgXml xml={cena.topo} width={w} height={h} /></View>
      {anim ? anim.visitas.map((v, i) => {
        const s = anim.s, H = 12 * s, W = v.BARRA + 18 * s;
        return (
          <View key={`b${vista}-${i}`} pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0 }}>
            <Animated.View style={{ position: 'absolute', left: v.pb.X - W / 2, top: v.pb.Y - H, width: W, height: H, borderRadius: H / 2, backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#dfe3e8', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 3.5 * s, gap: 3 * s, opacity: v.abastecendo }}>
              <View style={{ width: 6.5 * s, height: 6.5 * s, borderRadius: 3.25 * s, backgroundColor: v.cor }} />
              <View style={{ width: v.BARRA, height: 4 * s, borderRadius: 2 * s, backgroundColor: '#e5e7eb', overflow: 'hidden' }}>
                <Animated.View style={{ width: v.BARRA, height: 4 * s, backgroundColor: v.cor, transform: [{ translateX: v.desloca }, { scaleX: v.enche }] }} />
              </View>
            </Animated.View>
            <Animated.View style={{ position: 'absolute', left: v.pj.X - 13 * s, top: v.pj.Y - H, width: 26 * s, height: H, borderRadius: H / 2, backgroundColor: '#16a34a', alignItems: 'center', justifyContent: 'center', opacity: v.cobra, transform: [{ scale: v.pula }] }}>
              <Text style={{ color: '#ffffff', fontWeight: '800', fontSize: 8 * s }}>R$</Text>
            </Animated.View>
            <Animated.View style={{ position: 'absolute', left: v.pj.X - 13 * s, top: v.pj.Y - H, width: 26 * s, height: H, borderRadius: H / 2, backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#16a34a', alignItems: 'center', justifyContent: 'center', opacity: v.pago }}>
              <Text style={{ color: '#16a34a', fontWeight: '800', fontSize: 8 * s }}>✓ pago</Text>
            </Animated.View>
          </View>
        );
      }) : null}
    </Pressable>
  ) : null;

  const dica = raioX
    ? `Tanques e ligações${temInferida ? ' · tracejado: ligado pelo combustível' : ''} · toque para voltar`
    : temTanque ? 'Toque na maquete para ver os tanques e as ligações' : 'Toque na maquete para ver o subsolo';

  return (
    <View onLayout={(e: LayoutChangeEvent) => setBase(e.nativeEvent.layout.width)} style={{ width: '100%', borderRadius: 12, overflow: 'hidden', backgroundColor: fundo }}
      accessibilityLabel="Croqui em 3D do posto">
      {base <= 0 ? <View style={{ aspectRatio: 1.7 }} />
        : w > base + 1 ? <ScrollView horizontal nestedScrollEnabled showsHorizontalScrollIndicator>{desenho}</ScrollView>
        : desenho}
      {base > 0 ? (
        <View pointerEvents="none" style={{ position: 'absolute', left: 8, top: 8, maxWidth: base - 16, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.92)', borderWidth: 1, borderColor: '#dfe3e8' }}>
          <Text style={{ fontSize: 12, fontWeight: '700', color: '#1f2937' }} numberOfLines={2}>{dica}</Text>
        </View>
      ) : null}
    </View>
  );
}
