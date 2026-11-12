import { useRouter } from 'expo-router';
import { useContext, useMemo, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../../lib/auth';
import { nomeBandeira, useBandeiras } from '../../../lib/bandeiras';
import { docId, docsCol, filiaisCol, novoId, useFiliais } from '../../../lib/data';
import { useCollection } from '../../../lib/sync';
import { ArrowLeftIcon, CheckIcon, MagnifyingGlassIcon, PlusIcon, StorefrontIcon } from '../../../ui/icons';
import { FilialFields, type FilialForm, filialVazia, validarFilial } from '../../../components/FilialForm';
import { Button, Card, EmptyState, Field, IconButton, ListRow, notify, Sheet, StatusPill } from '../../../ui/kit';
import { createTypography, pageMaxWidth, space, ThemeContext } from '../../../ui/theme';

export default function FiliaisScreen() {
  const router = useRouter();
  const { isAdmin } = useAuth();
  const { colors } = useContext(ThemeContext);
  const t = useMemo(() => createTypography(colors), [colors]);
  useBandeiras();
  const { filiais, loaded } = useFiliais();
  const docs = useCollection(docsCol);
  const [busca, setBusca] = useState('');
  const [nova, setNova] = useState<FilialForm | null>(null);

  const lista = filiais.filter(f => `${f.codigo} ${f.nome} ${f.cidade}`.toLowerCase().includes(busca.toLowerCase()));
  const temCroqui = (id: string) => !!(docs.list.find(d => d.id === docId(id, 'croqui'))?.payload as { items?: unknown[] } | undefined)?.items?.length;

  const salvarNova = () => {
    if (!nova) return;
    const erro = validarFilial(nova, null);
    if (erro) { notify('Verifique os dados', erro); return; }
    const id = novoId('filial');
    filiaisCol.put({ id, codigo: nova.codigo.trim(), nome: nova.nome.trim(), cidade: nova.cidade.trim(), uf: nova.uf.trim().toUpperCase() || 'RS', bandeira: nova.bandeira });
    setNova(null);
    router.push(`/filiais/${id}`);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.lg, paddingVertical: space.md, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border }}>
        <IconButton icon={ArrowLeftIcon} label="Voltar" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 15.5, fontWeight: '800', color: colors.text }}>Filiais</Text>
          <Text style={t.caption}>Cadastro único, usado por todos os módulos</Text>
        </View>
        {isAdmin ? <Button title="Nova filial" icon={PlusIcon} size="sm" onPress={() => setNova(filialVazia())} /> : null}
      </View>
      <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.md, width: '100%', maxWidth: pageMaxWidth(760), alignSelf: 'center', paddingBottom: 56 }} keyboardShouldPersistTaps="handled">
        <Field icon={MagnifyingGlassIcon} value={busca} onChangeText={setBusca} placeholder="Código, nome ou cidade" />
        {lista.length ? (
          <Card style={{ padding: space.xs, gap: 0 }}>
            {lista.map((f, i) => (
              <ListRow key={f.id} style={i > 0 && { borderTopWidth: 1, borderTopColor: colors.border, borderRadius: 0 }}
                icon={StorefrontIcon} tint="sky" title={`${f.codigo} · ${f.nome}`}
                subtitle={[[f.cidade, f.uf].filter(Boolean).join(', '), nomeBandeira(f.bandeira)].filter(Boolean).join(' · ')}
                right={temCroqui(f.id) ? <StatusPill label="Croqui" tone="accent" /> : undefined}
                onPress={() => router.push(`/filiais/${f.id}`)} />
            ))}
          </Card>
        ) : loaded ? (
          <EmptyState icon={StorefrontIcon} title={filiais.length ? 'Nenhuma filial encontrada' : 'Nenhuma filial cadastrada'}
            text={isAdmin ? 'Cadastre a filial uma vez; todos os módulos passam a usá-la.' : 'O administrador ainda não cadastrou filiais.'}
            action={isAdmin && !filiais.length ? { label: 'Nova filial', icon: PlusIcon, onPress: () => setNova(filialVazia()) } : undefined} />
        ) : null}
      </ScrollView>

      {nova && (
        <Sheet title="Nova filial" onClose={() => setNova(null)}
          footer={<View style={{ flexDirection: 'row', gap: space.md }}><Button title="Cancelar" variant="secondary" style={{ flex: 1 }} onPress={() => setNova(null)} /><Button title="Salvar" icon={CheckIcon} style={{ flex: 1 }} onPress={salvarNova} /></View>}>
          <FilialFields form={nova} setForm={setNova} editavel />
        </Sheet>
      )}
    </SafeAreaView>
  );
}
