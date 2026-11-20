import { useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, type LayoutChangeEvent, Platform, ScrollView, View } from 'react-native';
import { SvgXml } from 'react-native-svg';
import { useCatalogoCroqui } from './Canvas';
import { cena3d, type Pt, pontosDePassagem, projetar, type Vista } from './iso';
import type { Item } from './model';

/*
 * Croqui em 3D (maquete isométrica) com bonequinhos andando pelo posto: da loja às bombas, entre as bombas e até os
 * serviços. Três camadas: chão e volumes, bonequinhos, e por cima o telhado da cobertura e as etiquetas.
 * Só visualização: para editar, a planta (2D).
 */

const CAMISAS = ['#e4572e', '#2e86de', '#f2c14e', '#17a589', '#8e44ad', '#e67e22', '#34495e', '#c0392b'];
const PELES = ['#f1c27d', '#c68642', '#8d5524', '#e0ac69', '#ffdbac'];
const VELOCIDADE = 34; // unidades do croqui por segundo

/** Gerador simples e estável (o mesmo croqui dá sempre os mesmos passeios). */
function sorteio(semente: number) {
  let s = semente % 2147483647 || 1;
  return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
}

type Rota = { pontos: Pt[]; pausas: number[] };

/** Monta os passeios: cada pessoa sai da loja (ou do pátio), passa por bombas e serviços e volta. */
function montarRotas(items: Item[], vista: Vista): Rota[] {
  const { ladoBomba, porta, servicos, pateo } = pontosDePassagem(items, vista);
  const lugares = [...ladoBomba, ...servicos];
  if (!lugares.length && pateo.length < 2) return [];
  const casa = porta ?? pateo[0] ?? lugares[0];
  const rnd = sorteio(items.length * 7919 + Math.round(items.reduce((s, i) => s + i.x + i.y, 0)));
  const n = Math.min(8, 2 + Math.ceil(ladoBomba.length / 2));
  const alvos = lugares.length ? lugares : pateo;
  return Array.from({ length: n }, () => {
    const a = alvos[Math.floor(rnd() * alvos.length)], b = alvos[Math.floor(rnd() * alvos.length)];
    const pontos = [casa, a, b, casa].map(p => ({ x: p.x + (rnd() - 0.5) * 10, y: p.y + (rnd() - 0.5) * 10 }));
    return { pontos, pausas: [1200 + rnd() * 1500, 1500 + rnd() * 2500, 1200 + rnd() * 2000, 2000 + rnd() * 3000] };
  });
}

/** Um bonequinho: anda pela rota (em pixels da tela), para um pouco em cada ponto e balança ao andar. */
function Bonequinho({ rota, pausas, escala, camisa, pele, atraso, parado }: {
  rota: { X: number; Y: number }[]; pausas: number[]; escala: number; camisa: string; pele: string; atraso: number; parado: boolean;
}) {
  const t = useRef(new Animated.Value(0)).current;
  const passo = useRef(new Animated.Value(0)).current;
  // Tempo de cada trecho (andando) e das paradas; tudo vira uma linha do tempo de 0 a 1.
  const { entrada, xs, ys, total } = useMemo(() => {
    const marcos: number[] = [0], X: number[] = [rota[0].X], Y: number[] = [rota[0].Y];
    let tempo = 0;
    for (let i = 0; i < rota.length; i++) {
      const pausa = pausas[i] ?? 1500;
      tempo += pausa; marcos.push(tempo); X.push(rota[i].X); Y.push(rota[i].Y);
      const prox = rota[(i + 1) % rota.length];
      const dist = Math.hypot(prox.X - rota[i].X, prox.Y - rota[i].Y) / escala;
      tempo += Math.max(400, (dist / VELOCIDADE) * 1000); marcos.push(tempo); X.push(prox.X); Y.push(prox.Y);
    }
    return { entrada: marcos.map(m => m / tempo), xs: X, ys: Y, total: tempo };
  }, [rota, pausas, escala]);

  useEffect(() => {
    if (parado) { t.setValue(0); return; }
    const nativo = Platform.OS !== 'web';
    const anda = Animated.loop(Animated.timing(t, { toValue: 1, duration: total, easing: Easing.linear, useNativeDriver: nativo }));
    const balanca = Animated.loop(Animated.sequence([
      Animated.timing(passo, { toValue: 1, duration: 220, easing: Easing.inOut(Easing.quad), useNativeDriver: nativo }),
      Animated.timing(passo, { toValue: 0, duration: 220, easing: Easing.inOut(Easing.quad), useNativeDriver: nativo }),
    ]));
    const id = setTimeout(() => { anda.start(); balanca.start(); }, atraso);
    return () => { clearTimeout(id); anda.stop(); balanca.stop(); };
  }, [t, passo, total, atraso, parado]);

  const e = Math.max(0.55, escala);
  const larg = 9 * e, alt = 22 * e;
  return (
    <Animated.View pointerEvents="none" style={{
      position: 'absolute', left: -larg / 2, top: -alt, width: larg, height: alt, alignItems: 'center',
      transform: [
        { translateX: t.interpolate({ inputRange: entrada, outputRange: xs }) },
        { translateY: t.interpolate({ inputRange: entrada, outputRange: ys }) },
      ],
    }}>
      <Animated.View style={{ alignItems: 'center', transform: [{ translateY: passo.interpolate({ inputRange: [0, 1], outputRange: [0, -1.4 * e] }) }] }}>
        <View style={{ width: 5.4 * e, height: 5.4 * e, borderRadius: 3 * e, backgroundColor: pele }} />
        <View style={{ width: 7 * e, height: 8.5 * e, marginTop: 0.6 * e, borderTopLeftRadius: 3 * e, borderTopRightRadius: 3 * e, borderBottomLeftRadius: 1.5 * e, borderBottomRightRadius: 1.5 * e, backgroundColor: camisa }} />
        <View style={{ flexDirection: 'row', gap: 1.2 * e }}>
          <View style={{ width: 2.2 * e, height: 5 * e, borderRadius: 1 * e, backgroundColor: '#2f3640' }} />
          <View style={{ width: 2.2 * e, height: 5 * e, borderRadius: 1 * e, backgroundColor: '#2f3640' }} />
        </View>
      </Animated.View>
      <View style={{ position: 'absolute', bottom: -1.5 * e, width: 9 * e, height: 3 * e, borderRadius: 4.5 * e, backgroundColor: 'rgba(11,26,16,0.22)' }} />
    </Animated.View>
  );
}

export function Croqui3D({ items, bandeira, mostrarNomes, vista, fundo, zoom = 1, pessoas = true }: {
  items: Item[]; bandeira: string; mostrarNomes: boolean; vista: Vista; fundo: string; zoom?: number; pessoas?: boolean;
}) {
  const catalogo = useCatalogoCroqui();
  const [base, setBase] = useState(0);
  const [reduzir, setReduzir] = useState(false);
  useEffect(() => { void AccessibilityInfo.isReduceMotionEnabled().then(setReduzir).catch(() => undefined); }, []);
  const cena = useMemo(() => cena3d(items, { bandeira, nomes: mostrarNomes, vista }), [items, bandeira, mostrarNomes, vista, catalogo]); // eslint-disable-line react-hooks/exhaustive-deps
  const rotas = useMemo(() => (pessoas ? montarRotas(items, vista) : []), [items, pessoas, vista]);
  // No celular a maquete abre com pelo menos 760 px (rolagem para o lado), para as etiquetas ficarem legíveis.
  const w = base ? Math.max(base * zoom, 760) : 0, h = cena.vb.w ? w * (cena.vb.h / cena.vb.w) : 0;
  const esc = cena.vb.w ? w / cena.vb.w : 0;
  const tela = (p: Pt) => { const q = projetar(p, 0, vista); return { X: (q.X - cena.vb.x) * esc, Y: (q.Y - cena.vb.y) * esc }; };

  const desenho = w > 0 ? (
    <View style={{ width: w, height: h }}>
      <SvgXml xml={cena.base} width={w} height={h} />
      {esc ? rotas.map((r, i) => (
        <Bonequinho key={`${vista}-${i}-${Math.round(w)}`} rota={r.pontos.map(tela)} pausas={r.pausas} escala={esc} camisa={CAMISAS[i % CAMISAS.length]}
          pele={PELES[(i * 3) % PELES.length]} atraso={i * 650} parado={reduzir} />
      )) : null}
      <View pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0 }}><SvgXml xml={cena.topo} width={w} height={h} /></View>
    </View>
  ) : null;

  return (
    <View onLayout={(e: LayoutChangeEvent) => setBase(e.nativeEvent.layout.width)} style={{ width: '100%', borderRadius: 12, overflow: 'hidden', backgroundColor: fundo }}
      accessibilityLabel="Croqui em 3D do posto">
      {base <= 0 ? <View style={{ aspectRatio: 1.7 }} />
        : w > base + 1 ? <ScrollView horizontal nestedScrollEnabled showsHorizontalScrollIndicator>{desenho}</ScrollView>
        : desenho}
    </View>
  );
}
