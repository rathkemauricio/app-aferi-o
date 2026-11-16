import Constants from 'expo-constants';
import { Platform } from 'react-native';

// Versão do app (a mesma do app.json no momento do build; o script de APK sobe os números).
export const VERSAO = Constants.expoConfig?.version ?? '';
/** Número interno do build Android (versionCode). */
export const BUILD = Platform.OS === 'android' ? Constants.expoConfig?.android?.versionCode : undefined;
/** Ex.: "Postora 1.0.9 (10)" no app, "Postora 1.0.9 · web" no painel. */
export const rotuloVersao = `Postora ${VERSAO}${BUILD ? ` (${BUILD})` : ''}${Platform.OS === 'web' ? ' · web' : ''}`;
