import AsyncStorage from '@react-native-async-storage/async-storage';
import * as DocumentPicker from 'expo-document-picker';
import { useEffect, useMemo, useState } from 'react';
import { Platform } from 'react-native';
import { useFiliais } from '../../lib/data';
import { supabase } from '../../lib/supabase';
import { Collection, combinedStatus, useCollection } from '../../lib/sync';
import type { ItemBarras } from './barras';
import { type BaseBarras, type Classe, type ClasseCategoria, type Coleta, type Contagem, horaAgora, type Inventario, type Produto, type Rodada } from './model';

/* ---------- Coleções sincronizadas ---------- */
export const inventariosCol = new Collection<Inventario>({ table: 'ce_inventarios', storageKey: 'nevoeiro.coleta.inventarios.v1' });
export const contagensCol = new Collection<Contagem>({ table: 'ce_contagens', storageKey: 'nevoeiro.coleta.contagens.v1' });
/** Situação da base de códigos de barra de cada filial (gravada só pela Edge Function). */
export const basesCol = new Collection<BaseBarras>({ table: 'ce_bases', storageKey: 'nevoeiro.coleta.bases.v1' });
/** Pista × Conveniência de cada categoria, escolhida pelo usuário (vale para a rede e os próximos inventários). */
export const classesCol = new Collection<ClasseCategoria>({ table: 'ce_classes', storageKey: 'nevoeiro.coleta.classes.v1' });

/** Classificação escolhida de cada categoria (nome → classe). */
export function useClassesEscolhidas() {
  const snap = useCollection(classesCol);
  return useMemo(() => new Map(snap.list.map(x => [x.categoria || x.id, x.classe] as const)), [snap.list]);
}
/** Grava a classificação de uma categoria (Pista ou Conveniência). */
export const escolherClasse = (categoria: string, classe: Classe) => classesCol.put({ id: categoria, categoria, classe });

/** Leituras: uma coleção por inventário (só baixa as do inventário aberto). */
const coletasPorInv = new Map<string, Collection<Coleta>>();
export function coletasDe(inventarioId: string) {
  let c = coletasPorInv.get(inventarioId);
  if (!c) {
    c = new Collection<Coleta>({ table: 'ce_coletas', storageKey: `nevoeiro.coleta.coletas.${inventarioId}`, filter: q => q.eq('inventario_id', inventarioId) });
    coletasPorInv.set(inventarioId, c);
  }
  return c;
}

export function useColeta() {
  const f = useFiliais();
  const i = useCollection(inventariosCol);
  const c = useCollection(contagensCol);
  const b = useCollection(basesCol);
  const inventarios = useMemo(() => [...i.list].sort((a, b) => (a.status === 'encerrado' ? 1 : 0) - (b.status === 'encerrado' ? 1 : 0) || b.codigo.localeCompare(a.codigo)), [i.list]);
  const bases = useMemo(() => new Map(b.list.map(x => [x.id, x])), [b.list]);
  return { filiais: f.filiais, inventarios, contagens: c.list, bases, loaded: f.loaded && i.loaded && c.loaded && b.loaded, status: combinedStatus([f.status, i.status, c.status, b.status]) };
}

export function useColetas(inventarioId: string) {
  const col = coletasDe(inventarioId);
  const snap = useCollection(col);
  useEffect(() => { void col.sync(); const t = setInterval(() => { void col.sync(); }, 20_000); return () => clearInterval(t); }, [col]);
  return snap;
}

/* ---------- Aparelho (cada coletor grava só as próprias linhas) ---------- */
let dispositivo: string | null = null;
const DISP_KEY = 'nevoeiro.coleta.dispositivo';
export async function idDispositivo() {
  if (dispositivo) return dispositivo;
  dispositivo = (await AsyncStorage.getItem(DISP_KEY).catch(() => null)) ?? `d${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  void AsyncStorage.setItem(DISP_KEY, dispositivo).catch(() => undefined);
  return dispositivo;
}
void idDispositivo();

/** Soma `qtd` à leitura deste aparelho para o item na rodada (negativo corrige). */
export async function registrarLeitura(c: Contagem, r: Rodada, codigo: string, qtd: number) {
  const disp = await idDispositivo();
  const col = coletasDe(c.inventario_id);
  const id = `${c.id}:${r}:${codigo}:${disp}`;
  const atual = col.get(id);
  col.put({
    id, inventario_id: c.inventario_id, contagem_id: c.id, rodada: r, codigo, dispositivo: disp,
    qtd: Math.max(0, (atual?.qtd ?? 0) + qtd), hist: ([[horaAgora(), qtd], ...(atual?.hist ?? [])] as [string, number][]).slice(0, 60),
  });
}

/* ---------- Produtos do inventário (congelados do ERP; ficam no aparelho para contar sem internet) ---------- */
type Compacto = [string, string[], string, string, 0 | 1, number, (number | null)?, (number | null)?]; // codigo, eans, nome, categoria, pista?, saldo, custo, venda
const BLOCO = 2500;
const chaveProd = (inv: string) => `nevoeiro.coleta.produtos.${inv}`;
const memoria = new Map<string, Produto[]>();
const deCompacto = (x: Compacto): Produto => ({ codigo: x[0], eans: x[1], nome: x[2], categoria: x[3], classe: x[4] ? 'pista' : 'conveniencia', saldo: x[5], custo: x[6] ?? null, venda: x[7] ?? null });

async function lerCache(inv: string): Promise<Produto[] | null> {
  const n = Number(await AsyncStorage.getItem(`${chaveProd(inv)}.n`).catch(() => null));
  if (!n) return null;
  const partes = await Promise.all(Array.from({ length: n }, (_, i) => AsyncStorage.getItem(`${chaveProd(inv)}.${i}`)));
  if (partes.some(p => p === null)) return null;
  return partes.flatMap(p => (JSON.parse(p!) as Compacto[]).map(deCompacto));
}
async function gravarCache(inv: string, lista: Produto[]) {
  const comp: Compacto[] = lista.map(p => [p.codigo, p.eans, p.nome, p.categoria, p.classe === 'pista' ? 1 : 0, p.saldo, p.custo, p.venda]);
  const blocos = Array.from({ length: Math.ceil(comp.length / BLOCO) }, (_, i) => comp.slice(i * BLOCO, (i + 1) * BLOCO));
  await Promise.all(blocos.map((b, i) => AsyncStorage.setItem(`${chaveProd(inv)}.${i}`, JSON.stringify(b))));
  await AsyncStorage.setItem(`${chaveProd(inv)}.n`, String(blocos.length));
}

async function baixarProdutos(inv: string): Promise<Produto[]> {
  if (!supabase) return [];
  const out: Produto[] = [];
  for (let de = 0; ; de += 1000) {
    const { data, error } = await supabase.from('ce_produtos').select('codigo,eans,nome,categoria,classe,saldo,custo,preco_venda').eq('inventario_id', inv).order('codigo').range(de, de + 999);
    if (error) throw new Error('Não foi possível baixar os produtos do inventário. Confira a internet.');
    out.push(...(data ?? []).map(d => ({ codigo: String(d.codigo), eans: (d.eans as string[]) ?? [], nome: String(d.nome), categoria: String(d.categoria), classe: d.classe as Classe, saldo: Number(d.saldo), custo: d.custo === null ? null : Number(d.custo), venda: d.preco_venda === null ? null : Number(d.preco_venda) })));
    if (!data || data.length < 1000) break;
  }
  return out;
}

/** Produtos do inventário (memória → aparelho → servidor), fora de um componente (ex.: PDF pela Agenda). */
export async function carregarProdutos(inv: Inventario): Promise<Produto[]> {
  const completo = (x: Produto[] | null): x is Produto[] => !!x && x.filter(p => p.saldo !== 0).length === inv.itens_total;
  let l = memoria.get(inv.id) ?? null;
  if (!completo(l)) l = await lerCache(inv.id);
  if (!completo(l)) l = await baixarProdutos(inv.id);
  return l;
}

/** Produtos do inventário: memória → aparelho → servidor. */
export function useProdutos(inv: Inventario | undefined) {
  const [lista, setLista] = useState<Produto[] | null>(inv ? memoria.get(inv.id) ?? null : null);
  const [erro, setErro] = useState<string | null>(null);
  const chave = inv ? `${inv.id}:${inv.itens_total}:${inv.erp_em ?? ''}` : '';
  useEffect(() => {
    if (!inv || inv.status === 'carregando') { setLista(null); return; }
    if (!inv.erp_em) { setLista([]); setErro(null); return; } // aberto sem PDF: os saldos entram com a primeira contagem
    let vivo = true;
    void (async () => {
      try {
        let l = memoria.get(inv.id) ?? null;
        // itens_total = itens com saldo; a carga também traz os zerados da base de códigos de barra (saldo 0).
        const completo = (x: Produto[] | null): x is Produto[] => !!x && x.filter(p => p.saldo !== 0).length === inv.itens_total;
        if (!completo(l)) l = await lerCache(inv.id);
        if (!completo(l)) { l = await baixarProdutos(inv.id); await gravarCache(inv.id, l).catch(() => undefined); }
        memoria.set(inv.id, l);
        if (vivo) { setLista(l); setErro(null); }
      } catch (e) { if (vivo) setErro(e instanceof Error ? e.message : String(e)); }
    })();
    return () => { vivo = false; };
  }, [chave]); // eslint-disable-line react-hooks/exhaustive-deps
  // Códigos de barra cadastrados na coleta (em qualquer aparelho) entram nos itens sem baixar a carga de novo.
  const extras = inv?.eans_extra;
  const produtos = useMemo(() => {
    if (!lista || !extras || !Object.keys(extras).length) return lista;
    const por = new Map<string, string[]>();
    Object.entries(extras).forEach(([ean, cod]) => por.set(cod, [...(por.get(cod) ?? []), ean]));
    return lista.map(p => (por.has(p.codigo) ? { ...p, eans: [...new Set([...p.eans, ...por.get(p.codigo)!])] } : p));
  }, [lista, extras]);
  return { produtos, erro };
}

/**
 * Liga um código de barras lido na coleta (não cadastrado) a um item da carga. No servidor ele entra no item e na
 * base de códigos de barra em uso (vale para os próximos inventários); no inventário, sincroniza com os outros
 * aparelhos. Sem internet, vale só para este inventário (devolve 'local').
 */
export async function associarEan(inventarioId: string, codigo: string, ean: string): Promise<'servidor' | 'local'> {
  let onde: 'servidor' | 'local' = 'servidor';
  try {
    await chamar({ acao: 'associar_ean', inventario_id: inventarioId, codigo, ean });
  } catch (e) {
    const msg = e instanceof Error ? e.message : '';
    if (!/^(Não foi possível falar|Sem servidor)/.test(msg)) throw e; // recusado pelo servidor (ex.: código já é de outro item)
    onde = 'local';
  }
  const atual = inventariosCol.get(inventarioId);
  if (atual) inventariosCol.put({ ...atual, eans_extra: { ...(atual.eans_extra ?? {}), [ean]: codigo } });
  return onde;
}

/**
 * Índice de leitura: EAN ou código interno → produto. EANs também entram sem os zeros à esquerda
 * (ex.: 0708470220156 é lido como UPC-A 708470220156 por muitos coletores). O código interno tem prioridade.
 */
/**
 * Índice da leitura: código de barras (com e sem zeros à esquerda) e código interno → itens.
 * Um mesmo código de barras pode estar em mais de um item (ex.: código interno antigo e novo do mesmo produto
 * na relação do Petros): guarda todos e a coleta escolhe o que está na contagem (ver escolherItem).
 */
export type IndiceLeitura = Map<string, Produto[]>;
export function indiceLeitura(produtos: Produto[]): IndiceLeitura {
  const m: IndiceLeitura = new Map();
  const add = (k: string, p: Produto, primeiro = false) => {
    const l = m.get(k);
    if (!l) m.set(k, [p]);
    else if (!l.includes(p)) { if (primeiro) l.unshift(p); else l.push(p); }
  };
  produtos.forEach(p => p.eans.forEach(e => { add(e, p); const sem = e.replace(/^0+/, ''); if (sem && sem !== e) add(sem, p); }));
  produtos.forEach(p => add(p.codigo, p, true)); // código interno digitado vale antes de um código de barras igual
  return m;
}

/** Dígito verificador GTIN (EAN-8, UPC-A, EAN-13, DUN-14) para o corpo sem o dígito. */
export function digitoGtin(corpo: string) {
  const soma = corpo.split('').reverse().reduce((a, d, i) => a + Number(d) * (i % 2 === 0 ? 3 : 1), 0);
  return String((10 - (soma % 10)) % 10);
}

/**
 * Itens de um código lido, tolerando o jeito de cada leitor:
 * - zeros à esquerda (UPC-A de 12 dígitos × EAN-13 com 0; GTIN-14 com 0 na frente);
 * - prefixo/sufixo que alguns leitores mandam (ex.: "]E0", letras): tenta só os dígitos;
 * - leitor configurado sem o dígito verificador (7 ou 12 dígitos): tenta com o dígito calculado;
 * - DUN-14 impresso pelo Petros com 13 dígitos (pula o 13º).
 */
export function itensDoCodigo(indice: IndiceLeitura, bruto: string): Produto[] {
  const cod = bruto.trim();
  const dig = cod.replace(/\D/g, '');
  const tentativas: string[] = [];
  for (const c of [cod, dig]) {
    if (!c) continue;
    tentativas.push(c, c.replace(/^0+/, ''));
    if (/^\d{14}$/.test(c)) tentativas.push(c.slice(0, 12) + c.slice(13));
  }
  if (/^\d{7}$|^\d{12}$/.test(dig)) { const com = dig + digitoGtin(dig); tentativas.push(com, com.replace(/^0+/, '')); }
  for (const t of tentativas) { const l = t ? indice.get(t) : undefined; if (l?.length) return l; }
  return [];
}

/** Apaga do aparelho a cópia da lista carregada do arquivo (PDF de saldos) deste inventário. Os dados continuam no servidor. */
export async function apagarCopiaLocal(inv: string) {
  const n = Number(await AsyncStorage.getItem(`${chaveProd(inv)}.n`).catch(() => null)) || 0;
  await AsyncStorage.multiRemove([`${chaveProd(inv)}.n`, ...Array.from({ length: n }, (_, i) => `${chaveProd(inv)}.${i}`)]).catch(() => undefined);
}
/** Apaga as cópias locais de inventários que não estão abertos (encerrados, excluídos ou de outros aparelhos). */
export async function limparCopiasAntigas(abertos: Set<string>) {
  const prefixo = 'nevoeiro.coleta.produtos.';
  const chaves = await AsyncStorage.getAllKeys().catch(() => [] as readonly string[]);
  const invs = new Set(chaves.filter(k => k.startsWith(prefixo)).map(k => k.slice(prefixo.length).replace(/\.(n|\d+)$/, '')));
  for (const id of invs) if (!abertos.has(id)) await apagarCopiaLocal(id);
}
/** Envia ao servidor as coletas, contagens e o inventário. Devolve quantos registros ficaram pendentes (sem internet). */
export async function salvarNoServidor(inv: string) {
  const cols = [coletasDe(inv), contagensCol, inventariosCol] as const;
  await Promise.all(cols.map(c => c.flush().catch(() => undefined)));
  return cols.reduce((n, c) => n + c.getSnapshot().pending, 0);
}

/** Grava a base de códigos de barra da filial (lida no navegador por `lerPdfBarras`). */
export function gravarBarras(filialId: string, arquivo: string, itens: ItemBarras[]) {
  return chamar<{ ok: boolean; itens: number; eans: number; semEan: number }>({ acao: 'gravar_barras', filial_id: filialId, arquivo, itens });
}

/* ---------- ERP (Edge Function "coleta-erp") ---------- */
export type CargaErp = { itens: number; categorias: number; avisos: string[] };

export async function chamar<T>(body: Record<string, unknown>): Promise<T> {
  if (!supabase) throw new Error('Sem servidor: a carga dos saldos do Petros precisa de conexão.');
  const { data, error } = await supabase.functions.invoke('coleta-erp', { body });
  if (!error) return data as T;
  let erro = 'Não foi possível falar com o servidor. Verifique a conexão.';
  try { const r = (error as { context?: Response }).context; const c = r ? await r.json() : null; if (c?.erro) erro = String(c.erro); } catch { /* sem JSON */ }
  throw new Error(erro);
}

/** Situação da integração com o Petros (API configurada no servidor ou não). */
export const statusErp = () => chamar<{ petros: boolean }>({ acao: 'status' });

/** Escolhe o arquivo exportado pelo ERP (PDF do Petros ou CSV) e devolve nome + base64. */
export async function escolherArquivoErp(): Promise<{ nome: string; base64: string } | null> {
  const r = await DocumentPicker.getDocumentAsync({ type: ['application/pdf', 'text/csv', 'text/plain', 'text/comma-separated-values', '*/*'], copyToCacheDirectory: true, multiple: false });
  if (r.canceled || !r.assets?.length) return null;
  const a = r.assets[0];
  const blob: Blob = Platform.OS === 'web' && a.file ? a.file : await (await fetch(a.uri)).blob();
  if (blob.size > 15 * 1024 * 1024) throw new Error('Arquivo muito grande (limite de 15 MB).');
  const dataUri = await new Promise<string>((ok, falha) => { const fr = new FileReader(); fr.onload = () => ok(String(fr.result)); fr.onerror = () => falha(new Error('Não foi possível ler o arquivo.')); fr.readAsDataURL(blob); });
  return { nome: a.name, base64: dataUri.slice(dataUri.indexOf(',') + 1) };
}

/** Carrega produtos e saldos da filial no inventário (arquivo exportado ou API do Petros). */
export function carregarErp(inventarioId: string, fonte: 'arquivo' | 'petros', arquivo?: { nome: string; base64: string }, arquivoVenda?: { nome: string; base64: string }) {
  return chamar<CargaErp>({ acao: 'carregar', inventario_id: inventarioId, fonte, arquivo, arquivo_venda: arquivoVenda });
}

/** Envia o resultado ao Petros pela API (quando configurada). */
export function enviarResultadoErp(inventarioId: string, linhas: { codigo: string; saldo: number; contado: number }[]) {
  return chamar<{ ok: boolean; enviados: number }>({ acao: 'enviar_resultado', inventario_id: inventarioId, linhas });
}
