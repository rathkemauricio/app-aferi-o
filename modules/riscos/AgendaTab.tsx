import { useState } from 'react';
import { FlatList, Text, View } from 'react-native';
import { dataBR, diasAte, isoValida } from '../../lib/util';
import { CalendarBlankIcon, CalendarCheckIcon, MagnifyingGlassIcon, PencilSimpleIcon, ResetIcon } from '../../ui/icons';
import { Button, Card, ChoiceChips, EmptyState, Field } from '../../ui/kit';
import { space } from '../../ui/theme';
import { COR_CLASSE, prioridade, PRIORIDADES, riscoDe, situacaoData, type Unidade } from './model';
import type { DadosRiscos } from './store';
import { UnidadeForm } from './MapaTab';
import { Etiqueta, Kpis, Meta, useEstilos } from './ui';

export const COR_PRIORIDADE: Record<string, string> = { Crítica: '#d93a3a', Alta: '#e0731a', Média: '#d99a0b', Baixa: '#16a36a' };

export default function AgendaTab({ d }: { d: DadosRiscos }) {
  const { s, t } = useEstilos();
  const [busca, setBusca] = useState('');
  const [pri, setPri] = useState('Todas');
  const [de, setDe] = useState('');
  const [ate, setAte] = useState('');
  const [editar, setEditar] = useState<Unidade | null>(null);

  const linhas = d.unidades.map(u => ({ u, p: prioridade(u), dias: diasAte(u.proxima_visita) }))
    .filter(({ u, p }) => {
      if (busca && !u.nome.toLowerCase().includes(busca.toLowerCase())) return false;
      if (pri !== 'Todas' && p.nome !== pri) return false;
      if (isoValida(de) && (!u.ultima_revisao || u.ultima_revisao < de)) return false;
      if (isoValida(ate) && (!u.ultima_revisao || u.ultima_revisao > ate)) return false;
      return true;
    })
    .sort((a, b) => b.p.chave - a.p.chave || (a.dias ?? 999999) - (b.dias ?? 999999) || riscoDe(b.u).tot - riscoDe(a.u).tot);
  const conta = (n: string) => linhas.filter(l => l.p.nome === n).length;

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
            { label: 'Críticas', valor: conta('Crítica'), cor: COR_PRIORIDADE.Crítica },
            { label: 'Altas', valor: conta('Alta'), cor: COR_PRIORIDADE.Alta },
            { label: 'Médias', valor: conta('Média'), cor: COR_PRIORIDADE.Média },
            { label: 'Vencidas', valor: d.unidades.filter(u => (diasAte(u.proxima_visita) ?? 0) < 0).length, cor: '#7c4dcc' },
            { label: 'Na agenda', valor: linhas.length },
          ]} />
          <Card>
            <Field icon={MagnifyingGlassIcon} value={busca} onChangeText={setBusca} placeholder="Filtrar por unidade" />
            <ChoiceChips value={pri} options={['Todas', ...PRIORIDADES]} onChange={setPri} toneFor={o => (o === 'Crítica' ? 'danger' : o === 'Alta' || o === 'Média' ? 'warning' : o === 'Baixa' ? 'success' : 'accent')} />
            <Text style={t.label}>Data da última auditoria</Text>
            <View style={s.twoCol}>
              <Field style={s.flex} icon={CalendarBlankIcon} value={de} onChangeText={setDe} placeholder="de AAAA-MM-DD" />
              <Field style={s.flex} icon={CalendarBlankIcon} value={ate} onChangeText={setAte} placeholder="até AAAA-MM-DD" />
            </View>
            {busca || pri !== 'Todas' || de || ate ? <Button title="Limpar filtros" icon={ResetIcon} variant="ghost" size="sm" style={s.alignStart} onPress={() => { setBusca(''); setPri('Todas'); setDe(''); setAte(''); }} /> : null}
          </Card>
          <Text style={t.caption}>Prioridade automática: risco da unidade e data da próxima visita (vencida, hoje, próximos 15 ou 30 dias).</Text>
          <Text style={t.section}>Visitas a realizar</Text>
        </View>}
        ListEmptyComponent={<EmptyState icon={CalendarCheckIcon} title="Nenhuma visita encontrada" text="Nenhuma unidade com os filtros selecionados." />}
        renderItem={({ item: { u, p, dias }, index }) => {
          const r = riscoDe(u);
          return (
            <Card style={{ borderLeftWidth: 4, borderLeftColor: COR_PRIORIDADE[p.nome] }}>
              <View style={s.row}>
                <Text style={[t.caption, { fontWeight: '800' }]}>#{String(index + 1).padStart(2, '0')}</Text>
                <Text style={[t.bodyStrong, s.flex]} numberOfLines={1}>{u.nome}</Text>
                <Etiqueta texto={p.nome} cor={COR_PRIORIDADE[p.nome]} />
              </View>
              <Text style={t.caption}>{r.fr}</Text>
              <Meta itens={[
                { label: 'Próxima visita', valor: dataBR(u.proxima_visita) || 'Não definida', cor: dias !== null && dias < 0 ? '#d93a3a' : undefined },
                { label: 'Situação', valor: situacaoData(u.proxima_visita), cor: dias !== null && dias < 0 ? '#d93a3a' : undefined },
                { label: 'Última auditoria', valor: dataBR(u.ultima_revisao) || 'Não informada' },
                { label: 'Risco total', valor: String(r.tot), cor: COR_CLASSE[r.cl] },
              ]} />
              <Text style={t.body}><Text style={{ fontWeight: '800' }}>Ação:</Text> {p.acao}</Text>
              <Button title="Editar / registrar revisão" icon={PencilSimpleIcon} variant="secondary" size="sm" style={s.alignStart} onPress={() => setEditar(u)} />
            </Card>
          );
        }}
      />
      {editar && <UnidadeForm unidade={editar} filiais={d.filiais} onClose={() => setEditar(null)} />}
    </>
  );
}
