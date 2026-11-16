import Constants from 'expo-constants';
import * as Updates from 'expo-updates';
import { Platform } from 'react-native';

// Versão do app (a mesma do app.json no momento do build; o script de APK sobe os números).
export const VERSAO = Constants.expoConfig?.version ?? '';
/** Número interno do build Android (versionCode). */
export const BUILD = Platform.OS === 'android' ? Constants.expoConfig?.android?.versionCode : undefined;
/** Data da atualização automática em uso (null = a que veio no APK). */
const atualizadoEm = (() => {
  try { return Platform.OS !== 'web' && Updates.isEnabled && !Updates.isEmbeddedLaunch ? Updates.createdAt : null; } catch { return null; }
})();
/** Ex.: "Postora 1.0.12 (13) · atualização 16/11 18:40" no app, "Postora 1.0.12 · web" no painel. */
export const rotuloVersao = `Postora ${VERSAO}${BUILD ? ` (${BUILD})` : ''}${Platform.OS === 'web' ? ' · web' : ''}${atualizadoEm ? ` · atualização ${atualizadoEm.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}` : ''}`;
