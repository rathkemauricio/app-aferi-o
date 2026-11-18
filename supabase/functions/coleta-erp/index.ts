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
//        substitui a base fixa de códigos de barra (o PDF é lido no navegador: é pesado demais aqui).
//        filial_id = 'rede' grava a base da rede, que vale para todas as filiais; a de uma filial se soma a ela.
//        A carga de saldos exige uma base e liga os EANs aos itens pelo código interno.
//   { acao: 'associar_ean', inventario_id, codigo, ean } → liga um código de barras lido na coleta (que não estava
//        cadastrado) ao item da carga e grava na base em uso (a da filial, se ela tiver, ou a da rede).
//   { acao: 'extrair_pdf', caminho: 'barras/<arquivo>.pdf', de, ate } → { total, paginas: [[x, y, texto]][] }
//        textos de um lote de páginas do PDF enviado ao bucket coleta-arquivos (importação pelo celular).
//
// Publicar: npx supabase functions deploy coleta-erp --no-verify-jwt
import { createClient } from 'npm:@supabase/supabase-js@2.57.0';
import { lerArquivo, textosDasPaginas } from './arquivo.ts';
import { enviarPetros, type LinhaResultado, petrosConfigurado, type ProdutoErp, saldosPetros } from './petros.ts';
import { contaDe, REDE_NEVOEIRO } from '../_shared/conta.ts';

// Multiempresa: `emp` = empresa de quem chamou. Toda leitura/gravação abaixo é filtrada por ela (a chave de serviço
// passa por cima das regras do banco). A integração Petros (ERP da Rede Nevoeiro) só vale para a Rede Nevoeiro.

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false, autoRefreshToken: false } });

/** Classificação Pista × Conveniência quando o ERP não informa o setor (pela categoria). */
const PISTA = /combust|lubrif|[óo]leo|aditiv|acess[óo]r|arla|filtro|graxa|fluido|gasolina|diesel|etanol|gnv|palheta|automotiv|pista/i;
const classeDe = (p: ProdutoErp) => p.classe ?? (PISTA.test(`${p.categoria} ${p.nome}`) ? 'pista' : 'conveniencia');

async function inventario(id: string, emp: string) {
  const { data, error } = await admin.from('ce_inventarios').select('id,codigo,status,filial_id,filiais(codigo)').eq('id', id).eq('empresa_id', emp).maybeSingle();
  if (error) throw new Error(`Falha ao ler o inventário: ${error.message}`);
  if (!data) throw new Error('Inventário não encontrado no servidor. Aguarde a sincronização e tente de novo.');
  // deno-lint-ignore no-explicit-any
  return { ...data, filialCodigo: String((data as any).filiais?.codigo ?? '') };
}

type ItemBarras = { codigo: string; nome: string; categoria: string; eans: string[] };

/** Base da rede inteira (vale para todas as filiais). */
const REDE = 'rede';

/** Uma base de códigos de barra (código interno → EANs): a da rede ou a própria de uma filial. */
async function lerBase(id: string, emp: string) {
  const base = new Map<string, ItemBarras>();
  for (let de = 0; ; de += 1000) {
    const { data, error } = await admin.from('ce_barras').select('codigo,nome,categoria,eans').eq('empresa_id', emp).eq('filial_id', id).order('codigo').range(de, de + 999);
    if (error) throw new Error(`Falha ao ler a base de códigos de barra: ${error.message}`);
    (data ?? []).forEach(d => base.set(String(d.codigo), { codigo: String(d.codigo), nome: String(d.nome), categoria: String(d.categoria), eans: (d.eans as string[]) ?? [] }));
    if (!data || data.length < 1000) break;
  }
  return base;
}

/** Base usada pela filial: a da rede somada à própria da filial (os EANs dos dois se juntam; o nome da filial vale). */
async function baseBarras(filialId: string, emp: string) {
  const [rede, propria] = await Promise.all([lerBase(REDE, emp), lerBase(filialId, emp)]);
  propria.forEach((b, codigo) => {
    const r = rede.get(codigo);
    rede.set(codigo, r ? { ...b, nome: b.nome || r.nome, categoria: b.categoria || r.categoria, eans: [...new Set([...b.eans, ...r.eans])] } : b);
  });
  return rede;
}

/** Onde gravar um código de barras novo: na base própria da filial, se ela tiver, senão na da rede. */
async function baseEmUso(filialId: string, emp: string) {
  const { data } = await admin.from('ce_bases').select('id').eq('empresa_id', emp).eq('id', filialId).is('deleted_at', null).maybeSingle();
  return data ? filialId : REDE;
}

/** Grava (substitui) uma base de códigos de barra (da rede ou de uma filial), lida no navegador a partir do PDF do ERP. */
async function gravarBarras(body: { filial_id: string; arquivo: string; itens: ItemBarras[] }, emp: string) {
  if (body.filial_id !== REDE) {
    const { data: f } = await admin.from('filiais').select('id').eq('id', body.filial_id).eq('empresa_id', emp).maybeSingle();
    if (!f) return json(400, { erro: 'Filial não encontrada no servidor.' });
  }
  const porCodigo = new Map<string, ItemBarras>();
  (body.itens ?? []).forEach(i => {
    const codigo = String(i?.codigo ?? '').trim();
    if (!/^\d{1,14}$/.test(codigo)) return;
    const eans = [...new Set((i.eans ?? []).map(e => String(e).trim()).filter(e => /^\d{8,14}$/.test(e)))];
    const ja = porCodigo.get(codigo);
    if (ja) ja.eans = [...new Set([...ja.eans, ...eans])];
    else porCodigo.set(codigo, { codigo, nome: String(i.nome ?? '').slice(0, 200), categoria: String(i.categoria ?? '').slice(0, 120), eans });
  });
  const linhas = [...porCodigo.values()].map(i => ({ empresa_id: emp, filial_id: body.filial_id, ...i }));
  if (!linhas.length) return json(400, { erro: 'Nenhum produto reconhecido na relação de códigos de barra.' });

  const { error: e1 } = await admin.from('ce_barras').delete().eq('empresa_id', emp).eq('filial_id', body.filial_id);
  if (e1) throw new Error(`Falha ao limpar a base anterior: ${e1.message}`);
  for (let i = 0; i < linhas.length; i += 1000) {
    const { error } = await admin.from('ce_barras').insert(linhas.slice(i, i + 1000));
    if (error) throw new Error(`Falha ao gravar a base de códigos de barra: ${error.message}`);
  }
  const eans = linhas.reduce((n, l) => n + l.eans.length, 0);
  const { error: e2 } = await admin.from('ce_bases').upsert({ empresa_id: emp, id: body.filial_id, arquivo: String(body.arquivo ?? '').slice(0, 200), itens: linhas.length, eans, importado_em: new Date().toISOString(), deleted_at: null });
  if (e2) throw new Error(`Falha ao registrar a base: ${e2.message}`);
  return json(200, { ok: true, itens: linhas.length, eans, semEan: linhas.filter(l => !l.eans.length).length });
}

/** Lote de páginas de um PDF enviado ao bucket coleta-arquivos (o app monta a base a partir dos textos). */
const BUCKET = 'coleta-arquivos';
async function extrairPdf(body: { caminho: string; de: number; ate: number }) {
  const caminho = String(body.caminho ?? '');
  if (!/^(barras|arqueacao)\/[\w.-]+\.pdf$/.test(caminho)) return json(400, { erro: 'Arquivo inválido.' });
  const { data, error } = await admin.storage.from(BUCKET).download(caminho);
  if (error || !data) return json(400, { erro: 'O PDF enviado não foi encontrado no servidor. Tente importar de novo.' });
  const de = Math.max(1, Math.floor(Number(body.de) || 1));
  const ate = Math.min(de + 199, Math.floor(Number(body.ate) || de));
  return json(200, { ok: true, ...(await textosDasPaginas(new Uint8Array(await data.arrayBuffer()), de, ate)) });
}

type Arquivo = { nome: string; base64: string };
async function carregar(body: { inventario_id: string; fonte: 'arquivo' | 'petros'; arquivo?: Arquivo; arquivo_venda?: Arquivo }, emp: string) {
  const inv = await inventario(body.inventario_id, emp);
  if (body.fonte === 'petros' && emp !== REDE_NEVOEIRO) return json(400, { erro: 'A integração com o ERP Petros não está configurada para a sua empresa. Envie o arquivo exportado do ERP.' });
  if (inv.status === 'encerrado') return json(400, { erro: 'Este inventário já foi encerrado.' });
  // Os códigos de barra vêm da base fixa da filial; sem ela o coletor não reconhece os EANs.
  const base = await baseBarras(inv.filial_id, emp);
  if (!base.size) return json(400, { erro: `Ainda não há base de códigos de barra para a filial ${inv.filialCodigo}. Importe a base da rede em "Bases de códigos de barra" e carregue os saldos de novo.` });
  let produtos: ProdutoErp[], ignoradas = 0, saldoEm: string | null = null, empresa: string | null = null;
  // Dois PDFs do mesmo relatório: um com o custo unitário e outro com o preço de venda (ligados pelo código interno).
  let venda: Map<string, number> | null = null, temCusto = true, nomeCusto = '', nomeVenda = '';
  const avisosValor: string[] = [];
  if (body.fonte === 'petros') produtos = await saldosPetros(inv.filialCodigo);
  else {
    if (!body.arquivo?.base64 && !body.arquivo_venda?.base64) return json(400, { erro: 'Envie o arquivo exportado pelo Petros.' });
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
  // Itens da base de códigos de barra sem saldo no ERP entram com saldo 0: não fazem parte das contagens,
  // mas o coletor os reconhece (estoque físico sem saldo no sistema → sobra).
  const comSaldo = new Set(linhas.map(l => l.codigo));
  const zerados = [...base.values()].filter(b => !comSaldo.has(b.codigo)).map(b => {
    const p = porCodigo.get(b.codigo);
    const categoria = (p?.categoria && p.categoria !== 'Sem categoria' ? p.categoria : b.categoria) || 'Sem categoria';
    return {
      inventario_id: inv.id, codigo: b.codigo, eans: b.eans, nome: p?.nome || b.nome, categoria, classe: classeDe({ codigo: b.codigo, eans: b.eans, nome: b.nome, categoria, saldo: 0 }), saldo: 0,
      custo: temCusto ? p?.custo ?? null : null, preco_venda: venda ? venda.get(b.codigo) ?? null : null,
    };
  });
  const todas = [...linhas, ...zerados];

  const { error: e1 } = await admin.from('ce_produtos').delete().eq('inventario_id', inv.id);
  if (e1) throw new Error(`Falha ao limpar a carga anterior: ${e1.message}`);
  for (let i = 0; i < todas.length; i += 1000) {
    const { error } = await admin.from('ce_produtos').insert(todas.slice(i, i + 1000).map(l => ({ ...l, empresa_id: emp })));
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
    ...(semBarras ? [`${semBarras} item(ns) com saldo não têm código de barras na base: leia-os digitando o código interno (ou cadastre o código de barras na hora da coleta).`] : []),
    ...(produtos.length - linhas.length > 0 ? [`${produtos.length - linhas.length} item(ns) com saldo zero ou repetidos ficaram de fora.`] : []),
  ];
  return json(200, { ok: true, itens: linhas.length, categorias: new Set(linhas.map(l => l.categoria)).size, avisos });
}

/** Liga um código de barras lido na coleta ao item da carga e grava na base em uso (vale para os próximos inventários). */
async function associarEan(body: { inventario_id: string; codigo: string; ean: string }, emp: string) {
  const ean = String(body.ean ?? '').trim(), codigo = String(body.codigo ?? '').trim();
  if (!/^\d{8,14}$/.test(ean)) return json(400, { erro: 'Código de barras inválido: precisa ter de 8 a 14 dígitos.' });
  const inv = await inventario(body.inventario_id, emp);
  const { data: prod, error } = await admin.from('ce_produtos').select('codigo,eans,nome,categoria').eq('inventario_id', inv.id).eq('codigo', codigo).maybeSingle();
  if (error) throw new Error(`Falha ao ler o item: ${error.message}`);
  if (!prod) return json(400, { erro: 'Item não encontrado na carga deste inventário.' });
  const { data: outro } = await admin.from('ce_produtos').select('codigo,nome').eq('inventario_id', inv.id).contains('eans', [ean]).neq('codigo', codigo).limit(1);
  if (outro?.length) return json(409, { erro: `Este código de barras já é do item ${outro[0].codigo} · ${outro[0].nome}.` });

  const eans = [...new Set([...((prod.eans as string[]) ?? []), ean])];
  const { error: e1 } = await admin.from('ce_produtos').update({ eans }).eq('inventario_id', inv.id).eq('codigo', codigo);
  if (e1) throw new Error(`Falha ao gravar no inventário: ${e1.message}`);
  // Inventário: o código entra em eans_extra (sincroniza com os outros aparelhos que estão coletando).
  const { data: i2 } = await admin.from('ce_inventarios').select('eans_extra').eq('id', inv.id).maybeSingle();
  await admin.from('ce_inventarios').update({ eans_extra: { ...((i2?.eans_extra as Record<string, string>) ?? {}), [ean]: codigo } }).eq('id', inv.id);

  // Base em uso: soma o código ao item (ou cria o item na base).
  const baseId = await baseEmUso(inv.filial_id, emp);
  const { data: b } = await admin.from('ce_barras').select('eans').eq('empresa_id', emp).eq('filial_id', baseId).eq('codigo', codigo).maybeSingle();
  const novos = [...new Set([...((b?.eans as string[]) ?? []), ean])];
  const { error: e2 } = await admin.from('ce_barras').upsert({ empresa_id: emp, filial_id: baseId, codigo, nome: String(prod.nome ?? ''), categoria: String(prod.categoria ?? ''), eans: novos });
  if (e2) throw new Error(`Falha ao gravar na base de códigos de barra: ${e2.message}`);
  const { data: info } = await admin.from('ce_bases').select('itens,eans').eq('empresa_id', emp).eq('id', baseId).maybeSingle();
  const acrescimo = novos.length - ((b?.eans as string[]) ?? []).length;
  await admin.from('ce_bases').upsert({
    empresa_id: emp, id: baseId, itens: Number(info?.itens ?? 0) + (b ? 0 : 1), eans: Number(info?.eans ?? 0) + acrescimo, deleted_at: null,
    ...(info ? {} : { arquivo: 'Cadastrados na coleta', importado_em: new Date().toISOString() }),
  });
  return json(200, { ok: true, base: baseId === REDE ? 'rede' : 'filial' });
}

async function enviarResultado(body: { inventario_id: string; linhas: LinhaResultado[] }, emp: string) {
  if (emp !== REDE_NEVOEIRO) return json(400, { erro: 'A integração com o ERP Petros não está configurada para a sua empresa.' });
  const inv = await inventario(body.inventario_id, emp);
  const enviados = await enviarPetros(inv.filialCodigo, String(inv.codigo), body.linhas ?? []);
  await admin.from('ce_inventarios').update({ enviado_erp_em: new Date().toISOString() }).eq('id', inv.id);
  return json(200, { ok: true, enviados });
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const conta = await contaDe(admin, req);
    if (!conta) return json(401, { erro: 'Sessão expirada. Entre de novo no EasyAudit.' });
    const libera = conta.libera;
    const emp = conta.empresa?.id ?? '';
    const body = await req.json().catch(() => ({}));
    // A leitura de PDF também serve às tabelas de arqueação da Medição de Tanques (pasta arqueacao/).
    const tabelaTanque = body.acao === 'extrair_pdf' && String(body.caminho ?? '').startsWith('arqueacao/');
    if (tabelaTanque ? !libera('tanques') : !libera('coleta')) return json(403, { erro: tabelaTanque ? 'O módulo Medição de Tanques não está liberado para esta conta.' : 'O módulo Coleta não está liberado para esta conta.' });
    switch (body.acao) {
      case 'status': return json(200, { ok: true, petros: emp === REDE_NEVOEIRO && petrosConfigurado() });
      case 'carregar': return await carregar(body, emp);
      case 'gravar_barras': return await gravarBarras(body, emp);
      case 'associar_ean': return await associarEan(body, emp);
      case 'extrair_pdf': return await extrairPdf(body);
      case 'enviar_resultado': return await enviarResultado(body, emp);
      default: return json(400, { erro: 'Ação desconhecida.' });
    }
  } catch (e) {
    return json(500, { erro: e instanceof Error ? e.message : 'Erro inesperado no servidor.' });
  }
});
