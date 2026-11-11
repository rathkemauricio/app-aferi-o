import { ModuleGate } from '../../../components/ModuleGate';
import TemposModule from '../../../modules/tempos/TemposModule';

export default function TemposRoute() {
  return <ModuleGate id="tempos" nome="Tempos e Movimentos"><TemposModule /></ModuleGate>;
}
