// Análise com IA (Gemini) — por enquanto, dimensionamento de equipe em Tempos e Movimentos (postos de combustível).
//
// Chamada do app (supabase.functions.invoke('analise-ia', { body })), com o JWT de quem está logado:
//   { acao: 'tempos', filial_id, perfil?: 'posto_combustivel', dados }
//        dados = resumo montado no app (tempos cronometrados, demanda, turnos, dimensionamento; sem nomes de pessoas)
//        → { ok, id, modelo, resultado } e grava em tm_analises_ia (com quem pediu)
//
// Secrets (npx supabase secrets set ...): GEMINI_API_KEY (obrigatório) e GEMINI_MODEL (opcional; padrão
// gemini-3.8-flash). Só modelos com cota gratuita na reserva (nov/2026: 3.8 Flash, 3.6 Flash, 3.5 Flash-Lite,
// 2.5 Flash — este é desativado em 1/12/2026). gemini-4-argon/carbon e os "pro" são só pagos.
// Publicar: npx supabase functions deploy analise-ia --no-verify-jwt
import { admin, entrarComoAtor, registrarAcao } from '../_shared/ator.ts';
import { contaDe } from '../_shared/conta.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const CHAVE = Deno.env.get('GEMINI_API_KEY') ?? '';
// Se o modelo não existir para a chave (404) ou estiver sem cota/créditos (429), tenta o seguinte.
const MODELOS = [...new Set([Deno.env.get('GEMINI_MODEL') ?? '', 'gemini-3.8-flash', 'gemini-3.6-flash', 'gemini-3.5-flash-lite', 'gemini-2.5-flash'].filter(Boolean))];

/** Perfis de negócio: hoje só postos de combustível; outros (lojas, oficinas…) entram aqui depois. */
const PERFIS: Record<string, { nome: string; contexto: string }> = {
  posto_combustivel: {
    nome: 'posto de combustível',
    contexto: [
      'Negócio: posto de combustível no Brasil (pista de abastecimento, loja de conveniência, troca de óleo, gerência).',
      'Jornada CLT de 44 h semanais (cerca de 220 h/mês por funcionário; liderança cerca de 176 h/mês); escalas típicas 6x1 ou 12x36.',
      'A pista precisa de cobertura nos horários de pico e prontidão mínima mesmo em baixo movimento (segurança e atendimento).',
      'Considere folgas, férias, faltas e intervalos ao converter horas de trabalho em quadro de pessoas.',
    ].join(' '),
  },
};

const SISTEMA = `Você é especialista em engenharia de métodos (tempos e movimentos) e dimensionamento de equipes.
Analise os dados de cronometragem e o dimensionamento de uma unidade e diga quantos funcionários são realmente necessários.
Regras:
- Use só os dados recebidos; não invente números. Quando faltar dado, diga o que falta e trabalhe com premissas explícitas.
- Compare o resultado com o cálculo da planilha (dimensionamento.total_funcionarios_planilha) e com o quadro atual.
- Separe a necessidade por turno e por setor quando os dados permitirem.
- Responda em português do Brasil, de forma objetiva, para gestores de posto.
- Responda SOMENTE com um JSON válido neste formato:
{
  "resumo": "2 a 4 frases com a conclusão",
  "funcionarios_necessarios": número (pode ter casa decimal),
  "faixa": { "minimo": número, "maximo": número },
  "comparacao": { "quadro_atual": número ou null, "planilha": número ou null, "diferenca_para_quadro": número ou null, "comentario": "texto" },
  "por_turno_setor": [ { "turno": "texto", "setor": "texto", "funcionarios": número, "observacao": "texto" } ],
  "justificativa": ["texto"],
  "riscos": ["texto"],
  "recomendacoes": ["texto"],
  "dados_faltantes": ["texto"],
  "confianca": "alta" | "media" | "baixa"
}`;

type Resultado = Record<string, unknown>;

async function perguntarGemini(perfil: { nome: string; contexto: string }, dados: unknown): Promise<{ modelo: string; resultado: Resultado }> {
  const pedido = `${perfil.contexto}\n\nDados da unidade (JSON):\n${JSON.stringify(dados)}`;
  let ultimoErro = '';
  for (const modelo of MODELOS) {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelo)}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': CHAVE },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SISTEMA }] },
        contents: [{ role: 'user', parts: [{ text: pedido }] }],
        generationConfig: { responseMimeType: 'application/json', temperature: 0.3 },
      }),
    });
    if (r.status === 404) { ultimoErro = `modelo ${modelo} não encontrado`; continue; }
    const corpo = await r.json().catch(() => null);
    if (!r.ok) {
      const msg = corpo?.error?.message ?? `HTTP ${r.status}`;
      if (r.status === 400 && /api key/i.test(msg)) throw new Error('A chave do Gemini (GEMINI_API_KEY) foi recusada. Confira a chave no servidor.');
      // Sem cota ou créditos neste modelo: tenta o próximo da lista.
      if (r.status === 429 || /quota|credit|exhausted|billing/i.test(msg)) { ultimoErro = `${modelo}: ${msg}`; continue; }
      throw new Error(`O Gemini respondeu com erro: ${msg}`);
    }
    const texto = (corpo?.candidates?.[0]?.content?.parts ?? []).map((p: { text?: string }) => p.text ?? '').join('').trim();
    if (!texto) throw new Error(`O Gemini não devolveu resposta${corpo?.candidates?.[0]?.finishReason ? ` (${corpo.candidates[0].finishReason})` : ''}.`);
    const limpo = texto.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
    try { return { modelo, resultado: JSON.parse(limpo) as Resultado }; }
    catch { return { modelo, resultado: { resumo: texto, confianca: 'baixa', dados_faltantes: ['A resposta não veio no formato esperado; texto bruto no resumo.'] } }; }
  }
  throw new Error(/quota|credit|exhausted|billing|429/i.test(ultimoErro)
    ? `A chave do Gemini está sem cota ou créditos nos modelos ${MODELOS.join(', ')}. Mensagem do Google: ${ultimoErro.slice(0, 300)}`
    : `Nenhum modelo do Gemini disponível para esta chave (${ultimoErro}). Configure GEMINI_MODEL no servidor.`);
}

async function analisarTempos(body: { filial_id?: string; perfil?: string; dados?: unknown }, usuario: { id: string; nome: string }, emp: string) {
  if (!CHAVE) return json(400, { erro: 'A análise com IA ainda não está configurada: falta a chave do Gemini (GEMINI_API_KEY) no servidor.' });
  const filialId = String(body.filial_id ?? '');
  const { data: f } = await admin.from('filiais').select('id').eq('id', filialId).eq('empresa_id', emp).maybeSingle();
  if (!f) return json(400, { erro: 'Filial não encontrada.' });
  const tamanho = JSON.stringify(body.dados ?? null).length;
  if (!body.dados || tamanho > 300_000) return json(400, { erro: 'Dados da análise ausentes ou grandes demais.' });
  const perfilId = body.perfil && PERFIS[body.perfil] ? body.perfil : 'posto_combustivel';

  const { modelo, resultado } = await perguntarGemini(PERFIS[perfilId], body.dados);
  const id = `ia-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  const { error } = await admin.from('tm_analises_ia').insert({ id, empresa_id: emp, filial_id: filialId, perfil: perfilId, modelo, resultado, dados: body.dados, usuario: usuario.id, usuario_nome: usuario.nome });
  if (error) throw new Error(`Análise feita, mas não foi salva: ${error.message}`);
  return json(200, { ok: true, id, modelo, resultado });
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const conta = await contaDe(admin, req);
    if (!conta) return json(401, { erro: 'Sessão expirada. Entre de novo no EasyAudit.' });
    entrarComoAtor(conta.user.id); // rastreabilidade: as gravações ficam em nome de quem pediu
    if (!conta.libera('tempos') || !conta.empresa) return json(403, { erro: 'O módulo Tempos e Movimentos não está liberado para esta conta.' });
    const u = { user: conta.user };
    const p = conta.perfil!;
    const nome = String(p.nome || String(p.email ?? u.user.email ?? '').split('@')[0]);
    const body = await req.json().catch(() => ({}));
    switch (body.acao) {
      case 'tempos': return await analisarTempos(body, { id: u.user.id, nome }, conta.empresa.id);
      default: return json(400, { erro: 'Ação desconhecida.' });
    }
  } catch (e) {
    return json(500, { erro: e instanceof Error ? e.message : 'Erro inesperado no servidor.' });
  }
});
