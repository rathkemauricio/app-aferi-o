import { ModuleGate } from '../../../components/ModuleGate';
import TanquesModule from '../../../modules/tanques/TanquesModule';

export default function TanquesRoute() {
  return <ModuleGate id="tanques" nome="Conferência de Estoque de Combustíveis"><TanquesModule /></ModuleGate>;
}
