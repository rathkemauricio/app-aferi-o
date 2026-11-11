import { ModuleGate } from '../../../components/ModuleGate';
import CroquiModule from '../../../modules/croqui/CroquiModule';

export default function CroquiRoute() {
  return <ModuleGate id="croqui" nome="Croqui"><CroquiModule /></ModuleGate>;
}
