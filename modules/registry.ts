import type { Href } from 'expo-router';
import { useTemposAviso } from './tempos/aviso';
import { ArchiveIcon, BarcodeIcon, CalendarDotsIcon, ClipboardTextIcon, GasPumpIcon, HourglassIcon, type Icon, RulerIcon, ShieldWarningIcon, StorefrontIcon } from '../ui/icons';
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
  {
    id: 'auditoria',
    name: 'Auditoria',
    description: 'Checklist de auditoria operacional por filial, com evidências, planos de ação e relatório.',
    icon: ClipboardTextIcon,
    tint: 'amber',
    route: '/auditoria',
  },
  {
    id: 'riscos',
    name: 'Mapa de Risco',
    description: 'Prevenção de perdas: risco por unidade, agenda de visitas, produtividade, planejamento e Programa Filial Destaque.',
    icon: ShieldWarningIcon,
    tint: 'rose',
    route: '/riscos',
  },
  {
    id: 'inventarios',
    name: 'Inventários',
    description: 'Base histórica de inventários por unidade, com sobras, faltas e resultado por categoria.',
    icon: ArchiveIcon,
    tint: 'slate',
    route: '/inventarios',
  },
  {
    id: 'agenda',
    name: 'Agenda',
    description: 'Visitas, auditorias e reuniões por dia, sincronizadas com o seu Google Agenda.',
    icon: CalendarDotsIcon,
    tint: 'sky',
    route: '/agenda',
  },
  {
    id: 'coleta',
    name: 'Coleta',
    description: 'Contagem de estoque por filial com coletor: saldos do ERP, até 3 contagens e relatório de divergências.',
    icon: BarcodeIcon,
    tint: 'amber',
    route: '/coleta',
  },
  {
    id: 'tanques',
    name: 'Medição de Tanques',
    description: 'Medição dos tanques de combustível por filial: estoque medido, venda, recebimento e resultado (sobra ou falta).',
    icon: RulerIcon,
    tint: 'sky',
    route: '/tanques',
  },
];
