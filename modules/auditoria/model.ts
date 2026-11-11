import type { SyncRow } from '../../lib/sync';

// Módulo Auditoria: checklist de auditoria operacional (Sistema de Gestão Integrada) por filial.
// Hierarquia: Filial (cadastro único) → Auditoria (data, auditores, escopo) → Requisitos.

export const STATUS = ['C', 'OB', 'OM', 'NC', 'PP', 'NA'] as const;
export type StatusReq = (typeof STATUS)[number];
export const ROTULO: Record<StatusReq, string> = {
  C: 'Conforme', OB: 'Observação', OM: 'Oportunidade de melhoria', NC: 'Não conforme', PP: 'Ponto positivo', NA: 'Não aplicável',
};
export const ROTULO_CURTO: Record<StatusReq, string> = { C: 'Conforme', OB: 'Observação', OM: 'Melhoria', NC: 'Não conforme', PP: 'Ponto positivo', NA: 'Não aplicável' };
/** Status que pedem tratativa (plano de ação). */
export const PEDE_ACAO: StatusReq[] = ['NC', 'OM', 'OB'];

export type Acao = { tarefa: string; responsavel: string; prazo: string };
export type ItemAuditoria = { id: number; titulo: string; status: StatusReq | ''; obs: string; acao: Acao; fotos: string[] };
export type Auditoria = SyncRow & {
  filial_id: string;
  data: string;
  auditores: string;
  escopo: string;
  status: 'rascunho' | 'concluida';
  itens: ItemAuditoria[];
};

export const ESCOPO_PADRAO = 'Sistema de Gestão Integrada';

/** Requisitos do checklist (planilha de auditoria do Grupo Nevoeiro). */
export const REQUISITOS: string[] = [
  'Fechamento imediato do caixa em operação.',
  'Validação fundo de caixa.',
  'Cálculo de sobras e faltas dos combustíveis e Arla granel. Medição de tanques Arla granel. Aferição de todos os bicos de Arla granel.',
  'Drenagem de todos os tanques de combustíveis.',
  'Aferição de todos os bicos de combustíveis.',
  'Contagem de estoques da loja, pista e consumo próprio.',
  'Documentos FEPAM.',
  'Documentos Certificado Combustível.',
  'Documentos ANP.',
  'Documentos Extintores. Plano de Manutenção.',
  'Documentos Corpo de Bombeiros (PPCI). Validade.',
  'Documentação Licença Sanitária.',
  'Documentação IBAMA.',
  'Documentação Dedetização (ver certificado de Controle de Pragas).',
  'Verificação da Planilha Semanal de Drenagem (Resolução ANP 968/24).',
  'Documentos Alvarás de Funcionamento.',
  'Produtos e serviços com retrabalho ou reaproveitamento. Caso haja necessidade de reaproveitamento, deixar registrado (farelo de pão / torradinhas).',
  'Validação dos descartes dos produtos e avarias. É realizado no recebimento, ou quando encontrado com validade vencida ou avarias? Foi segregado e identificado?',
  'Venda de serviços: banho, lavagem, lubrificação, energia, recarga, outros.',
  'Integridade do produto. Procedimentos disponíveis nos locais de recebimento (ex.: inspeção do caminhão quanto a odores, umidade, furos, sujeira). Rejeições são documentadas e segregadas? Produtos estocados em ambiente limpo, seguro e livre de contaminação (odor, temperatura, materiais incompatíveis)?',
  'Tratamento de reclamações de clientes e não conformidades. Caso ocorra reclamação de cliente, registrar a situação para posterior avaliação e análise.',
  'Identificação imediata e segregação de produto não conforme, identificando as causas e registrando para posterior descarte.',
  'Controle de embalagem e identificação do produto disponíveis para verificar características/qualidade conforme especificações (vencimento, integridade, cheiro, mofo etc.).',
  'Investigação das causas de não conformidades. Havendo não conformidade, analisar (amassado, furado, aberto etc.) e registrar. Há providências para investigar causas (internas e reclamações de clientes) e iniciar ação corretiva para prevenir reincidência (ação corretiva/preventiva, diagrama de causa e efeito, brainstorming etc.)?',
  'Condições dos equipamentos / áreas físicas: estão em condições ou há necessidade de ação (telhado, goteiras, portas, placas, mesas, cadeiras etc.)?',
  'Plano de calibração, frequência e registros dos equipamentos que necessitem (balanças, calibradores etc.).',
  'Os colaboradores possuem o uniforme necessário?',
  "Os colaboradores possuem os EPI's necessários para a função?",
  "Os EPI's estão sendo usados de forma correta (calça, camisa, botina, creme, óculos, crachá)?",
  "A Ficha de Controle de Entrega de EPI's está devidamente assinada? Ao receber os EPI's, o colaborador deve assinar o recebimento; depois o registro retorna à matriz para guarda.",
  'O treinamento das respectivas funções foi realizado? O pessoal com atividades específicas é qualificado (educação, treinamento e/ou experiência)? As habilidades são avaliadas e documentadas? Existe um sistema (matriz, checklist, manual, lista de atividades críticas etc.) para determinar e fornecer o treinamento necessário?',
  'O cronograma e a escala de limpeza e trabalho estão atualizados conforme as necessidades do estabelecimento? Estão em boas condições e visíveis?',
  'A folha ponto está preenchida corretamente, sem rasuras, com marcações diárias, intervalos e intrajornadas?',
  'Foram encontrados funcionários usando celular no horário de trabalho?',
  'A iluminação está funcionando adequadamente (lâmpadas queimadas ou defeituosas)?',
  'Os banheiros estão limpos e higienizados, com a respectiva escala de limpeza?',
  'Os chuveiros e torneiras estão funcionando corretamente?',
  'A pista e as canaletas estão limpas?',
  'As ilhas estão limpas, sem resíduo de óleo e sem poeira?',
  'As ilhas estão com a pintura em bom estado?',
  'A placa ou banner de preço está em bom estado?',
  'O pátio e os canteiros estão limpos, sem papéis e objetos estranhos?',
  'O calibrador está funcionando corretamente? Possui as especificações do Inmetro (lacre, sem vazamento, não amassado)?',
  'Bomba, mangueiras, bicos, filtro e prensas sem vazamento e lacrados?',
  'As bocas de descarga estão sem líquidos estranhos e as tampas externas dos bocais estão na cor padrão do Grupo Nevoeiro, com a devida numeração?',
  'A caixa separadora está limpa e em bom estado de conservação? A limpeza é feita com frequência regular?',
  'Procedimentos para controle de pragas estão disponíveis. Há sistema documentado com responsabilidades, ações corretivas e medidas de melhoria?',
  'Conferência dos lacres do filtro de Diesel está OK?',
  'O depósito de mercadorias e equipamentos está limpo e organizado?',
  'Conferir descontos indevidos concedidos.',
  'A escala de serviço está publicada fisicamente no mural e na pasta compartilhada?',
  'Auditoria interna (realizada conforme cronograma anual ou quando solicitada). O resultado é informado ao gerente, que deve gerar ações corretivas; a implementação e a efetividade são registradas e verificadas depois. Não conformidades críticas devem ser ajustadas com a maior brevidade possível.',
  'Na próxima auditoria será verificado se as não conformidades encontradas foram ajustadas adequadamente.',
];

/* ---------- Utilidades ---------- */
export const uid = (p: string) => `${p}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
export const hoje = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
export const dataBR = (v: string) => { const p = String(v ?? '').split('-'); return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : v; };
export const dataValida = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T12:00:00`));

export const novosItens = (): ItemAuditoria[] =>
  REQUISITOS.map((titulo, i) => ({ id: i + 1, titulo, status: '', obs: '', acao: { tarefa: '', responsavel: '', prazo: '' }, fotos: [] }));

export type Contagem = Record<StatusReq | 'pendentes', number>;
export function contar(itens: ItemAuditoria[]): Contagem {
  const c = { C: 0, OB: 0, OM: 0, NC: 0, PP: 0, NA: 0, pendentes: 0 } as Contagem;
  itens.forEach(i => { if (i.status) c[i.status]++; else c.pendentes++; });
  return c;
}

/* ---------- Relatório (HTML para PDF, impressão e e-mail) ---------- */
const esc = (v: unknown) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] ?? c));
const COR: Record<StatusReq, string> = { C: '#16845b', OB: '#52677b', OM: '#c17a13', NC: '#c43d48', PP: '#6d5bd0', NA: '#8794a3' };

/** Relatório da auditoria. `fotoUrl` converte o caminho salvo da foto num endereço que o PDF consegue carregar. */
export function relatorioHtml(a: Auditoria, filial: string, fotoUrl: (caminho: string) => string | undefined) {
  const c = contar(a.itens);
  const constatacoes = a.itens.filter(i => i.status && PEDE_ACAO.includes(i.status));
  const positivos = a.itens.filter(i => i.status === 'PP');
  const comFoto = a.itens.filter(i => i.fotos.some(f => fotoUrl(f)));
  const linha = (i: ItemAuditoria) => {
    const st = i.status as StatusReq;
    const temAcao = i.acao.tarefa || i.acao.responsavel || i.acao.prazo;
    return `<div class="row"><b>${i.id}. ${esc(i.titulo)}</b><div class="st" style="color:${COR[st]}">${esc(ROTULO[st])}</div>
      <p>${esc(i.obs || 'Sem observação registrada.')}</p>
      ${temAcao ? `<p class="acao"><b>Ação:</b> ${esc(i.acao.tarefa || 'A definir')} · <b>Responsável:</b> ${esc(i.acao.responsavel || 'A definir')} · <b>Prazo:</b> ${i.acao.prazo ? esc(dataBR(i.acao.prazo)) : 'A definir'}</p>` : ''}</div>`;
  };
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Relatório de Auditoria · ${esc(filial)}</title>
<style>
@page{size:A4;margin:14mm}body{font:12.5px/1.45 Arial,Helvetica,sans-serif;color:#182536;margin:0}
.head{border-bottom:4px solid #f4c542;padding-bottom:12px;display:flex;justify-content:space-between;align-items:flex-end;gap:12px}
.marca{font-weight:900;color:#174b78;letter-spacing:1px;font-size:12px}h1{margin:4px 0;font-size:22px}.muted{color:#66788a}
h3{border-bottom:1px solid #e2e8f0;padding-bottom:6px;margin:22px 0 8px;font-size:15px}
.grid{display:flex;flex-wrap:wrap;gap:8px}.stat{flex:1 1 90px;background:#f3f6fa;padding:9px;border-radius:8px}.stat b{font-size:20px;display:block}
.row{padding:8px 0;border-bottom:1px solid #edf0f4;break-inside:avoid}.row p{margin:4px 0}.st{font-weight:800;font-size:12px}.acao{background:#fffaf0;border:1px solid #f3e3b7;border-radius:6px;padding:6px 8px}
.fotos{display:flex;gap:8px;flex-wrap:wrap;margin-top:6px}.fotos img{width:150px;height:110px;object-fit:cover;border-radius:6px;border:1px solid #e2e8f0}
.assin{margin-top:36px}
</style></head><body>
<div class="head"><div><div class="marca">GRUPO NEVOEIRO</div><h1>Relatório de Auditoria</h1><div class="muted">${esc(a.escopo || ESCOPO_PADRAO)}</div></div>
<div style="text-align:right"><b>${esc(filial)}</b><div>${esc(dataBR(a.data))}</div><small class="muted">${a.status === 'concluida' ? 'AUDITORIA CONCLUÍDA' : 'RASCUNHO'}</small></div></div>
<h3>Identificação</h3><p><b>Auditor(es):</b> ${esc(a.auditores || 'Não informado')}<br><b>Processo / escopo:</b> ${esc(a.escopo || ESCOPO_PADRAO)}</p>
<h3>Resumo executivo</h3><div class="grid">${STATUS.map(s => `<div class="stat"><b style="color:${COR[s]}">${c[s]}</b>${ROTULO[s]}</div>`).join('')}${c.pendentes ? `<div class="stat"><b>${c.pendentes}</b>Não avaliados</div>` : ''}</div>
<p>Foram registrados <b>${constatacoes.length}</b> itens que demandam atenção (observações, oportunidades de melhoria ou não conformidades).</p>
<h3>Constatações e planos de ação</h3>${constatacoes.map(linha).join('') || '<p>Não há itens classificados como observação, melhoria ou não conformidade.</p>'}
${positivos.length ? `<h3>Pontos positivos</h3>${positivos.map(linha).join('')}` : ''}
<h3>Evidências fotográficas</h3>${comFoto.length ? comFoto.map(i => `<div class="row"><b>Item ${i.id} · ${esc(i.titulo)}</b><div class="fotos">${i.fotos.map(f => fotoUrl(f)).filter(Boolean).map(u => `<img src="${esc(u)}">`).join('')}</div></div>`).join('') : '<p>Nenhuma fotografia anexada.</p>'}
<h3>Encaminhamento</h3><p>Relatório destinado à gestão para ciência, acompanhamento das constatações e monitoramento dos planos de ação registrados.</p>
<p class="assin">__________________________________<br>Responsável pela auditoria</p>
</body></html>`;
}
