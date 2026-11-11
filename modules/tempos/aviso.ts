import { useDrafts } from './store';

/** Aviso no card do módulo: atendimentos em andamento neste aparelho. */
export function useTemposAviso() {
  const { list } = useDrafts();
  const n = list.length;
  return n ? `${n} atendimento${n > 1 ? 's' : ''} em andamento` : null;
}
