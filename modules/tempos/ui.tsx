import { useContext, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { createTypography, pageMaxWidth, radius, space, ThemeContext, type ThemeColors } from '../../ui/theme';
import { type Atividade, num } from './model';

/** Cores e estilos do tema atual, prontos para uso nas telas do módulo. */
export function useLook() {
  const { colors, mode } = useContext(ThemeContext);
  const t = useMemo(() => createTypography(colors), [colors]);
  const s = useMemo(() => createStyles(colors), [colors]);
  return { colors, mode, t, s };
}

/** Relógio para exibir cronômetros. Só fica ativo quando há algo rodando. */
export function useNow(active: boolean) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const i = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(i);
  }, [active]);
  return now;
}

/** Botões de atividade. `destaque` marca a próxima etapa sugerida; `feitas` aparecem esmaecidas. */
export function ActivityPicker({ atividades, onPick, destaque, feitas = [] }: { atividades: Atividade[]; onPick: (a: Atividade) => void; destaque?: string; feitas?: string[] }) {
  const { s } = useLook();
  return (
    <View style={s.picker}>
      {atividades.map(a => {
        const hi = a.id === destaque, done = feitas.includes(a.id);
        return (
          <Pressable key={a.id} accessibilityRole="button" onPress={() => onPick(a)}
            style={({ pressed }) => [s.pick, hi && s.pickHi, done && s.pickDone, pressed && s.pressed]}>
            <Text style={[s.pickText, hi && s.pickTextHi]} numberOfLines={2}>{a.nome}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Barras horizontais simples (rótulo, barra proporcional ao maior valor, valor). */
export function BarList({ items, unit = '' }: { items: [string, number][]; unit?: string }) {
  const { s, t } = useLook();
  const max = Math.max(...items.map(i => i[1]), 0.0001);
  if (!items.length) return <Text style={t.caption}>Sem dados no filtro atual.</Text>;
  return (
    <View style={{ gap: 10 }}>
      {items.map(([label, v]) => (
        <View key={label} style={{ gap: 4 }}>
          <View style={s.barHead}>
            <Text style={[t.body, { flex: 1 }]} numberOfLines={1}>{label}</Text>
            <Text style={s.barValue}>{num(v)}{unit}</Text>
          </View>
          <View style={[s.bar, { width: `${Math.max((v / max) * 100, 2)}%` }]} />
        </View>
      ))}
    </View>
  );
}

export function Kpi({ label, value }: { label: string; value: string }) {
  const { s, t } = useLook();
  return (
    <View style={s.kpi}>
      <Text style={s.kpiValue} numberOfLines={1}>{value}</Text>
      <Text style={t.caption}>{label}</Text>
    </View>
  );
}

export const createStyles = (c: ThemeColors) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: c.bg },
  flex: { flex: 1 },
  stack: { gap: space.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  twoCol: { flexDirection: 'row', gap: space.md },
  group: { gap: space.sm },
  alignStart: { alignSelf: 'flex-start', marginLeft: -space.sm },
  pressed: { transform: [{ scale: 0.98 }] },
  content: { padding: space.lg, paddingBottom: space.xxl * 2, width: '100%', maxWidth: pageMaxWidth(760), alignSelf: 'center', gap: space.md },
  pageHead: { flexDirection: 'row', alignItems: 'flex-end', gap: space.md },
  listCard: { padding: space.xs, gap: 0 },
  divided: { borderTopWidth: 1, borderTopColor: c.border, borderRadius: 0 },

  header: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.lg, paddingVertical: space.md, backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border },
  brandMark: { width: 34, height: 34, borderRadius: radius.tile, backgroundColor: c.accent, alignItems: 'center', justifyContent: 'center' },
  brandName: { fontSize: 15.5, fontWeight: '800', color: c.text, letterSpacing: -0.2 },
  brandSub: { fontSize: 12, color: c.textMuted },
  banner: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.lg, paddingVertical: 10, backgroundColor: c.warningSoft },
  bannerText: { flex: 1, fontSize: 12.5, color: c.warning },

  nav: { flexDirection: 'row', backgroundColor: c.surface, borderTopWidth: 1, borderTopColor: c.border, paddingTop: 6 },
  navItem: { flex: 1, alignItems: 'center', gap: 2 },
  navIcon: { width: 52, height: 30, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  navIconActive: { backgroundColor: c.accentSoft },
  navLabel: { fontSize: 11.5, fontWeight: '600', color: c.textFaint },
  navLabelActive: { color: c.accentText, fontWeight: '700' },

  picker: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  pick: { minHeight: 44, maxWidth: '100%', justifyContent: 'center', paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.control, borderWidth: 1, borderColor: c.borderStrong, backgroundColor: c.surface },
  pickHi: { borderColor: c.accent, backgroundColor: c.accentSoft, borderWidth: 1.5 },
  pickDone: { opacity: 0.55 },
  pickText: { fontSize: 13.5, fontWeight: '600', color: c.text },
  pickTextHi: { color: c.accentText },

  clock: { fontSize: 44, fontWeight: '800', letterSpacing: -1, color: c.text, fontVariant: ['tabular-nums'], textAlign: 'center' },
  clockSmall: { fontSize: 15, fontWeight: '700', color: c.text, fontVariant: ['tabular-nums'] },
  running: { borderColor: c.accent, borderWidth: 1.5 },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: c.danger },

  stepNum: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: c.surfaceMuted, borderWidth: 1, borderColor: c.border },
  stepNumText: { fontSize: 12, fontWeight: '700', color: c.textMuted },
  mono: { fontVariant: ['tabular-nums'] },

  kpis: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  kpi: { flexGrow: 1, flexBasis: 150, padding: space.md, gap: 2, borderRadius: radius.card, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border },
  kpiValue: { fontSize: 22, fontWeight: '800', letterSpacing: -0.5, color: c.text, fontVariant: ['tabular-nums'] },

  barHead: { flexDirection: 'row', alignItems: 'baseline', gap: space.sm },
  barValue: { fontSize: 13, fontWeight: '700', color: c.text, fontVariant: ['tabular-nums'] },
  bar: { height: 8, borderRadius: 4, backgroundColor: c.accent },
});
