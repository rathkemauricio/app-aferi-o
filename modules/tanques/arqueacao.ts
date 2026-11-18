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

/* ---------- Documento da filial (tanques + tabelas) ---------- */

export type TipoFisico = 'simples' | 'bipartido' | 'tripartido';
/** Ligação de pista: bomba (com o modelo) e os bicos dela que puxam deste tanque. */
export type Ligacao = { bomba: string; modelo: string; bicos: string[] };
export type TanqueLido = { numero: string; combustivelTexto: string; capacidade: number | null; modelo?: string; ligacoes?: Ligacao[] };
export type SecaoLida = {
  /** Nome da tabela (ex.: "ARXO 10.000 L · Tripartido (10/10/10)"). */
  nome: string; modelo: string; tipo: TipoFisico; particao: string;
  tanques: TanqueLido[];
  tabela: TabelaLida;
};
export type DocumentoLido = { filial: string | null; secoes: SecaoLida[] };

/** "FILIAL 03 — TANQUES 3, 4 E 5 (ARXO 10.000 L)" (layout com a marca/modelo entre parênteses). */
const CABECALHO = /^\s*FILIAL\s+(\d+)\s*[—–-]*\s*TANQUES?\s+[\dA-Z,\s]+?\s*\(([^)]+)\)/i;
const RODAPE = /\b(page|p[áa]gina)\s+\d+\s+(of|de)\s+\d+\b/i;
/** Números de tanque citados: "TANQUES 1, 2, 4 E 8", "TANQUE 7:", "Tq. 3", "TQ. 1, 2" (não pega "Tanque 30.000 L"). */
const NUMEROS_TANQUE = /\bT(?:Q|ANQUES?)\.?\s*(\d+[A-Z]?(?![.\d])(?:\s*(?:,|\be\b|\/)\s*\d+[A-Z]?(?![.\d]))*)(?!\s*(?:L|LTS|LITROS)\b)/gi;
const ehDado = (l: string) => /\d/.test(l) && /^[\d\s.,*—–-]+$/.test(l) && l.split(/\s+/).filter(x => /\d/.test(x)).length >= 2;
const tituloLimpo = (l: string) => l.replace(/\s+/g, ' ').trim();

function numerosDeTanque(linha: string): string[] {
  const out: string[] = [];
  for (const m of linha.matchAll(NUMEROS_TANQUE)) {
    for (const n of m[1].split(/\s*(?:,|\be\b|\/)\s*/i)) if (n.trim() && !out.includes(n.trim().toUpperCase())) out.push(n.trim().toUpperCase());
  }
  return out;
}
/**
 * Ligações de pista no texto: "Bomba 6 (Wayne 3B2201P): Bico 1", "Bomba 1 (…): Bico 3 • Bomba 6 (…): Bico 5",
 * "Bomba 4 (Wayne 3B2203P) — Bicos 6, 8 e 9".
 */
export function lerLigacoes(texto: string): Ligacao[] {
  const out: Ligacao[] = [];
  const re = /Bomba\s+(\d+[A-Z]?)\s*(?:\(([^)]*)\))?\s*[:—–-]?\s*Bicos?\s+(\d+(?:\s*(?:,|\be\b)\s*\d+)*)/gi;
  for (const m of texto.matchAll(re)) {
    const bicos = m[3].split(/\s*(?:,|\be\b)\s*/i).map(x => x.trim()).filter(Boolean);
    const ja = out.find(x => x.bomba === m[1]);
    if (ja) bicos.forEach(b => { if (!ja.bicos.includes(b)) ja.bicos.push(b); });
    else out.push({ bomba: m[1], modelo: (m[2] ?? '').trim(), bicos });
  }
  return out;
}
const juntarLigacoes = (a: Ligacao[] = [], b: Ligacao[] = []) => {
  const out = a.map(x => ({ ...x, bicos: [...x.bicos] }));
  for (const l of b) {
    const ja = out.find(x => x.bomba === l.bomba);
    if (ja) { l.bicos.forEach(n => { if (!ja.bicos.includes(n)) ja.bicos.push(n); }); if (!ja.modelo) ja.modelo = l.modelo; } else out.push({ ...l, bicos: [...l.bicos] });
  }
  return out;
};

/** Medida com unidade em cm ("2,549 m", "2.549 mm", "254,9 cm"). */
function medidaCm(valor: string, unidade: string) {
  const v = numeroBR(valor);
  if (!Number.isFinite(v)) return NaN;
  return unidade.toLowerCase() === 'mm' ? v / 10 : unidade.toLowerCase() === 'm' ? v * 100 : v;
}

/**
 * Tabela de cadastro em colunas ("Tanque | Combustível | Capacidade | Tabela … | Ligações"), lida pela posição de cada
 * texto na página (as células quebram em várias linhas). Devolve os tanques com combustível, capacidade e modelo.
 */
function cadastroEmColunas(paginas: Texto[][]): TanqueLido[] {
  const out: TanqueLido[] = [];
  for (const textos of paginas) {
    const cab = textos.find(t => /^tanques?$/i.test(t.s) && textos.some(o => Math.abs(o.y - t.y) <= 3 && /^combust/i.test(o.s)));
    if (!cab) continue;
    const colunas = textos.filter(o => Math.abs(o.y - cab.y) <= 3 && o.x >= cab.x - 2).sort((a, b) => a.x - b.x);
    const col = (t: Texto) => { let c = -1; colunas.forEach((h, i) => { if (t.x >= h.x - 4) c = i; }); return c; };
    const iComb = colunas.findIndex(h => /^combust/i.test(h.s));
    const iCap = colunas.findIndex(h => /^capac/i.test(h.s));
    const iTab = colunas.findIndex(h => /^tabela/i.test(h.s));
    const iMod = colunas.findIndex(h => /^(modelo|marca)/i.test(h.s));
    const iLig = colunas.findIndex(h => /^(esquema|liga)/i.test(h.s));
    const marca = iTab >= 0 ? colunas[iTab].s.replace(/^tabela\s*/i, '').trim() : '';
    const abaixo = textos.filter(t => t.y < cab.y - 3);
    // Início de cada linha: "Tanque" na 1ª coluna (o PDF pode partir a palavra em pedaços, ex.: "T" + "anque 1").
    const primeira = abaixo.filter(t => col(t) === 0).sort((a, b) => b.y - a.y || a.x - b.x);
    const inicios = primeira.filter((t, i) => {
      if (i > 0 && Math.abs(primeira[i - 1].y - t.y) <= 1.5) return false;
      const linha = primeira.filter(o => Math.abs(o.y - t.y) <= 1.5).map(o => o.s).join('').replace(/\s+/g, '');
      return /^tanque/i.test(linha);
    });
    inicios.forEach((ini, k) => {
      const prox = inicios[k + 1];
      const altura = prox ? ini.y - prox.y : (k > 0 ? inicios[k - 1].y - ini.y : 40);
      const naLinha = abaixo.filter(t => t.y <= ini.y + 4 && t.y > ini.y - altura + 2);
      const celula = (i: number) => naLinha.filter(t => col(t) === i).sort((a, b) => b.y - a.y || a.x - b.x).map(t => t.s).join(' ').replace(/\s+/g, ' ').trim();
      const numero = /(\d+[A-Z]?)\s*$/i.exec(celula(0).replace(/\s+/g, ''))?.[1]?.toUpperCase();
      if (!numero || out.some(x => x.numero === numero)) return;
      const cap = /([\d.]+)\s*(?:L|LTS|litros)\b/i.exec(iCap >= 0 ? celula(iCap) : '')?.[1];
      const tab = iTab >= 0 ? celula(iTab).replace(/\((?:esta\s+)?p[áa]gina[^)]*\)/gi, '').replace(/\s+/g, ' ').trim() : '';
      out.push({
        numero, combustivelTexto: iComb >= 0 ? celula(iComb) : '', capacidade: cap ? numeroBR(cap) : null,
        modelo: (iMod >= 0 ? celula(iMod) : [marca, tab].filter(Boolean).join(' ')) || undefined,
        ligacoes: iLig >= 0 ? lerLigacoes(celula(iLig)) : undefined,
      });
    });
  }
  return out;
}

/**
 * Lê o documento da filial (tanques + tabelas). Funciona com layouts diferentes:
 * - cada tabela de medição é reconhecida pelo título logo acima dela, que diz quais tanques ela atende
 *   ("… (TANQUES 1, 2, 4 E 8)", "… TANQUE 7: …", "Tanques: Tq. 3 … • Tq. 4 …"); títulos repetidos no alto da página
 *   seguinte continuam a mesma tabela;
 * - os dados de cada tanque (combustível e capacidade) vêm de "Tq. 3 Gas. Comum (10.000 L)",
 *   "Tanque 7 — Óleo Diesel B S10 (30.000 L)" ou da tabela de cadastro em colunas;
 * - "FILIAL 03 — TANQUES 3, 4 E 5 (ARXO 10.000 L)" e "TRIPARTIDO (10/10/10)" dão marca/modelo e tipo;
 *   "Tabela: …" (PDF exportado pelo sistema) dá o nome da tabela.
 * Sem tabela ligada a tanques, devolve `null` (o PDF é lido como uma tabela só).
 */
export function lerDocumentoFilial(linhas: string[], paginas: Texto[][] = []): DocumentoLido | null {
  type Bloco = { titulo: string; preambulo: string[]; dados: string[] };
  const blocos: Bloco[] = [];
  let preambulo: string[] = [];
  let atual: Bloco | null = null;
  for (const l of linhas) {
    if (RODAPE.test(l)) continue;
    if (!ehDado(l)) { preambulo.push(l); continue; }
    const titulos = preambulo.filter(x => numerosDeTanque(x).length);
    const titulo = titulos.length ? tituloLimpo(titulos[titulos.length - 1]) : null;
    if (!atual || (titulo !== null && titulo !== atual.titulo)) {
      // O cabeçalho da tabela começa no último título "FILIAL …" (antes dele vêm notas da tabela anterior).
      const ini = preambulo.reduce((k, x, i) => (/^\s*FILIAL\s+\d+\s*[—–-]/i.test(x) ? i : k), 0);
      atual = { titulo: titulo ?? '', preambulo: preambulo.slice(ini), dados: [] };
      blocos.push(atual);
    }
    atual.dados.push(l);
    preambulo = [];
  }
  const texto = linhas.join('\n');
  const filial = /FILIAL\s*:?\s*(\d+)/i.exec(texto)?.[1] ?? null;

  // Dados de cada tanque, de onde aparecerem no documento.
  const info = new Map<string, TanqueLido>();
  const juntar = (t: TanqueLido) => {
    const ja = info.get(t.numero);
    info.set(t.numero, {
      numero: t.numero, combustivelTexto: ja?.combustivelTexto || t.combustivelTexto,
      capacidade: ja?.capacidade ?? t.capacidade, modelo: ja?.modelo ?? t.modelo, ligacoes: juntarLigacoes(ja?.ligacoes, t.ligacoes),
    });
  };
  cadastroEmColunas(paginas).forEach(juntar);
  for (const l of linhas) {
    for (const m of l.matchAll(/Tq\.?\s*(\d+[A-Z]?)\s+([^(•]+?)\s*\(\s*([\d.]+)\s*L\b/gi)) {
      juntar({ numero: m[1].toUpperCase(), combustivelTexto: m[2].trim(), capacidade: numeroBR(m[3]) });
    }
    const id = /Tanque\s+(\d+[A-Z]?)\s*[—–-]\s*([^(]+?)\s*\(\s*([\d.]+)\s*L\b/i.exec(l);
    if (id) juntar({ numero: id[1].toUpperCase(), combustivelTexto: id[2].trim(), capacidade: numeroBR(id[3]) });
  }

  const secoes: SecaoLida[] = [];
  for (const b of blocos) {
    const numeros = numerosDeTanque(b.titulo);
    const tabela = lerTabela(b.dados);
    if (!numeros.length || tabela.pontos.length < 10) continue;
    // "Ligações de Pista: Bomba 4 (…) — Bicos 6, 8 e 9" no cabeçalho de uma tabela de um tanque só.
    if (numeros.length === 1) {
      const lig = lerLigacoes(b.preambulo.filter(x => /liga[çc][õo]es/i.test(x)).join(' '));
      if (lig.length) { const x = info.get(numeros[0]); info.set(numeros[0], { numero: numeros[0], combustivelTexto: x?.combustivelTexto ?? '', capacidade: x?.capacidade ?? null, modelo: x?.modelo, ligacoes: juntarLigacoes(x?.ligacoes, lig) }); }
    }
    const pre = b.preambulo.join(' ').replace(/\s+/g, ' ');
    const cab = b.preambulo.map(x => CABECALHO.exec(x)).find(Boolean);
    const tp = /\b(BIPARTIDO|TRIPARTIDO)\b\s*(?:\(([\d\s/]+)\))?/i.exec(pre);
    const tipo = (tp?.[1].toLowerCase() ?? 'simples') as TipoFisico;
    const particao = tp?.[2]?.replace(/\s/g, '') ?? '';
    const nomeTabela = /(?:^|\s)Tabela\s*:\s*(.+?)\s*$/i.exec(b.preambulo.find(x => /^\s*Tabela\s*:/i.test(x)) ?? '')?.[1];
    const modelo = cab?.[2].trim() ?? '';
    const nomeTipo = tipo === 'simples' ? '' : ` · ${tipo[0].toUpperCase()}${tipo.slice(1)}${particao ? ` (${particao})` : ''}`;
    const nome = nomeTabela
      ?? (modelo ? `${modelo}${nomeTipo}` : b.titulo.replace(/\(\s*TANQUES?\b[^)]*\)/gi, '').replace(/^FILIAL\s+\d+\s*[—–-]\s*/i, '').replace(/\s+/g, ' ').trim());
    // Medidas: altura máxima = última altura da tabela (ou "Vol. Máx. (254 cm)"); comprimento do cabeçalho.
    const max = /Vol\.?\s*M[áa]x\.?\s*\(\s*(\d+(?:,\d+)?)\s*cm\s*\)/i.exec(pre);
    const ultimo = tabela.pontos[tabela.pontos.length - 1]?.[0] ?? null;
    const diam = /(?:Ø|∅)\s*(?:Int\.?)?\s*=?\s*([\d.,]+)\s*(mm|cm|m)\b/i.exec(pre);
    const alturaMax = max ? numeroBR(max[1]) : NaN;
    const diamCm = diam ? medidaCm(diam[1], diam[2]) : NaN;
    tabela.diametro_cm = Number.isFinite(alturaMax) ? alturaMax : ultimo ?? (Number.isFinite(diamCm) ? Math.round(diamCm * 10) / 10 : null);
    const comp = /\b(?:Comp\.?|C)\s*=\s*([\d.,]+)\s*(mm|cm|m)\b/i.exec(pre);
    const compCm = comp ? medidaCm(comp[1], comp[2]) : NaN;
    if (Number.isFinite(compCm)) tabela.comprimento_m = Math.round(compCm * 100) / 10000;
    const nominal = numeroBR(/([\d.]+)\s*(?:L|LTS|litros)\b/i.exec(modelo || b.titulo)?.[1] ?? /capacidade\s+nominal\s*:?\s*([\d.]+)/i.exec(pre)?.[1] ?? '');
    tabela.capacidade = Number.isFinite(nominal) ? nominal : tabela.capacidade;
    const tanques = numeros.map(n => {
      const x = info.get(n);
      return { numero: n, combustivelTexto: x?.combustivelTexto ?? '', capacidade: x?.capacidade ?? null, modelo: modelo || x?.modelo || undefined, ligacoes: x?.ligacoes ?? [] };
    });
    secoes.push({ nome, modelo, tipo, particao, tanques, tabela });
  }
  return secoes.length ? { filial, secoes } : null;
}

/** Combustível do cadastro pelo nome no documento ("Gas. Comum" → Gasolina comum, "Óleo Diesel B S500" → Diesel S500). */
export function acharCombustivel(texto: string, combustiveis: { id: string; nome: string; ativo?: boolean }[]): string {
  const limpar = (x: string) => x.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/\bgas\b\.?/g, 'gasolina').replace(/\bgasol\b\.?/g, 'gasolina').replace(/\bet\b\.?/g, 'etanol').replace(/\badit\b\.?/g, 'aditivada')
    .replace(/\boleo\b/g, ' ').replace(/\bdiesel\s+b\b/g, 'diesel').replace(/\bgasolina\s+c\b/g, 'gasolina').replace(/\betanol\s+(?:hidratado|comum)\b/g, 'etanol')
    .replace(/\bs[\s-]*(10|500)\b/g, 's$1').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  let alvo = limpar(texto);
  if (alvo === 'diesel comum') alvo = 'diesel s500';
  if (alvo === 'gasolina') alvo = 'gasolina comum';
  if (alvo === 'alcool') alvo = 'etanol';
  const lista = combustiveis.filter(c => c.ativo !== false);
  const exato = lista.find(c => limpar(c.nome) === alvo);
  if (exato) return exato.id;
  // Todas as palavras do documento no nome do cadastro (o nome mais curto primeiro).
  const pal = alvo.split(' ').filter(Boolean);
  if (!pal.length) return '';
  const cand = lista.filter(c => { const n = limpar(c.nome).split(' '); return pal.every(w => n.includes(w) || n.some(x => x.startsWith(w))); })
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
