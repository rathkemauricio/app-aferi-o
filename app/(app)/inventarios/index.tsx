import { ModuleGate } from '../../../components/ModuleGate';
import InventariosModule from '../../../modules/inventarios/InventariosModule';

export default function InventariosRoute() {
  return <ModuleGate id="inventarios" nome="Inventários"><InventariosModule /></ModuleGate>;
}
