import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { memo, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Image, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useUsuarioLogado } from '../../lib/auth';
import type { Filial } from '../../lib/data';
import { emailValido, enviarEmail, separarEmails } from '../../lib/email';
import { isSupabaseConfigured } from '../../lib/supabase';
import { imprimirHtml, pdfBase64 } from '../../lib/util';
import {
  ArrowLeftIcon, CalendarBlankIcon, CaretDownIcon, HourglassIcon, CaretUpIcon, EyeIcon, CameraIcon, CheckIcon, ClipboardTextIcon, InfoIcon, PencilSimpleIcon, CloudCheckIcon, CloudSlashIcon, DeviceMobileIcon, EnvelopeIcon, FilePdfIcon,
  ImagesIcon, MagnifyingGlassIcon, PlusIcon, ResetIcon, SealCheckIcon, StorefrontIcon, TrashIcon, XIcon,
} from '../../ui/icons';
import { Button, Card, ChoiceChips, confirmAction, EmptyState, Field, IconButton, notify, SectionHeader, Sheet, StatusPill, type Tone } from '../../ui/kit';
import { createTypography, pageMaxWidth, radius, space, ThemeContext, type ThemeColors } from '../../ui/theme';
import {
  type Auditoria, COMO_AVALIAR, contar, dataBR, dataValida, ESCOPO_PADRAO, hoje, type ItemAuditoria, novosItens, PEDE_ACAO, type RelatorioFinal, relatorioHtml, ROTULO, ROTULO_CURTO, SETORES, setorDo, STATUS,
  type StatusReq, tituloCurto, uid,
} from './model';
import { Deslizavel } from '../tempos/Deslizavel';
import { apagarFoto, auditoriasCol, enviarFoto, escolherFotos, fotosEmbutidas, guardarRelatorio, lerRelatorio, linksDasFotos, useAuditorias, useLinksFotos } from './store';

const SESSAO = 'nevoeiro.auditoria.sessao.v1';
/** Cores vivas e sólidas de cada status (selos, botões e borda do item). */
const VIVO: Record<StatusReq, string> = { C: '#12b05a', OB: '#1f7bff', OM: '#ff8a00', NC: '#ff2442', PP: '#8b4dff', NA: '#7d8799' };
/** NC, OB e OM brilham de leve na própria cor (sem pulsar). */
const brilho = (st: StatusReq) => (st === 'NC' || st === 'OB' || st === 'OM' ? { boxShadow: `0 0 10px 1px ${VIVO[st]}99` } : null);
const TOM: Record<StatusReq, Tone> = { C: 'success', OB: 'neutral', OM: 'warning', NC: 'danger', PP: 'accent', NA: 'neutral' };
type Filtro = 'todos' | 'pendentes' | StatusReq;
/** Concluída abre em lista (resumo); os detalhes só em "Visualizar completa" (leitura) ou ao reabrir (edição). */
type Modo = 'edicao' | 'resumo' | 'completa';
const dataHoraBR = (iso: string) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? iso : d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }); };

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
        <View style={s.brandMark}><ClipboardTextIcon size={18} color="#5fd39a" weight="bold" /></View>
        <View style={s.flex}>
          <Text style={s.brandName}>Auditoria</Text>
          <Text style={t.caption}>Sistema de Gestão Integrada</Text>
        </View>
        {syncPill}
      </View>
      {!loaded || !sessaoPronta ? <View style={s.flex} />
        : aberta ? <AuditoriaTela key={aberta.id} auditoria={aberta} filiais={filiais} sincronizado={status !== 'error'} onVoltar={() => setAbertaId(null)} />
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
  const usuario = useUsuarioLogado();
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
              <Text style={t.captionBg}>Checklist de requisitos com evidências e planos de ação</Text>
            </View>
            <Button title="Nova auditoria" icon={PlusIcon} size="sm" onPress={() => (filiais.length ? setNova(true) : router.push('/filiais'))} />
          </View>
          <Field icon={MagnifyingGlassIcon} value={busca} onChangeText={setBusca} placeholder="Filial, auditor ou data" />
          {auditorias.length ? <Text style={t.captionBg}>Arraste uma auditoria: para a direita edita (ou reabre a concluída); para a esquerda exclui.</Text> : null}
          <View style={{ height: space.xs }} />
        </View>}
        ListEmptyComponent={auditorias.length
          ? <EmptyState icon={MagnifyingGlassIcon} title="Nenhuma auditoria encontrada" text="Confira o que foi digitado na busca." />
          : filiais.length
            ? <EmptyState icon={ClipboardTextIcon} title="Nenhuma auditoria ainda" text="Comece uma auditoria escolhendo a filial. O checklist já vem com os requisitos." action={{ label: 'Nova auditoria', icon: PlusIcon, onPress: () => setNova(true) }} />
            : <EmptyState icon={StorefrontIcon} title="Nenhuma filial cadastrada" text="As auditorias pertencem a uma filial do cadastro único." action={{ label: 'Abrir cadastro de filiais', onPress: () => router.push('/filiais') }} />}
        renderItem={({ item: a }) => {
          const c = contar(a.itens);
          const concl = a.status === 'concluida';
          // Arrastar: direita edita (ou reabre a concluída); esquerda exclui.
          return (
            <Deslizavel raio={radius.card} direita={concl ? { rotulo: 'Reabrir', cor: '#15803d', icone: ResetIcon } : { rotulo: 'Editar', cor: '#1d4ed8', icone: PencilSimpleIcon }}
              esquerda={{ rotulo: 'Excluir', cor: '#c0262d', icone: TrashIcon }}
              onDireita={() => (concl
                ? confirmAction('Reabrir auditoria?', 'A auditoria volta para edição. O relatório final guardado continua disponível.', 'Reabrir', () => { auditoriasCol.put({ ...a, status: 'rascunho' }); onAbrir(a.id); })
                : onAbrir(a.id))}
              onEsquerda={() => excluirAuditoria(a)}>
            <Pressable accessibilityRole="button" onPress={() => onAbrir(a.id)} style={({ pressed }) => [pressed && { opacity: 0.75 }]}>
              <Card>
                <View style={s.row}>
                  <View style={s.flex}>
                    <Text style={t.bodyStrong} numberOfLines={1}>{nomeFilial(filiais, a.filial_id)}</Text>
                    <Text style={t.caption} numberOfLines={1}>{dataBR(a.data)}{a.auditores ? ` · ${a.auditores}` : ''}</Text>
                  </View>
                  <StatusPill label={concl ? 'Concluída' : 'Em andamento'} tone={concl ? 'success' : 'warning'} icon={concl ? SealCheckIcon : HourglassIcon} />
                </View>
                <View style={s.pills}>
                  {c.NC ? <StatusPill label={`${c.NC} NC`} tone="danger" /> : null}
                  {c.OM ? <StatusPill label={`${c.OM} melhoria(s)`} tone="warning" /> : null}
                  {c.OB ? <StatusPill label={`${c.OB} observação(ões)`} /> : null}
                  {c.pendentes ? <StatusPill label={`${c.pendentes} pendente(s)`} tone="accent" /> : <StatusPill label="Todos avaliados" tone="success" />}
                </View>
              </Card>
            </Pressable>
            </Deslizavel>
          );
        }}
      />
      {nova && <NovaAuditoria filiais={filiais} nomePadrao={usuario} onClose={() => setNova(false)} onCriar={id => { setNova(false); onAbrir(id); }} />}
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
function AuditoriaTela({ auditoria, filiais, sincronizado, onVoltar }: { auditoria: Auditoria; filiais: Filial[]; sincronizado: boolean; onVoltar: () => void }) {
  const { colors } = useContext(ThemeContext);
  const t = useMemo(() => createTypography(colors), [colors]);
  const s = useMemo(() => estilos(colors), [colors]);
  const [cab, setCab] = useState({ data: auditoria.data, auditores: auditoria.auditores, escopo: auditoria.escopo });
  const [itens, setItens] = useState<ItemAuditoria[]>(auditoria.itens);
  // Execução: abre em "Pendentes" (a fila diminui sozinha conforme os itens são avaliados).
  const [filtro, setFiltro] = useState<Filtro>(auditoria.status === 'concluida' ? 'todos' : 'pendentes');
  const [busca, setBusca] = useState('');
  const [setor, setSetor] = useState('');
  /** Requisito expandido (só um por vez). */
  const [aberto, setAberto] = useState<number | null>(null);
  const [identAberta, setIdentAberta] = useState(false);
  const lista = useRef<FlatList<ItemAuditoria>>(null);
  const [enviando, setEnviando] = useState<Record<number, boolean>>({});
  const [emailAberto, setEmailAberto] = useState(false);
  const [finalizando, setFinalizando] = useState(false);
  const filial = nomeFilial(filiais, auditoria.filial_id);
  const concluida = auditoria.status === 'concluida';
  const [modo, setModo] = useState<Modo>(concluida ? 'resumo' : 'edicao');
  const relatorios = auditoria.relatorios ?? [];
  const ultimoRelatorio: RelatorioFinal | undefined = relatorios[relatorios.length - 1];

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
  // Número digitado = o item com esse número; texto = requisito ou observação. O item aberto fica na lista
  // mesmo saindo do filtro (ex.: avaliado em "Pendentes"), até ser concluído.
  const bate = (i: ItemAuditoria) => (filtro === 'todos' || (filtro === 'pendentes' ? !i.status : i.status === filtro))
    && (!setor || setorDo(i.id) === setor)
    && (!q || (/^\d+$/.test(q) ? String(i.id) === q : `${i.titulo} ${i.obs}`.toLowerCase().includes(q)));
  const visiveis = itens.filter(i => i.id === aberto || bate(i));
  const avaliados = itens.length - c.pendentes;
  const pct = itens.length ? Math.round((avaliados / itens.length) * 100) : 0;
  const itemAberto = aberto !== null ? itens.find(i => i.id === aberto) : undefined;

  /** Abre um requisito (fecha o anterior) e o traz para o topo da lista. */
  const abrir = useCallback((id: number | null) => {
    setAberto(id);
    if (id === null) return;
    setTimeout(() => {
      const idx = itensRef.current.filter(i => i.id === id || bate(i)).findIndex(i => i.id === id);
      if (idx >= 0) lista.current?.scrollToIndex({ index: idx, viewPosition: 0, animated: true });
    }, 60);
  }, [filtro, setor, q]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Concluída com relatório final guardado: usa o arquivo guardado (é ele que tem as fotos). Senão, monta na hora. */
  const gerarHtml = async (caminho = concluida ? ultimoRelatorio?.caminho : undefined) => {
    if (caminho) return lerRelatorio(caminho);
    const links2 = await linksDasFotos(itensRef.current.flatMap(i => i.fotos)).catch(() => ({} as Record<string, string>));
    const atual = { ...auditoria, ...cab, itens: itensRef.current };
    return relatorioHtml(atual, filial, p => links2[p]);
  };
  const exportarPdf = async (caminho?: string) => {
    try { await imprimirHtml(await gerarHtml(caminho), `Auditoria ${filial.split(' · ')[0]} ${dataBR(cab.data)}`); }
    catch (e) { notify('Erro ao gerar o relatório', e instanceof Error ? e.message : 'Não foi possível criar o PDF desta auditoria.'); }
  };

  /** Concluir: gera o relatório final com as fotos embutidas, guarda no servidor e só então apaga as fotos. */
  const finalizar = async () => {
    const fotos = itensRef.current.flatMap(i => i.fotos);
    const base: Auditoria = { ...auditoria, ...cab, escopo: cab.escopo || ESCOPO_PADRAO, itens: itensRef.current, status: 'concluida' };
    setFinalizando(true);
    try {
      let lista = relatorios;
      if (isSupabaseConfigured) {
        try {
          const embutidas = await fotosEmbutidas(fotos);
          const caminho = await guardarRelatorio(auditoria.id, relatorioHtml(base, filial, p => embutidas[p]));
          lista = [...relatorios, { caminho, em: new Date().toISOString(), fotos: fotos.length }];
        } catch (e) {
          // Sem fotos e sem relatório anterior dá para concluir sem guardar: o PDF é montado a partir do checklist.
          if (fotos.length || relatorios.length) throw e;
        }
      }
      const guardou = lista !== relatorios;
      const itensFinais = guardou ? itensRef.current.map(i => (i.fotos.length ? { ...i, fotos: [] } : i)) : itensRef.current;
      itensRef.current = itensFinais;
      setItens(itensFinais);
      gravar({ ...base, itens: itensFinais, relatorios: lista }, true);
      // As fotos só são apagadas depois que o relatório com elas embutidas foi guardado.
      if (guardou) fotos.forEach(f => void apagarFoto(f).catch(() => undefined));
      setModo('resumo');
    } catch (e) {
      notify('Auditoria não concluída', e instanceof Error ? e.message : 'Não foi possível guardar o relatório final. Tente de novo com internet.');
    } finally { setFinalizando(false); }
  };
  const concluir = () => {
    const nFotos = itensRef.current.reduce((n, i) => n + i.fotos.length, 0);
    const avisos = [
      c.pendentes ? `${c.pendentes} requisito(s) ainda não foram avaliados e aparecerão como "não avaliados" no relatório.` : '',
      nFotos ? `As ${nFotos} foto(s) vão para o relatório final (PDF) e depois são apagadas do app automaticamente.` : '',
    ].filter(Boolean);
    confirmAction('Concluir auditoria?', avisos.join('\n\n') || 'A auditoria passa a aparecer em lista, só para consulta.', 'Concluir', () => void finalizar());
  };
  const reabrir = () => confirmAction('Reabrir auditoria?',
    relatorios.length ? 'As fotos já estão no relatório final guardado, que continua disponível. Ao concluir de novo, um novo relatório é gerado.' : 'A auditoria volta para edição.',
    'Reabrir', () => { gravar({ status: 'rascunho' }, true); setModo('edicao'); });
  const excluir = () => confirmAction('Excluir auditoria?', 'O checklist, as observações, as fotos e os relatórios finais desta auditoria serão apagados.', 'Excluir', () => {
    const arquivos = [...itensRef.current.flatMap(i => i.fotos), ...relatorios.map(r => r.caminho)];
    pendente.current = null;
    auditoriasCol.remove(auditoria.id);
    arquivos.forEach(f => void apagarFoto(f).catch(() => undefined));
    onVoltar();
  });

  const filtros: { id: Filtro; rotulo: string; n: number; tom: Tone }[] = [
    { id: 'pendentes', rotulo: 'Pendentes', n: c.pendentes, tom: 'accent' },
    { id: 'todos', rotulo: 'Todos', n: itens.length, tom: 'neutral' },
    ...(['NC', 'OB', 'OM', 'C', 'PP', 'NA'] as StatusReq[]).map(st => ({ id: st as Filtro, rotulo: st, n: c[st], tom: TOM[st] })),
  ];
  const corTom = (tom: Tone) => (tom === 'danger' ? colors.danger : tom === 'warning' ? colors.warning : tom === 'success' ? colors.success : tom === 'accent' ? colors.accentText : colors.textMuted);
  const pilula = (key: string, rotulo: string, on: boolean, onPress: () => void, cor?: string) => (
    <Pressable key={key} accessibilityRole="button" accessibilityState={{ selected: on }} onPress={onPress} hitSlop={4}
      style={[s.pilula, on && { borderColor: colors.accent, backgroundColor: colors.accentSoft }]}>
      <Text style={[s.pilulaTxt, { color: on ? colors.accentText : cor ?? colors.text }]} numberOfLines={1}>{rotulo}</Text>
    </Pressable>
  );
  const filtrosView = (
    <View style={{ gap: space.sm }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.pilulas} keyboardShouldPersistTaps="handled">
        {filtros.map(f => pilula(f.id, `${f.rotulo} (${f.n})`, filtro === f.id, () => setFiltro(f.id), (STATUS as readonly string[]).includes(f.id) && f.n ? VIVO[f.id as StatusReq] : corTom(f.tom)))}
      </ScrollView>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.pilulas} keyboardShouldPersistTaps="handled">
        {pilula('setor-todos', 'Todos os setores', !setor, () => setSetor(''))}
        {SETORES.map(x => pilula(x.id, x.nome, setor === x.id, () => setSetor(setor === x.id ? '' : x.id)))}
      </ScrollView>
      <Field icon={MagnifyingGlassIcon} value={busca} onChangeText={setBusca} placeholder="Buscar requisito, nº ou palavra-chave" autoCorrect={false} />
    </View>
  );

  /** Barra fixa no topo: filial, situação, progresso e o item que está sendo coletado. */
  const barraFixa = (
    <View style={s.fixo}>
      <View style={s.row}>
        <IconButton icon={ArrowLeftIcon} label="Voltar às auditorias" onPress={onVoltar} />
        <Text style={s.fixoFilial} numberOfLines={1}>{filial}</Text>
        <StatusPill label={!sincronizado ? 'Sem sincronizar' : concluida ? 'Concluída' : 'Rascunho'} tone={!sincronizado ? 'warning' : concluida ? 'success' : 'accent'} icon={sincronizado ? CloudCheckIcon : CloudSlashIcon} />
      </View>
      <View style={s.progTrilho}><View style={[s.progBarra, { width: `${pct}%` }]} /></View>
      <View style={s.row}>
        <Text style={[t.caption, s.flex]} numberOfLines={1}>{avaliados} de {itens.length} avaliados · {pct}%</Text>
        {c.NC ? <Text style={[t.caption, { color: colors.danger, fontWeight: '700' }]}>{c.NC} NC</Text> : null}
      </View>
      {itemAberto ? <Text style={s.coletando} numberOfLines={1}>Coletando: #{itemAberto.id} - {tituloCurto(itemAberto.titulo)}</Text> : null}
    </View>
  );

  /** Identificação recolhida numa linha; "Editar dados" abre os campos. */
  const identificacao = (
    <Card style={{ gap: space.sm }}>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: identAberta }} onPress={() => setIdentAberta(v => !v)} style={s.row}>
        <CalendarBlankIcon size={16} color={colors.textMuted} />
        <Text style={[t.caption, s.flex]} numberOfLines={1}>{dataBR(cab.data)} · {cab.auditores || 'sem auditor'} · {cab.escopo || ESCOPO_PADRAO}</Text>
        <View style={[s.row, { gap: 4 }]}>
          <PencilSimpleIcon size={14} color={colors.accentText} />
          <Text style={[t.caption, { color: colors.accentText, fontWeight: '700' }]}>{identAberta ? 'Fechar' : 'Editar dados'}</Text>
        </View>
      </Pressable>
      {identAberta ? <>
        <Field label="Data da auditoria" helper="Formato AAAA-MM-DD" icon={CalendarBlankIcon} value={cab.data} onChangeText={v => mudarCab('data', v)} />
        <Field label="Auditor(es)" value={cab.auditores} onChangeText={v => mudarCab('auditores', v)} placeholder="Nome de quem audita" />
        <Field label="Processo / escopo" value={cab.escopo} onChangeText={v => mudarCab('escopo', v)} />
      </> : null}
    </Card>
  );

  const cabecalho = (
    <View style={[s.stack, { marginBottom: space.sm }]}>
      {identificacao}
      {filtrosView}
    </View>
  );

  const blocoRelatorio = (
    <>
      <SectionHeader title="Relatório" />
      <Card>
        <Text style={t.caption}>
          {concluida && ultimoRelatorio
            ? `Relatório final guardado em ${dataHoraBR(ultimoRelatorio.em)}${ultimoRelatorio.fotos ? `, com ${ultimoRelatorio.fotos} foto(s) embutida(s)` : ''}.`
            : `${c.NC} não conforme(s), ${c.OM} oportunidade(s) de melhoria e ${c.OB} observação(ões) entram em "Constatações e planos de ação". As fotos vão como evidências e, ao concluir, ficam só no relatório final.`}
        </Text>
        <Button title="Gerar relatório (PDF)" icon={FilePdfIcon} onPress={() => void exportarPdf()} />
        <Button title="Enviar relatório por e-mail" icon={EnvelopeIcon} variant="secondary" onPress={() => setEmailAberto(true)} />
        {relatorios.length > 1 && <>
          <Text style={t.label}>Versões anteriores do relatório final</Text>
          {relatorios.slice(0, -1).reverse().map(r => (
            <Button key={r.caminho} title={`Relatório de ${dataHoraBR(r.em)}`} icon={FilePdfIcon} variant="ghost" size="sm" style={s.alignStart} onPress={() => void exportarPdf(r.caminho)} />
          ))}
        </>}
      </Card>
    </>
  );

  const email = emailAberto
    ? <EmailRelatorio titulo={`Relatório de auditoria: ${filial} (${dataBR(cab.data)})`} arquivo={`auditoria-${filial.split(' · ')[0]}-${cab.data}`} gerarHtml={() => gerarHtml()} onClose={() => setEmailAberto(false)} />
    : null;

  /* ---------- Concluída: lista (resumo) ou visualização completa, ambas só leitura ---------- */
  if (concluida && modo !== 'edicao') {
    const completa = modo === 'completa';
    const topo = (
      <View style={s.stack}>
        <Button title={completa ? 'Voltar à lista' : 'Auditorias'} icon={ArrowLeftIcon} variant="ghost" size="sm" style={s.alignStart} onPress={completa ? () => setModo('resumo') : onVoltar} />
        <View style={s.pageHead}>
          <View style={s.flex}>
            <Text style={t.title} numberOfLines={1}>{filial}</Text>
            <Text style={t.captionBg}>{dataBR(cab.data)}{cab.auditores ? ` · ${cab.auditores}` : ''} · {cab.escopo || ESCOPO_PADRAO}</Text>
          </View>
          <StatusPill label="Concluída" tone="success" icon={SealCheckIcon} />
        </View>
        {!completa && <View style={s.twoCol}>
          <Button title="Visualizar completa" icon={EyeIcon} style={s.flex} onPress={() => setModo('completa')} />
          <Button title="Reabrir auditoria" icon={ResetIcon} variant="secondary" style={s.flex} onPress={reabrir} />
        </View>}
        {filtrosView}
        <View style={{ height: space.xs }} />
      </View>
    );
    return (
      <>
        <FlatList
          key={modo}
          data={visiveis}
          keyExtractor={i => String(i.id)}
          contentContainerStyle={s.content}
          keyboardShouldPersistTaps="handled"
          initialNumToRender={completa ? 6 : 20}
          windowSize={7}
          ItemSeparatorComponent={completa ? () => <View style={{ height: space.sm }} /> : undefined}
          ListHeaderComponent={topo}
          ListFooterComponent={<View style={[s.stack, { marginTop: space.md }]}>
            {blocoRelatorio}
            {completa && <Button title="Reabrir auditoria" icon={ResetIcon} variant="secondary" onPress={reabrir} />}
            <Button title="Excluir auditoria" icon={TrashIcon} variant="danger" size="sm" style={s.alignStart} onPress={excluir} />
          </View>}
          ListEmptyComponent={<EmptyState icon={MagnifyingGlassIcon} title="Nenhum requisito neste filtro" text="Troque o filtro ou a busca." />}
          renderItem={({ item, index }) => completa
            ? <ItemCard item={item} links={links} enviando={false} somenteLeitura onMudar={mudarItem} onFoto={adicionarFotos} onRemoverFoto={removerFoto} />
            : <LinhaResumo item={item} primeira={index === 0} ultima={index === visiveis.length - 1} />}
        />
        {email}
      </>
    );
  }

  const rodape = (
    <View style={[s.stack, { marginTop: space.md }]}>
      {blocoRelatorio}
      <Button title={finalizando ? 'Gerando relatório final…' : 'Concluir auditoria'} icon={SealCheckIcon} disabled={finalizando} onPress={concluir} />
      <Button title="Excluir auditoria" icon={TrashIcon} variant="danger" size="sm" style={s.alignStart} onPress={excluir} />
    </View>
  );

  return (
    <View style={s.flex}>
      {barraFixa}
      <FlatList
        ref={lista}
        data={visiveis}
        keyExtractor={i => String(i.id)}
        contentContainerStyle={s.content}
        keyboardShouldPersistTaps="handled"
        initialNumToRender={14}
        windowSize={9}
        ItemSeparatorComponent={() => <View style={{ height: 6 }} />}
        ListHeaderComponent={cabecalho}
        ListFooterComponent={rodape}
        onScrollToIndexFailed={e => lista.current?.scrollToOffset({ offset: e.averageItemLength * e.index, animated: true })}
        ListEmptyComponent={<EmptyState icon={filtro === 'pendentes' && !q && !setor ? SealCheckIcon : MagnifyingGlassIcon}
          title={filtro === 'pendentes' && !q && !setor ? 'Todos os requisitos avaliados' : 'Nenhum requisito neste filtro'}
          text={filtro === 'pendentes' && !q && !setor ? 'Toque em "Todos" ou num status para revisar, ou conclua a auditoria abaixo.' : 'Troque o filtro, o setor ou a busca.'} />}
        renderItem={({ item }) => (
          <ItemAcordeao item={item} aberto={item.id === aberto} links={links} enviando={!!enviando[item.id]}
            onAbrir={abrir} onMudar={mudarItem} onFoto={adicionarFotos} onRemoverFoto={removerFoto} />
        )}
      />
      {email}
    </View>
  );
}

/** Exclui a auditoria com as fotos e os relatórios finais guardados. */
function excluirAuditoria(a: Auditoria, depois?: () => void) {
  confirmAction('Excluir auditoria?', 'O checklist, as observações, as fotos e os relatórios finais desta auditoria serão apagados.', 'Excluir', () => {
    const arquivos = [...a.itens.flatMap(i => i.fotos), ...(a.relatorios ?? []).map(r => r.caminho)];
    auditoriasCol.remove(a.id);
    arquivos.forEach(f => void apagarFoto(f).catch(() => undefined));
    depois?.();
  });
}

/* ---------- Linha da lista (auditoria concluída): só número, requisito e status ---------- */
const LinhaResumo = memo(function LinhaResumo({ item, primeira, ultima }: { item: ItemAuditoria; primeira: boolean; ultima: boolean }) {
  const { colors } = useContext(ThemeContext);
  const t = useMemo(() => createTypography(colors), [colors]);
  const s = useMemo(() => estilos(colors), [colors]);
  const st = item.status;
  return (
    <View style={[s.linha, primeira && s.linhaPrimeira, ultima && s.linhaUltima, !primeira && s.divided]}>
      <View style={s.num}><Text style={s.numTxt}>{item.id}</Text></View>
      <Text style={[t.body, s.flex]} numberOfLines={2}>{item.titulo}</Text>
      {st ? <StatusPill label={ROTULO_CURTO[st]} tone={TOM[st]} /> : <StatusPill label="Não avaliado" />}
    </View>
  );
});

/* ---------- Requisito ---------- */
type ItemProps = {
  item: ItemAuditoria;
  links: Record<string, string>;
  enviando: boolean;
  /** Visualização completa de auditoria concluída: mostra tudo, sem editar. */
  somenteLeitura?: boolean;
  onMudar: (id: number, patch: Partial<ItemAuditoria>, imediato?: boolean) => void;
  onFoto: (id: number, origem: 'camera' | 'galeria') => Promise<void>;
  onRemoverFoto: (id: number, caminho: string) => void;
};
const ItemCard = memo(function ItemCard({ item, links, enviando, somenteLeitura = false, onMudar, onFoto, onRemoverFoto }: ItemProps) {
  const { colors } = useContext(ThemeContext);
  const t = useMemo(() => createTypography(colors), [colors]);
  const s = useMemo(() => estilos(colors), [colors]);
  const st = item.status;
  const pedeAcao = !!st && PEDE_ACAO.includes(st);
  if (somenteLeitura) {
    const temAcao = item.acao.tarefa || item.acao.responsavel || item.acao.prazo;
    return (
      <Card style={st === 'NC' ? { borderColor: colors.danger } : st === 'OM' ? { borderColor: colors.warning } : undefined}>
        <View style={s.itemTopo}>
          <View style={s.num}><Text style={s.numTxt}>{item.id}</Text></View>
          <Text style={[t.bodyStrong, s.flex]}>{item.titulo}</Text>
        </View>
        <View style={s.pills}>{st ? <StatusPill label={ROTULO[st]} tone={TOM[st]} /> : <StatusPill label="Não avaliado" />}</View>
        <Text style={t.body}>{item.obs || 'Sem observação registrada.'}</Text>
        {item.fotos.length ? <View style={s.fotosLinha}>
          {item.fotos.map(f => links[f] ? <Image key={f} source={{ uri: links[f] }} style={s.thumbImg} accessibilityLabel={`Evidência do item ${item.id}`} /> : <View key={f} style={[s.thumbImg, { backgroundColor: colors.surfaceMuted }]} />)}
        </View> : null}
        {pedeAcao && temAcao ? (
          <View style={s.acaoBox}>
            <Text style={s.acaoLabel}>PLANO DE AÇÃO / TRATATIVA</Text>
            <Text style={t.body}>{item.acao.tarefa || 'A definir'}</Text>
            <Text style={t.caption}>Responsável: {item.acao.responsavel || 'a definir'} · Prazo: {item.acao.prazo ? dataBR(item.acao.prazo) : 'a definir'}</Text>
          </View>
        ) : null}
      </Card>
    );
  }
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

/* ---------- Requisito em acordeão (execução em campo) ---------- */
type AcordeaoProps = ItemProps & { aberto: boolean; onAbrir: (id: number | null) => void };
const ItemAcordeao = memo(function ItemAcordeao({ item, aberto, links, enviando, onAbrir, onMudar, onFoto, onRemoverFoto }: AcordeaoProps) {
  const { colors } = useContext(ThemeContext);
  const t = useMemo(() => createTypography(colors), [colors]);
  const s = useMemo(() => estilos(colors), [colors]);
  const [verCriterio, setVerCriterio] = useState(false);
  /** Muda a cada NC/OB/OM/PP escolhido: remonta o campo de observações já com o foco nele. */
  const [foco, setFoco] = useState(0);
  const st = item.status;
  const pedeAcao = !!st && PEDE_ACAO.includes(st);
  const selo = st ? (
    <View style={[s.selo, { backgroundColor: VIVO[st], borderColor: VIVO[st] }, brilho(st)]}><Text style={[s.seloTxt, { color: '#ffffff' }]}>{st}</Text></View>
  ) : null;

  if (!aberto) {
    return (
      <Pressable accessibilityRole="button" accessibilityLabel={`Item ${item.id}: ${tituloCurto(item.titulo)}${st ? `, ${ROTULO[st]}` : ', pendente'}`}
        onPress={() => onAbrir(item.id)} style={({ pressed }) => [s.fechado, st && brilho(st) ? { borderColor: VIVO[st], borderWidth: 1.5 } : null, pressed && { opacity: 0.8 }]}>
        <View style={s.num}><Text style={s.numTxt}>{item.id}</Text></View>
        <Text style={[t.body, s.flex]} numberOfLines={2}>{tituloCurto(item.titulo)}</Text>
        {selo}
        <CaretDownIcon size={14} color={colors.textFaint} />
      </Pressable>
    );
  }

  /** C e NA: grava e fecha. NC, OB, OM e PP: grava e fica aberto, com o foco nas observações. */
  const escolher = (v: StatusReq) => {
    if (v === st) { onMudar(item.id, { status: '' }, true); return; }
    onMudar(item.id, { status: v }, true);
    if (v === 'C' || v === 'NA') onAbrir(null);
    else setFoco(n => n + 1);
  };
  return (
    <View style={[s.aberto, { borderColor: st && brilho(st) ? VIVO[st] : colors.accent }]}>
      <Pressable accessibilityRole="button" accessibilityLabel="Recolher item" onPress={() => onAbrir(null)} style={s.itemTopo}>
        <View style={s.num}><Text style={s.numTxt}>{item.id}</Text></View>
        <Text style={[t.bodyStrong, s.flex]}>{tituloCurto(item.titulo)}</Text>
        {selo}
        <CaretUpIcon size={16} color={colors.textMuted} />
      </Pressable>

      <Pressable accessibilityRole="button" accessibilityState={{ expanded: verCriterio }} onPress={() => setVerCriterio(v => !v)} style={[s.row, s.alignStart, { gap: 6 }]} hitSlop={6}>
        <InfoIcon size={15} color={colors.accentText} />
        <Text style={[t.caption, { color: colors.accentText, fontWeight: '700' }]}>{verCriterio ? 'Ocultar critério de avaliação' : 'Ver critério de avaliação'}</Text>
      </Pressable>
      {verCriterio ? (
        <View style={s.criterio}>
          <Text style={t.label}>O QUE VERIFICAR</Text>
          <Text style={t.body}>{item.titulo}</Text>
          <Text style={[t.label, { marginTop: 4 }]}>COMO AVALIAR</Text>
          {STATUS.map(x => <Text key={x} style={t.caption}><Text style={{ fontWeight: '800', color: VIVO[x] }}>{x}</Text> · {COMO_AVALIAR[x]}</Text>)}
        </View>
      ) : null}

      <View style={s.botoesStatus}>
        {STATUS.map(x => {
          const on = st === x;
          return (
            <Pressable key={x} accessibilityRole="radio" accessibilityState={{ selected: on }} accessibilityLabel={ROTULO[x]} onPress={() => escolher(x)}
              style={({ pressed }) => [s.botaoStatus, { borderColor: VIVO[x], backgroundColor: on ? VIVO[x] : colors.bg }, on && brilho(x), pressed && { transform: [{ scale: 0.96 }] }]}>
              <Text style={[s.botaoStatusTxt, { color: on ? '#ffffff' : VIVO[x] }]}>{x}</Text>
            </Pressable>
          );
        })}
      </View>
      <Text style={t.caption}>{st ? ROTULO[st] : 'C ou NA gravam e fecham o item. NC, OB, OM e PP pedem a constatação.'}</Text>

      <Field key={`obs-${foco}`} autoFocus={foco > 0} multiline value={item.obs} onChangeText={v => onMudar(item.id, { obs: v })}
        placeholder={st && st !== 'C' && st !== 'NA' ? 'Observações / constatações da auditoria' : 'Observações (opcional)'} style={{ minHeight: 64 }} />
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
      {st ? <Button title="Concluir item" icon={CheckIcon} onPress={() => onAbrir(null)} /> : null}
    </View>
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
      const pdf = await pdfBase64(html);
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
  brandMark: { width: 34, height: 34, borderRadius: 10, backgroundColor: '#0f1f3d', alignItems: 'center', justifyContent: 'center' },
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
  linha: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.md, paddingVertical: 10, backgroundColor: c.surface, borderLeftWidth: 1, borderRightWidth: 1, borderColor: c.border },
  linhaPrimeira: { borderTopWidth: 1, borderTopLeftRadius: radius.control, borderTopRightRadius: radius.control },
  linhaUltima: { borderBottomWidth: 1, borderBottomLeftRadius: radius.control, borderBottomRightRadius: radius.control },
  num: { width: 30, height: 30, borderRadius: 9, backgroundColor: c.accentSoft, alignItems: 'center', justifyContent: 'center' },
  numTxt: { color: c.accentText, fontWeight: '800' },
  fotosLinha: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.sm },
  thumb: { width: 64, height: 54 },
  thumbImg: { width: 64, height: 54, borderRadius: 8, borderWidth: 1, borderColor: c.border },
  thumbX: { position: 'absolute', right: -6, top: -6, width: 22, height: 22, borderRadius: 11, backgroundColor: '#182536', alignItems: 'center', justifyContent: 'center' },
  acaoBox: { gap: space.sm, padding: space.md, borderRadius: radius.control, borderWidth: 1, borderColor: '#f3e3b7', backgroundColor: c.surfaceMuted },
  acaoLabel: { fontSize: 11, fontWeight: '800', color: '#c17a13', letterSpacing: 0.5 },
  // Execução em campo: barra fixa, pílulas e acordeão
  fixo: { gap: 6, paddingHorizontal: space.md, paddingTop: 6, paddingBottom: 10, backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border },
  fixoFilial: { flex: 1, fontSize: 17, fontWeight: '800', color: c.text, letterSpacing: -0.2 },
  progTrilho: { height: 6, borderRadius: 3, backgroundColor: c.neutralSoft, overflow: 'hidden' },
  progBarra: { position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: 3, backgroundColor: c.mint },
  coletando: { fontSize: 12.5, fontWeight: '700', color: c.accentText },
  pilulas: { gap: 6, paddingRight: space.md },
  pilula: { borderWidth: 1, borderColor: c.border, backgroundColor: c.surface, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 7 },
  pilulaTxt: { fontSize: 13, fontWeight: '700' },
  fechado: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.md, paddingVertical: 10, borderRadius: radius.control, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface },
  aberto: { gap: space.sm, padding: space.md, borderRadius: radius.card, borderWidth: 1.5, backgroundColor: c.surface },
  selo: { minWidth: 38, paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill, borderWidth: 1.5, alignItems: 'center' },
  seloTxt: { fontSize: 12.5, fontWeight: '900', letterSpacing: 0.3 },
  criterio: { gap: 4, padding: space.md, borderRadius: radius.control, backgroundColor: c.surfaceMuted, borderWidth: 1, borderColor: c.border },
  botoesStatus: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  botaoStatus: { flexGrow: 1, minWidth: 48, minHeight: 44, borderRadius: radius.control, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  botaoStatusTxt: { fontSize: 15, fontWeight: '800' },
});
