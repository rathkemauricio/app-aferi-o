import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useAuth } from '../../lib/auth';
import { docId, docsCol, saveConfig, saveFilialDoc, useConfig, useFilialDoc } from '../../lib/data';
import { CaretDownIcon, ChartBarIcon, CheckIcon, PlusIcon, ResetIcon, StorefrontIcon, XIcon } from '../../ui/icons';
import { Button, Card, ChoiceChips, confirmAction, EmptyState, Field, IconButton, Sheet, StatusPill } from '../../ui/kit';
import { mediaObservada } from './calc';
import { FilialPicker } from './ColetasTab';
import { normNome, num, uid } from './model';
import type { TmData } from './store';
import { BarList, Kpi, useLook } from './ui';

// Dimensionamento da equipe (portado do HTML / planilha de referência (modelo 07)).
// Há um dimensionamento PADRÃO da rede (configuração global, editado pelo administrador) que vale para todas as filiais.
// Quando uma filial é alterada, ela passa a ter o seu próprio documento em filial_docs (e pode voltar ao padrão).
type Freq = 'd' | 's' | 'm' | 'h';
/** Faixa de volume em litros: ≤ ou ≥ um valor de 10 a 1000 (passos de 10). */
export type Faixa = { op: '≤' | '≥'; l: number };
type ItemDim = { id: string; b: number; n: string; m: number; t: Freq; v: number; fx?: Faixa };
export type Dimensionamento = { dias: number; quadro: number; bl: { f: number; h: number }[]; it: ItemDim[] };

export const CFG_DIM_PADRAO = 'tm.dimensionamento.padrao';
const BL: [string, number, number][] = [['Abastecimento', 1.5, 220], ['Atendimento e serviços', 1, 220], ['Atividades na pista', 1, 220], ['Liderança', 1, 176]];
const FQ: Record<Freq, string> = { d: 'Diária', s: 'Semanal', m: 'Mensal', h: 'Horas fixas' };

/** Faixas na ordem pedida: ≥ 10, ≤ 10, ≥ 20, ≤ 20 … até 1000 L. */
export const FAIXAS: Faixa[] = Array.from({ length: 100 }, (_, i) => (i + 1) * 10).flatMap(l => [{ op: '≥' as const, l }, { op: '≤' as const, l }]);
export const rotuloFaixa = (f?: Faixa) => (f ? `${f.op} ${f.l} L` : '');
const nomeItem = (i: ItemDim) => (i.fx ? `${i.n} ${rotuloFaixa(i.fx)}` : i.n);

const SEED: [number, string, number, Freq, number, Faixa?][] = [
  [0, 'Abastecimento gasolina/etanol', 1.12, 'm', 6066, { op: '≤', l: 10 }], [0, 'Abastecimento gasolina/etanol', 5.17, 'm', 3075, { op: '≤', l: 20 }], [0, 'Abastecimento gasolina/etanol', 12, 'm', 1602, { op: '≥', l: 20 }],
  [0, 'Abastecimento diesel', 5, 'm', 0, { op: '≤', l: 50 }], [0, 'Abastecimento diesel', 10, 'm', 0, { op: '≤', l: 100 }], [0, 'Abastecimento diesel', 15, 'm', 0, { op: '≤', l: 150 }], [0, 'Abastecimento diesel (ticket médio)', 3.5, 'm', 295],
  [1, 'Calibragem pneu sem estepe', 2.1, 'm', 0], [1, 'Calibragem pneu com estepe', 3.15, 'm', 0], [1, 'Limpeza de para-brisa', 3, 'm', 0], [1, 'Troca de óleo carro', 35, 'm', 0],
  [1, 'Troca de óleo moto', 0, 'm', 0], [1, 'Troca de óleo caminhão', 0, 'm', 0], [1, 'Lubrificação sem truck', 3.45, 'm', 0], [1, 'Varrição caminhão carreta', 21.2, 'm', 0],
  [1, 'Varrição caminhão bi-trem', 45.15, 'm', 0], [1, 'Abordagem', 3, 'm', 0], [1, 'Pagamento', 2, 'm', 0], [1, 'Deslocamento bomba até o caixa', 1, 'm', 0], [1, 'Deslocamento na pista', 1, 'm', 0], [1, 'Trocador', 0, 'h', 176],
  [2, 'Limpeza da pista', 30, 'd', 2], [2, 'Limpeza de canaletas', 40, 'd', 2], [2, 'Limpeza de banheiros', 60, 'd', 4], [2, 'Limpeza de bombas', 20, 'd', 1], [2, 'Limpeza de pátio', 20, 'd', 2],
  [2, 'Limpeza rampa de lubrificação', 45, 'd', 1], [2, 'Limpeza rampa de lavagem', 20, 'd', 1], [2, 'Medição de tanque por tanque', 2, 'd', 1], [2, 'Limpeza de ilhas', 30, 'd', 1],
  [2, 'Limpeza salas/vidros', 90, 's', 2], [2, 'Limpeza bocais TQ por bocal', 5, 's', 1], [2, 'Verificação ordem de frete', 4, 'd', 0],
  [3, 'Acompanhamento medição de tanques', 15, 'd', 1], [3, 'Passar estoque de combustível', 3.22, 'd', 1], [3, 'Conferência das vendas do dia anterior', 12, 'd', 1], [3, 'Passar e-mail à matriz (manhã)', 10, 'd', 1],
  [3, 'Conferência caixas c/ ordem de frete', 100, 'd', 0], [3, 'Conferência caixas s/ ordem de frete', 45, 'd', 1], [3, 'Passar pontos para planilha', 10, 'd', 1], [3, 'Fechar malote para a matriz', 5, 'd', 1],
  [3, 'Conferência de estoque', 80, 'd', 1], [3, 'Reposição de estoque', 10, 'd', 1], [3, 'Baixar consumo próprio', 12, 's', 1], [3, 'Fazer escala de horário', 25, 's', 1], [3, 'Banco e depósitos', 40, 'd', 1],
  [3, 'Drenagem 06 TQ', 18, 'd', 0], [3, 'Drenagem 01 TQ média', 6, 'd', 0], [3, 'Aferição bombas 10 bicos', 81, 'd', 0], [3, 'Troca papel filtro prensa', 30, 'd', 0], [3, 'Limpeza da caixa separadora', 30, 'd', 0],
];
export const modeloDimensionamento = (): Dimensionamento => ({ dias: 28, quadro: 0, bl: BL.map(b => ({ f: b[1], h: b[2] })), it: SEED.map(x => ({ id: uid('dim'), b: x[0], n: x[1], m: x[2], t: x[3], v: x[4], ...(x[5] ? { fx: x[5] } : {}) })) });
const MODELO = modeloDimensionamento(); // ids estáveis enquanto o padrão não for salvo

/** Converte nomes antigos ("Abastecimento ≤ 10 L (gasolina/etanol)", "> 10 e ≤ 20 L") para nome + faixa. */
function migrarFaixas(d: Dimensionamento): Dimensionamento {
  if (!d.it.some(i => !i.fx && /[≤≥<>]\s*\d+\s*L/i.test(i.n))) return d;
  return {
    ...d, it: d.it.map(i => {
      if (i.fx) return i;
      const m = [...i.n.matchAll(/([≤≥<>])\s*(\d+)\s*L?/gi)];
      if (!m.length) return i;
      const ult = m[m.length - 1];
      const l = Math.min(1000, Math.max(10, Math.round(Number(ult[2]) / 10) * 10));
      const op: Faixa['op'] = ult[1] === '≤' || ult[1] === '<' ? '≤' : '≥';
      const n = i.n.replace(/[>≥<≤]\s*\d+\s*(e\s*[≤<]\s*\d+\s*)?L?/gi, '').replace(/\(\s*\)/g, '').replace(/\s{2,}/g, ' ').trim();
      return { ...i, n, fx: { op, l } };
    }),
  };
}

type Alvo = 'filial' | 'padrao';

export function DimensionamentoTab({ data, filialId, setFilialId }: { data: TmData; filialId: string; setFilialId: (id: string) => void }) {
  const { s, t, colors } = useLook();
  const { isAdmin } = useAuth();
  const [escolher, setEscolher] = useState(false);
  const [usarObs, setUsarObs] = useState(false);
  const [alvo, setAlvo] = useState<Alvo>('filial');
  const [faixaDe, setFaixaDe] = useState<string | null>(null); // item com o seletor de faixa aberto
  const filial = data.filiais.find(f => f.id === filialId) ?? null;
  const { payload: proprio } = useFilialDoc<Dimensionamento>(filial?.id, 'dimensionamento');
  const padrao = migrarFaixas(useConfig<Dimensionamento>(CFG_DIM_PADRAO, MODELO));
  const editandoPadrao = alvo === 'padrao';
  const usaPadrao = !editandoPadrao && !!filial && !proprio;
  const D: Dimensionamento | null = editandoPadrao ? padrao : filial ? (proprio ? migrarFaixas(proprio) : padrao) : null;
  const podeEditar = !editandoPadrao || isAdmin;

  /** No padrão grava a configuração global. Na filial, a primeira alteração cria o dimensionamento próprio dela. */
  const salvar = (next: Dimensionamento) => {
    if (editandoPadrao) { if (isAdmin) saveConfig(CFG_DIM_PADRAO, next); return; }
    if (filial) saveFilialDoc(filial.id, 'dimensionamento', next);
  };
  const voltarAoPadrao = () => {
    if (!filial) return;
    confirmAction('Voltar ao padrão da rede?', `${filial.nome} deixa de ter dimensionamento próprio e passa a usar o padrão. Os valores próprios desta filial serão descartados.`, 'Usar o padrão', () => docsCol.remove(docId(filial.id, 'dimensionamento')));
  };
  const obsOf = (nome: string) => {
    if (!filial || editandoPadrao) return null;
    const ids = data.atividades.filter(a => normNome(a.nome) === normNome(nome)).map(a => a.id);
    return ids.length ? mediaObservada(data, filial.id, ids) : null;
  };
  const hm = (i: ItemDim, d: Dimensionamento) => {
    const o = usarObs ? obsOf(nomeItem(i)) ?? obsOf(i.n) : null;
    const m = o && o.n >= 10 ? o.minutos : i.m;
    return i.t === 'h' ? i.v : (m / 60) * i.v * (i.t === 'd' ? d.dias : i.t === 's' ? d.dias / 7 : 1);
  };
  const n = (v: string) => { const x = Number(v.replace(',', '.')); return Number.isNaN(x) ? 0 : x; };

  const cabecalho = (
    <Card>
      <ChoiceChips value={editandoPadrao ? 'Padrão da rede' : 'Por filial'} options={['Por filial', 'Padrão da rede']} onChange={v => setAlvo(v === 'Padrão da rede' ? 'padrao' : 'filial')} />
      {editandoPadrao ? (
        <Text style={t.caption}>
          {isAdmin
            ? 'Este é o dimensionamento padrão: vale para todas as filiais que não têm dimensionamento próprio. Alterações aqui atualizam essas filiais na hora.'
            : 'Dimensionamento padrão da rede (somente o administrador altera).'}
        </Text>
      ) : (
        <View style={s.row}>
          <Text style={[t.label, s.flex]}>Filial: {filial ? `${filial.codigo} · ${filial.nome}` : 'escolha a filial'}</Text>
          {filial ? <StatusPill label={usaPadrao ? 'Usa o padrão' : 'Próprio'} tone={usaPadrao ? 'accent' : 'neutral'} /> : null}
          <Button title="Trocar" icon={StorefrontIcon} variant="secondary" size="sm" onPress={() => setEscolher(true)} />
        </View>
      )}
      {!editandoPadrao && (
        <View style={s.group}>
          <Text style={t.label}>Tempos usados no cálculo</Text>
          <ChoiceChips value={usarObs ? 'Média observada (10+ ciclos)' : 'Tempos cadastrados'} options={['Tempos cadastrados', 'Média observada (10+ ciclos)']} onChange={v => setUsarObs(v.startsWith('Média'))} />
        </View>
      )}
      {usaPadrao ? <Text style={t.caption}>Esta filial usa o dimensionamento padrão da rede. Ao alterar qualquer valor, ela passa a ter um dimensionamento próprio.</Text> : null}
      {!editandoPadrao && filial && proprio ? <Button title="Voltar ao padrão da rede" icon={ResetIcon} variant="ghost" size="sm" style={s.alignStart} onPress={voltarAoPadrao} /> : null}
    </Card>
  );
  const picker = escolher ? <FilialPicker data={data} atual={filialId} onClose={() => setEscolher(false)} onPick={id => { setFilialId(id); setEscolher(false); }} /> : null;

  if (!D) return <>{cabecalho}<EmptyState icon={StorefrontIcon} title="Escolha a filial" text="O dimensionamento é calculado por filial; sem dimensionamento próprio, ela usa o padrão da rede." action={{ label: 'Escolher filial', onPress: () => setEscolher(true) }} />{picker}</>;
  if (!D.it.length && editandoPadrao) return <>{cabecalho}
    <EmptyState icon={ChartBarIcon} title="Padrão vazio" text="Recrie o padrão a partir da planilha de referência (modelo 07)."
      action={isAdmin ? { label: 'Recriar a partir do modelo', icon: PlusIcon, onPress: () => salvar(modeloDimensionamento()) } : undefined} /></>;

  const B = BL.map((b, k) => { const it = D.it.filter(i => i.b === k), hr = it.reduce((x, i) => x + hm(i, D), 0), pg = hr * D.bl[k].f; return { k, it, hr, pg, fte: D.bl[k].h ? pg / D.bl[k].h : 0 }; });
  const H = B.reduce((x, b) => x + b.hr, 0), PG = B.reduce((x, b) => x + b.pg, 0), FT = B.reduce((x, b) => x + b.fte, 0), sd = D.quadro - FT;
  const editItem = (id: string, p: Partial<ItemDim>) => salvar({ ...D, it: D.it.map(i => (i.id === id ? { ...i, ...p } : i)) });
  const itemFaixa = faixaDe ? D.it.find(i => i.id === faixaDe) : undefined;

  return <>
    {cabecalho}
    <View style={s.kpis}>
      <Kpi label="Horas de trabalho/mês" value={num(H)} />
      <Kpi label="Horas com fator de cobertura" value={num(PG)} />
      <Kpi label="Funcionários necessários" value={num(FT)} />
      <Kpi label={sd < 0 ? 'Déficit vs. necessário' : 'Folga vs. necessário'} value={D.quadro ? `${sd > 0 ? '+' : ''}${num(sd)}` : '-'} />
    </View>
    <Card>
      <View style={s.twoCol}>
        <Field estavel editable={podeEditar} label="Quadro atual (funcionários)" style={s.flex} keyboardType="decimal-pad" value={String(D.quadro).replace('.', ',')} onChangeText={v => salvar({ ...D, quadro: n(v) })} />
        <Field estavel editable={podeEditar} label="Dias no mês" style={s.flex} keyboardType="numeric" value={String(D.dias)} onChangeText={v => salvar({ ...D, dias: n(v) })} />
      </View>
    </Card>
    <Card><Text style={t.section}>Funcionários necessários por bloco</Text><BarList items={B.map(b => [BL[b.k][0], b.fte])} /></Card>
    <Card><Text style={t.section}>Maiores cargas (h/mês)</Text><BarList items={D.it.map(i => [nomeItem(i), hm(i, D)] as [string, number]).sort((a, b) => b[1] - a[1]).slice(0, 8)} /></Card>

    {B.map(b => (
      <Card key={b.k}>
        <Text style={t.section}>{BL[b.k][0]}</Text>
        <Text style={t.caption}>{num(b.hr)} h/mês · {num(b.fte)} funcionário(s)</Text>
        <View style={s.twoCol}>
          <Field estavel editable={podeEditar} label="Fator de cobertura" style={s.flex} keyboardType="decimal-pad" value={String(D.bl[b.k].f).replace('.', ',')} onChangeText={v => salvar({ ...D, bl: D.bl.map((x, k) => (k === b.k ? { ...x, f: n(v) } : x)) })} />
          <Field estavel editable={podeEditar} label="Horas/func./mês" style={s.flex} keyboardType="numeric" value={String(D.bl[b.k].h)} onChangeText={v => salvar({ ...D, bl: D.bl.map((x, k) => (k === b.k ? { ...x, h: n(v) } : x)) })} />
        </View>
        {b.it.map(i => {
          const o = obsOf(nomeItem(i)) ?? obsOf(i.n);
          return (
            <View key={i.id} style={{ gap: 6, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.border }}>
              <View style={s.row}>
                <Field editable={podeEditar} style={s.flex} value={i.n} onChangeText={v => editItem(i.id, { n: v })} />
                {podeEditar ? <IconButton icon={XIcon} tone="danger" label="Remover atividade" onPress={() => salvar({ ...D, it: D.it.filter(x => x.id !== i.id) })} /> : null}
              </View>
              {b.k === 0 || i.fx ? (
                <Pressable accessibilityRole="button" accessibilityLabel={`Faixa de volume: ${i.fx ? rotuloFaixa(i.fx) : 'sem faixa'}`} disabled={!podeEditar} onPress={() => setFaixaDe(i.id)}
                  style={({ pressed }) => [s.row, { alignSelf: 'flex-start', gap: 6, paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8, borderWidth: 1, borderColor: i.fx ? colors.accent : colors.border, backgroundColor: i.fx ? colors.accentSoft : colors.surface }, pressed && { opacity: 0.7 }]}>
                  <Text style={[t.caption, { color: i.fx ? colors.accentText : colors.textMuted, fontWeight: '700' }]}>Volume: {i.fx ? rotuloFaixa(i.fx) : 'sem faixa'}</Text>
                  {podeEditar ? <CaretDownIcon size={12} color={i.fx ? colors.accentText : colors.textMuted} weight="bold" /> : null}
                </Pressable>
              ) : null}
              <View style={s.twoCol}>
                <Field estavel editable={podeEditar} label="Minutos" style={s.flex} keyboardType="decimal-pad" value={String(i.m).replace('.', ',')} onChangeText={v => editItem(i.id, { m: n(v) })} />
                <Field estavel editable={podeEditar} label={i.t === 'h' ? 'Horas/mês' : 'Quantidade'} style={s.flex} keyboardType="decimal-pad" value={String(i.v).replace('.', ',')} onChangeText={v => editItem(i.id, { v: n(v) })} />
              </View>
              <ChoiceChips value={FQ[i.t]} options={Object.values(FQ)} onChange={v => { if (podeEditar) editItem(i.id, { t: (Object.keys(FQ) as Freq[]).find(k => FQ[k] === v) ?? 'd' }); }} />
              <Text style={[t.caption, s.mono]}>{num(hm(i, D))} h/mês{o ? ` · observado ${num(o.minutos)} min (${o.n} ciclo${o.n > 1 ? 's' : ''})` : ''}</Text>
            </View>
          );
        })}
        {podeEditar ? <Button title="Adicionar atividade" icon={PlusIcon} variant="ghost" size="sm" style={s.alignStart} onPress={() => salvar({ ...D, it: [...D.it, { id: uid('dim'), b: b.k, n: b.k === 0 ? 'Abastecimento' : 'Nova atividade', m: 0, t: b.k === 0 ? 'm' : 'd', v: 0 }] })} /> : null}
      </Card>
    ))}
    <Text style={t.caption}>
      Cálculo da planilha: h/mês = minutos ÷ 60 × ocorrências no mês (diária × dias; semanal × dias ÷ 7). Funcionários = h/mês × fator de cobertura ÷ horas por funcionário.
      O fator 1,5 do abastecimento é premissa da planilha (prontidão e picos) e deve ser justificado. Baixa demanda não indica excesso de pessoal.
      Com &quot;média observada&quot;, só entram atividades com o mesmo nome do catálogo e ao menos 10 ciclos registrados nesta filial.
    </Text>
    {picker}
    {itemFaixa ? (
      <Sheet title="Faixa de volume (litros)" onClose={() => setFaixaDe(null)}
        footer={<Button title="Sem faixa" icon={XIcon} variant="secondary" onPress={() => { editItem(itemFaixa.id, { fx: undefined }); setFaixaDe(null); }} />}>
        <Text style={t.caption}>{itemFaixa.n}: escolha a faixa de volume do abastecimento.</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {FAIXAS.map(f => {
            const on = itemFaixa.fx?.op === f.op && itemFaixa.fx?.l === f.l;
            return (
              <Pressable key={`${f.op}${f.l}`} accessibilityRole="radio" accessibilityState={{ selected: on }} onPress={() => { editItem(itemFaixa.id, { fx: f }); setFaixaDe(null); }}
                style={({ pressed }) => [{ minWidth: 84, paddingVertical: 8, paddingHorizontal: 10, borderRadius: 8, borderWidth: 1, borderColor: on ? colors.accent : colors.border, backgroundColor: on ? colors.accentSoft : colors.surface, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4 }, pressed && { opacity: 0.7 }]}>
                {on ? <CheckIcon size={12} color={colors.accentText} weight="bold" /> : null}
                <Text style={[t.body, { fontVariant: ['tabular-nums'] }, on && { color: colors.accentText, fontWeight: '700' }]}>{rotuloFaixa(f)}</Text>
              </Pressable>
            );
          })}
        </View>
      </Sheet>
    ) : null}
  </>;
}
