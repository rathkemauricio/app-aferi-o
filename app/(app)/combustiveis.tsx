import { useRouter } from 'expo-router';
import { useContext, useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../lib/auth';
import { type Combustivel, CORES_COMBUSTIVEL, salvarCombustiveis, useCombustiveis } from '../../lib/combustiveis';
import { novoId } from '../../lib/data';
import { ArrowLeftIcon, CheckIcon, DropIcon, PencilSimpleIcon, PlusIcon } from '../../ui/icons';
import { Button, Card, Field, IconButton, notify, SectionHeader, Sheet, StatusPill } from '../../ui/kit';
import { createTypography, pageMaxWidth, space, ThemeContext } from '../../ui/theme';

type Form = { id: string | null; nome: string; cor: string };

/** Catálogo único de combustíveis: usado nos bicos do Aferições e nas bombas do Croqui. */
export default function CombustiveisScreen() {
  const router = useRouter();
  const { isAdmin } = useAuth();
  const { colors } = useContext(ThemeContext);
  const t = useMemo(() => createTypography(colors), [colors]);
  const lista = useCombustiveis();
  const [form, setForm] = useState<Form | null>(null);
  const ativos = lista.filter(c => c.ativo !== false), inativos = lista.filter(c => c.ativo === false);
  const voltar = () => (router.canGoBack() ? router.back() : router.replace('/'));

  const salvar = () => {
    if (!form) return;
    const nome = form.nome.trim();
    if (!nome) { notify('Informe o nome do combustível'); return; }
    if (lista.some(c => c.nome.trim().toLowerCase() === nome.toLowerCase() && c.id !== form.id)) { notify('Já existe um combustível com esse nome'); return; }
    const next: Combustivel[] = form.id
      ? lista.map(c => (c.id === form.id ? { ...c, nome, cor: form.cor } : c))
      : [...lista, { id: novoId('comb'), nome, cor: form.cor, ativo: true }];
    salvarCombustiveis(next);
    setForm(null);
  };
  const alternar = (c: Combustivel) => salvarCombustiveis(lista.map(x => (x.id === c.id ? { ...x, ativo: x.ativo === false } : x)));

  const linha = (c: Combustivel, i: number) => (
    <View key={c.id} style={[{ flexDirection: 'row', alignItems: 'center', gap: space.sm, padding: 12 }, i > 0 && { borderTopWidth: 1, borderTopColor: colors.border }]}>
      <View style={{ width: 22, height: 22, borderRadius: 6, backgroundColor: c.cor }} />
      <Text style={[t.bodyStrong, { flex: 1 }, c.ativo === false && { color: colors.textFaint }]} numberOfLines={1}>{c.nome}</Text>
      {c.ativo === false ? <StatusPill label="Desativado" /> : null}
      {isAdmin ? <>
        <IconButton icon={PencilSimpleIcon} label={`Editar ${c.nome}`} onPress={() => setForm({ id: c.id, nome: c.nome, cor: c.cor })} />
        <Button title={c.ativo === false ? 'Ativar' : 'Desativar'} variant="ghost" size="sm" onPress={() => alternar(c)} />
      </> : null}
    </View>
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.lg, paddingVertical: space.md, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border }}>
        <IconButton icon={ArrowLeftIcon} label="Voltar" onPress={voltar} />
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 15.5, fontWeight: '800', color: colors.text }}>Combustíveis</Text>
          <Text style={t.caption}>Usados nos bicos (Aferições) e nas bombas (Croqui)</Text>
        </View>
        {isAdmin ? <Button title="Novo" icon={PlusIcon} size="sm" onPress={() => setForm({ id: null, nome: '', cor: CORES_COMBUSTIVEL[6] })} /> : null}
      </View>
      <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.md, width: '100%', maxWidth: pageMaxWidth(640), alignSelf: 'center', paddingBottom: 56 }}>
        <SectionHeader title={`Ativos (${ativos.length})`} />
        <Card style={{ padding: space.xs, gap: 0 }}>{ativos.map(linha)}</Card>
        {inativos.length ? <>
          <SectionHeader title={`Desativados (${inativos.length})`} />
          <Card style={{ padding: space.xs, gap: 0 }}>{inativos.map(linha)}</Card>
        </> : null}
        <Text style={t.caption}>
          {isAdmin
            ? 'Combustível desativado some das opções de bico e da paleta do croqui, mas continua aparecendo nos bicos e croquis em que já foi usado.'
            : 'Somente o administrador altera os combustíveis.'}
        </Text>
      </ScrollView>

      {form && (
        <Sheet title={form.id ? 'Editar combustível' : 'Novo combustível'} onClose={() => setForm(null)}
          footer={<View style={{ flexDirection: 'row', gap: space.md }}><Button title="Cancelar" variant="secondary" style={{ flex: 1 }} onPress={() => setForm(null)} /><Button title="Salvar" icon={CheckIcon} style={{ flex: 1 }} onPress={salvar} /></View>}>
          <Field label="Nome" value={form.nome} onChangeText={v => setForm({ ...form, nome: v })} placeholder="Ex.: Gasolina premium, GNV, Arla 32" maxLength={40} />
          <Text style={t.label}>Cor no croqui</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            {CORES_COMBUSTIVEL.map(cor => (
              <Pressable key={cor} onPress={() => setForm({ ...form, cor })} accessibilityRole="button" accessibilityLabel={`Cor ${cor}`} accessibilityState={{ selected: form.cor === cor }}
                style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: cor, alignItems: 'center', justifyContent: 'center', borderWidth: form.cor === cor ? 3 : 0, borderColor: colors.text }}>
                {form.cor === cor ? <CheckIcon size={16} color="#fff" weight="bold" /> : null}
              </Pressable>
            ))}
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: space.sm }}>
            <DropIcon size={22} color={form.cor} weight="fill" />
            <Text style={t.body}>{form.nome.trim() || 'Prévia do combustível'}</Text>
          </View>
        </Sheet>
      )}
    </SafeAreaView>
  );
}
