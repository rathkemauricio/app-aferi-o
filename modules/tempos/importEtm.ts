import { docId, docsCol, type Filial, saveFilialDoc } from '../../lib/data';
import type { Dimensionamento } from './DimensionamentoTab';
import { type Atendimento, type Atividade, CLASSES, type Coleta, type Etapa, normNome, type Parametros, uid } from './model';
import { atendimentosCol, coletasCol, type Plano, planoCol, salvarAtividades, salvarParametros, type TmData } from './store';

// Importação do backup JSON exportado pelo ETM_Nevoeiro_Tempos_e_Movimentos_mobile.html (Cadastros → Exportar JSON).
type Antigo = {
  filiais: { id: string; nome: string }[];
  ativ: { id: string; nome: string; setor: string; classe: string; ref: string | number }[];
  regs: { id: string; ex?: number; filial: string; data: string; setor: string; func: string; turno: string; ativ: string; dur: number; esp: number; int: number; desl: number; ret: number; dem: string; vol: number; obs: string }[];
  plano?: { id: string; p: string; c: string; a: string; f: string; r: string; prazo: string; i: string; ben: number; st: string }[];
  dim?: Record<string, Dimensionamento>;
  cfg?: { ritmo: number; tol: number };
};

export type Previa = {
  antigo: Antigo;
  mapaFiliais: Record<string, string>; // id antigo -> id do cadastro único ('' = sem correspondência)
  atividadesNovas: Atividade[];
  registros: number;
  exemplos: number;
};

export function lerBackupEtm(json: string, d: TmData): Previa {
  const o = JSON.parse(json) as Antigo;
  if (!Array.isArray(o.filiais) || !Array.isArray(o.ativ) || !Array.isArray(o.regs)) throw new Error('formato');
  const mapaFiliais: Record<string, string> = {};
  o.filiais.forEach(fa => {
    const alvo = normNome(fa.nome);
    const f = d.filiais.find(x => normNome(x.nome) === alvo || normNome(`${x.codigo} ${x.nome}`) === alvo || normNome(x.codigo) === alvo);
    mapaFiliais[fa.id] = f?.id ?? '';
  });
  const existentes = new Set(d.atividades.map(a => normNome(a.nome)));
  const atividadesNovas = o.ativ.filter(a => !existentes.has(normNome(a.nome))).map(a => ({
    id: uid('atv'), nome: a.nome, setor: a.setor, classe: (CLASSES as readonly string[]).includes(a.classe) ? a.classe : 'Operacional', ref: a.ref === '' || a.ref === undefined ? null : Number(a.ref) || null, ativo: true,
  }));
  return { antigo: o, mapaFiliais, atividadesNovas, registros: o.regs.filter(r => !r.ex).length, exemplos: o.regs.filter(r => r.ex).length };
}

/** Grava a importação. IDs determinísticos (imp-…): importar o mesmo arquivo de novo não duplica. */
export function aplicarImportacao(p: Previa, d: TmData, isAdmin: boolean) {
  const { antigo: o, mapaFiliais } = p;
  const catalogo = isAdmin && p.atividadesNovas.length ? [...d.atividades, ...p.atividadesNovas] : d.atividades;
  if (isAdmin && p.atividadesNovas.length) salvarAtividades(catalogo);
  const porNome = new Map(catalogo.map(a => [normNome(a.nome), a]));
  const atvDe = (idAntigo: string) => { const a = o.ativ.find(x => x.id === idAntigo); return a ? porNome.get(normNome(a.nome)) : undefined; };
  const espera = catalogo.find(a => a.classe === 'Espera'), retrab = catalogo.find(a => a.classe === 'Retrabalho');

  const coletas = new Map<string, Coleta>();
  const atendimentos: Atendimento[] = [];
  let ignorados = 0;
  o.regs.filter(r => !r.ex).forEach(r => {
    const filialId = mapaFiliais[r.filial];
    const atv = atvDe(r.ativ);
    if (!filialId || !atv) { ignorados++; return; }
    const chave = [filialId, r.data, r.setor, r.turno, r.dem, r.func].join('|');
    const colId = `imp-col-${normNome(chave).slice(0, 60)}-${chave.length}`;
    if (!coletas.has(colId)) coletas.set(colId, { id: colId, filial_id: filialId, data: r.data, setor: r.setor, funcao: r.func || '', turno: r.turno || '', demanda: r.dem || '', auditor: '' });
    const etapas: Etapa[] = [{ ordem: 1, atividade_id: atv.id, inicio: null, fim: null, duracao_s: Math.round((Number(r.dur) || 0) * 600) / 10, pausas: [] }];
    if (Number(r.esp) > 0 && espera) etapas.push({ ordem: etapas.length + 1, atividade_id: espera.id, inicio: null, fim: null, duracao_s: Number(r.esp) * 60, pausas: [] });
    if (Number(r.ret) > 0 && retrab) etapas.push({ ordem: etapas.length + 1, atividade_id: retrab.id, inicio: null, fim: null, duracao_s: Number(r.ret) * 60, pausas: [] });
    const obs = [r.obs, Number(r.int) > 0 ? `Interrupções: ${r.int} min` : ''].filter(Boolean).join(' · ');
    atendimentos.push({
      id: `imp-${r.id}`, coleta_id: colId, tipo: 'isolada', funcionario: '', inicio: null, fim: null,
      duracao_s: etapas.reduce((x, e) => x + e.duracao_s, 0), etapas, volume: Number(r.vol) || null, deslocamentos: Number(r.desl) || null, obs, origem: 'importado',
    });
  });
  coletasCol.putMany([...coletas.values()]);
  atendimentosCol.putMany(atendimentos);

  const planos: Plano[] = (o.plano ?? []).map(x => ({
    id: `imp-${x.id}`, filial_id: mapaFiliais[x.f] || null, problema: x.p, causa: x.c ?? '', acao: x.a ?? '', responsavel: x.r ?? '', prazo: x.prazo || null,
    indicador: x.i ?? '', beneficio_h: Number(x.ben) || 0, status: (['Aberto', 'Em andamento', 'Concluído'].includes(x.st) ? x.st : 'Aberto') as Plano['status'],
  }));
  if (planos.length) planoCol.putMany(planos);

  let dims = 0;
  Object.entries(o.dim ?? {}).forEach(([idAntigo, dim]) => {
    const filialId = mapaFiliais[idAntigo];
    if (filialId && !docsCol.get(docId(filialId, 'dimensionamento'))) { saveFilialDoc(filialId, 'dimensionamento', dim); dims++; }
  });
  if (isAdmin && o.cfg) salvarParametros({ ritmo: Number(o.cfg.ritmo) || 1, tol: Number(o.cfg.tol) || 0 } as Parametros);

  return { coletas: coletas.size, atendimentos: atendimentos.length, ignorados, planos: planos.length, dims };
}

export const rotuloFilial = (f?: Filial) => (f ? `${f.codigo} · ${f.nome}` : 'Sem correspondência');
