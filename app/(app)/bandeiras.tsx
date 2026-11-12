import { useRouter } from 'expo-router';
import { useContext, useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../lib/auth';
import { type Bandeira, CORES_BANDEIRA, salvarBandeiras, useBandeiras } from '../../lib/bandeiras';
import { novoId, useFiliais } from '../../lib/data';
import { ArrowLeftIcon, CheckIcon, PencilSimpleIcon, PlusIcon } from '../../ui/icons';
import { Button, Card, Field, IconButton, notify, SectionHeader, Sheet, StatusPill } from '../../ui/kit';
import { createTypography, pageMaxWidth, space, ThemeContext } from '../../ui/theme';

type Form = { id: string | null; nome: string; cor: string; corTexto: string };

/** Selo da bandeira, igual ao desenhado no croqui. */
function Selo({ nome, cor, corTexto, pequeno = false }: { nome: string; cor: string; corTexto: string; pequeno?: boolean }) {
  return (
    <View style={{ backgroundColor: cor, borderRadius: 8, paddingHorizontal: pequeno ? 8 : 14, paddingVertical: pequeno ? 4 : 8, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(0,0,0,0.25)' }}>
      {!pequeno ? <Text style={{ color: corTexto, fontSize: 9, opacity: 0.85, letterSpacing: 1 }}>BANDEIRA</Text> : null}
      <Text style={{ color: corTexto, fontSize: pequeno ? 11 : 15, fontWeight: '800' }} numberOfLines={1}>{(nome || 'Nome').toUpperCase()}</Text>
    </View>
  );
}

/** Cadastro de bandeiras dos postos (usadas na filial e no croqui). */
export default function BandeirasScreen() {
  const router = useRouter();
  const { isAdmin } = useAuth();
  const { colors } = useContext(ThemeContext);
  const t = useMemo(() => createTypography(colors), [colors]);
  const lista = useBandeiras();
  const { filiais } = useFiliais();
  const [form, setForm] = useState<Form | null>(null);
  const voltar = () => (router.canGoBack() ? router.back() : router.replace('/'));
  const emUso = (id: string) => filiais.filter(f => f.bandeira === id).length;

  const salvar = () => {
    if (!form) return;
    const nome = form.nome.trim();
    if (!nome) { notify('Informe o nome da bandeira'); return; }
    if (lista.some(b => b.nome.trim().toLowerCase() === nome.toLowerCase() && b.id !== form.id)) { notify('Já existe uma bandeira com esse nome'); return; }
    salvarBandeiras(form.id
      ? lista.map(b => (b.id === form.id ? { ...b, nome, cor: form.cor, corTexto: form.corTexto } : b))
      : [...lista, { id: novoId('band'), nome, cor: form.cor, corTexto: form.corTexto, ativo: true }]);
    setForm(null);
  };
  const alternar = (b: Bandeira) => salvarBandeiras(lista.map(x => (x.id === b.id ? { ...x, ativo: x.ativo === false } : x)));

  const corPicker = (valor: string, onChange: (c: string) => void) => (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
      {CORES_BANDEIRA.map(cor => (
        <Pressable key={cor} onPress={() => onChange(cor)} accessibilityRole="button" accessibilityLabel={`Cor ${cor}`} accessibilityState={{ selected: valor === cor }}
          style={{ width: 34, height: 34, borderRadius: 9, backgroundColor: cor, borderWidth: valor === cor ? 3 : 1, borderColor: valor === cor ? colors.accent : colors.border }} />
      ))}
    </View>
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.lg, paddingVertical: space.md, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border }}>
        <IconButton icon={ArrowLeftIcon} label="Voltar" onPress={voltar} />
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 15.5, fontWeight: '800', color: colors.text }}>Bandeiras</Text>
          <Text style={t.caption}>Usadas no cadastro da filial e no croqui</Text>
        </View>
        {isAdmin ? <Button title="Nova" icon={PlusIcon} size="sm" onPress={() => setForm({ id: null, nome: '', cor: '#0891b2', corTexto: '#ffffff' })} /> : null}
      </View>
      <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.md, width: '100%', maxWidth: pageMaxWidth(640), alignSelf: 'center', paddingBottom: 56 }}>
        <SectionHeader title={`Bandeiras (${lista.length})`} />
        <Card style={{ padding: space.xs, gap: 0 }}>
          {lista.map((b, i) => (
            <View key={b.id} style={[{ flexDirection: 'row', alignItems: 'center', gap: space.sm, padding: 12 }, i > 0 && { borderTopWidth: 1, borderTopColor: colors.border }]}>
              <Selo nome={b.nome} cor={b.cor} corTexto={b.corTexto} pequeno />
              <View style={{ flex: 1 }}>
                <Text style={[t.bodyStrong, b.ativo === false && { color: colors.textFaint }]} numberOfLines={1}>{b.nome}</Text>
                <Text style={t.caption}>{emUso(b.id)} filial(is)</Text>
              </View>
              {b.ativo === false ? <StatusPill label="Desativada" /> : null}
              {isAdmin ? <>
                <IconButton icon={PencilSimpleIcon} label={`Editar ${b.nome}`} onPress={() => setForm({ id: b.id, nome: b.nome, cor: b.cor, corTexto: b.corTexto })} />
                <Button title={b.ativo === false ? 'Ativar' : 'Desativar'} variant="ghost" size="sm" onPress={() => alternar(b)} />
              </> : null}
            </View>
          ))}
        </Card>
        <Text style={t.caption}>{isAdmin ? 'Bandeira desativada some da lista de escolha, mas continua nas filiais que já a usam.' : 'Somente o administrador altera as bandeiras.'}</Text>
      </ScrollView>

      {form && (
        <Sheet title={form.id ? 'Editar bandeira' : 'Nova bandeira'} onClose={() => setForm(null)}
          footer={<View style={{ flexDirection: 'row', gap: space.md }}><Button title="Cancelar" variant="secondary" style={{ flex: 1 }} onPress={() => setForm(null)} /><Button title="Salvar" icon={CheckIcon} style={{ flex: 1 }} onPress={salvar} /></View>}>
          <Field label="Nome" value={form.nome} onChangeText={v => setForm({ ...form, nome: v })} placeholder="Ex.: Rede Própria, Vibra, Raízen" maxLength={30} />
          <Text style={t.label}>Cor de fundo</Text>
          {corPicker(form.cor, cor => setForm({ ...form, cor }))}
          <Text style={t.label}>Cor do texto</Text>
          {corPicker(form.corTexto, corTexto => setForm({ ...form, corTexto }))}
          <Text style={t.label}>Prévia</Text>
          <View style={{ alignItems: 'flex-start' }}><Selo nome={form.nome} cor={form.cor} corTexto={form.corTexto} /></View>
        </Sheet>
      )}
    </SafeAreaView>
  );
}
