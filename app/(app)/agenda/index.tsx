import { ModuleGate } from '../../../components/ModuleGate';
import AgendaModule from '../../../modules/agenda/AgendaModule';

export default function AgendaRoute() {
  return <ModuleGate id="agenda" nome="Agenda"><AgendaModule /></ModuleGate>;
}
