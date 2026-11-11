import { useContext } from 'react';
import { Text, View } from 'react-native';
import { bandeirasAtivas, nomeBandeira, useBandeiras } from '../lib/bandeiras';
import { filiaisCol } from '../lib/data';
import { ChoiceChips, Field } from '../ui/kit';
import { createTypography, space, ThemeContext } from '../ui/theme';

// Formulário e validação dos dados da filial (cadastro único).
export type FilialForm = { codigo: string; nome: string; cidade: string; uf: string; bandeira: string };
export const filialVazia = (): FilialForm => ({ codigo: '', nome: '', cidade: '', uf: 'RS', bandeira: 'branca' });

export function validarFilial(f: FilialForm, idAtual: string | null) {
  if (!f.codigo.trim() || !f.nome.trim()) return 'Informe o código e o nome da filial.';
  const dup = filiaisCol.list().find(x => x.codigo.trim().toLowerCase() === f.codigo.trim().toLowerCase() && x.id !== idAtual);
  return dup ? `O código ${f.codigo.trim()} já pertence a ${dup.nome}.` : null;
}

/** Formulário de dados da filial (usado na criação e na página da filial). */
export function FilialFields({ form, setForm, editavel }: { form: FilialForm; setForm: (f: FilialForm) => void; editavel: boolean }) {
  const { colors } = useContext(ThemeContext);
  const t = createTypography(colors);
  const set = (k: keyof FilialForm) => (v: string) => setForm({ ...form, [k]: v });
  const bandeiras = useBandeiras();
  const atual = bandeiras.find(b => b.id === form.bandeira);
  const opcoes = atual && atual.ativo === false ? [...bandeirasAtivas(bandeiras), atual] : bandeirasAtivas(bandeiras);
  return <>
    <View style={{ flexDirection: 'row', gap: space.md }}>
      <Field label="Código" style={{ width: 110 }} value={form.codigo} onChangeText={set('codigo')} editable={editavel} placeholder="05" />
      <Field label="Nome da filial" style={{ flex: 1 }} value={form.nome} onChangeText={set('nome')} editable={editavel} placeholder="NEV 05" />
    </View>
    <View style={{ flexDirection: 'row', gap: space.md }}>
      <Field label="Cidade" style={{ flex: 1 }} value={form.cidade} onChangeText={set('cidade')} editable={editavel} />
      <Field label="UF" style={{ width: 80 }} value={form.uf} onChangeText={v => set('uf')(v.toUpperCase())} editable={editavel} maxLength={2} autoCapitalize="characters" />
    </View>
    <View style={{ gap: space.sm }}>
      <Text style={t.label}>Bandeira</Text>
      {editavel
        ? <ChoiceChips value={nomeBandeira(form.bandeira)} options={opcoes.map(b => b.nome)} onChange={n => set('bandeira')(opcoes.find(b => b.nome === n)?.id ?? 'branca')} />
        : <Text style={t.body}>{nomeBandeira(form.bandeira)}</Text>}
    </View>
  </>;
}
