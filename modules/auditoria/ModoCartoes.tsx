import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { GestureDetector, GestureHandlerRootView, usePanGesture, type PanGestureConfig } from 'react-native-gesture-handler';
import Animated, { Extrapolation, interpolate, ReduceMotion, type SharedValue, useAnimatedStyle, useReducedMotion, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';
import { ArrowRightIcon, ResetIcon, XIcon } from '../../ui/icons';
import { type Catalogo, type ItemAuditoria, tituloCurto } from './model';

/*
 * Modo cartões da auditoria (opcional; o checklist normal continua igual):
 * um requisito pendente por cartão. Arrastar para a direita marca Conforme, para a esquerda Não conforme e
 * para cima Não aplicável (os status do checklist da auditoria); os demais ficam nos botões de baixo.
 * Status que pedem constatação abrem o campo de observação antes do próximo cartão. "Desfazer" volta um.
 */

type Dir = 'direita' | 'esquerda' | 'cima' | 'baixo';
const NAVY = '#0b1426', PAINEL = '#13213b', PAINEL2 = '#1b2c4b', FG = '#eef2f8', MUTED = '#9fb0c9';
const CARTAO = '#f4f6fa', CARTAO_TXT = '#0f1f3d', CARTAO_MUTED = '#4a5873';

/** Status de cada direção do arraste, a partir dos status do checklist. */
function direcoes(cat: Catalogo) {
  const l = cat.lista;
  const direita = l.find(x => x.codigo === 'C') ?? l.find(x => x.fecha && !x.acao) ?? l[0];
  const esquerda = l.find(x => x.codigo === 'NC') ?? l.find(x => x.acao && x.codigo !== direita?.codigo);
  const cima = l.find(x => x.codigo === 'NA') ?? l.find(x => x.fecha && x.codigo !== direita?.codigo);
  return { direita: direita?.codigo ?? '', esquerda: esquerda?.codigo ?? '', cima: cima?.codigo ?? '' };
}

export function ModoCartoes({ itens, cat, setorDe, filial, onMudar, onFechar }: {
  itens: ItemAuditoria[];
  cat: Catalogo;
  setorDe: (i: ItemAuditoria) => string;
  filial: string;
  onMudar: (id: number, patch: Partial<ItemAuditoria>, imediato?: boolean) => void;
  onFechar: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const largura = Math.min(width - 32, 460);
  // Fila fixa ao abrir: os requisitos ainda não avaliados, na ordem do checklist.
  const [fila] = useState(() => itens.filter(i => !i.status).map(i => i.id));
  const [pos, setPos] = useState(0);
  const [obsDe, setObsDe] = useState<{ id: number; status: string } | null>(null);
  const [comando, setComando] = useState<{ n: number; status: string; dir: Dir } | null>(null);
  const arrasto = useSharedValue(0);
  const d = useMemo(() => direcoes(cat), [cat]);
  const porId = useMemo(() => new Map(itens.map(i => [i.id, i])), [itens]);
  // O cartão de trás assume a frente: o "arraste" volta a zero junto com a troca.
  useLayoutEffect(() => { arrasto.set(0); }, [pos, arrasto]);

  const dirDe = (codigo: string): Dir => (codigo === d.direita ? 'direita' : codigo === d.esquerda ? 'esquerda' : codigo === d.cima ? 'cima' : 'baixo');
  /** Último requisito avaliado: dois toques seguidos (ou arraste + toque) não pulam o próximo. */
  const ultimoAplicado = useRef<number | null>(null);
  const aplicar = useCallback((status: string) => {
    const id = fila[pos];
    if (id === undefined || ultimoAplicado.current === id) return;
    ultimoAplicado.current = id;
    onMudar(id, { status }, true);
    setComando(null);
    setPos(p => p + 1);
    if (!cat.fecha(status)) setObsDe({ id, status }); // pede constatação: abre a observação antes do próximo
  }, [fila, pos, onMudar, cat]);
  const desfazer = () => {
    if (!pos) return;
    onMudar(fila[pos - 1], { status: '' }, true);
    ultimoAplicado.current = null;
    setObsDe(null); setComando(null); setPos(p => p - 1);
  };

  const total = fila.length;
  const fim = pos >= total;
  const visiveis = [0, 1, 2].map(k => fila[pos + k]).filter((id): id is number => id !== undefined);
  const contagem = cat.lista.map(x => ({ ...x, n: fila.filter(id => porId.get(id)?.status === x.codigo).length })).filter(x => x.n);

  return (
    <Modal visible animationType="slide" presentationStyle="fullScreen" statusBarTranslucent onRequestClose={onFechar}>
      <GestureHandlerRootView style={{ flex: 1, backgroundColor: NAVY }}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={[e.tela, { paddingTop: insets.top + 10, paddingBottom: insets.bottom + 14 }]}>
            {/* Topo */}
            <View style={e.linha}>
              <Pressable accessibilityRole="button" accessibilityLabel="Fechar o modo cartões" onPress={onFechar} hitSlop={10} style={e.redondo}><XIcon size={20} color={FG} weight="bold" /></Pressable>
              <View style={{ flex: 1 }}>
                <Text style={e.titulo}>Modo cartões</Text>
                <Text style={e.sub} numberOfLines={1}>{filial}</Text>
              </View>
              <Text style={e.prog}>{Math.min(pos, total)} de {total}</Text>
            </View>
            <View style={e.barra}><View style={[e.barraCheia, { width: `${total ? (Math.min(pos, total) / total) * 100 : 100}%` }]} /></View>

            {/* Pilha de cartões */}
            <View style={e.pilha}>
              {fim && !obsDe ? (
                <View style={[e.cartao, { width: largura, alignItems: 'center', justifyContent: 'center', gap: 12 }]}>
                  <Text style={[e.cTitulo, { textAlign: 'center' }]}>{total ? 'Todos os requisitos avaliados' : 'Nenhum requisito pendente'}</Text>
                  <View style={e.selos}>
                    {contagem.map(x => <View key={x.codigo} style={[e.selo, { backgroundColor: x.cor }]}><Text style={e.seloTxt}>{x.n} {x.codigo}</Text></View>)}
                  </View>
                  <Pressable accessibilityRole="button" onPress={onFechar} style={[e.btn, { backgroundColor: CARTAO_TXT }]}><Text style={[e.btnTxt, { color: '#fff' }]}>Voltar ao checklist</Text></Pressable>
                </View>
              ) : (
                [...visiveis].reverse().map(id => {
                  const ordem = visiveis.indexOf(id);
                  const item = porId.get(id);
                  if (!item) return null;
                  return (
                    <Cartao key={id} item={item} setor={setorDe(item)} ordem={ordem} largura={largura} cat={cat} d={d} arrasto={arrasto}
                      comando={ordem === 0 && !obsDe ? comando : null} onFim={aplicar} bloqueado={!!obsDe} />
                  );
                })
              )}
            </View>

            {/* Dicas de direção e botões de todos os status */}
            {!fim || obsDe ? <>
              <View style={[e.linha, { justifyContent: 'space-between' }]}>
                {d.esquerda ? <Text style={[e.dica, { color: cat.cor(d.esquerda) }]}>← {cat.nome(d.esquerda)}</Text> : <View />}
                {d.cima ? <Text style={[e.dica, { color: cat.cor(d.cima) }]}>↑ {cat.nome(d.cima)}</Text> : null}
                {d.direita ? <Text style={[e.dica, { color: cat.cor(d.direita) }]}>{cat.nome(d.direita)} →</Text> : <View />}
              </View>
              <View style={e.botoes}>
                {cat.lista.map(x => (
                  <Pressable key={x.codigo} accessibilityRole="button" accessibilityLabel={x.nome} disabled={!!obsDe || fim}
                    onPress={() => setComando(c => (c ? c : { n: Date.now(), status: x.codigo, dir: dirDe(x.codigo) }))}
                    style={({ pressed }) => [e.botao, { backgroundColor: x.cor }, x.acao && { boxShadow: `0 0 12px 1px ${x.cor}99` }, pressed && { transform: [{ scale: 0.94 }] }, (!!obsDe || fim) && { opacity: 0.4 }]}>
                    <Text style={e.botaoTxt}>{x.codigo}</Text>
                  </Pressable>
                ))}
              </View>
            </> : null}
            <Pressable accessibilityRole="button" disabled={!pos} onPress={desfazer} style={[e.desfazer, !pos && { opacity: 0.4 }]}>
              <ResetIcon size={16} color={FG} /><Text style={e.btnTxt}>Desfazer</Text>
            </Pressable>

            {/* Observação dos status que pedem constatação */}
            {obsDe ? <Observacao item={porId.get(obsDe.id)} status={obsDe.status} cat={cat} onMudar={onMudar} onContinuar={() => setObsDe(null)} /> : null}
          </View>
        </KeyboardAvoidingView>
      </GestureHandlerRootView>
    </Modal>
  );
}

/** Um cartão da pilha. Só o da frente (ordem 0) arrasta; os de trás crescem conforme ele sai. */
function Cartao({ item, setor, ordem, largura, cat, d, arrasto, comando, onFim, bloqueado }: {
  item: ItemAuditoria; setor: string; ordem: number; largura: number; cat: Catalogo; d: ReturnType<typeof direcoes>;
  arrasto: SharedValue<number>; comando: { n: number; status: string; dir: Dir } | null; onFim: (status: string) => void; bloqueado: boolean;
}) {
  const reduz = useReducedMotion();
  const x = useSharedValue(0), y = useSharedValue(0);
  const LIM = largura * 0.28;
  const fimRef = useRef(onFim); fimRef.current = onFim;
  const fim = useCallback((status: string) => fimRef.current(status), []);
  const fora = largura * 1.6;

  const config = useMemo((): PanGestureConfig => ({
    onUpdate: ev => {
      'worklet';
      x.set(ev.translationX);
      y.set(Math.min(ev.translationY, 40)); // para baixo quase não anda (não há status no arraste para baixo)
      arrasto.set(Math.min(1, Math.max(Math.abs(ev.translationX), Math.abs(Math.min(0, ev.translationY))) / LIM));
    },
    onDeactivate: ev => {
      'worklet';
      const dx = x.get() + ev.velocityX * 0.12, dy = y.get() + ev.velocityY * 0.12;
      let status = '', dir = '';
      if (Math.abs(dx) >= Math.abs(dy)) {
        if (dx > LIM && d.direita) { status = d.direita; dir = 'direita'; } else if (dx < -LIM && d.esquerda) { status = d.esquerda; dir = 'esquerda'; }
      } else if (dy < -LIM && d.cima) { status = d.cima; dir = 'cima'; }
      if (!status) {
        x.set(withSpring(0, { duration: 400, dampingRatio: 0.8, velocity: ev.velocityX }));
        y.set(withSpring(0, { duration: 400, dampingRatio: 0.8, velocity: ev.velocityY }));
        arrasto.set(withTiming(0, { duration: 200 }));
        return;
      }
      arrasto.set(withTiming(1, { duration: 200 }));
      const cfg = { duration: 230, reduceMotion: ReduceMotion.System };
      if (dir === 'cima') y.set(withTiming(-fora * 1.3, cfg, ok => { if (ok) scheduleOnRN(fim, status); }));
      else x.set(withTiming(dir === 'direita' ? fora : -fora, cfg, ok => { if (ok) scheduleOnRN(fim, status); }));
    },
  }), [x, y, arrasto, LIM, d, fora, fim]);
  const pan = usePanGesture(config);

  // Botão de status: o cartão sai na direção do status escolhido.
  useEffect(() => {
    if (!comando || ordem !== 0) return;
    if (reduz) { fim(comando.status); return; }
    arrasto.set(withTiming(1, { duration: 200 }));
    const st = comando.status;
    const cb = (ok?: boolean) => { 'worklet'; if (ok) scheduleOnRN(fim, st); };
    if (comando.dir === 'cima') y.set(withTiming(-fora * 1.3, { duration: 260 }, cb));
    else if (comando.dir === 'baixo') y.set(withTiming(fora * 1.3, { duration: 260 }, cb));
    else x.set(withTiming(comando.dir === 'direita' ? fora : -fora, { duration: 260 }, cb));
  }, [comando?.n]); // eslint-disable-line react-hooks/exhaustive-deps

  const frente = useAnimatedStyle(() => ({
    transform: [{ translateX: x.get() }, { translateY: y.get() }, { rotate: `${(x.get() / largura) * 14}deg` }],
  }));
  const tras = useAnimatedStyle(() => {
    const a = arrasto.get();
    return {
      transform: [
        { translateY: interpolate(a, [0, 1], [16 * ordem, 16 * (ordem - 1)]) },
        { scale: interpolate(a, [0, 1], [1 - 0.05 * ordem, 1 - 0.05 * (ordem - 1)]) },
      ],
      opacity: ordem >= 2 ? interpolate(a, [0, 1], [0.6, 1]) : 1,
    };
  });
  const carimbo = (dir: 'direita' | 'esquerda' | 'cima') => useAnimatedStyle(() => ({ // eslint-disable-line react-hooks/rules-of-hooks
    opacity: dir === 'direita' ? interpolate(x.get(), [20, LIM], [0, 1], Extrapolation.CLAMP)
      : dir === 'esquerda' ? interpolate(-x.get(), [20, LIM], [0, 1], Extrapolation.CLAMP)
      : interpolate(-y.get(), [20, LIM], [0, 1], Extrapolation.CLAMP),
  }));
  const cDir = carimbo('direita'), cEsq = carimbo('esquerda'), cCima = carimbo('cima');

  const titulo = tituloCurto(item.titulo);
  const resto = item.titulo.length > titulo.length + 2 ? item.titulo : '';
  const conteudo = (
    <Animated.View style={[e.cartao, { width: largura }, ordem === 0 ? frente : tras]} accessibilityLabel={`Requisito ${item.id}: ${item.titulo}`}>
      <View style={e.linha}>
        <View style={e.num}><Text style={e.numTxt}>{item.id}</Text></View>
        {setor ? <View style={e.setor}><Text style={e.setorTxt} numberOfLines={1}>{setor}</Text></View> : null}
      </View>
      <Text style={e.cTitulo}>{titulo}</Text>
      {resto ? <Text style={e.cTexto}>{resto}</Text> : null}
      {ordem === 0 ? <>
        {d.direita ? <Animated.View pointerEvents="none" style={[e.carimbo, { left: 16, borderColor: cat.cor(d.direita), transform: [{ rotate: '-12deg' }] }, cDir]}><Text style={[e.carimboTxt, { color: cat.cor(d.direita) }]}>{cat.nome(d.direita)}</Text></Animated.View> : null}
        {d.esquerda ? <Animated.View pointerEvents="none" style={[e.carimbo, { right: 16, borderColor: cat.cor(d.esquerda), transform: [{ rotate: '12deg' }] }, cEsq]}><Text style={[e.carimboTxt, { color: cat.cor(d.esquerda) }]}>{cat.nome(d.esquerda)}</Text></Animated.View> : null}
        {d.cima ? <Animated.View pointerEvents="none" style={[e.carimbo, { alignSelf: 'center', bottom: 24, top: undefined, borderColor: cat.cor(d.cima) }, cCima]}><Text style={[e.carimboTxt, { color: cat.cor(d.cima) }]}>{cat.nome(d.cima)}</Text></Animated.View> : null}
      </> : null}
    </Animated.View>
  );
  return (
    <View pointerEvents={ordem === 0 && !bloqueado ? 'auto' : 'none'} style={StyleSheet.absoluteFill}>
      <View style={e.centro}>{ordem === 0 && !bloqueado ? <GestureDetector gesture={pan}>{conteudo}</GestureDetector> : conteudo}</View>
    </View>
  );
}

/** Observação do item que pediu constatação (NC, OB, OM…). */
function Observacao({ item, status, cat, onMudar, onContinuar }: {
  item: ItemAuditoria | undefined; status: string; cat: Catalogo; onMudar: (id: number, patch: Partial<ItemAuditoria>, imediato?: boolean) => void; onContinuar: () => void;
}) {
  const [texto, setTexto] = useState(item?.obs ?? '');
  if (!item) return null;
  return (
    <View style={e.obs}>
      <View style={e.linha}>
        <View style={[e.selo, { backgroundColor: cat.cor(status) }]}><Text style={e.seloTxt}>{status}</Text></View>
        <Text style={[e.titulo, { flex: 1, fontSize: 15 }]} numberOfLines={2}>{item.id}. {tituloCurto(item.titulo)}</Text>
      </View>
      <TextInput value={texto} onChangeText={v => { setTexto(v); onMudar(item.id, { obs: v }); }} autoFocus multiline placeholder={`${cat.nome(status)}: o que foi constatado?`}
        placeholderTextColor="#6b7891" style={e.obsCampo} accessibilityLabel="Observação / constatação" />
      <Pressable accessibilityRole="button" onPress={onContinuar} style={[e.btn, { backgroundColor: '#5fd39a', flexDirection: 'row', gap: 8 }]}>
        <Text style={[e.btnTxt, { color: NAVY }]}>Continuar</Text><ArrowRightIcon size={18} color={NAVY} weight="bold" />
      </Pressable>
      <Text style={e.sub}>Plano de ação e fotos continuam no checklist normal.</Text>
    </View>
  );
}

const e = StyleSheet.create({
  tela: { flex: 1, paddingHorizontal: 16, gap: 12 },
  linha: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  redondo: { width: 40, height: 40, borderRadius: 12, backgroundColor: PAINEL2, alignItems: 'center', justifyContent: 'center' },
  titulo: { color: FG, fontSize: 18, fontWeight: '800' },
  sub: { color: MUTED, fontSize: 12 },
  prog: { color: '#5fd39a', fontSize: 15, fontWeight: '800', fontVariant: ['tabular-nums'] },
  barra: { height: 6, borderRadius: 3, backgroundColor: PAINEL2, overflow: 'hidden' },
  barraCheia: { position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: 3, backgroundColor: '#5fd39a' },
  pilha: { flex: 1, minHeight: 360 },
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  cartao: { minHeight: 340, maxHeight: '96%', borderRadius: 24, backgroundColor: CARTAO, padding: 20, gap: 12, boxShadow: '0 18px 40px rgba(0, 0, 0, 0.35)' },
  num: { minWidth: 40, height: 40, borderRadius: 12, backgroundColor: CARTAO_TXT, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  numTxt: { color: '#fff', fontSize: 16, fontWeight: '900' },
  setor: { borderRadius: 999, backgroundColor: '#dde4ef', paddingHorizontal: 10, paddingVertical: 4, flexShrink: 1 },
  setorTxt: { color: CARTAO_MUTED, fontSize: 12, fontWeight: '700' },
  cTitulo: { color: CARTAO_TXT, fontSize: 23, fontWeight: '800', lineHeight: 29 },
  cTexto: { color: CARTAO_MUTED, fontSize: 15, lineHeight: 22 },
  carimbo: { position: 'absolute', top: 22, borderWidth: 3, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: 'rgba(255,255,255,0.85)' },
  carimboTxt: { fontSize: 18, fontWeight: '900', letterSpacing: 0.5 },
  dica: { fontSize: 13, fontWeight: '800' },
  botoes: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 10 },
  botao: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  botaoTxt: { color: '#fff', fontSize: 16, fontWeight: '900' },
  desfazer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, alignSelf: 'center', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 999, backgroundColor: PAINEL },
  btn: { borderRadius: 14, paddingVertical: 14, paddingHorizontal: 18, alignItems: 'center', justifyContent: 'center' },
  btnTxt: { color: FG, fontWeight: '800', fontSize: 15 },
  selos: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' },
  selo: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  seloTxt: { color: '#fff', fontWeight: '900', fontSize: 13 },
  obs: { position: 'absolute', left: 16, right: 16, bottom: 16, borderRadius: 20, backgroundColor: PAINEL, padding: 16, gap: 12, boxShadow: '0 -8px 30px rgba(0, 0, 0, 0.4)' },
  obsCampo: { minHeight: 90, borderRadius: 12, borderWidth: 1.5, borderColor: '#3a4d70', backgroundColor: '#ffffff', color: CARTAO_TXT, fontSize: 15, paddingHorizontal: 12, paddingVertical: 10, textAlignVertical: 'top' },
});
