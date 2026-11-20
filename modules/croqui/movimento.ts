import { bicoNoTopo, CARRO, dentro, girarVista, local, type Pt, type Vista } from './iso';
import { fuelOf, type Item, nBicos, T, VH, VW } from './model';

/*
 * Movimento da maquete 3D, planejado de uma vez para um ciclo que se repete (assim a animação roda inteira no
 * motor de animação, sem cálculo a cada quadro): os frentistas passeiam pela pista; de vez em quando um carro
 * entra por uma faixa ao lado de uma bomba e para; o frentista mais perto vai até a tampa do tanque, abastece,
 * passa na janela do motorista para receber, o carro sai e o frentista volta a passear. No fim do ciclo todos
 * estão de novo no ponto de partida e não há carro na pista.
 */

/** Posição num instante (segundos desde o início do ciclo); entre duas chaves o movimento é em linha reta. */
export type Chave = { t: number; x: number; y: number };
export type Frentista = { trilha: Chave[] };
export type Visita = {
  bombaId: string; bico: number;
  /** Cor do combustível do bico usado e cor do carro. */
  cor: string; corCarro: string;
  /** Sentido do carro (unitário, plano original). */
  dir: Pt;
  carro: Chave[];
  /** Aparece de [0] a [1] e some de [2] a [3]. */
  aparece: [number, number, number, number];
  parada: Pt;
  /** Tampa do tanque do carro, lugar do frentista ao abastecer e janela do motorista. */
  bocal: Pt; lugarBocal: Pt; janela: Pt;
  /** Carro parado; frentista no bocal; abastecendo; frentista na janela (até o carro sair da frente); pagando. */
  parado: [number, number]; noBocal: [number, number]; abastece: [number, number]; naJanela: [number, number]; paga: [number, number];
};
export type Movimento = { duracao: number; frentistas: Frentista[]; visitas: Visita[] };

const V_PASSEIO = 24, V_PRESSA = 40, V_JANELA = 38, V_CARRO = 120; // unidades do croqui por segundo
const JANELA = 52;          // chegadas de carro só até aqui (s); o resto do ciclo é a volta ao começo
const CORES_CARRO = ['#d9dde3', '#f5f5f2', '#2b2f36', '#c0392b', '#2e5c9a', '#7f8c8d', '#1e7b55'];

type Obst = { x: number; y: number; rot: number; hw: number; hh: number };

const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);
const soma = (a: Pt, b: Pt, k = 1): Pt => ({ x: a.x + b.x * k, y: a.y + b.y * k });
const esc = (a: Pt, b: Pt) => a.x * b.x + a.y * b.y;

/** Gerador simples e estável (o mesmo croqui dá sempre o mesmo movimento). */
function sorteio(semente: number) {
  let s = Math.abs(Math.round(semente)) % 2147483647 || 1;
  return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
}

const paraLocal = (o: Obst, p: Pt) => {
  const a = (-o.rot * Math.PI) / 180, dx = p.x - o.x, dy = p.y - o.y;
  return { x: dx * Math.cos(a) - dy * Math.sin(a), y: dx * Math.sin(a) + dy * Math.cos(a) };
};
const doLocal = (o: Obst, x: number, y: number) => local(o, x, y);
const dentroObst = (o: Obst, p: Pt) => { const l = paraLocal(o, p); return Math.abs(l.x) < o.hw && Math.abs(l.y) < o.hh; };

/** O segmento a→b atravessa o retângulo? (Liang–Barsky no sistema do obstáculo) */
function cruza(o: Obst, a: Pt, b: Pt) {
  const A = paraLocal(o, a), B = paraLocal(o, b), dx = B.x - A.x, dy = B.y - A.y;
  const p = [-dx, dx, -dy, dy], q = [A.x + o.hw, o.hw - A.x, A.y + o.hh, o.hh - A.y];
  let t0 = 0, t1 = 1;
  for (let i = 0; i < 4; i++) {
    if (Math.abs(p[i]) < 1e-9) { if (q[i] < 0) return false; continue; }
    const r = q[i] / p[i];
    if (p[i] < 0) { if (r > t1) return false; if (r > t0) t0 = r; } else { if (r < t0) return false; if (r < t1) t1 = r; }
  }
  return t1 - t0 > 1e-3;
}

/** Caminho mais curto de a até b contornando o obstáculo pelos cantos. */
function contornar(o: Obst, a: Pt, b: Pt): Pt[] {
  const m = 2.5, nos = [a, ...[[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sy]) => doLocal(o, sx * (o.hw + m), sy * (o.hh + m))), b];
  const d = nos.map(() => Infinity), ant = nos.map(() => -1), feito = nos.map(() => false);
  d[0] = 0;
  for (;;) {
    let u = -1;
    nos.forEach((_, i) => { if (!feito[i] && d[i] < Infinity && (u < 0 || d[i] < d[u])) u = i; });
    if (u < 0 || u === nos.length - 1) break;
    feito[u] = true;
    nos.forEach((q, j) => { if (!feito[j] && !cruza(o, nos[u], q)) { const nd = d[u] + dist(nos[u], q); if (nd < d[j]) { d[j] = nd; ant[j] = u; } } });
  }
  if (d[nos.length - 1] === Infinity) return [];
  const meio: Pt[] = [];
  for (let k = ant[nos.length - 1]; k > 0; k = ant[k]) meio.unshift(nos[k]);
  return meio;
}

/** Rota a pé de a até b desviando de bombas e prédios (devolve os pontos depois de a, terminando em b). */
function rota(a: Pt, b: Pt, obst: Obst[], nivel = 0): Pt[] {
  if (nivel > 3) return [b];
  let alvo: Obst | null = null;
  for (const o of obst) if (cruza(o, a, b) && (!alvo || dist(a, o) < dist(a, alvo))) alvo = o;
  if (!alvo) return [b];
  const meio = contornar(alvo, a, b);
  if (!meio.length) return [b];
  const resto = obst.filter(o => o !== alvo), l = [a, ...meio, b], out: Pt[] = [];
  for (let i = 1; i < l.length; i++) out.push(...rota(l[i - 1], l[i], resto, nivel + 1));
  return out;
}
const comprimento = (a: Pt, l: Pt[]) => l.reduce((s, q, i) => s + dist(i ? l[i - 1] : a, q), 0);

/** Um frentista: a trilha é montada em ordem (passeios, idas até um carro, esperas). */
class Andarilho {
  trilha: Chave[];
  livre = 0;
  constructor(readonly casa: Pt, readonly pontos: Pt[], readonly obst: Obst[], readonly rnd: () => number) { this.trilha = [{ t: 0, ...casa }]; }
  get fim() { return this.trilha[this.trilha.length - 1]; }
  /** Anda até `dest` (desviando) e devolve a hora de chegada. */
  andar(dest: Pt, vel: number, extra: Obst[] = []) {
    let p: Pt = this.fim, t = this.fim.t;
    for (const q of rota(p, dest, [...this.obst, ...extra])) { t += dist(p, q) / vel; this.trilha.push({ t, x: q.x, y: q.y }); p = q; }
    return t;
  }
  /** Anda em linha reta pelos pontos (ex.: em volta do carro). */
  seguir(l: Pt[], vel: number) { let p: Pt = this.fim, t = this.fim.t; for (const q of l) { t += dist(p, q) / vel; this.trilha.push({ t, x: q.x, y: q.y }); p = q; } return t; }
  esperar(ate: number) { if (ate > this.fim.t + 1e-6) this.trilha.push({ t: ate, x: this.fim.x, y: this.fim.y }); }
  sortear(): Pt {
    for (let k = 0; k < 8; k++) {
      const q = this.pontos[Math.floor(this.rnd() * this.pontos.length)];
      if (q && dist(q, this.fim) > 18) return { x: q.x + (this.rnd() - 0.5) * 6, y: q.y + (this.rnd() - 0.5) * 6 };
    }
    return this.casa;
  }
  passo() { this.andar(this.sortear(), V_PASSEIO); this.esperar(this.fim.t + 1.4 + this.rnd() * 3); }
  passearAte(T: number) { while (this.fim.t < T) this.passo(); }
  posicao(T: number): Pt {
    const l = this.trilha;
    if (T <= l[0].t) return l[0];
    for (let i = 1; i < l.length; i++) if (l[i].t >= T) {
      const a = l[i - 1], b = l[i], u = b.t > a.t ? (T - a.t) / (b.t - a.t) : 1;
      return { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u };
    }
    return this.fim;
  }
  /** Interrompe o passeio no instante T (para atender um carro). */
  cortar(T: number) { const p = this.posicao(T); this.trilha = this.trilha.filter(k => k.t <= T); if (this.fim.t < T) this.trilha.push({ t: T, ...p }); }
  /** Passeia até a hora de voltar ao ponto de partida e chega lá no instante L. */
  encerrar(L: number) {
    for (let n = 0; n < 300; n++) {
      const q = this.sortear(), pausa = 1.4 + this.rnd() * 3;
      const ida = comprimento(this.fim, rota(this.fim, q, this.obst)) / V_PASSEIO, volta = comprimento(q, rota(q, this.casa, this.obst)) / V_PASSEIO;
      if (this.fim.t + ida + pausa + volta > L - 0.4) break;
      this.andar(q, V_PASSEIO); this.esperar(this.fim.t + pausa);
    }
    this.andar(this.casa, V_PASSEIO); this.esperar(L);
  }
}

/** Obstáculos para quem anda a pé: corpo das bombas, loja, lava-jato, banheiro, calibrador e poste do totem. */
function obstaculos(items: Item[]): Obst[] {
  const out: Obst[] = [];
  for (const it of items) {
    const k = T[it.type]?.k;
    if (k === 'b') out.push({ x: it.x, y: it.y, rot: it.rot, hw: it.w * 0.36 + 4, hh: it.h * 0.45 + 4 });
    else if (['loja', 'lavagem', 'banheiro'].includes(it.type)) out.push({ x: it.x, y: it.y, rot: it.rot, hw: it.w / 2 + 6, hh: it.h / 2 + 6 });
    else if (it.type === 'calibrador') out.push({ x: it.x, y: it.y, rot: it.rot, hw: it.w * 0.3 + 4, hh: it.h * 0.3 + 4 });
    else if (k === 'm') out.push({ x: it.x, y: it.y, rot: it.rot, hw: 7, hh: 7 });
  }
  return out;
}

/** Até onde o lado da bomba vai (borda da ilha em que ela está, ou o próprio corpo), no sentido `u`. */
function bordaNoLado(b: Item, items: Item[], u: Pt) {
  let e = b.w / 2;
  const ilha = items.find(il => il.type === 'ilha' && dentro(il, b));
  if (ilha) [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([sx, sy]) => { e = Math.max(e, esc(soma(local(ilha, sx * ilha.w / 2, sy * ilha.h / 2), b, -1), u)); });
  return e;
}

type Vaga = { bomba: Item; parada: Pt; dir: Pt; din: number; dout: number };

/** Faixas de carro: dos dois lados de cada bomba, ao longo do comprimento dela, com espaço livre para entrar e sair. */
function vagas(items: Item[]): Vaga[] {
  const C = CARRO.comp, L = CARRO.larg;
  const bloqueios = items.filter(i => T[i.type]?.k === 'b' || ['ilha', 'loja', 'lavagem', 'banheiro', 'calibrador', 'totem', 'arvore'].includes(i.type));
  const bloqueado = (p: Pt) => p.x < 12 || p.y < 12 || p.x > VW - 12 || p.y > VH - 12 ||
    bloqueios.some(i => dentro({ x: i.x, y: i.y, rot: i.rot, w: i.w + L + 4, h: i.h + L + 4 }, p));
  const livre = (p: Pt, d: Pt) => { for (let s = 0; s <= 240; s += 8) if (bloqueado(soma(p, d, s + C / 2))) return s - 8; return 240; };
  const entrada = items.find(i => i.type === 'entrada');
  const out: Vaga[] = [];
  for (const b of items) {
    if (T[b.type]?.k !== 'b') continue;
    const a = (b.rot * Math.PI) / 180, ux = { x: Math.cos(a), y: Math.sin(a) }, uy = { x: -Math.sin(a), y: Math.cos(a) };
    for (const lado of [1, -1]) {
      const u = { x: ux.x * lado, y: ux.y * lado };
      const parada = soma(b, u, bordaNoLado(b, items, u) + 10 + L / 2);
      if (bloqueado(parada)) continue;
      const opcoes = [1, -1].map(s => {
        const dir = { x: uy.x * s, y: uy.y * s };
        return { dir, din: livre(parada, { x: -dir.x, y: -dir.y }), dout: livre(parada, dir) };
      }).filter(o => o.din >= 50 && o.dout >= 50);
      if (!opcoes.length) continue;
      // Com entrada desenhada, o carro vem do lado dela.
      if (entrada) opcoes.sort((p, q) => dist(soma(parada, p.dir, -p.din), entrada) - dist(soma(parada, q.dir, -q.din), entrada));
      out.push({ bomba: b, parada, ...opcoes[0] });
    }
  }
  return out;
}

/** Distância entre os segmentos ab e cd. */
function distSeg(a: Pt, b: Pt, c: Pt, d: Pt) {
  const pSeg = (p: Pt, x: Pt, y: Pt) => { const v = soma(y, x, -1), l2 = esc(v, v) || 1, t = Math.max(0, Math.min(1, esc(soma(p, x, -1), v) / l2)); return dist(p, soma(x, v, t)); };
  const o = (p: Pt, q: Pt, r: Pt) => Math.sign((q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x));
  if (o(a, b, c) !== o(a, b, d) && o(c, d, a) !== o(c, d, b)) return 0;
  return Math.min(pSeg(a, c, d), pSeg(b, c, d), pSeg(c, a, b), pSeg(d, a, b));
}

/** Pontos de passeio e de partida de cada frentista (cada um cuida de um grupo de bombas). */
function zonas(items: Item[], n: number, vista: Vista) {
  const bombas = items.filter(i => T[i.type]?.k === 'b');
  const obst = obstaculos(items);
  const valido = (p: Pt) => p.x > 10 && p.y > 10 && p.x < VW - 10 && p.y < VH - 10 && !obst.some(o => dentroObst(o, p));
  const cobertura = items.find(i => i.type === 'cobertura');
  const pateo = cobertura ? [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sy]) => local(cobertura, sx * (cobertura.w / 2 - 30), sy * (cobertura.h / 2 - 30))).filter(valido) : [];
  // Porta da loja: o lado virado para quem olha (para ninguém ficar "em cima" do prédio).
  const loja = items.find(i => i.type === 'loja');
  const frente = (p: Pt) => { const g = girarVista(p, vista); return g.x + g.y; };
  const porta = loja ? [local(loja, 0, loja.h / 2 + 16), local(loja, 0, -loja.h / 2 - 16), local(loja, loja.w / 2 + 16, 0), local(loja, -loja.w / 2 - 16, 0)].sort((a, b) => frente(b) - frente(a)).filter(valido)[0] : undefined;
  const servicos = items.filter(i => ['banheiro', 'calibrador', 'lavagem'].includes(i.type)).map(i => local(i, 0, i.h / 2 + 16)).filter(valido);
  const ladosDe = (b: Item) => {
    const a = (b.rot * Math.PI) / 180, ux = { x: Math.cos(a), y: Math.sin(a) }, uy = { x: -Math.sin(a), y: Math.cos(a) };
    return [1, -1].flatMap(l => { const u = { x: ux.x * l, y: ux.y * l }, base = soma(b, u, bordaNoLado(b, items, u) + 4); return [-0.3, 0, 0.3].map(k => soma(base, uy, k * b.h)); }).filter(valido);
  };
  if (!bombas.length) {
    const todos = [...pateo, ...(porta ? [porta] : []), ...servicos];
    const l = todos.length >= 2 ? todos : [{ x: VW / 2 - 80, y: VH / 2 }, { x: VW / 2 + 80, y: VH / 2 }, { x: VW / 2, y: VH / 2 - 60 }];
    return Array.from({ length: n }, (_, i) => ({ casa: l[i % l.length], pontos: l, bombas: [] as Item[] }));
  }
  const xs = bombas.map(b => b.x), ys = bombas.map(b => b.y);
  const eixoX = Math.max(...xs) - Math.min(...xs) >= Math.max(...ys) - Math.min(...ys);
  const ordem = [...bombas].sort((a, b) => (eixoX ? a.x - b.x || a.y - b.y : a.y - b.y || a.x - b.x));
  return Array.from({ length: n }, (_, i) => {
    let grupo = ordem.slice(Math.floor((i * ordem.length) / n), Math.floor(((i + 1) * ordem.length) / n));
    if (!grupo.length) grupo = [ordem[i % ordem.length]];
    const lados = grupo.flatMap(ladosDe);
    const c = { x: grupo.reduce((s, b) => s + b.x, 0) / grupo.length, y: grupo.reduce((s, b) => s + b.y, 0) / grupo.length };
    const perto = [...pateo].sort((a, b) => dist(a, c) - dist(b, c)).slice(0, 2);
    const pontos = [...lados, ...perto, ...(porta ? [porta] : [])];
    const lista = pontos.length ? pontos : [c];
    return { casa: lados[i % 2 === 0 ? 1 : Math.max(0, lados.length - 2)] ?? lista[0], pontos: lista, bombas: grupo };
  });
}

/** Planeja o ciclo inteiro. `n` = quantos frentistas. */
export function planejarMovimento(items: Item[], opts: { frentistas: number; vista: Vista }): Movimento {
  const rnd = sorteio(items.length * 7919 + items.reduce((s, i) => s + i.x * 3 + i.y, 0));
  const obst = obstaculos(items);
  const zs = zonas(items, opts.frentistas, opts.vista);
  const gente = zs.map(z => new Andarilho(z.casa, z.pontos, obst, rnd));
  const lugares = vagas(items);
  const visitas: Visita[] = [];
  const C = CARRO.comp, L = CARRO.larg;
  const maxJuntos = gente.length >= 3 ? 2 : 1;
  const usoVaga = new Map<Vaga, number>();

  let t = 1 + rnd() * 2;
  while (lugares.length && t < JANELA) {
    const ativos = visitas.filter(v => v.aparece[3] > t);
    let feito = false;
    if (ativos.length < maxJuntos) {
      // vagas menos usadas primeiro, sorteando entre as iguais
      const candidatas = [...lugares].map(v => ({ v, k: (usoVaga.get(v) ?? 0) + rnd() * 0.9 })).sort((a, b) => a.k - b.k).map(x => x.v);
      for (const vg of candidatas) {
        const plano = planejarVisita(vg, t);
        if (!plano) continue;
        const ini = soma(vg.parada, vg.dir, -vg.din), fim = soma(vg.parada, vg.dir, vg.dout);
        const conflito = ativos.some(o => {
          const oi = soma(o.parada, o.dir, -dist(o.parada, o.carro[0])), of = o.carro[o.carro.length - 1];
          return distSeg(ini, fim, oi, of) < L + 6 && o.aparece[3] + 0.5 > t && plano.fim + 0.5 > o.aparece[0];
        });
        if (conflito) continue;
        plano.confirmar();
        usoVaga.set(vg, (usoVaga.get(vg) ?? 0) + 1);
        feito = true;
        break;
      }
    }
    t += feito ? 6 + rnd() * 8 : 2.5;
  }

  /** Calcula a visita na vaga (sem gravar); `confirmar` grava a trilha do frentista e a visita. */
  function planejarVisita(vg: Vaga, t0: number) {
    const b = vg.bomba, f = vg.dir, esq = { x: f.y, y: -f.x };
    const ladoBomba = esc(soma(b, vg.parada, -1), esq) > 0 ? esq : { x: -esq.x, y: -esq.y };
    const bocal = soma(soma(vg.parada, ladoBomba, L / 2), f, -C * 0.28);
    const lugarBocal = soma(bocal, ladoBomba, 7);
    const janela = soma(soma(vg.parada, esq, L / 2 + 7), f, C * 0.04);
    const mesmoLado = esc(ladoBomba, esq) > 0;
    const volta = mesmoLado ? [janela] : [soma(soma(vg.parada, ladoBomba, L / 2 + 7), f, C / 2 + 8), soma(soma(vg.parada, esq, L / 2 + 7), f, C / 2 + 8), janela];
    const Ta = Math.max(1.6, Math.min(4.5, (2 * vg.din) / V_CARRO)), Td = Math.max(1.6, Math.min(4.5, (2 * vg.dout) / V_CARRO));
    const tPara = t0 + Ta;
    const carroObst: Obst = { x: vg.parada.x, y: vg.parada.y, rot: (Math.atan2(f.y, f.x) * 180) / Math.PI, hw: C / 2 + 3, hh: L / 2 + 3 };
    // frentista livre: o da zona da bomba, senão o mais perto
    const livres = gente.filter(g => g.livre <= t0);
    if (!livres.length) return null;
    livres.forEach(g => g.passearAte(t0));
    const daZona = livres.find(g => zs[gente.indexOf(g)].bombas.includes(b));
    const g = daZona ?? [...livres].sort((x, y) => dist(x.posicao(t0), b) - dist(y.posicao(t0), b))[0];
    const de = g.posicao(t0);
    const tChega = t0 + comprimento(de, rota(de, lugarBocal, [...obst, carroObst])) / V_PRESSA;
    const tAbastece = Math.max(tPara + 0.5, tChega + 0.4), F = 6 + rnd() * 3;
    const tFimAbast = tAbastece + F;
    const tJanela = tFimAbast + 0.3 + comprimento(lugarBocal, volta) / V_JANELA;
    const P = 3.2, tSai = tJanela + P + 0.4, tFim = tSai + Td;
    // o frentista só sai da janela quando o carro já andou uns 3/4 do comprimento (aceleração: s = u²)
    const tLibera = tSai + Math.sqrt(Math.min(1, (C * 0.75) / vg.dout)) * Td;
    const bico = Math.floor(rnd() * nBicos(b));
    return {
      fim: tFim,
      confirmar: () => {
        g.cortar(t0);
        g.andar(lugarBocal, V_PRESSA, [carroObst]);
        g.esperar(tFimAbast + 0.3);
        g.seguir(volta, V_JANELA);
        g.esperar(tLibera);
        g.livre = tLibera;
        const carro: Chave[] = [];
        for (let k = 0; k <= 6; k++) { const u = k / 6, s = 1 - (1 - u) * (1 - u); carro.push({ t: t0 + u * Ta, ...soma(vg.parada, f, -vg.din * (1 - s)) }); }
        for (let k = 0; k <= 6; k++) { const u = k / 6; carro.push({ t: tSai + u * Td, ...soma(vg.parada, f, vg.dout * u * u) }); }
        const fade = (d: number) => Math.min(0.7, d * 0.35);
        visitas.push({
          bombaId: b.id, bico, cor: T[fuelOf(b, bico)]?.c ?? T[b.type]?.c ?? '#e53935', corCarro: CORES_CARRO[Math.floor(rnd() * CORES_CARRO.length)],
          dir: f, carro, aparece: [t0, t0 + fade(Ta), tFim - fade(Td), tFim], parada: vg.parada, bocal, lugarBocal, janela,
          parado: [tPara, tSai], noBocal: [tChega, tFimAbast + 0.3], abastece: [tAbastece, tFimAbast], naJanela: [tJanela, tLibera], paga: [tJanela + 0.2, tJanela + P],
        });
      },
    };
  }

  // Duração do ciclo: tempo para todos terminarem e voltarem ao ponto de partida.
  let dur = JANELA + 14;
  visitas.forEach(v => { dur = Math.max(dur, v.aparece[3] + 0.5); });
  gente.forEach(g => { dur = Math.max(dur, g.fim.t + comprimento(g.fim, rota(g.fim, g.casa, obst)) / V_PASSEIO + 1); });
  gente.forEach(g => g.encerrar(dur));
  const duracao = Math.max(dur, ...gente.map(g => g.fim.t));
  gente.forEach(g => g.esperar(duracao));
  return { duracao, frentistas: gente.map(g => ({ trilha: g.trilha })), visitas };
}

/** Ponto do bico usado na visita (topo da bomba), para a mangueira e o fluxo de combustível. */
export function bicoDaVisita(v: Visita, items: Item[]) {
  const b = items.find(i => i.id === v.bombaId);
  return b ? bicoNoTopo(b, v.bico, items) : null;
}
