// Carga do ERP no módulo Coleta (Contagem de Estoque) e envio do resultado.
//
// Chamadas do app (supabase.functions.invoke('coleta-erp', { body })), com o JWT do usuário:
//   { acao: 'status' }                                                    → { petros: boolean } API do Petros configurada?
//   { acao: 'carregar', inventario_id, fonte: 'arquivo'|'petros', arquivo?: { nome, base64 } }
//        lê os produtos e saldos da filial (PDF/CSV exportado do Petros ou API), grava em ce_produtos
//        (só itens com saldo diferente de zero) e abre o inventário.
//   { acao: 'enviar_resultado', inventario_id, linhas: [{ codigo, saldo, contado }] } → envia ao Petros pela API
//
// Publicar: npx supabase functions deploy coleta-erp --no-verify-jwt
import { createClient } from 'npm:@supabase/supabase-js@2.57.0';
import { lerArquivo } from './arquivo.ts';
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

async function carregar(body: { inventario_id: string; fonte: 'arquivo' | 'petros'; arquivo?: { nome: string; base64: string } }) {
  const inv = await inventario(body.inventario_id);
  if (inv.status === 'encerrado') return json(400, { erro: 'Este inventário já foi encerrado.' });
  let produtos: ProdutoErp[], ignoradas = 0;
  if (body.fonte === 'petros') produtos = await saldosPetros(inv.filialCodigo);
  else {
    if (!body.arquivo?.base64) return json(400, { erro: 'Envie o arquivo exportado pelo ERP.' });
    ({ produtos, ignoradas } = await lerArquivo(body.arquivo.nome, body.arquivo.base64));
  }
  // Um registro por código (linhas repetidas somam o saldo); só itens com saldo diferente de zero.
  const porCodigo = new Map<string, ProdutoErp>();
  produtos.forEach(p => {
    const ja = porCodigo.get(p.codigo);
    if (ja) { ja.saldo += p.saldo; ja.eans = [...new Set([...ja.eans, ...p.eans])]; } else porCodigo.set(p.codigo, { ...p });
  });
  const linhas = [...porCodigo.values()].filter(p => p.saldo !== 0).map(p => ({
    inventario_id: inv.id, codigo: p.codigo, eans: p.eans, nome: p.nome, categoria: p.categoria || 'Sem categoria', classe: classeDe(p), saldo: p.saldo, custo: p.custo ?? null,
  }));
  if (!linhas.length) return json(400, { erro: 'Nenhum item com saldo foi encontrado para esta filial.' });

  const { error: e1 } = await admin.from('ce_produtos').delete().eq('inventario_id', inv.id);
  if (e1) throw new Error(`Falha ao limpar a carga anterior: ${e1.message}`);
  for (let i = 0; i < linhas.length; i += 1000) {
    const { error } = await admin.from('ce_produtos').insert(linhas.slice(i, i + 1000));
    if (error) throw new Error(`Falha ao gravar os produtos: ${error.message}`);
  }
  const { error: e2 } = await admin.from('ce_inventarios').update({
    status: 'aberto', fonte: body.fonte, arquivo: body.arquivo?.nome ?? 'API Petros', itens_total: linhas.length, erp_em: new Date().toISOString(),
  }).eq('id', inv.id);
  if (e2) throw new Error(`Falha ao abrir o inventário: ${e2.message}`);
  const avisos = [
    ...(ignoradas ? [`${ignoradas} linha(s) do arquivo não foram reconhecidas como produto.`] : []),
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
      case 'enviar_resultado': return await enviarResultado(body);
      default: return json(400, { erro: 'Ação desconhecida.' });
    }
  } catch (e) {
    return json(500, { erro: e instanceof Error ? e.message : 'Erro inesperado no servidor.' });
  }
});
