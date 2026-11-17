import { ModuleGate } from '../../../components/ModuleGate';
import TanquesModule from '../../../modules/tanques/TanquesModule';

export default function TanquesRoute() {
  return <ModuleGate id="tanques" nome="Medição de Tanques"><TanquesModule /></ModuleGate>;
}
