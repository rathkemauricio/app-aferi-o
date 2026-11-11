import { ModuleGate } from '../../../components/ModuleGate';
import AfericoesModule from '../../../modules/afericoes/AfericoesModule';

export default function AfericoesRoute() {
  return <ModuleGate id="afericoes" nome="Aferições"><AfericoesModule /></ModuleGate>;
}
