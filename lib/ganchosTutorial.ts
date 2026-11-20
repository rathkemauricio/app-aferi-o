// Ganchos entre os tutoriais e os módulos (o motor em tutoriais/ não conhece o app; aqui o app avisa os módulos).
const ouvintes = new Set<() => void>();

/** O módulo Contagens se inscreve: ao ser chamado, volta para a lista de inventários (tela inicial do módulo). */
export const aoReiniciarContagens = (f: () => void) => { ouvintes.add(f); return () => { ouvintes.delete(f); }; };
/** Chamado pelo tutorial de Contagens: leva o módulo de volta à lista (o módulo guarda a última tela aberta). */
export const reiniciarContagens = () => ouvintes.forEach(f => f());
