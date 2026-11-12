import { ModuleGate } from '../../../components/ModuleGate';
import RiscosModule from '../../../modules/riscos/RiscosModule';

export default function RiscosRoute() {
  return <ModuleGate id="riscos" nome="Mapa de Risco"><RiscosModule /></ModuleGate>;
}
