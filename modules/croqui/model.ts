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

/**
 * Elemento do croqui. Bombas espelhadas do cadastro (Aferições → Filiais) têm `ref` (id da bomba no cadastro)
 * e `bicosNum` (número de cada bico); número, bicos e combustíveis vêm do cadastro, e o croqui só guarda a posição.
 */
export type Item = {
  id: string; type: string; x: number; y: number; w: number; h: number; rot: number; label: string;
  bicos?: number; fuels?: string[]; ref?: string; bicosNum?: string[];
};
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

/** Terreno básico (rua, cobertura, ilhas, loja, entrada e saída), sem bombas: elas vêm do cadastro. */
export const modeloBasico = (): Item[] => layoutInicial([], () => 'bomba_gc');

/* =====================================================================
   Espelho do cadastro de bombas (Aferições → Filiais)
   ===================================================================== */
export type BombaCadastro = { id: string; number: string; nozzles: { id: string; number: string; fuel: string }[] };

const semAcento = (s: string) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();

/** Tipo de bomba do croqui (id do catálogo de combustíveis) para o nome de combustível usado no bico. */
export function tipoDoCombustivel(nome: string, catalogo: { id: string; nome: string }[]): string {
  const n = semAcento(nome);
  const c = catalogo.find(x => semAcento(x.nome) === n);
  if (c) return c.id;
  return catalogo.find(x => x.id === 'bomba_outro')?.id ?? catalogo[0]?.id ?? 'bomba_gc';
}

/** Rótulo curto da bomba no desenho ("Bomba 01" → "1"). */
export const rotuloBomba = (numero: string) => { const n = numeroBomba(numero); return n === null ? String(numero ?? '').trim().slice(0, 4) : String(n); };

/** Bomba do cadastro que corresponde a um item do croqui: pelo vínculo (`ref`) ou, nos croquis antigos, pelo número. */
export function bombaDoItem<B extends BombaCadastro>(it: Item, bombas: B[]): B | undefined {
  if (T[it.type]?.k !== 'b') return undefined;
  if (it.ref) { const b = bombas.find(x => x.id === it.ref); if (b) return b; }
  const n = numeroBomba(it.label);
  return n === null ? undefined : bombas.find(x => numeroBomba(x.number) === n);
}

function atributosDaBomba(b: BombaCadastro, tipo: (nome: string) => string) {
  const bicos = b.nozzles.slice(0, 6); // o desenho comporta até 6 bicos por bomba
  const fuels = bicos.map(n => tipo(n.fuel));
  return {
    ref: b.id,
    label: rotuloBomba(b.number),
    type: fuels[0] ?? tipo(''),
    bicos: Math.max(1, bicos.length),
    fuels: fuels.length ? fuels : undefined,
    bicosNum: bicos.length ? bicos.map(n => String(n.number).trim()) : undefined,
  };
}
const chaveEspelho = (it: Partial<Item>) => JSON.stringify([it.ref, it.label, it.type, it.bicos ?? 1, it.fuels ?? null, it.bicosNum ?? null]);

// Bombas espelhadas são um pouco maiores que as da paleta, para caber o número de cada bico.
const BOMBA_W = 36, BOMBA_H = 54;

/**
 * Faz as bombas do croqui espelharem o cadastro: cada bomba cadastrada tem um item (com número, bicos e
 * combustíveis do cadastro); a posição continua sendo a do croqui. Bombas novas entram numa fila no topo
 * do desenho (ou, com o croqui vazio, num layout inicial sobre ilhas). Nada é apagado: bombas do croqui
 * sem correspondência no cadastro voltam em `semCadastro` para quem edita decidir.
 */
export function espelharBombas(items: Item[], bombas: BombaCadastro[], tipo: (nome: string) => string): { items: Item[]; mudou: boolean; semCadastro: Item[] } {
  const usadas = new Set<string>();
  const semCadastro: Item[] = [];
  let mudou = false;
  const out = items.map(it => {
    if (T[it.type]?.k !== 'b') return it;
    const b = bombaDoItem(it, bombas.filter(x => !usadas.has(x.id)));
    if (!b) { semCadastro.push(it); return it; }
    usadas.add(b.id);
    const novo = { ...it, ...atributosDaBomba(b, tipo) };
    if (chaveEspelho(novo) !== chaveEspelho(it)) mudou = true;
    return novo;
  });
  const faltam = bombas.filter(b => !usadas.has(b.id));
  if (!faltam.length) return { items: out, mudou, semCadastro };
  if (!items.length) return { items: layoutInicial(faltam, tipo), mudou: true, semCadastro };
  // Fila no topo, fora da legenda (esquerda) e da bandeira (direita): é só arrastar para o lugar certo.
  faltam.forEach((b, i) => out.push({
    id: novoItemId(), x: 240 + (i % 14) * 50, y: 90 + Math.floor(i / 14) * 64, w: BOMBA_W, h: BOMBA_H, rot: 0, ...atributosDaBomba(b, tipo),
  }));
  return { items: out, mudou: true, semCadastro };
}

/**
 * Layout inicial: até 5 ilhas por fileira (2 fileiras), duas bombas por ilha (frente e verso),
 * cobertura em volta, loja, rua, entrada e saída. Bombas além de 20 vão para a fila no topo.
 */
export function layoutInicial(bombas: BombaCadastro[], tipo: (nome: string) => string): Item[] {
  const POR_FILA = 5, PASSO_X = 140, X0 = 160, Y_FILAS = [240, 450];
  const nIlhas = Math.min(POR_FILA * Y_FILAS.length, Math.max(1, Math.ceil(bombas.length / 2)));
  const out: Item[] = [{ id: novoItemId(), type: 'rua', x: 500, y: 600, w: 980, h: 70, rot: 0, label: '' }];
  const ilhas: Item[] = [];
  for (let i = 0; i < nIlhas; i++) {
    const x = X0 + (i % POR_FILA) * PASSO_X, y = Y_FILAS[Math.floor(i / POR_FILA)];
    ilhas.push({ id: novoItemId(), type: 'ilha', x, y, w: 50, h: 170, rot: 0, label: `Ilha ${i + 1}` });
  }
  const xs = ilhas.map(i => i.x), ys = ilhas.map(i => i.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  out.push({ id: novoItemId(), type: 'cobertura', x: (minX + maxX) / 2, y: (minY + maxY) / 2, w: maxX - minX + 130, h: maxY - minY + 210, rot: 0, label: '' });
  out.push(...ilhas);
  bombas.slice(0, nIlhas * 2).forEach((b, i) => {
    const ilha = ilhas[Math.floor(i / 2)], frente = i % 2 === 0;
    out.push({ id: novoItemId(), x: ilha.x, y: ilha.y + (frente ? -36 : 36), w: BOMBA_W, h: BOMBA_H, rot: frente ? 0 : 180, ...atributosDaBomba(b, tipo) });
  });
  bombas.slice(nIlhas * 2).forEach((b, i) => out.push({ id: novoItemId(), x: 240 + (i % 14) * 50, y: 90, w: BOMBA_W, h: BOMBA_H, rot: 0, ...atributosDaBomba(b, tipo) }));
  out.push({ id: novoItemId(), type: 'loja', x: 880, y: 250, w: 170, h: 100, rot: 0, label: 'Loja' });
  out.push({ id: novoItemId(), type: 'entrada', x: 90, y: 600, w: 60, h: 34, rot: 0, label: 'Entrada' });
  out.push({ id: novoItemId(), type: 'saida', x: 910, y: 600, w: 60, h: 34, rot: 0, label: 'Saída' });
  return out;
}

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

/** Bicos: bolinhas na cor do combustível. Bombas espelhadas do cadastro mostram o número do bico (sempre de pé). */
function dots(it: Item) {
  const n = nBicos(it), h = it.h, comNumero = !!it.bicosNum?.length;
  // Com número, a bolinha cresce com a largura da bomba (36 → raio 6,5 e fonte 8,5).
  const raio = comNumero ? Math.max(5, it.w * 0.18) : 3.3, passoX = comNumero ? raio * 2.15 : 10, passoY = comNumero ? raio * 2.15 : 8, topo = comNumero ? 10 : 12;
  const fonte = raio * 1.3;
  let d = '';
  for (let i = 0; i < n; i++) {
    const r = Math.floor(i / 2), k = Math.min(2, n - r * 2), c = i % 2, dx = (c - (k - 1) / 2) * passoX, dy = -h / 2 + h * 0.28 + topo + r * passoY;
    d += `<circle cx="${dx}" cy="${dy}" r="${raio}" fill="${T[fuelOf(it, i)].c}" stroke="#fff" stroke-width="1.4"/>`;
    const num = it.bicosNum?.[i];
    if (num) d += `<text x="${dx}" y="${dy}" transform="rotate(${-it.rot} ${dx} ${dy})" text-anchor="middle" dy="0.35em" font-size="${num.length > 2 ? fonte * 0.75 : fonte}" font-weight="800" fill="#fff">${esc(num)}</text>`;
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

/** Rótulo do item, sempre de pé. Na bomba vai no visor branco do topo, para não cobrir os bicos. */
function rotulo(it: Item, t: TipoInfo, cor: string) {
  if (t.k === 'b') {
    const y = -it.h / 2 + 4 + it.h * 0.14;
    return `<text x="0" y="${y}" transform="rotate(${-it.rot} 0 ${y})" text-anchor="middle" dy="0.35em" font-size="10.5" font-weight="800" fill="#1b1f24">${esc(it.label)}</text>`;
  }
  return `<text transform="rotate(${-it.rot})" text-anchor="middle" dy="0.35em" font-size="12" font-weight="600" fill="${cor}">${esc(it.label)}</text>`;
}

export function iconSvg(type: string) {
  const t = T[type], m = Math.max(t.w, t.h) + 12;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-m / 2} ${-m / 2} ${m} ${m}">${shape({ id: '', type, x: 0, y: 0, w: t.w, h: t.h, rot: 0, label: '' }, 'branca')}</svg>`;
}

export type Area = { x: number; y: number; w: number; h: number };

/**
 * Área das bombas (bombas, ilhas e cobertura) com margem, para mostrar só a pista em telas pequenas.
 * Garante tamanho mínimo e proporção de no máximo 1,2 (altura/largura). Sem bombas: null (desenho inteiro).
 */
export function areaDasBombas(items: Item[], margem = 24): Area | null {
  const alvo = items.filter(i => T[i.type]?.k === 'b' || i.type === 'ilha' || i.type === 'cobertura');
  if (!alvo.some(i => T[i.type]?.k === 'b')) return null;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  alvo.forEach(i => {
    const r = (i.rot * Math.PI) / 180, c = Math.abs(Math.cos(r)), s = Math.abs(Math.sin(r));
    const hw = (c * i.w + s * i.h) / 2, hh = (s * i.w + c * i.h) / 2;
    x0 = Math.min(x0, i.x - hw); x1 = Math.max(x1, i.x + hw); y0 = Math.min(y0, i.y - hh); y1 = Math.max(y1, i.y + hh);
  });
  let w = Math.max(240, x1 - x0 + margem * 2), h = Math.max(160, y1 - y0 + margem * 2);
  if (h > w * 1.2) w = h / 1.2;
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  w = Math.min(w, VW); h = Math.min(h, VH);
  return { x: clamp(cx - w / 2, 0, VW - w), y: clamp(cy - h / 2, 0, VH - h), w, h };
}

export function croquiSvg(items: Item[], opts: { bandeira: string; mostrarNomes: boolean; selecionado?: string | null; p: Paleta; destaques?: Record<string, string>; grupo?: string[]; area?: Area | null }) {
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
      (it.label ? rotulo(it, t, cor) : '') +
      `</g>`;
  }
  if (opts.mostrarNomes) for (const it of ordem) {
    const t = T[it.type];
    if (t.k !== 'b') continue;
    const ls = fuelList(it), nm = ls.reduce((a, b) => (a.length > b.length ? a : b), ''), tw = nm.length * 5.4 + 10, ty = it.y + (Math.abs(Math.sin((it.rot * Math.PI) / 180)) * it.w + Math.abs(Math.cos((it.rot * Math.PI) / 180)) * it.h) / 2 + 4;
    h += `<g><rect x="${it.x - tw / 2}" y="${ty}" width="${tw}" height="${ls.length * 12 + 2}" rx="4" fill="${p.panel}" stroke="${t.c}" opacity="0.95"/>` +
      ls.map((l, j) => `<text x="${it.x}" y="${ty + 10 + j * 12}" text-anchor="middle" font-size="9.5" fill="${p.text}">${esc(l)}</text>`).join('') + `</g>`;
  }
  // Recorte (só a pista): sem legenda e sem bandeira, que ficam nos cantos do desenho inteiro.
  if (opts.area) {
    const a = opts.area;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${a.x} ${a.y} ${a.w} ${a.h}">${h}</svg>`;
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
