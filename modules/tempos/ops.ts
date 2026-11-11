import { type Atendimento, type Coleta, duracaoEtapa, type Etapa, uid } from './model';
import { atendimentosCol, coletasCol, drafts } from './store';

// Operações do módulo. Rascunhos (em andamento) ficam no aparelho; o servidor recebe o atendimento ao finalizar.
const agoraIso = () => new Date().toISOString();
const pausada = (e: Etapa) => e.pausas.length > 0 && e.pausas[e.pausas.length - 1][1] === null;

/** Encerra a etapa aberta no instante `t` (fecha pausa aberta e grava a duração líquida). */
function fecharEtapa(e: Etapa, t: string): Etapa {
  if (e.fim) return e;
  const pausas = e.pausas.map(([i, f]) => [i, f ?? t] as [string, string]);
  const fechada: Etapa = { ...e, pausas, fim: t };
  return { ...fechada, duracao_s: Math.round(duracaoEtapa({ ...e, pausas }, Date.parse(t)) * 10) / 10 };
}
const fecharAberta = (a: Atendimento, t: string): Atendimento => ({ ...a, etapas: a.etapas.map(e => fecharEtapa(e, t)) });
const renumerar = (etapas: Etapa[]) => etapas.map((e, i) => ({ ...e, ordem: i + 1 }));
const total = (etapas: Etapa[]) => Math.round(etapas.reduce((s, e) => s + e.duracao_s, 0) * 10) / 10;

function editarRascunho(id: string, fn: (a: Atendimento) => Atendimento) {
  const a = drafts.get(id);
  if (a) drafts.put(fn(a));
}

export const ops = {
  /* ---------- Coletas ---------- */
  criarColeta: (c: Omit<Coleta, 'id'>) => { const id = uid('col'); coletasCol.put({ ...c, id }); return id; },
  editarColeta: (c: Coleta) => coletasCol.put(c),
  excluirColeta: (c: Coleta, atendimentos: Atendimento[]) => {
    atendimentos.filter(a => a.coleta_id === c.id).forEach(a => atendimentosCol.remove(a.id));
    drafts.removeWhere(a => a.coleta_id === c.id);
    coletasCol.remove(c.id);
  },

  /* ---------- Atendimento em andamento ---------- */
  iniciar: (coletaId: string, tipo: Atendimento['tipo'], funcionario: string, veiculo = '') => {
    const id = uid('atd');
    drafts.put({ id, coleta_id: coletaId, tipo, funcionario, veiculo, inicio: agoraIso(), fim: null, duracao_s: 0, etapas: [], volume: null, deslocamentos: null, obs: '', origem: 'app' });
    return id;
  },
  /** Inicia uma etapa. Se houver outra em andamento, ela termina no mesmo instante (troca direta). */
  iniciarEtapa: (id: string, atividadeId: string) => editarRascunho(id, a => {
    const t = agoraIso();
    const f = fecharAberta(a, t);
    return { ...f, etapas: [...f.etapas, { ordem: f.etapas.length + 1, atividade_id: atividadeId, inicio: t, fim: null, duracao_s: 0, pausas: [] }] };
  }),
  /** Encerra a etapa atual. Em atividade individual, finaliza o atendimento. */
  finalizarEtapa: (id: string) => {
    const a = drafts.get(id);
    if (!a) return;
    if (a.tipo === 'isolada') { ops.finalizar(id); return; }
    drafts.put(fecharAberta(a, agoraIso()));
  },
  pausar: (id: string) => editarRascunho(id, a => ({ ...a, etapas: a.etapas.map(e => (!e.fim && !pausada(e) ? { ...e, pausas: [...e.pausas, [agoraIso(), null]] } : e)) })),
  retomar: (id: string) => editarRascunho(id, a => ({ ...a, etapas: a.etapas.map(e => (!e.fim && pausada(e) ? { ...e, pausas: e.pausas.map((p, i) => (i === e.pausas.length - 1 ? [p[0], agoraIso()] : p)) } : e)) })),
  editarRascunho: (id: string, patch: Partial<Pick<Atendimento, 'funcionario' | 'obs' | 'volume' | 'deslocamentos' | 'veiculo'>>) => editarRascunho(id, a => ({ ...a, ...patch })),
  removerEtapaRascunho: (id: string, ordem: number) => editarRascunho(id, a => ({ ...a, etapas: renumerar(a.etapas.filter(e => e.ordem !== ordem)) })),
  descartar: (id: string) => drafts.remove(id),

  /** Finaliza: fecha a etapa aberta, calcula durações e grava UMA linha no servidor. Sem etapas, descarta. */
  finalizar: (id: string) => {
    const a = drafts.get(id);
    if (!a) return;
    if (!a.etapas.length) { drafts.remove(id); return; }
    const t = agoraIso();
    const f = fecharAberta(a, t);
    const etapas = renumerar(f.etapas);
    atendimentosCol.put({ ...f, etapas, inicio: etapas[0].inicio ?? f.inicio, fim: t, duracao_s: total(etapas) });
    drafts.remove(id);
  },

  /* ---------- Atendimento finalizado ---------- */
  editarFinalizado: (a: Atendimento, patch: Partial<Pick<Atendimento, 'funcionario' | 'obs' | 'volume' | 'deslocamentos' | 'veiculo'>>) => atendimentosCol.put({ ...a, ...patch }),
  removerEtapaFinalizado: (a: Atendimento, ordem: number) => {
    const etapas = renumerar(a.etapas.filter(e => e.ordem !== ordem));
    if (!etapas.length) { atendimentosCol.remove(a.id); return; }
    atendimentosCol.put({ ...a, etapas, duracao_s: total(etapas) });
  },
  excluirFinalizado: (id: string) => atendimentosCol.remove(id),
};
