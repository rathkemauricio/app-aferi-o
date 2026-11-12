import { type ReactNode, useContext, useEffect, useRef, useState } from 'react';
import { Alert, Animated, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, type TextInputProps, View, type ViewStyle, type StyleProp } from 'react-native';
import { CaretRightIcon, XIcon, type Icon } from './icons';
import { color, radius, shadow, space, ThemeContext, tint as tints, type Tint, type as t } from './theme';

const webNoOutline = Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null;
const ICON_WEIGHT = 'regular' as const;

/* ---------- Diálogos que também funcionam na web ---------- */
export function notify(title: string, message = '') {
  if (Platform.OS === 'web') { window.alert(message ? `${title}\n\n${message}` : title); return; }
  Alert.alert(title, message);
}

export function confirmAction(title: string, message: string, confirmLabel: string, onConfirm: () => void) {
  if (Platform.OS === 'web') { if (window.confirm(message ? `${title}\n\n${message}` : title)) onConfirm(); return; }
  Alert.alert(title, message, [{ text: 'Cancelar', style: 'cancel' }, { text: confirmLabel, style: 'destructive', onPress: onConfirm }]);
}

/* ---------- Botões ---------- */
type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

export function Button({ title, onPress, variant = 'primary', icon: IconCmp, disabled = false, size = 'md', style }: {
  title: string; onPress: () => void; variant?: ButtonVariant; icon?: Icon; disabled?: boolean; size?: 'md' | 'sm'; style?: StyleProp<ViewStyle>;
}) {
  const { colors } = useContext(ThemeContext);
  const fg = variant === 'primary' ? colors.primaryText : variant === 'danger' ? colors.danger : variant === 'ghost' ? colors.accentText : colors.text;
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        k.btn, size === 'sm' && k.btnSm, k[`btn_${variant}`],
        variant === 'primary' && { backgroundColor: colors.accent },
        variant === 'secondary' && { backgroundColor: colors.surface, borderColor: colors.borderStrong },
        variant === 'danger' && { backgroundColor: colors.surface, borderColor: colors.dangerSoft },
        pressed && (variant === 'primary' ? { backgroundColor: colors.accentPressed } : { backgroundColor: colors.neutralSoft }),
        pressed && k.pressed, disabled && k.disabled, style,
      ]}
    >
      {IconCmp ? <IconCmp size={size === 'sm' ? 16 : 18} color={fg} weight={variant === 'primary' ? 'bold' : ICON_WEIGHT} /> : null}
      <Text numberOfLines={1} style={[k.btnText, size === 'sm' && k.btnTextSm, { color: fg }]}>{title}</Text>
    </Pressable>
  );
}

export function IconButton({ icon: IconCmp, onPress, label, tone = 'default' }: { icon: Icon; onPress: () => void; label: string; tone?: 'default' | 'danger' }) {
  const { colors } = useContext(ThemeContext);
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} hitSlop={6} onPress={onPress}
      style={({ pressed }) => [k.iconBtn, pressed && { backgroundColor: tone === 'danger' ? colors.dangerSoft : colors.neutralSoft }]}>
      {({ pressed }) => <IconCmp size={18} color={pressed && tone === 'danger' ? colors.danger : colors.textMuted} weight={ICON_WEIGHT} />}
    </Pressable>
  );
}

/* ---------- Campos ---------- */
export function Field({ label, helper, icon: IconCmp, multiline = false, style, estavel = false, ...input }: TextInputProps & { label?: string; helper?: string; icon?: Icon; estavel?: boolean }) {
  const [focused, setFocused] = useState(false);
  const { colors } = useContext(ThemeContext);
  // Modo estável (campos numéricos): enquanto o campo está em foco, mostra exatamente o que foi digitado,
  // mesmo que a tela normalize o valor (arredondar, limitar, trocar vírgula). Mudanças externas (ex.: botão +20)
  // aparecem na hora; a versão normalizada aparece ao sair do campo.
  const [texto, setTexto] = useState(input.value ?? '');
  const ultimaTecla = useRef(0);
  useEffect(() => { if (!estavel || !focused || Date.now() - ultimaTecla.current > 400) setTexto(input.value ?? ''); }, [input.value, estavel, focused]);
  const valorExibido = estavel && focused ? texto : input.value;
  return (
    <View style={[k.field, style as ViewStyle]}>
      {label ? <Text style={[t.label, { color: colors.textMuted }]}>{label}</Text> : null}
      <View style={[k.inputWrap, { backgroundColor: colors.surface, borderColor: colors.borderStrong }, multiline && k.inputWrapMulti, focused && { borderColor: colors.accent }]}>
        {IconCmp ? <IconCmp size={18} color={colors.textFaint} /> : null}
        <TextInput
          {...input}
          value={valorExibido}
          onChangeText={v => { ultimaTecla.current = Date.now(); setTexto(v); input.onChangeText?.(v); }}
          multiline={multiline}
          placeholderTextColor={colors.textFaint}
          onFocus={e => { setFocused(true); input.onFocus?.(e); }}
          onBlur={e => { setFocused(false); input.onBlur?.(e); }}
          style={[k.input, { color: colors.text }, multiline && k.inputMulti, webNoOutline]}
        />
      </View>
      {helper ? <Text style={[k.helper, { color: colors.textFaint }]}>{helper}</Text> : null}
    </View>
  );
}

/* ---------- Superfícies ---------- */
export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const { colors } = useContext(ThemeContext);
  return <View style={[k.card, { backgroundColor: colors.surface, borderColor: colors.border }, style]}>{children}</View>;
}

export function IconTile({ icon: IconCmp, tint = 'indigo', size = 40 }: { icon: Icon; tint?: Tint; size?: number }) {
  const c = tints[tint];
  const { mode, colors } = useContext(ThemeContext);
  return (
    <View style={[k.tile, { width: size, height: size, backgroundColor: mode === 'dark' ? colors.surfaceMuted : c.bg }]}>
      <IconCmp size={Math.round(size * 0.5)} color={mode === 'dark' ? colors.accentText : c.fg} weight="duotone" />
    </View>
  );
}

export function ListRow({ icon, tint, title, subtitle, right, onPress, chevron = !!onPress, style }: {
  icon?: Icon; tint?: Tint; title: ReactNode; subtitle?: ReactNode; right?: ReactNode; onPress?: () => void; chevron?: boolean; style?: StyleProp<ViewStyle>;
}) {
  const { colors } = useContext(ThemeContext);
  const body = (
    <>
      {icon ? <IconTile icon={icon} tint={tint} /> : null}
      <View style={k.flex}>
        <Text style={[t.bodyStrong, { color: colors.text }]} numberOfLines={1}>{title}</Text>
        {subtitle ? <Text style={[t.caption, { color: colors.textMuted }]} numberOfLines={2}>{subtitle}</Text> : null}
      </View>
      {right}
      {chevron ? <CaretRightIcon size={16} color={colors.textFaint} /> : null}
    </>
  );
  if (!onPress) return <View style={[k.row, { backgroundColor: colors.surface }, style]}>{body}</View>;
  return <Pressable onPress={onPress} style={({ pressed }) => [k.row, { backgroundColor: colors.surface }, style, pressed && { backgroundColor: colors.surfaceMuted }]}>{body}</Pressable>;
}

/* ---------- Status ---------- */
export type Tone = 'success' | 'warning' | 'danger' | 'neutral' | 'accent';
const toneColors: Record<Tone, { bg: string; fg: string }> = {
  success: { bg: color.successSoft, fg: color.success },
  warning: { bg: color.warningSoft, fg: color.warning },
  danger: { bg: color.dangerSoft, fg: color.danger },
  neutral: { bg: color.neutralSoft, fg: color.textMuted },
  accent: { bg: color.accentSoft, fg: color.accentText },
};

export function StatusPill({ label, tone = 'neutral', icon: IconCmp }: { label: string; tone?: Tone; icon?: Icon }) {
  const { colors } = useContext(ThemeContext);
  const c = tone === 'neutral' ? { bg: colors.neutralSoft, fg: colors.textMuted } : tone === 'accent' ? { bg: colors.accentSoft, fg: colors.accentText } : toneColors[tone];
  return (
    <View style={[k.pill, { backgroundColor: c.bg }]}>
      {IconCmp ? <IconCmp size={13} color={c.fg} weight="bold" /> : null}
      <Text style={[k.pillText, { color: c.fg }]} numberOfLines={1}>{label}</Text>
    </View>
  );
}

export function ChoiceChips({ value, options, onChange, toneFor }: { value: string; options: string[]; onChange: (v: string) => void; toneFor?: (option: string) => Tone }) {
  const { colors } = useContext(ThemeContext);
  return (
    <View style={k.chips}>
      {options.map(option => {
        const active = value === option;
        const tone = toneFor?.(option) ?? 'accent';
        const c = tone === 'accent' ? { bg: colors.accentSoft, fg: colors.accentText } : toneColors[tone];
        return (
          <Pressable key={option} onPress={() => onChange(option)} accessibilityRole="button" accessibilityState={{ selected: active }}
            style={({ pressed }) => [k.chip, { backgroundColor: colors.surface, borderColor: colors.borderStrong }, active && { backgroundColor: c.bg, borderColor: c.fg }, pressed && k.pressed]}>
            <Text style={[k.chipText, { color: colors.textMuted }, active && { color: c.fg }]}>{option}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/* ---------- Estrutura ---------- */
export function SectionHeader({ title, action, onPress }: { title: string; action?: string; onPress?: () => void }) {
  const { colors } = useContext(ThemeContext);
  return (
    <View style={k.sectionHead}>
      <Text style={[t.section, { color: colors.text }]}>{title}</Text>
      {action && onPress ? <Pressable onPress={onPress} hitSlop={8}><Text style={k.link}>{action}</Text></Pressable> : null}
    </View>
  );
}

export function EmptyState({ icon, title, text, action }: { icon: Icon; title: string; text?: string; action?: { label: string; onPress: () => void; icon?: Icon } }) {
  const { colors } = useContext(ThemeContext);
  return (
    <View style={[k.empty, { backgroundColor: colors.surface, borderColor: colors.borderStrong }]}>
      <IconTile icon={icon} tint="slate" size={48} />
      <Text style={[t.bodyStrong, k.center, { color: colors.text }]}>{title}</Text>
      {text ? <Text style={[t.caption, k.center, { color: colors.textMuted }]}>{text}</Text> : null}
      {action ? <Button title={action.label} icon={action.icon} variant="secondary" size="sm" onPress={action.onPress} style={{ marginTop: space.sm }} /> : null}
    </View>
  );
}

export function Stat({ icon, tint, label, value }: { icon: Icon; tint: Tint; label: string; value: number }) {
  const { colors } = useContext(ThemeContext);
  return (
    <View style={[k.stat, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <IconTile icon={icon} tint={tint} size={34} />
      <Text style={[k.statValue, { color: colors.text }]}>{value}</Text>
      <Text style={[t.caption, { color: colors.textMuted }]}>{label}</Text>
    </View>
  );
}

export function Steps({ steps, current }: { steps: string[]; current: number }) {
  const { colors } = useContext(ThemeContext);
  return (
    <View style={k.steps}>
      {steps.map((label, i) => {
        const done = i < current, active = i === current;
        return (
          <View key={label} style={k.step}>
            <View style={[k.stepBar, (done || active) && { backgroundColor: colors.accent }, active && { opacity: 0.55 }]} />
            <Text style={[k.stepText, (done || active) && { color: colors.accentText }, active && { fontWeight: '700' }]} numberOfLines={1}>{label}</Text>
          </View>
        );
      })}
    </View>
  );
}

export function Sheet({ title, onClose, children, footer }: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode }) {
  const { colors } = useContext(ThemeContext);
  const y = useRef(new Animated.Value(40)).current;
  const o = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.parallel([
      Animated.timing(o, { toValue: 1, duration: 160, useNativeDriver: Platform.OS !== 'web' }),
      Animated.spring(y, { toValue: 0, damping: 22, stiffness: 260, useNativeDriver: Platform.OS !== 'web' }),
    ]).start();
  }, [o, y]);
  // Modal garante que a janela cubra a tela inteira mesmo quando é declarada dentro de uma área com rolagem.
  return (
    <Modal transparent visible animationType="none" onRequestClose={onClose} statusBarTranslucent>
    <Animated.View style={[k.backdrop, { opacity: o }]}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Fechar" />
      <Animated.View style={[k.sheet, { backgroundColor: colors.bg, transform: [{ translateY: y }] }]}>
        <View style={k.grabber} />
        <View style={[k.sheetHead, { backgroundColor: colors.bg }]}>
          <Text style={[t.section, k.flex, { color: colors.text }]}>{title}</Text>
          <IconButton icon={XIcon} label="Fechar" onPress={onClose} />
        </View>
        <ScrollView contentContainerStyle={k.sheetBody} keyboardShouldPersistTaps="handled">{children}</ScrollView>
        {footer ? <View style={[k.sheetFooter, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>{footer}</View> : null}
      </Animated.View>
    </Animated.View>
    </Modal>
  );
}

export function Skeleton({ height, width = '100%', style }: { height: number; width?: number | `${number}%`; style?: StyleProp<ViewStyle> }) {
  const { colors } = useContext(ThemeContext);
  const o = useRef(new Animated.Value(0.5)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(o, { toValue: 1, duration: 700, useNativeDriver: Platform.OS !== 'web' }),
      Animated.timing(o, { toValue: 0.5, duration: 700, useNativeDriver: Platform.OS !== 'web' }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [o]);
  return <Animated.View style={[{ height, width, borderRadius: radius.control, backgroundColor: colors.border, opacity: o }, style]} />;
}

const k = StyleSheet.create({
  flex: { flex: 1 },
  center: { textAlign: 'center' },
  pressed: { transform: [{ scale: 0.98 }] },
  disabled: { opacity: 0.45 },

  btn: { minHeight: 46, paddingHorizontal: space.lg, borderRadius: Platform.OS === 'web' ? radius.pill : radius.control, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.sm },
  btnSm: { minHeight: 36, paddingHorizontal: space.md },
  btn_primary: { backgroundColor: color.accent },
  btn_secondary: { backgroundColor: color.surface, borderWidth: 1, borderColor: color.borderStrong },
  btn_ghost: { backgroundColor: 'transparent' },
  btn_danger: { backgroundColor: color.surface, borderWidth: 1, borderColor: '#f3c7c2' },
  btnText: { fontSize: 14.5, fontWeight: '700' },
  btnTextSm: { fontSize: 13 },
  iconBtn: { width: 36, height: 36, borderRadius: radius.tile, alignItems: 'center', justifyContent: 'center' },

  field: { gap: 6 },
  inputWrap: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 46, paddingHorizontal: space.md, borderRadius: radius.control, borderWidth: 1.5, borderColor: color.borderStrong, backgroundColor: color.surface },
  inputWrapMulti: { alignItems: 'flex-start', paddingVertical: space.sm },
  input: { flex: 1, fontSize: 15, color: color.text, paddingVertical: 10 },
  inputMulti: { minHeight: 84, textAlignVertical: 'top' },
  helper: { fontSize: 12, color: color.textFaint },

  card: { backgroundColor: color.surface, borderRadius: radius.card, borderWidth: 1, borderColor: color.border, padding: space.lg, gap: space.md, ...shadow.card },
  tile: { borderRadius: radius.tile, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md, paddingHorizontal: space.md, backgroundColor: color.surface, borderRadius: radius.control },
  rowPressed: { backgroundColor: color.surfaceMuted },

  pill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 4, paddingHorizontal: 9, borderRadius: radius.pill, alignSelf: 'flex-start' },
  pillText: { fontSize: 12, fontWeight: '700' },

  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  chip: { minHeight: 36, justifyContent: 'center', paddingHorizontal: 14, borderRadius: radius.pill, borderWidth: 1, borderColor: color.borderStrong, backgroundColor: color.surface },
  chipText: { fontSize: 13, fontWeight: '600', color: color.textMuted },

  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: space.sm },
  link: { fontSize: 13.5, fontWeight: '700', color: color.accentText },

  empty: { alignItems: 'center', gap: 6, paddingVertical: space.xxl, paddingHorizontal: space.xl, borderRadius: radius.card, borderWidth: 1, borderStyle: 'dashed', borderColor: color.borderStrong, backgroundColor: color.surface },

  stat: { flexGrow: 1, flexBasis: 140, backgroundColor: color.surface, borderRadius: radius.card, borderWidth: 1, borderColor: color.border, padding: space.md, gap: 6, ...shadow.card },
  statValue: { fontSize: 26, fontWeight: '800', letterSpacing: -0.6, color: color.text, fontVariant: ['tabular-nums'], marginTop: 4 },

  steps: { flexDirection: 'row', gap: 6 },
  step: { flex: 1, gap: 6 },
  stepBar: { height: 4, borderRadius: 2, backgroundColor: color.border },
  stepText: { fontSize: 12, color: color.textFaint },

  backdrop: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: 'rgba(20, 25, 34, 0.42)', justifyContent: 'flex-end' },
  sheet: { maxHeight: '90%', width: '100%', maxWidth: 640, alignSelf: 'center', backgroundColor: color.bg, borderTopLeftRadius: Platform.OS === 'web' ? radius.card : 22, borderTopRightRadius: Platform.OS === 'web' ? radius.card : 22, ...shadow.sheet },
  grabber: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: color.borderStrong, marginTop: 8 },
  sheetHead: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.lg, paddingTop: space.sm, paddingBottom: space.xs },
  sheetBody: { padding: space.lg, paddingTop: space.sm, gap: space.md },
  sheetFooter: { padding: space.lg, paddingTop: space.md, gap: space.sm, borderTopWidth: 1, borderTopColor: color.border, backgroundColor: color.surface },
});
