import { type Href, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../lib/auth';
import { acompanhar, type Atividade, estaOnline, nomeDaTela, type Presenca } from '../../lib/presenca';
import { supabase } from '../../lib/supabase';
import { MODULES } from '../../modules/registry';
import { BroadcastIcon, EyeIcon, LockSimpleIcon, UserCircleIcon } from '../../ui/icons';
import { Button, Card, EmptyState, notify, SectionHeader, Skeleton, StatusPill } from '../../ui/kit';
import { createTypography, pageMaxWidth, radius, space, ThemeContext } from '../../ui/theme';
import { BotaoVoltar } from '../../ui/voltar';

type Rede = { id: string; nome: string; status: string };
const DIA = 24 * 60 * 60_000;

function haQuanto(iso: string, agora: number) {
  const min = Math.max(0, Math.round((agora - new Date(iso).getTime()) / 60_000));
  if (min < 1) return 'agora';
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  return h < 24 ? `há ${h} h${min % 60 ? ` ${min % 60} min` : ''}` : new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

/**
 * Quem está online: o administrador vê as contas da própria rede; o dono da plataforma vê todas as redes e pode
 * entrar numa delas como auditor (só leitura) para acompanhar qualquer coleta em andamento, de qualquer módulo.
 */
export default function OnlineScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ rede?: string }>();
  const { isAdmin, dono, userId, empresa, visita, visitar } = useAuth();
  const { colors } = useContext(ThemeContext);
  const t = useMemo(() => createTypography(colors), [colors]);
  const [lista, setLista] = useState<Presenca[] | null>(null);
  const [redes, setRedes] = useState<Rede[]>([]);
  const [rede, setRede] = useState<string>(params.rede ?? (dono ? '' : 'minha'));
  const [erro, setErro] = useState('');
  const [agora, setAgora] = useState(Date.now());
  const [atualizando, setAtualizando] = useState(false);
  const [entrando, setEntrando] = useState(false);
  const pode = isAdmin || dono;

  const carregar = useCallback(async () => {
    if (!supabase) return;
    const desde = new Date(Date.now() - DIA).toISOString();
    const r = await supabase.from('presenca').select('*').gte('visto_em', desde).order('visto_em', { ascending: false }).limit(500);
    setAgora(Date.now());
    if (r.error) { setErro('Não foi possível carregar. Verifique a conexão.'); return; }
    setErro(''); setLista(r.data as Presenca[]);
  }, []);
  useEffect(() => {
    if (!pode) return;
    void carregar();
    const tm = setInterval(() => { void carregar(); }, 10_000);
    return () => clearInterval(tm);
  }, [pode, carregar]);
  useEffect(() => {
    if (!dono || !supabase) return;
    void supabase.from('empresas').select('id,nome,status').order('nome').then(r => { if (r.data) setRedes(r.data as Rede[]); });
  }, [dono]);

  // Admin: só a própria rede (a regra do banco já filtra). Dono: todas, ou a rede escolhida.
  const daRede = useMemo(() => (lista ?? []).filter(p => !dono || !rede || rede === 'minha' || p.empresa_id === rede), [lista, dono, rede]);
  const online = daRede.filter(p => estaOnline(p, agora));
  const vistos = daRede.filter(p => !estaOnline(p, agora));
  const coletando = online.filter(p => p.atividade && p.user_id !== userId);
  const nomeRede = (id: string | null) => redes.find(r => r.id === id)?.nome ?? (id === empresa?.id ? empresa?.nome : '') ?? '';
  const porRede = useMemo(() => {
    const m = new Map<string, number>();
    (lista ?? []).forEach(p => { if (p.empresa_id && estaOnline(p, agora)) m.set(p.empresa_id, (m.get(p.empresa_id) ?? 0) + 1); });
    return m;
  }, [lista, agora]);
  const redeAtual = rede && rede !== 'minha' ? redes.find(r => r.id === rede) ?? null : null;
  const voltar = () => (router.canGoBack() ? router.back() : router.replace('/'));

  /** Abre a coleta da pessoa. Dono e rede diferente da que está usando: entra antes como auditor (só leitura). */
  const acompanharColeta = async (p: Presenca) => {
    const destino = (p.atividade?.abrir || MODULES.find(m => m.id === p.atividade?.modulo)?.route || '/') as Href;
    if (p.empresa_id && p.empresa_id !== empresa?.id) {
      if (!dono) return;
      setEntrando(true);
      const e = await visitar(p.empresa_id);
      setEntrando(false);
      if (e) { notify('Não deu para entrar na rede', e); return; }
    }
    acompanhar();
    router.push(destino);
  };
  const entrarComoAuditor = async (r: Rede) => {
    setEntrando(true);
    const e = await visitar(r.id);
    setEntrando(false);
    if (e) { notify('Não deu para entrar na rede', e); return; }
    notify(`Você está na ${r.nome} como auditor`, 'Pode abrir qualquer módulo para ver. Nada é alterado. Para voltar, toque em "Sair da visita" no alto.');
    router.replace('/');
  };

  const cartaoAtividade = (a: Atividade, p: Presenca) => {
    const m = MODULES.find(x => x.id === a.modulo);
    const Icone = m?.icon ?? BroadcastIcon;
    const pct = typeof a.pct === 'number' ? Math.max(0, Math.min(100, a.pct)) : null;
    return (
      <View style={{ gap: 6, padding: space.sm, borderRadius: radius.control, borderWidth: 1, borderColor: colors.accent, backgroundColor: colors.surfaceMuted }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
          <Icone size={18} color={colors.accentText} weight="duotone" />
          <Text style={[t.bodyStrong, { flex: 1 }]} numberOfLines={2}>{m?.name ?? a.modulo} · {a.titulo}</Text>
        </View>
        {a.filial ? <Text style={t.caption} numberOfLines={1}>{a.filial}</Text> : null}
        {a.detalhe ? <Text style={t.body}>{a.detalhe}</Text> : null}
        {pct !== null ? (
          <View style={{ height: 6, borderRadius: 3, backgroundColor: colors.border, overflow: 'hidden' }}>
            <View style={{ width: `${pct}%`, height: 6, backgroundColor: colors.accent }} />
          </View>
        ) : null}
        {a.recentes?.length ? (
          <View style={{ gap: 2 }}>
            <Text style={[t.caption, { fontWeight: '700' }]}>Últimos lançamentos</Text>
            {a.recentes.slice(0, 5).map((x, i) => <Text key={i} style={t.caption} numberOfLines={1}>{x}</Text>)}
          </View>
        ) : null}
        {p.user_id !== userId ? (
          <Button title={p.empresa_id !== empresa?.id ? 'Acompanhar (entra como auditor)' : 'Acompanhar'} icon={EyeIcon} size="sm" style={{ alignSelf: 'flex-start' }}
            disabled={entrando} onPress={() => void acompanharColeta(p)} />
        ) : null}
      </View>
    );
  };

  const cartaoPessoa = (p: Presenca) => {
    const on = estaOnline(p, agora);
    const quem = p.filial_id ? 'conta de filial' : p.papel === 'admin' ? 'administrador' : 'auditoria';
    return (
      <Card key={p.user_id}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
          <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: on ? colors.success : colors.textFaint }} />
          <View style={{ flex: 1 }}>
            <Text style={t.bodyStrong} numberOfLines={1}>{p.nome || p.email}{p.user_id === userId ? ' (você)' : ''}</Text>
            <Text style={t.caption} numberOfLines={2}>
              {p.nome ? `${p.email} · ` : ''}{quem}{dono && (!rede || rede === 'minha') && p.empresa_id ? ` · ${nomeRede(p.empresa_id)}` : ''}
            </Text>
          </View>
          <StatusPill label={on ? 'Online' : `Visto ${haQuanto(p.visto_em, agora)}`} tone={on ? 'success' : 'neutral'} />
        </View>
        <Text style={t.caption}>
          {on ? `Em ${nomeDaTela(p.tela)} · ${p.plataforma} · online desde ${new Date(p.desde).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}` : `Última tela: ${nomeDaTela(p.tela)} · ${p.plataforma}`}
          {dono && p.visitando ? ` · visitando ${nomeRede(p.visitando) || 'outra rede'}` : ''}
        </Text>
        {on && p.atividade ? cartaoAtividade(p.atividade, p) : null}
      </Card>
    );
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.lg, paddingVertical: space.md, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border }}>
        <BotaoVoltar label="Voltar" onPress={voltar} />
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 15.5, fontWeight: '800', color: colors.text }}>Quem está online</Text>
          <Text style={t.caption}>{dono ? 'Todas as redes · atualiza a cada 10 s' : `${empresa?.nome ?? 'Sua rede'} · atualiza a cada 10 s`}</Text>
        </View>
      </View>
      <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.md, width: '100%', maxWidth: pageMaxWidth(820), alignSelf: 'center', paddingBottom: 56 }}
        refreshControl={<RefreshControl refreshing={atualizando} onRefresh={() => { setAtualizando(true); void carregar().finally(() => setAtualizando(false)); }} />}>
        {!pode ? <EmptyState icon={LockSimpleIcon} title="Acesso restrito" text="Só o administrador da rede vê quem está online." />
          : erro ? <EmptyState icon={BroadcastIcon} title="Não foi possível carregar" text={erro} action={{ label: 'Tentar de novo', onPress: () => void carregar() }} />
          : !lista ? <><Skeleton height={90} /><Skeleton height={90} /></>
          : <>
            {dono && redes.length ? (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
                {[{ id: '', nome: 'Todas as redes', status: 'ativa' }, ...redes.filter(r => r.status === 'ativa')].map(r => {
                  const sel = rede === r.id || (!r.id && rede === 'minha');
                  const n = r.id ? porRede.get(r.id) ?? 0 : online.length;
                  return (
                    <Pressable key={r.id || 'todas'} accessibilityRole="button" accessibilityState={{ selected: sel }} onPress={() => setRede(r.id)}
                      style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 36, paddingHorizontal: 12, borderRadius: radius.pill, borderWidth: 1, borderColor: sel ? colors.accent : colors.borderStrong, backgroundColor: sel ? colors.accentSoft : colors.surface }, pressed && { opacity: 0.7 }]}>
                      <Text style={{ fontSize: 13, fontWeight: '600', color: sel ? colors.accentText : colors.textMuted }}>{r.nome}</Text>
                      {n ? <Text style={{ fontSize: 12, fontWeight: '800', color: colors.success }}>● {n}</Text> : null}
                    </Pressable>
                  );
                })}
              </View>
            ) : null}
            {dono && redeAtual ? (
              <Card style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
                <EyeIcon size={22} color={colors.accentText} weight="duotone" />
                <Text style={[t.body, { flex: 1 }]}>
                  {visita?.id === redeAtual.id ? `Você já está na ${redeAtual.nome} como auditor.` : `Entre na ${redeAtual.nome} como auditor para ver os módulos dela, sem alterar nada.`}
                </Text>
                {visita?.id === redeAtual.id || empresa?.id === redeAtual.id ? null
                  : <Button title="Entrar como auditor" size="sm" disabled={entrando} onPress={() => void entrarComoAuditor(redeAtual)} />}
              </Card>
            ) : null}

            {coletando.length ? (
              <Card style={{ borderColor: colors.accent, flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
                <BroadcastIcon size={22} color={colors.accentText} weight="duotone" />
                <Text style={[t.body, { flex: 1 }]}>
                  {coletando.length === 1 ? '1 pessoa coletando agora' : `${coletando.length} pessoas coletando agora`}: {coletando.map(p => `${p.nome || p.email} (${MODULES.find(m => m.id === p.atividade?.modulo)?.name ?? p.atividade?.modulo})`).join(', ')}.
                </Text>
              </Card>
            ) : null}

            <SectionHeader title={`Online agora (${online.length})`} />
            {online.length ? online.map(cartaoPessoa) : <EmptyState icon={UserCircleIcon} title="Ninguém online agora" text="Quem abrir o EasyAudit aparece aqui em até 30 segundos." />}
            {vistos.length ? <>
              <SectionHeader title={`Vistos nas últimas 24 h (${vistos.length})`} />
              {vistos.map(cartaoPessoa)}
            </> : null}
            <Text style={t.caption}>Online = usou o EasyAudit nos últimos 2 minutos. O andamento de cada coleta é enviado pelo aparelho de quem está coletando.</Text>
          </>}
      </ScrollView>
    </SafeAreaView>
  );
}
