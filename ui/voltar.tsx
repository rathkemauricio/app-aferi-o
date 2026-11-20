import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { ArrowLeftIcon } from './icons';
import { IconButton } from './kit';
import { useTela } from './zoom';

/*
 * Voltar nos cabeçalhos. No painel web com a barra lateral visível (tela larga) NÃO há botão de voltar: o cabeçalho
 * ficava colado ao botão de recolher a barra, e a barra já leva a qualquer lugar. Voltar passa a ser pelo teclado
 * (Esc ou Alt + seta para a esquerda) e pelo botão "voltar" do mouse. Em tela estreita e no celular o botão continua.
 */
const LARGURA_COM_BARRA = 980; // a mesma do DesktopShell

type Atalho = { fn: () => void };
const pilha: Atalho[] = [];
let ligado = false;

function ligar() {
  if (ligado || typeof window === 'undefined') return;
  ligado = true;
  const executar = (ev: Event) => {
    const topo = pilha[pilha.length - 1];
    // Espera os outros tratadores (janelas, avisos, tutorial): se algum já tratou o evento, não volta.
    setTimeout(() => { if (!ev.defaultPrevented && topo && pilha[pilha.length - 1] === topo) topo.fn(); }, 0);
  };
  window.addEventListener('keydown', ev => {
    if (!pilha.length) return;
    const alvo = ev.target as HTMLElement | null;
    const digitando = !!alvo && (alvo.tagName === 'INPUT' || alvo.tagName === 'TEXTAREA' || alvo.isContentEditable);
    if (ev.key === 'ArrowLeft' && ev.altKey) { executar(ev); return; }
    if (ev.key === 'Escape' && !digitando && !document.querySelector('[role="dialog"], [aria-modal="true"]')) executar(ev);
  });
  window.addEventListener('mouseup', ev => {
    if (ev.button === 3 && pilha.length) { ev.preventDefault(); executar(ev); }
  });
}

/**
 * Registra o "voltar" desta tela (e devolve se o botão deve ficar escondido). Vale o último registrado (a tela mais
 * de dentro). `onPress` vazio = sem voltar.
 */
export function useVoltarSemBotao(onPress?: () => void) {
  const { width } = useTela();
  const ref = useRef(onPress);
  ref.current = onPress;
  const ativo = Platform.OS === 'web' && !!onPress;
  useEffect(() => {
    if (!ativo) return;
    const it: Atalho = { fn: () => ref.current?.() };
    pilha.push(it);
    ligar();
    return () => { const i = pilha.indexOf(it); if (i >= 0) pilha.splice(i, 1); };
  }, [ativo]);
  return Platform.OS === 'web' && width >= LARGURA_COM_BARRA;
}

/** Botão de voltar do cabeçalho (some no painel web largo; ver acima). */
export function BotaoVoltar({ onPress, label = 'Voltar' }: { onPress: () => void; label?: string }) {
  const semBotao = useVoltarSemBotao(onPress);
  if (semBotao) return null;
  return <IconButton icon={ArrowLeftIcon} label={label} onPress={onPress} />;
}
