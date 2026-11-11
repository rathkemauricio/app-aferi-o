import { useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { shareText } from '../../lib/share';
import { CalendarBlankIcon, ClockCounterClockwiseIcon, FileCsvIcon, ListBulletsIcon, StorefrontIcon, TimerIcon } from '../../ui/icons';
import { Button, Card, EmptyState, Field, ListRow } from '../../ui/kit';
import { csvEtapas } from './calc';
import { FilialPicker, PageHead } from './ColetasTab';
import { dataBR, fmtDur, horaBR } from './model';
import type { ColetasView, TmData } from './store';
import { useLook } from './ui';

export function HistoricoTab({ data, open }: { data: TmData; open: (v: ColetasView) => void }) {
  const { s, t } = useLook();
  const [filialId, setFilialId] = useState('');
  const [de, setDe] = useState('');
  const [ate, setAte] = useState('');
  const [escolher, setEscolher] = useState(false);

  const coletas = useMemo(() => data.coletas.filter(c => (!filialId || c.filial_id === filialId) && (!de || c.data >= de) && (!ate || c.data <= ate)), [data.coletas, filialId, de, ate]);
  const itens = useMemo(() => {
    const porId = new Map(coletas.map(c => [c.id, c]));
    return data.atendimentos.filter(a => porId.has(a.coleta_id)).map(a => ({ c: porId.get(a.coleta_id)!, a }))
      .sort((x, y) => y.c.data.localeCompare(x.c.data) || (y.a.inicio ?? '').localeCompare(x.a.inicio ?? ''));
  }, [coletas, data.atendimentos]);

  const nome = (id: string) => data.atividades.find(a => a.id === id)?.nome ?? 'Atividade removida';
  const filialNome = (id: string) => { const f = data.filiais.find(x => x.id === id); return f ? `${f.codigo} ${f.nome}` : ''; };
  const filial = data.filiais.find(f => f.id === filialId);

  return <>
    <PageHead title="Histórico" subtitle={`${itens.length} registro(s)`}
      action={<Button title="Exportar CSV" icon={FileCsvIcon} variant="secondary" size="sm" disabled={!itens.length}
        onPress={() => void shareText('tempos_e_movimentos.csv', csvEtapas(data, coletas), 'text/csv')} />} />
    <Card>
      <View style={s.row}>
        <Text style={[t.label, s.flex]}>Filial: {filial ? `${filial.codigo} · ${filial.nome}` : 'todas'}</Text>
        <Button title="Trocar" icon={StorefrontIcon} variant="secondary" size="sm" onPress={() => setEscolher(true)} />
      </View>
      <View style={s.twoCol}>
        <Field label="De" icon={CalendarBlankIcon} style={s.flex} value={de} onChangeText={setDe} placeholder="AAAA-MM-DD" />
        <Field label="Até" icon={CalendarBlankIcon} style={s.flex} value={ate} onChangeText={setAte} placeholder="AAAA-MM-DD" />
      </View>
    </Card>

    {itens.length ? <Card style={s.listCard}>{itens.map(({ c, a }, i) => (
      <ListRow key={a.id} style={i > 0 && s.divided}
        icon={a.tipo === 'completo' ? ListBulletsIcon : TimerIcon} tint={a.tipo === 'completo' ? 'indigo' : 'slate'}
        title={a.tipo === 'completo' ? a.etapas.map(e => nome(e.atividade_id)).join(' › ') : nome(a.etapas[0]?.atividade_id ?? '')}
        subtitle={`${dataBR(c.data)}${a.inicio ? ` ${horaBR(a.inicio).slice(0, 5)}` : ''} · ${filialNome(c.filial_id)}, ${c.setor}${a.veiculo ? ` · ${data.veiculos.find(v => v.id === a.veiculo)?.nome ?? ''}` : ''}${a.funcionario ? ` · ${a.funcionario}` : ''}`}
        right={<Text style={s.clockSmall}>{fmtDur(a.duracao_s)}</Text>}
        onPress={() => open({ name: 'atendimento', coletaId: c.id, atendimentoId: a.id })} />
    ))}</Card> : <EmptyState icon={ClockCounterClockwiseIcon} title="Nada encontrado" text="Ajuste os filtros ou registre atendimentos na aba Coletas." />}
    {itens.length ? <Text style={t.caption}>O CSV traz uma linha por etapa: ordem, início, término, duração e pausas em segundos, e o total do atendimento.</Text> : null}
    {escolher && <FilialPicker data={data} atual={filialId} incluirTodas onClose={() => setEscolher(false)} onPick={id => { setFilialId(id); setEscolher(false); }} />}
  </>;
}
