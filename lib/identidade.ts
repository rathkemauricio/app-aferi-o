import { useAuth } from './auth';
import { saveConfig, useConfig } from './data';

/** Identidade da rede nos impressos (certificados, checklists, relatórios): o nome da empresa e o logotipo dela. */
export type Identidade = { nome: string; logo: string | null };
type IdentidadeConfig = { logo?: string | null };
const CHAVE = 'identidade';

/** Nome da empresa (cadastro do EasyAudit) e logotipo configurado pelo administrador em Configurações. */
export function useIdentidade(): Identidade {
  const { empresa } = useAuth();
  const cfg = useConfig<IdentidadeConfig>(CHAVE, {});
  return { nome: empresa?.nome ?? 'EasyAudit', logo: cfg.logo ?? null };
}

/** Grava (ou tira, com null) o logotipo da rede: imagem em data URL, já reduzida. */
export const salvarLogoDaRede = (logo: string | null) => saveConfig<IdentidadeConfig>(CHAVE, { logo });
