import { Platform, Share } from 'react-native';

/** Exporta um texto como arquivo: download no navegador, folha de compartilhamento no celular. */
export async function shareText(filename: string, content: string, mime: string) {
  if (Platform.OS === 'web') {
    const blob = new Blob([mime.includes('csv') ? '﻿' + content : content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return;
  }
  await Share.share({ title: filename, message: content });
}
