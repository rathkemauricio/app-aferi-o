import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { BackHandler, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { isSupabaseConfigured } from '../../lib/supabase';
import { ArrowLeftIcon, ChartBarIcon, ClockCounterClockwiseIcon, CloudCheckIcon, CloudSlashIcon, DeviceMobileIcon, GearIcon, HourglassIcon, type Icon, TimerIcon } from '../../ui/icons';
import { ChoiceChips, IconButton, Skeleton, StatusPill } from '../../ui/kit';
import { CadastrosTab } from './CadastrosTab';
import { AtendimentoScreen, ColetaScreen, ColetasHome } from './ColetasTab';
import { DimensionamentoTab } from './DimensionamentoTab';
import { HistoricoTab } from './HistoricoTab';
import { PainelTab } from './PainelTab';
import { PlanoTab } from './PlanoTab';
import { type ColetasView, type GestaoAba, loadUi, saveUi, sincronizarModulo, type Tab, UI_PADRAO, type UiState, useTm } from './store';
import { useLook } from './ui';

const NAV: [Tab, Icon, string][] = [['coletas', TimerIcon, 'Coletas'], ['painel', ChartBarIcon, 'Painel'], ['historico', ClockCounterClockwiseIcon, 'Histórico'], ['gestao', GearIcon, 'Gestão']];
const GESTAO: [GestaoAba, string][] = [['dimensionamento', 'Dimensionamento'], ['plano', 'Plano de ação'], ['cadastros', 'Cadastros']];

export default function TemposModule() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { s, colors } = useLook();
  const { data, loaded, status } = useTm();
  const [ui, setUiState] = useState<UiState | null>(null);

  // Restaura o lugar onde o usuário estava (aba, coleta, atendimento) e grava a cada mudança.
  useEffect(() => { void loadUi().then(setUiState); void sincronizarModulo(); }, []);
  const setUi = useCallback((fn: (u: UiState) => UiState) => setUiState(u => { const next = fn(u ?? UI_PADRAO); saveUi(next); return next; }), []);

  const stack = ui?.stack ?? UI_PADRAO.stack;
  const view = stack[stack.length - 1];
  const tab = ui?.tab ?? 'coletas';
  const push = useCallback((v: ColetasView) => setUi(u => ({ ...u, stack: [...u.stack, v] })), [setUi]);
  const pop = useCallback(() => setUi(u => ({ ...u, stack: u.stack.length > 1 ? u.stack.slice(0, -1) : u.stack })), [setUi]);
  const setTab = useCallback((t: Tab) => setUi(u => ({ ...u, tab: t })), [setUi]);
  const setFilialId = useCallback((id: string) => setUi(u => ({ ...u, filialId: id })), [setUi]);
  const exit = useCallback(() => { if (router.canGoBack()) router.back(); else router.replace('/'); }, [router]);

  // Botão voltar do Android: primeiro volta dentro do módulo, depois sai.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (tab === 'coletas' && stack.length > 1) { pop(); return true; }
      if (tab !== 'coletas') { setTab('coletas'); return true; }
      return false;
    });
    return () => sub.remove();
  }, [tab, stack.length, pop, setTab]);

  const openFromHistory = (v: ColetasView) => {
    if (v.name !== 'atendimento') return;
    setUi(u => ({ ...u, tab: 'coletas', stack: [{ name: 'home' }, { name: 'coleta', coletaId: v.coletaId }, v] }));
  };

  const syncPill = !isSupabaseConfigured ? <StatusPill icon={DeviceMobileIcon} label="Neste aparelho" />
    : status === 'error' ? <StatusPill icon={CloudSlashIcon} label="Sem sincronizar" tone="warning" />
    : status === 'syncing' ? <StatusPill label="Sincronizando" />
    : <StatusPill icon={CloudCheckIcon} label="Sincronizado" tone="success" />;

  const body = () => {
    if (!ui) return null;
    if (tab === 'painel') return <PainelTab data={data} />;
    if (tab === 'historico') return <HistoricoTab data={data} open={openFromHistory} />;
    if (tab === 'gestao') return <>
      <ChoiceChips value={GESTAO.find(g => g[0] === ui.gestao)?.[1] ?? 'Dimensionamento'} options={GESTAO.map(g => g[1])} onChange={v => setUi(u => ({ ...u, gestao: GESTAO.find(g => g[1] === v)?.[0] ?? 'dimensionamento' }))} />
      {ui.gestao === 'plano' ? <PlanoTab data={data} filialId={ui.filialId} />
        : ui.gestao === 'cadastros' ? <CadastrosTab data={data} />
        : <DimensionamentoTab data={data} filialId={ui.filialId} setFilialId={setFilialId} />}
    </>;
    const nav = { push, pop };
    if (view.name === 'coleta') return <ColetaScreen data={data} nav={nav} coletaId={view.coletaId} />;
    if (view.name === 'atendimento') return <AtendimentoScreen data={data} nav={nav} coletaId={view.coletaId} atendimentoId={view.atendimentoId} />;
    return <ColetasHome data={data} nav={nav} filialId={ui.filialId} setFilialId={setFilialId} />;
  };

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <View style={s.header}>
        <IconButton icon={ArrowLeftIcon} label="Voltar aos módulos" onPress={exit} />
        <View style={s.brandMark}><HourglassIcon size={18} color="#fff" weight="bold" /></View>
        <View style={s.flex}>
          <Text style={s.brandName} numberOfLines={1}>Tempos e Movimentos</Text>
          <Text style={s.brandSub}>Módulo</Text>
        </View>
        {syncPill}
      </View>
      {status === 'error' && (
        <View style={s.banner}>
          <CloudSlashIcon size={16} color={colors.warning} />
          <Text style={s.bannerText}>Sem conexão com a nuvem. Tudo continua salvo neste aparelho e será enviado quando a conexão voltar.</Text>
        </View>
      )}

      <ScrollView key={`${tab}-${tab === 'coletas' ? stack.length : ui?.gestao}`} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
        {loaded && ui ? body() : <View style={s.stack}><Skeleton height={28} width="45%" /><Skeleton height={90} /><Skeleton height={160} /></View>}
      </ScrollView>

      <View style={[s.nav, { paddingBottom: Math.max(insets.bottom, 6) }]}>
        {NAV.map(([id, NavIcon, label]) => {
          const active = tab === id;
          return (
            <Pressable key={id} accessibilityRole="tab" accessibilityState={{ selected: active }} style={s.navItem}
              onPress={() => { if (id === 'coletas' && tab === 'coletas') setUi(u => ({ ...u, stack: [{ name: 'home' }] })); else setTab(id); }}>
              <View style={[s.navIcon, active && s.navIconActive]}><NavIcon size={22} color={active ? colors.accent : colors.textFaint} weight={active ? 'fill' : 'regular'} /></View>
              <Text style={[s.navLabel, active && s.navLabelActive]}>{label}</Text>
            </Pressable>
          );
        })}
      </View>
    </SafeAreaView>
  );
}
