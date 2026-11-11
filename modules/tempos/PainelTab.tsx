import { useState } from 'react';
import { Text, View } from 'react-native';
import { ChartBarIcon, StorefrontIcon } from '../../ui/icons';
import { Button, Card, ChoiceChips, EmptyState, SectionHeader, StatusPill, type Tone } from '../../ui/kit';
import { type Filtro, indicadores } from './calc';
import { FilialPicker, PageHead } from './ColetasTab';
import { DEMANDAS, fmtMin, num, SETORES } from './model';
import type { TmData } from './store';
import { BarList, Kpi, useLook } from './ui';

const TODAS = 'Todas', TODOS = 'Todos';
const SITUACAO: Record<string, { label: string; tone: Tone }> = {
  amostra: { label: 'Amostra < 10', tone: 'neutral' },
  'sem-ref': { label: 'Sem referência', tone: 'neutral' },
  acima: { label: 'Acima da referência', tone: 'warning' },
  dentro: { label: 'Dentro da referência', tone: 'success' },
};

export function PainelTab({ data }: { data: TmData }) {
  const { s, t } = useLook();
  const [f, setF] = useState<Filtro>({ filialId: '', setor: '', demanda: '' });
  const [escolher, setEscolher] = useState(false);
  const r = indicadores(data, f);
  const filial = data.filiais.find(x => x.id === f.filialId);

  return <>
    <PageHead title="Painel" subtitle={`${r.coletas} coleta(s) no filtro`} />
    <Card>
      <View style={s.row}>
        <Text style={[t.label, s.flex]}>Filial: {filial ? `${filial.codigo} · ${filial.nome}` : 'todas'}</Text>
        <Button title="Trocar" icon={StorefrontIcon} variant="secondary" size="sm" onPress={() => setEscolher(true)} />
      </View>
      <View style={s.group}><Text style={t.label}>Setor</Text>
        <ChoiceChips value={f.setor || TODOS} options={[TODOS, ...SETORES]} onChange={v => setF({ ...f, setor: v === TODOS ? '' : v })} /></View>
      <View style={s.group}><Text style={t.label}>Demanda</Text>
        <ChoiceChips value={f.demanda || TODAS} options={[TODAS, ...DEMANDAS]} onChange={v => setF({ ...f, demanda: v === TODAS ? '' : v })} /></View>
    </Card>

    {!r.etapas ? (
      <EmptyState icon={ChartBarIcon} title="Sem dados para mostrar" text="Os indicadores aparecem depois que houver atendimentos ou atividades finalizados." />
    ) : <>
      <View style={s.kpis}>
        <Kpi label="Atendimentos completos" value={String(r.atendimentos)} />
        <Kpi label="Atividades individuais" value={String(r.isoladas)} />
        <Kpi label="Tempo médio por atendimento (min)" value={fmtMin(r.mediaAtendimentoSeg)} />
        <Kpi label="Etapas cronometradas" value={String(r.etapas)} />
        <Kpi label="Tempo em atividade (min)" value={fmtMin(r.totalSeg)} />
        <Kpi label="Espera (min)" value={fmtMin(r.esperaSeg)} />
        <Kpi label="Interrupções / pausas (min)" value={fmtMin(r.interrupcoesSeg)} />
        <Kpi label="Retrabalho (min)" value={fmtMin(r.retrabalhoSeg)} />
        <Kpi label="Deslocamentos" value={num(r.deslocamentos)} />
        <Kpi label="Ocupação %" value={num(r.ocupacao)} />
        <Kpi label="Volume (litros/itens)" value={num(r.volume)} />
      </View>

      <Card>
        <Text style={t.section}>Tempo médio por atividade (min)</Text>
        <BarList items={r.atividades.slice(0, 10).map(x => [x.nome, x.mediaSeg / 60])} />
      </Card>
      {r.porVeiculo.length ? (
        <Card>
          <Text style={t.section}>Tempo médio por tipo de veículo (min)</Text>
          <BarList items={r.porVeiculo.map(([n, seg, q]) => [`${n} (${q})`, seg / 60])} />
        </Card>
      ) : null}
      <Card>
        <Text style={t.section}>Tempo por classe (min)</Text>
        <BarList items={r.porClasse.map(([c, v]) => [c, v / 60])} />
      </Card>

      <SectionHeader title="Indicadores por atividade" />
      <Card style={s.listCard}>
        {r.atividades.map((x, i) => {
          const sit = SITUACAO[x.situacao];
          return (
            <View key={x.id} style={[{ padding: 12, gap: 6 }, i > 0 && s.divided]}>
              <View style={s.row}>
                <Text style={[t.bodyStrong, s.flex]} numberOfLines={1}>{x.nome}</Text>
                <StatusPill label={sit.label} tone={sit.tone} />
              </View>
              <Text style={[t.caption, s.mono]}>
                {x.ciclos} ciclo(s) · média {fmtMin(x.mediaSeg)} min · total {fmtMin(x.totalSeg)} min
                {x.padraoSeg !== null ? ` · padrão ${fmtMin(x.padraoSeg)} min` : ''}
                {x.ref ? ` · ref. ${num(x.ref)} min` : ''}
              </Text>
            </View>
          );
        })}
      </Card>
      <Text style={t.caption}>
        Tempo padrão = média × fator de ritmo ({num(data.parametros.ritmo)}) × (1 + tolerância {num(data.parametros.tol)}%), calculado só com 10 ou mais ciclos.
        Ocupação = tempo fora de espera ÷ (tempo em atividade + pausas). Não use como medida de desempenho individual; baixa demanda não significa excesso de pessoal.
      </Text>
    </>}
    {escolher && <FilialPicker data={data} atual={f.filialId} incluirTodas onClose={() => setEscolher(false)} onPick={id => { setF({ ...f, filialId: id }); setEscolher(false); }} />}
  </>;
}
