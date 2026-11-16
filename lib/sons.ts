import { type AudioPlayer, createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import { preferencias } from './preferencias';

// Sons curtos da coleta:
//   correto: item reconhecido e liberado para coletar;  salvo: quantidade gravada;
//   barrado: item que não pode ser coletado (não está na carga, fora da contagem, já fechado, quantidade inválida).
// Os players são criados na primeira vez e reaproveitados (tocar = voltar ao início e dar play).
const ARQUIVOS = {
  correto: require('../assets/sons/correto.wav'),
  salvo: require('../assets/sons/salvo.wav'),
  barrado: require('../assets/sons/barrado.wav'),
} as const;
export type Som = keyof typeof ARQUIVOS;

const players = new Map<Som, AudioPlayer>();
let modo = false;

export function tocar(som: Som) {
  if (!preferencias().sons) return; // desligados em Configurações
  try {
    if (!modo) { modo = true; void setAudioModeAsync({ playsInSilentMode: true, interruptionMode: 'mixWithOthers' }).catch(() => undefined); }
    let p = players.get(som);
    if (!p) { p = createAudioPlayer(ARQUIVOS[som]); players.set(som, p); }
    void p.seekTo(0).catch(() => undefined);
    p.play();
  } catch { /* som é só um retorno extra: nunca atrapalha a coleta */ }
}
