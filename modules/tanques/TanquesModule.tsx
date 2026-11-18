import { useRouter } from 'expo-router';
import { useContext, useEffect, useMemo, useState } from 'react';
import { BackHandler, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useUsuarioLogado } from '../../lib/auth';
import type { Combustivel } from '../../lib/combustiveis';
import { esc, imprimirHtml, rotuloFilial } from '../../lib/util';
import {
  ArrowLeftIcon, CaretDownIcon, CheckIcon, CloudCheckIcon, CloudSlashIcon, HourglassIcon, MagnifyingGlassIcon, PencilSimpleIcon, PlusIcon, PrinterIcon, ResetIcon, RulerIcon, StorefrontIcon, TrashIcon, XIcon,
} from '../../ui/icons';
import { Button, Card, confirmAction, EmptyState, Field, IconButton, ListRow, notify, SectionHeader, Sheet, StatusPill } from '../../ui/kit';
import { createTypography, pageMaxWidth, radius, space, ThemeContext, type ThemeColors } from '../../ui/theme';
import { dataBR, fmtL, fmtSinal, lerNumero, type LinhaTanque, type Medicao, resumo, type ValoresCombustivel, valoresPorCombustivel } from './model';
import { Deslizavel } from '../tempos/Deslizavel';
import { MedicaoInterativa } from './MedicaoInterativa';
import { alturaMaxima, litrosPelaTabela, type TabelaArqueacao, tabelaDoTanque, useTabelas, vincularTanque } from './arqueacao';
import { TabelasArqueacao } from './TabelasArqueacao';
import { CadastroTanques } from './CadastroTanques';
import { garantirTanque, type TanqueFilial, useTanquesFilial } from './cadastro';
import { aplicarCroqui, linhaVazia, medicoesCol, novaMedicao, type TanqueCroqui, useTanques, useTanquesDoCroqui } from './store';

type Tela = { n: 'filiais' } | { n: 'filial'; id: string } | { n: 'medicao'; id: string };
const AZUL = '#0f1f3d'; // azul-marinho da marca (topo e relatório)

export default function TanquesModule() {
  const router = useRouter();
  const { colors } = useContext(ThemeContext);
  const t = useMemo(() => createTypography(colors), [colors]);
  const s = useMemo(() => estilos(colors), [colors]);
  const dados = useTanques();
  const [pilha, setPilha] = useState<Tela[]>([{ n: 'filiais' }]);
  const tela = pilha[pilha.length - 1];
  const ir = (x: Tela) => setPilha(p => [...p, x]);
  const voltar = () => { if (pilha.length > 1) setPilha(p => p.slice(0, -1)); else if (router.canGoBack()) router.back(); else router.replace('/'); };
  useEffect(() => { void medicoesCol.sync(); }, []);
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => { if (pilha.length > 1) { setPilha(p => p.slice(0, -1)); return true; } return false; });
    return () => sub.remove();
  }, [pilha.length]);

  const nomeComb = (id: string) => dados.combustiveis.find(c => c.id === id)?.nome ?? (id || '—');
  const corComb = (id: string) => dados.combustiveis.find(c => c.id === id)?.cor ?? colors.textFaint;

  const corpo = () => {
    if (tela.n === 'medicao') {
      const m = dados.medicoes.find(x => x.id === tela.id);
      return m ? <MedicaoTela m={m} filialNome={rotuloDe(dados.filiais, m.filial_id)} combustiveis={dados.combustiveis} nomeComb={nomeComb} corComb={corComb} voltar={voltar} anteriores={dados.medicoes} /> : <EmptyState icon={RulerIcon} title="Medição não encontrada" text="Ela pode ter sido excluída em outro aparelho." />;
    }
    if (tela.n === 'filial') return <FilialTela filialId={tela.id} dados={dados} abrir={id => ir({ n: 'medicao', id })} />;
    return <FiliaisTela dados={dados} abrir={id => ir({ n: 'filial', id })} />;
  };

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <View style={s.header}>
        <IconButton icon={ArrowLeftIcon} label={pilha.length > 1 ? 'Voltar' : 'Voltar aos módulos'} onPress={voltar} />
        <View style={s.brandMark}><RulerIcon size={18} color="#5fd39a" weight="bold" /></View>
        <View style={s.flex}><Text style={s.brandName}>Medição de Tanques</Text><Text style={t.caption}>Conferência do estoque de combustível</Text></View>
        {dados.status === 'error' ? <StatusPill icon={CloudSlashIcon} label="Sem sincronizar" tone="warning" /> : <StatusPill icon={CloudCheckIcon} label="Sincronizado" tone="success" />}
      </View>
      <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
        {dados.loaded ? corpo() : <Text style={t.caption}>Carregando…</Text>}
      </ScrollView>
    </SafeAreaView>
  );
}

const rotuloDe = (filiais: { id: string; codigo: string; nome: string; cidade: string; uf: string }[], id: string) => {
  const f = filiais.find(x => x.id === id);
  return f ? rotuloFilial(f as Parameters<typeof rotuloFilial>[0]) : 'Filial removida';
};
type Dados = ReturnType<typeof useTanques>;

/* ---------------- Filiais ---------------- */
function FiliaisTela({ dados, abrir }: { dados: Dados; abrir: (id: string) => void }) {
  const { colors } = useContext(ThemeContext);
  const t = useMemo(() => createTypography(colors), [colors]);
  const [busca, setBusca] = useState('');
  const lista = useMemo(() => {
    const q = busca.trim().toLowerCase();
    const ult = (id: string) => dados.medicoes.find(m => m.filial_id === id)?.data ?? '';
    return dados.filiais.filter(f => !q || `${f.codigo} ${f.nome} ${f.cidade}`.toLowerCase().includes(q))
      .sort((a, b) => ult(b.id).localeCompare(ult(a.id)) || String(a.codigo).localeCompare(String(b.codigo), 'pt-BR', { numeric: true }));
  }, [dados.filiais, dados.medicoes, busca]);
  if (!dados.filiais.length) return <EmptyState icon={StorefrontIcon} title="Nenhuma filial cadastrada" text="As medições pertencem a uma filial do cadastro único." />;
  return <>
    <SectionHeader title="Filiais" />
    <Field icon={MagnifyingGlassIcon} value={busca} onChangeText={setBusca} placeholder="Buscar filial por código, nome ou cidade" />
    <Card style={{ padding: space.xs, gap: 0 }}>
      {lista.map((f, i) => {
        const ult = dados.medicoes.find(m => m.filial_id === f.id);
        const res = ult ? resumo(ult).geral.resultado : null;
        const emAndamento = dados.medicoes.some(m => m.filial_id === f.id && m.status === 'rascunho');
        return (
          <ListRow key={f.id} style={i > 0 && { borderTopWidth: 1, borderTopColor: colors.border, borderRadius: 0 }} icon={StorefrontIcon} tint={ult ? 'sky' : 'slate'}
            title={`${f.codigo} · ${f.nome}`}
            subtitle={ult ? `Última medição ${dataBR(ult.data)}${ult.status === 'rascunho' ? ' (em andamento)' : ''} · ${ult.responsavel_nome || '—'}` : 'Sem medições'}
            right={emAndamento ? <StatusPill icon={HourglassIcon} label="Em andamento" tone="warning" />
              : res !== null && ult?.status === 'finalizada' ? <StatusPill label={`${fmtSinal(res)} L`} tone={res < 0 ? 'danger' : res > 0 ? 'warning' : 'success'} /> : undefined}
            onPress={() => abrir(f.id)} />
        );
      })}
      {!lista.length ? <Text style={[t.caption, { padding: 12 }]}>Nenhuma filial encontrada.</Text> : null}
    </Card>
  </>;
}

/* ---------------- Filial: medições ---------------- */
function FilialTela({ filialId, dados, abrir }: { filialId: string; dados: Dados; abrir: (id: string) => void }) {
  const { colors } = useContext(ThemeContext);
  const t = useMemo(() => createTypography(colors), [colors]);
  const usuario = useUsuarioLogado();
  const filial = dados.filiais.find(f => f.id === filialId);
  const medicoes = dados.medicoes.filter(m => m.filial_id === filialId);
  const aberta = medicoes.find(m => m.status === 'rascunho');
  const croqui = useTanquesDoCroqui(filialId);
  const cadastro = useTanquesFilial(filialId);
  const tabelas = useTabelas(filialId);
  if (!filial) return <EmptyState icon={StorefrontIcon} title="Filial não encontrada" />;
  // Tanques da nova medição: os cadastrados; sem cadastro, os do croqui; sem croqui, os da última medição.
  const base = tanquesBase(cadastro, croqui);
  const ultimos: TanqueCroqui[] = medicoes.find(m => m.tanques.length)?.tanques.filter(l => l.tanque.trim()).map(l => ({ tanque: l.tanque.trim(), combustivel: l.combustivel })) ?? [];
  const nova = () => {
    if (aberta) { notify('Medição em andamento', `Já existe uma medição em andamento de ${dataBR(aberta.data)}. Termine ou exclua antes de abrir outra.`); abrir(aberta.id); return; }
    abrir(novaMedicao(filialId, usuario, dados.medicoes, base));
  };
  return <>
    <Text style={t.title}>{filial.codigo} · {filial.nome}</Text>
    <Text style={t.captionBg}>{[filial.cidade, filial.uf].filter(Boolean).join(' / ')}</Text>
    <Button title={aberta ? 'Continuar medição em andamento' : 'Nova medição'} icon={aberta ? RulerIcon : PlusIcon} onPress={nova} />
    <Text style={t.caption}>{cadastro.length
      ? `A nova medição já vem com os tanques cadastrados (${base.map(x => x.tanque).join(', ')}), com combustível, tabela de medição e a informada da última medição.`
      : croqui.length
        ? `Sem tanques cadastrados: a nova medição vem com os tanques do croqui (${croqui.map(x => x.tanque).join(', ')}). Cadastre os tanques abaixo para tê-los sempre prontos.`
        : 'Sem tanques cadastrados: a nova medição vem com os tanques da última medição. Cadastre os tanques abaixo para tê-los sempre prontos.'}</Text>
    <SectionHeader title={`Medições (${medicoes.length})`} />
    {medicoes.length ? (
      <View style={{ gap: space.sm }}>
        {medicoes.map(m => {
          const g = resumo(m).geral;
          const fin = m.status === 'finalizada';
          // Arrastar: direita edita (ou reabre a finalizada); esquerda exclui.
          return (
            <Deslizavel key={m.id} raio={radius.card} direita={fin ? { rotulo: 'Reabrir', cor: '#15803d', icone: ResetIcon } : { rotulo: 'Editar', cor: '#1d4ed8', icone: PencilSimpleIcon }}
              esquerda={{ rotulo: 'Excluir', cor: '#c0262d', icone: TrashIcon }}
              onDireita={() => {
                if (!fin) { abrir(m.id); return; }
                if (aberta && aberta.id !== m.id) { notify('Medição em andamento', `Termine ou exclua a medição de ${dataBR(aberta.data)} antes de reabrir outra.`); return; }
                confirmAction('Reabrir medição?', 'A medição volta a aceitar alterações.', 'Reabrir', () => { medicoesCol.put({ ...m, status: 'rascunho' }); abrir(m.id); });
              }}
              onEsquerda={() => confirmAction('Excluir medição?', `Medição de ${dataBR(m.data)}. Sai do histórico em todos os aparelhos. Não dá para desfazer.`, 'Excluir', () => medicoesCol.remove(m.id))}>
              <Card style={{ padding: space.xs, gap: 0 }}>
                <ListRow icon={RulerIcon} tint={fin ? 'sky' : 'amber'}
                  title={`${dataBR(m.data)} · ${m.tanques.length} tanque${m.tanques.length === 1 ? '' : 's'}`}
                  subtitle={`${fin ? 'Finalizada' : 'Em andamento'} · ${m.responsavel_nome || '—'}`}
                  right={fin ? <StatusPill label={`${fmtSinal(g.resultado)} L`} tone={g.resultado < 0 ? 'danger' : g.resultado > 0 ? 'warning' : 'success'} /> : <StatusPill icon={HourglassIcon} label="Em andamento" tone="warning" />}
                  onPress={() => abrir(m.id)} />
              </Card>
            </Deslizavel>
          );
        })}
        <Text style={t.captionBg}>Arraste uma medição: para a direita edita (ou reabre a finalizada); para a esquerda exclui.</Text>
      </View>
    ) : <EmptyState icon={RulerIcon} title="Nenhuma medição nesta filial" text="Toque em Nova medição para conferir os tanques." />}
    <CadastroTanques filialId={filialId} cadastro={cadastro} tabelas={tabelas} sugestao={croqui.length ? croqui : ultimos}
      origemSugestao={croqui.length ? 'do croqui' : 'da última medição'} combustiveis={dados.combustiveis} nomeComb={nomeCombDe(dados)} corComb={corCombDe(dados, colors.textFaint)} />
    <TabelasArqueacao filialId={filialId} filialCodigo={String(filial.codigo)} filialNome={`${filial.codigo} · ${filial.nome}`}
      tanquesConhecidos={cadastro.length ? base.map(x => x.tanque) : [...new Set([...croqui.map(x => x.tanque), ...ultimos.map(x => x.tanque)])]}
      combustiveis={dados.combustiveis} />
  </>;
}

/* ---------------- Medição ---------------- */
function NumeroCampo({ label, valor, onChange, editavel, emColuna = false }: { label: string; valor: number | null; onChange: (v: number | null) => void; editavel: boolean; emColuna?: boolean }) {
  const [texto, setTexto] = useState(valor === null ? '' : String(valor).replace('.', ','));
  // Acompanha o valor gravado por outra tela (ex.: medição interativa), sem atrapalhar o que está sendo digitado.
  useEffect(() => { if (lerNumero(texto) !== valor) setTexto(valor === null ? '' : String(valor).replace('.', ',')); }, [valor]); // eslint-disable-line react-hooks/exhaustive-deps
  return <Field label={label} value={texto} editable={editavel} keyboardType="decimal-pad" placeholder="0" style={emColuna ? undefined : { flexGrow: 1, flexBasis: 130 }}
    onChangeText={v => { setTexto(v); const n = lerNumero(v); if (n !== null || !v.trim()) onChange(n); }} />;
}

function MedicaoTela({ m, filialNome, combustiveis, nomeComb, corComb, voltar, anteriores }: {
  m: Medicao; filialNome: string; combustiveis: Combustivel[]; nomeComb: (id: string) => string; corComb: (id: string) => string; voltar: () => void; anteriores: Medicao[];
}) {
  const croqui = useTanquesDoCroqui(m.filial_id);
  const cadastro = useTanquesFilial(m.filial_id);
  const base = tanquesBase(cadastro, croqui);
  const { colors } = useContext(ThemeContext);
  const t = useMemo(() => createTypography(colors), [colors]);
  const usuario = useUsuarioLogado();
  const [combDe, setCombDe] = useState<string | null>(null);
  const [tabelaDe, setTabelaDe] = useState<string | null>(null);
  const tabelas = useTabelas(m.filial_id);
  const fin = m.status === 'finalizada';
  const r = resumo(m);
  const salvar = (patch: Partial<Medicao>) => medicoesCol.put({ ...m, ...patch });
  // Centímetros → litros sempre em dia (tela normal e interativa): tanque com tabela e metragem sem litros, ou com
  // litros da tabela desatualizados (tabela ligada depois, trocada ou corrigida), recalcula sozinho. Litros digitados ficam.
  useEffect(() => {
    if (fin) return;
    let mudou = false;
    const tanques = m.tanques.map(l => {
      const tab = tabelaDoTanque(tabelas, l.tanque);
      if (!tab || l.metragem === null || !(l.litros === null || l.litrosTabela)) return l;
      const litros = litrosPelaTabela(tab, l.metragem);
      if (l.litros === litros && l.litrosTabela === tab.nome) return l;
      mudou = true;
      return { ...l, litros, litrosTabela: tab.nome };
    });
    if (mudou) { const atual = medicoesCol.get(m.id) ?? m; medicoesCol.put({ ...atual, tanques }); }
  }, [m.tanques, tabelas, fin]); // eslint-disable-line react-hooks/exhaustive-deps
  const mudarLinha = (id: string, p: Partial<LinhaTanque>) => salvar({ tanques: m.tanques.map(l => (l.id === id ? { ...l, ...p } : l)) });
  /** Mesma gravação, partindo da medição mais recente (a tela interativa grava altura e litros em seguida). */
  const mudarLinhaAtual = (id: string, p: Partial<LinhaTanque>) => {
    const atual = medicoesCol.get(m.id) ?? m;
    medicoesCol.put({ ...atual, tanques: atual.tanques.map(l => (l.id === id ? { ...l, ...p } : l)) });
  };
  const [interativa, setInterativa] = useState(false);
  /** Altura medida: com tabela de arqueação, os litros saem da tabela; sem tabela, só grava a altura. */
  const mudarMetragem = (l: LinhaTanque, cm: number | null) => mudarLinha(l.id, comTabela(l, cm, tabelaDoTanque(tabelas, l.tanque)));
  /** Troca a tabela do tanque e recalcula os litros pela altura já medida. */
  const escolherTabela = (l: LinhaTanque, tab: TabelaArqueacao | null) => {
    vincularTanque(tabelas, l.tanque, tab?.id ?? null);
    // O tanque passa a fazer parte do cadastro da filial (próximas medições já vêm com ele e com a tabela).
    garantirTanque(cadastro, m.filial_id, l.tanque, l.combustivel);
    if (tab && l.metragem !== null) mudarLinha(l.id, comTabela(l, l.metragem, tab));
    else if (!tab && l.litrosTabela) mudarLinha(l.id, { litrosTabela: undefined });
  };
  /** Venda e recebimento são do combustível (unificados), não do tanque. */
  const mudarCombustivel = (c: string, p: Partial<ValoresCombustivel>) => salvar({ combustiveis: valoresPorCombustivel(m).map(v => (v.combustivel === c ? { ...v, ...p } : v)) });
  const tom = (v: number) => (v < 0 ? colors.danger : v > 0 ? colors.warning : colors.success);

  const finalizar = () => {
    if (!m.tanques.length) { notify('Sem tanques', 'Adicione ao menos um tanque.'); return; }
    const tanquesIncompletos = m.tanques.filter(l => !l.tanque.trim() || !l.combustivel || l.litros === null || l.informada === null);
    if (tanquesIncompletos.length) { notify('Tanques incompletos', `Preencha tanque, combustível, litros e informada em: ${tanquesIncompletos.map(l => `tanque ${l.tanque || '?'}`).join(', ')}.`); return; }
    const semValores = r.porCombustivel.filter(x => x.venda === null || x.recebimento === null);
    if (semValores.length) { notify('Falta venda ou recebimento', `Informe a venda e o recebimento (0 se não houve) de: ${semValores.map(x => nomeComb(x.combustivel)).join(', ')}.`); return; }
    confirmAction('Finalizar medição?', `Resultado geral: ${fmtSinal(r.geral.resultado)} L (${r.geral.resultado < 0 ? 'falta' : r.geral.resultado > 0 ? 'sobra' : 'sem diferença'}). A medição fica registrada em seu nome (${usuario}).`, 'Finalizar',
      () => salvar({ status: 'finalizada', medido_em: new Date().toISOString(), responsavel_nome: usuario, combustiveis: valoresPorCombustivel(m) }));
  };
  const excluir = () => confirmAction('Excluir medição?', 'A medição sai do histórico em todos os aparelhos. Não dá para desfazer.', 'Excluir', () => { medicoesCol.remove(m.id); voltar(); });

  return <>
    <Text style={t.title}>{filialNome}</Text>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
      <StatusPill label={fin ? 'Finalizada' : 'Em andamento'} tone={fin ? 'success' : 'warning'} />
      <StatusPill label={`Responsável: ${m.responsavel_nome || usuario || '—'}`} />
      {m.medido_em ? <StatusPill label={new Date(m.medido_em).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })} /> : null}
    </View>
    {!fin ? <Field label="Data da medição (AAAA-MM-DD)" value={m.data} onChangeText={v => salvar({ data: v })} /> : null}

    {/* 1. Tanques: o que se mede em cada um */}
    <SectionHeader title={`Tanques (${m.tanques.length})`} />
    {m.tanques.map(l => (
      <Card key={l.id} style={{ borderLeftWidth: 4, borderLeftColor: corComb(l.combustivel) }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: space.sm }}>
          <Field label="Tanque" value={l.tanque} editable={!fin} onChangeText={v => mudarLinha(l.id, { tanque: v })} style={{ width: 90 }} />
          <Pressable accessibilityRole="button" disabled={fin} onPress={() => setCombDe(l.id)}
            style={{ flex: 1, minHeight: 46, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.control, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.surface }}>
            <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: corComb(l.combustivel) }} />
            <Text style={[t.bodyStrong, { flex: 1 }]} numberOfLines={1}>{l.combustivel ? nomeComb(l.combustivel) : 'Combustível'}</Text>
            {!fin ? <CaretDownIcon size={14} color={colors.textMuted} /> : null}
          </Pressable>
          {!fin ? <IconButton icon={XIcon} tone="danger" label="Remover tanque" onPress={() => confirmAction('Remover tanque?', `O tanque ${l.tanque || ''} sai desta medição.`, 'Remover', () => salvar({ tanques: m.tanques.filter(x => x.id !== l.id) }))} /> : null}
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
          {(() => {
            const tab = tabelaDoTanque(tabelas, l.tanque);
            const max = tab ? alturaMaxima(tab) : null;
            const acima = max !== null && l.metragem !== null && l.metragem > max;
            return (
              <View style={{ flexGrow: 1, flexBasis: 130, gap: 2 }}>
                <NumeroCampo emColuna label="Metragem (cm)" valor={l.metragem} editavel={!fin} onChange={v => mudarMetragem(l, v)} />
                <Text style={[t.caption, acima && { color: colors.danger, fontWeight: '700' }]}>
                  {acima ? `acima da tabela (máx. ${max} cm): confira` : max !== null ? `régua de 0 a ${max} cm` : 'sem tabela: digite os litros'}
                </Text>
              </View>
            );
          })()}
          <View style={{ flexGrow: 1, flexBasis: 130, gap: 2 }}>
            <NumeroCampo emColuna label="Litros (medido)" valor={l.litros} editavel={!fin} onChange={v => mudarLinha(l.id, { litros: v, litrosTabela: undefined })} />
            <Text style={t.caption}>{l.litrosTabela ? 'pela tabela de arqueação' : l.litros !== null ? 'digitado' : ''}</Text>
          </View>
          <View style={{ flexGrow: 1, flexBasis: 130, gap: 2 }}>
            <NumeroCampo emColuna label="Informada (L)" valor={l.informada} editavel={!fin} onChange={v => mudarLinha(l.id, { informada: v, informadaDe: undefined })} />
            <Text style={t.caption}>{l.informadaDe ? `da medição de ${dataBR(l.informadaDe)}` : 'digitada (sem medição anterior)'}</Text>
          </View>
        </View>
        {(() => {
          const tab = tabelaDoTanque(tabelas, l.tanque);
          return (
            <Pressable accessibilityRole="button" disabled={fin || !l.tanque.trim() || !tabelas.length} onPress={() => setTabelaDe(l.id)}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6, paddingHorizontal: 10, borderRadius: radius.control, borderWidth: 1, borderColor: tab ? colors.accent : colors.border, backgroundColor: tab ? colors.accentSoft : colors.campo, alignSelf: 'flex-start', maxWidth: '100%' }}>
              <RulerIcon size={14} color={tab ? colors.accentText : colors.textMuted} />
              <Text style={[t.caption, { fontWeight: '700', color: tab ? colors.accentText : colors.textMuted, flexShrink: 1 }]} numberOfLines={1}>
                {tab ? `Tabela: ${tab.nome}` : tabelas.length ? 'Sem tabela de arqueação (escolher)' : 'Sem tabela de arqueação: importe pelo painel web'}
              </Text>
              {!fin && tabelas.length ? <CaretDownIcon size={12} color={tab ? colors.accentText : colors.textMuted} /> : null}
            </Pressable>
          );
        })()}
      </Card>
    ))}
    {!fin && m.tanques.length ? <Button title="Medição interativa (régua no tanque)" icon={RulerIcon} onPress={() => setInterativa(true)} /> : null}
    {interativa ? <MedicaoInterativa tanques={m.tanques} filial={filialNome} nomeComb={nomeComb} corComb={corComb} tabelaDe={tq => tabelaDoTanque(tabelas, tq)} onMudar={mudarLinhaAtual} onFechar={() => setInterativa(false)} /> : null}
    {!fin ? <Button title="Adicionar tanque" icon={PlusIcon} variant="secondary" onPress={() => salvar({ tanques: [...m.tanques, linhaVazia(String(m.tanques.length + 1))] })} /> : null}
    {!fin && base.length > 0 && !confereComCroqui(m.tanques, base) ? (() => {
      const origem = cadastro.length ? 'cadastrados' : 'do croqui';
      return (
        <Button title={`Usar os tanques ${origem} (${base.length})`} icon={ResetIcon} variant="secondary"
          onPress={() => confirmAction(`Usar os tanques ${origem}?`, `${base.map(x => `Tanque ${x.tanque}${x.combustivel ? ` · ${nomeComb(x.combustivel)}` : ''}`).join('\n')}\n\nTanques que já estão na medição mantêm o que foi digitado; os que não estão na lista saem.`, 'Usar', () => aplicarCroqui(m, base, anteriores))} />
      );
    })() : null}

    {/* 2. Conferência por combustível: a venda e o recebimento são unificados */}
    <SectionHeader title="Conferência por combustível" />
    <Text style={t.caption}>A venda é unificada por combustível (todas as bombas dele) — por isso a conta é por combustível, somando os tanques.</Text>
    {r.porCombustivel.map(x => (
      <Card key={x.combustivel} style={{ borderLeftWidth: 4, borderLeftColor: corComb(x.combustivel) }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: corComb(x.combustivel) }} />
          <Text style={[t.section, { flex: 1 }]}>{nomeComb(x.combustivel)}</Text>
          <Text style={t.caption}>Tanque{x.tanques.length === 1 ? '' : 's'} {x.tanques.join(', ')}</Text>
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
          <NumeroCampo key={`v-${x.combustivel}`} label="Venda do combustível (L)" valor={x.venda} editavel={!fin} onChange={v => mudarCombustivel(x.combustivel, { venda: v })} />
          <NumeroCampo key={`r-${x.combustivel}`} label="Recebimento (L)" valor={x.recebimento} editavel={!fin} onChange={v => mudarCombustivel(x.combustivel, { recebimento: v })} />
        </View>
        <Text style={t.body}>Litros medidos {fmtL(x.litros)} + venda {fmtL(x.venda)} = total <Text style={{ fontWeight: '800' }}>{fmtL(x.total)} L</Text></Text>
        <Text style={t.body}>Informada {fmtL(x.informada)} + recebimento {fmtL(x.recebimento)} − total = <Text style={{ fontWeight: '800', color: tom(x.resultado) }}>{fmtSinal(x.resultado)} L</Text>{x.pct !== null ? <Text style={t.caption}> ({fmtSinal(Math.round(x.pct * 100) / 100)}% da venda)</Text> : null}</Text>
      </Card>
    ))}
    {!r.porCombustivel.length ? <Text style={t.caption}>Escolha o combustível dos tanques para fazer a conferência.</Text> : null}

    <SectionHeader title="Resumo" />
    <Card>
      {[...r.porCombustivel, r.geral].map((x, i) => (
        <View key={x.combustivel + i} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6, borderTopWidth: i ? 1 : 0, borderTopColor: colors.border }}>
          {x.combustivel !== 'Total' ? <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: corComb(x.combustivel) }} /> : null}
          <Text style={[x.combustivel === 'Total' ? t.bodyStrong : t.body, { flex: 1 }]}>{x.combustivel === 'Total' ? 'Total geral' : nomeComb(x.combustivel)} · {x.tanques.length} tanque(s)</Text>
          <Text style={[t.bodyStrong, { color: tom(x.resultado) }]}>{fmtSinal(x.resultado)} L{x.pct !== null ? ` (${fmtSinal(Math.round(x.pct * 100) / 100)}%)` : ''}</Text>
        </View>
      ))}
    </Card>
    <Text style={t.caption}>Total = litros medidos + venda. Resultado = informada + recebimento − total: negativo é falta, positivo é sobra. A informada vem dos litros da medição anterior de cada tanque; os litros saem da tabela de arqueação do tanque pela altura medida (ou são digitados, sem tabela).</Text>
    <Field label="Observações" value={m.obs} editable={!fin} multiline onChangeText={v => salvar({ obs: v })} placeholder="Ex.: régua conferida, descarga em andamento…" />

    {fin ? <>
      <Button title="Imprimir / PDF" icon={PrinterIcon} onPress={() => void imprimirHtml(relatorioHtml(m, filialNome, nomeComb), `Medição de tanques ${filialNome}`, true)} />
      <Button title="Reabrir medição" icon={ResetIcon} variant="secondary" onPress={() => confirmAction('Reabrir medição?', 'A medição volta a aceitar alterações.', 'Reabrir', () => salvar({ status: 'rascunho' }))} />
    </> : <Button title="Finalizar medição" icon={CheckIcon} onPress={finalizar} />}
    <Button title="Excluir medição" icon={TrashIcon} variant="danger" size="sm" style={{ alignSelf: 'flex-start' }} onPress={excluir} />

    {tabelaDe ? (() => {
      const l = m.tanques.find(x => x.id === tabelaDe);
      if (!l) return null;
      const atual = tabelaDoTanque(tabelas, l.tanque)?.id ?? null;
      return (
        <Sheet title={`Tabela de arqueação do tanque ${l.tanque}`} onClose={() => setTabelaDe(null)}>
          <Text style={t.caption}>A escolha fica guardada para as próximas medições deste tanque. As tabelas são importadas por PDF no painel web, na tela da filial.</Text>
          {[...tabelas, null].map(tab => {
            const on = atual === (tab?.id ?? null);
            return (
              <Pressable key={tab?.id ?? 'nenhuma'} accessibilityRole="radio" accessibilityState={{ selected: on }}
                onPress={() => { escolherTabela(l, tab); setTabelaDe(null); }}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 46, paddingHorizontal: 8, borderBottomWidth: 1, borderBottomColor: colors.border }}>
                <Text style={[t.body, { flex: 1 }, on && { fontWeight: '800' }]}>{tab ? tab.nome : 'Sem tabela (digitar os litros)'}</Text>
                {tab?.tanques.length ? <Text style={t.caption}>tanque{tab.tanques.length === 1 ? '' : 's'} {tab.tanques.join(', ')}</Text> : null}
                {on ? <CheckIcon size={16} color={colors.accentText} /> : null}
              </Pressable>
            );
          })}
        </Sheet>
      );
    })() : null}

    {combDe ? (
      <Sheet title="Combustível do tanque" onClose={() => setCombDe(null)}>
        {combustiveis.filter(c => c.ativo !== false).map(c => (
          <Pressable key={c.id} accessibilityRole="radio" onPress={() => { mudarLinha(combDe, { combustivel: c.id }); setCombDe(null); }}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 46, paddingHorizontal: 8, borderBottomWidth: 1, borderBottomColor: colors.border }}>
            <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: c.cor }} />
            <Text style={[t.body, { flex: 1 }]}>{c.nome}</Text>
          </Pressable>
        ))}
      </Sheet>
    ) : null}
  </>;
}

/** Altura medida + litros pela tabela de arqueação (sem tabela: só a altura; altura apagada: litros da tabela também). */
function comTabela(l: LinhaTanque, cm: number | null, tab: TabelaArqueacao | undefined): Partial<LinhaTanque> {
  if (!tab) return { metragem: cm };
  if (cm === null) return l.litrosTabela ? { metragem: null, litros: null, litrosTabela: undefined } : { metragem: null };
  return { metragem: cm, litros: litrosPelaTabela(tab, cm), litrosTabela: tab.nome };
}

/** Tanques que a medição usa: os cadastrados na filial (no bi/tripartido, cada compartimento tem número próprio); sem cadastro, os do croqui. */
const tanquesBase = (cadastro: TanqueFilial[], croqui: TanqueCroqui[]): TanqueCroqui[] =>
  (cadastro.length ? cadastro.map(x => ({ tanque: x.numero, combustivel: x.combustivel })) : croqui);
const nomeCombDe = (d: Dados) => (id: string) => d.combustiveis.find(c => c.id === id)?.nome ?? (id || '—');
const corCombDe = (d: Dados, padrao: string) => (id: string) => d.combustiveis.find(c => c.id === id)?.cor ?? padrao;

/** Os tanques da medição são os do croqui (mesmos números e combustíveis)? */
const confereComCroqui = (linhas: LinhaTanque[], croqui: TanqueCroqui[]) =>
  linhas.length === croqui.length && croqui.every(x => linhas.some(l => l.tanque.trim().toLowerCase() === x.tanque.trim().toLowerCase() && (!x.combustivel || l.combustivel === x.combustivel)));

/** Relatório da medição (A4 paisagem): tanques medidos + conferência por combustível (venda unificada) + total geral. */
export function relatorioHtml(m: Medicao, filialNome: string, nomeComb: (id: string) => string) {
  const r = resumo(m);
  const n = (v: number | null) => fmtL(v);
  const cor = (v: number) => (v < 0 ? 'neg' : v > 0 ? 'pos' : '');
  const pc = (v: number | null) => (v === null ? '—' : `${fmtSinal(Math.round(v * 100) / 100)}%`);
  const tanques = m.tanques.map(l => `<tr><td>${esc(l.tanque)}</td><td>${esc(nomeComb(l.combustivel))}</td><td class="n">${n(l.metragem)}</td><td class="n">${n(l.litros)}${l.litros === null ? '' : `<br><span class="peq">${l.litrosTabela ? `tabela ${esc(l.litrosTabela)}` : 'digitado'}</span>`}</td><td class="n">${n(l.informada)}${l.informadaDe ? `<br><span class="peq">medição de ${dataBR(l.informadaDe)}</span>` : ''}</td></tr>`).join('');
  const conferencia = [...r.porCombustivel, r.geral].map(x => `<tr${x.combustivel === 'Total' ? ' class="tot"' : ''}><td>${x.combustivel === 'Total' ? 'Total geral' : esc(nomeComb(x.combustivel))}</td><td>${esc(x.tanques.join(', '))}</td><td class="n">${n(x.litros)}</td><td class="n">${n(x.venda)}</td><td class="n"><b>${n(x.total)}</b></td><td class="n">${n(x.informada)}</td><td class="n">${n(x.recebimento)}</td><td class="n ${cor(x.resultado)}"><b>${fmtSinal(x.resultado)}</b></td><td class="n">${pc(x.pct)}</td></tr>`).join('');
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Medição de tanques · ${esc(filialNome)}</title><style>
@page{size:A4 landscape;margin:10mm}body{font:11px Arial,sans-serif;color:#1b2230;margin:0}h1{font-size:17px;margin:0 0 2px;color:${AZUL}}.sub{color:#5b6475;margin-bottom:8px}
h2{font-size:12.5px;margin:12px 0 4px;color:${AZUL}}table{width:100%;border-collapse:collapse}th{background:${AZUL};color:#fff;text-align:left;padding:4px 5px;font-size:10px}td{border-bottom:1px solid #e3e6ec;padding:3px 5px}
.n{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}.neg{color:#c0262d}.pos{color:#a86400}.tot td{font-weight:700;background:#eef4f6;border-top:2px solid ${AZUL}}
.obs{white-space:pre-wrap;border:1px solid #e3e6ec;border-radius:6px;padding:6px;min-height:24px}.ass{display:flex;gap:40px;margin-top:34px}.ass div{flex:1;border-top:1px solid #1b2230;padding-top:4px;text-align:center}
.nota{color:#5b6475;font-size:10px;margin-top:6px}.peq{color:#5b6475;font-size:9px}</style></head><body>
<h1>Medição de tanques · ${esc(filialNome)}</h1>
<div class="sub">Data ${dataBR(m.data)}${m.medido_em ? ` · finalizada em ${new Date(m.medido_em).toLocaleString('pt-BR')}` : ''} · Responsável: ${esc(m.responsavel_nome || '—')} · Emitido em ${new Date().toLocaleString('pt-BR')}</div>
<h2>Conferência por combustível</h2>
<table><tr><th>Combustível</th><th>Tanques</th><th class="n">Litros medidos</th><th class="n">Venda</th><th class="n">Total</th><th class="n">Informada</th><th class="n">Recebimento</th><th class="n">Resultado final</th><th class="n">% da venda</th></tr>${conferencia}</table>
<p class="nota">A venda é unificada por combustível, por isso a conferência soma os tanques de cada combustível. Total = litros medidos + venda. Resultado final = informada + recebimento − total (negativo = falta; positivo = sobra).</p>
<h2>Tanques medidos</h2>
<table><tr><th>Tanque</th><th>Combustível</th><th class="n">Metragem (cm)</th><th class="n">Litros medidos</th><th class="n">Informada (medição anterior)</th></tr>${tanques}</table>
<p class="nota">Litros calculados pela tabela de arqueação do tanque a partir da metragem (entre dois centímetros, em linha reta) ou digitados. Informada = litros da medição anterior do tanque.</p>
<h2>Observações</h2><div class="obs">${esc(m.obs || '—')}</div>
<div class="ass"><div>Responsável pela medição — ${esc(m.responsavel_nome || '')}</div><div>Gerente da filial</div></div>
</body></html>`;
}

const estilos = (c: ThemeColors) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: c.bg },
  flex: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.lg, paddingVertical: space.md, backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border },
  brandMark: { width: 34, height: 34, borderRadius: 10, backgroundColor: AZUL, alignItems: 'center', justifyContent: 'center' },
  brandName: { fontSize: 15.5, fontWeight: '800', color: c.text },
  content: { padding: space.lg, paddingBottom: space.xxl * 2, gap: space.md, width: '100%', maxWidth: pageMaxWidth(860), alignSelf: 'center' },
});
