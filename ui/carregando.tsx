import { useContext, useEffect, useRef, useState } from 'react';
import { Animated, Easing, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { syncAll, useAtividadeSync } from '../lib/sync';
import { CloudSlashIcon } from './icons';
import { createTypography, radius, space, ThemeContext } from './theme';

/*
 * Carregamento "de verdade": mostra um círculo girando E um contador de segundos. O contador anda pelo JavaScript do
 * app, então se o app travar ele PARA (o círculo, em celulares, pode continuar girando mesmo travado). Assim dá para
 * saber se está carregando ou travado. Passando de 8 s avisa que está demorando; de 20 s oferece tentar de novo.
 */

/** Segundos desde que `ativo` ficou verdadeiro (reinicia quando volta a ficar). */
export function useSegundos(ativo = true) {
  const [s, setS] = useState(0);
  useEffect(() => {
    if (!ativo) { setS(0); return; }
    const t0 = Date.now();
    setS(0);
    const id = setInterval(() => setS(Math.floor((Date.now() - t0) / 1000)), 500);
    return () => clearInterval(id);
  }, [ativo]);
  return s;
}

/** Círculo girando (cor do tema). */
export function Girando({ size = 28, color }: { size?: number; color?: string }) {
  const { colors } = useContext(ThemeContext);
  const giro = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const anim = Animated.loop(Animated.timing(giro, { toValue: 1, duration: 900, easing: Easing.linear, useNativeDriver: Platform.OS !== 'web' }));
    anim.start();
    return () => anim.stop();
  }, [giro]);
  const cor = color ?? colors.accent;
  const w = Math.max(2, Math.round(size / 9));
  return (
    <Animated.View
      accessibilityRole="progressbar" accessibilityLabel="Carregando"
      style={{ width: size, height: size, borderRadius: size / 2, borderWidth: w, borderColor: colors.border, borderTopColor: cor, transform: [{ rotate: giro.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) }] }} />
  );
}

/** Retira a tela de carregamento inicial do HTML (web), quando o app já abriu. */
export function removerCarregamentoInicial() {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return;
  const w = window as unknown as { __ciTimer?: ReturnType<typeof setInterval> };
  if (w.__ciTimer) clearInterval(w.__ciTimer);
  document.getElementById('carregando-inicial')?.remove();
}

/**
 * Bloco de carregamento: círculo, texto e contador. `cheio` ocupa a tela toda e centraliza; sem ele, ocupa só o
 * espaço do conteúdo. `aoTentar` aparece depois de 20 s (na web, sem ele, recarrega a página).
 */
export function Carregando({ texto = 'Carregando…', cheio = false, aoTentar }: { texto?: string; cheio?: boolean; aoTentar?: () => void }) {
  const { colors } = useContext(ThemeContext);
  const t = createTypography(colors);
  const s = useSegundos(true);
  const msg = s < 8 ? texto : s < 20 ? 'Ainda carregando… a conexão pode estar lenta.' : 'Está demorando mais que o normal. Verifique a conexão. Se o contador parou, o app travou.';
  const tentar = aoTentar ?? (Platform.OS === 'web' ? () => window.location.reload() : undefined);
  return (
    <View style={[k.bloco, cheio && { flex: 1, backgroundColor: colors.bg }]}>
      <Girando size={cheio ? 40 : 30} />
      <Text style={[t.body, k.texto, { color: s < 20 ? colors.text : colors.warning }]}>{msg}</Text>
      <View style={k.tempo}>
        <View style={[k.ponto, { backgroundColor: colors.accent, opacity: s % 2 ? 1 : 0.3 }]} />
        <Text style={[t.caption, { fontVariant: ['tabular-nums'] }]}>{s} s</Text>
      </View>
      {s >= 20 && tentar ? (
        <Pressable accessibilityRole="button" onPress={tentar} style={[k.botao, { backgroundColor: colors.accent }]}>
          <Text style={{ color: colors.primaryText, fontWeight: '800', fontSize: 14.5 }}>Tentar de novo</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/**
 * Faixa no alto da tela enquanto o app sincroniza com o servidor (web e celular): barra correndo e um aviso com os
 * segundos. Só aparece se passar de meio segundo (sincronizações rápidas não piscam). Passando de 15 s avisa que
 * está lenta. Se a sincronização falhar, avisa por alguns segundos e oferece tentar de novo.
 */
export function BarraSincronizacao() {
  const { colors } = useContext(ThemeContext);
  const insets = useSafeAreaInsets();
  const { sincronizando, erro } = useAtividadeSync();
  const [visivel, setVisivel] = useState(false);
  const [mostrarErro, setMostrarErro] = useState(false);
  const [largura, setLargura] = useState(0);
  const corre = useRef(new Animated.Value(0)).current;
  const s = useSegundos(visivel);

  useEffect(() => {
    if (!sincronizando) { setVisivel(false); return; }
    const id = setTimeout(() => setVisivel(true), 600);
    return () => clearTimeout(id);
  }, [sincronizando]);
  useEffect(() => {
    if (!erro || sincronizando) { setMostrarErro(false); return; }
    setMostrarErro(true);
    const id = setTimeout(() => setMostrarErro(false), 8000);
    return () => clearTimeout(id);
  }, [erro, sincronizando]);
  useEffect(() => {
    if (!visivel) return;
    corre.setValue(0);
    const anim = Animated.loop(Animated.timing(corre, { toValue: 1, duration: 1200, easing: Easing.inOut(Easing.quad), useNativeDriver: Platform.OS !== 'web' }));
    anim.start();
    return () => anim.stop();
  }, [visivel, corre]);

  if (!visivel && !mostrarErro) return null;
  const lenta = s >= 15;
  const trecho = Math.max(60, largura * 0.35);
  return (
    <>
      {visivel ? (
        <View pointerEvents="none" onLayout={e => setLargura(e.nativeEvent.layout.width)} style={[k.faixa, k.trilho, { backgroundColor: colors.border }]}>
          <Animated.View style={{ width: trecho, height: 3, backgroundColor: lenta ? colors.warning : colors.accent, transform: [{ translateX: corre.interpolate({ inputRange: [0, 1], outputRange: [-trecho, largura] }) }] }} />
        </View>
      ) : null}
      <View pointerEvents="box-none" style={[k.rodape, { bottom: Math.max(insets.bottom, 0) + 78 }]}>
        {visivel ? (
          <View style={[k.pilula, { backgroundColor: colors.surface, borderColor: lenta ? colors.warning : colors.border }]}>
            <Girando size={14} color={lenta ? colors.warning : colors.accent} />
            <Text style={{ color: lenta ? colors.warning : colors.text, fontSize: 12.5, fontWeight: '700', fontVariant: ['tabular-nums'] }}>
              {lenta ? `Sincronização lenta… ${s} s` : `Sincronizando… ${s} s`}
            </Text>
          </View>
        ) : (
          <Pressable accessibilityRole="button" onPress={() => void syncAll()} style={[k.pilula, { backgroundColor: colors.warningSoft, borderColor: colors.warning }]}>
            <CloudSlashIcon size={14} color={colors.warning} weight="bold" />
            <Text style={{ color: colors.warning, fontSize: 12.5, fontWeight: '800' }}>Sem sincronizar · Tentar de novo</Text>
          </Pressable>
        )}
      </View>
    </>
  );
}

const k = StyleSheet.create({
  bloco: { alignItems: 'center', justifyContent: 'center', gap: space.md, padding: space.xl },
  texto: { textAlign: 'center', maxWidth: 320 },
  tempo: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  ponto: { width: 8, height: 8, borderRadius: 4 },
  botao: { minHeight: 44, paddingHorizontal: 22, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  faixa: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 9000 },
  rodape: { position: 'absolute', left: 0, right: 0, alignItems: 'center', zIndex: 9000 },
  trilho: { height: 3, overflow: 'hidden' },
  pilula: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.pill, borderWidth: 1, maxWidth: '90%' },
});
