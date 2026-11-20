import { useRouter } from 'expo-router';
import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../lib/auth';
import { supabase } from '../../lib/supabase';
import { ArrowLeftIcon, CaretDownIcon, CaretRightIcon, ListMagnifyingGlassIcon, LockSimpleIcon, MagnifyingGlassIcon } from '../../ui/icons';
import { Button, Card, EmptyState, Field, IconButton, StatusPill } from '../../ui/kit';
import { createTypography, pageMaxWidth, radius, space, ThemeContext } from '../../ui/theme';

/** Uma linha do registro (tabela auditoria_log). */
type Linha = {
  id: number; criado_em: string; empresa_id: string | null; user_id: string | null; usuario_nome: string | null; usuario_email: string | null;
  tabela: string; registro_id: string | null; acao: string; alvo: string | null; filial: string | null;
  mudancas: Record<string, { de?: unknown; para?: unknown }> | Record<string, unknown> | null; origem: string;
};

const POR_PAGINA = 40;
const dataHora = (iso: string) => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });

/** Módulos (grupos de tabelas) para o filtro. */
const MODULOS: { id: string; rotulo: string; tabelas: string[] }[] = [
  { id: 'contagens', rotulo: 'Contagens', tabelas: ['ce_inventarios', 'ce_contagens', 'ce_coletas', 'ce_bases', 'ce_classes', 'funcao:coleta-erp'] },
  { id: 'tanques', rotulo: 'Conferência de estoque', tabelas: ['tq_medicoes', 'tq_tabelas', 'tq_tanques'] },
  { id: 'afericoes', rotulo: 'Aferições', tabelas: ['service_records'] },
  { id: 'auditoria', rotulo: 'Auditoria', tabelas: ['aud_auditorias', 'aud_modelos'] },
  { id: 'inventarios', rotulo: 'Inventários', tabelas: ['inv_inventarios', 'inv_categorias'] },
  { id: 'riscos', rotulo: 'Mapa de risco', tabelas: ['rm_atividades', 'rm_pontuacoes', 'rm_unidades', 'rm_visitas'] },
  { id: 'tempos', rotulo: 'Tempos e movimentos', tabelas: ['tm_analises_ia', 'tm_atendimentos', 'tm_coletas', 'tm_filiais_status', 'tm_plano'] },
  { id: 'agenda', rotulo: 'Agenda', tabelas: ['agenda_eventos'] },
  { id: 'cadastros', rotulo: 'Cadastros', tabelas: ['filiais', 'filial_docs', 'app_config'] },
  { id: 'contas', rotulo: 'Contas e empresas', tabelas: ['profiles', 'empresas', 'planos', 'funcao:usuarios', 'funcao:empresas'] },
  { id: 'acessos', rotulo: 'Acessos e relatórios', tabelas: ['evento'] },
];
const ROTULO_TABELA: Record<string, string> = {
  ce_inventarios: 'inventário', ce_contagens: 'contagem', ce_coletas: 'leitura de contagem', ce_bases: 'base de códigos de barra', ce_classes: 'classe de categoria',
  tq_medicoes: 'medição de tanques', tq_tabelas: 'tabela de arqueação', tq_tanques: 'tanque', service_records: 'aferição', aud_auditorias: 'auditoria', aud_modelos: 'modelo de auditoria',
  inv_inventarios: 'inventário', inv_categorias: 'categoria de inventário', rm_atividades: 'atividade (mapa de risco)', rm_pontuacoes: 'pontuação (mapa de risco)', rm_unidades: 'unidade (mapa de risco)',
  rm_visitas: 'visita (mapa de risco)', tm_analises_ia: 'análise de tempos', tm_atendimentos: 'atendimento', tm_coletas: 'coleta de tempos', tm_filiais_status: 'situação da filial (tempos)',
  tm_plano: 'plano de ação (tempos)', agenda_eventos: 'evento da agenda', filiais: 'filial', filial_docs: 'documento da filial', app_config: 'configuração', profiles: 'conta', empresas: 'empresa', planos: 'plano',
  evento: '', 'funcao:coleta-erp': '', 'funcao:usuarios': '', 'funcao:empresas': '',
};
const ROTULO_CAMPO: Record<string, string> = {
  status: 'situação', nome: 'nome', codigo: 'código', tipo: 'tipo', ativo: 'ativo', papel: 'papel', modulos: 'módulos', email: 'e-mail', filial_id: 'filial', rodadas: 'rodadas', pausada: 'pausada',
  qtd: 'quantidade', categorias: 'categorias', classe: 'classe', limite_contas: 'limite de contas', plano_id: 'plano', encerrado_em: 'encerrado em', enviado_erp_em: 'enviado ao ERP em',
  contagem_leitor: 'conta com leitor', itens_total: 'itens', arquivo: 'arquivo', payload: 'conteúdo', valor: 'valor',
};
const ACOES = ['criou', 'alterou', 'excluiu', 'entrou', 'exportou'] as const;
const PERIODOS: { id: string; rotulo: string; dias: number | null }[] = [{ id: 'hoje', rotulo: 'Hoje', dias: 0 }, { id: '7', rotulo: '7 dias', dias: 7 }, { id: '30', rotulo: '30 dias', dias: 30 }, { id: 'tudo', rotulo: 'Tudo', dias: null }];

function inicioPeriodo(dias: number | null) {
  if (dias === null) return null;
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - dias);
  return d.toISOString();
}
const valor = (v: unknown) => {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'boolean') return v ? 'sim' : 'não';
  if (typeof v === 'object') { const s = JSON.stringify(v); return s.length > 80 ? `${s.slice(0, 80)}…` : s; }
  const s = String(v);
  return /^\d{4}-\d{2}-\d{2}T/.test(s) ? dataHora(s) : s.length > 80 ? `${s.slice(0, 80)}…` : s;
};
const verbo = (l: Linha) => (l.tabela === 'evento' ? l.acao : l.tabela.startsWith('funcao:') ? l.acao : `${l.acao}${ROTULO_TABELA[l.tabela] ? ` ${ROTULO_TABELA[l.tabela]}` : ''}`);
const tomAcao = (a: string) => (/exclu|apag/.test(a) ? 'danger' : /criou|carregou|importou|ligou|enviou|reenviou/.test(a) ? 'success' : /entrou|exportou/.test(a) ? 'neutral' : 'accent') as 'danger' | 'success' | 'neutral' | 'accent';

/** Rastreabilidade (só o dono da plataforma): tudo o que cada conta fez, com filtros e o antes/depois de cada alteração. */
export default function RastroScreen() {
  const router = useRouter();
  const { dono } = useAuth();
  const { colors } = useContext(ThemeContext);
  const t = useMemo(() => createTypography(colors), [colors]);
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [fim, setFim] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState('');
  const [aberta, setAberta] = useState<number | null>(null);
  const [periodo, setPeriodo] = useState('7');
  const [modulo, setModulo] = useState<string>('todos');
  const [acao, setAcao] = useState<string>('todas');
  const [empresa, setEmpresa] = useState<string>('todas');
  const [busca, setBusca] = useState('');
  const [empresas, setEmpresas] = useState<{ id: string; nome: string }[]>([]);
  const [termo, setTermo] = useState('');
  const geracao = useRef(0);

  useEffect(() => { const x = setTimeout(() => setTermo(busca.trim()), 350); return () => clearTimeout(x); }, [busca]);
  useEffect(() => {
    if (!supabase || !dono) return;
    void supabase.from('empresas').select('id,nome').order('nome').then(({ data }) => setEmpresas((data ?? []) as { id: string; nome: string }[]));
  }, [dono]);
  const nomeEmpresa = useCallback((id: string | null) => empresas.find(e => e.id === id)?.nome ?? '', [empresas]);

  const carregar = useCallback(async (reiniciar: boolean) => {
    if (!supabase || !dono) return;
    const g = ++geracao.current;
    setCarregando(true); setErro('');
    const de = reiniciar ? 0 : linhas.length;
    let q = supabase.from('auditoria_log').select('*').order('criado_em', { ascending: false }).order('id', { ascending: false }).range(de, de + POR_PAGINA - 1);
    const ini = inicioPeriodo(PERIODOS.find(p => p.id === periodo)?.dias ?? null);
    if (ini) q = q.gte('criado_em', ini);
    if (empresa !== 'todas') q = q.eq('empresa_id', empresa);
    const m = MODULOS.find(x => x.id === modulo);
    if (m) q = q.in('tabela', m.tabelas);
    if (acao === 'exportou') q = q.like('acao', 'exportou%');
    else if (acao !== 'todas') q = q.eq('acao', acao);
    if (termo) {
      const x = termo.replace(/[%,()*]/g, ' ');
      q = q.or(`usuario_nome.ilike.%${x}%,usuario_email.ilike.%${x}%,alvo.ilike.%${x}%,filial.ilike.%${x}%`);
    }
    const { data, error } = await q;
    if (g !== geracao.current) return; // chegou outro filtro enquanto este carregava
    setCarregando(false);
    if (error) { setErro('Não foi possível carregar o registro. Verifique a conexão.'); return; }
    const novas = (data ?? []) as Linha[];
    setFim(novas.length < POR_PAGINA);
    setLinhas(reiniciar ? novas : [...linhas, ...novas]);
  }, [dono, periodo, empresa, modulo, acao, termo, linhas]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { setAberta(null); void carregar(true); }, [periodo, empresa, modulo, acao, termo, dono]); // eslint-disable-line react-hooks/exhaustive-deps

  const voltar = () => (router.canGoBack() ? router.back() : router.replace('/'));
  const chip = (rotulo: string, on: boolean, onPress: () => void) => (
    <Pressable key={rotulo} accessibilityRole="radio" accessibilityState={{ selected: on }} onPress={onPress}
      style={({ pressed }) => [{ minHeight: 34, paddingHorizontal: 12, borderRadius: radius.pill, borderWidth: 1, justifyContent: 'center', borderColor: on ? colors.accent : colors.borderStrong, backgroundColor: on ? colors.accentSoft : colors.surface }, pressed && { opacity: 0.7 }]}>
      <Text style={{ fontSize: 13, fontWeight: '700', color: on ? colors.accentText : colors.textMuted }}>{rotulo}</Text>
    </Pressable>
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.lg, paddingVertical: space.md, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border }}>
        <IconButton icon={ArrowLeftIcon} label="Voltar" onPress={voltar} />
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 15.5, fontWeight: '800', color: colors.text }}>Rastreabilidade</Text>
          <Text style={t.caption}>O que cada conta fez no sistema</Text>
        </View>
      </View>
      {!dono ? <EmptyState icon={LockSimpleIcon} title="Acesso restrito" text="Só o dono do EasyAudit vê o registro de atividades." /> : (
        <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.md, width: '100%', maxWidth: pageMaxWidth(900), alignSelf: 'center', paddingBottom: 56 }} keyboardShouldPersistTaps="handled"
          refreshControl={<RefreshControl refreshing={false} onRefresh={() => void carregar(true)} />}>
          <Field icon={MagnifyingGlassIcon} value={busca} onChangeText={setBusca} placeholder="Buscar por pessoa, e-mail, filial ou item (código, nome)" autoCapitalize="none" />
          <Text style={t.label}>Período</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>{PERIODOS.map(p => chip(p.rotulo, periodo === p.id, () => setPeriodo(p.id)))}</View>
          {empresas.length > 1 ? <>
            <Text style={t.label}>Empresa</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
              {chip('Todas', empresa === 'todas', () => setEmpresa('todas'))}
              {empresas.map(e => chip(e.nome, empresa === e.id, () => setEmpresa(e.id)))}
            </ScrollView>
          </> : null}
          <Text style={t.label}>Módulo</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {chip('Todos', modulo === 'todos', () => setModulo('todos'))}
            {MODULOS.map(m => chip(m.rotulo, modulo === m.id, () => setModulo(m.id)))}
          </View>
          <Text style={t.label}>Ação</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {chip('Todas', acao === 'todas', () => setAcao('todas'))}
            {ACOES.map(a => chip(a === 'exportou' ? 'Exportou' : a[0].toUpperCase() + a.slice(1), acao === a, () => setAcao(a)))}
          </View>

          {erro ? <EmptyState icon={ListMagnifyingGlassIcon} title="Sem conexão" text={erro} action={{ label: 'Tentar de novo', onPress: () => void carregar(true) }} /> : null}
          {!erro && !carregando && !linhas.length ? <EmptyState icon={ListMagnifyingGlassIcon} title="Nada neste filtro" text="Nenhuma atividade registrada com os filtros escolhidos. Tente um período maior." /> : null}

          {linhas.map(l => {
            const quem = l.usuario_nome || l.usuario_email || (l.origem === 'servidor' ? 'Sistema' : 'Desconhecido');
            const muda = l.mudancas && typeof l.mudancas === 'object' ? Object.entries(l.mudancas) : [];
            const temDetalhe = muda.length > 0;
            const emp = nomeEmpresa(l.empresa_id);
            const abertaAqui = aberta === l.id;
            return (
              <Card key={l.id} style={{ gap: 6, paddingVertical: space.sm }}>
                <Pressable accessibilityRole={temDetalhe ? 'button' : undefined} disabled={!temDetalhe} onPress={() => setAberta(abertaAqui ? null : l.id)} style={{ gap: 4 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
                    <Text style={[t.bodyStrong, { flex: 1 }]} numberOfLines={2}>{quem}</Text>
                    <StatusPill label={verbo(l)} tone={tomAcao(l.acao)} />
                    {temDetalhe ? (abertaAqui ? <CaretDownIcon size={16} color={colors.textMuted} /> : <CaretRightIcon size={16} color={colors.textMuted} />) : null}
                  </View>
                  {l.alvo ? <Text style={t.body} numberOfLines={2}>{l.alvo}</Text> : null}
                  <Text style={t.caption} numberOfLines={2}>
                    {dataHora(l.criado_em)}{l.filial ? ` · ${l.filial}` : ''}{emp && empresas.length > 1 ? ` · ${emp}` : ''}{l.usuario_email && l.usuario_nome && l.usuario_nome !== l.usuario_email ? ` · ${l.usuario_email}` : ''}{l.origem === 'servidor' && l.user_id ? ' · pelo servidor' : ''}
                  </Text>
                </Pressable>
                {abertaAqui && temDetalhe ? (
                  <View style={{ gap: 4, paddingTop: 6, borderTopWidth: 1, borderTopColor: colors.border }}>
                    {muda.map(([campo, v]) => {
                      const mv = v as { de?: unknown; para?: unknown };
                      const dePara = typeof v === 'object' && v !== null && ('de' in mv || 'para' in mv);
                      return (
                        <Text key={campo} style={t.caption}>
                          <Text style={{ fontWeight: '800', color: colors.text }}>{ROTULO_CAMPO[campo] ?? campo}: </Text>
                          {dePara ? <>{valor(mv.de)} <Text style={{ color: colors.accentText }}>→</Text> <Text style={{ fontWeight: '700', color: colors.text }}>{valor(mv.para)}</Text></> : valor(v)}
                        </Text>
                      );
                    })}
                  </View>
                ) : null}
              </Card>
            );
          })}

          {carregando ? <ActivityIndicator color={colors.textMuted} style={{ marginVertical: space.md }} /> : null}
          {!carregando && linhas.length && !fim ? <Button title="Carregar mais" variant="secondary" onPress={() => void carregar(false)} /> : null}
          {!carregando && linhas.length && fim ? <Text style={[t.caption, { textAlign: 'center' }]}>Fim do registro neste filtro ({linhas.length} atividades).</Text> : null}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
