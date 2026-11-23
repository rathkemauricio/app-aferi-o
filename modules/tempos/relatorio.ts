import { esc } from '../../lib/util';
import { type Filtro, coletasFiltradas, atendimentosDe, indicadores, ociosidade, progressoFilial } from './calc';
import { ciclosMinimos, dataBR, fmtMin, num, TIPOS_OPERACAO } from './model';
import { statusDaFilial, tipoDe, type TmData } from './store';

/** Análise com IA salva (tm_analises_ia) e o dimensionamento da planilha enviado junto. */
export type AnaliseParaRelatorio = {
  modelo: string | null; updated_at: string; usuario_nome: string;
  resultado: {
    resumo?: string; funcionarios_necessarios?: number; faixa?: { minimo?: number; maximo?: number };
    comparacao?: { quadro_atual?: number | null; planilha?: number | null; diferenca_para_quadro?: number | null; comentario?: string };
    por_turno_setor?: { turno?: string; setor?: string; funcionarios?: number; observacao?: string }[];
    tempo_por_atividade?: { atividade?: string; media_min?: number; padrao_min?: number | null; leitura?: string }[];
    atendimento_completo_min?: number | null;
    ociosidade?: { percentual?: number; minutos_por_hora?: number; horas_por_funcionario_dia?: number | null; leitura?: string; por_turno?: { turno?: string; percentual?: number; leitura?: string }[] };
    justificativa?: string[]; riscos?: string[]; recomendacoes?: string[]; dados_faltantes?: string[]; confianca?: string;
  } | null;
};
export type DimParaRelatorio = {
  dias: number; quadro_atual: number; total_funcionarios_planilha: number;
  blocos: { bloco: string; fator_cobertura: number; horas_por_funcionario_mes: number; horas_mes: number; funcionarios: number }[];
};

const n1 = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v.toLocaleString('pt-BR', { maximumFractionDigits: 1 }) : '—');
const itens = (v: unknown) => (Array.isArray(v) ? v.map(String).filter(Boolean) : []);
const ul = (v: unknown) => { const xs = itens(v); return xs.length ? `<ul>${xs.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : '<p class="muted">—</p>'; };

/**
 * Relatório de Tempos e Movimentos (PDF A4, app e web), no modelo de impressão padrão dos módulos:
 * logotipo e nome da rede no topo, resumo executivo, tabelas e assinatura. Usa o mesmo filtro do Painel.
 */
const SITUACAO: Record<string, [string, string]> = {
  amostra: ['Amostra pequena', '#66788a'],
  'sem-ref': ['Sem referência', '#66788a'],
  acima: ['Acima da referência', '#b45309'],
  dentro: ['Dentro da referência', '#15803d'],
};

/** Barra horizontal (impressa com as cores, ver normalizarImpressao). */
const barra = (v: number, max: number, cor = '#174b78') =>
  `<div class="bar"><span style="width:${max > 0 ? Math.max(2, Math.round((v / max) * 100)) : 0}%;background:${cor}"></span></div>`;

export function relatorioTemposHtml(d: TmData, f: Filtro, marca: { nome: string; logo: string | null }, quem: string, extra?: { ia?: AnaliseParaRelatorio | null; dim?: DimParaRelatorio | null }) {
  const r = indicadores(d, f);
  const oc = ociosidade(d, f);
  const ia = extra?.ia?.resultado ? extra.ia : null;
  const A = ia?.resultado ?? null;
  const dim = extra?.dim ?? null;
  const maxOc = Math.max(0, ...[...oc.porTurno, ...oc.porDemanda, ...oc.porSetor].map(x => x.pct));
  const linhaOcio = (nome: string, x: { pct: number; minPorHora: number; observadoSeg: number; ativoSeg: number; ociosoSeg: number; observacoes: number }) =>
    `<tr><td>${esc(nome)}</td><td class="num">${fmtMin(x.observadoSeg)}</td><td class="num">${fmtMin(x.ativoSeg)}</td><td class="num">${fmtMin(x.ociosoSeg)}</td><td class="num"><b>${num(x.pct)}%</b></td><td class="num">${num(x.minPorHora)}</td><td>${barra(x.pct, Math.max(maxOc, 1), x.pct > 25 ? '#b45309' : '#15803d')}</td></tr>`;
  // As 3 respostas que o gestor procura: quanto leva cada atividade, quanto fica ocioso, quantos funcionários precisa.
  const topAtv = [...r.atividades].sort((a, b) => b.totalSeg - a.totalSeg).slice(0, 5);
  const necessarios = A?.funcionarios_necessarios ?? null;
  const cs = [...coletasFiltradas(d, f)].sort((a, b) => a.data.localeCompare(b.data));
  const ats = atendimentosDe(d, cs);
  const filial = d.filiais.find(x => x.id === f.filialId);
  // Centro de distribuição: ciclo completo (pedido/carga) e quantidade movimentada no lugar de atendimento e litros.
  const ehCd = !!filial && tipoDe(d, filial.id) === 'cd';
  const ciclo = ehCd ? TIPOS_OPERACAO.cd.ciclo.nome.toLowerCase() : 'atendimento';
  const nomeFilial = (id: string) => { const x = d.filiais.find(y => y.id === id); return x ? `${x.codigo} · ${x.nome}` : 'Filial removida'; };
  const periodo = cs.length ? (cs[0].data === cs[cs.length - 1].data ? dataBR(cs[0].data) : `${dataBR(cs[0].data)} a ${dataBR(cs[cs.length - 1].data)}`) : '—';
  const auditores = [...new Set(cs.map(c => c.auditor).filter(Boolean))].join(', ') || 'Não informado';
  const prog = filial ? progressoFilial(d, filial.id) : null;
  const status = filial ? statusDaFilial(d, filial.id) : undefined;
  const fimEm = status?.finalizado_em ?? null;
  const maxClasse = Math.max(0, ...r.porClasse.map(([, v]) => v));
  const maxAtv = Math.max(0, ...r.atividades.map(a => a.mediaSeg));
  const maxVeic = Math.max(0, ...r.porVeiculo.map(([, s]) => s));
  const totalClasse = r.porClasse.reduce((s, [, v]) => s + v, 0);
  const acima = r.atividades.filter(a => a.situacao === 'acima');
  const agora = new Date();

  const stat = (valor: string, rotulo: string) => `<div class="stat"><b>${esc(valor)}</b>${esc(rotulo)}</div>`;
  const filtroTxt = [filial ? nomeFilial(filial.id) : 'Todas as filiais', f.setor || 'Todos os setores', f.demanda || 'Todas as demandas'].join(' · ');

  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Tempos e Movimentos · ${esc(filial ? filial.nome : 'Todas as filiais')}</title>
<style>
@page{size:A4;margin:14mm}body{font:12px/1.45 Arial,Helvetica,sans-serif;color:#182536;margin:0}
.head{border-bottom:4px solid #f4c542;padding-bottom:12px;display:flex;justify-content:space-between;align-items:flex-end;gap:12px}
.marca{font-weight:900;color:#174b78;letter-spacing:1px;font-size:12px}h1{margin:4px 0;font-size:22px}.muted{color:#66788a}
h3{border-bottom:1px solid #e2e8f0;padding-bottom:6px;margin:22px 0 8px;font-size:15px;break-after:avoid}
.grid{display:flex;flex-wrap:wrap;gap:8px}.stat{flex:1 1 110px;background:#f3f6fa;padding:9px;border-radius:8px}.stat b{font-size:18px;display:block;color:#174b78}
table.t{width:100%;border-collapse:collapse;font-size:11.5px}table.t th{background:#f3f6fa;text-align:left;padding:6px;border-bottom:1px solid #d9e1ea}
table.t td{padding:5px 6px;border-bottom:1px solid #edf0f4;vertical-align:middle}table.t tr{break-inside:avoid}.num{text-align:right;white-space:nowrap}
.bar{height:8px;background:#e8edf3;border-radius:4px;overflow:hidden;min-width:80px}.bar span{display:block;height:8px;border-radius:4px}
.aviso{background:#fffaf0;border:1px solid #f3e3b7;border-radius:6px;padding:8px 10px}.ok{background:#f0fdf4;border:1px solid #bbf7d0;border-radius:6px;padding:8px 10px}
.conc{display:flex;gap:10px;flex-wrap:wrap}.conc>div{flex:1 1 180px;border:1px solid #d9e1ea;border-radius:10px;padding:10px 12px;break-inside:avoid}
.conc h4{margin:0 0 4px;font-size:11px;letter-spacing:.6px;color:#66788a;text-transform:uppercase}.conc .grande{font-size:24px;font-weight:900;color:#174b78;line-height:1.1}
.conc ol{margin:6px 0 0;padding-left:16px}.conc li{margin:1px 0}ul{margin:4px 0;padding-left:18px}.ia{border-left:4px solid #174b78;padding-left:10px}
.nota{font-size:10.5px;color:#66788a}.assin{margin-top:36px;display:flex;gap:40px}
</style></head><body>
<div class="head"><div>${marca.logo ? `<img src="${marca.logo}" alt="${esc(marca.nome)}" style="max-height:44px;max-width:180px;object-fit:contain;display:block;margin-bottom:6px">` : ''}<div class="marca">${esc(marca.nome.toUpperCase())}</div><h1>Relatório de Tempos e Movimentos</h1><div class="muted">${esc(filtroTxt)}</div></div>
<div style="text-align:right"><b>${esc(filial ? nomeFilial(filial.id) : 'Todas as filiais')}</b><div>${esc(periodo)}</div><small class="muted">${fimEm ? `COLETAS FINALIZADAS EM ${esc(new Date(fimEm).toLocaleDateString('pt-BR'))}` : filial ? 'COLETAS EM ANDAMENTO' : 'CONSOLIDADO DA REDE'}</small></div></div>

<h3>Conclusões principais</h3>
<div class="conc">
<div><h4>Quanto leva cada atividade</h4>
${r.mediaAtendimentoSeg ? `<div class="grande">${fmtMin(r.mediaAtendimentoSeg)} min</div><div class="muted">por ${ciclo} completo (média)</div>` : `<div class="muted">Sem ${ciclo}s completos.</div>`}
${topAtv.length ? `<ol>${topAtv.map(a => `<li>${esc(a.nome)}: <b>${fmtMin(a.mediaSeg)} min</b>${a.padraoSeg !== null ? ` (padrão ${fmtMin(a.padraoSeg)})` : ''}</li>`).join('')}</ol>` : ''}</div>
<div><h4>Quanto fica ocioso</h4>
${oc.total.observadoSeg ? `<div class="grande">${num(oc.total.pct)}%</div><div class="muted">do tempo observado · ${num(oc.total.minPorHora)} min ociosos a cada hora</div>
${oc.porTurno.length > 1 ? `<ol>${oc.porTurno.map(x => `<li>${esc(x.nome)}: <b>${num(x.pct)}%</b></li>`).join('')}</ol>` : ''}` : '<div class="muted">Sem tempo observado suficiente.</div>'}
${A?.ociosidade?.leitura ? `<p class="nota">${esc(A.ociosidade.leitura)}</p>` : ''}</div>
<div><h4>Funcionários necessários</h4>
${necessarios !== null ? `<div class="grande">${n1(necessarios)}</div><div class="muted">pela análise com IA${A?.faixa ? ` · faixa ${n1(A.faixa.minimo)} a ${n1(A.faixa.maximo)}` : ''}</div>` : dim ? `<div class="grande">${n1(dim.total_funcionarios_planilha)}</div><div class="muted">pela planilha de dimensionamento</div>` : '<div class="muted">Faça a análise com IA (Análise e dimensionamento da filial) para ter o número.</div>'}
<ol>${dim ? `<li>Planilha: <b>${n1(dim.total_funcionarios_planilha)}</b></li><li>Quadro atual: <b>${n1(dim.quadro_atual)}</b></li>` : ''}${A?.comparacao?.diferenca_para_quadro !== undefined && A?.comparacao?.diferenca_para_quadro !== null ? `<li>Diferença para o quadro: <b>${n1(A?.comparacao?.diferenca_para_quadro)}</b></li>` : ''}</ol></div>
</div>
${A?.resumo ? `<p class="ia">${esc(A.resumo)}</p>` : ''}

<h3>Identificação</h3>
<p><b>Filial:</b> ${esc(filial ? nomeFilial(filial.id) : 'Todas as filiais')}<br><b>Setor:</b> ${esc(f.setor || 'Todos')} · <b>Demanda:</b> ${esc(f.demanda || 'Todas')}<br>
<b>Período das coletas:</b> ${esc(periodo)} · <b>Coletas:</b> ${cs.length}<br><b>Auditor(es):</b> ${esc(auditores)}${fimEm && status?.finalizado_por_nome ? `<br><b>Finalizado por:</b> ${esc(status.finalizado_por_nome)}` : ''}</p>

<h3>Resumo executivo</h3>
<div class="grid">
${stat(String(r.atendimentos), ehCd ? 'Ciclos completos' : 'Atendimentos completos')}${stat(String(r.isoladas), 'Atividades individuais')}${stat(fmtMin(r.mediaAtendimentoSeg), `Min por ${ciclo} (média)`)}${stat(String(r.etapas), 'Etapas cronometradas')}
${stat(fmtMin(r.totalSeg), 'Min em atividade')}${stat(fmtMin(r.esperaSeg), 'Min de espera')}${stat(fmtMin(r.interrupcoesSeg), 'Min de pausas')}${stat(fmtMin(r.retrabalhoSeg), 'Min de retrabalho')}
${stat(num(r.ocupacao) + '%', 'Ocupação')}${stat(num(r.deslocamentos), 'Deslocamentos')}${r.volume ? stat(num(r.volume), ehCd ? 'Quantidade movimentada' : 'Litros (pelas faixas)') : ''}
</div>
${r.etapas ? `<p>${acima.length ? `<b>${acima.length}</b> atividade(s) com tempo médio acima da referência: ${esc(acima.map(a => a.nome).join(', '))}.` : 'Nenhuma atividade com amostra suficiente ficou acima da referência.'}</p>` : '<p>Ainda não há atendimentos ou atividades finalizados neste filtro.</p>'}

${prog ? `<h3>Andamento das coletas da filial</h3>
<div class="${prog.completo ? 'ok' : 'aviso'}"><b>${prog.coletas} de ${prog.meta} coletas</b> (meta padrão) · ${prog.comAmostra} de ${prog.atividades} atividades com ${prog.minimo} ou mais ciclos.<br>
Turnos: ${prog.turnos.map(([t, n]) => `${esc(t)} ${n}`).join(' · ')} · Demandas: ${prog.demandas.map(([x, n]) => `${esc(x)} ${n}`).join(' · ')}
${prog.faltas.length ? `<br><b>Falta:</b> ${esc(prog.faltas.join('; '))}.` : '<br>Coletas completas pela meta.'}</div>` : ''}

${oc.total.observadoSeg ? `<h3>Ociosidade</h3>
<p>Do tempo observado, <b>${num(oc.total.pct)}%</b> ficou ocioso (${fmtMin(oc.total.ociosoSeg)} de ${fmtMin(oc.total.observadoSeg)} min): ${fmtMin(oc.total.esperaSeg)} min em espera cronometrada e ${fmtMin(oc.total.intervalosSeg)} min parado entre um atendimento e outro. Pausas e interrupções: ${fmtMin(oc.total.pausasSeg)} min.</p>
<table class="t"><tr><th>Grupo</th><th class="num">Observado (min)</th><th class="num">Trabalhando (min)</th><th class="num">Ocioso (min)</th><th class="num">% ocioso</th><th class="num">Min ociosos/h</th><th style="width:22%"></th></tr>
${[['Turno', oc.porTurno], ['Demanda', oc.porDemanda], ['Setor', oc.porSetor]].filter(([, xs]) => (xs as typeof oc.porTurno).length).map(([rot, xs]) => `<tr><th colspan="7">${rot}</th></tr>${(xs as typeof oc.porTurno).map(x => linhaOcio(x.nome, x)).join('')}`).join('')}
<tr><td><b>Total</b></td><td class="num">${fmtMin(oc.total.observadoSeg)}</td><td class="num">${fmtMin(oc.total.ativoSeg)}</td><td class="num">${fmtMin(oc.total.ociosoSeg)}</td><td class="num"><b>${num(oc.total.pct)}%</b></td><td class="num">${num(oc.total.minPorHora)}</td><td></td></tr>
</table>
<p class="nota">Ocioso = etapas cronometradas como Espera + intervalos entre os registros do mesmo funcionário na coleta (intervalos acima de 20 min são tratados como tempo não observado). Meta saudável de ocupação: 75% a 85% (ociosidade de 15% a 25%).</p>` : ''}

${r.porClasse.length ? `<h3>Tempo por classe</h3>
<table class="t"><tr><th>Classe</th><th class="num">Minutos</th><th class="num">%</th><th style="width:40%"></th></tr>
${r.porClasse.map(([c, v]) => `<tr><td>${esc(c)}</td><td class="num">${fmtMin(v)}</td><td class="num">${totalClasse ? num((v / totalClasse) * 100) : '0'}%</td><td>${barra(v, maxClasse, c === 'Espera' || c === 'Retrabalho' ? '#b45309' : '#174b78')}</td></tr>`).join('')}
</table>` : ''}

${r.atividades.length ? `<h3>Indicadores por atividade</h3>
<table class="t"><tr><th>Atividade</th><th class="num">Ciclos</th><th class="num">Média (min)</th><th class="num">Ref. (min)</th><th class="num">Padrão (min)</th><th>Situação</th><th style="width:18%"></th></tr>
${r.atividades.map(a => { const [rot, cor] = SITUACAO[a.situacao]; return `<tr><td>${esc(a.nome)}</td><td class="num">${a.ciclos}</td><td class="num">${fmtMin(a.mediaSeg)}</td><td class="num">${a.ref ? num(a.ref) : '—'}</td><td class="num">${a.padraoSeg !== null ? fmtMin(a.padraoSeg) : '—'}</td><td style="color:${cor};font-weight:700">${rot}</td><td>${barra(a.mediaSeg, maxAtv, cor)}</td></tr>`; }).join('')}
</table>` : ''}

${r.porVeiculo.length ? `<h3>Tempo médio por tipo de veículo</h3>
<table class="t"><tr><th>Veículo</th><th class="num">Atendimentos</th><th class="num">Média (min)</th><th style="width:40%"></th></tr>
${r.porVeiculo.map(([n, s, q]) => `<tr><td>${esc(n)}</td><td class="num">${q}</td><td class="num">${fmtMin(s)}</td><td>${barra(s, maxVeic)}</td></tr>`).join('')}
</table>` : ''}

${A ? `<h3>Análise com IA: dimensionamento</h3>
<div class="ia">
<p><b>${n1(A.funcionarios_necessarios)} funcionário(s) necessário(s)</b>${A.faixa ? ` (faixa ${n1(A.faixa.minimo)} a ${n1(A.faixa.maximo)})` : ''} · confiança ${esc(A.confianca ?? '—')}</p>
${A.comparacao?.comentario ? `<p>${esc(A.comparacao.comentario)}</p>` : ''}
${(A.por_turno_setor ?? []).length ? `<table class="t"><tr><th>Turno</th><th>Setor</th><th class="num">Funcionários</th><th>Observação</th></tr>${(A.por_turno_setor ?? []).map(x => `<tr><td>${esc(x.turno)}</td><td>${esc(x.setor)}</td><td class="num">${n1(x.funcionarios)}</td><td>${esc(x.observacao)}</td></tr>`).join('')}</table>` : ''}
${(A.tempo_por_atividade ?? []).length ? `<p><b>Leitura dos tempos por atividade</b></p><table class="t"><tr><th>Atividade</th><th class="num">Média (min)</th><th class="num">Padrão (min)</th><th>Leitura</th></tr>${(A.tempo_por_atividade ?? []).map(x => `<tr><td>${esc(x.atividade)}</td><td class="num">${n1(x.media_min)}</td><td class="num">${n1(x.padrao_min)}</td><td>${esc(x.leitura)}</td></tr>`).join('')}</table>` : ''}
${A.ociosidade?.leitura ? `<p><b>Ociosidade:</b> ${esc(A.ociosidade.leitura)}${A.ociosidade.horas_por_funcionario_dia ? ` (cerca de ${n1(A.ociosidade.horas_por_funcionario_dia)} h por funcionário por dia)` : ''}</p>` : ''}
<p><b>Justificativa</b></p>${ul(A.justificativa)}
<p><b>Riscos</b></p>${ul(A.riscos)}
<p><b>Recomendações</b></p>${ul(A.recomendacoes)}
<p><b>Dados que faltam</b></p>${ul(A.dados_faltantes)}
<p class="nota">Análise gerada por inteligência artificial (${esc(ia?.modelo ?? 'Gemini')}) em ${esc(new Date(ia!.updated_at).toLocaleString('pt-BR'))}${ia?.usuario_nome ? `, pedida por ${esc(ia.usuario_nome)}` : ''}, a partir dos tempos cronometrados. Confira antes de decidir.</p>
</div>` : ''}

${dim ? `<h3>Dimensionamento pela planilha</h3>
<table class="t"><tr><th>Bloco</th><th class="num">Horas/mês</th><th class="num">Fator de cobertura</th><th class="num">Horas/func./mês</th><th class="num">Funcionários</th></tr>
${dim.blocos.map(b => `<tr><td>${esc(b.bloco)}</td><td class="num">${n1(b.horas_mes)}</td><td class="num">${n1(b.fator_cobertura)}</td><td class="num">${n1(b.horas_por_funcionario_mes)}</td><td class="num">${n1(b.funcionarios)}</td></tr>`).join('')}
<tr><td><b>Total</b></td><td></td><td></td><td></td><td class="num"><b>${n1(dim.total_funcionarios_planilha)}</b></td></tr>
</table>
<p class="nota">Quadro atual informado: ${n1(dim.quadro_atual)} · ${dim.dias} dias no mês.</p>` : ''}

${cs.length ? `<h3>Coletas realizadas</h3>
<table class="t"><tr><th>Data</th>${filial ? '' : '<th>Filial</th>'}<th>Setor</th><th>Turno</th><th>Demanda</th><th>Auditor</th><th class="num">Registros</th><th class="num">Min</th></tr>
${cs.map(c => { const xs = ats.filter(a => a.coleta_id === c.id); return `<tr><td>${esc(dataBR(c.data))}</td>${filial ? '' : `<td>${esc(nomeFilial(c.filial_id))}</td>`}<td>${esc(c.setor)}</td><td>${esc(c.turno)}</td><td>${esc(c.demanda)}</td><td>${esc(c.auditor || '—')}</td><td class="num">${xs.length}</td><td class="num">${fmtMin(xs.reduce((s, a) => s + a.duracao_s, 0))}</td></tr>`; }).join('')}
</table>` : ''}

<h3>Critérios</h3>
<p class="nota">Tempo padrão = média × fator de ritmo (${num(d.parametros.ritmo)}) × (1 + tolerância ${num(d.parametros.tol)}%), calculado só com ${ciclosMinimos(d.parametros)} ou mais ciclos.
Ocupação = tempo fora de espera ÷ (tempo em atividade + pausas). Os indicadores servem para dimensionar a operação: não use como medida de desempenho individual; baixa demanda não significa excesso de pessoal.</p>
<h3>Encaminhamento</h3><p>Relatório destinado à gestão para ciência dos tempos observados e apoio ao dimensionamento das equipes.</p>
<p class="nota">Gerado por ${esc(quem || 'EasyAudit')} em ${esc(agora.toLocaleDateString('pt-BR'))} às ${esc(agora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }))}.</p>
<div class="assin"><p>__________________________________<br>Responsável pela coleta</p><p>__________________________________<br>Gestão</p></div>
</body></html>`;
}
