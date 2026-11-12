import { type ReactNode, useContext, useMemo, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { CameraIcon, CheckIcon, FileArrowUpIcon, ImagesIcon, MagnifyingGlassIcon, PaperclipIcon, XIcon } from '../../ui/icons';
import { Button, Field, notify } from '../../ui/kit';
import { createTypography, pageMaxWidth, radius, space, ThemeContext, type ThemeColors } from '../../ui/theme';
import { type Classe, COR_CLASSE, corNivel, type Crit, type Evidencia, MATRIZ, NIVEIS, nivelDe, type Unidade } from './model';
import { abrirEvidencia, type Arquivo, escolherEvidencia } from './store';

export function useEstilos() {
  const { colors } = useContext(ThemeContext);
  const t = useMemo(() => createTypography(colors), [colors]);
  const s = useMemo(() => estilos(colors), [colors]);
  return { colors, t, s };
}

/* ---------- Indicadores ---------- */
export function Kpis({ itens }: { itens: { label: string; valor: string | number; cor?: string; destaque?: boolean }[] }) {
  const { s, colors } = useEstilos();
  return (
    <View style={s.kpis}>
      {itens.map(k => (
        <View key={k.label} style={[s.kpi, k.destaque && s.kpiDestaque]}>
          <Text style={[s.kpiLabel, k.destaque && { color: colors.text }]} numberOfLines={1}>{k.label}</Text>
          <Text style={[s.kpiValor, !k.destaque && k.cor ? { color: k.cor } : null]} numberOfLines={1}>{k.valor}</Text>
        </View>
      ))}
    </View>
  );
}

export function Etiqueta({ texto, cor, fundo }: { texto: string; cor: string; fundo?: string }) {
  const { s } = useEstilos();
  return <View style={[s.etiqueta, { backgroundColor: fundo ?? cor + '1f' }]}><Text style={[s.etiquetaTxt, { color: cor }]} numberOfLines={1}>{texto}</Text></View>;
}
export const EtiquetaClasse = ({ cl }: { cl: Classe }) => <Etiqueta texto={cl} cor={COR_CLASSE[cl]} />;

/** Bolinhas com a pontuação de cada critério. */
export function Pips({ u }: { u: Pick<Unidade, Crit> }) {
  const { s, colors } = useEstilos();
  return (
    <View style={s.pips}>
      {MATRIZ.map(m => (
        <View key={m.k} style={s.pip}>
          <View style={[s.pipVal, { backgroundColor: corNivel(u[m.k]) + '22', borderColor: corNivel(u[m.k]) }]}><Text style={[s.pipTxt, { color: corNivel(u[m.k]) }]}>{u[m.k] || '–'}</Text></View>
          <Text style={[s.pipLabel, { color: colors.textMuted }]} numberOfLines={1}>{m.curto}</Text>
        </View>
      ))}
    </View>
  );
}

/** Escolha de 1 a 5 para um critério da matriz, com a descrição do nível. */
export function CritPicker({ k, valor, onChange, mostrarPeso }: { k: Crit; valor: number; onChange: (v: number) => void; mostrarPeso?: boolean }) {
  const { s, t, colors } = useEstilos();
  const m = MATRIZ.find(x => x.k === k)!;
  const lv = valor ? nivelDe(valor) : null;
  return (
    <View style={s.crit}>
      <View style={s.critHead}>
        <View style={s.flex}>
          <Text style={t.bodyStrong}>{m.nome}</Text>
          {mostrarPeso ? <Text style={[t.caption, { fontSize: 11 }]}>compõe {m.feeds}</Text> : null}
        </View>
        <View style={s.critChips}>
          {[1, 2, 3, 4, 5].map(n => {
            const on = n === valor; const cor = corNivel(n);
            return (
              <Pressable key={n} accessibilityRole="radio" accessibilityState={{ selected: on }} accessibilityLabel={`${m.nome}: ${n}`} hitSlop={4} onPress={() => onChange(n === valor ? 0 : n)}
                style={[s.critChip, { borderColor: cor }, on && { backgroundColor: cor }]}>
                <Text style={[s.critChipTxt, { color: on ? '#fff' : cor }]}>{n}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>
      <Text style={t.caption}>{lv ? <Text style={{ fontWeight: '800', color: corNivel(valor) }}>{NIVEIS[lv].label} ({NIVEIS[lv].faixa}) </Text> : null}{lv ? m[lv] : <Text style={{ color: colors.textFaint }}>Selecione de 1 a 5: 1–2 Baixo · 3 Médio · 4–5 Alto</Text>}</Text>
    </View>
  );
}

/** Lista para escolher uma unidade, com busca. */
export function UnidadePicker({ unidades, valor, onChange }: { unidades: Unidade[]; valor: string; onChange: (id: string) => void }) {
  const { s, t, colors } = useEstilos();
  const [busca, setBusca] = useState('');
  const lista = unidades.filter(u => u.nome.toLowerCase().includes(busca.toLowerCase()));
  return (
    <View style={{ gap: space.sm }}>
      <Field icon={MagnifyingGlassIcon} value={busca} onChangeText={setBusca} placeholder="Buscar unidade" />
      <View style={s.listBox}>
        <ScrollView nestedScrollEnabled>
          {lista.map((u, i) => {
            const on = u.id === valor;
            return (
              <Pressable key={u.id} accessibilityRole="radio" accessibilityState={{ selected: on }} onPress={() => onChange(u.id)} style={[s.opcao, i > 0 && s.divided, on && { backgroundColor: colors.accentSoft }]}>
                <Text style={[t.body, s.flex, on && { color: colors.accentText, fontWeight: '700' }]} numberOfLines={1}>{u.nome}</Text>
                {on ? <CheckIcon size={16} color={colors.accentText} weight="bold" /> : null}
              </Pressable>
            );
          })}
          {!lista.length && <Text style={[t.caption, { padding: 12 }]}>Nenhuma unidade encontrada.</Text>}
        </ScrollView>
      </View>
    </View>
  );
}

/** Evidência opcional escolhida antes de salvar (foto, galeria ou documento). */
export function EvidenciaPicker({ arquivo, onChange }: { arquivo: Arquivo | null; onChange: (a: Arquivo | null) => void }) {
  const { s, t, colors } = useEstilos();
  const pegar = async (o: 'camera' | 'galeria' | 'arquivo') => {
    try { const a = await escolherEvidencia(o); if (a) onChange(a); } catch (e) { notify('Evidência não anexada', e instanceof Error ? e.message : ''); }
  };
  return (
    <View style={{ gap: space.sm }}>
      <Text style={t.label}>Evidência (opcional)</Text>
      {arquivo ? (
        <View style={s.anexo}>
          <PaperclipIcon size={16} color={colors.accentText} />
          <Text style={[t.body, s.flex]} numberOfLines={1}>{arquivo.nome}</Text>
          <Pressable accessibilityLabel="Remover evidência" hitSlop={8} onPress={() => onChange(null)}><XIcon size={16} color={colors.textMuted} /></Pressable>
        </View>
      ) : (
        <View style={s.wrap}>
          {Platform.OS !== 'web' ? <Button title="Câmera" icon={CameraIcon} variant="secondary" size="sm" onPress={() => void pegar('camera')} /> : null}
          {Platform.OS !== 'web' ? <Button title="Galeria" icon={ImagesIcon} variant="secondary" size="sm" onPress={() => void pegar('galeria')} /> : null}
          <Button title="Arquivo" icon={FileArrowUpIcon} variant="secondary" size="sm" onPress={() => void pegar('arquivo')} />
        </View>
      )}
      <Text style={t.caption}>Pode ser foto, PDF ou documento (até 10 MB). Precisa de internet para enviar.</Text>
    </View>
  );
}

export function EvidenciaChip({ ev }: { ev: Evidencia | null | undefined }) {
  const { s, t, colors } = useEstilos();
  if (!ev) return null;
  return (
    <Pressable accessibilityRole="link" onPress={() => void abrirEvidencia(ev).catch(e => notify('Evidência', e instanceof Error ? e.message : ''))} style={s.anexo}>
      <PaperclipIcon size={15} color={colors.accentText} />
      <Text style={[t.caption, s.flex, { color: colors.accentText, fontWeight: '700' }]} numberOfLines={1}>Evidência: {ev.nome}</Text>
    </Pressable>
  );
}

export function Caixa({ children, cor }: { children: ReactNode; cor: string }) {
  const { s } = useEstilos();
  return <View style={[s.caixa, { borderColor: cor + '66', backgroundColor: cor + '14' }]}>{children}</View>;
}

export function Marcar({ valor, onChange, texto }: { valor: boolean; onChange: (v: boolean) => void; texto: string }) {
  const { s, t, colors } = useEstilos();
  return (
    <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: valor }} onPress={() => onChange(!valor)} style={s.marcar}>
      <View style={[s.box, valor && { backgroundColor: colors.accent, borderColor: colors.accent }]}>{valor ? <CheckIcon size={13} color="#fff" weight="bold" /> : null}</View>
      <Text style={[t.body, s.flex]}>{texto}</Text>
    </Pressable>
  );
}

export const estilos = (c: ThemeColors) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: c.bg },
  flex: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  twoCol: { flexDirection: 'row', gap: space.sm },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  stack: { gap: space.md },
  alignStart: { alignSelf: 'flex-start' },
  content: { padding: space.lg, paddingBottom: space.xxl * 2, width: '100%', maxWidth: pageMaxWidth(1000), alignSelf: 'center' },
  pageHead: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  kpis: { flexDirection: 'row', flexWrap: 'wrap', gap: Platform.OS === 'web' ? 12 : 6 },
  kpi: { flexGrow: 1, flexBasis: Platform.OS === 'web' ? 160 : 100, minHeight: Platform.OS === 'web' ? 94 : undefined, justifyContent: 'space-between', padding: Platform.OS === 'web' ? 14 : 10, borderRadius: radius.card, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface },
  kpiDestaque: { backgroundColor: c.accent, borderColor: c.accent },
  kpiLabel: { fontSize: Platform.OS === 'web' ? 12 : 10.5, fontWeight: '600', color: c.textMuted },
  kpiValor: { fontSize: Platform.OS === 'web' ? 22 : 20, fontWeight: '800', color: c.text, marginTop: 8, fontVariant: ['tabular-nums'] },
  etiqueta: { paddingVertical: 3, paddingHorizontal: 8, borderRadius: radius.pill, alignSelf: 'flex-start' },
  etiquetaTxt: { fontSize: 11.5, fontWeight: '800' },
  pips: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  pip: { alignItems: 'center', width: 58, gap: 2 },
  pipVal: { width: 28, height: 28, borderRadius: 14, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  pipTxt: { fontWeight: '800', fontSize: 13 },
  pipLabel: { fontSize: 10 },
  meta: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md },
  metaItem: { minWidth: 92 },
  metaLabel: { fontSize: 10.5, fontWeight: '700', color: c.textMuted, textTransform: 'uppercase' },
  metaValor: { fontSize: 13.5, fontWeight: '700', color: c.text, marginTop: 1 },
  crit: { gap: 6, paddingVertical: space.sm, borderBottomWidth: 1, borderBottomColor: c.border },
  critHead: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  critChips: { flexDirection: 'row', gap: 5 },
  critChip: { width: 34, height: 34, borderRadius: 9, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  critChipTxt: { fontWeight: '800', fontSize: 14 },
  listBox: { borderWidth: 1, borderColor: c.border, borderRadius: radius.control, overflow: 'hidden', maxHeight: 220, backgroundColor: c.surface },
  opcao: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: 12, minHeight: 44 },
  divided: { borderTopWidth: 1, borderTopColor: c.border },
  anexo: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: 8, paddingHorizontal: 10, borderRadius: radius.control, borderWidth: 1, borderColor: c.border, backgroundColor: c.surfaceMuted },
  caixa: { padding: space.md, borderRadius: radius.control, borderWidth: 1, gap: 4 },
  marcar: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 40 },
  box: { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: c.borderStrong, alignItems: 'center', justifyContent: 'center' },
  barra: { height: 8, borderRadius: 4, backgroundColor: c.border, overflow: 'hidden', flex: 1 },
  barraFill: { height: 8, borderRadius: 4 },
  divisor: { height: 1, backgroundColor: c.border },
});

export function Meta({ itens }: { itens: { label: string; valor: string; cor?: string }[] }) {
  const { s } = useEstilos();
  return (
    <View style={s.meta}>
      {itens.map(i => (
        <View key={i.label} style={s.metaItem}>
          <Text style={s.metaLabel}>{i.label}</Text>
          <Text style={[s.metaValor, i.cor ? { color: i.cor } : null]}>{i.valor}</Text>
        </View>
      ))}
    </View>
  );
}

export function Barra({ pct, cor }: { pct: number; cor: string }) {
  const { s } = useEstilos();
  return <View style={s.barra}><View style={[s.barraFill, { width: `${Math.max(0, Math.min(100, pct))}%`, backgroundColor: cor }]} /></View>;
}
