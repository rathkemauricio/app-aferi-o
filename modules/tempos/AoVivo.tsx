import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { AppState, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { cancelAnimation, Easing, FadeIn, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { Avatar } from '../../components/Avatar';
import { supabase } from '../../lib/supabase';
import { ArrowRightIcon, CaretDownIcon, PauseIcon } from '../../ui/icons';
import { radius, space } from '../../ui/theme';
import { setoresDasEtapas } from './calc';
import { type Atendimento, etapaAberta, etapaPausada, fmtDur, ms } from './model';
import type { TmData } from './store';
import { useLook } from './ui';

/*
 * Tempos e Movimentos ao vivo: quem está cronometrando o quê agora.
 * O aparelho que cronometra manda os cronômetros abertos na presença (TemposModule → useAtividade, campo dados);
 * os outros leem pela função tempos_ao_vivo (migração 20261124000100) a cada 8 s. O relógio anda sozinho na tela,
 * pelo horário de início da etapa, então parece contínuo mesmo entre uma leitura e outra.
 */

/** Cronômetro aberto (um registro em andamento), do jeito que vai na presença. */
export type Cronometro = {
  /** Id do rascunho: o do próprio aparelho não aparece duplicado. */
  id: string;
  coleta: string;
  filial: string;
  tipo: 'completo' | 'isolada';
  funcionario: string;
  /** Etapa em andamento ('' = entre uma etapa e outra). */
  atividade: string;
  setor: string;
  /** Início da etapa em andamento. */
  desde: string | null;
  /** Início da pausa aberta (null = correndo). */
  pausada: string | null;
  /** Pausas já encerradas na etapa em andamento (s). */
  pausas_s: number;
  /** Etapas encerradas: nome e duração (as últimas 4, da mais antiga para a mais nova). */
  ultimas: [string, number][];
  etapas: number;
  /** Soma das etapas encerradas (s). */
  feito_s: number;
};
export type AoVivo = Cronometro & { quem: string; meu: boolean };

const nomeAtv = (d: TmData, id: string) => d.atividades.find(a => a.id === id)?.nome ?? 'Atividade removida';

/** Cronômetro a partir do rascunho deste aparelho. */
export function cronometroDe(d: TmData, a: Atendimento): Cronometro | null {
  const c = d.coletas.find(x => x.id === a.coleta_id);
  if (!c) return null;
  const e = etapaAberta(a);
  const setores = setoresDasEtapas(d, c, a);
  const fechadas = a.etapas.filter(x => x.fim);
  return {
    id: a.id, coleta: c.id, filial: c.filial_id, tipo: a.tipo, funcionario: a.funcionario,
    atividade: e ? nomeAtv(d, e.atividade_id) : '',
    setor: e ? setores[a.etapas.indexOf(e)] || '' : '',
    desde: e?.inicio ?? null,
    pausada: e && etapaPausada(e) ? e.pausas[e.pausas.length - 1][0] : null,
    pausas_s: e ? Math.round(e.pausas.reduce((s, [i, f]) => s + (f ? Math.max(0, (ms(f) - ms(i)) / 1000) : 0), 0)) : 0,
    ultimas: fechadas.slice(-4).map(x => [nomeAtv(d, x.atividade_id), Math.round(x.duracao_s)]),
    etapas: a.etapas.length,
    feito_s: Math.round(fechadas.reduce((s, x) => s + x.duracao_s, 0)),
  };
}

/** Segundos da etapa em andamento agora (parado durante a pausa). */
export const segundosDaEtapa = (c: Cronometro, agora: number) =>
  c.desde ? Math.max(0, ((c.pausada ? ms(c.pausada) : agora) - ms(c.desde)) / 1000 - c.pausas_s) : 0;

/* ---------- Leitura dos outros aparelhos ---------- */
type Linha = { user_id: string; nome: string; cronometros: Cronometro[] };
let remotos: Linha[] = [];
const ouvintes = new Set<() => void>();
let relogio: ReturnType<typeof setInterval> | null = null;
/** Servidor ainda sem a função (migração não aplicada): para de perguntar. */
let semFuncao = false;

const valido = (c: unknown): c is Cronometro => !!c && typeof c === 'object' && typeof (c as Cronometro).id === 'string' && typeof (c as Cronometro).coleta === 'string';

async function buscar() {
  if (!supabase || semFuncao) return;
  if (Platform.OS === 'web' ? typeof document !== 'undefined' && document.visibilityState === 'hidden' : AppState.currentState !== 'active') return;
  const { data, error } = await supabase.rpc('tempos_ao_vivo');
  if (error) { if (error.code === 'PGRST202') semFuncao = true; return; }
  remotos = ((data ?? []) as { user_id: string; nome: string | null; cronometros: unknown }[]).map(l => ({
    user_id: l.user_id, nome: l.nome ?? '',
    cronometros: (Array.isArray(l.cronometros) ? l.cronometros : []).filter(valido).map(c => ({ ...c, ultimas: Array.isArray(c.ultimas) ? c.ultimas : [] })),
  }));
  ouvintes.forEach(f => f());
}
/** Lê enquanto alguma tela do módulo estiver olhando. */
function assinar(f: () => void) {
  ouvintes.add(f);
  if (!relogio) { void buscar(); relogio = setInterval(() => void buscar(), 8000); }
  return () => { ouvintes.delete(f); if (!ouvintes.size && relogio) { clearInterval(relogio); relogio = null; } };
}
const foto = () => remotos;

/** Cronômetros abertos na rede: os deste aparelho (na hora) e os dos outros (a cada 8 s). */
export function useAoVivo(d: TmData): AoVivo[] {
  const outros = useSyncExternalStore(assinar, foto, foto);
  return useMemo(() => {
    const meus = d.rascunhos.map(a => cronometroDe(d, a)).filter((c): c is Cronometro => !!c).map(c => ({ ...c, quem: 'Você', meu: true }));
    const ids = new Set(meus.map(c => c.id));
    const deles = outros.flatMap(l => l.cronometros.filter(c => !ids.has(c.id)).map(c => ({ ...c, quem: l.nome || 'Auditor', meu: false })));
    return [...meus, ...deles];
  }, [d, outros]);
}

/** Relógio de 1 s, só enquanto há cronômetro aberto. */
export function useSegundo(ativo: boolean) {
  const [agora, setAgora] = useState(Date.now());
  useEffect(() => {
    if (!ativo) return;
    setAgora(Date.now());
    const i = setInterval(() => setAgora(Date.now()), 1000);
    return () => clearInterval(i);
  }, [ativo]);
  return agora;
}

/* ---------- Peças visuais ---------- */
/** Ponto vermelho que pulsa (como "gravando"); parado com "reduzir movimento" ou em pausa. */
export function PontoAoVivo({ pausado = false }: { pausado?: boolean }) {
  const { colors } = useLook();
  const reduz = useReducedMotion();
  const v = useSharedValue(1);
  useEffect(() => {
    if (reduz || pausado) { cancelAnimation(v); v.value = 1; return; }
    v.value = withRepeat(withTiming(0.3, { duration: 900, easing: Easing.inOut(Easing.ease) }), -1, true);
    return () => cancelAnimation(v);
  }, [reduz, pausado, v]);
  const st = useAnimatedStyle(() => ({ opacity: v.value }));
  return <Animated.View style={[x.ponto, { backgroundColor: pausado ? colors.warning : colors.danger }, st]} />;
}

/** Etiqueta "Ao vivo" (com quantos cronômetros, quando mais de um). */
export function EtiquetaAoVivo({ n }: { n: number }) {
  const { colors } = useLook();
  return (
    <View style={[x.etiqueta, { backgroundColor: colors.dangerSoft }]} accessibilityLabel={`${n} cronômetro(s) ao vivo`}>
      <PontoAoVivo />
      <Text style={[x.etiquetaTexto, { color: colors.danger }]}>{n > 1 ? `${n} ao vivo` : 'Ao vivo'}</Text>
    </View>
  );
}

/**
 * Cronômetro aberto de alguém: quem, o que está cronometrando, o setor e o relógio correndo.
 * Tocar abre o rastro das últimas etapas e a ação (continuar o meu ou abrir a coleta).
 */
export function LinhaAoVivo({ v, agora, fotoDe, onAbrir, rotuloAbrir }: {
  v: AoVivo; agora: number; fotoDe?: (nome: string) => string | null; onAbrir?: () => void; rotuloAbrir?: string;
}) {
  const { colors, t } = useLook();
  const [aberto, setAberto] = useState(false);
  const pausado = !!v.pausada;
  const etapa = segundosDaEtapa(v, agora);
  const quem = v.meu ? 'Você' : v.quem;
  const oQue = v.atividade || 'Entre uma etapa e outra';
  return (
    <View style={[x.caixa, { backgroundColor: colors.campo, borderColor: pausado ? colors.warning : colors.border }]}>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: aberto }}
        accessibilityLabel={`${quem} cronometrando ${oQue}${pausado ? ', pausado' : ''}, ${fmtDur(etapa)}`}
        onPress={() => setAberto(a => !a)} style={({ pressed }) => [x.linha, pressed && { opacity: 0.7 }]}>
        <Avatar uri={v.meu ? null : fotoDe?.(v.quem)} nome={v.meu ? 'Você' : v.quem} size={32} />
        <View style={x.flex}>
          <Text style={[t.caption, { color: colors.textMuted }]} numberOfLines={1}>
            <Text style={{ fontWeight: '700', color: colors.text }}>{quem}</Text>{pausado ? ' pausou' : ' está cronometrando'}
            {v.funcionario ? ` · ${v.funcionario}` : ''}
          </Text>
          <Text style={[t.bodyStrong, { color: colors.text }]} numberOfLines={1}>{oQue}</Text>
          {v.setor ? <Text style={[t.caption, { color: colors.textMuted }]} numberOfLines={1}>{v.setor}</Text> : null}
        </View>
        <View style={x.direita}>
          <View style={x.relogioLinha}>
            {pausado ? <PauseIcon size={13} color={colors.warning} weight="fill" /> : <PontoAoVivo />}
            <Text style={[x.relogio, { color: pausado ? colors.warning : colors.text }]}>{fmtDur(etapa)}</Text>
          </View>
          <Text style={[t.caption, { color: colors.textMuted }]}>{v.tipo === 'completo' ? `etapa ${Math.max(1, v.etapas)}` : 'atividade'}</Text>
        </View>
        <CaretDownIcon size={14} color={colors.textFaint} style={{ transform: [{ rotate: aberto ? '180deg' : '0deg' }] }} />
      </Pressable>
      {aberto ? (
        <Animated.View entering={FadeIn.duration(160)} style={x.detalhe}>
          {v.ultimas.length ? (
            <View style={x.rastro}>
              {v.ultimas.map(([nome, seg], i) => (
                <View key={`${i}-${nome}`} style={[x.passo, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <Text style={[t.caption, { color: colors.text }]} numberOfLines={1}>{nome}</Text>
                  <Text style={[t.caption, x.tabular, { color: colors.textMuted }]}>{fmtDur(seg)}</Text>
                </View>
              ))}
              {v.atividade ? (
                <View style={[x.passo, { backgroundColor: colors.accentSoft, borderColor: colors.accentSoft }]}>
                  <Text style={[t.caption, { color: colors.accentText, fontWeight: '700' }]} numberOfLines={1}>Agora: {v.atividade}</Text>
                </View>
              ) : null}
            </View>
          ) : <Text style={[t.caption, { color: colors.textMuted }]}>Primeira etapa deste registro.</Text>}
          <Text style={[t.caption, x.tabular, { color: colors.textMuted }]}>
            Tempo do registro: {fmtDur(v.feito_s + etapa)} em {v.etapas} etapa(s){v.meu ? '' : '. Atualiza a cada poucos segundos.'}
          </Text>
          {onAbrir ? (
            <Pressable accessibilityRole="button" onPress={onAbrir} style={({ pressed }) => [x.acao, { backgroundColor: colors.accent }, pressed && { transform: [{ scale: 0.97 }] }]}>
              <Text style={[x.acaoTexto, { color: colors.primaryText }]}>{rotuloAbrir ?? 'Abrir'}</Text>
              <ArrowRightIcon size={14} color={colors.primaryText} weight="bold" />
            </Pressable>
          ) : null}
        </Animated.View>
      ) : null}
    </View>
  );
}

const x = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  tabular: { fontVariant: ['tabular-nums'] },
  ponto: { width: 8, height: 8, borderRadius: 4 },
  etiqueta: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 9, paddingVertical: 4, borderRadius: radius.pill },
  etiquetaTexto: { fontSize: 11.5, fontWeight: '800', letterSpacing: 0.2 },
  caixa: { borderRadius: radius.control, borderWidth: 1, overflow: 'hidden' },
  linha: { flexDirection: 'row', alignItems: 'center', gap: space.sm + 2, paddingHorizontal: space.md, paddingVertical: 10 },
  direita: { alignItems: 'flex-end', gap: 1 },
  relogioLinha: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  relogio: { fontSize: 18, fontWeight: '800', letterSpacing: -0.3, fontVariant: ['tabular-nums'] },
  detalhe: { paddingHorizontal: space.md, paddingBottom: space.md, gap: space.sm },
  rastro: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  passo: { flexDirection: 'row', alignItems: 'center', gap: 6, maxWidth: '100%', paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.pill, borderWidth: 1 },
  acao: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingHorizontal: 14, height: 34, borderRadius: radius.pill },
  acaoTexto: { fontSize: 13, fontWeight: '700' },
});
