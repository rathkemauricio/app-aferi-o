import { type AudioPlayer, createAudioPlayer, setAudioModeAsync } from 'expo-audio';

// Sons curtos da coleta: leitura identificada, quantidade salva e código não reconhecido.
// Os players são criados na primeira vez e reaproveitados (tocar = voltar ao início e dar play).
const ARQUIVOS = {
  bip: require('../assets/sons/bip.wav'),
  salvo: require('../assets/sons/salvo.wav'),
  erro: require('../assets/sons/erro.wav'),
} as const;
export type Som = keyof typeof ARQUIVOS;

const players = new Map<Som, AudioPlayer>();
let modo = false;

export function tocar(som: Som) {
  try {
    if (!modo) { modo = true; void setAudioModeAsync({ playsInSilentMode: true, interruptionMode: 'mixWithOthers' }).catch(() => undefined); }
    let p = players.get(som);
    if (!p) { p = createAudioPlayer(ARQUIVOS[som]); players.set(som, p); }
    void p.seekTo(0).catch(() => undefined);
    p.play();
  } catch { /* som é só um retorno extra: nunca atrapalha a coleta */ }
}
