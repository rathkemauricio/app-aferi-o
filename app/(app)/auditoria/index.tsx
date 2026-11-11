import { ModuleGate } from '../../../components/ModuleGate';
import AuditoriaModule from '../../../modules/auditoria/AuditoriaModule';

export default function AuditoriaRoute() {
  return <ModuleGate id="auditoria" nome="Auditoria"><AuditoriaModule /></ModuleGate>;
}
