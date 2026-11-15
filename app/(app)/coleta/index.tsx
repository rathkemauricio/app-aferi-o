import { ModuleGate } from '../../../components/ModuleGate';
import ColetaModule from '../../../modules/coleta/ColetaModule';

export default function ColetaRoute() {
  return <ModuleGate id="coleta" nome="Coleta"><ColetaModule /></ModuleGate>;
}
