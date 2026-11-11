import type { Href } from 'expo-router';
import { useTemposAviso } from './tempos/aviso';
import { GasPumpIcon, HourglassIcon, type Icon, StorefrontIcon } from '../ui/icons';
import type { Tint } from '../ui/theme';

// Catálogo de módulos exibido na tela inicial.
// Para integrar um módulo novo: crie a pasta em modules/<id>, a rota em app/<id>/ e registre aqui.
export type AppModule = {
  id: string;
  name: string;
  description: string;
  icon: Icon;
  tint: Tint;
  route: Href;
  /** Aviso curto exibido no card (ex.: trabalho em andamento). Hook React: chamado sempre, sem condição. */
  useAviso?: () => string | null;
};

export const MODULES: AppModule[] = [
  {
    id: 'afericoes',
    name: 'Aferições',
    description: 'Inspeção de bombas e bicos por filial, com histórico e relatórios.',
    icon: GasPumpIcon,
    tint: 'indigo',
    route: '/afericoes',
  },
  {
    id: 'tempos',
    name: 'Tempos e Movimentos',
    description: 'Cronometragem de atendimentos e atividades por filial, com painel e tempo padrão.',
    icon: HourglassIcon,
    tint: 'emerald',
    route: '/tempos',
    useAviso: useTemposAviso,
  },
  {
    id: 'croqui',
    name: 'Croqui',
    description: 'Desenho do terreno de cada filial: bombas, combustíveis, ilhas, loja e acessos.',
    icon: StorefrontIcon,
    tint: 'sky',
    route: '/croqui',
  },
];
