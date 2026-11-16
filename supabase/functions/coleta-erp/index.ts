// Carga do ERP no módulo Coleta (Contagem de Estoque) e envio do resultado.
//
// Chamadas do app (supabase.functions.invoke('coleta-erp', { body })), com o JWT do usuário:
//   { acao: 'status' }                                                    → { petros: boolean } API do Petros configurada?
//   { acao: 'carregar', inventario_id, fonte: 'arquivo'|'petros', arquivo?: { nome, base64 }, arquivo_venda?: { nome, base64 } }
//        arquivo = PDF da Conferência de Estoque com custo; arquivo_venda = o mesmo relatório com preço de venda.
//        lê os produtos e saldos da filial (PDF/CSV exportado do Petros ou API), grava em ce_produtos
//        (só itens com saldo diferente de zero) e abre o inventário.
//   { acao: 'enviar_resultado', inventario_id, linhas: [{ codigo, saldo, contado }] } → envia ao Petros pela API
//   { acao: 'gravar_barras', filial_id, arquivo, itens: [{ codigo, nome, categoria, eans }] }
//        substitui a base fixa de códigos de barra da filial (o PDF é lido no navegador: é pesado demais aqui).
//        A carga de saldos exige essa base e liga os EANs aos itens pelo código interno.
//   { acao: 'extrair_pdf', caminho: 'barras/<arquivo>.pdf', de, ate } → { total, paginas: [[x, y, texto]][] }
//        textos de um lote de páginas do PDF enviado ao bucket coleta-arquivos (importação pelo celular).
//
// Publicar: npx supabase functions deploy coleta-erp --no-verify-jwt
import { createClient } from 'npm:@supabase/supabase-js@2.57.0';
import { lerArquivo, textosDasPaginas } from './arquivo.ts';
import { enviarPetros, type LinhaResultado, petrosConfigurado, type ProdutoErp, saldosPetros } from './petros.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false, autoRefreshToken: false } });

/** Classificação Pista × Conveniência quando o ERP não informa o setor (pela categoria). */
const PISTA = /combust|lubrif|[óo]leo|aditiv|arla|filtro|graxa|fluido|gasolina|diesel|etanol|gnv|palheta|automotiv|pista/i;
const classeDe = (p: ProdutoErp) => p.classe ?? (PISTA.test(`${p.categoria} ${p.nome}`) ? 'pista' : 'conveniencia');

async function inventario(id: string) {
  const { data, error } = await admin.from('ce_inventarios').select('id,codigo,status,filial_id,filiais(codigo)').eq('id', id).maybeSingle();
  if (error) throw new Error(`Falha ao ler o inventário: ${error.message}`);
  if (!data) throw new Error('Inventário não encontrado no servidor. Aguarde a sincronização e tente de novo.');
  // deno-lint-ignore no-explicit-any
  return { ...data, filialCodigo: String((data as any).filiais?.codigo ?? '') };
}

type ItemBarras = { codigo: string; nome: string; categoria: string; eans: string[] };

/** Base fixa de códigos de barra da filial (código interno → EANs). */
async function baseBarras(filialId: string) {
  const base = new Map<string, ItemBarras>();
  for (let de = 0; ; de += 1000) {
    const { data, error } = await admin.from('ce_barras').select('codigo,nome,categoria,eans').eq('filial_id', filialId).order('codigo').range(de, de + 999);
    if (error) throw new Error(`Falha ao ler a base de códigos de barra: ${error.message}`);
    (data ?? []).forEach(d => base.set(String(d.codigo), { codigo: String(d.codigo), nome: String(d.nome), categoria: String(d.categoria), eans: (d.eans as string[]) ?? [] }));
    if (!data || data.length < 1000) break;
  }
  return base;
}

/** Grava (substitui) a base de códigos de barra da filial, lida no navegador a partir do PDF do ERP. */
async function gravarBarras(body: { filial_id: string; arquivo: string; itens: ItemBarras[] }) {
  const { data: f } = await admin.from('filiais').select('id').eq('id', body.filial_id).maybeSingle();
  if (!f) return json(400, { erro: 'Filial não encontrada no servidor.' });
  const porCodigo = new Map<string, ItemBarras>();
  (body.itens ?? []).forEach(i => {
    const codigo = String(i?.codigo ?? '').trim();
    if (!/^\d{1,14}$/.test(codigo)) return;
    const eans = [...new Set((i.eans ?? []).map(e => String(e).trim()).filter(e => /^\d{8,14}$/.test(e)))];
    const ja = porCodigo.get(codigo);
    if (ja) ja.eans = [...new Set([...ja.eans, ...eans])];
    else porCodigo.set(codigo, { codigo, nome: String(i.nome ?? '').slice(0, 200), categoria: String(i.categoria ?? '').slice(0, 120), eans });
  });
  const linhas = [...porCodigo.values()].map(i => ({ filial_id: body.filial_id, ...i }));
  if (!linhas.length) return json(400, { erro: 'Nenhum produto reconhecido na relação de códigos de barra.' });

  const { error: e1 } = await admin.from('ce_barras').delete().eq('filial_id', body.filial_id);
  if (e1) throw new Error(`Falha ao limpar a base anterior: ${e1.message}`);
  for (let i = 0; i < linhas.length; i += 1000) {
    const { error } = await admin.from('ce_barras').insert(linhas.slice(i, i + 1000));
    if (error) throw new Error(`Falha ao gravar a base de códigos de barra: ${error.message}`);
  }
  const eans = linhas.reduce((n, l) => n + l.eans.length, 0);
  const { error: e2 } = await admin.from('ce_bases').upsert({ id: body.filial_id, arquivo: String(body.arquivo ?? '').slice(0, 200), itens: linhas.length, eans, importado_em: new Date().toISOString(), deleted_at: null });
  if (e2) throw new Error(`Falha ao registrar a base: ${e2.message}`);
  return json(200, { ok: true, itens: linhas.length, eans, semEan: linhas.filter(l => !l.eans.length).length });
}

/** Lote de páginas de um PDF enviado ao bucket coleta-arquivos (o app monta a base a partir dos textos). */
const BUCKET = 'coleta-arquivos';
async function extrairPdf(body: { caminho: string; de: number; ate: number }) {
  const caminho = String(body.caminho ?? '');
  if (!/^barras\/[\w.-]+\.pdf$/.test(caminho)) return json(400, { erro: 'Arquivo inválido.' });
  const { data, error } = await admin.storage.from(BUCKET).download(caminho);
  if (error || !data) return json(400, { erro: 'O PDF enviado não foi encontrado no servidor. Tente importar de novo.' });
  const de = Math.max(1, Math.floor(Number(body.de) || 1));
  const ate = Math.min(de + 199, Math.floor(Number(body.ate) || de));
  return json(200, { ok: true, ...(await textosDasPaginas(new Uint8Array(await data.arrayBuffer()), de, ate)) });
}

type Arquivo = { nome: string; base64: string };
async function carregar(body: { inventario_id: string; fonte: 'arquivo' | 'petros'; arquivo?: Arquivo; arquivo_venda?: Arquivo }) {
  const inv = await inventario(body.inventario_id);
  if (inv.status === 'encerrado') return json(400, { erro: 'Este inventário já foi encerrado.' });
  // Os códigos de barra vêm da base fixa da filial; sem ela o coletor não reconhece os EANs.
  const base = await baseBarras(inv.filial_id);
  if (!base.size) return json(400, { erro: `A filial ${inv.filialCodigo} ainda não tem a relação de códigos de barra importada. Importe-a em "Bases de códigos de barra" e carregue os saldos de novo.` });
  let produtos: ProdutoErp[], ignoradas = 0, saldoEm: string | null = null, empresa: string | null = null;
  // Dois PDFs do mesmo relatório: um com o custo unitário e outro com o preço de venda (ligados pelo código interno).
  let venda: Map<string, number> | null = null, temCusto = true, nomeCusto = '', nomeVenda = '';
  const avisosValor: string[] = [];
  if (body.fonte === 'petros') produtos = await saldosPetros(inv.filialCodigo);
  else {
    if (!body.arquivo?.base64 && !body.arquivo_venda?.base64) return json(400, { erro: 'Envie o arquivo exportado pelo ERP.' });
    const lidos: { nome: string; tipo: 'custo' | 'venda'; r: Awaited<ReturnType<typeof lerArquivo>> }[] = [];
    if (body.arquivo?.base64) { const r = await lerArquivo(body.arquivo.nome, body.arquivo.base64); lidos.push({ nome: body.arquivo.nome, tipo: r.valor ?? 'custo', r }); }
    if (body.arquivo_venda?.base64) { const r = await lerArquivo(body.arquivo_venda.nome, body.arquivo_venda.base64); lidos.push({ nome: body.arquivo_venda.nome, tipo: r.valor ?? 'venda', r }); }
    if (lidos.length === 2 && lidos[0].tipo === lidos[1].tipo) {
      return json(400, { erro: `Os dois PDFs são do relatório com ${lidos[0].tipo === 'custo' ? 'preço de custo' : 'preço de venda'}. Envie um com o custo e outro com o preço de venda.` });
    }
    const custoL = lidos.find(l => l.tipo === 'custo'), vendaL = lidos.find(l => l.tipo === 'venda');
    const principal = custoL ?? vendaL!;
    ({ produtos, ignoradas, saldoEm, empresa } = principal.r);
    nomeCusto = custoL?.nome ?? ''; nomeVenda = vendaL?.nome ?? '';
    temCusto = !!custoL;
    if (!custoL) avisosValor.push('Sem o PDF com o preço de custo: os valores a custo ficam em branco.');
    if (vendaL) {
      venda = new Map(vendaL.r.produtos.filter(p => p.custo !== null && p.custo !== undefined).map(p => [p.codigo, p.custo as number]));
      if (custoL) {
        const saldoVenda = new Map(vendaL.r.produtos.map(p => [p.codigo, p.saldo]));
        const codCusto = new Set(custoL.r.produtos.map(p => p.codigo));
        const difSaldo = custoL.r.produtos.filter(p => saldoVenda.has(p.codigo) && saldoVenda.get(p.codigo) !== p.saldo).length;
        const soVenda = vendaL.r.produtos.filter(p => !codCusto.has(p.codigo)).length;
        if (difSaldo) avisosValor.push(`${difSaldo} item(ns) com "Qtd Atual" diferente entre os PDFs de custo e de venda: valeu a do PDF de custo.`);
        if (soVenda) avisosValor.push(`${soVenda} item(ns) só aparecem no PDF de preço de venda e ficaram de fora (o saldo vem do PDF de custo).`);
        if (custoL.r.empresa && vendaL.r.empresa && custoL.r.empresa !== vendaL.r.empresa) avisosValor.push(`Atenção: o PDF de custo é da filial ${custoL.r.empresa} e o de venda da filial ${vendaL.r.empresa}.`);
      }
    } else avisosValor.push('Sem o PDF com o preço de venda: os valores a venda ficam em branco.');
  }
  // Um registro por código (linhas repetidas somam o saldo); só itens com saldo diferente de zero.
  const porCodigo = new Map<string, ProdutoErp>();
  produtos.forEach(p => {
    const ja = porCodigo.get(p.codigo);
    if (ja) { ja.saldo += p.saldo; ja.eans = [...new Set([...ja.eans, ...p.eans])]; } else porCodigo.set(p.codigo, { ...p });
  });
  // Liga cada item do saldo à base pelo código interno: EANs da base + os que o relatório trouxer.
  let semBarras = 0;
  const linhas = [...porCodigo.values()].filter(p => p.saldo !== 0).map(p => {
    const b = base.get(p.codigo);
    const eans = [...new Set([...(b?.eans ?? []), ...p.eans])];
    if (!eans.length) semBarras++;
    const categoria = (p.categoria && p.categoria !== 'Sem categoria' ? p.categoria : b?.categoria) || 'Sem categoria';
    return {
      inventario_id: inv.id, codigo: p.codigo, eans, nome: p.nome || b?.nome || '', categoria, classe: classeDe({ ...p, categoria }), saldo: p.saldo,
      custo: temCusto ? p.custo ?? null : null, preco_venda: venda ? venda.get(p.codigo) ?? null : null,
    };
  });
  if (!linhas.length) return json(400, { erro: 'Nenhum item com saldo foi encontrado para esta filial.' });

  const { error: e1 } = await admin.from('ce_produtos').delete().eq('inventario_id', inv.id);
  if (e1) throw new Error(`Falha ao limpar a carga anterior: ${e1.message}`);
  for (let i = 0; i < linhas.length; i += 1000) {
    const { error } = await admin.from('ce_produtos').insert(linhas.slice(i, i + 1000));
    if (error) throw new Error(`Falha ao gravar os produtos: ${error.message}`);
  }
  const { error: e2 } = await admin.from('ce_inventarios').update({
    status: 'aberto', fonte: body.fonte, arquivo: body.fonte === 'petros' ? 'API Petros' : nomeCusto || nomeVenda, arquivo_venda: nomeVenda, itens_total: linhas.length, erp_em: new Date().toISOString(),
    saldo_em: saldoEm, sem_barras: semBarras,
  }).eq('id', inv.id);
  if (e2) throw new Error(`Falha ao abrir o inventário: ${e2.message}`);
  const avisos = [
    ...(ignoradas ? [`${ignoradas} linha(s) do arquivo não foram reconhecidas como produto.`] : []),
    ...avisosValor,
    ...(venda ? (n => (n ? [`${n} item(ns) sem preço de venda no PDF de venda.`] : []))(linhas.filter(l => l.preco_venda === null).length) : []),
    ...(empresa && inv.filialCodigo && Number(empresa) !== Number(inv.filialCodigo.replace(/\D/g, '')) ? [`Atenção: o PDF é da empresa/filial ${empresa}, mas o inventário é da filial ${inv.filialCodigo}. Confira o arquivo.`] : []),
    ...(semBarras ? [`${semBarras} item(ns) com saldo não têm código de barras na base da filial: leia-os digitando o código interno.`] : []),
    ...(produtos.length - linhas.length > 0 ? [`${produtos.length - linhas.length} item(ns) com saldo zero ou repetidos ficaram de fora.`] : []),
  ];
  return json(200, { ok: true, itens: linhas.length, categorias: new Set(linhas.map(l => l.categoria)).size, avisos });
}

async function enviarResultado(body: { inventario_id: string; linhas: LinhaResultado[] }) {
  const inv = await inventario(body.inventario_id);
  const enviados = await enviarPetros(inv.filialCodigo, String(inv.codigo), body.linhas ?? []);
  await admin.from('ce_inventarios').update({ enviado_erp_em: new Date().toISOString() }).eq('id', inv.id);
  return json(200, { ok: true, enviados });
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
    const { data: u, error } = await admin.auth.getUser(token);
    if (error || !u.user) return json(401, { erro: 'Sessão expirada. Entre de novo no Postora.' });
    const { data: p } = await admin.from('profiles').select('papel,ativo,modulos').eq('user_id', u.user.id).maybeSingle();
    if (!p?.ativo || !(p.papel === 'admin' || (p.modulos ?? []).includes('coleta'))) return json(403, { erro: 'O módulo Coleta não está liberado para esta conta.' });
    const body = await req.json().catch(() => ({}));
    switch (body.acao) {
      case 'status': return json(200, { ok: true, petros: petrosConfigurado() });
      case 'carregar': return await carregar(body);
      case 'gravar_barras': return await gravarBarras(body);
      case 'extrair_pdf': return await extrairPdf(body);
      case 'enviar_resultado': return await enviarResultado(body);
      default: return json(400, { erro: 'Ação desconhecida.' });
    }
  } catch (e) {
    return json(500, { erro: e instanceof Error ? e.message : 'Erro inesperado no servidor.' });
  }
});
