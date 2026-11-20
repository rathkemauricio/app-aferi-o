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
const iso = (p: Pt, z = 0) => ({ X: (p.x - p.y) * COS, Y: (p.x + p.y) * SIN - z });
/** Ponto do plano original (sem giro) → tela, na vista escolhida. */
export const projetar = (p: Pt, z: number, v: Vista) => iso(girarVista(p, v), z);

const r1 = (n: number) => Math.round(n * 10) / 10;
const pts = (l: { X: number; Y: number }[]) => l.map(q => `${r1(q.X)},${r1(q.Y)}`).join(' ');
const escXml = (s: string) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] ?? c));

/** Clareia (f > 1) ou escurece (f < 1) uma cor #rrggbb. */
function tom(hex: string, f: number) {
  const h = hex.replace('#', '');
  const n = h.length === 3 ? h.split('').map(x => x + x).join('') : h.slice(0, 6);
  const v = parseInt(n, 16);
  if (Number.isNaN(v)) return hex;
  const c = [(v >> 16) & 255, (v >> 8) & 255, v & 255].map(x => Math.max(0, Math.min(255, Math.round(f > 1 ? x + (255 - x) * (f - 1) : x * f))));
  return `#${c.map(x => x.toString(16).padStart(2, '0')).join('')}`;
}

/** Cantos do retângulo do item no plano (girado pelo próprio ângulo do item). */
function cantos(it: Pick<Item, 'x' | 'y' | 'w' | 'h' | 'rot'>, folga = 0): Pt[] {
  const a = (it.rot * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  const w = it.w / 2 + folga, h = it.h / 2 + folga;
  return [[-w, -h], [w, -h], [w, h], [-w, h]].map(([x, y]) => ({ x: it.x + x * c - y * s, y: it.y + x * s + y * c }));
}
/** Ponto local do item (dx, dy a partir do centro, no sentido do item) no plano. */
function local(it: Pick<Item, 'x' | 'y' | 'rot'>, dx: number, dy: number): Pt {
  const a = (it.rot * Math.PI) / 180;
  return { x: it.x + dx * Math.cos(a) - dy * Math.sin(a), y: it.y + dx * Math.sin(a) + dy * Math.cos(a) };
}

type Bloco = { prof: number; svg: string };

/**
 * Prisma: base `c` (polígono no plano, já girado pela vista) de z0 a z1. Desenha as faces voltadas para quem olha
 * (as de normal para +x+y) com sombreamento e o topo. `faceExtra` recebe cada face visível (para janelas e logotipos).
 */
function prisma(c: Pt[], z0: number, z1: number, cor: string, op: { topo?: string; opac?: number; traco?: string; faceExtra?: (a: Pt, b: Pt, nx: number, ny: number) => string } = {}) {
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
const piso = (c: Pt[], z: number, cor: string, extra = '') => `<polygon points="${pts(c.map(p => iso(p, z)))}" fill="${cor}"${extra}/>`;
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
function dentro(it: Item, p: Pt) {
  const a = (-it.rot * Math.PI) / 180, dx = p.x - it.x, dy = p.y - it.y;
  const lx = dx * Math.cos(a) - dy * Math.sin(a), ly = dx * Math.sin(a) + dy * Math.cos(a);
  return Math.abs(lx) <= it.w / 2 && Math.abs(ly) <= it.h / 2;
}

export type Cena3D = { base: string; topo: string; vb: { x: number; y: number; w: number; h: number } };

/** Monta a maquete do croqui. `vista` gira a maquete de 90 em 90 graus. */
export function cena3d(items: Item[], opts: { bandeira: string; nomes: boolean; vista: Vista }): Cena3D {
  const v = opts.vista;
  const G = (p: Pt) => girarVista(p, v);
  const band = BANDEIRAS[opts.bandeira] ?? BANDEIRAS.branca ?? { n: 'Bandeira', c: '#6b7280', tc: '#fff' };
  const ilhas = items.filter(i => i.type === 'ilha');
  const sobreIlha = (it: Item) => ilhas.some(il => il.id !== it.id && dentro(il, it));

  // ---------- Base da maquete: gramado com borda de terra e o pátio de concreto ----------
  const M = 26;
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
          blocos.push({ prof: prof(centro), svg: prisma(c, 0, 50, '#f4f4f1', { faceExtra: janela, topo: '#e9e9e4' }) + prisma(cantos(it, 4).map(G), 50, 56, t.c) });
          pinta(it, 74, it.label || 'Loja', t.c);
          break;
        }
        const alt = it.type === 'lavagem' ? 40 : it.type === 'banheiro' ? 30 : 12;
        sombras += sombra(c, alt);
        blocos.push({ prof: prof(centro), svg: prisma(c, 0, alt, t.c, { traco: '#00000022' }) });
        if (it.type === 'lavagem' || it.type === 'banheiro') pinta(it, alt + 16, it.label || t.n, t.c);
        break;
      }
      case 'b': {
        const z0 = sobreIlha(it) ? 6 : 0, z1 = z0 + 34;
        const corpo = cantos({ ...it, w: it.w * 0.72, h: it.h * 0.9 }).map(G);
        sombras += sombra(corpo, 34);
        const n = nBicos(it), cores = Array.from({ length: n }, (_, i) => T[fuelOf(it, i)]?.c ?? t.c);
        // corpo branco com a faixa da cor do combustível e o topo com os bicos (bolinhas coloridas)
        let svg = prisma(corpo, z0, z1, '#f2f3f5', { topo: '#fafafa', traco: '#00000018' });
        svg += prisma(cantos({ ...it, w: it.w * 0.74, h: it.h * 0.92 }).map(G), z0 + 18, z0 + 26, t.c);
        cores.forEach((k, i) => {
          const dy = n === 1 ? 0 : -it.h * 0.32 + (i * (it.h * 0.64)) / (n - 1);
          const p = iso(G(local(it, 0, dy)), z1 + 0.2);
          svg += `<ellipse cx="${r1(p.X)}" cy="${r1(p.Y)}" rx="3.4" ry="2" fill="${k}" stroke="#ffffff" stroke-width="0.6"/>`;
        });
        blocos.push({ prof: prof(centro), svg });
        pinta(it, z1 + 16, `Bomba ${it.label || ''}`.trim() + (it.bicosNum?.length ? ` · ${it.bicosNum.join(' ')}` : ''), t.c, cores);
        break;
      }
      case 'o': {
        // pilares (volumes) e o telhado na camada de cima, com a faixa na cor da bandeira
        const pil = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sy]) => local(it, sx * (it.w / 2 - 16), sy * (it.h / 2 - 16)));
        pil.forEach(p => {
          const q = cantos({ x: p.x, y: p.y, w: 9, h: 9, rot: it.rot }).map(G);
          blocos.push({ prof: prof(p), svg: prisma(q, 0, 84, '#d6d9de', { topo: '#e6e8eb' }) });
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
        blocos.push({ prof: prof(centro), svg: prisma(poste, 0, 72, '#5b6068') + prisma(placa, 72, 118, band.c, { faceExtra: face, topo: tom(band.c, 1.2) }) });
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
        if (it.type === 'arvore') { blocos.push({ prof: prof(centro), svg: arvore(G(centro), it.w * 0.6) }); sombras += circuloChao(G({ x: it.x + 10, y: it.y + 14 }), it.w * 0.45, 0.2, '#0b1a10', ' opacity="0.12"'); break; }
        const q = cantos({ ...it, w: it.w * 0.6, h: it.h * 0.6 }).map(G);
        blocos.push({ prof: prof(centro), svg: prisma(q, 0, 22, t.c) });
        break;
      }
      default: break;
    }
  }

  // Árvores enfeitando as bordas da maquete (só onde não há nada desenhado).
  const livre = (p: Pt) => !items.some(i => Math.hypot(i.x - p.x, i.y - p.y) < Math.max(i.w, i.h) / 2 + 40);
  [{ x: 22, y: 22 }, { x: VW - 22, y: 22 }, { x: 22, y: VH - 22 }, { x: VW - 22, y: VH - 22 }, { x: VW / 2, y: 14 }, { x: 14, y: VH / 2 }, { x: VW - 14, y: VH / 2 }]
    .filter(livre).forEach((p, i) => { blocos.push({ prof: prof(p), svg: arvore(G(p), 15 + (i % 3) * 3) }); });

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
  };
}

/** Árvore de maquete: tronco e copa redonda (duas esferas de tons diferentes). */
function arvore(p: Pt, r: number) {
  const base = iso(p, 0), copa = iso(p, 18 + r);
  return `<rect x="${r1(base.X - 2)}" y="${r1(copa.Y)}" width="4" height="${r1(base.Y - copa.Y)}" fill="#8b6b4a"/>` +
    `<circle cx="${r1(copa.X)}" cy="${r1(copa.Y)}" r="${r1(r)}" fill="#5fa85a"/>` +
    `<circle cx="${r1(copa.X - r * 0.28)}" cy="${r1(copa.Y - r * 0.3)}" r="${r1(r * 0.62)}" fill="#7cc06f"/>`;
}

/** Pontos de interesse (no plano original) para os bonequinhos andarem: porta da loja, lados das bombas, serviços. */
export function pontosDePassagem(items: Item[], v: Vista = 0) {
  const bombas = items.filter(i => T[i.type]?.k === 'b');
  const ladoBomba = bombas.flatMap(b => [local(b, -(b.w / 2 + 14), 0), local(b, b.w / 2 + 14, 0)]);
  const loja = items.find(i => i.type === 'loja');
  // Porta da loja: o lado virado para quem olha (assim as pessoas não passam por trás do prédio).
  const frente = (p: Pt) => { const g = girarVista(p, v); return g.x + g.y; };
  const porta = loja ? [local(loja, 0, loja.h / 2 + 16), local(loja, 0, -loja.h / 2 - 16), local(loja, loja.w / 2 + 16, 0), local(loja, -loja.w / 2 - 16, 0)].sort((a, b) => frente(b) - frente(a))[0] : null;
  const servicos = items.filter(i => ['banheiro', 'calibrador', 'lavagem'].includes(i.type)).map(i => local(i, 0, i.h / 2 + 14));
  const cobertura = items.find(i => i.type === 'cobertura');
  const pateo = cobertura ? [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sy]) => local(cobertura, sx * (cobertura.w / 2 - 30), sy * (cobertura.h / 2 - 30))) : [];
  return { ladoBomba, porta, servicos, pateo };
}
