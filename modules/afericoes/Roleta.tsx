import { type ComponentRef, useContext, useEffect, useMemo, useRef } from 'react';
import { Modal, type NativeScrollEvent, type NativeSyntheticEvent, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { radius, ThemeContext } from '../../ui/theme';

/**
 * Roleta vertical de valores prontos (sem digitar e sem teclado). O valor do meio, destacado, é o escolhido:
 * rolar e soltar trava nele, e tocar num valor leva até ele. Quando o valor muda por fora (ex.: cronômetro),
 * a roleta vai sozinha até ele.
 */
const ALTURA = 40;
const VISIVEIS = 5;

export function Roleta({ valores, valor, onChange, formatar = v => v, vazio = false, rotulo }: {
  valores: string[];
  /** Valor escolhido ('' = ainda não medido: a roleta fica no valor `inicial`, sem destaque de escolhido). */
  valor: string;
  onChange: (v: string) => void;
  formatar?: (v: string) => string;
  /** Mostra que ainda não foi medido. */
  vazio?: boolean;
  rotulo: string;
}) {
  const { colors } = useContext(ThemeContext);
  const ref = useRef<ComponentRef<typeof ScrollView>>(null);
  const indiceDe = (v: string) => { const i = valores.indexOf(v); return i >= 0 ? i : Math.max(0, valores.indexOf('0')); };
  const atual = indiceDe(valor);
  const ultimo = useRef(atual);
  const espera = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Hora da última rolagem feita pelo próprio app: a rolagem que ela gera não conta como escolha. */
  const rolagemDoApp = useRef(0);
  /** Só grava o que veio de um gesto da pessoa (arrastar, girar a roda do mouse, tocar num valor). */
  const mexeu = useRef(false);
  const rolarPara = (i: number, animado: boolean) => {
    rolagemDoApp.current = Date.now();
    ref.current?.scrollTo({ y: i * ALTURA, animated: animado });
  };

  // Vai até o valor quando ele muda por fora (cronômetro, troca de bico). Ao aparecer, vai direto (sem animar).
  const primeira = useRef(true);
  useEffect(() => {
    ultimo.current = atual;
    const animado = !primeira.current;
    primeira.current = false;
    const id = setTimeout(() => rolarPara(atual, animado), 30);
    return () => clearTimeout(id);
  }, [atual]); // eslint-disable-line react-hooks/exhaustive-deps

  const escolher = (i: number) => {
    const n = Math.max(0, Math.min(valores.length - 1, i));
    ultimo.current = n;
    if (valores[n] !== valor) onChange(valores[n]);
    rolarPara(n, true);
  };
  const doGesto = () => mexeu.current && Date.now() - rolagemDoApp.current > 450;
  const aoParar = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (!doGesto()) return;
    const i = Math.round(e.nativeEvent.contentOffset.y / ALTURA);
    if (i !== ultimo.current || vazio) escolher(i);
  };
  // Na web não há "fim do arremesso": escolhe quando a rolagem para.
  const aoRolar = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (Platform.OS !== 'web') return;
    const y = e.nativeEvent.contentOffset.y;
    if (espera.current) clearTimeout(espera.current);
    espera.current = setTimeout(() => { if (!doGesto()) return; const i = Math.round(y / ALTURA); if (i !== ultimo.current) escolher(i); }, 160);
  };
  // Posiciona no valor atual assim que a roleta tem tamanho (dentro da janela, o primeiro rolar pode se perder).
  const aoMedir = () => {
    rolarPara(ultimo.current, false);
    // A janela ainda está aparecendo (animação): repete até a posição assentar, se a pessoa não mexeu.
    [80, 200, 400].forEach(ms => setTimeout(() => { if (!mexeu.current) rolarPara(ultimo.current, false); }, ms));
  };
  const marcarGesto = () => { mexeu.current = true; rolagemDoApp.current = 0; };
  const s = useMemo(() => estilos(colors.accent), [colors.accent]);

  return (
    <View style={s.caixa} accessibilityRole="adjustable" accessibilityLabel={`${rotulo}: ${vazio ? 'não medido' : formatar(valor)}`}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={e => escolher(atual + (e.nativeEvent.actionName === 'increment' ? 1 : -1))}>
      {/* Faixa do valor escolhido */}
      <View pointerEvents="none" style={[s.faixa, { backgroundColor: vazio ? colors.surfaceMuted : colors.accent, borderColor: colors.accent }]} />
      <ScrollView
        ref={ref}
        style={{ height: ALTURA * VISIVEIS }}
        contentContainerStyle={{ paddingVertical: ALTURA * Math.floor(VISIVEIS / 2) }}
        showsVerticalScrollIndicator={false}
        snapToInterval={ALTURA}
        decelerationRate="fast"
        nestedScrollEnabled
        onLayout={aoMedir}
        onScrollBeginDrag={marcarGesto}
        onTouchStart={marcarGesto}
        // Web: a roda do mouse e o arrastar também contam como gesto.
        {...(Platform.OS === 'web' ? { onWheel: marcarGesto, onPointerDown: marcarGesto } as object : {})}
        onMomentumScrollEnd={aoParar}
        onScrollEndDrag={e => { if (Platform.OS === 'android' && !e.nativeEvent.velocity?.y) aoParar(e); }}
        onScroll={aoRolar}
        scrollEventThrottle={32}
        {...(Platform.OS === 'web' ? {} : { contentOffset: { x: 0, y: atual * ALTURA } })}
      >
        {valores.map((v, i) => {
          const centro = i === atual;
          return (
            <Pressable key={v} onPress={() => escolher(i)} style={s.item} accessibilityElementsHidden importantForAccessibility="no">
              <Text style={[s.txt, { color: centro ? (vazio ? colors.textMuted : colors.primaryText) : colors.textMuted, fontWeight: centro ? '900' : '600', fontSize: centro ? 20 : 16 }]}>
                {formatar(v)}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const estilos = (acc: string) => StyleSheet.create({
  caixa: { height: ALTURA * VISIVEIS, borderRadius: radius.control, overflow: 'hidden' },
  faixa: { position: 'absolute', left: 4, right: 4, top: ALTURA * Math.floor(VISIVEIS / 2), height: ALTURA, borderRadius: radius.control, borderWidth: 1.5, opacity: 1, shadowColor: acc },
  item: { height: ALTURA, alignItems: 'center', justifyContent: 'center' },
  txt: { fontVariant: ['tabular-nums'] },
});

/** Lista de valores de `de` até `ate`, de `passo` em `passo` (como texto, igual ao que é gravado). */
export const faixa = (de: number, ate: number, passo: number) =>
  Array.from({ length: Math.floor((ate - de) / passo) + 1 }, (_, i) => String(Math.round((de + i * passo) * 10) / 10));

/**
 * Roleta transparente que aparece por cima da tela ao tocar num valor: escolhe rolando ou tocando e fecha em
 * "OK" ou tocando fora. O valor muda na hora (a tela atrás já mostra o escolhido).
 */
export function RoletaFlutuante({ titulo, valores, valor, onChange, formatar, onFechar }: {
  titulo: string; valores: string[]; valor: string; onChange: (v: string) => void; formatar?: (v: string) => string; onFechar: () => void;
}) {
  const { colors } = useContext(ThemeContext);
  return (
    <Modal transparent visible animationType="fade" onRequestClose={onFechar} statusBarTranslucent>
      <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0, 0, 0, 0.28)' }]} onPress={onFechar} accessibilityLabel="Fechar" />
      <View pointerEvents="box-none" style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <View style={{ width: 220, borderRadius: 18, padding: 12, gap: 8, backgroundColor: colors.surface + 'e6', borderWidth: 1, borderColor: colors.border }}>
          <Text style={{ color: colors.text, fontWeight: '800', fontSize: 14, textAlign: 'center' }} numberOfLines={2}>{titulo}</Text>
          <Roleta rotulo={titulo} valores={valores} valor={valor} vazio={valor === ''} formatar={formatar} onChange={onChange} />
          <Pressable accessibilityRole="button" onPress={() => { if (valor === '') onChange(valores[Math.max(0, valores.indexOf('0'))]); onFechar(); }}
            style={({ pressed }) => [{ minHeight: 44, borderRadius: radius.control, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' }, pressed && { opacity: 0.85 }]}>
            <Text style={{ color: colors.primaryText, fontWeight: '800', fontSize: 15 }}>OK</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}
