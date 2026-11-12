import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Print from 'expo-print';
import { useRouter } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { memo, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Image, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../lib/auth';
import type { Filial } from '../../lib/data';
import { emailValido, enviarEmail, separarEmails } from '../../lib/email';
import { isSupabaseConfigured } from '../../lib/supabase';
import {
  ArrowLeftIcon, CalendarBlankIcon, CameraIcon, CheckIcon, ClipboardTextIcon, CloudCheckIcon, CloudSlashIcon, DeviceMobileIcon, EnvelopeIcon, FilePdfIcon,
  ImagesIcon, MagnifyingGlassIcon, PlusIcon, ResetIcon, SealCheckIcon, StorefrontIcon, TrashIcon, XIcon,
} from '../../ui/icons';
import { Button, Card, ChoiceChips, confirmAction, EmptyState, Field, IconButton, notify, SectionHeader, Sheet, StatusPill, type Tone } from '../../ui/kit';
import { createTypography, pageMaxWidth, radius, space, ThemeContext, type ThemeColors } from '../../ui/theme';
import {
  type Auditoria, contar, dataBR, dataValida, ESCOPO_PADRAO, hoje, type ItemAuditoria, novosItens, PEDE_ACAO, relatorioHtml, ROTULO, ROTULO_CURTO, STATUS,
  type StatusReq, uid,
} from './model';
import { apagarFoto, auditoriasCol, enviarFoto, escolherFotos, linksDasFotos, useAuditorias, useLinksFotos } from './store';

const SESSAO = 'nevoeiro.auditoria.sessao.v1';
const TOM: Record<StatusReq, Tone> = { C: 'success', OB: 'neutral', OM: 'warning', NC: 'danger', PP: 'accent', NA: 'neutral' };
type Filtro = 'todos' | 'pendentes' | StatusReq;

const nomeFilial = (filiais: Filial[], id: string) => { const f = filiais.find(x => x.id === id); return f ? `${f.codigo} · ${f.nome}` : 'Filial removida'; };

export default function AuditoriaModule() {
  const router = useRouter();
  const { colors } = useContext(ThemeContext);
  const t = useMemo(() => createTypography(colors), [colors]);
  const s = useMemo(() => estilos(colors), [colors]);
  const { filiais, auditorias, loaded, status } = useAuditorias();
  const [abertaId, setAbertaId] = useState<string | null>(null);
  const [sessaoPronta, setSessaoPronta] = useState(false);

  // Reabre na auditoria em que o usuário estava.
  useEffect(() => {
    void AsyncStorage.getItem(SESSAO).then(v => { if (v) setAbertaId(v); }).catch(() => undefined).finally(() => setSessaoPronta(true));
    void auditoriasCol.sync();
  }, []);
  useEffect(() => { if (sessaoPronta) void AsyncStorage.setItem(SESSAO, abertaId ?? '').catch(() => undefined); }, [abertaId, sessaoPronta]);

  const aberta = abertaId ? auditorias.find(a => a.id === abertaId) ?? null : null;
  const voltar = () => { if (router.canGoBack()) router.back(); else router.replace('/'); };
  const syncPill = !isSupabaseConfigured
    ? <StatusPill icon={DeviceMobileIcon} label="Neste aparelho" />
    : status === 'error' ? <StatusPill icon={CloudSlashIcon} label="Sem sincronizar" tone="warning" /> : <StatusPill icon={CloudCheckIcon} label="Sincronizado" tone="success" />;

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <View style={s.header}>
        <IconButton icon={ArrowLeftIcon} label="Voltar aos módulos" onPress={voltar} />
        <View style={s.brandMark}><ClipboardTextIcon size={18} color="#fff" weight="bold" /></View>
        <View style={s.flex}>
          <Text style={s.brandName}>Auditoria</Text>
          <Text style={t.caption}>Sistema de Gestão Integrada</Text>
        </View>
        {syncPill}
      </View>
      {!loaded || !sessaoPronta ? <View style={s.flex} />
        : aberta ? <AuditoriaTela key={aberta.id} auditoria={aberta} filiais={filiais} onVoltar={() => setAbertaId(null)} />
        : <ListaAuditorias auditorias={auditorias} filiais={filiais} onAbrir={setAbertaId} />}
    </SafeAreaView>
  );
}

/* =====================================================================
   Lista de auditorias
   ===================================================================== */
function ListaAuditorias({ auditorias, filiais, onAbrir }: { auditorias: Auditoria[]; filiais: Filial[]; onAbrir: (id: string) => void }) {
  const { colors } = useContext(ThemeContext);
  const t = useMemo(() => createTypography(colors), [colors]);
  const s = useMemo(() => estilos(colors), [colors]);
  const { nome } = useAuth();
  const router = useRouter();
  const [busca, setBusca] = useState('');
  const [nova, setNova] = useState(false);
  const lista = auditorias.filter(a => `${nomeFilial(filiais, a.filial_id)} ${a.auditores} ${dataBR(a.data)}`.toLowerCase().includes(busca.toLowerCase()));

  return (
    <>
      <FlatList
        data={lista}
        keyExtractor={a => a.id}
        contentContainerStyle={s.content}
        keyboardShouldPersistTaps="handled"
        ItemSeparatorComponent={() => <View style={{ height: space.sm }} />}
        ListHeaderComponent={<View style={s.stack}>
          <View style={s.pageHead}>
            <View style={s.flex}>
              <Text style={t.title}>Auditorias</Text>
              <Text style={t.caption}>Checklist de requisitos com evidências e planos de ação</Text>
            </View>
            <Button title="Nova auditoria" icon={PlusIcon} size="sm" onPress={() => (filiais.length ? setNova(true) : router.push('/filiais'))} />
          </View>
          <Field icon={MagnifyingGlassIcon} value={busca} onChangeText={setBusca} placeholder="Filial, auditor ou data" />
          <View style={{ height: space.xs }} />
        </View>}
        ListEmptyComponent={auditorias.length
          ? <EmptyState icon={MagnifyingGlassIcon} title="Nenhuma auditoria encontrada" text="Confira o que foi digitado na busca." />
          : filiais.length
            ? <EmptyState icon={ClipboardTextIcon} title="Nenhuma auditoria ainda" text="Comece uma auditoria escolhendo a filial. O checklist já vem com os requisitos." action={{ label: 'Nova auditoria', icon: PlusIcon, onPress: () => setNova(true) }} />
            : <EmptyState icon={StorefrontIcon} title="Nenhuma filial cadastrada" text="As auditorias pertencem a uma filial do cadastro único." action={{ label: 'Abrir cadastro de filiais', onPress: () => router.push('/filiais') }} />}
        renderItem={({ item: a }) => {
          const c = contar(a.itens);
          return (
            <Pressable accessibilityRole="button" onPress={() => onAbrir(a.id)} style={({ pressed }) => [pressed && { opacity: 0.75 }]}>
              <Card>
                <View style={s.row}>
                  <View style={s.flex}>
                    <Text style={t.bodyStrong} numberOfLines={1}>{nomeFilial(filiais, a.filial_id)}</Text>
                    <Text style={t.caption} numberOfLines={1}>{dataBR(a.data)}{a.auditores ? ` · ${a.auditores}` : ''}</Text>
                  </View>
                  <StatusPill label={a.status === 'concluida' ? 'Concluída' : 'Rascunho'} tone={a.status === 'concluida' ? 'success' : 'accent'} icon={a.status === 'concluida' ? SealCheckIcon : undefined} />
                </View>
                <View style={s.pills}>
                  {c.NC ? <StatusPill label={`${c.NC} NC`} tone="danger" /> : null}
                  {c.OM ? <StatusPill label={`${c.OM} melhoria(s)`} tone="warning" /> : null}
                  {c.OB ? <StatusPill label={`${c.OB} observação(ões)`} /> : null}
                  {c.pendentes ? <StatusPill label={`${c.pendentes} pendente(s)`} tone="accent" /> : <StatusPill label="Todos avaliados" tone="success" />}
                </View>
              </Card>
            </Pressable>
          );
        }}
      />
      {nova && <NovaAuditoria filiais={filiais} nomePadrao={nome} onClose={() => setNova(false)} onCriar={id => { setNova(false); onAbrir(id); }} />}
    </>
  );
}

function NovaAuditoria({ filiais, nomePadrao, onClose, onCriar }: { filiais: Filial[]; nomePadrao: string; onClose: () => void; onCriar: (id: string) => void }) {
  const { colors } = useContext(ThemeContext);
  const t = useMemo(() => createTypography(colors), [colors]);
  const s = useMemo(() => estilos(colors), [colors]);
  const [filialId, setFilialId] = useState('');
  const [busca, setBusca] = useState('');
  const [data, setData] = useState(hoje());
  const [auditores, setAuditores] = useState(nomePadrao);
  const [escopo, setEscopo] = useState(ESCOPO_PADRAO);
  const filtradas = filiais.filter(f => `${f.codigo} ${f.nome} ${f.cidade}`.toLowerCase().includes(busca.toLowerCase()));
  const criar = () => {
    if (!filialId) { notify('Escolha a filial', 'Toque na filial que será auditada.'); return; }
    if (!dataValida(data)) { notify('Data inválida', 'Use o formato AAAA-MM-DD.'); return; }
    const id = uid('aud');
    auditoriasCol.put({ id, filial_id: filialId, data, auditores: auditores.trim(), escopo: escopo.trim() || ESCOPO_PADRAO, status: 'rascunho', itens: novosItens() });
    onCriar(id);
  };
  return (
    <Sheet title="Nova auditoria" onClose={onClose}
      footer={<View style={s.twoCol}><Button title="Cancelar" variant="secondary" style={s.flex} onPress={onClose} /><Button title="Começar" icon={CheckIcon} style={s.flex} disabled={!filialId} onPress={criar} /></View>}>
      <Text style={t.label}>Filial / unidade</Text>
      <Field icon={MagnifyingGlassIcon} value={busca} onChangeText={setBusca} placeholder="Código, nome ou cidade" />
      <View style={s.listBox}>
        {filtradas.slice(0, 30).map((f, i) => {
          const on = f.id === filialId;
          return (
            <Pressable key={f.id} accessibilityRole="radio" accessibilityState={{ selected: on }} onPress={() => setFilialId(f.id)}
              style={[s.opcao, i > 0 && s.divided, on && { backgroundColor: colors.accentSoft }]}>
              <StorefrontIcon size={18} color={on ? colors.accentText : colors.textMuted} />
              <Text style={[t.body, s.flex, on && { color: colors.accentText, fontWeight: '700' }]} numberOfLines={1}>{f.codigo} · {f.nome}{f.cidade ? ` · ${f.cidade}` : ''}</Text>
              {on ? <CheckIcon size={16} color={colors.accentText} weight="bold" /> : null}
            </Pressable>
          );
        })}
        {!filtradas.length && <Text style={[t.caption, { padding: 12 }]}>Nenhuma filial encontrada.</Text>}
      </View>
      <Field label="Data da auditoria" helper="Formato AAAA-MM-DD" icon={CalendarBlankIcon} value={data} onChangeText={setData} />
      <Field label="Auditor(es)" value={auditores} onChangeText={setAuditores} placeholder="Nome de quem audita" />
      <Field label="Processo / escopo" value={escopo} onChangeText={setEscopo} />
    </Sheet>
  );
}

/* =====================================================================
   Auditoria: checklist
   ===================================================================== */
function AuditoriaTela({ auditoria, filiais, onVoltar }: { auditoria: Auditoria; filiais: Filial[]; onVoltar: () => void }) {
  const { colors } = useContext(ThemeContext);
  const t = useMemo(() => createTypography(colors), [colors]);
  const s = useMemo(() => estilos(colors), [colors]);
  const [cab, setCab] = useState({ data: auditoria.data, auditores: auditoria.auditores, escopo: auditoria.escopo });
  const [itens, setItens] = useState<ItemAuditoria[]>(auditoria.itens);
  const [filtro, setFiltro] = useState<Filtro>('todos');
  const [busca, setBusca] = useState('');
  const [enviando, setEnviando] = useState<Record<number, boolean>>({});
  const [emailAberto, setEmailAberto] = useState(false);
  const filial = nomeFilial(filiais, auditoria.filial_id);
  const concluida = auditoria.status === 'concluida';

  // Edição local e gravação com atraso curto (a cada letra só a tela muda; o registro grava logo depois).
  const pendente = useRef<Auditoria | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const gravar = useCallback((patch: Partial<Auditoria>, imediato = false) => {
    const base = pendente.current ?? auditoriasCol.get(auditoria.id) ?? auditoria;
    pendente.current = { ...base, ...patch };
    if (timer.current) clearTimeout(timer.current);
    const flush = () => { if (pendente.current) { auditoriasCol.put(pendente.current); pendente.current = null; } };
    if (imediato) flush(); else timer.current = setTimeout(flush, 600);
  }, [auditoria]);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); if (pendente.current) auditoriasCol.put(pendente.current); }, []);

  const itensRef = useRef(itens);
  itensRef.current = itens;
  const mudarItem = useCallback((id: number, patch: Partial<ItemAuditoria>, imediato = false) => {
    const novos = itensRef.current.map(i => (i.id === id ? { ...i, ...patch } : i));
    itensRef.current = novos;
    setItens(novos);
    gravar({ itens: novos }, imediato);
  }, [gravar]);
  const mudarCab = (k: keyof typeof cab, v: string) => {
    setCab(c => ({ ...c, [k]: v }));
    if (k !== 'data' || dataValida(v)) gravar({ [k]: k === 'escopo' ? v || ESCOPO_PADRAO : v });
  };

  const adicionarFotos = useCallback(async (id: number, origem: 'camera' | 'galeria') => {
    try {
      const imagens = await escolherFotos(origem);
      if (!imagens.length) return;
      setEnviando(e => ({ ...e, [id]: true }));
      const caminhos: string[] = [];
      for (const b64 of imagens) caminhos.push(await enviarFoto(auditoria.id, id, b64));
      const atual = itensRef.current.find(i => i.id === id);
      if (atual) mudarItem(id, { fotos: [...atual.fotos, ...caminhos] }, true);
    } catch (e) {
      notify('Foto não enviada', e instanceof Error ? e.message : 'Tente de novo.');
    } finally { setEnviando(e => ({ ...e, [id]: false })); }
  }, [auditoria.id, mudarItem]);
  const removerFoto = useCallback((id: number, caminho: string) => {
    confirmAction('Remover foto?', 'A foto será apagada desta auditoria.', 'Remover', () => {
      const atual = itensRef.current.find(i => i.id === id);
      if (atual) mudarItem(id, { fotos: atual.fotos.filter(f => f !== caminho) }, true);
      void apagarFoto(caminho).catch(() => undefined);
    });
  }, [mudarItem]);

  const todasFotos = useMemo(() => itens.flatMap(i => i.fotos), [itens]);
  const links = useLinksFotos(todasFotos);
  const c = contar(itens);
  const q = busca.trim().toLowerCase();
  const visiveis = itens.filter(i => (filtro === 'todos' || (filtro === 'pendentes' ? !i.status : i.status === filtro)) && (!q || `${i.id} ${i.titulo} ${i.obs}`.toLowerCase().includes(q)));

  const gerarHtml = async () => {
    const links2 = await linksDasFotos(itensRef.current.flatMap(i => i.fotos)).catch(() => ({} as Record<string, string>));
    const atual = { ...auditoria, ...cab, itens: itensRef.current };
    return relatorioHtml(atual, filial, p => links2[p]);
  };
  const exportarPdf = async () => {
    try {
      const html = await gerarHtml();
      if (Platform.OS === 'web') { await Print.printAsync({ html }); return; }
      const file = await Print.printToFileAsync({ html });
      if (!(await Sharing.isAvailableAsync())) { notify('Compartilhamento indisponível', 'O PDF foi gerado, mas este aparelho não oferece compartilhamento de arquivos.'); return; }
      await Sharing.shareAsync(file.uri, { mimeType: 'application/pdf', dialogTitle: 'Relatório de auditoria', UTI: 'com.adobe.pdf' });
    } catch { notify('Erro ao gerar o relatório', 'Não foi possível criar o PDF desta auditoria.'); }
  };
  const concluir = () => {
    if (concluida) { gravar({ status: 'rascunho' }, true); return; }
    const fim = () => gravar({ status: 'concluida', ...cab, escopo: cab.escopo || ESCOPO_PADRAO, itens: itensRef.current }, true);
    if (c.pendentes) confirmAction('Concluir com itens pendentes?', `${c.pendentes} requisito(s) ainda não foram avaliados e aparecerão como "não avaliados" no relatório.`, 'Concluir', fim);
    else fim();
  };
  const excluir = () => confirmAction('Excluir auditoria?', 'O checklist, as observações e as fotos desta auditoria serão apagados.', 'Excluir', () => {
    const fotos = itensRef.current.flatMap(i => i.fotos);
    pendente.current = null;
    auditoriasCol.remove(auditoria.id);
    fotos.forEach(f => void apagarFoto(f).catch(() => undefined));
    onVoltar();
  });

  const filtros: { id: Filtro; rotulo: string; n: number; tom: Tone }[] = [
    { id: 'todos', rotulo: 'Todos', n: itens.length, tom: 'neutral' },
    { id: 'pendentes', rotulo: 'Pendentes', n: c.pendentes, tom: 'accent' },
    ...STATUS.map(st => ({ id: st as Filtro, rotulo: ROTULO_CURTO[st], n: c[st], tom: TOM[st] })),
  ];

  const cabecalho = (
    <View style={s.stack}>
      <Button title="Auditorias" icon={ArrowLeftIcon} variant="ghost" size="sm" style={s.alignStart} onPress={onVoltar} />
      <View style={s.pageHead}>
        <View style={s.flex}>
          <Text style={t.title} numberOfLines={1}>{filial}</Text>
          <Text style={t.caption}>{dataBR(cab.data)} · {itens.length - c.pendentes} de {itens.length} requisitos avaliados</Text>
        </View>
        <StatusPill label={concluida ? 'Concluída' : 'Rascunho'} tone={concluida ? 'success' : 'accent'} icon={concluida ? SealCheckIcon : undefined} />
      </View>
      <Card>
        <Text style={t.label}>Identificação</Text>
        <Field label="Data da auditoria" helper="Formato AAAA-MM-DD" icon={CalendarBlankIcon} value={cab.data} onChangeText={v => mudarCab('data', v)} />
        <Field label="Auditor(es)" value={cab.auditores} onChangeText={v => mudarCab('auditores', v)} placeholder="Nome de quem audita" />
        <Field label="Processo / escopo" value={cab.escopo} onChangeText={v => mudarCab('escopo', v)} />
      </Card>
      <View style={s.filtros}>
        {filtros.map(f => {
          const on = filtro === f.id;
          return (
            <Pressable key={f.id} accessibilityRole="button" accessibilityState={{ selected: on }} onPress={() => setFiltro(on && f.id !== 'todos' ? 'todos' : f.id)}
              style={[s.filtro, on && { borderColor: colors.accent, backgroundColor: colors.accentSoft }]}>
              <Text style={[s.filtroNum, { color: f.tom === 'danger' ? colors.danger : f.tom === 'warning' ? colors.warning : f.tom === 'success' ? colors.success : f.tom === 'accent' ? colors.accentText : colors.text }]}>{f.n}</Text>
              <Text style={[t.caption, on && { color: colors.accentText, fontWeight: '700' }]} numberOfLines={1}>{f.rotulo}</Text>
            </Pressable>
          );
        })}
      </View>
      <Field icon={MagnifyingGlassIcon} value={busca} onChangeText={setBusca} placeholder="Buscar requisito ou observação" />
      <View style={{ height: space.xs }} />
    </View>
  );

  const rodape = (
    <View style={[s.stack, { marginTop: space.md }]}>
      <SectionHeader title="Relatório" />
      <Card>
        <Text style={t.caption}>{c.NC} não conforme(s), {c.OM} oportunidade(s) de melhoria e {c.OB} observação(ões) entram em "Constatações e planos de ação". As fotos vão como evidências.</Text>
        <Button title="Gerar relatório (PDF)" icon={FilePdfIcon} onPress={() => void exportarPdf()} />
        <Button title="Enviar relatório por e-mail" icon={EnvelopeIcon} variant="secondary" onPress={() => setEmailAberto(true)} />
      </Card>
      <Button title={concluida ? 'Reabrir auditoria' : 'Concluir auditoria'} icon={concluida ? ResetIcon : SealCheckIcon} variant={concluida ? 'secondary' : 'primary'} onPress={concluir} />
      <Button title="Excluir auditoria" icon={TrashIcon} variant="danger" size="sm" style={s.alignStart} onPress={excluir} />
    </View>
  );

  return (
    <>
      <FlatList
        data={visiveis}
        keyExtractor={i => String(i.id)}
        contentContainerStyle={s.content}
        keyboardShouldPersistTaps="handled"
        initialNumToRender={6}
        windowSize={7}
        ItemSeparatorComponent={() => <View style={{ height: space.sm }} />}
        ListHeaderComponent={cabecalho}
        ListFooterComponent={rodape}
        ListEmptyComponent={<EmptyState icon={MagnifyingGlassIcon} title="Nenhum requisito neste filtro" text="Troque o filtro ou a busca." />}
        renderItem={({ item }) => (
          <ItemCard item={item} links={links} enviando={!!enviando[item.id]} onMudar={mudarItem} onFoto={adicionarFotos} onRemoverFoto={removerFoto} />
        )}
      />
      {emailAberto && <EmailRelatorio titulo={`Relatório de auditoria: ${filial} (${dataBR(cab.data)})`} arquivo={`auditoria-${filial.split(' · ')[0]}-${cab.data}`} gerarHtml={gerarHtml} onClose={() => setEmailAberto(false)} />}
    </>
  );
}

/* ---------- Requisito ---------- */
type ItemProps = {
  item: ItemAuditoria;
  links: Record<string, string>;
  enviando: boolean;
  onMudar: (id: number, patch: Partial<ItemAuditoria>, imediato?: boolean) => void;
  onFoto: (id: number, origem: 'camera' | 'galeria') => Promise<void>;
  onRemoverFoto: (id: number, caminho: string) => void;
};
const ItemCard = memo(function ItemCard({ item, links, enviando, onMudar, onFoto, onRemoverFoto }: ItemProps) {
  const { colors } = useContext(ThemeContext);
  const t = useMemo(() => createTypography(colors), [colors]);
  const s = useMemo(() => estilos(colors), [colors]);
  const st = item.status;
  const pedeAcao = !!st && PEDE_ACAO.includes(st);
  return (
    <Card style={st === 'NC' ? { borderColor: colors.danger } : st === 'OM' ? { borderColor: colors.warning } : undefined}>
      <View style={s.itemTopo}>
        <View style={s.num}><Text style={s.numTxt}>{item.id}</Text></View>
        <Text style={[t.bodyStrong, s.flex]}>{item.titulo}</Text>
      </View>
      <ChoiceChips value={st} options={[...STATUS]} toneFor={o => TOM[o as StatusReq]} onChange={v => onMudar(item.id, { status: v === st ? '' : (v as StatusReq) }, true)} />
      <Text style={t.caption}>{st ? ROTULO[st] : 'Não avaliado: escolha o status (C, OB, OM, NC, PP ou NA).'}</Text>
      <Field multiline value={item.obs} onChangeText={v => onMudar(item.id, { obs: v })} placeholder="Observações / constatações da auditoria" style={{ minHeight: 64 }} />
      <View style={s.fotosLinha}>
        {item.fotos.map(f => (
          <View key={f} style={s.thumb}>
            {links[f] ? <Image source={{ uri: links[f] }} style={s.thumbImg} accessibilityLabel={`Evidência do item ${item.id}`} /> : <View style={[s.thumbImg, { backgroundColor: colors.surfaceMuted }]} />}
            <Pressable accessibilityLabel="Remover foto" hitSlop={8} onPress={() => onRemoverFoto(item.id, f)} style={s.thumbX}><XIcon size={12} color="#fff" weight="bold" /></Pressable>
          </View>
        ))}
        {Platform.OS !== 'web' ? <Button title="Câmera" icon={CameraIcon} variant="secondary" size="sm" disabled={enviando} onPress={() => void onFoto(item.id, 'camera')} /> : null}
        <Button title={enviando ? 'Enviando…' : Platform.OS === 'web' ? 'Anexar fotos' : 'Galeria'} icon={ImagesIcon} variant="secondary" size="sm" disabled={enviando} onPress={() => void onFoto(item.id, 'galeria')} />
      </View>
      {pedeAcao && (
        <View style={s.acaoBox}>
          <Text style={s.acaoLabel}>PLANO DE AÇÃO / TRATATIVA</Text>
          <Field value={item.acao.tarefa} onChangeText={v => onMudar(item.id, { acao: { ...item.acao, tarefa: v } })} placeholder="Ação corretiva ou melhoria" />
          <View style={s.twoCol}>
            <Field style={s.flex} value={item.acao.responsavel} onChangeText={v => onMudar(item.id, { acao: { ...item.acao, responsavel: v } })} placeholder="Responsável" />
            <Field style={{ width: 130 }} value={item.acao.prazo} onChangeText={v => onMudar(item.id, { acao: { ...item.acao, prazo: v } })} placeholder="Prazo AAAA-MM-DD" />
          </View>
        </View>
      )}
    </Card>
  );
});

/* ---------- Envio do relatório por e-mail ---------- */
function EmailRelatorio({ titulo, arquivo, gerarHtml, onClose }: { titulo: string; arquivo: string; gerarHtml: () => Promise<string>; onClose: () => void }) {
  const { colors } = useContext(ThemeContext);
  const t = useMemo(() => createTypography(colors), [colors]);
  const [para, setPara] = useState('');
  const [enviando, setEnviando] = useState(false);
  const emails = separarEmails(para);
  const invalidos = emails.filter(e => !emailValido(e));
  const ok = emails.length > 0 && emails.length <= 10 && !invalidos.length;
  const enviar = async () => {
    if (!ok) return;
    setEnviando(true);
    try {
      const html = await gerarHtml();
      const pdf = Platform.OS === 'web' ? undefined : (await Print.printToFileAsync({ html, base64: true })).base64;
      const r = await enviarEmail({ acao: 'relatorio', modulo: 'auditoria', para: emails, titulo, html, pdf_base64: pdf, nome_arquivo: arquivo });
      if (!r.ok) { notify('E-mail não enviado', r.erro); return; }
      notify('Relatório enviado', `Enviado para ${emails.join(', ')}.`);
      onClose();
    } catch { notify('Erro ao gerar o relatório', 'Não foi possível preparar o relatório desta auditoria.'); }
    finally { setEnviando(false); }
  };
  return (
    <Sheet title="Enviar relatório por e-mail" onClose={() => { if (!enviando) onClose(); }}
      footer={<Button title={enviando ? 'Enviando…' : 'Enviar'} icon={EnvelopeIcon} disabled={enviando || !ok} onPress={() => void enviar()} />}>
      <Text style={t.bodyStrong}>{titulo}</Text>
      <Field label="Para" value={para} onChangeText={setPara} placeholder="gerente@empresa.com, outro@empresa.com" autoCapitalize="none" autoCorrect={false} keyboardType="email-address" />
      <Text style={[t.caption, invalidos.length || emails.length > 10 ? { color: colors.danger } : null]}>
        {invalidos.length ? `E-mail inválido: ${invalidos.join(', ')}`
          : emails.length > 10 ? 'No máximo 10 e-mails por envio.'
          : `Separe vários e-mails por vírgula (até 10). ${Platform.OS === 'web' ? 'O relatório vai no corpo do e-mail.' : 'O relatório vai em PDF, anexado ao e-mail.'}`}
      </Text>
    </Sheet>
  );
}

/* ---------- Estilos ---------- */
const estilos = (c: ThemeColors) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: c.bg },
  flex: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  twoCol: { flexDirection: 'row', gap: space.sm },
  stack: { gap: space.md },
  alignStart: { alignSelf: 'flex-start' },
  header: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.lg, paddingVertical: space.md, backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border },
  brandMark: { width: 34, height: 34, borderRadius: 10, backgroundColor: '#c17a13', alignItems: 'center', justifyContent: 'center' },
  brandName: { fontSize: 15.5, fontWeight: '800', color: c.text },
  content: { padding: space.lg, paddingBottom: space.xxl * 2, width: '100%', maxWidth: pageMaxWidth(900), alignSelf: 'center' },
  pageHead: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  listBox: { borderWidth: 1, borderColor: c.border, borderRadius: radius.control, overflow: 'hidden', maxHeight: 260 },
  opcao: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: 12, minHeight: 44 },
  divided: { borderTopWidth: 1, borderTopColor: c.border },
  filtros: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  filtro: { minWidth: 84, flexGrow: 1, paddingVertical: 8, paddingHorizontal: 10, borderRadius: radius.control, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface },
  filtroNum: { fontSize: 19, fontWeight: '800' },
  itemTopo: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm },
  num: { width: 30, height: 30, borderRadius: 9, backgroundColor: c.accentSoft, alignItems: 'center', justifyContent: 'center' },
  numTxt: { color: c.accentText, fontWeight: '800' },
  fotosLinha: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.sm },
  thumb: { width: 64, height: 54 },
  thumbImg: { width: 64, height: 54, borderRadius: 8, borderWidth: 1, borderColor: c.border },
  thumbX: { position: 'absolute', right: -6, top: -6, width: 22, height: 22, borderRadius: 11, backgroundColor: '#182536', alignItems: 'center', justifyContent: 'center' },
  acaoBox: { gap: space.sm, padding: space.md, borderRadius: radius.control, borderWidth: 1, borderColor: '#f3e3b7', backgroundColor: c.surfaceMuted },
  acaoLabel: { fontSize: 11, fontWeight: '800', color: '#c17a13', letterSpacing: 0.5 },
});
