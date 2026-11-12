import { useState } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { dataBR, hojeISO, imprimirHtml, isoValida, uid } from '../../lib/util';
import { CalendarBlankIcon, CheckIcon, ListPlusIcon, MagnifyingGlassIcon, PlusIcon, PrinterIcon, TrashIcon, XIcon } from '../../ui/icons';
import { Button, Card, ChoiceChips, confirmAction, EmptyState, Field, notify, Sheet } from '../../ui/kit';
import { space } from '../../ui/theme';
import { checklistHtml } from './impressos';
import { CATEGORIAS, progressoVisita, riscoDe, statsPlano, type StatusTarefa, type Tarefa, type Unidade, type Visita } from './model';
import { adicionarTarefas, type Arquivo, atividadesCol, type DadosRiscos, enviarEvidencia, visitasCol } from './store';
import { Barra, EtiquetaClasse, EvidenciaChip, EvidenciaPicker, Etiqueta, Kpis, Marcar, Meta, useEstilos } from './ui';

const corPct = (p: number) => (p === 100 ? '#16a36a' : p === 0 ? '#d93a3a' : '#d99a0b');

async function imprimir(html: string, titulo: string) {
  try { await imprimirHtml(html, titulo); } catch (e) { notify('Não foi possível gerar o PDF', e instanceof Error ? e.message : ''); }
}

export default function PlanTab({ d }: { d: DadosRiscos }) {
  const { s, t } = useEstilos();
  const [filtro, setFiltro] = useState('Todas');
  const [busca, setBusca] = useState('');
  const [dia, setDia] = useState(hojeISO());
  const [lote, setLote] = useState(false);
  const [aberta, setAberta] = useState<string | null>(null);
  const vs = d.visitas;
  const tarefas = vs.flatMap(v => v.tarefas);
  const feitas = tarefas.filter(x => x.status === 'Concluída').length;
  const naoFeitas = tarefas.filter(x => x.status === 'Não concluída').length;
  const linhas = d.unidades.filter(u => u.nome.toLowerCase().includes(busca.toLowerCase()))
    .map(u => ({ u, st: statsPlano(vs, u.id), ultima: vs.filter(v => v.unidade_id === u.id).sort((a, b) => b.data.localeCompare(a.data))[0] }))
    .filter(l => filtro !== 'Com pendências' || l.st.pending > 0 || l.st.notDone > 0)
    .sort((a, b) => (b.st.pending + b.st.notDone) - (a.st.pending + a.st.notDone) || b.st.visits - a.st.visits || a.u.nome.localeCompare(b.u.nome, 'pt-BR', { numeric: true }));
  const unidade = aberta ? d.unidades.find(u => u.id === aberta) : undefined;
  const nome = (id: string) => d.unidades.find(u => u.id === id)?.nome ?? 'Unidade removida';

  const imprimirDia = () => {
    if (!isoValida(dia)) { notify('Data inválida', 'Use o formato AAAA-MM-DD.'); return; }
    const doDia = vs.filter(v => v.data === dia).sort((a, b) => nome(a.unidade_id).localeCompare(nome(b.unidade_id), 'pt-BR', { numeric: true }));
    const rows = doDia.flatMap(v => v.tarefas.map(x => ({ unidade: nome(v.unidade_id), titulo: x.titulo, desc: x.desc, obs: x.obs })));
    void imprimir(checklistHtml('Planejamento do Dia — Todas as Filiais', `Data: ${dataBR(dia)} — ${doDia.length} filial(is) com planejamento`, rows, true), 'Planejamento do dia');
  };

  return (
    <>
      <FlatList
        data={linhas}
        keyExtractor={l => l.u.id}
        contentContainerStyle={s.content}
        keyboardShouldPersistTaps="handled"
        ItemSeparatorComponent={() => <View style={{ height: space.sm }} />}
        ListHeaderComponent={<View style={[s.stack, { marginBottom: space.md }]}>
          <Kpis itens={[
            { label: 'Visitas planejadas', valor: vs.length },
            { label: 'Demandas concluídas', valor: feitas, cor: '#16a36a' },
            { label: 'Não concluídas', valor: naoFeitas, cor: '#d93a3a' },
            { label: '% realizado', valor: `${tarefas.length ? Math.round((feitas / tarefas.length) * 100) : 0}%`, cor: '#d99a0b' },
          ]} />
          <Card>
            <Text style={t.label}>Imprimir planejamento do dia</Text>
            <View style={s.twoCol}>
              <Field style={s.flex} icon={CalendarBlankIcon} value={dia} onChangeText={setDia} placeholder="AAAA-MM-DD" />
              <Button title="Imprimir tudo do dia" icon={PrinterIcon} variant="secondary" onPress={imprimirDia} />
            </View>
          </Card>
          <View style={s.pageHead}>
            <Text style={[t.section, s.flex]}>Unidades</Text>
            <Button title="Novo planejamento" icon={ListPlusIcon} size="sm" onPress={() => setLote(true)} />
          </View>
          <ChoiceChips value={filtro} options={['Todas', 'Com pendências']} onChange={setFiltro} />
          <Field icon={MagnifyingGlassIcon} value={busca} onChangeText={setBusca} placeholder="Buscar unidade" />
        </View>}
        ListEmptyComponent={<EmptyState icon={ListPlusIcon} title="Nenhuma unidade encontrada" text="Troque o filtro ou a busca." />}
        renderItem={({ item: { u, st, ultima } }) => (
          <Pressable accessibilityRole="button" onPress={() => setAberta(u.id)} style={({ pressed }) => [pressed && { opacity: 0.75 }]}>
            <Card>
              <View style={[s.row, { flexWrap: 'wrap' }]}>
                <Text style={[t.bodyStrong, s.flex]} numberOfLines={1}>{u.nome}</Text>
                <EtiquetaClasse cl={riscoDe(u).cl} />
                {st.notDone ? <Etiqueta texto={`⚠ ${st.notDone} não concluída(s)`} cor="#d93a3a" /> : st.pending ? <Etiqueta texto={`${st.pending} pendente(s)`} cor="#596173" /> : null}
              </View>
              {st.visits ? (
                <Meta itens={[
                  { label: 'Última visita planejada', valor: dataBR(ultima?.data) },
                  { label: 'Visitas / demandas', valor: `${st.visits} / ${st.total}` },
                  { label: '% realizado', valor: `${st.pct}%`, cor: corPct(st.pct) },
                  { label: 'Concluídas', valor: String(st.done) },
                ]} />
              ) : <Text style={t.caption}>Nenhum planejamento cadastrado ainda para esta unidade.</Text>}
            </Card>
          </Pressable>
        )}
      />
      {lote && <PlanoLote unidades={d.unidades} onClose={() => setLote(false)} />}
      {unidade && <PlanoUnidade u={unidade} visitas={vs.filter(v => v.unidade_id === unidade.id).sort((a, b) => b.data.localeCompare(a.data))} onClose={() => setAberta(null)} />}
    </>
  );
}

/* ---------- Planejamento em lote: várias unidades, várias atividades ---------- */
function PlanoLote({ unidades, onClose }: { unidades: Unidade[]; onClose: () => void }) {
  const { s, t, colors } = useEstilos();
  const [data, setData] = useState(hojeISO());
  const [sel, setSel] = useState<string[]>([]);
  const [ativs, setAtivs] = useState([{ k: 1, titulo: '', desc: '' }]);
  const salvar = () => {
    if (!isoValida(data)) { notify('Informe a data do planejamento', 'Formato AAAA-MM-DD.'); return; }
    if (!sel.length) { notify('Selecione ao menos uma unidade'); return; }
    const preenchidas = ativs.filter(a => a.titulo.trim() || a.desc.trim());
    if (preenchidas.some(a => !a.titulo.trim() || !a.desc.trim())) { notify('Preencha título e descrição de cada atividade'); return; }
    if (!preenchidas.length) { notify('Adicione ao menos uma atividade com título e descrição'); return; }
    sel.forEach(id => adicionarTarefas(id, data, preenchidas.map(a => ({ titulo: a.titulo.trim(), desc: a.desc.trim(), categoria: 'Checklist', obs: '', evidencia: null, levar: true }))));
    notify('Planejamento criado', `Para ${sel.length} unidade(s).`);
    onClose();
  };
  return (
    <Sheet title="Novo planejamento" onClose={onClose}
      footer={<View style={s.twoCol}><Button title="Cancelar" variant="secondary" style={s.flex} onPress={onClose} /><Button title="Salvar planejamento" icon={CheckIcon} style={s.flex} onPress={salvar} /></View>}>
      <Text style={t.caption}>Crie demandas para uma ou mais unidades de uma vez.</Text>
      <Field label="Data do planejamento" helper="Formato AAAA-MM-DD" icon={CalendarBlankIcon} value={data} onChangeText={setData} />
      <View style={s.row}>
        <Text style={[t.label, s.flex]}>Unidades ({sel.length} selecionada(s))</Text>
        <Button title="Todas" variant="ghost" size="sm" onPress={() => setSel(unidades.map(u => u.id))} />
        <Button title="Limpar" variant="ghost" size="sm" onPress={() => setSel([])} />
      </View>
      <View style={s.wrap}>
        {unidades.map(u => {
          const on = sel.includes(u.id);
          return (
            <Pressable key={u.id} accessibilityRole="checkbox" accessibilityState={{ checked: on }} onPress={() => setSel(x => (on ? x.filter(i => i !== u.id) : [...x, u.id]))}
              style={{ paddingVertical: 7, paddingHorizontal: 11, borderRadius: 999, borderWidth: 1, borderColor: on ? colors.accent : colors.borderStrong, backgroundColor: on ? colors.accentSoft : colors.surface }}>
              <Text style={{ fontSize: 12.5, fontWeight: '600', color: on ? colors.accentText : colors.textMuted }}>{u.nome}</Text>
            </Pressable>
          );
        })}
      </View>
      <Text style={t.label}>Atividades</Text>
      {ativs.map((a, i) => (
        <View key={a.k} style={[s.caixa, { borderColor: colors.border, backgroundColor: colors.surfaceMuted }]}>
          <View style={s.row}>
            <Text style={[t.bodyStrong, s.flex]}>Atividade {i + 1}</Text>
            {ativs.length > 1 ? <Pressable accessibilityLabel="Remover atividade" hitSlop={8} onPress={() => setAtivs(x => x.filter(y => y.k !== a.k))}><XIcon size={16} color={colors.textMuted} /></Pressable> : null}
          </View>
          <Field label="Título da atividade" value={a.titulo} onChangeText={v => setAtivs(x => x.map(y => (y.k === a.k ? { ...y, titulo: v } : y)))} placeholder="Ex.: Conferir estoque de conveniência" />
          <Field label="Descrição da atividade" multiline value={a.desc} onChangeText={v => setAtivs(x => x.map(y => (y.k === a.k ? { ...y, desc: v } : y)))} placeholder="Detalhe o que precisa ser verificado ou feito" />
        </View>
      ))}
      <Button title="Adicionar atividade" icon={PlusIcon} variant="secondary" size="sm" style={s.alignStart} onPress={() => setAtivs(x => [...x, { k: Date.now(), titulo: '', desc: '' }])} />
    </Sheet>
  );
}

/* ---------- Planejamento da unidade ---------- */
function PlanoUnidade({ u, visitas, onClose }: { u: Unidade; visitas: Visita[]; onClose: () => void }) {
  const { s, t } = useEstilos();
  const [data, setData] = useState(hojeISO());
  const [titulo, setTitulo] = useState('');
  const [desc, setDesc] = useState('');
  const [cat, setCat] = useState('Checklist');
  const [obs, setObs] = useState('');
  const [levar, setLevar] = useState(true);
  const [arq, setArq] = useState<Arquivo | null>(null);
  const [salvando, setSalvando] = useState(false);

  const adicionar = async () => {
    if (!isoValida(data)) { notify('Informe a data do planejamento', 'Formato AAAA-MM-DD.'); return; }
    if (!titulo.trim() || !desc.trim()) { notify('Preencha o título e a descrição da atividade'); return; }
    setSalvando(true);
    try {
      const evidencia = arq ? await enviarEvidencia(u.id, arq) : null;
      adicionarTarefas(u.id, data, [{ titulo: titulo.trim(), desc: desc.trim(), categoria: cat, obs: obs.trim(), evidencia, levar }]);
      setTitulo(''); setDesc(''); setObs(''); setArq(null);
    } catch (e) { notify('Demanda não salva', e instanceof Error ? e.message : ''); } finally { setSalvando(false); }
  };

  /** Concluída → vira registro de produtividade; Não concluída (com "carregar") → plano de ação para a próxima visita. */
  const mudarStatus = (v: Visita, x: Tarefa, st: StatusTarefa) => {
    const novo: Tarefa = { ...x, status: x.status === st ? 'Pendente' : st };
    const agora = new Date().toISOString();
    if (novo.status === 'Concluída' && !novo.prodLancada) {
      atividadesCol.put({ id: uid('rma'), unidade_id: u.id, data: v.data, tarefa: x.desc || x.titulo, categoria: 'Plano de Ação', obs: `Concluído via Planejamento de ${dataBR(v.data)}`, status: 'Concluído', levar_proxima: false, proxima_visita: null, evidencia: x.evidencia, concluido_em: agora });
      novo.prodLancada = true;
    }
    if (novo.status === 'Não concluída' && novo.levar && !novo.acaoLancada) {
      atividadesCol.put({ id: uid('rma'), unidade_id: u.id, data: v.data, tarefa: x.desc || x.titulo, categoria: 'Plano de Ação', obs: `Não realizado no planejamento de ${dataBR(v.data)}. Virou plano de ação para a próxima auditoria.`, status: 'Pendente', levar_proxima: true, proxima_visita: u.proxima_visita, evidencia: x.evidencia, concluido_em: null });
      novo.acaoLancada = true;
    }
    const atual = visitasCol.get(v.id) ?? v;
    visitasCol.put({ ...atual, tarefas: atual.tarefas.map(y => (y.id === x.id ? novo : y)) });
  };
  const excluir = (v: Visita, x: Tarefa) => confirmAction('Excluir esta demanda?', '', 'Excluir', () => {
    const atual = visitasCol.get(v.id) ?? v;
    const tarefas = atual.tarefas.filter(y => y.id !== x.id);
    if (tarefas.length) visitasCol.put({ ...atual, tarefas }); else visitasCol.remove(v.id);
  });
  const imprimirVisita = (v: Visita) => void imprimir(checklistHtml('Checklist de Auditoria / Planejamento', `Filial: ${u.nome} — Data: ${dataBR(v.data)}`, v.tarefas.map(x => ({ unidade: u.nome, titulo: x.titulo, desc: x.desc, obs: x.obs })), false), 'Checklist da visita');

  return (
    <Sheet title={u.nome} onClose={onClose}>
      <Text style={t.caption}>Planejamento e checklist de visitas · próxima visita {dataBR(u.proxima_visita) || 'não definida'}</Text>
      <Field label="Data da visita" helper="Formato AAAA-MM-DD" icon={CalendarBlankIcon} value={data} onChangeText={setData} />
      <Field label="Título da atividade" value={titulo} onChangeText={setTitulo} placeholder="Ex.: Conferir contagem de estoque da conveniência" />
      <Field label="Descrição da atividade" multiline value={desc} onChangeText={setDesc} placeholder="Detalhe o que precisa ser verificado ou feito" />
      <Text style={t.label}>Categoria</Text>
      <ChoiceChips value={cat} options={CATEGORIAS} onChange={setCat} />
      <Field label="Observação / resultado" multiline value={obs} onChangeText={setObs} placeholder="Registre orientações, contexto ou o resultado após a execução." />
      <EvidenciaPicker arquivo={arq} onChange={setArq} />
      <Marcar valor={levar} onChange={setLevar} texto="Se ficar pendente, carregar como plano de ação para a próxima visita" />
      <Button title={salvando ? 'Salvando…' : 'Adicionar demanda'} icon={PlusIcon} disabled={salvando} onPress={() => void adicionar()} />
      <Text style={[t.section, { marginTop: space.sm }]}>Visitas planejadas</Text>
      {!visitas.length ? <Text style={t.caption}>Nenhuma visita planejada para esta unidade ainda.</Text> : null}
      {visitas.map(v => {
        const pct = progressoVisita(v);
        return (
          <Card key={v.id}>
            <View style={s.row}>
              <Text style={[t.bodyStrong, s.flex]}>{dataBR(v.data)} · {v.tarefas.length} demanda(s)</Text>
              <Button title="Imprimir" icon={PrinterIcon} variant="secondary" size="sm" onPress={() => imprimirVisita(v)} />
            </View>
            <View style={s.row}><Barra pct={pct} cor={corPct(pct)} /><Text style={t.bodyStrong}>{pct}%</Text></View>
            {v.tarefas.map(x => (
              <View key={x.id} style={[s.caixa, { borderColor: x.status === 'Concluída' ? '#16a36a66' : x.status === 'Não concluída' ? '#d93a3a66' : '#d3d7df', backgroundColor: 'transparent' }]}>
                <Text style={t.bodyStrong}>{x.titulo || x.desc}</Text>
                <View style={[s.row, { flexWrap: 'wrap' }]}>
                  <Etiqueta texto={x.status} cor={x.status === 'Concluída' ? '#16a36a' : x.status === 'Não concluída' ? '#d93a3a' : '#596173'} />
                  <Etiqueta texto={x.categoria} cor="#596173" />
                </View>
                {x.titulo && x.desc ? <Text style={t.caption}>{x.desc}</Text> : null}
                {x.obs ? <Text style={t.caption}><Text style={{ fontWeight: '800' }}>Observação:</Text> {x.obs}</Text> : null}
                <EvidenciaChip ev={x.evidencia} />
                <View style={s.wrap}>
                  <Button title="Concluída" icon={CheckIcon} variant={x.status === 'Concluída' ? 'primary' : 'secondary'} size="sm" onPress={() => mudarStatus(v, x, 'Concluída')} />
                  <Button title="Não concluída" icon={XIcon} variant={x.status === 'Não concluída' ? 'danger' : 'secondary'} size="sm" onPress={() => mudarStatus(v, x, 'Não concluída')} />
                  <Button title="Excluir" icon={TrashIcon} variant="ghost" size="sm" onPress={() => excluir(v, x)} />
                </View>
              </View>
            ))}
          </Card>
        );
      })}
    </Sheet>
  );
}
