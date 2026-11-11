import { useState } from 'react';
import { Text, View } from 'react-native';
import { CalendarBlankIcon, CheckIcon, PlusIcon, StorefrontIcon, TrashIcon } from '../../ui/icons';
import { Button, Card, ChoiceChips, confirmAction, EmptyState, Field, IconButton, notify, Sheet, StatusPill } from '../../ui/kit';
import { FilialPicker, PageHead } from './ColetasTab';
import { dataBR, hoje, num, uid } from './model';
import { type Plano, planoCol, type TmData } from './store';
import { Kpi, useLook } from './ui';

const STATUS: Plano['status'][] = ['Aberto', 'Em andamento', 'Concluído'];
const EXEMPLOS = ['Deslocamentos excessivos', 'Demora no fechamento', 'Espera no recebimento', 'Reposição frequente', 'Retrabalho administrativo', 'Sobrecarga em horários específicos'];
type Form = { problema: string; causa: string; acao: string; filial_id: string; responsavel: string; prazo: string; indicador: string; beneficio: string };
const vazio = (filialId: string): Form => ({ problema: '', causa: '', acao: '', filial_id: filialId, responsavel: '', prazo: '', indicador: '', beneficio: '' });

export function PlanoTab({ data, filialId }: { data: TmData; filialId: string }) {
  const { s, t } = useLook();
  const [form, setForm] = useState<Form | null>(null);
  const [escolher, setEscolher] = useState(false);
  const atrasado = (p: Plano) => p.status !== 'Concluído' && !!p.prazo && p.prazo < hoje();
  const itens = [...data.plano].sort((a, b) => STATUS.indexOf(a.status) - STATUS.indexOf(b.status) || (a.prazo ?? '9').localeCompare(b.prazo ?? '9'));
  const nomeFilial = (id: string | null) => { const f = data.filiais.find(x => x.id === id); return f ? `${f.codigo} · ${f.nome}` : 'Sem filial'; };

  const salvar = () => {
    if (!form) return;
    if (!form.problema.trim()) { notify('Informe o problema ou a oportunidade'); return; }
    if (form.prazo && !/^\d{4}-\d{2}-\d{2}$/.test(form.prazo)) { notify('Prazo inválido', 'Use o formato AAAA-MM-DD.'); return; }
    const b = Number(form.beneficio.replace(',', '.'));
    planoCol.put({ id: uid('pln'), filial_id: form.filial_id || null, problema: form.problema.trim(), causa: form.causa, acao: form.acao, responsavel: form.responsavel, prazo: form.prazo || null, indicador: form.indicador, beneficio_h: Number.isNaN(b) ? 0 : b, status: 'Aberto' });
    setForm(null);
  };
  const set = (k: keyof Form) => (v: string) => form && setForm({ ...form, [k]: v });

  return <>
    <PageHead title="Plano de ação" subtitle={`${itens.length} item(ns)`} action={<Button title="Novo item" icon={PlusIcon} size="sm" onPress={() => setForm(vazio(filialId))} />} />
    <View style={s.kpis}>
      {STATUS.map(st => <Kpi key={st} label={st} value={String(itens.filter(p => p.status === st).length)} />)}
      <Kpi label="Atrasados" value={String(itens.filter(atrasado).length)} />
      <Kpi label="Benefício estimado (h/mês)" value={num(itens.reduce((x, p) => x + (Number(p.beneficio_h) || 0), 0))} />
    </View>

    {itens.length ? itens.map(p => (
      <Card key={p.id}>
        <View style={s.row}>
          <Text style={[t.bodyStrong, s.flex]}>{p.problema}</Text>
          <IconButton icon={TrashIcon} tone="danger" label="Excluir item" onPress={() => confirmAction('Excluir item do plano?', p.problema, 'Excluir', () => planoCol.remove(p.id))} />
        </View>
        {p.acao ? <Text style={t.body}>{p.acao}</Text> : null}
        <Text style={t.caption}>
          {nomeFilial(p.filial_id)}{p.responsavel ? ` · ${p.responsavel}` : ''}{p.causa ? ` · causa: ${p.causa}` : ''}{p.indicador ? ` · indicador: ${p.indicador}` : ''}{Number(p.beneficio_h) ? ` · ${num(Number(p.beneficio_h))} h/mês` : ''}
        </Text>
        <View style={[s.row, { flexWrap: 'wrap' }]}>
          {p.prazo ? <StatusPill icon={CalendarBlankIcon} label={`Prazo ${dataBR(p.prazo)}`} tone={atrasado(p) ? 'danger' : 'neutral'} /> : null}
          {atrasado(p) ? <StatusPill label="Atrasado" tone="danger" /> : null}
        </View>
        <ChoiceChips value={p.status} options={STATUS} toneFor={v => (v === 'Concluído' ? 'success' : v === 'Em andamento' ? 'accent' : 'warning')} onChange={v => planoCol.put({ ...p, status: v as Plano['status'] })} />
      </Card>
    )) : <EmptyState icon={CheckIcon} title="Nenhum item no plano" text="Registre problemas observados, a causa provável e a ação proposta." action={{ label: 'Novo item', icon: PlusIcon, onPress: () => setForm(vazio(filialId)) }} />}
    <Text style={t.caption}>Estime o benefício e valide o resultado após a implantação, conforme a metodologia. Não proponha reduzir tempo à custa de segurança, qualidade ou controles internos.</Text>

    {form && (
      <Sheet title="Novo item do plano" onClose={() => setForm(null)}
        footer={<View style={s.twoCol}><Button title="Cancelar" variant="secondary" style={s.flex} onPress={() => setForm(null)} /><Button title="Adicionar" icon={CheckIcon} style={s.flex} onPress={salvar} /></View>}>
        <Field label="Problema ou oportunidade" value={form.problema} onChangeText={set('problema')} />
        <ChoiceChips value={form.problema} options={EXEMPLOS} onChange={set('problema')} />
        <Field label="Causa provável" helper="Processo, layout, sistema, treinamento ou recursos" value={form.causa} onChangeText={set('causa')} />
        <Field label="Ação proposta" multiline value={form.acao} onChangeText={set('acao')} />
        <View style={s.row}>
          <Text style={[t.label, s.flex]}>Filial: {nomeFilial(form.filial_id)}</Text>
          <Button title="Trocar" icon={StorefrontIcon} variant="secondary" size="sm" onPress={() => setEscolher(true)} />
        </View>
        <View style={s.twoCol}>
          <Field label="Responsável" style={s.flex} value={form.responsavel} onChangeText={set('responsavel')} />
          <Field label="Prazo" style={s.flex} placeholder="AAAA-MM-DD" value={form.prazo} onChangeText={set('prazo')} />
        </View>
        <View style={s.twoCol}>
          <Field label="Indicador de validação" style={s.flex} value={form.indicador} onChangeText={set('indicador')} />
          <Field label="Benefício (h/mês)" style={s.flex} keyboardType="decimal-pad" value={form.beneficio} onChangeText={set('beneficio')} />
        </View>
      </Sheet>
    )}
    {escolher && form && <FilialPicker data={data} atual={form.filial_id} onClose={() => setEscolher(false)} onPick={id => { setForm({ ...form, filial_id: id }); setEscolher(false); }} />}
  </>;
}
