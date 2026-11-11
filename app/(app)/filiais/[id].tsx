import { useLocalSearchParams, useRouter } from 'expo-router';
import { useContext, useEffect, useMemo, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../../lib/auth';
import { filiaisCol, useFiliais, useFilialDoc } from '../../../lib/data';
import { CroquiCanvas, useCatalogoCroqui } from '../../../modules/croqui/Canvas';
import { type CroquiDoc, PALETA_CLARA, PALETA_ESCURA, resumo } from '../../../modules/croqui/model';
import { ArrowLeftIcon, CheckIcon, DropIcon, GasPumpIcon, PencilSimpleIcon, StorefrontIcon, TrashIcon } from '../../../ui/icons';
import { Button, Card, confirmAction, EmptyState, IconButton, notify, SectionHeader, StatusPill } from '../../../ui/kit';
import { createTypography, space, ThemeContext } from '../../../ui/theme';
import { FilialFields, type FilialForm, validarFilial } from '../../../components/FilialForm';

type Pump = { id: string; number: string; nozzles: { id: string; number: string; fuel: string }[] };

/** Página de cadastro de uma filial: dados, bandeira, croqui e equipamentos. */
export default function FilialScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { isAdmin, podeAcessar } = useAuth();
  const { colors, mode } = useContext(ThemeContext);
  const t = useMemo(() => createTypography(colors), [colors]);
  useCatalogoCroqui(); // combustíveis cadastrados, para o resumo e o desenho do croqui
  const { filiais, loaded } = useFiliais();
  const filial = filiais.find(f => f.id === id) ?? null;
  const { payload: croqui } = useFilialDoc<CroquiDoc>(id, 'croqui');
  const { payload: equip } = useFilialDoc<{ pumps: Pump[] }>(id, 'equipamentos');
  const [form, setForm] = useState<FilialForm | null>(null);

  useEffect(() => { if (filial) setForm({ codigo: filial.codigo, nome: filial.nome, cidade: filial.cidade, uf: filial.uf, bandeira: filial.bandeira }); }, [filial?.id, filial?.updated_at]); // eslint-disable-line react-hooks/exhaustive-deps

  const voltar = () => (router.canGoBack() ? router.back() : router.replace('/filiais'));
  const mudou = !!filial && !!form && (form.codigo !== filial.codigo || form.nome !== filial.nome || form.cidade !== filial.cidade || form.uf !== filial.uf || form.bandeira !== filial.bandeira);
  const salvar = () => {
    if (!filial || !form) return;
    const erro = validarFilial(form, filial.id);
    if (erro) { notify('Verifique os dados', erro); return; }
    filiaisCol.put({ ...filial, codigo: form.codigo.trim(), nome: form.nome.trim(), cidade: form.cidade.trim(), uf: form.uf.trim().toUpperCase() || 'RS', bandeira: form.bandeira });
    notify('Filial atualizada');
  };
  const excluir = () => filial && confirmAction('Excluir filial?', `${filial.codigo} · ${filial.nome} sai das listas de todos os módulos. Coletas, aferições e croqui já registrados ficam guardados no banco.`, 'Excluir', () => { filiaisCol.remove(filial.id); voltar(); });

  const pumps = equip?.pumps ?? [];
  const bicos = pumps.reduce((n, p) => n + p.nozzles.length, 0);
  const itens = croqui?.items ?? [];
  const r = resumo(itens);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.lg, paddingVertical: space.md, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border }}>
        <IconButton icon={ArrowLeftIcon} label="Voltar" onPress={voltar} />
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 15.5, fontWeight: '800', color: colors.text }} numberOfLines={1}>{filial ? `${filial.codigo} · ${filial.nome}` : 'Filial'}</Text>
          <Text style={t.caption}>Cadastro da filial</Text>
        </View>
      </View>
      <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.md, width: '100%', maxWidth: 760, alignSelf: 'center', paddingBottom: 56 }} keyboardShouldPersistTaps="handled">
        {!filial || !form ? (
          loaded ? <EmptyState icon={StorefrontIcon} title="Filial não encontrada" text="Ela pode ter sido excluída." action={{ label: 'Voltar', onPress: voltar }} /> : null
        ) : <>
          <SectionHeader title="Dados" />
          <Card>
            <FilialFields form={form} setForm={setForm} editavel={isAdmin} />
            {isAdmin ? <Button title="Salvar alterações" icon={CheckIcon} disabled={!mudou} onPress={salvar} /> : <Text style={t.caption}>Somente o administrador altera os dados da filial.</Text>}
          </Card>

          {podeAcessar('croqui') && <>
          <SectionHeader title="Croqui" action={itens.length ? 'Abrir' : undefined} onPress={() => router.push(`/croqui?filial=${filial.id}`)} />
          {itens.length ? <>
            <CroquiCanvas items={itens} bandeira={filial.bandeira} mostrarNomes={false} paleta={{ ...(mode === 'dark' ? PALETA_ESCURA : PALETA_CLARA), accent: colors.accent }} />
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              <StatusPill icon={GasPumpIcon} label={`${r.bombas} bomba(s) no croqui`} />
              {r.porCombustivel.map(c => <StatusPill key={c.tipo} label={`${c.nome}: ${c.n}`} />)}
            </View>
            <Button title="Editar croqui" icon={PencilSimpleIcon} variant="secondary" onPress={() => router.push(`/croqui?filial=${filial.id}&editar=1`)} />
          </> : (
            <EmptyState icon={StorefrontIcon} title="Sem croqui" text="Desenhe o terreno com bombas, ilhas, loja e acessos."
              action={{ label: 'Desenhar croqui', icon: PencilSimpleIcon, onPress: () => router.push(`/croqui?filial=${filial.id}&editar=1`) }} />
          )}

          </>}

          {podeAcessar('afericoes') && <>
          <SectionHeader title="Equipamentos (Aferições)" action="Gerenciar" onPress={() => router.push('/afericoes')} />
          <Card>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              <StatusPill icon={GasPumpIcon} label={`${pumps.length} bomba(s)`} />
              <StatusPill icon={DropIcon} label={`${bicos} bico(s)`} />
            </View>
            <Text style={t.caption}>Bombas e bicos usados nas aferições. Cadastre e edite na aba Filiais do módulo Aferições.</Text>
          </Card>

          </>}

          {isAdmin && <Button title="Excluir filial" icon={TrashIcon} variant="danger" size="sm" onPress={excluir} />}
        </>}
      </ScrollView>
    </SafeAreaView>
  );
}
