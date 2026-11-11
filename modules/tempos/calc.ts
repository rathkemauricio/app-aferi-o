import { type Atendimento, CLASSES, type Coleta, pausaSeg } from './model';
import type { TmData } from './store';

export type Filtro = { filialId: string; setor: string; demanda: string };

export type IndicadorAtividade = {
  id: string;
  nome: string;
  ref: number | null;
  ciclos: number;
  mediaSeg: number;
  totalSeg: number;
  padraoSeg: number | null; // só com 10+ ciclos
  situacao: 'amostra' | 'sem-ref' | 'acima' | 'dentro';
};

export const coletasFiltradas = (d: TmData, f: Filtro) =>
  d.coletas.filter(c => (!f.filialId || c.filial_id === f.filialId) && (!f.setor || c.setor === f.setor) && (!f.demanda || c.demanda === f.demanda));

/** Atendimentos finalizados das coletas informadas. */
export function atendimentosDe(d: TmData, cs: Coleta[]) {
  const ids = new Set(cs.map(c => c.id));
  return d.atendimentos.filter(a => ids.has(a.coleta_id));
}

export function indicadores(d: TmData, f: Filtro) {
  const cs = coletasFiltradas(d, f);
  const ats = atendimentosDe(d, cs);
  const etapas = ats.flatMap(a => a.etapas);
  const byId = new Map(d.atividades.map(a => [a.id, a]));

  const porAtv = new Map<string, { n: number; t: number }>();
  const porClasse = new Map<string, number>(CLASSES.map(c => [c, 0]));
  etapas.forEach(e => {
    const o = porAtv.get(e.atividade_id) ?? { n: 0, t: 0 };
    o.n++; o.t += e.duracao_s; porAtv.set(e.atividade_id, o);
    const cl = byId.get(e.atividade_id)?.classe;
    if (cl) porClasse.set(cl, (porClasse.get(cl) ?? 0) + e.duracao_s);
  });

  const fator = d.parametros.ritmo * (1 + d.parametros.tol / 100);
  const atividades: IndicadorAtividade[] = [...porAtv.entries()].map(([id, o]) => {
    const atv = byId.get(id);
    const mediaSeg = o.t / o.n;
    const ref = atv?.ref ?? null;
    const situacao: IndicadorAtividade['situacao'] = o.n < 10 ? 'amostra' : !ref ? 'sem-ref' : mediaSeg / 60 > ref ? 'acima' : 'dentro';
    return { id, nome: atv?.nome ?? 'Atividade removida', ref, ciclos: o.n, mediaSeg, totalSeg: o.t, padraoSeg: o.n >= 10 ? mediaSeg * fator : null, situacao };
  }).sort((a, b) => b.totalSeg - a.totalSeg);

  const completos = ats.filter(a => a.tipo === 'completo');
  const total = etapas.reduce((s, e) => s + e.duracao_s, 0);
  const espera = porClasse.get('Espera') ?? 0;
  const pausas = etapas.reduce((s, e) => s + pausaSeg(e), 0);

  return {
    coletas: cs.length,
    atendimentos: completos.length,
    isoladas: ats.length - completos.length,
    etapas: etapas.length,
    mediaAtendimentoSeg: completos.length ? completos.reduce((s, a) => s + a.duracao_s, 0) / completos.length : 0,
    totalSeg: total,
    esperaSeg: espera,
    retrabalhoSeg: porClasse.get('Retrabalho') ?? 0,
    interrupcoesSeg: pausas,
    deslocamentos: ats.reduce((s, a) => s + (a.deslocamentos ?? 0), 0),
    ocupacao: total + pausas ? ((total - espera) / (total + pausas)) * 100 : 0,
    volume: ats.reduce((s, a) => s + (a.volume ?? 0), 0),
    // Tempo médio do atendimento por tipo de veículo (só atendimentos com veículo informado).
    porVeiculo: d.veiculos.map(v => { const xs = ats.filter(a => a.veiculo === v.id); return [v.nome, xs.length ? xs.reduce((s, a) => s + a.duracao_s, 0) / xs.length : 0, xs.length] as [string, number, number]; }).filter(([, , n]) => n > 0),
    porClasse: CLASSES.map(c => [c, porClasse.get(c) ?? 0] as [string, number]).filter(([, v]) => v > 0),
    atividades,
  };
}

/** Média observada de uma atividade (por nome normalizado) numa filial, para o dimensionamento. */
export function mediaObservada(d: TmData, filialId: string, atividadeIds: string[]) {
  const cs = d.coletas.filter(c => c.filial_id === filialId);
  const etapas = atendimentosDe(d, cs).flatMap(a => a.etapas).filter(e => atividadeIds.includes(e.atividade_id));
  return etapas.length ? { n: etapas.length, minutos: etapas.reduce((s, e) => s + e.duracao_s, 0) / etapas.length / 60 } : null;
}

/** Uma linha por etapa, para o CSV. */
export function csvEtapas(d: TmData, cs: Coleta[]) {
  const filial = (id: string) => { const f = d.filiais.find(x => x.id === id); return f ? `${f.codigo} ${f.nome}` : ''; };
  const atv = (id: string) => d.atividades.find(a => a.id === id);
  const header = ['data', 'filial', 'setor', 'funcao', 'turno', 'demanda', 'auditor', 'atendimento_id', 'tipo', 'veiculo', 'funcionario', 'ordem', 'atividade', 'classe', 'inicio', 'termino', 'duracao_s', 'pausas_s', 'total_atendimento_s', 'volume', 'deslocamentos', 'origem', 'obs'];
  const rows: (string | number)[][] = [];
  const porColeta = new Map(cs.map(c => [c.id, c]));
  d.atendimentos.filter(a => porColeta.has(a.coleta_id)).forEach((a: Atendimento) => {
    const c = porColeta.get(a.coleta_id)!;
    a.etapas.forEach(e => {
      const x = atv(e.atividade_id);
      rows.push([c.data, filial(c.filial_id), c.setor, c.funcao, c.turno, c.demanda, c.auditor, a.id, a.tipo, d.veiculos.find(v => v.id === a.veiculo)?.nome ?? '', a.funcionario, e.ordem, x?.nome ?? '', x?.classe ?? '',
        e.inicio ?? '', e.fim ?? '', e.duracao_s.toFixed(1), pausaSeg(e).toFixed(1), a.duracao_s.toFixed(1), a.volume ?? '', a.deslocamentos ?? '', a.origem, a.obs]);
    });
  });
  return [header, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(';')).join('\n');
}
