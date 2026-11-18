import { useMemo } from 'react';
import { Collection, type SyncRow, useCollection } from '../../lib/sync';
import { esc } from '../../lib/util';
import type { Texto } from '../coleta/barras';

// Tabelas de arqueação dos tanques (altura medida na régua, em cm → volume em litros).
// Cada tabela é de uma filial e serve aos tanques dela marcados em `tanques` (um tanque usa uma só tabela).
// Entre dois centímetros da tabela o volume é interpolado em linha reta.

export type Ponto = [cm: number, litros: number];
export type TabelaArqueacao = SyncRow & {
  filial_id: string;
  nome: string;
  /** Números dos tanques da filial que usam esta tabela (os mesmos da medição/croqui). */
  tanques: string[];
  capacidade: number | null;
  /** Altura máxima da régua (diâmetro interno do tanque), em cm. */
  diametro_cm: number | null;
  comprimento_m: number | null;
  pontos: Ponto[];
  /** Nome do arquivo de onde a tabela foi lida. */
  arquivo: string;
};

export const tabelasCol = new Collection<TabelaArqueacao>({ table: 'tq_tabelas', storageKey: 'nevoeiro.tanques.tabelas.v1' });

const norm = (t: string) => t.trim().toLowerCase();
/** Tabelas da filial, em ordem de nome. */
export function useTabelas(filialId: string | undefined) {
  const c = useCollection(tabelasCol);
  return useMemo(() => c.list.filter(t => t.filial_id === filialId).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR', { numeric: true })), [c.list, filialId]);
}
/** Tabela usada pelo tanque (pelo número), se houver. */
export const tabelaDoTanque = (tabelas: TabelaArqueacao[], tanque: string) => tabelas.find(t => t.tanques.some(x => norm(x) === norm(tanque)));

/** Liga o tanque a uma tabela da filial (tira de qualquer outra); `null` deixa o tanque sem tabela. */
export function vincularTanque(tabelas: TabelaArqueacao[], tanque: string, tabelaId: string | null) {
  for (const t of tabelas) {
    const tem = t.tanques.some(x => norm(x) === norm(tanque));
    if (t.id === tabelaId && !tem) tabelasCol.put({ ...t, tanques: [...t.tanques, tanque.trim()].sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true })) });
    else if (t.id !== tabelaId && tem) tabelasCol.put({ ...t, tanques: t.tanques.filter(x => norm(x) !== norm(tanque)) });
  }
}

/** Altura máxima da régua na tabela (diâmetro informado ou o último centímetro da tabela). */
export const alturaMaxima = (t: TabelaArqueacao) => t.diametro_cm ?? t.pontos[t.pontos.length - 1]?.[0] ?? 0;
/** Volume total da tabela (litros no último centímetro). */
export const volumeTotal = (t: Pick<TabelaArqueacao, 'pontos'>) => t.pontos[t.pontos.length - 1]?.[1] ?? 0;

/** Litros pela tabela para a altura em cm (interpolação linear; 0 cm = 0 L; acima da tabela = volume total). */
export function litrosPelaTabela(t: Pick<TabelaArqueacao, 'pontos'>, cm: number): number | null {
  const p = t.pontos;
  if (!p.length || !Number.isFinite(cm)) return null;
  if (cm <= 0) return 0;
  let antes: Ponto = [0, 0];
  for (const x of p) {
    if (x[0] === cm) return x[1];
    if (x[0] > cm) return Math.round(antes[1] + ((x[1] - antes[1]) * (cm - antes[0])) / (x[0] - antes[0]));
    antes = x;
  }
  return antes[1];
}

/* ---------- Leitura do arquivo ---------- */

/** Linhas de texto de cada página do PDF (textos na mesma altura juntos, da esquerda para a direita). */
export function linhasDoPdf(paginas: Texto[][]): string[] {
  const out: string[] = [];
  for (const textos of paginas) {
    const ordenados = [...textos].sort((a, b) => b.y - a.y);
    const grupos: Texto[][] = [];
    for (const t of ordenados) {
      const g = grupos[grupos.length - 1];
      if (g && Math.abs(g[0].y - t.y) <= 3) g.push(t); else grupos.push([t]);
    }
    grupos.forEach(g => out.push(g.sort((a, b) => a.x - b.x).map(t => t.s).join(' ')));
  }
  return out;
}

/** Número no formato brasileiro: "4.688" = 4688, "1.000" = 1000, "10,5" = 10,5. */
function numeroBR(s: string) {
  const t = s.replace(/\*/g, '').trim();
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(t)) return Number(t.replace(/\./g, '').replace(',', '.'));
  if (/^\d+(,\d+)?$/.test(t)) return Number(t.replace(',', '.'));
  if (/^\d+\.\d{1,2}$/.test(t)) return Number(t);
  return NaN;
}
const numeroCabecalho = (s: string) => numeroBR(s.replace(/\s/g, ''));

export type Conferir = { cm: number; litros: number; esperado: number };
export type TabelaLida = {
  pontos: Ponto[];
  capacidade: number | null; diametro_cm: number | null; comprimento_m: number | null;
  /** Identificação do tanque no arquivo (ex.: "NEV09") e da filial (ex.: "06"), se aparecerem. */
  tanqueNoArquivo: string | null; filialNoArquivo: string | null;
  /** Alturas repetidas com volumes diferentes (fica o primeiro) e volumes que não crescem com a altura (ignorados). */
  repetidos: number[]; foraDeOrdem: number[];
};

/**
 * Lê a tabela das linhas do arquivo. Linhas só de números trazem pares "altura volume" lado a lado
 * (ex.: "1 10 65 4.688 129 11.222"); "*" e "—" são ignorados. O cabeçalho dá capacidade, diâmetro e comprimento.
 */
export function lerTabela(linhas: string[]): TabelaLida {
  const texto = linhas.join('\n');
  const mapa = new Map<number, number>();
  const repetidos: number[] = [];
  for (const linha of linhas) {
    if (!/\d/.test(linha) || !/^[\d\s.,*—–-]+$/.test(linha)) continue;
    const tokens = linha.split(/\s+/).filter(x => x && !/^\*+$/.test(x));
    if (tokens.length < 2 || tokens.length % 2) continue;
    for (let i = 0; i < tokens.length; i += 2) {
      const cm = numeroBR(tokens[i]), l = numeroBR(tokens[i + 1]);
      if (!Number.isFinite(cm) || !Number.isFinite(l) || cm <= 0 || cm > 500 || l < 0) continue;
      const ja = mapa.get(cm);
      if (ja === undefined) mapa.set(cm, l); else if (ja !== l) repetidos.push(cm);
    }
  }
  const pontos: Ponto[] = [];
  const foraDeOrdem: number[] = [];
  for (const [cm, l] of [...mapa.entries()].sort((a, b) => a[0] - b[0])) {
    if (pontos.length && l <= pontos[pontos.length - 1][1]) { foraDeOrdem.push(cm); continue; }
    pontos.push([cm, l]);
  }
  const achar = (re: RegExp) => { const m = re.exec(texto); return m ? m[1] : null; };
  const cap = achar(/capacidade(?:\s+nominal)?\s*:?\s*([\d.]+)/i);
  const diam = /di[âa]metro[^\d\n]*([\d.,]+)\s*(cm|m)\b/i.exec(texto);
  const comp = achar(/comprimento[^\d\n]*([\d.,]+)\s*m\b/i);
  const diametro = diam ? numeroCabecalho(diam[1]) * (diam[2].toLowerCase() === 'm' ? 100 : 1) : NaN;
  return {
    pontos,
    capacidade: cap && Number.isFinite(numeroCabecalho(cap)) ? numeroCabecalho(cap) : null,
    diametro_cm: Number.isFinite(diametro) ? Math.round(diametro) : null,
    comprimento_m: comp && Number.isFinite(numeroCabecalho(comp)) ? numeroCabecalho(comp) : null,
    tanqueNoArquivo: achar(/tanque\s+([a-z]+[a-z0-9-]*\d+)\b/i)?.toUpperCase() ?? null,
    filialNoArquivo: achar(/filial\s*:?\s*(\d+)/i),
    repetidos, foraDeOrdem,
  };
}

/* ---------- Documento da filial (tanques + tabelas, mesmo layout em todas as filiais) ---------- */

export type TipoFisico = 'simples' | 'bipartido' | 'tripartido';
export type TanqueLido = { numero: string; combustivelTexto: string; capacidade: number | null };
export type SecaoLida = {
  /** Ex.: "ARXO 10.000 L · Tripartido (10/10/10)". */
  nome: string; modelo: string; tipo: TipoFisico; particao: string;
  tanques: TanqueLido[];
  tabela: TabelaLida;
};
export type DocumentoLido = { filial: string | null; secoes: SecaoLida[] };

const CABECALHO = /^\s*FILIAL\s+(\d+)\s*[—–-]*\s*TANQUES?\s+[\dA-Z,\s]+?\s*\(([^)]+)\)/i;

/**
 * Lê o documento padrão da filial: uma seção por tanque físico, cada uma com
 * "FILIAL 03 — TANQUES 3, 4 E 5 (ARXO 10.000 L)", o tipo ("TRIPARTIDO (10/10/10)"),
 * "Tanques: Tq. 3 Gas. Comum (10.000 L) • Tq. 4 …", "Dimensões: Ø Int. = 2.549 mm • Comp. = 1.995,8 mm",
 * "Vol. Máx. (254 cm): 10.181 L" e a tabela (pares cm/litros lado a lado, que podem continuar na página seguinte).
 * Sem esse layout, devolve `null` (o PDF é lido como uma tabela só).
 */
export function lerDocumentoFilial(linhas: string[]): DocumentoLido | null {
  const inicios = linhas.map((l, i) => (CABECALHO.test(l) ? i : -1)).filter(i => i >= 0);
  if (!inicios.length) return null;
  let filial: string | null = null;
  const secoes: SecaoLida[] = [];
  inicios.forEach((ini, k) => {
    const bloco = linhas.slice(ini, inicios[k + 1] ?? linhas.length);
    const texto = bloco.filter(l => !/^[\d\s.,*—–-]+$/.test(l)).join(' ').replace(/\s+/g, ' ');
    const cab = CABECALHO.exec(bloco[0])!;
    filial ??= cab[1];
    const modelo = cab[2].trim();
    const tp = /\b(SIMPLES|BIPARTIDO|TRIPARTIDO)\b\s*(?:\(([\d\s/]+)\))?/i.exec(texto);
    const tipo = (tp?.[1].toLowerCase() ?? 'simples') as TipoFisico;
    const particao = tp?.[2]?.replace(/\s/g, '') ?? '';
    // Só a lista "Tanques: Tq. 3 … (10.000 L) • Tq. 4 …" (a nota técnica também cita os tanques, sem "Tq.").
    const lista = /Tanques\s*:(.*?)(?:Dimens|Vol\.|$)/i.exec(texto)?.[1] ?? texto;
    const tanques: TanqueLido[] = [];
    for (const m of lista.matchAll(/Tq\.?\s*(\d+[A-Z]?)\s+([^(•]+?)\s*\(\s*([\d.]+)\s*L\b/gi)) {
      if (tanques.some(x => x.numero === m[1])) continue;
      const cap = numeroBR(m[3]);
      tanques.push({ numero: m[1], combustivelTexto: m[2].trim(), capacidade: Number.isFinite(cap) ? cap : null });
    }
    const tabela = lerTabela(bloco);
    const diam = /Ø\s*(?:Int\.?)?\s*=?\s*([\d.,]+)\s*mm/i.exec(texto);
    const comp = /Comp\.?\s*=?\s*([\d.,]+)\s*mm/i.exec(texto);
    const max = /Vol\.?\s*M[áa]x\.?\s*\(\s*(\d+(?:,\d+)?)\s*cm\s*\)/i.exec(texto);
    const ultimo = tabela.pontos[tabela.pontos.length - 1]?.[0] ?? null;
    const alturaMax = max ? numeroBR(max[1]) : NaN;
    const diamMm = diam ? numeroBR(diam[1]) : NaN;
    tabela.diametro_cm = Number.isFinite(alturaMax) ? alturaMax : Number.isFinite(diamMm) ? Math.round(diamMm / 10) : ultimo;
    const compMm = comp ? numeroBR(comp[1]) : NaN;
    if (Number.isFinite(compMm)) tabela.comprimento_m = Math.round(compMm * 10) / 10000;
    const nominal = numeroBR(/([\d.]+)\s*L\b/i.exec(modelo)?.[1] ?? '');
    tabela.capacidade = Number.isFinite(nominal) ? nominal : tabela.capacidade;
    const nomeTipo = tipo === 'simples' ? '' : ` · ${tipo[0].toUpperCase()}${tipo.slice(1)}${particao ? ` (${particao})` : ''}`;
    if (tanques.length || tabela.pontos.length) secoes.push({ nome: `${modelo}${nomeTipo}`, modelo, tipo, particao, tanques, tabela });
  });
  return secoes.some(x => x.tanques.length) ? { filial, secoes } : null;
}

/** Combustível do cadastro pelo nome no documento ("Gas. Comum" → Gasolina comum, "Diesel Comum" → Diesel S500). */
export function acharCombustivel(texto: string, combustiveis: { id: string; nome: string; ativo?: boolean }[]): string {
  const limpar = (x: string) => x.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/\bgas\b\.?/g, 'gasolina').replace(/\bgasol\b\.?/g, 'gasolina').replace(/\bet\b\.?/g, 'etanol').replace(/\badit\b\.?/g, 'aditivada')
    .replace(/\bs[\s-]*(10|500)\b/g, 's$1').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  let alvo = limpar(texto);
  if (alvo === 'diesel comum') alvo = 'diesel s500';
  if (alvo === 'gasolina') alvo = 'gasolina comum';
  if (alvo === 'etanol comum' || alvo === 'alcool') alvo = 'etanol';
  const lista = combustiveis.filter(c => c.ativo !== false);
  const exato = lista.find(c => limpar(c.nome) === alvo);
  if (exato) return exato.id;
  // Todas as palavras do documento no nome do cadastro (o mais curto primeiro: "Diesel aditivado" antes de outros).
  const pal = alvo.split(' ').filter(Boolean);
  const cand = lista.filter(c => { const n = limpar(c.nome).split(' '); return pal.every(w => n.includes(w.replace(/o$/, '')) || n.includes(w) || n.some(x => x.startsWith(w))); })
    .sort((a, b) => a.nome.length - b.nome.length);
  return cand[0]?.id ?? '';
}

/**
 * Pontos fora da curva (provável erro de digitação/leitura): compara cada volume com o previsto pelos dois
 * vizinhos de cada lado (interpolação cúbica). Só onde a tabela vai de 1 em 1 cm.
 */
export function pontosParaConferir(pontos: Ponto[]): Conferir[] {
  const out: Conferir[] = [];
  // Perto das pontas (2º e penúltimo pontos) só há um vizinho de cada lado: compara com a média deles.
  for (const i of [1, pontos.length - 2]) {
    if (i < 1 || i > pontos.length - 2) continue;
    const [b, c, d] = [pontos[i - 1], pontos[i], pontos[i + 1]];
    if (c[0] - b[0] !== d[0] - c[0]) continue;
    const esperado = (b[1] + d[1]) / 2;
    if (Math.abs(c[1] - esperado) > Math.max(4, 0.25 * (d[1] - b[1]))) out.push({ cm: c[0], litros: c[1], esperado: Math.round(esperado) });
  }
  for (let i = 2; i < pontos.length - 2; i++) {
    const [a, b, c, d, e] = [pontos[i - 2], pontos[i - 1], pontos[i], pontos[i + 1], pontos[i + 2]];
    const passo = c[0] - b[0];
    if (b[0] - a[0] !== passo || d[0] - c[0] !== passo || e[0] - d[0] !== passo) continue;
    const esperado = (-a[1] + 4 * b[1] + 4 * d[1] - e[1]) / 6;
    const incremento = (d[1] - b[1]) / 2;
    if (Math.abs(c[1] - esperado) > Math.max(4, 0.06 * incremento)) out.push({ cm: c[0], litros: c[1], esperado: Math.round(esperado) });
  }
  // Um valor errado também desvia a previsão dos vizinhos: em alturas seguidas, fica só o que mais foge da curva
  // (corrigido esse, a tabela é conferida de novo).
  const desvio = (x: Conferir) => Math.abs(x.litros - x.esperado);
  return out.filter((x, i) => {
    let j = i;
    const grupo: Conferir[] = [x];
    while (j > 0 && out[j - 1].cm >= out[j].cm - 2) grupo.unshift(out[--j]);
    j = i;
    while (j < out.length - 1 && out[j + 1].cm <= out[j].cm + 2) grupo.push(out[++j]);
    return grupo.every(y => y === x || desvio(y) < desvio(x) || (desvio(y) === desvio(x) && y.cm > x.cm));
  });
}

/* ---------- Impressão da tabela ---------- */
const AZUL = '#0f1f3d';
const fmt = (v: number) => v.toLocaleString('pt-BR');
export function htmlTabela(t: TabelaArqueacao, filialNome: string) {
  const conferir = new Set(pontosParaConferir(t.pontos).map(x => x.cm));
  const porColuna = Math.ceil(t.pontos.length / 4);
  const colunas = Array.from({ length: 4 }, (_, k) => t.pontos.slice(k * porColuna, (k + 1) * porColuna));
  const linhas = Array.from({ length: porColuna }, (_, i) => colunas.map(c => c[i] ? `<td class="c">${fmt(c[i][0])}</td><td class="n${conferir.has(c[i][0]) ? ' x' : ''}">${fmt(c[i][1])}</td>` : '<td></td><td></td>').join('')).map(l => `<tr>${l}</tr>`).join('');
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Tabela de arqueação · ${esc(t.nome)}</title><style>
@page{size:A4;margin:10mm}body{font:10.5px Arial,sans-serif;color:#1b2230;margin:0}h1{font-size:16px;margin:0 0 2px;color:${AZUL}}.sub{color:#5b6475;margin-bottom:8px}
table{width:100%;border-collapse:collapse}th{background:${AZUL};color:#fff;padding:3px 4px;font-size:9.5px}td{border-bottom:1px solid #e3e6ec;padding:1.5px 4px}
.c{text-align:center;font-weight:700;color:#5b6475}.n{text-align:right;font-variant-numeric:tabular-nums}.x{background:#fff3c4;font-weight:700}.nota{color:#5b6475;font-size:9.5px;margin-top:6px}</style></head><body>
<h1>Tabela de arqueação · ${esc(t.nome)}</h1>
<div class="sub">${esc(filialNome)} · Tanque${t.tanques.length === 1 ? '' : 's'} ${esc(t.tanques.join(', ') || '—')}${t.capacidade ? ` · Capacidade nominal ${fmt(t.capacidade)} L` : ''}${t.diametro_cm ? ` · Diâmetro ${fmt(t.diametro_cm)} cm` : ''}${t.comprimento_m ? ` · Comprimento ${String(t.comprimento_m).replace('.', ',')} m` : ''} · Volume total ${fmt(volumeTotal(t))} L</div>
<table><tr>${'<th>Alt. (cm)</th><th>Volume (L)</th>'.repeat(4)}</tr>${linhas}</table>
${conferir.size ? '<p class="nota">Valores destacados fogem da curva dos vizinhos: confira com a tabela original.</p>' : ''}
<p class="nota">Entre dois centímetros o volume é calculado em linha reta. Arquivo de origem: ${esc(t.arquivo || '—')}.</p>
</body></html>`;
}
