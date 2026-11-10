import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, AppState, FlatList, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { isSupabaseConfigured, supabase } from '../lib/supabase';

type Activity = { id: string; label: string; startedAt?: number; endedAt?: number; durationMs?: number; status: 'pending' | 'running' | 'done' | 'skipped' };
type RecordItem = { id: string; date: string; branch: string; createdAt: number; status: 'open' | 'done'; activities: Activity[] };
const KEY = 'nevoeiro.service.records.v1';
const GREEN = '#16834a', NAVY = '#102b46', BLUE = '#1769aa';
const templates = [
  { id: 'approach', label: 'Abordagem do frentista', optional: false },
  { id: 'fuel', label: 'Abastecimento', optional: false },
  { id: 'windshield', label: 'Limpeza do para-brisa', optional: true },
  { id: 'tires', label: 'Calibragem dos pneus', optional: true },
  { id: 'fluids', label: 'VerificaÃ§Ã£o de Ã¡gua e Ã³leo', optional: true },
  { id: 'payment', label: 'Pagamento', optional: false },
];
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
const dateLabel = (s: string) => { const [y,m,d] = s.split('-'); return `${d}/${m}/${y}`; };
const duration = (ms = 0) => { const seconds = Math.floor(ms/1000); return `${String(Math.floor(seconds/60)).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`; };
const passwordMeetsPolicy = (value: string) => value.length >= 8 && /[a-z]/.test(value) && /[A-Z]/.test(value) && /\d/.test(value);
const newActivities = (): Activity[] => templates.map(t => ({ id: t.id, label: t.label, status: 'pending' }));

export default function Home() {
  const [records, setRecords] = useState<RecordItem[]>([]);
  const [branch, setBranch] = useState('');
  const [date, setDate] = useState(today());
  const [recordId, setRecordId] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  const [loaded, setLoaded] = useState(false);
  const [tab, setTab] = useState<'registro' | 'historico'>('registro');
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authBusy, setAuthBusy] = useState(false);
  const [syncError, setSyncError] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(KEY).then(raw => { if (raw) { const data = JSON.parse(raw) as RecordItem[]; setRecords(data); if (data[0]?.branch) setBranch(data[0].branch); } }).catch(() => Alert.alert('Erro', 'NÃ£o foi possÃ­vel carregar os registros.')).finally(() => setLoaded(true));
    if (!supabase) { setAuthReady(true); return; }
    supabase.auth.getSession().then(({ data }) => { setUserEmail(data.session?.user.email ?? null); setAuthReady(true); });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => { setUserEmail(session?.user.email ?? null); setAuthReady(true); });
    return () => subscription.unsubscribe();
  }, []);
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 500); return () => clearInterval(id); }, []);
  const persist = useCallback(async (next: RecordItem[]) => {
    setRecords(next);
    try { await AsyncStorage.setItem(KEY, JSON.stringify(next)); } catch { Alert.alert('Erro ao salvar', 'Confira o espaÃ§o disponÃ­vel no aparelho.'); }
    if (!supabase || !userEmail) return;
    try {
      const { error } = await supabase.from('service_records').upsert(next.map(r => ({ id: r.id, branch: r.branch, service_date: r.date, status: r.status, payload: r, updated_at: new Date().toISOString() })));
      if (error) throw error;
      setSyncError(false);
    } catch { setSyncError(true); }
  }, [userEmail]);

  useEffect(() => {
    if (!supabase || !userEmail || !loaded) return;
    let alive = true;
    const refresh = async () => {
      try {
        const { data, error } = await supabase.from('service_records').select('id,payload');
        if (error) throw error;
        if (!alive) return;
        const remote = (data ?? []).map(row => row.payload as RecordItem);
        const remoteIds = new Set(remote.map(r => r.id));
        const localOnly = records.filter(r => !remoteIds.has(r.id));
        const merged = [...localOnly, ...remote].sort((a, b) => b.createdAt - a.createdAt);
        setRecords(merged);
        await AsyncStorage.setItem(KEY, JSON.stringify(merged));
        if (localOnly.length) {
          const { error: pushError } = await supabase.from('service_records').upsert(localOnly.map(r => ({ id: r.id, branch: r.branch, service_date: r.date, status: r.status, payload: r, updated_at: new Date().toISOString() })));
          if (pushError) throw pushError;
        }
        setSyncError(false);
      } catch { if (alive) setSyncError(true); }
    };
    void refresh();
    const channel = supabase.channel('service-records-live').on('postgres_changes', { event: '*', schema: 'public', table: 'service_records' }, () => { void refresh(); }).subscribe();
    const appState = AppState.addEventListener('change', state => { if (state === 'active') void refresh(); });
    return () => { alive = false; appState.remove(); void supabase.removeChannel(channel); };
  }, [userEmail, loaded]);

  const signIn = async () => {
    if (!supabase) return;
    if (!passwordMeetsPolicy(password)) { Alert.alert('Senha fora do padrão', 'Use pelo menos 8 caracteres, com uma letra maiúscula, uma minúscula e um número. Peça ao administrador para redefinir senhas antigas que não atendam a esse padrão.'); return; }
    setAuthBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setAuthBusy(false);
    if (error) Alert.alert('NÃ£o foi possÃ­vel entrar', error.message);
  };
  const current = records.find(r => r.id === recordId);
  const byDate = records.filter(r => r.date === date && r.branch.trim().toLowerCase() === branch.trim().toLowerCase());
  const completedSteps = current?.activities.filter(a => a.status === 'done' || a.status === 'skipped').length ?? 0;
  const active = current?.activities.find(a => a.status === 'running');
  const updateRecord = (fn: (r: RecordItem) => RecordItem) => { if (!current) return; const next = records.map(r => r.id === current.id ? fn(r) : r); void persist(next); };

  const beginRecord = () => {
    if (!branch.trim()) { Alert.alert('Informe a filial', 'Digite o nome da filial para abrir o registro.'); return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(new Date(`${date}T12:00:00`).getTime())) { Alert.alert('Data invÃ¡lida', 'Informe a data no formato AAAA-MM-DD.'); return; }
    const existing = byDate.find(r => r.status === 'open');
    if (existing) { setRecordId(existing.id); return; }
    const item: RecordItem = { id: `${Date.now()}`, date, branch: branch.trim(), createdAt: Date.now(), status: 'open', activities: newActivities() };
    void persist([item, ...records]); setRecordId(item.id);
  };
  const start = (id: string) => {
    if (!current) return;
    const item = current.activities.find(a => a.id === id);
    if (!item || item.status === 'done' || item.status === 'running') return;
    if (active) { Alert.alert('Etapa em andamento', `Finalize â${active.label}â antes de iniciar outra.`); return; }
    const idx = current.activities.findIndex(a => a.id === id);
    const preceding = current.activities.slice(0, idx).find(a => a.status === 'pending');
    if (preceding) { Alert.alert('Siga a sequÃªncia', `Conclua â${preceding.label}â primeiro.`); return; }
    updateRecord(r => ({ ...r, activities: r.activities.map(a => a.id === id ? { ...a, status: 'running', startedAt: Date.now() } : a) }));
  };
  const finish = (id: string) => updateRecord(r => ({ ...r, activities: r.activities.map(a => a.id === id && a.status === 'running' ? { ...a, status: 'done', endedAt: Date.now(), durationMs: Date.now() - (a.startedAt ?? Date.now()) } : a) }));
  const toggleOptional = (id: string) => updateRecord(r => ({ ...r, activities: r.activities.map(a => a.id === id && (a.status === 'skipped' || a.status === 'pending') ? { ...a, status: a.status === 'skipped' ? 'pending' : 'skipped' } : a) }));
  const closeRecord = () => {
    if (!current) return;
    if (active) { Alert.alert('CronÃ´metro ativo', 'Finalize a etapa em andamento antes de concluir.'); return; }
    if (current.activities.some(a => a.status === 'pending')) { Alert.alert('Etapas pendentes', 'Conclua ou pule as atividades opcionais antes de finalizar.'); return; }
    updateRecord(r => ({ ...r, status: 'done' })); setRecordId(null); Alert.alert('Atendimento concluÃ­do', 'Os tempos foram salvos no histÃ³rico deste aparelho.');
  };
  const titleDate = useMemo(() => dateLabel(date), [date]);
  if (!loaded || !authReady) return <SafeAreaView style={styles.safe}><Text style={styles.loading}>Carregando registrosâ¦</Text></SafeAreaView>;
  if (!isSupabaseConfigured) return <SafeAreaView style={styles.safe}><View style={styles.header}><Text style={styles.brand}>NEVOEIRO</Text></View><View style={styles.loginCard}><Text style={styles.introTitle}>Configure a conexÃ£o</Text><Text style={styles.muted}>Adicione a URL e a chave publicÃ¡vel do projeto Supabase no arquivo .env e reinicie o Expo.</Text></View></SafeAreaView>;
  if (!userEmail) return <SafeAreaView style={styles.safe}><View style={styles.header}><View><Text style={styles.brand}>NEVOEIRO</Text><Text style={styles.headerTitle}>Acesso aos atendimentos</Text></View></View><View style={styles.loginCard}><Text style={styles.introTitle}>Entre para sincronizar</Text><Text style={styles.muted}>Use a conta criada para vocÃª no projeto Supabase.</Text><Text style={[styles.label,{marginTop:18}]}>E-MAIL</Text><TextInput value={email} onChangeText={setEmail} style={styles.input} autoCapitalize="none" keyboardType="email-address" placeholder="seu@email.com"/><Text style={[styles.label,{marginTop:14}]}>SENHA</Text><TextInput value={password} onChangeText={setPassword} style={styles.input} secureTextEntry placeholder="Sua senha"/><Text style={styles.helper}>Minimo 8 caracteres, com maiuscula, minuscula e numero.</Text><Pressable disabled={authBusy} style={[styles.primaryButton,{marginTop:16}]} onPress={() => void signIn()}><Text style={styles.primaryText}>{authBusy ? 'Entrandoâ¦' : 'Entrar'}</Text></Pressable><Text style={[styles.helper,{marginTop:12}]}>O administrador cria e gerencia os acessos pelo painel do Supabase.</Text></View></SafeAreaView>;

  return <SafeAreaView style={styles.safe} edges={['top']}>
    <View style={styles.header}><View><Text style={styles.brand}>NEVOEIRO</Text><Text style={styles.headerTitle}>Acompanhamento de atendimento</Text><Text style={styles.headerSub}>{userEmail}</Text></View><View style={{alignItems:'flex-end',gap:5}}><View style={[styles.liveDot,{backgroundColor:syncError?'#f2c230':'#60d394'}]}/><Pressable onPress={() => { void supabase?.auth.signOut(); }}><Text style={styles.signOut}>Sair</Text></Pressable></View></View>
    {syncError && <View style={styles.syncBanner}><Text style={styles.syncText}>Sem sincronizaÃ§Ã£o no momento. Os registros permanecem salvos neste aparelho.</Text></View>}
    <View style={styles.tabs}><Pressable onPress={() => setTab('registro')} style={[styles.tab, tab === 'registro' && styles.tabActive]}><Text style={[styles.tabText, tab === 'registro' && styles.tabTextActive]}>Novo registro</Text></Pressable><Pressable onPress={() => setTab('historico')} style={[styles.tab, tab === 'historico' && styles.tabActive]}><Text style={[styles.tabText, tab === 'historico' && styles.tabTextActive]}>HistÃ³rico</Text></Pressable></View>
    {tab === 'registro' ? <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={styles.intro}><Text style={styles.eyebrow}>REGISTRO POR FILIAL E DATA</Text><Text style={styles.introTitle}>Acompanhe cada etapa</Text><Text style={styles.muted}>Inicie o cronÃ´metro quando a atividade comeÃ§ar e finalize ao passar para a prÃ³xima.</Text></View>
      <View style={styles.card}><Text style={styles.label}>FILIAL</Text><TextInput value={branch} onChangeText={setBranch} placeholder="Ex.: Posto Centro" style={styles.input} editable={!current} /><Text style={[styles.label, { marginTop: 14 }]}>DATA DO REGISTRO (AAAA-MM-DD)</Text><TextInput value={date} onChangeText={setDate} placeholder="2026-11-09" style={styles.input} editable={!current} keyboardType="numbers-and-punctuation" /><Text style={styles.helper}>Registro selecionado: {titleDate}</Text></View>
      {!current ? <Pressable style={styles.primaryButton} onPress={beginRecord}><Text style={styles.primaryText}>{byDate.length ? 'Iniciar outro atendimento' : 'Abrir registro do dia'}</Text></Pressable> : <>
        <View style={styles.recordHeader}><View><Text style={styles.recordBranch}>{current.branch}</Text><Text style={styles.muted}>{dateLabel(current.date)} Â· Atendimento em andamento</Text></View><Text style={styles.count}>{completedSteps}/{current.activities.length}</Text></View>
        <View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${completedSteps/current.activities.length*100}%` }]}/></View>
        {current.activities.map((a, i) => {
          const optional = templates.find(t => t.id === a.id)?.optional;
          const elapsed = a.status === 'running' ? now - (a.startedAt ?? now) : a.durationMs ?? 0;
          const prevPending = current.activities.slice(0, i).some(x => x.status === 'pending');
          const disabled = !!active && a.status !== 'running' || prevPending || a.status === 'done';
          return <View key={a.id} style={[styles.activity, a.status === 'running' && styles.activityRunning, a.status === 'done' && styles.activityDone, a.status === 'skipped' && styles.activitySkipped]}>
            <View style={styles.activityTop}><View style={[styles.stepNumber, a.status === 'done' && styles.stepDone, a.status === 'running' && styles.stepRunning]}><Text style={styles.stepNumberText}>{a.status === 'done' ? 'â' : String(i+1).padStart(2,'0')}</Text></View><View style={styles.activityMain}><Text style={styles.activityTitle}>{a.label}</Text><Text style={styles.activityHint}>{a.status === 'running' ? 'CronÃ´metro em andamento' : a.status === 'done' ? `ConcluÃ­da Â· ${new Date(a.startedAt!).toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit' })}â${new Date(a.endedAt!).toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit' })}` : a.status === 'skipped' ? 'Atividade opcional nÃ£o realizada' : optional ? 'Opcional' : 'Aguardando inÃ­cio'}</Text></View><Text style={[styles.timer, a.status === 'running' && styles.timerLive]}>{a.status === 'skipped' ? 'â' : duration(elapsed)}</Text></View>
            {a.status === 'running' ? <Pressable style={styles.stopButton} onPress={() => finish(a.id)}><Text style={styles.stopText}>â   Finalizar etapa</Text></Pressable> : a.status === 'done' || a.status === 'skipped' ? null : <View style={styles.actionRow}><Pressable disabled={disabled} style={[styles.startButton, disabled && styles.disabledButton]} onPress={() => start(a.id)}><Text style={styles.primaryText}>â¶  Iniciar cronÃ´metro</Text></Pressable>{optional && <Pressable style={styles.skipButton} onPress={() => toggleOptional(a.id)}><Text style={styles.skipText}>Pular</Text></Pressable>}</View>}
          </View>;
        })}
        <Pressable style={styles.finishRecord} onPress={closeRecord}><Text style={styles.finishRecordText}>Concluir atendimento</Text></Pressable><Pressable style={styles.cancelLink} onPress={() => setRecordId(null)}><Text style={styles.cancelText}>Voltar para seleÃ§Ã£o de data</Text></Pressable>
      </>}
      {!current && byDate.length > 0 && <Text style={styles.helper}>{byDate.length} registro(s) jÃ¡ existe(m) nesta filial e data.</Text>}
    </ScrollView> : <FlatList data={records} keyExtractor={r => r.id} contentContainerStyle={styles.content} ListEmptyComponent={<View style={styles.empty}><Text style={styles.emptyTitle}>Ainda nÃ£o hÃ¡ registros</Text><Text style={styles.muted}>Os atendimentos concluÃ­dos aparecerÃ£o aqui.</Text></View>} renderItem={({ item }) => <View style={styles.historyCard}><View style={styles.recordHeader}><View style={{ flex: 1 }}><Text style={styles.recordBranch}>{item.branch}</Text><Text style={styles.muted}>{dateLabel(item.date)} Â· {item.status === 'done' ? 'ConcluÃ­do' : 'Em andamento'}</Text></View><Pressable onPress={() => { if (item.status === 'open') { setBranch(item.branch); setDate(item.date); setRecordId(item.id); setTab('registro'); } }}><Text style={styles.historyAction}>{item.status === 'open' ? 'Continuar' : 'Concluído'}</Text></Pressable></View><View style={styles.historyTimes}>{item.activities.filter(a => a.status === 'done').map(a => <Text key={a.id} style={styles.historyTime}>{a.label}: <Text style={styles.historyDuration}>{duration(a.durationMs)}</Text></Text>)}</View></View>} />}
    <Text style={styles.footer}>Os dados ficam salvos neste aparelho.</Text>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  headerSub:{color:'#b9c8d8',fontSize:10,marginTop:3},signOut:{color:'#dce7f2',fontSize:10,fontWeight:'700'},syncBanner:{backgroundColor:'#fff6d9',padding:9,paddingHorizontal:16},syncText:{fontSize:11,color:'#795600'},loginCard:{margin:18,backgroundColor:'#fff',padding:18,borderWidth:1,borderColor:'#dbe3ec',borderRadius:14},
  safe:{flex:1,backgroundColor:'#f3f6fa'},loading:{margin:30,color:NAVY},header:{backgroundColor:NAVY,paddingHorizontal:20,paddingVertical:16,flexDirection:'row',justifyContent:'space-between',alignItems:'center'},brand:{color:'#f2c230',fontWeight:'900',fontSize:12,letterSpacing:1.5},headerTitle:{color:'#fff',fontWeight:'750',fontSize:17,marginTop:4},liveDot:{width:10,height:10,borderRadius:5,backgroundColor:'#60d394'},tabs:{flexDirection:'row',backgroundColor:'#fff',paddingHorizontal:14,borderBottomWidth:1,borderBottomColor:'#dbe3ec'},tab:{paddingVertical:13,paddingHorizontal:12,borderBottomWidth:2,borderBottomColor:'transparent'},tabActive:{borderBottomColor:BLUE},tabText:{color:'#64748b',fontWeight:'650'},tabTextActive:{color:BLUE},content:{padding:16,paddingBottom:24,gap:12},intro:{marginBottom:3},eyebrow:{fontSize:10,fontWeight:'800',letterSpacing:1.2,color:BLUE},introTitle:{fontSize:23,fontWeight:'800',color:NAVY,marginTop:4,marginBottom:4},muted:{color:'#64748b',fontSize:12,lineHeight:18},card:{backgroundColor:'#fff',borderColor:'#dbe3ec',borderWidth:1,borderRadius:14,padding:15},label:{fontSize:10,fontWeight:'800',color:'#42536a',letterSpacing:.4},input:{borderWidth:1,borderColor:'#cfd9e4',borderRadius:9,paddingHorizontal:12,paddingVertical:11,marginTop:6,backgroundColor:'#fff',fontSize:15,color:'#172536'},helper:{fontSize:11,color:'#64748b',marginTop:8},primaryButton:{backgroundColor:BLUE,borderRadius:11,padding:14,alignItems:'center'},primaryText:{color:'#fff',fontWeight:'750',fontSize:13},recordHeader:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',marginTop:4},recordBranch:{fontSize:17,fontWeight:'800',color:NAVY},count:{fontSize:14,fontWeight:'800',color:BLUE},progressTrack:{height:6,borderRadius:9,backgroundColor:'#e2eaf1',overflow:'hidden',marginBottom:5},progressFill:{height:'100%',backgroundColor:GREEN},activity:{backgroundColor:'#fff',borderRadius:13,borderWidth:1,borderColor:'#dbe3ec',padding:13,gap:11},activityRunning:{borderColor:BLUE,backgroundColor:'#f8fbff'},activityDone:{borderColor:'#b7dfc3'},activitySkipped:{backgroundColor:'#f8fafc'},activityTop:{flexDirection:'row',alignItems:'center',gap:10},stepNumber:{width:31,height:31,borderRadius:10,backgroundColor:'#eaf3fb',alignItems:'center',justifyContent:'center'},stepDone:{backgroundColor:'#e5f6ec'},stepRunning:{backgroundColor:'#dceeff'},stepNumberText:{fontSize:11,fontWeight:'800',color:NAVY},activityMain:{flex:1},activityTitle:{fontSize:13,fontWeight:'750',color:'#172536'},activityHint:{fontSize:10,color:'#64748b',marginTop:3},timer:{fontVariant:['tabular-nums'],fontSize:16,fontWeight:'800',color:NAVY},timerLive:{color:BLUE},actionRow:{flexDirection:'row',gap:8},startButton:{flex:1,backgroundColor:BLUE,borderRadius:9,padding:10,alignItems:'center'},disabledButton:{backgroundColor:'#9aabba'},skipButton:{paddingHorizontal:14,alignItems:'center',justifyContent:'center',borderWidth:1,borderColor:'#dbe3ec',borderRadius:9},skipText:{fontSize:12,color:'#64748b',fontWeight:'700'},stopButton:{backgroundColor:'#fff0f0',borderRadius:9,padding:10,alignItems:'center'},stopText:{fontSize:13,color:'#c92b35',fontWeight:'800'},finishRecord:{backgroundColor:NAVY,borderRadius:11,padding:14,alignItems:'center',marginTop:4},finishRecordText:{color:'#fff',fontWeight:'800'},cancelLink:{alignItems:'center',padding:8},cancelText:{fontSize:12,color:BLUE,fontWeight:'700'},footer:{textAlign:'center',fontSize:10,color:'#8492a3',paddingBottom:8},empty:{alignItems:'center',padding:28,gap:7},emptyTitle:{fontSize:16,fontWeight:'800',color:NAVY},historyCard:{backgroundColor:'#fff',borderWidth:1,borderColor:'#dbe3ec',borderRadius:13,padding:14,gap:10},historyAction:{fontWeight:'750',fontSize:12,color:BLUE},historyTimes:{borderTopWidth:1,borderTopColor:'#edf1f5',paddingTop:8,gap:4},historyTime:{fontSize:11,color:'#64748b'},historyDuration:{fontWeight:'800',color:NAVY}
});
