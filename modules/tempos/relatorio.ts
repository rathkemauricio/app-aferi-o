import { esc } from '../../lib/util';
import { type Filtro, coletasFiltradas, atendimentosDe, indicadores, progressoFilial } from './calc';
import { ciclosMinimos, dataBR, fmtMin, num } from './model';
import { statusDaFilial, type TmData } from './store';

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

export function relatorioTemposHtml(d: TmData, f: Filtro, marca: { nome: string; logo: string | null }, quem: string) {
  const r = indicadores(d, f);
  const cs = [...coletasFiltradas(d, f)].sort((a, b) => a.data.localeCompare(b.data));
  const ats = atendimentosDe(d, cs);
  const filial = d.filiais.find(x => x.id === f.filialId);
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
.nota{font-size:10.5px;color:#66788a}.assin{margin-top:36px;display:flex;gap:40px}
</style></head><body>
<div class="head"><div>${marca.logo ? `<img src="${marca.logo}" alt="${esc(marca.nome)}" style="max-height:44px;max-width:180px;object-fit:contain;display:block;margin-bottom:6px">` : ''}<div class="marca">${esc(marca.nome.toUpperCase())}</div><h1>Relatório de Tempos e Movimentos</h1><div class="muted">${esc(filtroTxt)}</div></div>
<div style="text-align:right"><b>${esc(filial ? nomeFilial(filial.id) : 'Todas as filiais')}</b><div>${esc(periodo)}</div><small class="muted">${fimEm ? `COLETAS FINALIZADAS EM ${esc(new Date(fimEm).toLocaleDateString('pt-BR'))}` : filial ? 'COLETAS EM ANDAMENTO' : 'CONSOLIDADO DA REDE'}</small></div></div>

<h3>Identificação</h3>
<p><b>Filial:</b> ${esc(filial ? nomeFilial(filial.id) : 'Todas as filiais')}<br><b>Setor:</b> ${esc(f.setor || 'Todos')} · <b>Demanda:</b> ${esc(f.demanda || 'Todas')}<br>
<b>Período das coletas:</b> ${esc(periodo)} · <b>Coletas:</b> ${cs.length}<br><b>Auditor(es):</b> ${esc(auditores)}${fimEm && status?.finalizado_por_nome ? `<br><b>Finalizado por:</b> ${esc(status.finalizado_por_nome)}` : ''}</p>

<h3>Resumo executivo</h3>
<div class="grid">
${stat(String(r.atendimentos), 'Atendimentos completos')}${stat(String(r.isoladas), 'Atividades individuais')}${stat(fmtMin(r.mediaAtendimentoSeg), 'Min por atendimento (média)')}${stat(String(r.etapas), 'Etapas cronometradas')}
${stat(fmtMin(r.totalSeg), 'Min em atividade')}${stat(fmtMin(r.esperaSeg), 'Min de espera')}${stat(fmtMin(r.interrupcoesSeg), 'Min de pausas')}${stat(fmtMin(r.retrabalhoSeg), 'Min de retrabalho')}
${stat(num(r.ocupacao) + '%', 'Ocupação')}${stat(num(r.deslocamentos), 'Deslocamentos')}${stat(num(r.volume), 'Litros (pelas faixas)')}
</div>
${r.etapas ? `<p>${acima.length ? `<b>${acima.length}</b> atividade(s) com tempo médio acima da referência: ${esc(acima.map(a => a.nome).join(', '))}.` : 'Nenhuma atividade com amostra suficiente ficou acima da referência.'}</p>` : '<p>Ainda não há atendimentos ou atividades finalizados neste filtro.</p>'}

${prog ? `<h3>Andamento das coletas da filial</h3>
<div class="${prog.completo ? 'ok' : 'aviso'}"><b>${prog.coletas} de ${prog.meta} coletas</b> (meta padrão) · ${prog.comAmostra} de ${prog.atividades} atividades com ${prog.minimo} ou mais ciclos.<br>
Turnos: ${prog.turnos.map(([t, n]) => `${esc(t)} ${n}`).join(' · ')} · Demandas: ${prog.demandas.map(([x, n]) => `${esc(x)} ${n}`).join(' · ')}
${prog.faltas.length ? `<br><b>Falta:</b> ${esc(prog.faltas.join('; '))}.` : '<br>Coletas completas pela meta.'}</div>` : ''}

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
