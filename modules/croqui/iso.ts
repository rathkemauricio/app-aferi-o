import { BANDEIRAS } from '../../lib/data';
import { combustivelDoTanque, fuelOf, type Item, nBicos, T, VH, VW } from './model';

/*
 * Croqui em 3D (maquete): o mesmo desenho da planta (mesmos itens e posições) projetado com altura por uma câmera
 * livre — giro de 360° em volta do centro do posto e inclinação (de cima, de lado ou por baixo do piso). Cada item
 * vira um bloco (bomba, loja, cobertura com pilares, totem com a bandeira, árvores…), pintado de trás para a frente
 * conforme a câmera, e os rótulos flutuam em etiquetas. A câmera padrão é a vista isométrica clássica.
 * Saem as partes da cena sem o <svg> (quem desenha escolhe o viewBox, para zoom e deslocamento) e os volumes (para
 * redesenhar o que fica na frente de um carro parado). A terra (por baixo) e os tanques ficam em subsolo.ts.
 */

export type Pt = { x: number; y: number };
/** Giro da vista em passos de 90° (botão "Girar a vista"). */
export type Vista = 0 | 1 | 2 | 3;
/** Câmera: giro em graus (em volta do centro do posto) e inclinação em graus acima do piso (negativa = por baixo). */
export type Camera = { giro: number; incl: number };
export const INCL_PADRAO = 35.264; // isométrica
export const INCL_MIN = -80, INCL_MAX = 89;
export const cameraPadrao = (v: Vista = 0): Camera => ({ giro: 45 + 90 * v, incl: INCL_PADRAO });

const K = 1.2247; // escala: a câmera padrão dá o mesmo tamanho da maquete isométrica antiga
const CX = VW / 2, CY = VH / 2;

export type Tela = { X: number; Y: number };
export type Proj = {
  /** Ponto do plano na altura z → tela (unidades do viewBox). */
  p: (q: Pt, z?: number) => Tela;
  /** Profundidade: maior = mais perto de quem olha. */
  prof: (q: Pt, z?: number) => number;
  /** Face em pé com normal (nx, ny) virada para quem olha? */
  ve: (nx: number, ny: number) => boolean;
  /** Direção de quem olha (mundo) e seno da inclinação. */
  olho: { x: number; y: number; z: number };
  sen: number;
  /** Câmera acima do piso (vê o topo das coisas); falso = por baixo do piso. */
  deCima: boolean;
};
/** Projeção ortográfica da câmera. */
export function projecao(cam: Camera): Proj {
  const t = (cam.giro * Math.PI) / 180, f = (cam.incl * Math.PI) / 180;
  const ct = Math.cos(t), st = Math.sin(t), cf = Math.cos(f), sf = Math.sin(f);
  const uv = (q: Pt) => { const dx = q.x - CX, dy = q.y - CY; return [dx * ct - dy * st, dx * st + dy * ct]; };
  return {
    p: (q, z = 0) => { const [u, v] = uv(q); return { X: K * u, Y: K * (v * sf - z * cf) }; },
    prof: (q, z = 0) => { const [, v] = uv(q); return v * cf + z * sf; },
    ve: (nx, ny) => nx * st + ny * ct > 0.01,
    olho: { x: st * cf, y: ct * cf, z: sf },
    sen: sf,
    deCima: sf >= 0,
  };
}
/** Espaço que a maquete pode ocupar na tela com esta câmera (qualquer giro cabe; depende só da inclinação). */
export function moldura(P: Proj): Caixa {
  const R = Math.hypot(VW / 2 + BORDA, VH / 2 + BORDA), sf = Math.abs(P.sen), cf = Math.sqrt(Math.max(0, 1 - sf * sf));
  const y0 = K * (-R * sf - 160 * cf) - 8, y1 = K * (R * sf + (TERRA + 4) * cf) + 14;
  return { x: -K * R - 12, y: y0, w: 2 * (K * R + 12), h: y1 - y0 };
}
export const svgCom = (vb: Caixa, conteudo: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${r1(vb.x)} ${r1(vb.y)} ${r1(vb.w)} ${r1(vb.h)}">${conteudo}</svg>`;

export const r1 = (n: number) => Math.round(n * 10) / 10;
export const pts = (l: Tela[]) => l.map(q => `${r1(q.X)},${r1(q.Y)}`).join(' ');
const escXml = (s: string) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] ?? c));

/** Clareia (f > 1) ou escurece (f < 1) uma cor #rrggbb. */
export function tom(hex: string, f: number) {
  const h = hex.replace('#', '');
  const n = h.length === 3 ? h.split('').map(x => x + x).join('') : h.slice(0, 6);
  const v = parseInt(n, 16);
  if (Number.isNaN(v)) return hex;
  const c = [(v >> 16) & 255, (v >> 8) & 255, v & 255].map(x => Math.max(0, Math.min(255, Math.round(f > 1 ? x + (255 - x) * (f - 1) : x * f))));
  return `#${c.map(x => x.toString(16).padStart(2, '0')).join('')}`;
}

/** Cantos do retângulo do item no plano (girado pelo próprio ângulo do item). */
export function cantos(it: Pick<Item, 'x' | 'y' | 'w' | 'h' | 'rot'>, folga = 0): Pt[] {
  const a = (it.rot * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  const w = it.w / 2 + folga, h = it.h / 2 + folga;
  return [[-w, -h], [w, -h], [w, h], [-w, h]].map(([x, y]) => ({ x: it.x + x * c - y * s, y: it.y + x * s + y * c }));
}
/** Ponto local do item (dx, dy a partir do centro, no sentido do item) no plano. */
export function local(it: Pick<Item, 'x' | 'y' | 'rot'>, dx: number, dy: number): Pt {
  const a = (it.rot * Math.PI) / 180;
  return { x: it.x + dx * Math.cos(a) - dy * Math.sin(a), y: it.y + dx * Math.sin(a) + dy * Math.cos(a) };
}

/** Retângulo na tela (unidades do viewBox). */
export type Caixa = { x: number; y: number; w: number; h: number };
/** Volume da maquete: profundidade (para a ordem de pintura), desenho e a caixa que ocupa na tela. */
export type Volume = { prof: number; svg: string; caixa: Caixa };

/** Caixa na tela de um conjunto de pontos já projetados. */
export function caixaDosPontos(l: Tela[], folga = 1): Caixa {
  const xs = l.map(q => q.X), ys = l.map(q => q.Y);
  const x = Math.min(...xs) - folga, y = Math.min(...ys) - folga;
  return { x: r1(x), y: r1(y), w: r1(Math.max(...xs) + folga - x), h: r1(Math.max(...ys) + folga - y) };
}
/** Caixa na tela do prisma de base `c` entre as alturas z0 e z1. */
const caixaPrisma = (P: Proj, c: Pt[], z0: number, z1: number) => caixaDosPontos([...c.map(p => P.p(p, z0)), ...c.map(p => P.p(p, z1))]);
export const cruzaCaixa = (a: Caixa, b: Caixa) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/**
 * Prisma: base `c` (polígono no plano) de z0 a z1. Desenha as faces em pé voltadas para quem olha, com sombreamento,
 * e o topo (câmera por cima) ou o fundo (por baixo). `faceExtra` recebe cada face visível (janelas e logotipos).
 */
export function prisma(P: Proj, c: Pt[], z0: number, z1: number, cor: string, op: { topo?: string; fundo?: string; opac?: number; traco?: string; faceExtra?: (a: Pt, b: Pt, nx: number, ny: number) => string } = {}) {
  const cx = c.reduce((s, p) => s + p.x, 0) / c.length, cy = c.reduce((s, p) => s + p.y, 0) / c.length;
  const traco = op.traco ? ` stroke="${op.traco}" stroke-width="0.6"` : '';
  let lados = '';
  for (let i = 0; i < c.length; i++) {
    const a = c[i], b = c[(i + 1) % c.length];
    let nx = b.y - a.y, ny = -(b.x - a.x);
    if (nx * ((a.x + b.x) / 2 - cx) + ny * ((a.y + b.y) / 2 - cy) < 0) { nx = -nx; ny = -ny; }
    if (!P.ve(nx, ny)) continue; // face de costas
    const len = Math.hypot(nx, ny) || 1;
    const luz = 0.72 + 0.2 * (ny / len) - 0.04 * (nx / len); // luz fixa no mundo: faces "+y" mais claras
    lados += `<polygon points="${pts([P.p(a, z0), P.p(b, z0), P.p(b, z1), P.p(a, z1)])}" fill="${tom(cor, luz)}"${traco}/>`;
    if (op.faceExtra) lados += op.faceExtra(a, b, nx / len, ny / len);
  }
  const tampa = P.deCima
    ? `<polygon points="${pts(c.map(p => P.p(p, z1)))}" fill="${op.topo ?? tom(cor, 1.12)}"${traco}/>`
    : `<polygon points="${pts(c.map(p => P.p(p, z0)))}" fill="${op.fundo ?? tom(cor, 0.6)}"${traco}/>`;
  const g = lados + tampa;
  return op.opac !== undefined && op.opac < 1 ? `<g opacity="${op.opac}">${g}</g>` : g;
}
/** Polígono plano (altura z). */
export const piso = (P: Proj, c: Pt[], z: number, cor: string, extra = '') => `<polygon points="${pts(c.map(p => P.p(p, z)))}" fill="${cor}"${extra}/>`;
/** Sombra suave do volume no chão (deslocada como a luz). */
function sombra(P: Proj, c: Pt[], alt: number) {
  const d = Math.min(26, alt * 0.3);
  return piso(P, c.map(p => ({ x: p.x + d * 0.6, y: p.y + d })), 0.2, '#0b1a10', ' opacity="0.13"');
}
/** Círculo no chão, como polígono. */
function circuloChao(P: Proj, c: Pt, r: number, z: number, cor: string, extra = '') {
  const l: Pt[] = Array.from({ length: 18 }, (_, i) => ({ x: c.x + r * Math.cos((i / 18) * Math.PI * 2), y: c.y + r * Math.sin((i / 18) * Math.PI * 2) }));
  return piso(P, l, z, cor, extra);
}
/** Etiqueta flutuante: fundo branco, bolinha colorida e texto. */
function etiqueta(p: Tela, texto: string, cor: string, cores?: string[]) {
  const fs = 11, larg = Math.round(texto.length * 6.3 + 22 + (cores?.length ? cores.length * 9 + 4 : 0)), alt = 19;
  const x = r1(p.X - larg / 2), y = r1(p.Y - alt);
  const pontos = (cores ?? []).map((k, i) => `<circle cx="${r1(x + larg - 10 - ((cores!.length - 1 - i) * 9))}" cy="${r1(y + alt / 2)}" r="3.4" fill="${k}" stroke="#fff" stroke-width="0.8"/>`).join('');
  return `<g><rect x="${r1(x + 0.8)}" y="${r1(y + 1.6)}" width="${larg}" height="${alt}" rx="9.5" fill="#0b1a10" opacity="0.14"/>` +
    `<rect x="${x}" y="${y}" width="${larg}" height="${alt}" rx="9.5" fill="#ffffff" stroke="#dfe3e8" stroke-width="0.8"/>` +
    `<circle cx="${r1(x + 10)}" cy="${r1(y + alt / 2)}" r="3.6" fill="${cor}"/>` +
    `<text x="${r1(x + 18)}" y="${r1(y + alt / 2)}" dy="0.36em" font-size="${fs}" font-weight="700" fill="#1f2937" font-family="Arial, sans-serif">${escXml(texto)}</text>${pontos}</g>`;
}

/** Ponto dentro do retângulo (girado) do item? */
export function dentro(it: Pick<Item, 'x' | 'y' | 'w' | 'h' | 'rot'>, p: Pt) {
  const a = (-it.rot * Math.PI) / 180, dx = p.x - it.x, dy = p.y - it.y;
  const lx = dx * Math.cos(a) - dy * Math.sin(a), ly = dx * Math.sin(a) + dy * Math.cos(a);
  return Math.abs(lx) <= it.w / 2 && Math.abs(ly) <= it.h / 2;
}

/** Margem de gramado em volta do croqui na maquete. */
export const BORDA = 26;
/** Espessura da terra da maquete (os tanques ficam enterrados nela). */
export const TERRA = 60;
/** Tanque enterrado: topo do cilindro (abaixo do piso) e raio. */
export const TOPO_TANQUE = -16;
export const raioDoTanque = (tq: Pick<Item, 'h'>) => Math.min(16, tq.h * 0.38);
/** Cantos da maquete (com a margem de gramado). */
export const CANTOS_MAQUETE: Pt[] = [{ x: -BORDA, y: -BORDA }, { x: VW + BORDA, y: -BORDA }, { x: VW + BORDA, y: VH + BORDA }, { x: -BORDA, y: VH + BORDA }];

/** Altura da base da bomba: em cima da ilha (6) ou no chão (0). */
export const baseDaBomba = (it: Item, items: Item[]) => (items.some(il => il.type === 'ilha' && il.id !== it.id && dentro(il, it)) ? 6 : 0);
/** Bico `i` no topo da bomba: ponto do plano e altura (onde fica a bolinha colorida). */
export function bicoNoTopo(it: Item, i: number, items: Item[]) {
  const n = nBicos(it), dy = n === 1 ? 0 : -it.h * 0.32 + (i * (it.h * 0.64)) / (n - 1);
  return { p: local(it, 0, dy), z: baseDaBomba(it, items) + 34.2 };
}

/**
 * Cena da maquete. Por cima do piso: `base` = terreno, piso e volumes; `topo` = telhados e etiquetas.
 * Por baixo: `base` = telhados, volumes e o desenho do piso (a terra translúcida vem do subsolo); `topo` = etiquetas.
 */
export type Cena3D = { base: string; topo: string; volumes: Volume[] };

export function cena3d(items: Item[], opts: { bandeira: string; nomes: boolean; P: Proj }): Cena3D {
  const P = opts.P;
  const band = BANDEIRAS[opts.bandeira] ?? BANDEIRAS.branca ?? { n: 'Bandeira', c: '#6b7280', tc: '#fff' };

  // ---------- Terreno: gramado com borda de terra e o pátio de concreto (só por cima; por baixo a terra é o subsolo) ----------
  let chao = '';
  if (P.deCima) {
    // camadas do solo nas laterais da terra
    const camadas = (a: Pt, b: Pt) => [0.3, 0.62].map(f => `<polyline points="${pts([P.p(a, -TERRA * f), P.p(b, -TERRA * f)])}" fill="none" stroke="#8f7a59" stroke-width="1.2" opacity="0.55"/>`).join('');
    chao = prisma(P, CANTOS_MAQUETE, -TERRA, 0, '#b59f7c', { topo: '#cfe2b1', faceExtra: camadas });
    chao += piso(P, [{ x: 6, y: 6 }, { x: VW - 6, y: 6 }, { x: VW - 6, y: VH - 6 }, { x: 6, y: VH - 6 }], 0.1, '#ecece6');
    for (let x = 100; x < VW; x += 100) chao += `<polyline points="${pts([P.p({ x, y: 6 }, 0.15), P.p({ x, y: VH - 6 }, 0.15)])}" fill="none" stroke="#d9d9d1" stroke-width="0.8"/>`;
    for (let y = 100; y < VH; y += 100) chao += `<polyline points="${pts([P.p({ x: 6, y }, 0.15), P.p({ x: VW - 6, y }, 0.15)])}" fill="none" stroke="#d9d9d1" stroke-width="0.8"/>`;
  }

  let planos = '';          // coisas rentes ao chão (rua, setas, tanques, ilhas)
  let sombras = '';
  const blocos: Volume[] = []; // volumes, em ordem de profundidade
  let telhados = '';
  const etiquetas: { y: number; svg: string }[] = [];
  const prof = (p: Pt) => P.prof(p);
  const pinta = (it: Item, z: number, texto: string, cor: string, cores?: string[]) => {
    if (opts.nomes && texto) { const p = P.p({ x: it.x, y: it.y }, z); etiquetas.push({ y: p.Y, svg: etiqueta(p, texto, cor, cores) }); }
  };
  const ryBico = Math.max(0.6, 3.4 * Math.abs(P.sen));

  const ordenados = [...items].sort((a, b) => (T[a.type]?.z ?? 0) - (T[b.type]?.z ?? 0));
  for (const it of ordenados) {
    const t = T[it.type];
    if (!t) continue;
    const c = cantos(it);
    const centro = { x: it.x, y: it.y };
    switch (t.k) {
      case 'r': {
        if (it.type === 'rua') {
          planos += piso(P, c, 0.4, '#4b5058');
          const ao = it.w >= it.h ? [local(it, -it.w / 2 + 12, 0), local(it, it.w / 2 - 12, 0)] : [local(it, 0, -it.h / 2 + 12), local(it, 0, it.h / 2 - 12)];
          planos += `<polyline points="${pts(ao.map(p => P.p(p, 0.6)))}" fill="none" stroke="#f5f5f0" stroke-width="2" stroke-dasharray="14 10"/>`;
          break;
        }
        if (it.type === 'ilha') { planos += prisma(P, c, 0, 6, '#c9ccd2', { topo: '#dadde2' }); break; }
        if (it.type === 'loja') {
          sombras += sombra(P, c, 56);
          const janela = (a: Pt, b: Pt) => {
            const l = Math.hypot(b.x - a.x, b.y - a.y);
            if (l < 30) return '';
            const k = 10 / l, a2 = { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k }, b2 = { x: b.x - (b.x - a.x) * k, y: b.y - (b.y - a.y) * k };
            return `<polygon points="${pts([P.p(a2, 16), P.p(b2, 16), P.p(b2, 38), P.p(a2, 38)])}" fill="#a8d1f0" stroke="#ffffff" stroke-width="0.8" opacity="0.95"/>`;
          };
          const beiral = cantos(it, 4);
          blocos.push({ prof: prof(centro), svg: prisma(P, c, 0, 50, '#f4f4f1', { faceExtra: janela, topo: '#e9e9e4' }) + prisma(P, beiral, 50, 56, t.c), caixa: caixaPrisma(P, beiral, 0, 56) });
          pinta(it, 74, it.label || 'Loja', t.c);
          break;
        }
        const alt = it.type === 'lavagem' ? 40 : it.type === 'banheiro' ? 30 : 12;
        sombras += sombra(P, c, alt);
        blocos.push({ prof: prof(centro), svg: prisma(P, c, 0, alt, t.c, { traco: '#00000022' }), caixa: caixaPrisma(P, c, 0, alt) });
        if (it.type === 'lavagem' || it.type === 'banheiro') pinta(it, alt + 16, it.label || t.n, t.c);
        break;
      }
      case 'b': {
        const z0 = baseDaBomba(it, items), z1 = z0 + 34;
        const corpo = cantos({ ...it, w: it.w * 0.72, h: it.h * 0.9 });
        sombras += sombra(P, corpo, 34);
        const n = nBicos(it), cores = Array.from({ length: n }, (_, i) => T[fuelOf(it, i)]?.c ?? t.c);
        // corpo branco com a faixa da cor do combustível e o topo com os bicos (bolinhas coloridas)
        const faixa = cantos({ ...it, w: it.w * 0.74, h: it.h * 0.92 });
        let svg = prisma(P, corpo, z0, z1, '#f2f3f5', { topo: '#fafafa', traco: '#00000018' });
        svg += prisma(P, faixa, z0 + 18, z0 + 26, t.c);
        if (P.deCima) cores.forEach((k, i) => {
          const b = bicoNoTopo(it, i, items), p = P.p(b.p, b.z);
          svg += `<ellipse cx="${r1(p.X)}" cy="${r1(p.Y)}" rx="3.4" ry="${r1(ryBico)}" fill="${k}" stroke="#ffffff" stroke-width="0.6"/>`;
        });
        blocos.push({ prof: prof(centro), svg, caixa: caixaPrisma(P, faixa, z0, z1 + 3) });
        pinta(it, z1 + 16, `Bomba ${it.label || ''}`.trim() + (it.bicosNum?.length ? ` · ${it.bicosNum.join(' ')}` : ''), t.c, cores);
        break;
      }
      case 'o': {
        // pilares (volumes) e o telhado translúcido, com a faixa na cor da bandeira
        const pil = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sy]) => local(it, sx * (it.w / 2 - 16), sy * (it.h / 2 - 16)));
        pil.forEach(p => {
          const q = cantos({ x: p.x, y: p.y, w: 9, h: 9, rot: it.rot });
          blocos.push({ prof: prof(p), svg: prisma(P, q, 0, 84, '#d6d9de', { topo: '#e6e8eb' }), caixa: caixaPrisma(P, q, 0, 84) });
        });
        sombras += piso(P, c.map(p => ({ x: p.x + 12, y: p.y + 20 })), 0.25, '#0b1a10', ' opacity="0.08"');
        telhados += prisma(P, c, 84, 96, band.c, { topo: '#f7f7f5', fundo: '#e4e6ea', opac: 0.5 });
        break;
      }
      case 't': {
        const f = combustivelDoTanque(it), cor = f ? T[f].c : t.c;
        planos += piso(P, c, 0.35, cor, ` opacity="0.32" stroke="${tom(cor, 0.7)}" stroke-width="1" stroke-dasharray="5 4"`);
        planos += circuloChao(P, local(it, -it.w * 0.2, 0), 7, 0.5, '#9aa1ab', ' stroke="#6b7280" stroke-width="0.8"');
        planos += circuloChao(P, local(it, it.w * 0.2, 0), 7, 0.5, '#9aa1ab', ' stroke="#6b7280" stroke-width="0.8"');
        pinta(it, 14, `${it.label || 'Tanque'}${f ? ` · ${T[f].n}` : ''}`, cor);
        break;
      }
      case 'm': {
        const poste = cantos({ x: it.x, y: it.y, w: 6, h: 6, rot: it.rot });
        sombras += sombra(P, poste, 90);
        const placa = cantos({ x: it.x, y: it.y, w: Math.max(28, it.w), h: 7, rot: it.rot });
        const logo = band.logo;
        const face = (a: Pt, b: Pt) => {
          if (!logo || Math.hypot(b.x - a.x, b.y - a.y) < 20) return '';
          const A = P.p(a, 118), B = P.p(b, 118), D = P.p(a, 72);
          return `<g transform="matrix(${r1(B.X - A.X) / 100} ${r1(B.Y - A.Y) / 100} ${r1(D.X - A.X) / 100} ${r1(D.Y - A.Y) / 100} ${r1(A.X)} ${r1(A.Y)})"><rect x="4" y="6" width="92" height="88" rx="6" fill="#ffffff"/><image href="${logo}" x="8" y="10" width="84" height="80" preserveAspectRatio="xMidYMid meet"/></g>`;
        };
        blocos.push({ prof: prof(centro), svg: prisma(P, poste, 0, 72, '#5b6068') + prisma(P, placa, 72, 118, band.c, { faceExtra: face, topo: tom(band.c, 1.2) }), caixa: caixaPrisma(P, placa, 0, 118) });
        pinta(it, 134, band.n, band.c);
        break;
      }
      case 'a': {
        const w = it.w, h = it.h;
        const forma = [[-w / 2, -h / 2], [w / 2 - 14, -h / 2], [w / 2, 0], [w / 2 - 14, h / 2], [-w / 2, h / 2]].map(([x, y]) => local(it, x, y));
        planos += piso(P, forma, 0.5, t.c, ' opacity="0.9"');
        break;
      }
      case 'c': {
        if (it.type === 'arvore') {
          blocos.push({ prof: prof(centro), svg: arvore(P, centro, it.w * 0.6), caixa: caixaArvore(P, centro, it.w * 0.6) });
          sombras += circuloChao(P, { x: it.x + 10, y: it.y + 14 }, it.w * 0.45, 0.2, '#0b1a10', ' opacity="0.12"');
          break;
        }
        const q = cantos({ ...it, w: it.w * 0.6, h: it.h * 0.6 });
        blocos.push({ prof: prof(centro), svg: prisma(P, q, 0, 22, t.c), caixa: caixaPrisma(P, q, 0, 22) });
        break;
      }
      default: break;
    }
  }

  // Árvores enfeitando as bordas da maquete (só onde não há nada desenhado).
  const livre = (p: Pt) => !items.some(i => Math.hypot(i.x - p.x, i.y - p.y) < Math.max(i.w, i.h) / 2 + 40);
  [{ x: 22, y: 22 }, { x: VW - 22, y: 22 }, { x: 22, y: VH - 22 }, { x: VW - 22, y: VH - 22 }, { x: VW / 2, y: 14 }, { x: 14, y: VH / 2 }, { x: VW - 14, y: VH / 2 }]
    .filter(livre).forEach((p, i) => { const r = 15 + (i % 3) * 3; blocos.push({ prof: prof(p), svg: arvore(P, p, r), caixa: caixaArvore(P, p, r) }); });

  blocos.sort((a, b) => a.prof - b.prof);
  etiquetas.sort((a, b) => a.y - b.y);
  const vols = blocos.map(b => b.svg).join(''), rotulos = etiquetas.map(e => e.svg).join('');
  return P.deCima
    ? { base: chao + planos + sombras + vols, topo: telhados + rotulos, volumes: blocos }
    // por baixo: o telhado é o mais longe; o desenho do piso (rua, ilhas, tanques) fica translúcido
    : { base: telhados + vols + `<g opacity="0.55">${planos}</g>`, topo: rotulos, volumes: blocos };
}

/** Árvore de maquete: tronco e copa redonda (duas esferas de tons diferentes). */
function arvore(P: Proj, p: Pt, r: number) {
  const base = P.p(p, 0), copa = P.p(p, 18 + r);
  return `<rect x="${r1(base.X - 2)}" y="${r1(copa.Y)}" width="4" height="${r1(base.Y - copa.Y)}" fill="#8b6b4a"/>` +
    `<circle cx="${r1(copa.X)}" cy="${r1(copa.Y)}" r="${r1(r)}" fill="#5fa85a"/>` +
    `<circle cx="${r1(copa.X - r * 0.28)}" cy="${r1(copa.Y - r * 0.3)}" r="${r1(r * 0.62)}" fill="#7cc06f"/>`;
}
/** Caixa na tela da árvore de maquete (tronco e copa). */
function caixaArvore(P: Proj, p: Pt, r: number): Caixa {
  const base = P.p(p, 0), copa = P.p(p, 18 + r);
  return caixaDosPontos([{ X: copa.X - r, Y: copa.Y - r }, { X: copa.X + r, Y: base.Y }]);
}

/** Recorte da maquete com só estes volumes (para redesenhar o que fica na frente de um carro parado). */
export const recorteSvg = (vols: Volume[], c: Caixa) => svgCom(c, vols.map(v => v.svg).join(''));

/** Tamanho do carrinho no plano do croqui. */
export const CARRO = { comp: 60, larg: 28 };

/**
 * Carrinho de maquete andando no sentido `dir` (plano), desenhado com o centro no centro do posto — que a projeção
 * leva para a origem da tela; quem desenha só desloca. Rodas, carroceria, cabine com vidros, faróis e lanternas.
 */
export function carroSvg(P: Proj, dir: Pt, cor: string): { svg: string; caixa: Caixa } {
  const C = CARRO.comp, L = CARRO.larg;
  const n = Math.hypot(dir.x, dir.y) || 1, f = { x: dir.x / n, y: dir.y / n }, e = { x: f.y, y: -f.x }; // frente e esquerda
  const pt = (a: number, b: number): Pt => ({ x: CX + f.x * a + e.x * b, y: CY + f.y * a + e.y * b });
  const ret = (a0: number, a1: number, b0: number, b1: number) => [pt(a1, b1), pt(a1, b0), pt(a0, b0), pt(a0, b1)];
  const ladoVisto = P.ve(e.x, e.y) ? 1 : -1; // lado do carro voltado para quem olha (+1 = esquerda)
  // face plana na frente ou atrás (faróis e lanternas)
  const faceFrente = (a: number, b0: number, b1: number, z0: number, z1: number, cor2: string) =>
    `<polygon points="${pts([P.p(pt(a, b0), z0), P.p(pt(a, b1), z0), P.p(pt(a, b1), z1), P.p(pt(a, b0), z1)])}" fill="${cor2}"/>`;
  const sombraC = ret(-C / 2 - 2, C / 2 + 2, -L / 2 - 2, L / 2 + 2).map(p => ({ x: p.x + 5, y: p.y + 7 }));
  let s = P.deCima ? piso(P, sombraC, 0.1, '#0b1a10', ' opacity="0.16"') : '';
  const eixos = [-C * 0.3, C * 0.3];
  // rodas do lado de lá (só aparecem por baixo da carroceria)
  const bLa = -ladoVisto * (L / 2 - 1.5), bLa2 = bLa + ladoVisto * 4;
  eixos.forEach(a => { s += prisma(P, ret(a - 6, a + 6, Math.min(bLa, bLa2), Math.max(bLa, bLa2)), 0, 9, '#22252b'); });
  const cabine = prisma(P, ret(-C * 0.28, C * 0.16, -L / 2 + 3, L / 2 - 3), 13, 22, '#42586f', { topo: tom(cor, 1.06), traco: '#00000022' });
  if (!P.deCima) s += cabine; // por baixo a cabine fica atrás da carroceria
  s += prisma(P, ret(-C / 2, C / 2, -L / 2, L / 2), 3, 13, cor, { traco: '#00000026', fundo: '#2a2d33' });
  // rodas do lado de cá: o pneu (círculo em pé, visto de lado) com a calota
  const roda = (a: number, b: number, r: number, cor2: string) =>
    `<polygon points="${pts(Array.from({ length: 14 }, (_, k) => { const th = (k / 14) * Math.PI * 2; return P.p(pt(a + r * Math.cos(th), b), 5 + r * Math.sin(th)); }))}" fill="${cor2}"/>`;
  eixos.forEach(a => {
    const b = ladoVisto * (L / 2 + 0.6);
    s += roda(a, b, 5.4, '#1d2025') + roda(a, b * 1.01, 2.4, '#b8bec7');
  });
  if (P.deCima) s += cabine;
  if (P.ve(f.x, f.y)) s += faceFrente(C / 2 + 0.3, L / 2 - 8, L / 2 - 3, 8, 11, '#fff6c2') + faceFrente(C / 2 + 0.3, -(L / 2 - 3), -(L / 2 - 8), 8, 11, '#fff6c2');
  else s += faceFrente(-C / 2 - 0.3, L / 2 - 8, L / 2 - 3, 8, 11, '#d63031') + faceFrente(-C / 2 - 0.3, -(L / 2 - 3), -(L / 2 - 8), 8, 11, '#d63031');
  const caixa = caixaDosPontos([...sombraC.map(p => P.p(p, 0)), ...ret(-C / 2, C / 2, -L / 2 - 1, L / 2 + 1).flatMap(p => [P.p(p, 0), P.p(p, 22)])], 1.5);
  return { svg: svgCom(caixa, s), caixa };
}

/** Mangueira do bico (A, na tela) até a tampa do tanque do carro (B), caindo um pouco no meio. */
export function mangueiraSvg(A: Tela, B: Tela) {
  const C = { X: (A.X + B.X) / 2, Y: Math.max(A.Y, B.Y) + 14 };
  const q = (u: number) => ({ X: (1 - u) * (1 - u) * A.X + 2 * u * (1 - u) * C.X + u * u * B.X, Y: (1 - u) * (1 - u) * A.Y + 2 * u * (1 - u) * C.Y + u * u * B.Y });
  const pontos = [0, 0.2, 0.4, 0.6, 0.8, 1].map(q);
  const caixa = caixaDosPontos(pontos, 4);
  const svg = svgCom(caixa,
    `<path d="M${r1(A.X)} ${r1(A.Y)} Q${r1(C.X)} ${r1(C.Y)} ${r1(B.X)} ${r1(B.Y)}" fill="none" stroke="#1f2328" stroke-width="2.2" stroke-linecap="round"/>` +
    `<circle cx="${r1(B.X)}" cy="${r1(B.Y)}" r="2" fill="#4b5563"/>`);
  return { svg, caixa, pontos };
}
