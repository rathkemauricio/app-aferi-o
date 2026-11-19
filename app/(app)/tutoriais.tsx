import { useRouter } from 'expo-router';
import { useContext, useMemo } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../lib/auth';
import { TUTORIAIS } from '../../lib/tutoriais';
import { useTutorial } from '../../tutoriais';
import { ArrowLeftIcon, GraduationCapIcon, PlayCircleIcon, ResetIcon } from '../../ui/icons';
import { Button, Card, IconButton, IconTile, notify, StatusPill } from '../../ui/kit';
import { createTypography, pageMaxWidth, space, ThemeContext } from '../../ui/theme';

/** Tutoriais interativos: lista os disponíveis para a conta, com Começar/Rever e Recomeçar todos. */
export default function TutoriaisScreen() {
  const router = useRouter();
  const { podeAcessar, isAdmin } = useAuth();
  const tut = useTutorial();
  const { colors } = useContext(ThemeContext);
  const t = useMemo(() => createTypography(colors), [colors]);
  const lista = TUTORIAIS.filter(x => (!x.modulo || podeAcessar(x.modulo)) && (!x.soAdmin || isAdmin));
  const voltar = () => (router.canGoBack() ? router.back() : router.replace('/'));
  const vistos = lista.filter(x => tut.jaVisto(x.id)).length;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.lg, paddingVertical: space.md, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border }}>
        <IconButton icon={ArrowLeftIcon} label="Voltar" onPress={voltar} />
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 15.5, fontWeight: '800', color: colors.text }}>Tutoriais</Text>
          <Text style={t.caption}>{vistos} de {lista.length} vistos neste aparelho</Text>
        </View>
      </View>
      <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.md, width: '100%', maxWidth: pageMaxWidth(720), alignSelf: 'center', paddingBottom: 56 }}>
        <Card style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
          <IconTile icon={GraduationCapIcon} tint="indigo" size={44} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={t.bodyStrong}>Aprenda usando o próprio app</Text>
            <Text style={t.caption}>Cada tutorial destaca a parte da tela que está explicando. Em alguns passos, você toca no destaque para seguir.</Text>
          </View>
        </Card>
        {lista.map(x => {
          const visto = tut.jaVisto(x.id);
          return (
            <Card key={x.id} style={{ gap: space.sm }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
                <IconTile icon={x.icone} tint={visto ? 'slate' : 'sky'} size={40} />
                <View style={{ flex: 1 }}>
                  <Text style={t.bodyStrong}>{x.titulo}</Text>
                  <Text style={t.caption}>{x.passos.length} passos{x.descricao ? ` · ${x.descricao}` : ''}</Text>
                </View>
                {visto ? <StatusPill label="Visto" tone="success" /> : <StatusPill label="Novo" tone="accent" />}
              </View>
              <Button title={visto ? 'Rever' : 'Começar'} icon={PlayCircleIcon} size="sm" variant={visto ? 'secondary' : 'primary'} onPress={() => tut.iniciar(x.id)} />
            </Card>
          );
        })}
        <Button title="Recomeçar todos" icon={ResetIcon} variant="ghost" size="sm" onPress={() => { tut.esquecer(); notify('Tutoriais recomeçados', 'Os tutoriais voltam como novos neste aparelho; o de primeiros passos abre sozinho na tela inicial.'); }} />
      </ScrollView>
    </SafeAreaView>
  );
}
