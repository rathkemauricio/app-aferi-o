import { BANDEIRAS } from '../../lib/data';
import { combustivelDoTanque, fuelOf, type Item, nBicos, T, VH, VW } from './model';

/*
 * Croqui em 3D (vista isométrica, como uma maquete): o mesmo desenho da planta (mesmos itens e posições), projetado
 * com altura. Cada item vira um bloco (bomba, loja, cobertura com pilares, totem com a bandeira, árvores…) e os
 * rótulos flutuam em etiquetas. Saem duas camadas com o mesmo viewBox: `base` (chão e volumes) e `topo` (telhados
 * das coberturas e etiquetas), para os bonequinhos andarem entre as duas (debaixo da cobertura).
 */

export type Pt = { x: number; y: number };
/** Giro da vista em passos de 90°. */
export type Vista = 0 | 1 | 2 | 3;

const COS = Math.cos(Math.PI / 6), SIN = Math.sin(Math.PI / 6);
const CX = VW / 2, CY = VH / 2;

/** Gira um ponto do plano em torno do centro do croqui, conforme a vista. */
export function girarVista(p: Pt, v: Vista): Pt {
  const dx = p.x - CX, dy = p.y - CY;
  if (v === 1) return { x: CX - dy, y: CY + dx };
  if (v === 2) return { x: CX - dx, y: CY - dy };
  if (v === 3) return { x: CX + dy, y: CY - dx };
  return p;
}
/** Ponto do plano (já girado) na altura z → coordenadas da tela (unidades do viewBox). */
export const iso = (p: Pt, z = 0) => ({ X: (p.x - p.y) * COS, Y: (p.x + p.y) * SIN - z });
/** Ponto do plano original (sem giro) → tela, na vista escolhida. */
export const projetar = (p: Pt, z: number, v: Vista) => iso(girarVista(p, v), z);

export const r1 = (n: number) => Math.round(n * 10) / 10;
export const pts = (l: { X: number; Y: number }[]) => l.map(q => `${r1(q.X)},${r1(q.Y)}`).join(' ');
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
type Bloco = Volume;

/** Caixa na tela de um conjunto de pontos já projetados. */
export function caixaDosPontos(l: { X: number; Y: number }[], folga = 1): Caixa {
  const xs = l.map(q => q.X), ys = l.map(q => q.Y);
  const x = Math.min(...xs) - folga, y = Math.min(...ys) - folga;
  return { x: r1(x), y: r1(y), w: r1(Math.max(...xs) + folga - x), h: r1(Math.max(...ys) + folga - y) };
}
/** Caixa na tela do prisma de base `c` (já girada) entre as alturas z0 e z1. */
const caixaPrisma = (c: Pt[], z0: number, z1: number) => caixaDosPontos([...c.map(p => iso(p, z0)), ...c.map(p => iso(p, z1))]);
export const cruzaCaixa = (a: Caixa, b: Caixa) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/**
 * Prisma: base `c` (polígono no plano, já girado pela vista) de z0 a z1. Desenha as faces voltadas para quem olha
 * (as de normal para +x+y) com sombreamento e o topo. `faceExtra` recebe cada face visível (para janelas e logotipos).
 */
export function prisma(c: Pt[], z0: number, z1: number, cor: string, op: { topo?: string; opac?: number; traco?: string; faceExtra?: (a: Pt, b: Pt, nx: number, ny: number) => string } = {}) {
  const cx = c.reduce((s, p) => s + p.x, 0) / c.length, cy = c.reduce((s, p) => s + p.y, 0) / c.length;
  let lados = '';
  for (let i = 0; i < c.length; i++) {
    const a = c[i], b = c[(i + 1) % c.length];
    let nx = b.y - a.y, ny = -(b.x - a.x);
    if (nx * ((a.x + b.x) / 2 - cx) + ny * ((a.y + b.y) / 2 - cy) < 0) { nx = -nx; ny = -ny; }
    if (nx + ny <= 0.01) continue; // face de costas
    const len = Math.hypot(nx, ny) || 1;
    const luz = 0.72 + 0.2 * (ny / len) - 0.04 * (nx / len); // a luz vem da esquerda: faces "+y" mais claras
    const quad = [iso(a, z0), iso(b, z0), iso(b, z1), iso(a, z1)];
    lados += `<polygon points="${pts(quad)}" fill="${tom(cor, luz)}"${op.traco ? ` stroke="${op.traco}" stroke-width="0.6"` : ''}/>`;
    if (op.faceExtra) lados += op.faceExtra(a, b, nx / len, ny / len);
  }
  const topo = `<polygon points="${pts(c.map(p => iso(p, z1)))}" fill="${op.topo ?? tom(cor, 1.12)}"${op.traco ? ` stroke="${op.traco}" stroke-width="0.6"` : ''}/>`;
  const g = lados + topo;
  return op.opac !== undefined && op.opac < 1 ? `<g opacity="${op.opac}">${g}</g>` : g;
}
/** Polígono plano no chão (altura z). */
export const piso = (c: Pt[], z: number, cor: string, extra = '') => `<polygon points="${pts(c.map(p => iso(p, z)))}" fill="${cor}"${extra}/>`;
/** Sombra suave do volume no chão (deslocada para a direita e para baixo, como a luz da esquerda). */
function sombra(c: Pt[], alt: number) {
  const d = Math.min(26, alt * 0.3);
  return piso(c.map(p => ({ x: p.x + d * 0.6, y: p.y + d })), 0.2, '#0b1a10', ' opacity="0.13"');
}
/** Círculo no chão (elipse em isométrica), como polígono. */
function circuloChao(c: Pt, r: number, z: number, cor: string, extra = '') {
  const l: Pt[] = Array.from({ length: 18 }, (_, i) => ({ x: c.x + r * Math.cos((i / 18) * Math.PI * 2), y: c.y + r * Math.sin((i / 18) * Math.PI * 2) }));
  return piso(l, z, cor, extra);
}
/** Etiqueta flutuante (como "Living 21.4°" na maquete): fundo branco, bolinha colorida e texto. */
function etiqueta(p: { X: number; Y: number }, texto: string, cor: string, cores?: string[]) {
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

/** Altura da base da bomba: em cima da ilha (6) ou no chão (0). */
export const baseDaBomba = (it: Item, items: Item[]) => (items.some(il => il.type === 'ilha' && il.id !== it.id && dentro(il, it)) ? 6 : 0);
/** Bico `i` no topo da bomba: ponto do plano original e altura (onde fica a bolinha colorida). */
export function bicoNoTopo(it: Item, i: number, items: Item[]) {
  const n = nBicos(it), dy = n === 1 ? 0 : -it.h * 0.32 + (i * (it.h * 0.64)) / (n - 1);
  return { p: local(it, 0, dy), z: baseDaBomba(it, items) + 34.2 };
}

export type Cena3D = { base: string; topo: string; vb: Caixa; volumes: Volume[] };

/** Monta a maquete do croqui. `vista` gira a maquete de 90 em 90 graus. */
export function cena3d(items: Item[], opts: { bandeira: string; nomes: boolean; vista: Vista }): Cena3D {
  const v = opts.vista;
  const G = (p: Pt) => girarVista(p, v);
  const band = BANDEIRAS[opts.bandeira] ?? BANDEIRAS.branca ?? { n: 'Bandeira', c: '#6b7280', tc: '#fff' };

  // ---------- Base da maquete: gramado com borda de terra e o pátio de concreto ----------
  const M = BORDA;
  const borda = [{ x: -M, y: -M }, { x: VW + M, y: -M }, { x: VW + M, y: VH + M }, { x: -M, y: VH + M }].map(G);
  let chao = prisma(borda, -22, 0, '#b59f7c', { topo: '#cfe2b1' });
  chao += piso([{ x: 6, y: 6 }, { x: VW - 6, y: 6 }, { x: VW - 6, y: VH - 6 }, { x: 6, y: VH - 6 }].map(G), 0.1, '#ecece6');
  // juntas do concreto
  for (let x = 100; x < VW; x += 100) chao += `<polyline points="${pts([G({ x, y: 6 }), G({ x, y: VH - 6 })].map(p => iso(p, 0.15)))}" fill="none" stroke="#d9d9d1" stroke-width="0.8"/>`;
  for (let y = 100; y < VH; y += 100) chao += `<polyline points="${pts([G({ x: 6, y }), G({ x: VW - 6, y })].map(p => iso(p, 0.15)))}" fill="none" stroke="#d9d9d1" stroke-width="0.8"/>`;

  let planos = '';          // coisas rentes ao chão (rua, setas, tanques, ilhas)
  let sombras = '';
  const blocos: Bloco[] = []; // volumes, em ordem de profundidade
  let telhados = '';
  const etiquetas: { y: number; svg: string }[] = [];
  const prof = (p: Pt) => { const g = G(p); return g.x + g.y; };
  const pinta = (it: Item, z: number, texto: string, cor: string, cores?: string[]) => {
    if (opts.nomes && texto) { const p = iso(G({ x: it.x, y: it.y }), z); etiquetas.push({ y: p.Y, svg: etiqueta(p, texto, cor, cores) }); }
  };

  const ordenados = [...items].sort((a, b) => (T[a.type]?.z ?? 0) - (T[b.type]?.z ?? 0));
  for (const it of ordenados) {
    const t = T[it.type];
    if (!t) continue;
    const c = cantos(it).map(G);
    const centro = { x: it.x, y: it.y };
    switch (t.k) {
      case 'r': {
        if (it.type === 'rua') {
          planos += piso(c, 0.4, '#4b5058');
          const ao = it.w >= it.h ? [local(it, -it.w / 2 + 12, 0), local(it, it.w / 2 - 12, 0)] : [local(it, 0, -it.h / 2 + 12), local(it, 0, it.h / 2 - 12)];
          planos += `<polyline points="${pts(ao.map(p => iso(G(p), 0.6)))}" fill="none" stroke="#f5f5f0" stroke-width="2" stroke-dasharray="14 10"/>`;
          break;
        }
        if (it.type === 'ilha') { planos += prisma(c, 0, 6, '#c9ccd2', { topo: '#dadde2' }); break; }
        if (it.type === 'loja') {
          sombras += sombra(c, 56);
          const janela = (a: Pt, b: Pt) => {
            const l = Math.hypot(b.x - a.x, b.y - a.y);
            if (l < 30) return '';
            const k = 10 / l, a2 = { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k }, b2 = { x: b.x - (b.x - a.x) * k, y: b.y - (b.y - a.y) * k };
            return `<polygon points="${pts([iso(a2, 16), iso(b2, 16), iso(b2, 38), iso(a2, 38)])}" fill="#a8d1f0" stroke="#ffffff" stroke-width="0.8" opacity="0.95"/>`;
          };
          const beiral = cantos(it, 4).map(G);
          blocos.push({ prof: prof(centro), svg: prisma(c, 0, 50, '#f4f4f1', { faceExtra: janela, topo: '#e9e9e4' }) + prisma(beiral, 50, 56, t.c), caixa: caixaPrisma(beiral, 0, 56) });
          pinta(it, 74, it.label || 'Loja', t.c);
          break;
        }
        const alt = it.type === 'lavagem' ? 40 : it.type === 'banheiro' ? 30 : 12;
        sombras += sombra(c, alt);
        blocos.push({ prof: prof(centro), svg: prisma(c, 0, alt, t.c, { traco: '#00000022' }), caixa: caixaPrisma(c, 0, alt) });
        if (it.type === 'lavagem' || it.type === 'banheiro') pinta(it, alt + 16, it.label || t.n, t.c);
        break;
      }
      case 'b': {
        const z0 = baseDaBomba(it, items), z1 = z0 + 34;
        const corpo = cantos({ ...it, w: it.w * 0.72, h: it.h * 0.9 }).map(G);
        sombras += sombra(corpo, 34);
        const n = nBicos(it), cores = Array.from({ length: n }, (_, i) => T[fuelOf(it, i)]?.c ?? t.c);
        // corpo branco com a faixa da cor do combustível e o topo com os bicos (bolinhas coloridas)
        let svg = prisma(corpo, z0, z1, '#f2f3f5', { topo: '#fafafa', traco: '#00000018' });
        svg += prisma(cantos({ ...it, w: it.w * 0.74, h: it.h * 0.92 }).map(G), z0 + 18, z0 + 26, t.c);
        cores.forEach((k, i) => {
          const b = bicoNoTopo(it, i, items), p = iso(G(b.p), b.z);
          svg += `<ellipse cx="${r1(p.X)}" cy="${r1(p.Y)}" rx="3.4" ry="2" fill="${k}" stroke="#ffffff" stroke-width="0.6"/>`;
        });
        blocos.push({ prof: prof(centro), svg, caixa: caixaPrisma(cantos({ ...it, w: it.w * 0.74, h: it.h * 0.92 }).map(G), z0, z1 + 3) });
        pinta(it, z1 + 16, `Bomba ${it.label || ''}`.trim() + (it.bicosNum?.length ? ` · ${it.bicosNum.join(' ')}` : ''), t.c, cores);
        break;
      }
      case 'o': {
        // pilares (volumes) e o telhado na camada de cima, com a faixa na cor da bandeira
        const pil = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sy]) => local(it, sx * (it.w / 2 - 16), sy * (it.h / 2 - 16)));
        pil.forEach(p => {
          const q = cantos({ x: p.x, y: p.y, w: 9, h: 9, rot: it.rot }).map(G);
          blocos.push({ prof: prof(p), svg: prisma(q, 0, 84, '#d6d9de', { topo: '#e6e8eb' }), caixa: caixaPrisma(q, 0, 84) });
        });
        sombras += piso(c.map(p => ({ x: p.x + 12, y: p.y + 20 })), 0.25, '#0b1a10', ' opacity="0.08"');
        // telhado translúcido: dá para ver as bombas e as pessoas embaixo
        telhados += prisma(c, 84, 96, band.c, { topo: '#f7f7f5', opac: 0.5 });
        break;
      }
      case 't': {
        const f = combustivelDoTanque(it), cor = f ? T[f].c : t.c;
        planos += piso(c, 0.35, cor, ` opacity="0.32" stroke="${tom(cor, 0.7)}" stroke-width="1" stroke-dasharray="5 4"`);
        planos += circuloChao(G(local(it, -it.w * 0.2, 0)), 7, 0.5, '#9aa1ab', ' stroke="#6b7280" stroke-width="0.8"');
        planos += circuloChao(G(local(it, it.w * 0.2, 0)), 7, 0.5, '#9aa1ab', ' stroke="#6b7280" stroke-width="0.8"');
        pinta(it, 14, `${it.label || 'Tanque'}${f ? ` · ${T[f].n}` : ''}`, cor);
        break;
      }
      case 'm': {
        const poste = cantos({ x: it.x, y: it.y, w: 6, h: 6, rot: it.rot }).map(G);
        sombras += sombra(poste, 90);
        const placa = cantos({ x: it.x, y: it.y, w: Math.max(28, it.w), h: 7, rot: it.rot }).map(G);
        const logo = band.logo;
        const face = (a: Pt, b: Pt) => {
          if (!logo || Math.hypot(b.x - a.x, b.y - a.y) < 20) return '';
          const A = iso(a, 118), B = iso(b, 118), D = iso(a, 72);
          return `<g transform="matrix(${r1(B.X - A.X) / 100} ${r1(B.Y - A.Y) / 100} ${r1(D.X - A.X) / 100} ${r1(D.Y - A.Y) / 100} ${r1(A.X)} ${r1(A.Y)})"><rect x="4" y="6" width="92" height="88" rx="6" fill="#ffffff"/><image href="${logo}" x="8" y="10" width="84" height="80" preserveAspectRatio="xMidYMid meet"/></g>`;
        };
        blocos.push({ prof: prof(centro), svg: prisma(poste, 0, 72, '#5b6068') + prisma(placa, 72, 118, band.c, { faceExtra: face, topo: tom(band.c, 1.2) }), caixa: caixaPrisma(placa, 0, 118) });
        pinta(it, 134, band.n, band.c);
        break;
      }
      case 'a': {
        const w = it.w, h = it.h;
        const forma = [[-w / 2, -h / 2], [w / 2 - 14, -h / 2], [w / 2, 0], [w / 2 - 14, h / 2], [-w / 2, h / 2]].map(([x, y]) => G(local(it, x, y)));
        planos += piso(forma, 0.5, t.c, ' opacity="0.9"');
        break;
      }
      case 'c': {
        if (it.type === 'arvore') { blocos.push({ prof: prof(centro), svg: arvore(G(centro), it.w * 0.6), caixa: caixaArvore(G(centro), it.w * 0.6) }); sombras += circuloChao(G({ x: it.x + 10, y: it.y + 14 }), it.w * 0.45, 0.2, '#0b1a10', ' opacity="0.12"'); break; }
        const q = cantos({ ...it, w: it.w * 0.6, h: it.h * 0.6 }).map(G);
        blocos.push({ prof: prof(centro), svg: prisma(q, 0, 22, t.c), caixa: caixaPrisma(q, 0, 22) });
        break;
      }
      default: break;
    }
  }

  // Árvores enfeitando as bordas da maquete (só onde não há nada desenhado).
  const livre = (p: Pt) => !items.some(i => Math.hypot(i.x - p.x, i.y - p.y) < Math.max(i.w, i.h) / 2 + 40);
  [{ x: 22, y: 22 }, { x: VW - 22, y: 22 }, { x: 22, y: VH - 22 }, { x: VW - 22, y: VH - 22 }, { x: VW / 2, y: 14 }, { x: 14, y: VH / 2 }, { x: VW - 14, y: VH / 2 }]
    .filter(livre).forEach((p, i) => { const r = 15 + (i % 3) * 3; blocos.push({ prof: prof(p), svg: arvore(G(p), r), caixa: caixaArvore(G(p), r) }); });

  blocos.sort((a, b) => a.prof - b.prof);
  etiquetas.sort((a, b) => a.y - b.y);

  // Enquadramento: cantos da base e alturas máximas.
  // (a base até a altura das árvores; cada item até a etiqueta; o totem é o mais alto)
  const todos = [...borda.map(p => iso(p, -22)), ...borda.map(p => iso(p, 62)), ...items.map(i => iso(G({ x: i.x, y: i.y }), T[i.type]?.k === 'm' ? 156 : 96))];
  const minX = Math.min(...todos.map(p => p.X)) - 16, maxX = Math.max(...todos.map(p => p.X)) + 16;
  const minY = Math.min(...todos.map(p => p.Y)) - 10, maxY = Math.max(...todos.map(p => p.Y)) + 16;
  const vb = { x: r1(minX), y: r1(minY), w: r1(maxX - minX), h: r1(maxY - minY) };
  const abre = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb.x} ${vb.y} ${vb.w} ${vb.h}">`;
  return {
    base: `${abre}${chao}${planos}${sombras}${blocos.map(b => b.svg).join('')}</svg>`,
    topo: `${abre}${telhados}${etiquetas.map(e => e.svg).join('')}</svg>`,
    vb,
    volumes: blocos,
  };
}

/** Árvore de maquete: tronco e copa redonda (duas esferas de tons diferentes). */
function arvore(p: Pt, r: number) {
  const base = iso(p, 0), copa = iso(p, 18 + r);
  return `<rect x="${r1(base.X - 2)}" y="${r1(copa.Y)}" width="4" height="${r1(base.Y - copa.Y)}" fill="#8b6b4a"/>` +
    `<circle cx="${r1(copa.X)}" cy="${r1(copa.Y)}" r="${r1(r)}" fill="#5fa85a"/>` +
    `<circle cx="${r1(copa.X - r * 0.28)}" cy="${r1(copa.Y - r * 0.3)}" r="${r1(r * 0.62)}" fill="#7cc06f"/>`;
}

/** Caixa na tela da árvore de maquete (tronco e copa). */
function caixaArvore(p: Pt, r: number): Caixa {
  const base = iso(p, 0), copa = iso(p, 18 + r);
  return caixaDosPontos([{ X: copa.X - r, Y: copa.Y - r }, { X: copa.X + r, Y: base.Y }]);
}

/** Recorte da maquete com só estes volumes (para redesenhar o que fica na frente de um carro parado). */
export const recorteSvg = (vols: Volume[], c: Caixa) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${c.x} ${c.y} ${c.w} ${c.h}">${vols.map(v => v.svg).join('')}</svg>`;

/** Tamanho do carrinho no plano do croqui. */
export const CARRO = { comp: 60, larg: 28 };

/**
 * Carrinho de maquete centrado na origem (no chão), andando no sentido `dir` (vetor do plano já girado pela vista).
 * Rodas, carroceria, cabine com vidros, faróis na frente e lanternas atrás. Devolve o SVG recortado e a caixa.
 */
export function carroSvg(dir: Pt, cor: string): { svg: string; caixa: Caixa } {
  const C = CARRO.comp, L = CARRO.larg;
  const n = Math.hypot(dir.x, dir.y) || 1, f = { x: dir.x / n, y: dir.y / n }, e = { x: f.y, y: -f.x }; // frente e esquerda
  const pt = (a: number, b: number): Pt => ({ x: f.x * a + e.x * b, y: f.y * a + e.y * b });
  const ret = (a0: number, a1: number, b0: number, b1: number) => [pt(a1, b1), pt(a1, b0), pt(a0, b0), pt(a0, b1)];
  const visto = (v: Pt) => v.x + v.y > 0.01;
  const ladoVisto = visto(e) ? 1 : -1; // lado do carro voltado para quem olha (+1 = esquerda)
  // face plana na frente ou atrás (faróis e lanternas)
  const faceFrente = (a: number, b0: number, b1: number, z0: number, z1: number, cor2: string) =>
    `<polygon points="${pts([iso(pt(a, b0), z0), iso(pt(a, b1), z0), iso(pt(a, b1), z1), iso(pt(a, b0), z1)])}" fill="${cor2}"/>`;
  const sombraC = ret(-C / 2 - 2, C / 2 + 2, -L / 2 - 2, L / 2 + 2).map(p => ({ x: p.x + 5, y: p.y + 7 }));
  let s = piso(sombraC, 0.1, '#0b1a10', ' opacity="0.16"');
  const eixos = [-C * 0.3, C * 0.3];
  // rodas do lado de lá (só aparecem por baixo da carroceria)
  const bLa = -ladoVisto * (L / 2 - 1.5), bLa2 = bLa + ladoVisto * 4;
  eixos.forEach(a => { s += prisma(ret(a - 6, a + 6, Math.min(bLa, bLa2), Math.max(bLa, bLa2)), 0, 9, '#22252b'); });
  s += prisma(ret(-C / 2, C / 2, -L / 2, L / 2), 3, 13, cor, { traco: '#00000026' });
  // rodas do lado de cá: o pneu (círculo em pé, visto de lado) com a calota
  const roda = (a: number, b: number, r: number, cor2: string) =>
    `<polygon points="${pts(Array.from({ length: 14 }, (_, k) => { const th = (k / 14) * Math.PI * 2; return iso(pt(a + r * Math.cos(th), b), 5 + r * Math.sin(th)); }))}" fill="${cor2}"/>`;
  eixos.forEach(a => {
    const b = ladoVisto * (L / 2 + 0.6);
    s += roda(a, b, 5.4, '#1d2025') + roda(a, b * 1.01, 2.4, '#b8bec7');
  });
  s += prisma(ret(-C * 0.28, C * 0.16, -L / 2 + 3, L / 2 - 3), 13, 22, '#42586f', { topo: tom(cor, 1.06), traco: '#00000022' });
  if (visto(f)) s += faceFrente(C / 2 + 0.3, L / 2 - 8, L / 2 - 3, 8, 11, '#fff6c2') + faceFrente(C / 2 + 0.3, -(L / 2 - 3), -(L / 2 - 8), 8, 11, '#fff6c2');
  else s += faceFrente(-C / 2 - 0.3, L / 2 - 8, L / 2 - 3, 8, 11, '#d63031') + faceFrente(-C / 2 - 0.3, -(L / 2 - 3), -(L / 2 - 8), 8, 11, '#d63031');
  const caixa = caixaDosPontos([...sombraC.map(p => iso(p, 0)), ...ret(-C / 2, C / 2, -L / 2 - 1, L / 2 + 1).flatMap(p => [iso(p, 0), iso(p, 22)])], 1.5);
  return { svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${caixa.x} ${caixa.y} ${caixa.w} ${caixa.h}">${s}</svg>`, caixa };
}

/** Mangueira do bico (A, na tela) até a tampa do tanque do carro (B), caindo um pouco no meio. */
export function mangueiraSvg(A: { X: number; Y: number }, B: { X: number; Y: number }) {
  const C = { X: (A.X + B.X) / 2, Y: Math.max(A.Y, B.Y) + 14 };
  const q = (u: number) => ({ X: (1 - u) * (1 - u) * A.X + 2 * u * (1 - u) * C.X + u * u * B.X, Y: (1 - u) * (1 - u) * A.Y + 2 * u * (1 - u) * C.Y + u * u * B.Y });
  const pontos = [0, 0.2, 0.4, 0.6, 0.8, 1].map(q);
  const caixa = caixaDosPontos(pontos, 4);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${caixa.x} ${caixa.y} ${caixa.w} ${caixa.h}">` +
    `<path d="M${r1(A.X)} ${r1(A.Y)} Q${r1(C.X)} ${r1(C.Y)} ${r1(B.X)} ${r1(B.Y)}" fill="none" stroke="#1f2328" stroke-width="2.2" stroke-linecap="round"/>` +
    `<circle cx="${r1(B.X)}" cy="${r1(B.Y)}" r="2" fill="#4b5563"/></svg>`;
  return { svg, caixa, pontos };
}
