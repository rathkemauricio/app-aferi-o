import { useState } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { dataBR, hojeISO, uid } from '../../lib/util';
import { CheckIcon, ListChecksIcon, MagnifyingGlassIcon, PlusIcon, TrashIcon } from '../../ui/icons';
import { Button, Card, ChoiceChips, confirmAction, EmptyState, Field, notify, Sheet } from '../../ui/kit';
import { space } from '../../ui/theme';
import { type Atividade, CATEGORIAS, COR_CLASSE, pendentes, pendentesDaVisita, riscoDe, type Unidade } from './model';
import { apagarEvidencia, type Arquivo, atividadesCol, type DadosRiscos, enviarEvidencia } from './store';
import { Caixa, EtiquetaClasse, EvidenciaChip, EvidenciaPicker, Etiqueta, Kpis, Marcar, Meta, useEstilos } from './ui';

const FILTROS = ['Todas', 'Com pendências', 'Visita de hoje'];

export default function ProdTab({ d }: { d: DadosRiscos }) {
  const { s, t } = useEstilos();
  const [filtro, setFiltro] = useState('Todas');
  const [busca, setBusca] = useState('');
  const [aberta, setAberta] = useState<string | null>(null);
  const hoje = hojeISO();
  const at = d.atividades;
  const linhas = d.unidades
    .filter(u => u.nome.toLowerCase().includes(busca.toLowerCase()))
    .filter(u => filtro === 'Com pendências' ? pendentes(at, u.id).length > 0 : filtro === 'Visita de hoje' ? u.proxima_visita === hoje : true)
    .map(u => ({ u, pend: pendentes(at, u.id), due: pendentesDaVisita(at, u), regs: at.filter(a => a.unidade_id === u.id) }))
    .sort((a, b) => b.due.length - a.due.length || b.pend.length - a.pend.length || a.u.nome.localeCompare(b.u.nome, 'pt-BR', { numeric: true }));
  const unidade = aberta ? d.unidades.find(u => u.id === aberta) : undefined;

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
            { label: 'Ações pendentes', valor: at.filter(a => a.status === 'Pendente').length, cor: '#d93a3a' },
            { label: 'Pendências da próxima visita', valor: d.unidades.reduce((n, u) => n + pendentesDaVisita(at, u).length, 0), cor: '#7c4dcc' },
            { label: 'Visitas hoje', valor: d.unidades.filter(u => u.proxima_visita === hoje).length },
            { label: 'Concluídas', valor: at.filter(a => a.status === 'Concluído').length, cor: '#16a36a' },
            { label: 'Unidades', valor: d.unidades.length },
          ]} />
          <ChoiceChips value={filtro} options={FILTROS} onChange={setFiltro} />
          <Field icon={MagnifyingGlassIcon} value={busca} onChangeText={setBusca} placeholder="Buscar unidade" />
        </View>}
        ListEmptyComponent={<EmptyState icon={ListChecksIcon} title="Nenhuma unidade encontrada" text="Troque o filtro ou a busca." />}
        renderItem={({ item: { u, pend, due, regs } }) => {
          const r = riscoDe(u);
          return (
            <Pressable accessibilityRole="button" onPress={() => setAberta(u.id)} style={({ pressed }) => [pressed && { opacity: 0.75 }]}>
              <Card>
                <View style={[s.row, { flexWrap: 'wrap' }]}>
                  <Text style={[t.bodyStrong, s.flex]} numberOfLines={1}>{u.nome}</Text>
                  <EtiquetaClasse cl={r.cl} />
                  {u.proxima_visita === hoje ? <Etiqueta texto="Visita hoje" cor="#e0731a" /> : null}
                  {due.length ? <Etiqueta texto={`⚠ ${due.length} pendente(s) nesta visita`} cor="#d93a3a" /> : pend.length ? <Etiqueta texto={`${pend.length} pendente(s)`} cor="#596173" /> : null}
                </View>
                <Meta itens={[
                  { label: 'Próxima visita', valor: dataBR(u.proxima_visita) || 'Não definida' },
                  { label: 'Última produtividade', valor: dataBR([...regs].sort((a, b) => b.data.localeCompare(a.data))[0]?.data) || 'Nenhuma' },
                  { label: 'Risco total', valor: String(r.tot), cor: COR_CLASSE[r.cl] },
                  { label: 'Registros / em aberto', valor: `${regs.length} / ${pend.length}` },
                ]} />
              </Card>
            </Pressable>
          );
        }}
      />
      {unidade && <ProdSheet u={unidade} atividades={at} onClose={() => setAberta(null)} />}
    </>
  );
}

function ProdSheet({ u, atividades, onClose }: { u: Unidade; atividades: Atividade[]; onClose: () => void }) {
  const { t } = useEstilos();
  const [tarefa, setTarefa] = useState('');
  const [cat, setCat] = useState('Checklist');
  const [obs, setObs] = useState('');
  const [levar, setLevar] = useState(false);
  const [arq, setArq] = useState<Arquivo | null>(null);
  const [salvando, setSalvando] = useState(false);
  const pend = pendentes(atividades, u.id);
  const due = pendentesDaVisita(atividades, u);
  const regs = atividades.filter(a => a.unidade_id === u.id).sort((a, b) => b.data.localeCompare(a.data) || (b.updated_at ?? '').localeCompare(a.updated_at ?? ''));

  const adicionar = async () => {
    if (!tarefa.trim()) { notify('Informe o que precisa ser feito'); return; }
    setSalvando(true);
    try {
      const evidencia = arq ? await enviarEvidencia(u.id, arq) : null;
      atividadesCol.put({ id: uid('rma'), unidade_id: u.id, data: hojeISO(), tarefa: tarefa.trim(), categoria: cat, obs: obs.trim(), status: levar ? 'Pendente' : 'Concluído', levar_proxima: levar, proxima_visita: u.proxima_visita, evidencia, concluido_em: levar ? null : new Date().toISOString() });
      setTarefa(''); setObs(''); setLevar(false); setArq(null);
    } catch (e) { notify('Atividade não salva', e instanceof Error ? e.message : ''); } finally { setSalvando(false); }
  };
  return (
    <Sheet title={u.nome} onClose={onClose}>
      <Text style={t.caption}>Produtividade e checklist da visita · hoje {dataBR(hojeISO())} · próxima visita {dataBR(u.proxima_visita) || 'não definida'}</Text>
      {due.length ? <Caixa cor="#d93a3a"><Text style={[t.bodyStrong, { color: '#d93a3a' }]}>⚠ Plano(s) de ação pendente(s) para esta visita</Text><Text style={t.caption}>{due.length} item(ns) da visita anterior precisam ser verificados antes de encerrar a visita.</Text></Caixa>
        : pend.length ? <Caixa cor="#d99a0b"><Text style={t.caption}><Text style={{ fontWeight: '800' }}>Atenção:</Text> esta unidade possui {pend.length} plano(s) de ação pendente(s). Eles serão mantidos para a próxima visita.</Text></Caixa> : null}
      <Field label="O que precisa ser feito hoje?" value={tarefa} onChangeText={setTarefa} placeholder="Ex.: Conferir contagem de estoque da conveniência" />
      <Text style={t.label}>Categoria</Text>
      <ChoiceChips value={cat} options={CATEGORIAS} onChange={setCat} />
      <Field label="Observação / resultado" multiline value={obs} onChangeText={setObs} placeholder="Registre o que foi encontrado, orientação dada ou resultado da atividade." />
      <EvidenciaPicker arquivo={arq} onChange={setArq} />
      <Marcar valor={levar} onChange={setLevar} texto="Se ficar pendente, carregar como plano de ação para a próxima visita" />
      <Button title={salvando ? 'Salvando…' : 'Adicionar atividade'} icon={PlusIcon} disabled={salvando} onPress={() => void adicionar()} />
      <Text style={[t.section, { marginTop: space.sm }]}>Registros da unidade</Text>
      {regs.length ? regs.map(a => <ItemAtividade key={a.id} a={a} />) : <Text style={t.caption}>Nenhuma atividade registrada para esta unidade.</Text>}
    </Sheet>
  );
}

export function ItemAtividade({ a }: { a: Atividade }) {
  const { s, t, colors } = useEstilos();
  const pend = a.status === 'Pendente';
  return (
    <View style={[s.caixa, { borderColor: pend ? '#d93a3a55' : colors.border, backgroundColor: colors.surface }]}>
      <Text style={t.bodyStrong}>{a.tarefa}</Text>
      <View style={[s.row, { flexWrap: 'wrap' }]}>
        <Etiqueta texto={pend ? 'Pendente' : 'Concluído'} cor={pend ? '#d93a3a' : '#16a36a'} />
        <Etiqueta texto={a.categoria} cor="#596173" />
        <Text style={t.caption}>{dataBR(a.data)}</Text>
      </View>
      {a.obs ? <Text style={t.caption}>{a.obs}</Text> : null}
      {pend && a.proxima_visita ? <Text style={t.caption}><Text style={{ fontWeight: '800' }}>Verificar na próxima visita:</Text> {dataBR(a.proxima_visita)}</Text> : null}
      <EvidenciaChip ev={a.evidencia} />
      <View style={s.wrap}>
        {pend ? <Button title="Marcar concluído" icon={CheckIcon} variant="secondary" size="sm" onPress={() => atividadesCol.put({ ...a, status: 'Concluído', concluido_em: new Date().toISOString() })} /> : null}
        <Button title="Excluir" icon={TrashIcon} variant="danger" size="sm" onPress={() => confirmAction('Excluir este registro?', 'O registro de produtividade será removido.', 'Excluir', () => { atividadesCol.remove(a.id); void apagarEvidencia(a.evidencia); })} />
      </View>
    </View>
  );
}
