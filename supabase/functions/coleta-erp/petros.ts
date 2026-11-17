// Adaptador da API do ERP Petros (Adaptive).
//
// Tudo o que depende do Petros fica aqui: quando a documentação/credenciais da API chegarem, ajuste
// ENDPOINTS e os mapeamentos (paraProduto / paraEnvio) — o app e o restante da função não mudam.
//
// Secrets (supabase secrets set): PETROS_API_URL, PETROS_API_TOKEN e, se a API pedir, PETROS_EMPRESA.
// Enquanto PETROS_API_URL não estiver definida, o módulo usa o arquivo exportado (PDF/CSV).

export type ProdutoErp = { codigo: string; eans: string[]; nome: string; categoria: string; classe?: 'pista' | 'conveniencia'; saldo: number; custo?: number | null };
export type LinhaResultado = { codigo: string; saldo: number; contado: number };

const URL_BASE = (Deno.env.get('PETROS_API_URL') ?? '').replace(/\/$/, '');
const TOKEN = Deno.env.get('PETROS_API_TOKEN') ?? '';
const EMPRESA = Deno.env.get('PETROS_EMPRESA') ?? '';

export const petrosConfigurado = () => !!(URL_BASE && TOKEN);

// A CONFIRMAR com a documentação da Adaptive: caminhos, paginação e nomes dos campos.
const ENDPOINTS = {
  saldos: (filial: string) => `/estoque/saldos?empresa=${encodeURIComponent(EMPRESA)}&filial=${encodeURIComponent(filial)}&somente_com_saldo=true`,
  inventario: '/estoque/inventarios',
};

async function api(caminho: string, init: RequestInit = {}) {
  const r = await fetch(`${URL_BASE}${caminho}`, { ...init, headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json', Accept: 'application/json', ...(init.headers ?? {}) } });
  if (!r.ok) throw new Error(`O Petros respondeu ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return r.json();
}

// deno-lint-ignore no-explicit-any
function paraProduto(x: any): ProdutoErp {
  return {
    codigo: String(x.codigo ?? x.cod_produto ?? x.id ?? '').trim(),
    eans: [x.ean, x.gtin, ...(Array.isArray(x.eans) ? x.eans : [])].filter(Boolean).map((e: unknown) => String(e).trim()),
    nome: String(x.descricao ?? x.nome ?? '').trim(),
    categoria: String(x.categoria ?? x.grupo ?? x.subgrupo ?? 'Sem categoria').trim(),
    // O Petros separa Pista e Conveniência pelo departamento/setor do produto (a confirmar o campo exato).
    classe: /pista|combust|lubrif/i.test(String(x.setor ?? x.departamento ?? '')) ? 'pista' : x.setor || x.departamento ? 'conveniencia' : undefined,
    saldo: Number(x.saldo ?? x.estoque ?? x.quantidade ?? 0),
    custo: x.custo !== undefined ? Number(x.custo) : null,
  };
}

/** Produtos com saldo da filial (código da filial no cadastro do EasyAudit = código da filial no Petros). */
export async function saldosPetros(filialCodigo: string): Promise<ProdutoErp[]> {
  if (!petrosConfigurado()) throw new Error('A API do Petros ainda não foi configurada no servidor. Use o arquivo exportado pelo Petros.');
  const out: ProdutoErp[] = [];
  let pagina = 1;
  for (;;) {
    const j = await api(`${ENDPOINTS.saldos(filialCodigo)}&pagina=${pagina}`);
    const itens = Array.isArray(j) ? j : j.itens ?? j.data ?? [];
    out.push(...itens.map(paraProduto).filter((p: ProdutoErp) => p.codigo));
    if (Array.isArray(j) || !(j.proxima_pagina ?? j.next) || !itens.length) break;
    pagina++;
  }
  return out;
}

/** Envia o resultado do inventário ao Petros (quantidade contada por item). */
export async function enviarPetros(filialCodigo: string, codigoInventario: string, linhas: LinhaResultado[]) {
  if (!petrosConfigurado()) throw new Error('A API do Petros ainda não foi configurada no servidor. Exporte o arquivo de resultado e importe no Petros.');
  await api(ENDPOINTS.inventario, {
    method: 'POST',
    body: JSON.stringify({ empresa: EMPRESA, filial: filialCodigo, referencia: codigoInventario, itens: linhas.map(l => ({ codigo: l.codigo, quantidade_contada: l.contado, saldo_sistema: l.saldo })) }),
  });
  return linhas.length;
}
