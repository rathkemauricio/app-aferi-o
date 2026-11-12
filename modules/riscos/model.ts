import type { SyncRow } from '../../lib/sync';
import { dataBR, diasAte, hojeISO } from '../../lib/util';

// Mapa de Risco (Prevenção de Perdas) e Programa Filial Destaque.
// Regras copiadas do HTML "Programa Filial Destaque": matriz 1–5 por critério, classe pelo total,
// frequência de visita pela classe, prioridade da agenda e pontuação 0–100 do programa.

export type Crit = 'p' | 'c' | 'cx' | 'pe' | 'h';
export const CRITS: Crit[] = ['p', 'c', 'cx', 'pe', 'h'];
export type Notas = Record<string, number>; // 'AAAA-MM' -> nota 0–10

export type Unidade = SyncRow & {
  nome: string; filial_id: string | null;
  p: number; c: number; cx: number; pe: number; h: number;
  ultima_revisao: string | null; proxima_visita: string | null; notas: Notas;
};
export type Pontuacao = SyncRow & {
  unidade_id: string; periodo: string; nota: number; p: number; c: number; cx: number; pe: number; h: number; planos: number; obs: string;
};
export type Evidencia = { path: string; nome: string; tipo: string };
export type StatusAtiv = 'Pendente' | 'Concluído';
export type Atividade = SyncRow & {
  unidade_id: string; data: string; tarefa: string; categoria: string; obs: string; status: StatusAtiv;
  levar_proxima: boolean; proxima_visita: string | null; evidencia: Evidencia | null; concluido_em: string | null;
};
export type StatusTarefa = 'Pendente' | 'Concluída' | 'Não concluída';
export type Tarefa = {
  id: string; titulo: string; desc: string; categoria: string; obs: string; evidencia: Evidencia | null; status: StatusTarefa;
  levar: boolean; prodLancada: boolean; acaoLancada: boolean; criada: string;
};
export type Visita = SyncRow & { unidade_id: string; data: string; tarefas: Tarefa[] };

export const CATEGORIAS = ['Checklist', 'Estoque', 'Caixa / Financeiro', 'Combustíveis', 'Documentação', 'Plano de Ação', 'Outro'];

/* ---------- Critérios ---------- */
export const NOTA_FAIXAS = [
  { label: 'Excelente', faixa: '9–10', min: 9, cor: '#16845b', desc: 'Processos 100% conformes.', acao: 'Manutenção e reconhecimento.' },
  { label: 'Bom', faixa: '7–8', min: 7, cor: '#2f6fd0', desc: 'Falhas leves sem prejuízo imediato.', acao: 'Plano de ação preventivo.' },
  { label: 'Regular', faixa: '5–6', min: 5, cor: '#b7791f', desc: 'Falhas moderadas e reincidências.', acao: 'Treinamento em 30 dias.' },
  { label: 'Crítico', faixa: '0–4', min: 0, cor: '#c43d48', desc: 'Risco financeiro ou operacional alto.', acao: 'Intervenção imediata do gestor.' },
];
export type Nivel = 'baixo' | 'medio' | 'alto';
export const MATRIZ: { k: Crit; nome: string; curto: string; feeds: string; baixo: string; medio: string; alto: string }[] = [
  { k: 'p', nome: 'Produtos', curto: 'Produtos', feeds: 'Controle de Perdas 15%', baixo: 'Perdas controladas; estoque ajustado; vencimentos pontuais.', medio: 'Perdas dentro do limite, porém recorrentes.', alto: 'Perdas acima do aceitável; falhas de controle; vencimentos frequentes.' },
  { k: 'c', nome: 'Combustíveis', curto: 'Combustív.', feeds: 'Controle de Perdas 15%', baixo: 'Diferenças raras e justificadas; controle consistente.', medio: 'Diferenças recorrentes dentro do limite.', alto: 'Diferenças físicas x sistema relevantes; falhas em descarga/medição/LMC.' },
  { k: 'cx', nome: 'Caixa / Valores', curto: 'Caixa', feeds: 'Controle de Perdas 15%', baixo: 'Diferenças eventuais e justificadas.', medio: 'Diferenças frequentes, sem indício de fraude.', alto: 'Diferenças constantes; falhas graves; indícios de fraude.' },
  { k: 'pe', nome: 'Pessoas e Gestão', curto: 'Pessoas', feeds: 'Consistência 10%', baixo: 'Equipe estável; treinamentos em dia; aderência a procedimentos.', medio: 'Rotatividade moderada; falhas pontuais.', alto: 'Alta rotatividade; resistência a controles; descumprimento recorrente.' },
  { k: 'h', nome: 'Histórico Auditorias', curto: 'Hist. Audit.', feeds: 'Evolução 20%', baixo: 'Conformidades mantidas; evolução positiva.', medio: 'Não conformidades recorrentes, com planos parcialmente cumpridos.', alto: 'Reincidência grave; planos não cumpridos; piora após visitas.' },
];
export const NIVEIS: Record<Nivel, { label: string; faixa: string }> = { baixo: { label: 'Baixo', faixa: '1–2' }, medio: { label: 'Médio', faixa: '3' }, alto: { label: 'Alto', faixa: '4–5' } };
export const nivelDe = (v: number): Nivel => (v <= 2 ? 'baixo' : v === 3 ? 'medio' : 'alto');
export const PESOS = { audit: 0.4, evolution: 0.2, loss: 0.15, action: 0.15, consistency: 0.1 };
export const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
export const MESES_LONGOS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

/* ---------- Classe de risco ---------- */
export type Classe = 'Risco Baixo' | 'Risco Médio' | 'Risco Alto';
export const CLASSES: Classe[] = ['Risco Baixo', 'Risco Médio', 'Risco Alto'];
export const COR_CLASSE: Record<Classe, string> = { 'Risco Baixo': '#16a36a', 'Risco Médio': '#d99a0b', 'Risco Alto': '#d93a3a' };
export const corNivel = (v: number) => (v <= 0 ? '#9aa4b2' : v <= 2 ? COR_CLASSE['Risco Baixo'] : v <= 3 ? COR_CLASSE['Risco Médio'] : COR_CLASSE['Risco Alto']);
export function risco(p: number, c: number, cx: number, pe: number, h: number) {
  const tot = p + c + cx + pe + h;
  const cl: Classe = tot <= 9 ? 'Risco Baixo' : tot <= 17 ? 'Risco Médio' : 'Risco Alto';
  const fr = cl === 'Risco Baixo' ? 'Trimestral / Quadrimestral' : cl === 'Risco Médio' ? 'Bimestral' : 'Mensal';
  return { tot, cl, fr };
}
export const riscoDe = (u: Pick<Unidade, Crit>) => risco(u.p, u.c, u.cx, u.pe, u.h);
export const avaliada = (u: Pick<Unidade, Crit>) => CRITS.every(k => Number(u[k]) >= 1);

/** Próxima visita: última revisão + 4 meses (baixo), 2 meses (médio) ou 1 mês (alto). */
export function calcProxima(ultima: string | null, cl: Classe): string | null {
  if (!ultima || !/^\d{4}-\d{2}-\d{2}$/.test(ultima)) return null;
  const [y, m, d] = ultima.split('-').map(Number);
  const dt = new Date(y, m - 1 + (cl === 'Risco Baixo' ? 4 : cl === 'Risco Médio' ? 2 : 1), d);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}
export const vencida = (iso: string | null) => { const d = diasAte(iso); return d !== null && d < 0; };

/* ---------- Agenda: prioridade automática ---------- */
export type Prioridade = { nome: 'Crítica' | 'Alta' | 'Média' | 'Baixa'; chave: number; acao: string };
export const PRIORIDADES = ['Crítica', 'Alta', 'Média', 'Baixa'] as const;
export function prioridade(u: Unidade): Prioridade {
  const dias = diasAte(u.proxima_visita);
  const cl = riscoDe(u).cl;
  if (cl === 'Risco Alto' && dias !== null && dias <= 0) return { nome: 'Crítica', chave: 4, acao: 'Realizar auditoria imediatamente' };
  if (dias !== null && dias < 0) return { nome: 'Crítica', chave: 4, acao: 'Auditoria vencida' };
  if (cl === 'Risco Alto') return { nome: 'Alta', chave: 3, acao: 'Programar com prioridade' };
  if (dias !== null && dias <= 15) return { nome: 'Alta', chave: 3, acao: 'Programar nos próximos 15 dias' };
  if (dias !== null && dias <= 30) return { nome: 'Média', chave: 2, acao: 'Programar neste ciclo' };
  return { nome: 'Baixa', chave: 1, acao: 'Acompanhar agenda' };
}
export function situacaoData(iso: string | null) {
  const d = diasAte(iso);
  if (d === null) return 'Data não definida';
  if (d === 0) return 'Hoje';
  return d > 0 ? `em ${d} dia${d === 1 ? '' : 's'}` : `vencida há ${-d} dia${d === -1 ? '' : 's'}`;
}

/* ---------- Produtividade ---------- */
export const pendentes = (ativ: Atividade[], uid: string) => ativ.filter(a => a.unidade_id === uid && a.status === 'Pendente' && a.levar_proxima);
/** Pendências que precisam ser verificadas nesta visita (chegou a data da próxima visita). */
export function pendentesDaVisita(ativ: Atividade[], u: Unidade) {
  if (!u.proxima_visita) return [];
  const hoje = hojeISO();
  if (hoje < u.proxima_visita) return [];
  return pendentes(ativ, u.id).filter(a => !a.proxima_visita || hoje >= a.proxima_visita);
}

/* ---------- Planejamento ---------- */
export function statsPlano(visitas: Visita[], uid: string) {
  const vs = visitas.filter(v => v.unidade_id === uid);
  const ts = vs.flatMap(v => v.tarefas);
  const done = ts.filter(t => t.status === 'Concluída').length;
  const notDone = ts.filter(t => t.status === 'Não concluída').length;
  return { total: ts.length, done, notDone, pending: ts.length - done - notDone, visits: vs.length, pct: ts.length ? Math.round((done / ts.length) * 100) : 0 };
}
export type StatsPlano = ReturnType<typeof statsPlano>;
export const progressoVisita = (v: Visita) => (v.tarefas.length ? Math.round((v.tarefas.filter(t => t.status === 'Concluída').length / v.tarefas.length) * 100) : 0);

/* =====================================================================
   Programa Filial Destaque
   - Nota da auditoria 0–10 → Resultado da Auditoria (40%) = nota × 10
   - Histórico Auditorias 1–5 → Evolução (20%) = (5 − pontuação) ÷ 4 × 100
   - Produtos, Combustíveis, Caixa 1–5 → Controle de Perdas (15%) = média, mesma conversão
   - Planos de ação (% concluídos) → Planos de Ação (15%)
   - Pessoas e Gestão 1–5 → Consistência (10%)
   - Selo só com auditoria Boa ou melhor (nota ≥ 7); Ouro exige nota ≥ 9, sem Risco Alto e sem plano não concluído.
   ===================================================================== */
const clamp = (v: number, a: number, b: number) => (Number.isFinite(Number(v)) ? Math.max(a, Math.min(b, Number(v))) : a);
export const fmtNota = (n: number) => (Number.isInteger(Number(n)) ? String(n) : Number(n).toFixed(1).replace('.', ','));
export const fmt1 = (n: number) => n.toFixed(1).replace('.', ',');
export const notaFaixa = (n: number) => NOTA_FAIXAS.find(f => Number(n) >= f.min) ?? NOTA_FAIXAS[NOTA_FAIXAS.length - 1];
const r100 = (v: number) => clamp(((5 - v) / 4) * 100, 0, 100);
export type Comps = { audit: number; evolution: number; loss: number; action: number; consistency: number };
export type Scores = { nota: number; p: number; c: number; cx: number; pe: number; h: number; plans: number };
export const compsDe = (s: Scores): Comps => ({ audit: clamp(s.nota, 0, 10) * 10, evolution: r100(s.h), loss: r100((s.p + s.c + s.cx) / 3), action: clamp(s.plans, 0, 100), consistency: r100(s.pe) });
export const totalDe = (c: Comps) => c.audit * PESOS.audit + c.evolution * PESOS.evolution + c.loss * PESOS.loss + c.action * PESOS.action + c.consistency * PESOS.consistency;
export type Selo = 'Ouro' | 'Prata' | 'Bronze' | 'Acompanhamento' | 'Estimado' | 'Sem dados';
export function seloDe(total: number | null, nota: number, bloqueado: boolean): Selo {
  if (total === null) return 'Sem dados';
  if (nota < 7) return 'Acompanhamento';
  if (total >= 90 && nota >= 9 && !bloqueado) return 'Ouro';
  if (total >= 80) return 'Prata';
  if (total >= 70) return 'Bronze';
  return 'Acompanhamento';
}
export const SELO_UI: Record<Selo, { t: string; cor: string; fundo: string }> = {
  Ouro: { t: '⭐ FILIAL OURO', cor: '#8f691c', fundo: '#fdf1c9' },
  Prata: { t: '🥈 FILIAL PRATA', cor: '#5b6675', fundo: '#eef1f5' },
  Bronze: { t: '🥉 FILIAL BRONZE', cor: '#8a4a22', fundo: '#f8e6d6' },
  Acompanhamento: { t: 'EM ACOMPANHAMENTO', cor: '#b42318', fundo: '#fdecea' },
  Estimado: { t: 'SEM LANÇAMENTO', cor: '#596173', fundo: '#eef0f3' },
  'Sem dados': { t: 'SEM DADOS', cor: '#596173', fundo: '#eef0f3' },
};
export const corPontos = (v: number) => (v >= 90 ? '#16845b' : v >= 80 ? '#2f6fd0' : v >= 70 ? '#b7791f' : '#c43d48');
export const planosPadrao = (ps: StatsPlano) => (ps.total === 0 ? 100 : ps.pct);
export function bloqueios(cl: Classe, ps: StatsPlano, comPlanos: boolean) {
  const out: string[] = [];
  if (cl === 'Risco Alto') out.push('Risco Alto na matriz');
  if (comPlanos && ps.notDone > 0) out.push(`${ps.notDone} plano${ps.notDone > 1 ? 's' : ''} de ação não concluído${ps.notDone > 1 ? 's' : ''}`);
  return out;
}
export const periodoAtual = () => hojeISO().slice(0, 7);
export const periodoCurto = (p: string) => { const m = String(p).match(/^(\d{4})-(\d{2})$/); return m ? `${MESES[+m[2] - 1]}/${m[1]}` : p; };
export const periodoLongo = (p: string | null) => { const m = String(p ?? '').match(/^(\d{4})-(\d{2})$/); const d = new Date(); return m ? `${MESES_LONGOS[+m[2] - 1]} de ${m[1]}` : `${MESES_LONGOS[d.getMonth()]} de ${d.getFullYear()}`; };

/** Histórico de notas da unidade: notas mensais + pontuações lançadas (o lançamento prevalece). */
export function historicoNotas(u: Unidade, pts: Pontuacao[]) {
  const mapa: Record<string, number> = { ...(u.notas ?? {}) };
  pts.filter(x => x.unidade_id === u.id).forEach(x => { mapa[x.periodo] = Number(x.nota); });
  return Object.keys(mapa).sort().map(p => ({ periodo: p, nota: mapa[p] }));
}

export type Modo = string; // 'current' | 'AAAA' | 'AAAA-MM'
export type Metricas = {
  fonte: 'lancamento' | 'auditoria' | 'estimado' | 'sem-dados'; real: boolean; comps: Comps | null; nota: number | null; ultimaNota: number | null;
  periodo: string | null; periodoTxt: string; obs: string; cl: Classe; scores: Scores | null; total: number | null;
  anterior: number | null; delta: number | null; motivos: string[]; bloqueado: boolean; selo: Selo; elegivel: boolean; destaque: boolean; ps: StatsPlano;
};

export function metricas(u: Unidade, pts: Pontuacao[], visitas: Visita[], modo: Modo): Metricas {
  const ps = statsPlano(visitas, u.id);
  const hist = historicoNotas(u, pts);
  const doUnidade = pts.filter(x => x.unidade_id === u.id).sort((a, b) => a.periodo.localeCompare(b.periodo));
  const lanc = modo === 'current' ? doUnidade.slice(-1) : /^\d{4}-\d{2}$/.test(modo) ? doUnidade.filter(x => x.periodo === modo) : doUnidade.filter(x => x.periodo.startsWith(modo));
  const rk = riscoDe(u);
  let b: Pick<Metricas, 'fonte' | 'real' | 'comps' | 'nota' | 'ultimaNota' | 'periodo' | 'periodoTxt' | 'obs' | 'cl' | 'scores'>;
  if (lanc.length) {
    const ms = lanc.map(l => { const s: Scores = { nota: clamp(l.nota, 0, 10), p: +l.p, c: +l.c, cx: +l.cx, pe: +l.pe, h: +l.h, plans: clamp(l.planos, 0, 100) }; return { l, s, comps: compsDe(s) }; });
    const ult = ms[ms.length - 1];
    let comps = ult.comps, nota = ult.s.nota, periodoTxt = periodoCurto(ult.l.periodo);
    if (ms.length > 1) {
      const avg = (k: keyof Comps) => ms.reduce((a, x) => a + x.comps[k], 0) / ms.length;
      comps = { audit: avg('audit'), evolution: avg('evolution'), loss: avg('loss'), action: avg('action'), consistency: avg('consistency') };
      nota = ms.reduce((a, x) => a + x.s.nota, 0) / ms.length;
      periodoTxt = `média de ${ms.length} lançamentos`;
    }
    b = { fonte: 'lancamento', real: true, comps, nota, ultimaNota: ult.s.nota, periodo: ult.l.periodo, periodoTxt, obs: ult.l.obs, cl: risco(ult.s.p, ult.s.c, ult.s.cx, ult.s.pe, ult.s.h).cl, scores: ult.s };
  } else if (modo === 'current' && avaliada(u)) {
    const est = !hist.length;
    const nota = est ? Math.round(clamp(100 - ((rk.tot - 5) / 20) * 100, 0, 100)) / 10 : hist[hist.length - 1].nota;
    const scores: Scores = { nota, p: u.p, c: u.c, cx: u.cx, pe: u.pe, h: u.h, plans: planosPadrao(ps) };
    b = { fonte: est ? 'estimado' : 'auditoria', real: !est, comps: compsDe(scores), nota, ultimaNota: nota, periodo: est ? null : hist[hist.length - 1].periodo,
      periodoTxt: est ? '' : periodoCurto(hist[hist.length - 1].periodo), obs: '', cl: rk.cl, scores };
  } else {
    b = { fonte: 'sem-dados', real: false, comps: null, nota: null, ultimaNota: null, periodo: null, periodoTxt: '', obs: '', cl: rk.cl, scores: null };
  }
  const total = b.comps ? totalDe(b.comps) : null;
  const prevE = b.periodo ? hist.filter(h => h.periodo < b.periodo!).pop() : undefined;
  const anterior = prevE ? prevE.nota : null;
  const delta = anterior !== null && b.ultimaNota !== null ? b.ultimaNota - anterior : null;
  const motivos = b.real ? bloqueios(b.cl, ps, modo === 'current') : [];
  const selo: Selo = b.real ? seloDe(total, b.nota ?? 0, motivos.length > 0) : b.fonte === 'estimado' ? 'Estimado' : 'Sem dados';
  return { ...b, total, anterior, delta, motivos, bloqueado: motivos.length > 0, selo, elegivel: b.real && !motivos.length && (b.nota ?? 0) >= 7, destaque: false, ps };
}

export type LinhaRanking = { u: Unidade; m: Metricas; pos: number | null };
export function ranking(unidades: Unidade[], pts: Pontuacao[], visitas: Visita[], modo: Modo): LinhaRanking[] {
  const rows: LinhaRanking[] = unidades.map(u => ({ u, m: metricas(u, pts, visitas, modo), pos: null }));
  const grp = (x: LinhaRanking) => (x.m.real ? 0 : x.m.total !== null ? 1 : 2);
  rows.sort((a, b) => grp(a) - grp(b) || (b.m.total ?? -1) - (a.m.total ?? -1) || a.u.nome.localeCompare(b.u.nome, 'pt-BR', { numeric: true }));
  let pos = 0; let dest: LinhaRanking | null = null;
  rows.forEach(x => { if (x.m.real) { x.pos = ++pos; if (!dest && x.m.elegivel) dest = x; } });
  if (dest) (dest as LinhaRanking).m.destaque = true;
  return rows;
}

export function nivelCertificado(x: LinhaRanking): { ok: true; premio: string } | { ok: false; motivo: string } {
  const m = x.m;
  if (!m.real || m.nota === null) return { ok: false, motivo: 'Lance a pontuação desta unidade para emitir o certificado.' };
  if (m.nota < 7) return { ok: false, motivo: `Certificado indisponível: auditoria ${notaFaixa(m.nota).label} (nota ${fmtNota(m.nota)}). O mínimo é Bom (nota 7).` };
  if (m.selo === 'Ouro') return { ok: true, premio: 'Filial Ouro' };
  if (m.destaque) return { ok: true, premio: 'Filial Destaque' };
  if (m.selo === 'Prata') return { ok: true, premio: 'Filial Prata' };
  if (m.selo === 'Bronze') return { ok: true, premio: 'Filial Bronze' };
  return { ok: false, motivo: m.bloqueado ? `Certificado indisponível: ${m.motivos.join(' e ')} impedem Ouro e Destaque, e a pontuação ficou abaixo de 70.` : 'Certificado indisponível: pontuação abaixo de 70 pontos.' };
}

/* ---------- Histórico de auditorias: média e tendência do ano ---------- */
export function resumoAno(notas: Notas, ano: number) {
  const vals = MESES.map((_, i) => notas?.[`${ano}-${String(i + 1).padStart(2, '0')}`]).filter((v): v is number => v !== undefined && v !== null && Number.isFinite(Number(v))).map(Number);
  if (!vals.length) return { media: null as number | null, status: null as string | null };
  const media = Math.round((vals.reduce((a, v) => a + v, 0) / vals.length) * 10) / 10;
  const l = vals[vals.length - 1], p = vals[vals.length - 2];
  return { media, status: vals.length > 1 ? (l > p ? 'Melhorou' : l < p ? 'Piorou' : 'Manteve') : 'Manteve' };
}

export { dataBR };
