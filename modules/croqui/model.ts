import { BANDEIRAS } from '../../lib/data';

// Elementos do croqui (portados do "Croqui de Postos.html"). k = forma: b bomba, o cobertura, t tanque, m totem, a seta, c círculo, r retângulo.
export type TipoInfo = { n: string; g: string; w: number; h: number; c: string; z: number; k: 'b' | 'o' | 't' | 'm' | 'a' | 'c' | 'r'; tc?: string };
export const T: Record<string, TipoInfo> = {
  bomba_gc: { n: 'Gasolina comum', g: 'Bombas', w: 30, h: 46, c: '#e53935', z: 3, k: 'b' },
  bomba_ga: { n: 'Gasolina aditivada', g: 'Bombas', w: 30, h: 46, c: '#8e24aa', z: 3, k: 'b' },
  bomba_et: { n: 'Etanol', g: 'Bombas', w: 30, h: 46, c: '#2e9e4f', z: 3, k: 'b' },
  bomba_d: { n: 'Diesel S10', g: 'Bombas', w: 30, h: 46, c: '#6d4c41', z: 3, k: 'b' },
  bomba_d500: { n: 'Diesel S500', g: 'Bombas', w: 30, h: 46, c: '#c0841a', z: 3, k: 'b' },
  bomba_da: { n: 'Diesel aditivado', g: 'Bombas', w: 30, h: 46, c: '#1f3a5f', z: 3, k: 'b' },
  bomba_pod: { n: 'Gasolina Podium', g: 'Bombas', w: 30, h: 46, c: '#212121', z: 3, k: 'b' },
  bomba_ipi: { n: 'Gasolina Ipimax', g: 'Bombas', w: 30, h: 46, c: '#00897b', z: 3, k: 'b' },
  bomba_grid: { n: 'Gasolina Grid', g: 'Bombas', w: 30, h: 46, c: '#e91e63', z: 3, k: 'b' },
  ilha: { n: 'Ilha', g: 'Estrutura', w: 50, h: 150, c: '#b8bcc4', z: 2, k: 'r' },
  cobertura: { n: 'Cobertura', g: 'Estrutura', w: 260, h: 200, c: '#f5b942', z: 1, k: 'o' },
  loja: { n: 'Loja', g: 'Estrutura', w: 130, h: 80, c: '#2f6fdb', z: 2, k: 'r', tc: '#fff' },
  tanque: { n: 'Tanque', g: 'Estrutura', w: 110, h: 44, c: '#7a8594', z: 2, k: 't', tc: '#fff' },
  totem: { n: 'Totem de preços', g: 'Estrutura', w: 40, h: 100, c: '#333', z: 3, k: 'm' },
  rua: { n: 'Rua / via', g: 'Vias', w: 400, h: 70, c: '#4a4f57', z: 0, k: 'r', tc: '#fff' },
  entrada: { n: 'Entrada', g: 'Vias', w: 60, h: 34, c: '#2e9e4f', z: 3, k: 'a', tc: '#fff' },
  saida: { n: 'Saída', g: 'Vias', w: 60, h: 34, c: '#e53935', z: 3, k: 'a', tc: '#fff' },
  lavagem: { n: 'Lava-jato', g: 'Serviços', w: 90, h: 60, c: '#26a6c9', z: 2, k: 'r', tc: '#fff' },
  calibrador: { n: 'Calibrador', g: 'Serviços', w: 30, h: 30, c: '#ef7d22', z: 3, k: 'c', tc: '#fff' },
  banheiro: { n: 'Banheiro', g: 'Serviços', w: 44, h: 44, c: '#7b61c9', z: 3, k: 'r', tc: '#fff' },
  arvore: { n: 'Árvore', g: 'Serviços', w: 34, h: 34, c: '#3f9b4b', z: 3, k: 'c' },
};
export const GRUPOS = ['Bombas', 'Estrutura', 'Vias', 'Serviços'];

/* ---------- Combustíveis vindos do catálogo único (lib/combustiveis) ---------- */
let bombasAtivas = Object.keys(T).filter(k => T[k].k === 'b');
/**
 * Atualiza os tipos de bomba a partir do catálogo de combustíveis. Combustíveis desativados continuam
 * registrados (para desenhar croquis antigos), mas saem da paleta e das opções de bico.
 */
export function registrarCombustiveis(lista: { id: string; nome: string; cor: string; ativo?: boolean }[]) {
  lista.forEach(c => { T[c.id] = { n: c.nome, g: 'Bombas', w: 30, h: 46, c: c.cor, z: 3, k: 'b' }; });
  bombasAtivas = lista.filter(c => c.ativo !== false).map(c => c.id);
}
/** Tipos de bomba (combustíveis) disponíveis para escolha. */
export const tiposBomba = () => bombasAtivas;
/** Elementos da paleta de um grupo. */
export const elementosDoGrupo = (g: string) => (g === 'Bombas' ? bombasAtivas : Object.keys(T).filter(k => T[k].g === g));

export type Item = { id: string; type: string; x: number; y: number; w: number; h: number; rot: number; label: string; bicos?: number; fuels?: string[] };
export type CroquiDoc = { items: Item[] };
export const VW = 1000, VH = 640;

export const snap = (v: number) => Math.round(v / 10) * 10;
export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
export const novoItemId = () => `it-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
export const fuelOf = (it: Item, i: number) => (it.fuels && T[it.fuels[i]] ? it.fuels[i] : it.type);
export const nBicos = (it: Item) => Math.min(6, Math.max(1, it.bicos || 1));

export function fuelList(it: Item) {
  const n = nBicos(it), c: Record<string, number> = {};
  for (let i = 0; i < n; i++) { const f = fuelOf(it, i); c[f] = (c[f] || 0) + 1; }
  const k = Object.keys(c);
  return k.length === 1 ? [T[k[0]].n + (n > 1 ? ` · ${n} bicos` : '')] : k.map(f => `${T[f].n} ×${c[f]}`);
}

export function resumo(items: Item[]) {
  const q: Record<string, number> = {};
  let bombas = 0;
  items.forEach(i => { if (T[i.type]?.k !== 'b') return; bombas++; for (let j = 0; j < nBicos(i); j++) { const f = fuelOf(i, j); q[f] = (q[f] || 0) + 1; } });
  return { bombas, porCombustivel: Object.entries(q).map(([k, n]) => ({ tipo: k, nome: T[k].n, cor: T[k].c, n })) };
}

export function novoItem(type: string, items: Item[], x = 500, y = 320): Item {
  const t = T[type];
  const comNome = ['ilha', 'loja', 'entrada', 'saida', 'lavagem', 'tanque'];
  return {
    id: novoItemId(), type, x: snap(x), y: snap(y), w: t.w, h: t.h, rot: 0,
    label: t.k === 'b' ? String(items.filter(i => T[i.type]?.k === 'b').length + 1) : comNome.includes(type) ? t.n : '',
  };
}

/** Modelo inicial (o mesmo do HTML), oferecido quando a filial ainda não tem croqui. */
export const modeloBasico = (): Item[] => [
  { id: novoItemId(), type: 'rua', x: 500, y: 590, w: 960, h: 70, rot: 0, label: '' },
  { id: novoItemId(), type: 'cobertura', x: 420, y: 300, w: 420, h: 240, rot: 0, label: '' },
  { id: novoItemId(), type: 'ilha', x: 340, y: 300, w: 50, h: 170, rot: 0, label: 'Ilha 1' },
  { id: novoItemId(), type: 'ilha', x: 500, y: 300, w: 50, h: 170, rot: 0, label: 'Ilha 2' },
  { id: novoItemId(), type: 'bomba_gc', x: 340, y: 270, w: 30, h: 46, rot: 0, label: '1' },
  { id: novoItemId(), type: 'bomba_ga', x: 340, y: 330, w: 30, h: 46, rot: 180, label: '2' },
  { id: novoItemId(), type: 'bomba_et', x: 500, y: 270, w: 30, h: 46, rot: 0, label: '3' },
  { id: novoItemId(), type: 'bomba_d', x: 500, y: 330, w: 30, h: 46, rot: 180, label: '4' },
  { id: novoItemId(), type: 'loja', x: 800, y: 200, w: 170, h: 100, rot: 0, label: 'Loja' },
  { id: novoItemId(), type: 'entrada', x: 90, y: 590, w: 60, h: 34, rot: 0, label: 'Entrada' },
];

/** Item tocado no ponto (coordenadas do desenho), considerando rotação. O de cima tem prioridade. */
/** Bombas apoiadas sobre a ilha (centro dentro da área da ilha, com folga): movem e giram junto com ela. */
export function filhosDaIlha(items: Item[], ilha: Item): Item[] {
  if (ilha.type !== 'ilha') return [];
  const r = (-ilha.rot * Math.PI) / 180;
  return items.filter(it => {
    if (it.id === ilha.id || T[it.type]?.k !== 'b') return false;
    const dx = it.x - ilha.x, dy = it.y - ilha.y;
    const lx = dx * Math.cos(r) - dy * Math.sin(r), ly = dx * Math.sin(r) + dy * Math.cos(r);
    return Math.abs(lx) <= ilha.w / 2 + 24 && Math.abs(ly) <= ilha.h / 2 + 24;
  });
}

/** Gira um ponto em torno de um centro (graus). */
export function girarPonto(x: number, y: number, cx: number, cy: number, graus: number) {
  const r = (graus * Math.PI) / 180, dx = x - cx, dy = y - cy;
  return { x: cx + dx * Math.cos(r) - dy * Math.sin(r), y: cy + dx * Math.sin(r) + dy * Math.cos(r) };
}

/** Número da bomba a partir do rótulo ("1", "Bomba 01" -> 1), para associar croqui e Aferições. */
export const numeroBomba = (s: string) => { const m = String(s ?? '').match(/\d+/); return m ? Number(m[0]) : null; };

export function hitTest(items: Item[], px: number, py: number): Item | null {
  const ordem = [...items].map((it, i) => ({ it, i })).sort((a, b) => (T[b.it.type]?.z ?? 0) - (T[a.it.type]?.z ?? 0) || b.i - a.i);
  for (const { it } of ordem) {
    const r = (-it.rot * Math.PI) / 180, dx = px - it.x, dy = py - it.y;
    const lx = dx * Math.cos(r) - dy * Math.sin(r), ly = dx * Math.sin(r) + dy * Math.cos(r);
    if (Math.abs(lx) <= it.w / 2 + 6 && Math.abs(ly) <= it.h / 2 + 6) return it;
  }
  return null;
}

/* =====================================================================
   Gerador SVG (mesmo desenho do HTML; usado na tela e na impressão)
   ===================================================================== */
export type Paleta = { ground: string; grid: string; panel: string; text: string; border: string; accent: string };
export const PALETA_CLARA: Paleta = { ground: '#e9ece6', grid: '#d5d9d0', panel: '#ffffff', text: '#1b1f24', border: '#d9dde3', accent: '#4f46e5' };
export const PALETA_ESCURA: Paleta = { ground: '#262b27', grid: '#30362f', panel: '#1f2328', text: '#e8eaed', border: '#343a42', accent: '#9189ff' };

const esc = (s: string) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] ?? c));

function dots(it: Item) {
  const n = nBicos(it), h = it.h;
  let d = '';
  for (let i = 0; i < n; i++) {
    const r = Math.floor(i / 2), k = Math.min(2, n - r * 2), c = i % 2, dx = (c - (k - 1) / 2) * 10, dy = -h / 2 + h * 0.28 + 12 + r * 8;
    d += `<circle cx="${dx}" cy="${dy}" r="3.3" fill="${T[fuelOf(it, i)].c}" stroke="#fff" stroke-width="1.4"/>`;
  }
  return d;
}

function shape(it: Item, bandeira: string) {
  const t = T[it.type], w = it.w, h = it.h, c = t.c, x = -w / 2, y = -h / 2, s = 'stroke="#000" stroke-opacity="0.35" stroke-width="1.5"';
  switch (t.k) {
    case 'b': return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="6" fill="${c}" ${s}/><rect x="${x + 4}" y="${y + 4}" width="${w - 8}" height="${h * 0.28}" rx="3" fill="#fff" opacity="0.85"/><path d="M${w / 2} ${y + h * 0.5} q8 4 6 18" stroke="#222" stroke-width="3" fill="none" stroke-linecap="round"/>${dots(it)}`;
    case 'o': return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="8" fill="${c}" fill-opacity="0.18" stroke="${c}" stroke-width="2" stroke-dasharray="8 6"/>`;
    case 't': return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${h / 2}" fill="${c}" fill-opacity="0.85" stroke="#222" stroke-dasharray="5 4"/>`;
    case 'm': {
      const f = BANDEIRAS[bandeira] ?? BANDEIRAS.branca;
      return `<rect x="-4" y="${y + h * 0.45}" width="8" height="${h * 0.55}" fill="#555"/><rect x="${x}" y="${y}" width="${w}" height="${h * 0.5}" rx="5" fill="${f.c}" stroke="#000" stroke-opacity="0.4" stroke-width="1.5"/>` +
        [0, 1, 2].map(n => `<rect x="${x + 6}" y="${y + 8 + n * 11}" width="${w - 12}" height="6" rx="2" fill="${f.tc}" opacity="0.85"/>`).join('');
    }
    case 'a': return `<path d="M${x} ${y} H${w / 2 - 14} L${w / 2} 0 L${w / 2 - 14} ${h / 2} H${x} Z" fill="${c}" ${s}/>`;
    case 'c': return `<circle r="${w / 2}" fill="${c}" ${s}/>`;
    default:
      return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="6" fill="${c}" ${s}/>` +
        (it.type === 'ilha' ? `<rect x="${x + 6}" y="${y + 6}" width="${w - 12}" height="${h - 12}" rx="4" fill="none" stroke="#fff" stroke-opacity="0.6" stroke-dasharray="4 4"/>` : '') +
        (it.type === 'rua' ? `<line x1="${x + 10}" y1="0" x2="${w / 2 - 10}" y2="0" stroke="#fff" stroke-dasharray="14 10" stroke-width="2"/>` : '');
  }
}

export function iconSvg(type: string) {
  const t = T[type], m = Math.max(t.w, t.h) + 12;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-m / 2} ${-m / 2} ${m} ${m}">${shape({ id: '', type, x: 0, y: 0, w: t.w, h: t.h, rot: 0, label: '' }, 'branca')}</svg>`;
}

export function croquiSvg(items: Item[], opts: { bandeira: string; mostrarNomes: boolean; selecionado?: string | null; p: Paleta; destaques?: Record<string, string>; grupo?: string[] }) {
  const { p } = opts;
  let h = `<rect x="0" y="0" width="${VW}" height="${VH}" fill="${p.ground}"/>`;
  for (let i = 0; i <= VW; i += 50) h += `<line x1="${i}" y1="0" x2="${i}" y2="${VH}" stroke="${p.grid}" stroke-width="1"/>`;
  for (let j = 0; j <= VH; j += 50) h += `<line x1="0" y1="${j}" x2="${VW}" y2="${j}" stroke="${p.grid}" stroke-width="1"/>`;
  const ordem = [...items].filter(i => T[i.type]).sort((a, b) => T[a.type].z - T[b.type].z);
  for (const it of ordem) {
    const t = T[it.type], on = it.id === opts.selecionado, noGrupo = !on && !!opts.grupo?.includes(it.id), destaque = opts.destaques?.[it.id];
    const cor = t.tc || (t.k === 'b' ? '#fff' : '#1b1f24');
    h += `<g transform="translate(${it.x} ${it.y}) rotate(${it.rot})">${shape(it, opts.bandeira)}` +
      (destaque ? `<rect x="${-it.w / 2 - 9}" y="${-it.h / 2 - 9}" width="${it.w + 18}" height="${it.h + 18}" rx="10" fill="${destaque}" fill-opacity="0.22" stroke="${destaque}" stroke-width="4"/>` : '') +
      (noGrupo ? `<rect x="${-it.w / 2 - 3}" y="${-it.h / 2 - 3}" width="${it.w + 6}" height="${it.h + 6}" fill="none" stroke="${p.accent}" stroke-width="1.5" stroke-dasharray="3 3" opacity="0.8"/>` : '') +
      (on ? `<rect x="${-it.w / 2 - 4}" y="${-it.h / 2 - 4}" width="${it.w + 8}" height="${it.h + 8}" fill="none" stroke="${p.accent}" stroke-width="2.5" stroke-dasharray="5 3"/>` : '') +
      (it.label ? `<text transform="rotate(${-it.rot})" text-anchor="middle" dy="0.35em" font-size="${t.k === 'b' ? 13 : 12}" font-weight="600" fill="${cor}">${esc(it.label)}</text>` : '') +
      `</g>`;
  }
  if (opts.mostrarNomes) for (const it of ordem) {
    const t = T[it.type];
    if (t.k !== 'b') continue;
    const ls = fuelList(it), nm = ls.reduce((a, b) => (a.length > b.length ? a : b), ''), tw = nm.length * 5.4 + 10, ty = it.y + (Math.abs(Math.sin((it.rot * Math.PI) / 180)) * it.w + Math.abs(Math.cos((it.rot * Math.PI) / 180)) * it.h) / 2 + 4;
    h += `<g><rect x="${it.x - tw / 2}" y="${ty}" width="${tw}" height="${ls.length * 12 + 2}" rx="4" fill="${p.panel}" stroke="${t.c}" opacity="0.95"/>` +
      ls.map((l, j) => `<text x="${it.x}" y="${ty + 10 + j * 12}" text-anchor="middle" font-size="9.5" fill="${p.text}">${esc(l)}</text>`).join('') + `</g>`;
  }
  const used: string[] = [];
  items.forEach(i => { if (T[i.type]?.k === 'b') for (let j = 0; j < nBicos(i); j++) { const f = fuelOf(i, j); if (!used.includes(f)) used.push(f); } });
  if (used.length) {
    h += `<g><rect x="12" y="12" width="200" height="${used.length * 18 + 30}" rx="8" fill="${p.panel}" stroke="${p.border}" opacity="0.95"/><text x="22" y="30" font-size="12" font-weight="700" fill="${p.text}">Combustíveis</text>` +
      used.map((k, n) => `<rect x="22" y="${40 + n * 18}" width="12" height="12" rx="3" fill="${T[k].c}"/><text x="42" y="${50 + n * 18}" font-size="12" fill="${p.text}">${esc(T[k].n)}</text>`).join('') + `</g>`;
  }
  const f = BANDEIRAS[opts.bandeira] ?? BANDEIRAS.branca, bw = Math.max(130, f.n.length * 10 + 30);
  h += `<g><rect x="${988 - bw}" y="12" width="${bw}" height="44" rx="8" fill="${f.c}" stroke="#000" stroke-opacity="0.35"/><text x="${988 - bw / 2}" y="28" text-anchor="middle" font-size="10" fill="${f.tc}" opacity="0.85">BANDEIRA</text><text x="${988 - bw / 2}" y="46" text-anchor="middle" font-size="16" font-weight="800" fill="${f.tc}">${esc(f.n.toUpperCase())}</text></g>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VW} ${VH}">${h}</svg>`;
}

/** Converte o conteúdo salvo pelo HTML antigo (localStorage "croqui-postos"). */
export function lerCroquiAntigo(json: string): { nome: string; bandeira: string; items: Item[] }[] {
  const d = JSON.parse(json) as { br?: { name?: string; flag?: string; items?: Partial<Item>[] }[] };
  if (!d || !Array.isArray(d.br)) throw new Error('formato');
  return d.br.map(b => ({
    nome: b.name ?? 'Sem nome',
    bandeira: b.flag && BANDEIRAS[b.flag] ? b.flag : 'branca',
    items: (b.items ?? []).filter(i => i.type && T[i.type]).map(i => ({
      id: novoItemId(), type: i.type!, x: Number(i.x) || 0, y: Number(i.y) || 0, w: Number(i.w) || T[i.type!].w, h: Number(i.h) || T[i.type!].h,
      rot: Number(i.rot) || 0, label: String(i.label ?? ''), ...(i.bicos ? { bicos: Number(i.bicos) } : {}), ...(i.fuels ? { fuels: i.fuels } : {}),
    })),
  }));
}
