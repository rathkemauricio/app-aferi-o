import { BANDEIRAS, saveConfig, useConfig } from './data';

// Catálogo de bandeiras (app_config 'bandeiras'), editável pelo administrador.
// Usado no cadastro da filial e no croqui (totem de preços e selo da bandeira).
export type Bandeira = { id: string; nome: string; cor: string; corTexto: string; ativo?: boolean };
export const CFG_BANDEIRAS = 'bandeiras';

export const BANDEIRAS_PADRAO: Bandeira[] = Object.entries(BANDEIRAS).map(([id, b]) => ({ id, nome: b.n, cor: b.c, corTexto: b.tc, ativo: true }));

/** Lista de bandeiras; também atualiza a tabela usada pelo desenho do croqui. */
export function useBandeiras() {
  const lista = useConfig<{ lista: Bandeira[] }>(CFG_BANDEIRAS, { lista: BANDEIRAS_PADRAO }).lista;
  lista.forEach(b => { BANDEIRAS[b.id] = { n: b.nome, c: b.cor, tc: b.corTexto }; });
  return lista;
}
export const bandeirasAtivas = (lista: Bandeira[]) => lista.filter(b => b.ativo !== false);
export const salvarBandeiras = (lista: Bandeira[]) => saveConfig(CFG_BANDEIRAS, { lista });
export const nomeBandeira = (id: string) => BANDEIRAS[id]?.n ?? BANDEIRAS.branca?.n ?? 'Bandeira branca';

/** Cores sugeridas para fundo e texto da bandeira. */
export const CORES_BANDEIRA = ['#6b7280', '#009b3a', '#ffd500', '#0b4ea2', '#e30613', '#d71920', '#f97316', '#7c3aed', '#0891b2', '#111827', '#ffffff', '#1e3a8a'];
