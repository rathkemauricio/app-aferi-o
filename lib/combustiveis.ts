import { saveConfig, useConfig } from './data';

// Catálogo único de combustíveis (app_config 'combustiveis'), usado pelo Aferições (bicos) e pelo Croqui (bombas e bicos).
// Só o administrador altera. Combustível desativado some das listas de escolha, mas continua aparecendo onde já foi usado.
export type Combustivel = { id: string; nome: string; cor: string; ativo?: boolean };

export const CFG_COMBUSTIVEIS = 'combustiveis';

// IDs iguais aos tipos de bomba do Croqui, para os desenhos existentes continuarem iguais.
export const COMBUSTIVEIS_PADRAO: Combustivel[] = [
  { id: 'bomba_gc', nome: 'Gasolina comum', cor: '#e53935' },
  { id: 'bomba_ga', nome: 'Gasolina aditivada', cor: '#8e24aa' },
  { id: 'bomba_gp', nome: 'Gasolina premium', cor: '#c2185b' },
  { id: 'bomba_pod', nome: 'Gasolina Podium', cor: '#212121' },
  { id: 'bomba_ipi', nome: 'Gasolina Ipimax', cor: '#00897b' },
  { id: 'bomba_grid', nome: 'Gasolina Grid', cor: '#e91e63' },
  { id: 'bomba_et', nome: 'Etanol', cor: '#2e9e4f' },
  { id: 'bomba_d', nome: 'Diesel S10', cor: '#6d4c41' },
  { id: 'bomba_d500', nome: 'Diesel S500', cor: '#c0841a' },
  { id: 'bomba_da', nome: 'Diesel aditivado', cor: '#1f3a5f' },
  { id: 'bomba_outro', nome: 'Outro', cor: '#7a8594' },
];

/** Cores oferecidas ao cadastrar um combustível. */
export const CORES_COMBUSTIVEL = ['#e53935', '#c2185b', '#e91e63', '#8e24aa', '#5e35b1', '#3949ab', '#1e88e5', '#039be5', '#00897b', '#2e9e4f', '#7cb342', '#c0841a', '#f4511e', '#6d4c41', '#1f3a5f', '#212121', '#7a8594'];

export function useCombustiveis() {
  return useConfig<{ lista: Combustivel[] }>(CFG_COMBUSTIVEIS, { lista: COMBUSTIVEIS_PADRAO }).lista;
}
export const combustiveisAtivos = (lista: Combustivel[]) => lista.filter(c => c.ativo !== false);
export const salvarCombustiveis = (lista: Combustivel[]) => saveConfig(CFG_COMBUSTIVEIS, { lista });
