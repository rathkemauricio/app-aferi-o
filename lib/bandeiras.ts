import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { BANDEIRAS, saveConfig, useConfig } from './data';

// Catálogo de bandeiras (app_config 'bandeiras'), editável pelo administrador.
// Usado no cadastro da filial e no croqui (totem de preços e selo da bandeira).
export type Bandeira = { id: string; nome: string; cor: string; corTexto: string; ativo?: boolean;
  /** Logotipo da companhia (data URL PNG, até 320 px de largura), enviado pelo administrador. */
  logo?: string | null };
export const CFG_BANDEIRAS = 'bandeiras';

export const BANDEIRAS_PADRAO: Bandeira[] = Object.entries(BANDEIRAS).map(([id, b]) => ({ id, nome: b.n, cor: b.c, corTexto: b.tc, ativo: true }));

/** Lista de bandeiras; também atualiza a tabela usada pelo desenho do croqui. */
export function useBandeiras() {
  const lista = useConfig<{ lista: Bandeira[] }>(CFG_BANDEIRAS, { lista: BANDEIRAS_PADRAO }).lista;
  lista.forEach(b => { BANDEIRAS[b.id] = { n: b.nome, c: b.cor, tc: b.corTexto, ...(b.logo ? { logo: b.logo } : {}) }; });
  return lista;
}
export const bandeirasAtivas = (lista: Bandeira[]) => lista.filter(b => b.ativo !== false);
export const salvarBandeiras = (lista: Bandeira[]) => saveConfig(CFG_BANDEIRAS, { lista });
export const nomeBandeira = (id: string) => BANDEIRAS[id]?.n ?? BANDEIRAS.branca?.n ?? 'Bandeira branca';

/**
 * Escolhe o logotipo da companhia (galeria, ou arquivo no navegador) e reduz para até 320 px de largura em PNG
 * (mantém o fundo transparente). Devolve uma data URL, ou null se cancelar.
 */
export async function escolherLogo(): Promise<string | null> {
  const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
  if (r.canceled || !r.assets?.[0]) return null;
  const a = r.assets[0];
  const acoes: ImageManipulator.Action[] = a.width && a.width > 320 ? [{ resize: { width: 320 } }] : [];
  const out = await ImageManipulator.manipulateAsync(a.uri, acoes, { format: ImageManipulator.SaveFormat.PNG, base64: true });
  if (!out.base64) throw new Error('Não foi possível processar a imagem.');
  return `data:image/png;base64,${out.base64}`;
}

/** Cores sugeridas para fundo e texto da bandeira. */
export const CORES_BANDEIRA = ['#6b7280', '#009b3a', '#ffd500', '#0b4ea2', '#e30613', '#d71920', '#f97316', '#7c3aed', '#0891b2', '#111827', '#ffffff', '#1e3a8a'];
