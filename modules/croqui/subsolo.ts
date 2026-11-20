import { BORDA, bicoNoTopo, type Caixa, girarVista, local, projetar, type Pt, pts, r1, tom, type Vista } from './iso';
import { combustivelDoTanque, fuelOf, type Item, mesmoTanque, nBicos, T, VH, VW } from './model';

/*
 * Subsolo do croqui em 3D: os tanques enterrados (cilindros deitados embaixo do desenho de cada tanque) e as
 * ligações de cada tanque aos bicos que puxam dele, como fios na cor do combustível: saem da boca do tanque,
 * correm por baixo do piso e sobem pela bomba até o bico. A ligação vem do cadastro de bicos (tanque de cada
 * bico); quando o bico não informa o tanque, liga ao tanque mais perto com o mesmo combustível (fio tracejado).
 */

export type Ponto3D = { p: Pt; z: number };
export type Ligacao = { bombaId: string; bico: number; tanqueId: string; cor: string; inferida: boolean; caminho: Ponto3D[] };

const Z_TUBO = -5; // profundidade dos tubos
const raio = (tq: Item) => Math.min(9.5, tq.h * 0.3);
const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);

/** Ligações tanque → bico de todas as bombas do croqui. */
export function ligacoesDosBicos(items: Item[]): Ligacao[] {
  const tanques = items.filter(i => T[i.type]?.k === 't');
  if (!tanques.length) return [];
  const pares: { b: Item; i: number; tq: Item; inferida: boolean }[] = [];
  for (const b of items) {
    if (T[b.type]?.k !== 'b') continue;
    for (let i = 0; i < nBicos(b); i++) {
      const num = b.bicosTanque?.[i] ?? '';
      const tq = num ? tanques.find(t => mesmoTanque(num, t)) : undefined;
      if (tq) { pares.push({ b, i, tq, inferida: false }); continue; }
      const f = fuelOf(b, i);
      const mesmos = tanques.filter(t => combustivelDoTanque(t) === f).sort((x, y) => dist(x, b) - dist(y, b));
      if (mesmos[0]) pares.push({ b, i, tq: mesmos[0], inferida: true });
    }
  }
  // Fios que saem do mesmo tanque correm lado a lado (afastados uns 2,4 unidades), para dar para seguir cada um.
  const porTanque = new Map<string, number>();
  pares.forEach(x => porTanque.set(x.tq.id, (porTanque.get(x.tq.id) ?? 0) + 1));
  const usados = new Map<string, number>();
  return pares.map(({ b, i, tq, inferida }) => {
    const n = porTanque.get(tq.id) ?? 1, k = usados.get(tq.id) ?? 0;
    usados.set(tq.id, k + 1);
    const d = (k - (n - 1) / 2) * 2.4;
    const topo = bicoNoTopo(b, i, items), Q = topo.p;
    // boca de visita do tanque mais perto da bomba
    const bocas = [local(tq, -tq.w * 0.2, 0), local(tq, tq.w * 0.2, 0)].sort((x, y) => dist(x, Q) - dist(y, Q));
    const A = bocas[0];
    const caminho: Ponto3D[] = [
      { p: A, z: -3 },
      { p: { x: A.x, y: A.y + d }, z: Z_TUBO },
      { p: { x: Q.x + d, y: A.y + d }, z: Z_TUBO },
      { p: { x: Q.x + d, y: Q.y }, z: Z_TUBO },
      { p: { x: Q.x + d, y: Q.y }, z: topo.z - 4 },
      { p: Q, z: topo.z },
    ];
    const f = combustivelDoTanque(tq);
    return { bombaId: b.id, bico: i, tanqueId: tq.id, cor: T[f]?.c ?? T[fuelOf(b, i)]?.c ?? '#6b7280', inferida, caminho };
  });
}

/** Envoltória convexa (para o véu sobre a maquete inteira, laterais incluídas). */
function envoltoria(l: { X: number; Y: number }[]) {
  const p = [...l].sort((a, b) => a.X - b.X || a.Y - b.Y);
  const cruz = (o: { X: number; Y: number }, a: { X: number; Y: number }, b: { X: number; Y: number }) => (a.X - o.X) * (b.Y - o.Y) - (a.Y - o.Y) * (b.X - o.X);
  const baixo: typeof p = [], cima: typeof p = [];
  for (const q of p) { while (baixo.length >= 2 && cruz(baixo[baixo.length - 2], baixo[baixo.length - 1], q) <= 0) baixo.pop(); baixo.push(q); }
  for (const q of [...p].reverse()) { while (cima.length >= 2 && cruz(cima[cima.length - 2], cima[cima.length - 1], q) <= 0) cima.pop(); cima.push(q); }
  return [...baixo.slice(0, -1), ...cima.slice(0, -1)];
}

/** Tanque deitado (cilindro facetado) embaixo do desenho do tanque, com as bocas de visita subindo até o piso. */
function cilindro(tq: Item, v: Vista) {
  const f = combustivelDoTanque(tq), cor = f ? T[f].c : T.tanque.c;
  const r = raio(tq), zc = -3 - r, meio = tq.w * 0.42, N = 14;
  const G = (p: Pt) => girarVista(p, v);
  const c0 = G({ x: tq.x, y: tq.y });
  const vet = (p: Pt) => { const g = G(p); return { x: g.x - c0.x, y: g.y - c0.y }; };
  const ex = vet(local(tq, 1, 0)), ey = vet(local(tq, 0, 1));
  const anel = (a: number) => Array.from({ length: N }, (_, k) => {
    const th = (k / N) * Math.PI * 2;
    return projetar(local(tq, a, r * Math.cos(th)), zc + r * Math.sin(th), v);
  });
  const A = anel(-meio), B = anel(meio);
  let s = '';
  for (let k = 0; k < N; k++) {
    const th = ((k + 0.5) / N) * Math.PI * 2, cs = Math.cos(th), sn = Math.sin(th);
    // normal da face = ey·cos + z·sen; vista de quem olha se o produto com (1, 1, 1) for positivo
    if ((ey.x + ey.y) * cs + sn <= 0.01) continue;
    const luz = 0.66 + 0.3 * Math.max(0, sn) + 0.06 * cs;
    s += `<polygon points="${pts([A[k], A[(k + 1) % N], B[(k + 1) % N], B[k]])}" fill="${tom(cor, luz)}" stroke="${tom(cor, luz)}" stroke-width="0.4"/>`;
  }
  const tampa = ex.x + ex.y > 0 ? B : A;
  s += `<polygon points="${pts(tampa)}" fill="${tom(cor, 0.82)}" stroke="${tom(cor, 0.6)}" stroke-width="0.6"/>`;
  [-tq.w * 0.2, tq.w * 0.2].forEach(a => {
    const p = local(tq, a, 0), b = projetar(p, -3, v), t = projetar(p, 0, v);
    s += `<line x1="${r1(b.X)}" y1="${r1(b.Y)}" x2="${r1(t.X)}" y2="${r1(t.Y)}" stroke="${tom(cor, 0.55)}" stroke-width="4"/>`;
  });
  return s;
}

/**
 * Camada do subsolo (mesmo viewBox da maquete): véu claro sobre a maquete (raio X), os tanques enterrados e os fios.
 */
export function subsoloSvg(items: Item[], ligacoes: Ligacao[], v: Vista, vb: Caixa) {
  const borda = [{ x: -BORDA, y: -BORDA }, { x: VW + BORDA, y: -BORDA }, { x: VW + BORDA, y: VH + BORDA }, { x: -BORDA, y: VH + BORDA }];
  const contorno = envoltoria([...borda.map(p => projetar(p, 0, v)), ...borda.map(p => projetar(p, -22, v))]);
  let s = `<polygon points="${pts(contorno)}" fill="#f3f5f7" opacity="0.66"/>`;
  items.filter(i => T[i.type]?.k === 't')
    .sort((a, b) => { const ga = girarVista(a, v), gb = girarVista(b, v); return ga.x + ga.y - (gb.x + gb.y); })
    .forEach(tq => { s += cilindro(tq, v); });
  let fios = '', pontas = '';
  for (const l of ligacoes) {
    const linha = pts(l.caminho.map(c => projetar(c.p, c.z, v)));
    fios += `<polyline points="${linha}" fill="none" stroke="#ffffff" stroke-width="3.6" stroke-linejoin="round" stroke-linecap="round" opacity="0.9"/>` +
      `<polyline points="${linha}" fill="none" stroke="${l.cor}" stroke-width="1.9" stroke-linejoin="round" stroke-linecap="round"${l.inferida ? ' stroke-dasharray="4 3"' : ''}/>`;
    const fim = l.caminho[l.caminho.length - 1], q = projetar(fim.p, fim.z, v);
    pontas += `<circle cx="${r1(q.X)}" cy="${r1(q.Y)}" r="2.8" fill="${l.cor}" stroke="#ffffff" stroke-width="0.9"/>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb.x} ${vb.y} ${vb.w} ${vb.h}">${s}${fios}${pontas}</svg>`;
}
