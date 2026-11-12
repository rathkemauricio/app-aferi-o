import { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { CheckIcon } from '../../ui/icons';
import { Button, Card, ChoiceChips, Field, notify, Sheet } from '../../ui/kit';
import { space } from '../../ui/theme';
import { historicoNotas, MATRIZ, MESES, NOTA_FAIXAS, notaFaixa, fmtNota, type Notas, resumoAno, type Unidade } from './model';
import { type DadosRiscos, unidadesCol } from './store';
import { useEstilos } from './ui';

const LARG = { nome: 150, mes: 44, media: 56, status: 82 };

export default function HistTab({ d }: { d: DadosRiscos }) {
  const { s, t, colors } = useEstilos();
  const anoAtual = new Date().getFullYear();
  const anos = useMemo(() => {
    const set = new Set<number>([anoAtual]);
    d.unidades.forEach(u => historicoNotas(u, d.pontuacoes).forEach(h => set.add(Number(h.periodo.slice(0, 4)))));
    return [...set].sort((a, b) => b - a);
  }, [d.unidades, d.pontuacoes, anoAtual]);
  const [ano, setAno] = useState(anoAtual);
  const [editar, setEditar] = useState<Unidade | null>(null);

  const cel = (v: number | undefined) => {
    if (v === undefined || v === null) return <Text style={{ color: colors.border, textAlign: 'center' }}>·</Text>;
    const f = notaFaixa(v);
    return <View style={{ alignSelf: 'center', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, backgroundColor: f.cor + '22' }}><Text style={{ color: f.cor, fontWeight: '800', fontSize: 12.5 }}>{fmtNota(v)}</Text></View>;
  };

  return (
    <ScrollView contentContainerStyle={s.content}>
      <View style={s.stack}>
        <Text style={t.section}>Notas mensais por unidade</Text>
        <Text style={t.caption}>As notas vêm do histórico e das pontuações lançadas no Programa Filial Destaque. Toque numa unidade para corrigir as notas do ano.</Text>
        <ChoiceChips value={String(ano)} options={anos.map(String)} onChange={v => setAno(Number(v))} />
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          <ScrollView horizontal>
            <View>
              <View style={[s.row, { backgroundColor: colors.surfaceMuted, paddingVertical: 8, gap: 0 }]}>
                <Text style={[t.label, { width: LARG.nome, paddingLeft: 12 }]}>Unidade</Text>
                {MESES.map(m => <Text key={m} style={[t.label, { width: LARG.mes, textAlign: 'center', textTransform: 'capitalize' }]}>{m}</Text>)}
                <Text style={[t.label, { width: LARG.media, textAlign: 'center' }]}>Média</Text>
                <Text style={[t.label, { width: LARG.status, textAlign: 'center' }]}>Status</Text>
              </View>
              {d.unidades.map(u => {
                const notas: Record<string, number> = {};
                historicoNotas(u, d.pontuacoes).forEach(h => { notas[h.periodo] = h.nota; });
                const r = resumoAno(notas, ano);
                return (
                  <Pressable key={u.id} accessibilityRole="button" onPress={() => setEditar(u)} style={({ pressed }) => [s.row, { gap: 0, paddingVertical: 7, borderTopWidth: 1, borderTopColor: colors.border }, pressed && { backgroundColor: colors.surfaceMuted }]}>
                    <Text style={[t.bodyStrong, { width: LARG.nome, paddingLeft: 12 }]} numberOfLines={1}>{u.nome}</Text>
                    {MESES.map((_, i) => <View key={i} style={{ width: LARG.mes }}>{cel(notas[`${ano}-${String(i + 1).padStart(2, '0')}`])}</View>)}
                    <View style={{ width: LARG.media }}>{cel(r.media ?? undefined)}</View>
                    <Text style={[t.caption, { width: LARG.status, textAlign: 'center', fontWeight: '700', color: r.status === 'Piorou' ? colors.danger : r.status === 'Melhorou' ? colors.success : colors.textMuted }]}>{r.status ?? ''}</Text>
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>
        </Card>

        <Text style={[t.section, { marginTop: space.md }]}>Critérios de avaliação</Text>
        <View style={s.wrap}>
          {NOTA_FAIXAS.map(f => (
            <Card key={f.label} style={{ flexGrow: 1, flexBasis: 200 }}>
              <View style={s.row}><Text style={{ fontSize: 18, fontWeight: '800', color: f.cor }}>{f.faixa}</Text><Text style={t.bodyStrong}>{f.label}</Text></View>
              <Text style={t.caption}>{f.desc}{'\n'}<Text style={{ fontWeight: '800' }}>Ação:</Text> {f.acao}</Text>
            </Card>
          ))}
        </View>

        <Text style={[t.section, { marginTop: space.md }]}>Matriz de classificação de risco</Text>
        {MATRIZ.map(m => (
          <Card key={m.k}>
            <Text style={t.bodyStrong}>{m.nome} <Text style={t.caption}>· compõe {m.feeds}</Text></Text>
            <Text style={t.caption}><Text style={{ fontWeight: '800', color: '#16a36a' }}>1–2 Baixo: </Text>{m.baixo}</Text>
            <Text style={t.caption}><Text style={{ fontWeight: '800', color: '#d99a0b' }}>3 Médio: </Text>{m.medio}</Text>
            <Text style={t.caption}><Text style={{ fontWeight: '800', color: '#d93a3a' }}>4–5 Alto: </Text>{m.alto}</Text>
          </Card>
        ))}
      </View>
      {editar && <NotasSheet u={editar} ano={ano} onClose={() => setEditar(null)} />}
    </ScrollView>
  );
}

function NotasSheet({ u, ano, onClose }: { u: Unidade; ano: number; onClose: () => void }) {
  const { s, t } = useEstilos();
  const chave = (i: number) => `${ano}-${String(i + 1).padStart(2, '0')}`;
  const [v, setV] = useState(MESES.map((_, i) => (u.notas?.[chave(i)] !== undefined ? String(u.notas[chave(i)]).replace('.', ',') : '')));
  const salvar = () => {
    const notas: Notas = { ...(u.notas ?? {}) };
    for (let i = 0; i < 12; i++) {
      const x = v[i].trim().replace(',', '.');
      if (!x) { delete notas[chave(i)]; continue; }
      const n = Number(x);
      if (!Number.isFinite(n) || n < 0 || n > 10) { notify('Nota inválida', `${MESES[i]}: use um valor de 0 a 10.`); return; }
      notas[chave(i)] = n;
    }
    unidadesCol.put({ ...(unidadesCol.get(u.id) ?? u), notas });
    onClose();
  };
  return (
    <Sheet title={`${u.nome} · ${ano}`} onClose={onClose} footer={<Button title="Salvar notas" icon={CheckIcon} onPress={salvar} />}>
      <Text style={t.caption}>Nota da auditoria de 0 a 10 em cada mês. Deixe em branco os meses sem auditoria. Pontuações lançadas no Programa Filial Destaque prevalecem sobre a nota digitada aqui.</Text>
      <View style={s.wrap}>
        {MESES.map((m, i) => (
          <Field key={m} style={{ flexBasis: 90, flexGrow: 1 }} label={m.toUpperCase()} value={v[i]} keyboardType="decimal-pad" onChangeText={x => setV(o => o.map((y, j) => (j === i ? x : y)))} />
        ))}
      </View>
    </Sheet>
  );
}
