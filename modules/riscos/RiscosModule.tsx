import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { isSupabaseConfigured } from '../../lib/supabase';
import { ArrowLeftIcon, CloudCheckIcon, CloudSlashIcon, DeviceMobileIcon, ShieldWarningIcon } from '../../ui/icons';
import { IconButton, StatusPill } from '../../ui/kit';
import { space } from '../../ui/theme';
import AgendaTab from './AgendaTab';
import DestaqueTab from './DestaqueTab';
import HistTab from './HistTab';
import MapaTab from './MapaTab';
import PlanTab from './PlanTab';
import ProdTab from './ProdTab';
import { syncRiscos, useRiscos } from './store';
import { useEstilos } from './ui';

const SESSAO = 'nevoeiro.riscos.aba.v1';
const ABAS = [
  { id: 'mapa', rotulo: 'Mapa de Risco' },
  { id: 'agenda', rotulo: 'Agenda' },
  { id: 'prod', rotulo: 'Produtividade' },
  { id: 'plan', rotulo: 'Planejamento' },
  { id: 'hist', rotulo: 'Histórico de Auditorias' },
  { id: 'premio', rotulo: '🏆 Filial Destaque' },
] as const;
type Aba = (typeof ABAS)[number]['id'];

export default function RiscosModule() {
  const router = useRouter();
  const { s, t, colors } = useEstilos();
  const d = useRiscos();
  const [aba, setAba] = useState<Aba>('mapa');
  const [pronta, setPronta] = useState(false);

  useEffect(() => {
    void AsyncStorage.getItem(SESSAO).then(v => { if (v && ABAS.some(a => a.id === v)) setAba(v as Aba); }).catch(() => undefined).finally(() => setPronta(true));
    void syncRiscos();
  }, []);
  useEffect(() => { if (pronta) void AsyncStorage.setItem(SESSAO, aba).catch(() => undefined); }, [aba, pronta]);

  const voltar = () => { if (router.canGoBack()) router.back(); else router.replace('/'); };
  const syncPill = !isSupabaseConfigured
    ? <StatusPill icon={DeviceMobileIcon} label="Neste aparelho" />
    : d.status === 'error' ? <StatusPill icon={CloudSlashIcon} label="Sem sincronizar" tone="warning" /> : <StatusPill icon={CloudCheckIcon} label="Sincronizado" tone="success" />;

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <View style={[e.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <IconButton icon={ArrowLeftIcon} label="Voltar aos módulos" onPress={voltar} />
        <View style={e.marca}><ShieldWarningIcon size={18} color="#fff" weight="bold" /></View>
        <View style={s.flex}>
          <Text style={[e.nome, { color: colors.text }]}>Mapa de Risco</Text>
          <Text style={t.caption}>Prevenção de Perdas · Filial Destaque</Text>
        </View>
        {syncPill}
      </View>
      <View style={[e.abasWrap, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={e.abas}>
          {ABAS.map(a => {
            const on = a.id === aba;
            return (
              <Pressable key={a.id} accessibilityRole="tab" accessibilityState={{ selected: on }} onPress={() => setAba(a.id)}
                style={[e.aba, on && { borderBottomColor: colors.accent }]}>
                <Text style={[e.abaTxt, { color: on ? colors.accentText : colors.textMuted }, on && { fontWeight: '800' }]}>{a.rotulo}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
      {!d.loaded || !pronta ? <View style={e.carregando}><ActivityIndicator color={colors.accent} /></View>
        : aba === 'mapa' ? <MapaTab d={d} />
        : aba === 'agenda' ? <AgendaTab d={d} />
        : aba === 'prod' ? <ProdTab d={d} />
        : aba === 'plan' ? <PlanTab d={d} />
        : aba === 'hist' ? <HistTab d={d} />
        : <DestaqueTab d={d} />}
    </SafeAreaView>
  );
}

const e = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.lg, paddingVertical: space.md, borderBottomWidth: 1 },
  marca: { width: 34, height: 34, borderRadius: 10, backgroundColor: '#c43d48', alignItems: 'center', justifyContent: 'center' },
  nome: { fontSize: 15.5, fontWeight: '800' },
  abasWrap: { borderBottomWidth: 1 },
  abas: { paddingHorizontal: space.md, gap: 4 },
  aba: { paddingHorizontal: 12, paddingVertical: 11, borderBottomWidth: 2.5, borderBottomColor: 'transparent' },
  abaTxt: { fontSize: 13.5, fontWeight: '600' },
  carregando: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
