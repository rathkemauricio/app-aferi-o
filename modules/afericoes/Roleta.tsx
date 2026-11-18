import { type ComponentRef, useContext, useEffect, useMemo, useRef } from 'react';
import { type NativeScrollEvent, type NativeSyntheticEvent, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
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

  // Vai até o valor quando ele muda por fora (cronômetro, troca de bico).
  useEffect(() => {
    ultimo.current = atual;
    const id = setTimeout(() => ref.current?.scrollTo({ y: atual * ALTURA, animated: true }), 30);
    return () => clearTimeout(id);
  }, [atual]);

  const escolher = (i: number) => {
    const n = Math.max(0, Math.min(valores.length - 1, i));
    ultimo.current = n;
    if (valores[n] !== valor) onChange(valores[n]);
    ref.current?.scrollTo({ y: n * ALTURA, animated: true });
  };
  const aoParar = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const i = Math.round(e.nativeEvent.contentOffset.y / ALTURA);
    if (i !== ultimo.current || vazio) escolher(i);
  };
  // Na web não há "fim do arremesso": escolhe quando a rolagem para.
  const aoRolar = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (Platform.OS !== 'web') return;
    const y = e.nativeEvent.contentOffset.y;
    if (espera.current) clearTimeout(espera.current);
    espera.current = setTimeout(() => { const i = Math.round(y / ALTURA); if (i !== ultimo.current) escolher(i); }, 140);
  };
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
        onMomentumScrollEnd={aoParar}
        onScrollEndDrag={e => { if (Platform.OS === 'android' && !e.nativeEvent.velocity?.y) aoParar(e); }}
        onScroll={aoRolar}
        scrollEventThrottle={32}
        contentOffset={{ x: 0, y: atual * ALTURA }}
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
