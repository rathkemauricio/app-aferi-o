import { useRouter } from 'expo-router';
import { useContext, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { isSupabaseConfigured } from '../../lib/supabase';
import {
  ArrowLeftIcon, CalendarBlankIcon, CalendarDotsIcon, CaretRightIcon, CheckIcon, CloudCheckIcon, CloudSlashIcon, DeviceMobileIcon, GoogleLogoIcon,
  MagnifyingGlassIcon, PlusIcon, ResetIcon, StorefrontIcon, TrashIcon, XIcon,
} from '../../ui/icons';
import { Button, Card, ChoiceChips, confirmAction, EmptyState, Field, IconButton, MarcaModulo, notify, SectionHeader, Sheet, StatusPill } from '../../ui/kit';
import { createTypography, pageMaxWidth, radius, space, ThemeContext, type ThemeColors } from '../../ui/theme';
import { BotaoVoltar } from '../../ui/voltar';
import {
  dataDe, dataValida, diaLongo, type Evento, excluirEvento, hojeIso, horaValida, horario, isoDe, MESES, ocorreEm, salvarEvento, SEMANA, uid, useAgenda, useGoogleAgenda,
} from './store';
import { FiltroFilial, RealizadoNoDia, useRealizados } from './Realizados';

const dataHora = (iso: string | null) => (iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '');

export default function AgendaModule() {
  const router = useRouter();
  const { colors } = useContext(ThemeContext);
  const t = useMemo(() => createTypography(colors), [colors]);
  const s = useMemo(() => estilos(colors), [colors]);
  const { eventos, filiais, loaded, status } = useAgenda();
  const g = useGoogleAgenda();
  const [dia, setDia] = useState(hojeIso());
  const [mes, setMes] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const [editando, setEditando] = useState<Evento | null>(null);
  const [busca, setBusca] = useState('');
  /** Filial do "Realizado neste dia" ('' = todas). */
  const [filialRealizado, setFilialRealizado] = useState('');
  const realizados = useRealizados(filiais, filialRealizado);

  const voltar = () => { if (router.canGoBack()) router.back(); else router.replace('/'); };
  const nomeFilial = (id: string | null) => { const f = id ? filiais.find(x => x.id === id) : undefined; return f ? `${f.codigo} · ${f.nome}` : ''; };

  // Grade do mês (semanas de domingo a sábado).
  const celulas = useMemo(() => {
    const ini = new Date(mes); ini.setDate(1 - ini.getDay());
    return Array.from({ length: 42 }, (_, i) => { const d = new Date(ini); d.setDate(ini.getDate() + i); return isoDe(d); });
  }, [mes]);
  const comEvento = useMemo(() => new Set(celulas.filter(c => eventos.some(e => ocorreEm(e, c)))), [celulas, eventos]);
  const q = busca.trim().toLowerCase();
  const doDia = q
    ? eventos.filter(e => `${e.titulo} ${e.local} ${e.descricao} ${nomeFilial(e.filial_id)}`.toLowerCase().includes(q))
    : eventos.filter(e => ocorreEm(e, dia));
  const proximos = eventos.filter(e => (e.data_fim ?? e.data) >= hojeIso() && !ocorreEm(e, dia)).slice(0, 5);

  const novo = () => setEditando({ id: uid(), titulo: '', descricao: '', local: '', data: dia, data_fim: null, hora_inicio: '08:00', hora_fim: '09:00', filial_id: null, origem: 'app', google_id: null, google_pendente: true });
  const irMes = (n: number) => setMes(m => new Date(m.getFullYear(), m.getMonth() + n, 1));
  const irHoje = () => { const h = new Date(); setMes(new Date(h.getFullYear(), h.getMonth(), 1)); setDia(hojeIso()); };

  const syncPill = !isSupabaseConfigured
    ? <StatusPill icon={DeviceMobileIcon} label="Neste aparelho" />
    : status === 'error' ? <StatusPill icon={CloudSlashIcon} label="Sem sincronizar" tone="warning" /> : <StatusPill icon={CloudCheckIcon} label="Sincronizado" tone="success" />;

  const cartaoGoogle = isSupabaseConfigured ? (
    <Card>
      <View style={s.row}>
        <View style={[s.gTile, { backgroundColor: g.conectado ? colors.successSoft : colors.surfaceMuted }]}><GoogleLogoIcon size={20} color={g.conectado ? colors.success : colors.textMuted} weight="bold" /></View>
        <View style={s.flex}>
          <Text style={t.bodyStrong}>Google Agenda</Text>
          <Text style={t.caption} numberOfLines={2}>
            {!g.status ? 'Verificando a conexão…'
              : !g.status.configurado ? 'Integração ainda não configurada no servidor (peça ao administrador).'
              : g.conectado ? `${g.status.email ?? 'Conta conectada'}${g.status.sincronizado_em ? ` · sincronizado ${dataHora(g.status.sincronizado_em)}` : ''}`
              : 'Conecte sua conta para ver e editar os eventos do Google aqui, e mandar os daqui para lá.'}
          </Text>
        </View>
      </View>
      {g.erro ? <Text style={[t.caption, { color: colors.danger }]}>{g.erro}</Text> : null}
      {g.status?.configurado ? (
        g.conectado ? (
          <View style={s.twoCol}>
            <Button title={g.ocupado ? 'Sincronizando…' : 'Sincronizar agora'} icon={ResetIcon} variant="secondary" size="sm" style={s.flex} disabled={g.ocupado} onPress={() => void g.sincronizar()} />
            <Button title="Desconectar" icon={XIcon} variant="ghost" size="sm" onPress={() => confirmAction('Desconectar do Google?', 'Os eventos continuam no app, mas deixam de sincronizar com o Google Agenda.', 'Desconectar', () => { void g.desconectar().catch(e => notify('Não foi possível desconectar', e instanceof Error ? e.message : '')); })} />
          </View>
        ) : <Button title="Conectar Google Agenda" icon={GoogleLogoIcon} onPress={() => { void g.conectar().catch(e => notify('Não foi possível conectar', e instanceof Error ? e.message : '')); }} />
      ) : null}
    </Card>
  ) : null;

  const linhaEvento = (e: Evento) => (
    <Pressable key={e.id} accessibilityRole="button" onPress={() => setEditando(e)} style={({ pressed }) => [s.evento, pressed && { opacity: 0.75 }]}>
      <View style={[s.barra, { backgroundColor: e.origem === 'google' ? '#1a73e8' : colors.accent }]} />
      <View style={s.flex}>
        <Text style={t.bodyStrong} numberOfLines={1}>{e.titulo || '(sem título)'}</Text>
        <Text style={t.caption} numberOfLines={1}>
          {q || !ocorreEm(e, dia) ? `${dataDe(e.data).toLocaleDateString('pt-BR')} · ` : ''}{horario(e)}{e.local ? ` · ${e.local}` : ''}{e.filial_id ? ` · ${nomeFilial(e.filial_id)}` : ''}
        </Text>
      </View>
      {g.conectado ? (e.google_pendente ? <StatusPill label="Enviando" tone="accent" /> : e.google_id ? <GoogleLogoIcon size={14} color={colors.textFaint} /> : null) : null}
      <CaretRightIcon size={14} color={colors.textFaint} />
    </Pressable>
  );

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <View style={s.header}>
        <BotaoVoltar label="Voltar aos módulos" onPress={voltar} />
        <MarcaModulo icon={CalendarDotsIcon} />
        <View style={s.flex}>
          <Text style={s.brandName}>Agenda</Text>
          <Text style={t.caption}>Integrada ao Google Agenda</Text>
        </View>
        {syncPill}
      </View>
      {!loaded ? <View style={s.flex} /> : (
        <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
          {cartaoGoogle}
          <Card>
            <View style={s.row}>
              <IconButton icon={ArrowLeftIcon} label="Mês anterior" onPress={() => irMes(-1)} />
              <Text style={[t.section, s.flex, { textAlign: 'center', textTransform: 'capitalize' }]}>{MESES[mes.getMonth()]} {mes.getFullYear()}</Text>
              <View style={{ transform: [{ scaleX: -1 }] }}><IconButton icon={ArrowLeftIcon} label="Próximo mês" onPress={() => irMes(1)} /></View>
            </View>
            <View style={s.grade}>
              {SEMANA.map((d, i) => <Text key={i} style={[t.caption, s.cel, { fontWeight: '700' }]}>{d}</Text>)}
              {celulas.map(c => {
                const sel = c === dia && !q, hoje = c === hojeIso(), fora = dataDe(c).getMonth() !== mes.getMonth();
                return (
                  <Pressable key={c} accessibilityRole="button" accessibilityLabel={diaLongo(c)} accessibilityState={{ selected: sel }} onPress={() => { setDia(c); setBusca(''); }} style={s.cel}>
                    <View style={[s.diaBola, sel && { backgroundColor: colors.accent }, !sel && hoje && { borderWidth: 1.5, borderColor: colors.accent }]}>
                      <Text style={[t.body, { fontVariant: ['tabular-nums'] }, fora && { color: colors.textFaint }, sel && { color: colors.primaryText ?? '#fff', fontWeight: '800' }]}>{dataDe(c).getDate()}</Text>
                    </View>
                    <View style={{ flexDirection: 'row', gap: 2 }}>
                      <View style={[s.ponto, { backgroundColor: comEvento.has(c) ? (sel ? colors.accent : colors.textMuted) : 'transparent' }]} />
                      {realizados.porDia.has(c) ? <View style={[s.ponto, { backgroundColor: colors.success }]} /> : null}
                    </View>
                  </Pressable>
                );
              })}
            </View>
            <Button title="Hoje" icon={CalendarBlankIcon} variant="ghost" size="sm" style={{ alignSelf: 'flex-start' }} onPress={irHoje} />
          </Card>
          <Field icon={MagnifyingGlassIcon} value={busca} onChangeText={setBusca} placeholder="Buscar evento, local ou filial" />
          <View style={s.row}>
            <Text style={[t.sectionBg, s.flex]}>{q ? `Resultados (${doDia.length})` : diaLongo(dia)}</Text>
            <Button title="Novo evento" icon={PlusIcon} size="sm" onPress={novo} />
          </View>
          {doDia.length ? <Card style={s.lista}>{doDia.map(linhaEvento)}</Card>
            : <EmptyState icon={CalendarBlankIcon} title={q ? 'Nenhum evento encontrado' : 'Nada marcado neste dia'} text={q ? 'Confira o que foi digitado.' : 'Toque em "Novo evento" para marcar uma visita, auditoria ou reunião.'} />}
          {!q && realizados.algum ? <>
            <SectionHeader title={`Realizado neste dia (${(realizados.porDia.get(dia) ?? []).length})`} />
            <FiltroFilial filiais={filiais} valor={filialRealizado} onChange={setFilialRealizado} />
            <Text style={t.caption}>Inventários encerrados, medições de tanques, aferições e auditorias concluídos neste dia. Toque para abrir o relatório em PDF. Os dias com atividade concluída têm um ponto verde no calendário.</Text>
            <RealizadoNoDia itens={realizados.porDia.get(dia) ?? []} nome={realizados.nome} mostrarFilial={!filialRealizado} />
          </> : null}
          {!q && proximos.length ? <>
            <SectionHeader title="Próximos" />
            <Card style={s.lista}>{proximos.map(linhaEvento)}</Card>
          </> : null}
        </ScrollView>
      )}
      {editando && <EventoForm evento={editando} filiais={filiais} onClose={() => setEditando(null)}
        onSalvar={ev => { salvarEvento(ev); setEditando(null); setDia(ev.data); g.agendarEnvio(); }}
        onExcluir={ev => confirmAction('Excluir evento?', g.conectado && ev.google_id ? 'O evento também será removido do Google Agenda.' : 'O evento será removido da agenda.', 'Excluir', () => { excluirEvento(ev); setEditando(null); g.agendarEnvio(); })} />}
    </SafeAreaView>
  );
}

function EventoForm({ evento, filiais, onClose, onSalvar, onExcluir }: {
  evento: Evento; filiais: ReturnType<typeof useAgenda>['filiais']; onClose: () => void; onSalvar: (e: Evento) => void; onExcluir: (e: Evento) => void;
}) {
  const { colors } = useContext(ThemeContext);
  const t = useMemo(() => createTypography(colors), [colors]);
  const s = useMemo(() => estilos(colors), [colors]);
  const [e, setE] = useState<Evento>(evento);
  const [buscaFilial, setBuscaFilial] = useState('');
  const existe = !!evento.updated_at || !!evento.google_id;
  const diaInteiro = !e.hora_inicio;
  const set = (p: Partial<Evento>) => setE(x => ({ ...x, ...p }));
  const filtradas = filiais.filter(f => `${f.codigo} ${f.nome} ${f.cidade}`.toLowerCase().includes(buscaFilial.toLowerCase())).slice(0, 8);

  const salvar = () => {
    if (!e.titulo.trim()) { notify('Informe o título', 'Ex.: Visita à filial, Auditoria, Reunião.'); return; }
    if (!dataValida(e.data)) { notify('Data inválida', 'Use o formato AAAA-MM-DD.'); return; }
    if (e.data_fim && (!dataValida(e.data_fim) || e.data_fim < e.data)) { notify('Data final inválida', 'A data final deve ser igual ou posterior à inicial.'); return; }
    if (!diaInteiro && (!horaValida(e.hora_inicio ?? '') || (e.hora_fim && !horaValida(e.hora_fim)))) { notify('Horário inválido', 'Use o formato HH:MM, por exemplo 08:30.'); return; }
    onSalvar({ ...e, titulo: e.titulo.trim(), data_fim: e.data_fim && e.data_fim > e.data ? e.data_fim : null, hora_fim: diaInteiro ? null : e.hora_fim || null });
  };

  return (
    <Sheet title={existe ? 'Editar evento' : 'Novo evento'} onClose={onClose}
      footer={<View style={s.twoCol}>
        {existe ? <IconButton icon={TrashIcon} tone="danger" label="Excluir evento" onPress={() => onExcluir(e)} /> : null}
        <Button title="Cancelar" variant="secondary" style={s.flex} onPress={onClose} />
        <Button title="Salvar" icon={CheckIcon} style={s.flex} onPress={salvar} />
      </View>}>
      <Field label="Título" value={e.titulo} onChangeText={v => set({ titulo: v })} placeholder="Visita à filial, auditoria, reunião…" />
      <View style={s.twoCol}>
        <Field label="Data" helper="AAAA-MM-DD" icon={CalendarBlankIcon} style={s.flex} value={e.data} onChangeText={v => set({ data: v })} />
        <Field label="Até (opcional)" helper="Vários dias" style={s.flex} value={e.data_fim ?? ''} onChangeText={v => set({ data_fim: v || null })} placeholder="AAAA-MM-DD" />
      </View>
      <ChoiceChips value={diaInteiro ? 'Dia inteiro' : 'Com horário'} options={['Com horário', 'Dia inteiro']} onChange={v => set(v === 'Dia inteiro' ? { hora_inicio: null, hora_fim: null } : { hora_inicio: '08:00', hora_fim: '09:00' })} />
      {!diaInteiro && <View style={s.twoCol}>
        <Field label="Início" style={s.flex} value={e.hora_inicio ?? ''} onChangeText={v => set({ hora_inicio: v })} placeholder="08:00" keyboardType="numbers-and-punctuation" maxLength={5} />
        <Field label="Fim" style={s.flex} value={e.hora_fim ?? ''} onChangeText={v => set({ hora_fim: v })} placeholder="09:00" keyboardType="numbers-and-punctuation" maxLength={5} />
      </View>}
      <Field label="Local" value={e.local} onChangeText={v => set({ local: v })} placeholder="Endereço ou sala" />
      <Text style={t.label}>Filial (opcional)</Text>
      {e.filial_id ? (
        <View style={s.row}>
          <StorefrontIcon size={18} color={colors.accentText} />
          <Text style={[t.bodyStrong, s.flex]} numberOfLines={1}>{(() => { const f = filiais.find(x => x.id === e.filial_id); return f ? `${f.codigo} · ${f.nome}` : 'Filial removida'; })()}</Text>
          <IconButton icon={XIcon} label="Tirar filial" onPress={() => set({ filial_id: null })} />
        </View>
      ) : <>
        <Field icon={MagnifyingGlassIcon} value={buscaFilial} onChangeText={setBuscaFilial} placeholder="Código, nome ou cidade" />
        {buscaFilial.trim() ? <View style={s.listBox}>
          {filtradas.map((f, i) => (
            <Pressable key={f.id} accessibilityRole="button" onPress={() => { set({ filial_id: f.id, local: e.local || [f.nome, f.cidade].filter(Boolean).join(', ') }); setBuscaFilial(''); }} style={[s.opcao, i > 0 && s.divided]}>
              <StorefrontIcon size={16} color={colors.textMuted} />
              <Text style={[t.body, s.flex]} numberOfLines={1}>{f.codigo} · {f.nome}{f.cidade ? ` · ${f.cidade}` : ''}</Text>
            </Pressable>
          ))}
          {!filtradas.length && <Text style={[t.caption, { padding: 12 }]}>Nenhuma filial encontrada.</Text>}
        </View> : null}
      </>}
      <Field label="Descrição" value={e.descricao} onChangeText={v => set({ descricao: v })} multiline style={{ minHeight: 72 }} placeholder="Pauta, observações…" />
      {e.origem === 'google' ? <Text style={t.caption}>Evento criado no Google Agenda. As alterações feitas aqui voltam para lá.</Text> : null}
    </Sheet>
  );
}

const estilos = (c: ThemeColors) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: c.bg },
  flex: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  twoCol: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  header: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.lg, paddingVertical: space.md, backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border },
  brandName: { fontSize: 15.5, fontWeight: '800', color: c.text },
  content: { padding: space.lg, paddingBottom: space.xxl * 2, gap: space.md, width: '100%', maxWidth: pageMaxWidth(760), alignSelf: 'center' },
  gTile: { width: 40, height: 40, borderRadius: radius.tile, alignItems: 'center', justifyContent: 'center' },
  grade: { flexDirection: 'row', flexWrap: 'wrap' },
  cel: { width: `${100 / 7}%`, alignItems: 'center', paddingVertical: 2, textAlign: 'center' },
  diaBola: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  ponto: { width: 5, height: 5, borderRadius: 3, marginTop: 1 },
  lista: { padding: 0, gap: 0, overflow: 'hidden' },
  evento: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: 12, paddingRight: space.md, borderBottomWidth: 1, borderBottomColor: c.border },
  barra: { width: 4, alignSelf: 'stretch', borderRadius: 2, marginLeft: 6 },
  listBox: { borderWidth: 1, borderColor: c.border, borderRadius: radius.control, overflow: 'hidden' },
  opcao: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: 12, minHeight: 44 },
  divided: { borderTopWidth: 1, borderTopColor: c.border },
});
