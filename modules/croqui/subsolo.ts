import { bicoNoTopo, CANTOS_MAQUETE, local, prisma, type Proj, type Pt, pts, r1, raioDoTanque, TERRA, type Tela, tom, TOPO_TANQUE } from './iso';
import { combustivelDoTanque, fuelOf, type Item, mesmoTanque, nBicos, T } from './model';

/*
 * Subsolo do croqui em 3D: os tanques enterrados (cilindros deitados embaixo do desenho de cada tanque) e as
 * ligações de cada tanque aos bicos que puxam dele, como fios na cor do combustível: saem da boca do tanque,
 * correm por baixo do piso e sobem pela bomba até o bico. A ligação vem do cadastro de bicos (tanque de cada
 * bico); quando o bico não informa o tanque, liga ao tanque mais perto com o mesmo combustível (fio tracejado).
 * Com a câmera por cima, aparece como raio X (véu claro sobre a maquete); por baixo do piso, a terra fica
 * translúcida e os tanques aparecem na frente.
 */

export type Ponto3D = { p: Pt; z: number };
export type Ligacao = { bombaId: string; bico: number; tanqueId: string; cor: string; inferida: boolean; caminho: Ponto3D[] };

const Z_TUBO = -7; // profundidade dos tubos (entre o piso e o topo dos tanques)
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
      { p: A, z: TOPO_TANQUE },
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
function envoltoria(l: Tela[]) {
  const p = [...l].sort((a, b) => a.X - b.X || a.Y - b.Y);
  const cruz = (o: Tela, a: Tela, b: Tela) => (a.X - o.X) * (b.Y - o.Y) - (a.Y - o.Y) * (b.X - o.X);
  const baixo: Tela[] = [], cima: Tela[] = [];
  for (const q of p) { while (baixo.length >= 2 && cruz(baixo[baixo.length - 2], baixo[baixo.length - 1], q) <= 0) baixo.pop(); baixo.push(q); }
  for (const q of [...p].reverse()) { while (cima.length >= 2 && cruz(cima[cima.length - 2], cima[cima.length - 1], q) <= 0) cima.pop(); cima.push(q); }
  return [...baixo.slice(0, -1), ...cima.slice(0, -1)];
}

/** Tanque deitado (cilindro facetado) embaixo do desenho do tanque, com as bocas de visita subindo até o piso. */
function cilindro(P: Proj, tq: Item) {
  const f = combustivelDoTanque(tq), cor = f ? T[f].c : T.tanque.c;
  const r = raioDoTanque(tq), zc = TOPO_TANQUE - r, meio = tq.w * 0.47, N = 18;
  const a = (tq.rot * Math.PI) / 180, ex = { x: Math.cos(a), y: Math.sin(a) }, ey = { x: -Math.sin(a), y: Math.cos(a) };
  const anel = (s: number) => Array.from({ length: N }, (_, k) => {
    const th = (k / N) * Math.PI * 2;
    return P.p(local(tq, s, r * Math.cos(th)), zc + r * Math.sin(th));
  });
  const A = anel(-meio), B = anel(meio);
  const ve = (nx: number, ny: number, nz: number) => nx * P.olho.x + ny * P.olho.y + nz * P.olho.z > 0.005;
  let s = '';
  for (let k = 0; k < N; k++) {
    const th = ((k + 0.5) / N) * Math.PI * 2, cs = Math.cos(th), sn = Math.sin(th);
    if (!ve(ey.x * cs, ey.y * cs, sn)) continue; // normal da face: ey·cos + z·sen
    const luz = 0.66 + 0.3 * Math.max(0, sn) + 0.06 * cs;
    s += `<polygon points="${pts([A[k], A[(k + 1) % N], B[(k + 1) % N], B[k]])}" fill="${tom(cor, luz)}" stroke="${tom(cor, luz)}" stroke-width="0.4"/>`;
  }
  const tampa = ve(ex.x, ex.y, 0) ? B : A;
  s += `<polygon points="${pts(tampa)}" fill="${tom(cor, 0.82)}" stroke="${tom(cor, 0.6)}" stroke-width="0.6"/>`;
  [-tq.w * 0.2, tq.w * 0.2].forEach(d => {
    const p = local(tq, d, 0), b = P.p(p, TOPO_TANQUE + 1), t = P.p(p, 0);
    s += `<line x1="${r1(b.X)}" y1="${r1(b.Y)}" x2="${r1(t.X)}" y2="${r1(t.Y)}" stroke="${tom(cor, 0.5)}" stroke-width="6"/>` +
      `<line x1="${r1(b.X)}" y1="${r1(b.Y)}" x2="${r1(t.X)}" y2="${r1(t.Y)}" stroke="${tom(cor, 0.8)}" stroke-width="2.5"/>`;
  });
  return s;
}

/**
 * Camada do subsolo (sem o <svg>): por cima, véu claro sobre a maquete (raio X); por baixo, a terra translúcida.
 * Depois os tanques enterrados e os fios.
 */
export function subsoloSvg(items: Item[], ligacoes: Ligacao[], P: Proj) {
  let s = P.deCima
    ? `<polygon points="${pts(envoltoria([...CANTOS_MAQUETE.map(p => P.p(p, 0)), ...CANTOS_MAQUETE.map(p => P.p(p, -TERRA))]))}" fill="#f3f5f7" opacity="0.66"/>`
    : prisma(P, CANTOS_MAQUETE, -TERRA, 0, '#b59f7c', { fundo: '#8d7a5c', opac: 0.42 });
  items.filter(i => T[i.type]?.k === 't').sort((a, b) => P.prof(a) - P.prof(b)).forEach(tq => { s += cilindro(P, tq); });
  let fios = '', pontas = '';
  for (const l of ligacoes) {
    const linha = pts(l.caminho.map(c => P.p(c.p, c.z)));
    fios += `<polyline points="${linha}" fill="none" stroke="#ffffff" stroke-width="3.6" stroke-linejoin="round" stroke-linecap="round" opacity="0.9"/>` +
      `<polyline points="${linha}" fill="none" stroke="${l.cor}" stroke-width="1.9" stroke-linejoin="round" stroke-linecap="round"${l.inferida ? ' stroke-dasharray="4 3"' : ''}/>`;
    const fim = l.caminho[l.caminho.length - 1], q = P.p(fim.p, fim.z);
    pontas += `<circle cx="${r1(q.X)}" cy="${r1(q.Y)}" r="2.8" fill="${l.cor}" stroke="#ffffff" stroke-width="0.9"/>`;
  }
  return s + fios + pontas;
}
