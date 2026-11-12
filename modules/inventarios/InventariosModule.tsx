import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { useContext, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { Filial } from '../../lib/data';
import { shareText } from '../../lib/share';
import { isSupabaseConfigured } from '../../lib/supabase';
import { dataBR, fmtMoeda, fmtNum, hojeISO, isoValida, rotuloFilial, uid } from '../../lib/util';
import {
  ArchiveIcon, ArrowLeftIcon, CalendarBlankIcon, CheckIcon, CloudCheckIcon, CloudSlashIcon, DeviceMobileIcon, FileCsvIcon, MagnifyingGlassIcon, PlusIcon,
  ResetIcon, StorefrontIcon, TrashIcon,
} from '../../ui/icons';
import { Button, Card, ChoiceChips, confirmAction, EmptyState, Field, IconButton, notify, Sheet, StatusPill } from '../../ui/kit';
import { createTypography, pageMaxWidth, radius, space, ThemeContext, type ThemeColors } from '../../ui/theme';
import { type Categoria, type Inventario, inventariosCol, num, type Unidade, useCategorias, useInventarios } from './store';

const SESSAO = 'nevoeiro.inventarios.sessao.v1';
const ORDENS = ['Mais recente', 'Mais antiga', 'Maior falta R$', 'Menor falta R$'] as const;
type Ordem = (typeof ORDENS)[number];

export default function InventariosModule() {
  const router = useRouter();
  const { colors } = useContext(ThemeContext);
  const t = useMemo(() => createTypography(colors), [colors]);
  const s = useMemo(() => estilos(colors), [colors]);
  const { unidades, todos, filiais, loaded, status } = useInventarios();
  const [sessao, setSessao] = useState<{ unidade: string | null; inv: string | null }>({ unidade: null, inv: null });
  const [pronta, setPronta] = useState(false);

  // Reabre onde o usuário estava.
  useEffect(() => {
    void AsyncStorage.getItem(SESSAO).then(v => { if (v) setSessao(JSON.parse(v)); }).catch(() => undefined).finally(() => setPronta(true));
    void inventariosCol.sync();
  }, []);
  useEffect(() => { if (pronta) void AsyncStorage.setItem(SESSAO, JSON.stringify(sessao)).catch(() => undefined); }, [sessao, pronta]);

  const unidade = sessao.unidade ? unidades.find(u => u.chave === sessao.unidade) ?? null : null;
  const inv = sessao.inv ? todos.find(i => i.id === sessao.inv) ?? null : null;
  const voltar = () => { if (router.canGoBack()) router.back(); else router.replace('/'); };
  const syncPill = !isSupabaseConfigured
    ? <StatusPill icon={DeviceMobileIcon} label="Neste aparelho" />
    : status === 'error' ? <StatusPill icon={CloudSlashIcon} label="Sem sincronizar" tone="warning" /> : <StatusPill icon={CloudCheckIcon} label="Sincronizado" tone="success" />;

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <View style={s.header}>
        <IconButton icon={ArrowLeftIcon} label="Voltar aos módulos" onPress={voltar} />
        <View style={s.brandMark}><ArchiveIcon size={18} color="#fff" weight="bold" /></View>
        <View style={s.flex}>
          <Text style={s.brandName}>Inventários</Text>
          <Text style={t.caption}>Base histórica por unidade</Text>
        </View>
        {syncPill}
      </View>
      {!loaded || !pronta ? <View style={s.carregando}><ActivityIndicator color={colors.accent} /></View>
        : inv && unidade ? <DetalheInventario key={inv.id} inv={inv} unidade={unidade} onVoltar={() => setSessao({ unidade: unidade.chave, inv: null })} />
        : unidade ? <ListaInventarios unidade={unidade} filiais={filiais} todos={todos} onVoltar={() => setSessao({ unidade: null, inv: null })} onAbrir={id => setSessao({ unidade: unidade.chave, inv: id })} />
        : <ListaUnidades unidades={unidades} filiais={filiais} todos={todos} onAbrir={chave => setSessao({ unidade: chave, inv: null })} />}
    </SafeAreaView>
  );
}

/* ---------- Pequenos blocos ---------- */
function Metrica({ label, valor, tom }: { label: string; valor: string; tom?: 'bom' | 'ruim' }) {
  const { colors } = useContext(ThemeContext);
  const s = useMemo(() => estilos(colors), [colors]);
  return (
    <View style={s.metrica}>
      <Text style={s.metricaLabel} numberOfLines={1}>{label}</Text>
      <Text style={[s.metricaValor, tom === 'bom' && { color: colors.success }, tom === 'ruim' && { color: colors.danger }]} numberOfLines={1}>{valor}</Text>
    </View>
  );
}
const tomDe = (v: number) => (v < 0 ? 'ruim' : v > 0 ? 'bom' : undefined);

/* =====================================================================
   Unidades
   ===================================================================== */
function ListaUnidades({ unidades, filiais, todos, onAbrir }: { unidades: Unidade[]; filiais: Filial[]; todos: Inventario[]; onAbrir: (chave: string) => void }) {
  const { colors } = useContext(ThemeContext);
  const t = useMemo(() => createTypography(colors), [colors]);
  const s = useMemo(() => estilos(colors), [colors]);
  const [busca, setBusca] = useState('');
  const [novo, setNovo] = useState(false);
  const q = busca.trim().toLowerCase();
  const lista = unidades.filter(u => !q || `${u.nome} ${u.legado}`.toLowerCase().includes(q));
  const soma = (k: 'sobraR' | 'faltaR') => lista.reduce((a, u) => a + u[k], 0);

  return (
    <>
      <FlatList
        data={lista}
        keyExtractor={u => u.chave}
        contentContainerStyle={s.content}
        keyboardShouldPersistTaps="handled"
        ItemSeparatorComponent={() => <View style={{ height: space.sm }} />}
        ListHeaderComponent={<View style={s.stack}>
          <View style={s.pageHead}>
            <View style={s.flex}>
              <Text style={t.title}>Unidades</Text>
              <Text style={t.caption}>Consulta histórica extraída do sistema legado. Toque numa unidade para ver os inventários.</Text>
            </View>
            <Button title="Novo inventário" icon={PlusIcon} size="sm" onPress={() => setNovo(true)} />
          </View>
          <View style={s.metricas}>
            <Metrica label="Unidades" valor={String(lista.length)} />
            <Metrica label="Inventários" valor={fmtNum(lista.reduce((a, u) => a + u.contagem, 0))} />
            <Metrica label="Sobra em valores" valor={fmtMoeda(soma('sobraR'))} tom="bom" />
            <Metrica label="Falta em valores" valor={fmtMoeda(soma('faltaR'))} tom="ruim" />
          </View>
          <Field icon={MagnifyingGlassIcon} value={busca} onChangeText={setBusca} placeholder="Pesquisar unidade (ex.: NEVOEIRO 01)" />
          <View style={{ height: space.xs }} />
        </View>}
        ListEmptyComponent={unidades.length
          ? <EmptyState icon={MagnifyingGlassIcon} title="Nenhuma unidade encontrada" text="Confira o que foi digitado na busca." />
          : <EmptyState icon={ArchiveIcon} title="Base histórica ainda não carregada" text={isSupabaseConfigured ? 'Os inventários chegam do servidor na primeira sincronização. Verifique a conexão.' : 'A base histórica fica no servidor.'} />}
        renderItem={({ item: u }) => (
          <Pressable accessibilityRole="button" onPress={() => onAbrir(u.chave)} style={({ pressed }) => [pressed && { opacity: 0.75 }]}>
            <Card>
              <View style={s.row}>
                <View style={s.flex}>
                  <Text style={t.bodyStrong} numberOfLines={1}>{u.nome}</Text>
                  <Text style={t.caption} numberOfLines={1}>{u.filial && u.legado ? `${u.legado} · ` : ''}Último inventário: {u.ultimaTxt || '—'}</Text>
                </View>
                <StatusPill label={`${u.contagem} inventário(s)`} />
              </View>
              {u.inativos ? <Text style={[t.caption, { color: colors.danger }]}>{u.inativos} linha(s) inativada(s), fora das somas</Text> : null}
              <View style={s.metricas}>
                <Metrica label="Sobra" valor={fmtMoeda(u.sobraR)} tom="bom" />
                <Metrica label="Falta" valor={fmtMoeda(u.faltaR)} tom="ruim" />
                <Metrica label="Resultado" valor={fmtMoeda(u.resultadoR)} tom={tomDe(u.resultadoR)} />
              </View>
            </Card>
          </Pressable>
        )}
      />
      {novo && <NovoInventario filiais={filiais} todos={todos} onClose={() => setNovo(false)} />}
    </>
  );
}

/* =====================================================================
   Inventários da unidade
   ===================================================================== */
function ListaInventarios({ unidade, filiais, todos, onVoltar, onAbrir }: { unidade: Unidade; filiais: Filial[]; todos: Inventario[]; onVoltar: () => void; onAbrir: (id: string) => void }) {
  const { colors } = useContext(ThemeContext);
  const t = useMemo(() => createTypography(colors), [colors]);
  const s = useMemo(() => estilos(colors), [colors]);
  const [busca, setBusca] = useState('');
  const [de, setDe] = useState('');
  const [ate, setAte] = useState('');
  const [ordem, setOrdem] = useState<Ordem>('Mais recente');
  const [novo, setNovo] = useState(false);
  const q = busca.trim().toLowerCase();
  const lista = unidade.inventarios.filter(r => {
    if (q && !`${r.cau_id} ${r.descricao} ${r.empresa} ${r.agendamento}`.toLowerCase().includes(q)) return false;
    if (isoValida(de) && (!r.data || r.data < de)) return false;
    if (isoValida(ate) && (!r.data || r.data > ate)) return false;
    return true;
  }).sort((a, b) => ordem === 'Mais antiga' ? (a.data ?? '').localeCompare(b.data ?? '')
    : ordem === 'Maior falta R$' ? num(b.faltas_rs) - num(a.faltas_rs)
    : ordem === 'Menor falta R$' ? num(a.faltas_rs) - num(b.faltas_rs)
    : (b.data ?? '').localeCompare(a.data ?? '') || b.cau_id - a.cau_id);
  const ativos = lista.filter(r => r.ativo);
  const soma = (k: keyof Inventario) => ativos.reduce((a, r) => a + num(r[k]), 0);

  return (
    <>
      <FlatList
        data={lista}
        keyExtractor={r => r.id}
        contentContainerStyle={s.content}
        keyboardShouldPersistTaps="handled"
        initialNumToRender={10}
        ItemSeparatorComponent={() => <View style={{ height: space.sm }} />}
        ListHeaderComponent={<View style={s.stack}>
          <Button title="Unidades" icon={ArrowLeftIcon} variant="ghost" size="sm" style={s.alignStart} onPress={onVoltar} />
          <View style={s.pageHead}>
            <View style={s.flex}>
              <Text style={t.title} numberOfLines={1}>{unidade.nome}</Text>
              <Text style={t.caption}>Toque num inventário para ver o resultado por categoria.</Text>
            </View>
            <Button title="Novo" icon={PlusIcon} size="sm" onPress={() => setNovo(true)} />
          </View>
          <View style={s.metricas}>
            <Metrica label="Inventários" valor={fmtNum(lista.length)} />
            <Metrica label="Sobra em valores" valor={fmtMoeda(soma('sobras_rs'))} tom="bom" />
            <Metrica label="Falta em valores" valor={fmtMoeda(soma('faltas_rs'))} tom="ruim" />
            <Metrica label="Sobra de produtos" valor={fmtNum(soma('sobras'))} />
            <Metrica label="Falta de produtos" valor={fmtNum(soma('faltas'))} />
          </View>
          <Card>
            <Field icon={MagnifyingGlassIcon} value={busca} onChangeText={setBusca} placeholder="Código, descrição…" />
            <View style={s.twoCol}>
              <Field style={s.flex} label="Data inicial" icon={CalendarBlankIcon} value={de} onChangeText={setDe} placeholder="AAAA-MM-DD" />
              <Field style={s.flex} label="Data final" icon={CalendarBlankIcon} value={ate} onChangeText={setAte} placeholder="AAAA-MM-DD" />
            </View>
            <ChoiceChips value={ordem} options={[...ORDENS]} onChange={v => setOrdem(v as Ordem)} />
            {busca || de || ate || ordem !== 'Mais recente'
              ? <Button title="Limpar filtros" icon={ResetIcon} variant="ghost" size="sm" style={s.alignStart} onPress={() => { setBusca(''); setDe(''); setAte(''); setOrdem('Mais recente'); }} /> : null}
          </Card>
          <Text style={t.caption}>{lista.length} inventário(s) encontrado(s). Linhas inativas ficam fora das somas.</Text>
        </View>}
        ListEmptyComponent={<EmptyState icon={MagnifyingGlassIcon} title="Nenhum inventário encontrado" text="Troque os filtros." />}
        renderItem={({ item: r }) => (
          <Pressable accessibilityRole="button" onPress={() => onAbrir(r.id)} style={({ pressed }) => [pressed && { opacity: 0.75 }, !r.ativo && { opacity: 0.55 }]}>
            <Card>
              <View style={s.row}>
                <View style={s.flex}>
                  <Text style={t.bodyStrong} numberOfLines={1}>{r.descricao || `Inventário ${r.cau_id}`}</Text>
                  <Text style={t.caption} numberOfLines={1}>{r.agendamento || '—'} · ID {r.cau_id}{r.tin_id ? ` · tipo ${r.tin_id}` : ''}{r.origem === 'manual' ? ' · lançado no app' : ''}</Text>
                </View>
                <AtivoBotao ativo={r.ativo} onPress={() => inventariosCol.put({ ...r, ativo: !r.ativo })} />
              </View>
              <View style={s.metricas}>
                <Metrica label="Estoque sistema" valor={fmtNum(r.sistema)} />
                <Metrica label="Contagem" valor={fmtNum(r.contagem)} />
                <Metrica label="Falta" valor={fmtNum(r.faltas)} />
                <Metrica label="Sobra" valor={fmtNum(r.sobras)} />
                <Metrica label="Resultado" valor={fmtNum(r.resultado)} tom={tomDe(num(r.resultado))} />
              </View>
              <View style={s.metricas}>
                <Metrica label="Falta R$ (custo)" valor={fmtMoeda(r.faltas_rs)} tom={num(r.faltas_rs) ? 'ruim' : undefined} />
                <Metrica label="Sobra R$ (custo)" valor={fmtMoeda(r.sobras_rs)} />
                <Metrica label="Resultado R$" valor={fmtMoeda(r.resultado_rs)} tom={tomDe(num(r.resultado_rs))} />
                <Metrica label="Acurácia" valor={r.acuracia === null ? '—' : `${fmtNum(r.acuracia)}%`} />
                <Metrica label="Eficiência" valor={r.eficiencia === null ? '—' : `${fmtNum(r.eficiencia)}%`} />
              </View>
            </Card>
          </Pressable>
        )}
      />
      {novo && <NovoInventario filiais={filiais} todos={todos} filialPadrao={unidade.filial?.id} onClose={() => setNovo(false)} />}
    </>
  );
}

function AtivoBotao({ ativo, onPress }: { ativo: boolean; onPress: () => void }) {
  const { colors } = useContext(ThemeContext);
  const s = useMemo(() => estilos(colors), [colors]);
  return (
    <Pressable accessibilityRole="switch" accessibilityState={{ checked: ativo }} hitSlop={6} onPress={onPress}
      style={[s.ativo, { backgroundColor: ativo ? colors.successSoft : colors.dangerSoft }]}>
      <Text style={[s.ativoTxt, { color: ativo ? colors.success : colors.danger }]}>{ativo ? '✓ Ativo' : '✕ Inativo'}</Text>
    </Pressable>
  );
}

/* =====================================================================
   Detalhe: resultado por categoria
   ===================================================================== */
function DetalheInventario({ inv, unidade, onVoltar }: { inv: Inventario; unidade: Unidade; onVoltar: () => void }) {
  const { colors } = useContext(ThemeContext);
  const t = useMemo(() => createTypography(colors), [colors]);
  const s = useMemo(() => estilos(colors), [colors]);
  const { lista, erro, carregando, recarregar, gravar } = useCategorias(inv.cau_id);
  const [nova, setNova] = useState(false);
  const cats = lista ?? [];
  const ativas = cats.filter(c => c.ativo);
  const soma = (k: keyof Categoria) => ativas.reduce((a, r) => a + num(r[k]), 0);

  const alternar = async (c: Categoria) => {
    try { await gravar({ ...c, ativo: !c.ativo }); } catch (e) { notify('Não foi possível alterar', e instanceof Error ? e.message : ''); }
  };
  const exportar = () => {
    if (!cats.length) return;
    const cols: [string, (c: Categoria) => unknown][] = [
      ['Inventário', () => inv.descricao], ['Empresa', c => c.empresa], ['Data', () => inv.agendamento], ['Categoria', c => c.classe],
      ['Estoque sistema', c => c.sistema], ['Contagem', c => c.contagem], ['Falta', c => c.faltas], ['Sobra', c => c.sobras], ['Resultado', c => c.resultado],
      ['Falta R$ (custo)', c => c.faltas_rs], ['Sobra R$ (custo)', c => c.sobras_rs], ['Resultado R$ (custo)', c => c.resultado_rs],
      ['Falta R$ (venda)', c => c.faltas_venda_rs], ['Sobra R$ (venda)', c => c.sobras_venda_rs], ['Resultado R$ (venda)', c => c.resultado_venda_rs],
      ['Acurácia', c => c.acuracia], ['Eficiência', c => c.eficiencia], ['Status', c => (c.ativo ? 'Ativo' : 'Inativo')],
    ];
    const cel = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const csv = [cols.map(c => cel(c[0])).join(';'), ...cats.map(c => cols.map(([, f]) => cel(typeof f(c) === 'number' ? String(f(c)).replace('.', ',') : f(c))).join(';'))].join('\n');
    void shareText(`inventario_${inv.cau_id}_categorias.csv`, csv, 'text/csv;charset=utf-8');
  };
  const excluir = () => confirmAction('Excluir inventário?', 'Este inventário foi lançado no app e será removido. Os dados históricos não são afetados.', 'Excluir', () => { inventariosCol.remove(inv.id); onVoltar(); });

  return (
    <>
      <FlatList
        data={cats}
        keyExtractor={c => c.id}
        contentContainerStyle={s.content}
        ItemSeparatorComponent={() => <View style={{ height: space.sm }} />}
        ListHeaderComponent={<View style={s.stack}>
          <Button title="Inventários" icon={ArrowLeftIcon} variant="ghost" size="sm" style={s.alignStart} onPress={onVoltar} />
          <View>
            <Text style={t.title}>{inv.descricao || `Inventário ${inv.cau_id}`}</Text>
            <Text style={t.caption}>Empresa: {inv.empresa || unidade.nome}  •  Data: {inv.agendamento || '—'}  •  ID: {inv.cau_id}</Text>
          </View>
          <View style={s.twoCol}>
            <Button title="Adicionar categoria" icon={PlusIcon} variant="secondary" size="sm" style={s.flex} disabled={!isSupabaseConfigured} onPress={() => setNova(true)} />
            <Button title="Exportar CSV" icon={FileCsvIcon} size="sm" style={s.flex} disabled={!cats.length} onPress={exportar} />
          </View>
          <View style={s.metricas}>
            <Metrica label="Sobra em valores" valor={fmtMoeda(soma('sobras_rs'))} tom="bom" />
            <Metrica label="Falta em valores" valor={fmtMoeda(soma('faltas_rs'))} tom="ruim" />
            <Metrica label="Sobra de produtos" valor={fmtNum(soma('sobras'))} />
            <Metrica label="Falta de produtos" valor={fmtNum(soma('faltas'))} />
            <Metrica label="Resultado das categorias" valor={fmtNum(soma('resultado'))} tom={tomDe(soma('resultado'))} />
          </View>
          <Text style={t.caption}>{cats.length ? `${cats.length} categoria(s).${cats.length - ativas.length ? ` ${cats.length - ativas.length} inativada(s), fora das somas.` : ''} Resultado = soma da coluna Resultado das categorias ativas.` : ''}</Text>
        </View>}
        ListEmptyComponent={carregando || lista === null && !erro
          ? <View style={s.carregando}><ActivityIndicator color={colors.accent} /></View>
          : erro ? <EmptyState icon={CloudSlashIcon} title="Não foi possível carregar as categorias" text={erro} action={{ label: 'Tentar de novo', icon: ResetIcon, onPress: () => void recarregar() }} />
          : <EmptyState icon={ArchiveIcon} title="Nenhuma categoria cadastrada" text="Este inventário ainda não tem resultado por categoria." />}
        ListFooterComponent={inv.origem === 'manual' ? <Button title="Excluir inventário" icon={TrashIcon} variant="danger" size="sm" style={[s.alignStart, { marginTop: space.lg }]} onPress={excluir} /> : undefined}
        renderItem={({ item: c }) => (
          <Card style={!c.ativo ? { opacity: 0.55 } : undefined}>
            <View style={s.row}>
              <Text style={[t.bodyStrong, s.flex]}>{c.classe.trim() || 'Sem categoria'}</Text>
              <AtivoBotao ativo={c.ativo} onPress={() => void alternar(c)} />
            </View>
            <View style={s.metricas}>
              <Metrica label="Estoque sistema" valor={fmtNum(c.sistema)} />
              <Metrica label="Contagem" valor={fmtNum(c.contagem)} />
              <Metrica label="Falta" valor={fmtNum(c.faltas)} />
              <Metrica label="Sobra" valor={fmtNum(c.sobras)} />
              <Metrica label="Resultado" valor={fmtNum(c.resultado)} tom={tomDe(num(c.resultado))} />
            </View>
            <View style={s.metricas}>
              <Metrica label="Falta R$ (custo)" valor={fmtMoeda(c.faltas_rs)} />
              <Metrica label="Sobra R$ (custo)" valor={fmtMoeda(c.sobras_rs)} />
              <Metrica label="Resultado R$" valor={fmtMoeda(c.resultado_rs)} tom={tomDe(num(c.resultado_rs))} />
              <Metrica label="Acurácia" valor={c.acuracia === null ? '—' : `${fmtNum(c.acuracia)}%`} />
              <Metrica label="Eficiência" valor={c.eficiencia === null ? '—' : `${fmtNum(c.eficiencia)}%`} />
            </View>
            {c.faltas_venda_rs !== null || c.sobras_venda_rs !== null ? (
              <View style={s.metricas}>
                <Metrica label="Falta R$ (venda)" valor={fmtMoeda(c.faltas_venda_rs)} />
                <Metrica label="Sobra R$ (venda)" valor={fmtMoeda(c.sobras_venda_rs)} />
                <Metrica label="Resultado R$ (venda)" valor={fmtMoeda(c.resultado_venda_rs)} tom={tomDe(num(c.resultado_venda_rs))} />
              </View>
            ) : null}
          </Card>
        )}
      />
      {nova && <NovaCategoria inv={inv} onClose={() => setNova(false)} onSalvar={gravar} />}
    </>
  );
}

/* ---------- Formulários ---------- */
/** Aceita "1234,56", "1.234,56" e "1234.56". */
const lerNum = (v: string) => { const x = String(v).trim(); const n = Number(x.includes(',') ? x.replace(/\./g, '').replace(',', '.') : x); return Number.isFinite(n) ? n : 0; };
function CampoNum({ label, value, onChange, style }: { label: string; value: string; onChange: (v: string) => void; style?: object }) {
  return <Field style={[{ flexGrow: 1, flexBasis: 140 }, style]} label={label} value={value} onChangeText={onChange} keyboardType="decimal-pad" estavel />;
}

function NovoInventario({ filiais, todos, filialPadrao, onClose }: { filiais: Filial[]; todos: Inventario[]; filialPadrao?: string; onClose: () => void }) {
  const { colors } = useContext(ThemeContext);
  const t = useMemo(() => createTypography(colors), [colors]);
  const s = useMemo(() => estilos(colors), [colors]);
  const proximo = useMemo(() => todos.reduce((m, r) => Math.max(m, r.cau_id), 0) + 1, [todos]);
  const [v, setV] = useState({ id: String(proximo), desc: '', data: hojeISO(), sistema: '0', contagem: '0', faltas: '0', sobras: '0', faltasR: '0', sobrasR: '0', resultR: '0', acuracia: '0' });
  const [filialId, setFilialId] = useState(filialPadrao ?? '');
  const [busca, setBusca] = useState('');
  const set = (k: keyof typeof v) => (x: string) => setV(o => ({ ...o, [k]: x }));
  const filtradas = filiais.filter(f => `${f.codigo} ${f.nome} ${f.cidade}`.toLowerCase().includes(busca.toLowerCase()));
  const salvar = () => {
    const cau = Number(v.id);
    const f = filiais.find(x => x.id === filialId);
    if (!Number.isInteger(cau) || cau <= 0 || !v.desc.trim() || !f || !isoValida(v.data)) { notify('Preencha os dados', 'Informe ID, descrição, filial e data (AAAA-MM-DD).'); return; }
    if (todos.some(r => r.cau_id === cau)) { notify('ID já existe', 'Já existe um inventário com este ID.'); return; }
    inventariosCol.put({
      id: uid('inv'), cau_id: cau, descricao: v.desc.trim(), tin_id: null, cfi_id: null, empresa: f.nome, filial_id: f.id,
      agendamento: dataBR(v.data), data: v.data, sistema: lerNum(v.sistema), contagem: lerNum(v.contagem), faltas: lerNum(v.faltas), sobras: lerNum(v.sobras),
      resultado: lerNum(v.contagem) - lerNum(v.sistema), faltas_rs: lerNum(v.faltasR), sobras_rs: lerNum(v.sobrasR), resultado_rs: lerNum(v.resultR),
      acuracia: lerNum(v.acuracia), eficiencia: 0, ativo: true, origem: 'manual',
    });
    onClose();
  };
  return (
    <Sheet title="Novo inventário" onClose={onClose}
      footer={<View style={s.twoCol}><Button title="Cancelar" variant="secondary" style={s.flex} onPress={onClose} /><Button title="Salvar" icon={CheckIcon} style={s.flex} onPress={salvar} /></View>}>
      <Text style={t.caption}>O lançamento fica junto da base histórica, que não é alterada.</Text>
      <View style={s.twoCol}>
        <Field style={{ width: 110 }} label="ID" value={v.id} onChangeText={set('id')} keyboardType="number-pad" />
        <Field style={s.flex} label="Descrição" value={v.desc} onChangeText={set('desc')} placeholder="Ex.: Nev 01 - 09/2026" />
      </View>
      <Text style={t.label}>Filial</Text>
      <Field icon={MagnifyingGlassIcon} value={busca} onChangeText={setBusca} placeholder="Código, nome ou cidade" />
      <View style={s.listBox}>
        <ScrollView nestedScrollEnabled>
          {filtradas.map((f, i) => {
            const on = f.id === filialId;
            return (
              <Pressable key={f.id} accessibilityRole="radio" accessibilityState={{ selected: on }} onPress={() => setFilialId(f.id)} style={[s.opcao, i > 0 && s.divided, on && { backgroundColor: colors.accentSoft }]}>
                <StorefrontIcon size={18} color={on ? colors.accentText : colors.textMuted} />
                <Text style={[t.body, s.flex, on && { color: colors.accentText, fontWeight: '700' }]} numberOfLines={1}>{rotuloFilial(f)}</Text>
                {on ? <CheckIcon size={16} color={colors.accentText} weight="bold" /> : null}
              </Pressable>
            );
          })}
          {!filtradas.length && <Text style={[t.caption, { padding: 12 }]}>Nenhuma filial encontrada.</Text>}
        </ScrollView>
      </View>
      <Field label="Data do inventário" helper="Formato AAAA-MM-DD" icon={CalendarBlankIcon} value={v.data} onChangeText={set('data')} />
      <View style={s.wrap}>
        <CampoNum label="Estoque sistema" value={v.sistema} onChange={set('sistema')} />
        <CampoNum label="Contagem" value={v.contagem} onChange={set('contagem')} />
        <CampoNum label="Faltas" value={v.faltas} onChange={set('faltas')} />
        <CampoNum label="Sobras" value={v.sobras} onChange={set('sobras')} />
        <CampoNum label="Falta R$" value={v.faltasR} onChange={set('faltasR')} />
        <CampoNum label="Sobra R$" value={v.sobrasR} onChange={set('sobrasR')} />
        <CampoNum label="Resultado R$" value={v.resultR} onChange={set('resultR')} />
        <CampoNum label="Acurácia %" value={v.acuracia} onChange={set('acuracia')} />
      </View>
    </Sheet>
  );
}

function NovaCategoria({ inv, onClose, onSalvar }: { inv: Inventario; onClose: () => void; onSalvar: (row: Partial<Categoria> & { id: string }) => Promise<void> }) {
  const { colors } = useContext(ThemeContext);
  const t = useMemo(() => createTypography(colors), [colors]);
  const s = useMemo(() => estilos(colors), [colors]);
  const [nome, setNome] = useState('');
  const [v, setV] = useState({ sistema: '0', contagem: '0', sobras: '0', faltas: '0', sobrasR: '0', faltasR: '0', sobrasVenda: '0', faltasVenda: '0', acuracia: '0', eficiencia: '0' });
  const [salvando, setSalvando] = useState(false);
  const set = (k: keyof typeof v) => (x: string) => setV(o => ({ ...o, [k]: x }));
  const salvar = async () => {
    if (!nome.trim()) { notify('Informe o nome da categoria'); return; }
    const n = Object.fromEntries(Object.entries(v).map(([k, x]) => [k, lerNum(x)])) as Record<keyof typeof v, number>;
    setSalvando(true);
    try {
      await onSalvar({
        id: uid('cat'), cau_id: inv.cau_id, empresa: inv.empresa, classe: nome.trim().toUpperCase(),
        sistema: n.sistema, contagem: n.contagem, faltas: n.faltas, sobras: n.sobras, resultado: n.sobras - n.faltas,
        faltas_rs: n.faltasR, sobras_rs: n.sobrasR, resultado_rs: n.sobrasR - n.faltasR,
        faltas_venda_rs: n.faltasVenda, sobras_venda_rs: n.sobrasVenda, resultado_venda_rs: n.sobrasVenda - n.faltasVenda,
        acuracia: n.acuracia, eficiencia: n.eficiencia, ativo: true, origem: 'manual',
      });
      onClose();
    } catch (e) { notify('Categoria não salva', e instanceof Error ? e.message : ''); } finally { setSalvando(false); }
  };
  return (
    <Sheet title="Adicionar categoria" onClose={() => { if (!salvando) onClose(); }}
      footer={<View style={s.twoCol}><Button title="Cancelar" variant="secondary" style={s.flex} onPress={onClose} /><Button title={salvando ? 'Salvando…' : 'Salvar categoria'} icon={CheckIcon} style={s.flex} disabled={salvando} onPress={() => void salvar()} /></View>}>
      <Text style={t.caption}>Inventário: {inv.descricao} — {inv.empresa}. Preencha com o relatório "RN - Resultado do Inventário de Estoque". Os totais em valores são o custo; os valores de venda vêm da soma da coluna "Valor Venda" por produto.</Text>
      <Field label="Nome da categoria" value={nome} onChangeText={setNome} placeholder="Ex.: CIGARROS E TABACARIA" autoCapitalize="characters" />
      <View style={s.wrap}>
        <CampoNum label="Estoque sistema (saldo)" value={v.sistema} onChange={set('sistema')} />
        <CampoNum label="Contagem" value={v.contagem} onChange={set('contagem')} />
        <CampoNum label="Qtde. sobra" value={v.sobras} onChange={set('sobras')} />
        <CampoNum label="Qtde. falta" value={v.faltas} onChange={set('faltas')} />
      </View>
      <Text style={t.label}>Valores de custo ("Totais em valores")</Text>
      <View style={s.wrap}>
        <CampoNum label="Sobra R$ (custo)" value={v.sobrasR} onChange={set('sobrasR')} />
        <CampoNum label="Falta R$ (custo)" value={v.faltasR} onChange={set('faltasR')} />
      </View>
      <Text style={t.label}>Valores de venda</Text>
      <View style={s.wrap}>
        <CampoNum label="Sobra R$ (venda)" value={v.sobrasVenda} onChange={set('sobrasVenda')} />
        <CampoNum label="Falta R$ (venda)" value={v.faltasVenda} onChange={set('faltasVenda')} />
      </View>
      <Text style={t.label}>Indicadores (opcionais)</Text>
      <View style={s.wrap}>
        <CampoNum label="Acurácia %" value={v.acuracia} onChange={set('acuracia')} />
        <CampoNum label="Eficiência %" value={v.eficiencia} onChange={set('eficiencia')} />
      </View>
    </Sheet>
  );
}

/* ---------- Estilos ---------- */
const estilos = (c: ThemeColors) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: c.bg },
  flex: { flex: 1 },
  carregando: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.xxl },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  twoCol: { flexDirection: 'row', gap: space.sm },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  stack: { gap: space.md },
  alignStart: { alignSelf: 'flex-start' },
  header: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.lg, paddingVertical: space.md, backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border },
  brandMark: { width: 34, height: 34, borderRadius: 10, backgroundColor: '#4a5263', alignItems: 'center', justifyContent: 'center' },
  brandName: { fontSize: 15.5, fontWeight: '800', color: c.text },
  content: { padding: space.lg, paddingBottom: space.xxl * 2, width: '100%', maxWidth: pageMaxWidth(1000), alignSelf: 'center' },
  pageHead: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  metricas: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  metrica: { flexGrow: 1, flexBasis: 110, paddingVertical: 8, paddingHorizontal: 10, borderRadius: radius.control, borderWidth: 1, borderColor: c.border, backgroundColor: c.surfaceMuted },
  metricaLabel: { fontSize: 10.5, fontWeight: '700', color: c.textMuted, textTransform: 'uppercase', letterSpacing: 0.3 },
  metricaValor: { fontSize: 14.5, fontWeight: '800', color: c.text, marginTop: 3, fontVariant: ['tabular-nums'] },
  ativo: { paddingVertical: 5, paddingHorizontal: 10, borderRadius: radius.pill },
  ativoTxt: { fontSize: 12, fontWeight: '700' },
  listBox: { borderWidth: 1, borderColor: c.border, borderRadius: radius.control, overflow: 'hidden', maxHeight: 220 },
  opcao: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: 12, minHeight: 44 },
  divided: { borderTopWidth: 1, borderTopColor: c.border },
});
