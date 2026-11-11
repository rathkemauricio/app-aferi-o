import { useRouter } from 'expo-router';
import { useContext, useEffect, useMemo, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Avatar } from '../../components/Avatar';
import { useAuth } from '../../lib/auth';
import { isSupabaseConfigured, supabase } from '../../lib/supabase';
import { MODULES, type AppModule } from '../../modules/registry';
import { ArrowRightIcon, DropIcon, GasPumpIcon, LockSimpleIcon, MoonIcon, SignOutIcon, SquaresFourIcon, StorefrontIcon, SunIcon, UserCircleIcon } from '../../ui/icons';
import { Card, confirmAction, EmptyState, IconButton, IconTile, ListRow, SectionHeader, StatusPill } from '../../ui/kit';
import { createTypography, radius, space, ThemeContext, type ThemeColors } from '../../ui/theme';

// Tela inicial após o login: lista os módulos disponíveis. Não conhece detalhes de nenhum módulo.
export default function ModuleLauncher() {
  const router = useRouter();
  const { userEmail, isAdmin, podeAcessar, nome, avatar, signOut } = useAuth();
  const [pendentes, setPendentes] = useState(0);
  // Administrador: quantas contas novas esperam aprovação.
  useEffect(() => {
    if (!isAdmin || !supabase) return;
    void supabase.from('profiles').select('user_id', { count: 'exact', head: true }).eq('ativo', false).eq('papel', 'usuario').eq('modulos', '{}')
      .then(({ count }) => setPendentes(count ?? 0));
  }, [isAdmin]);
  const modulos = MODULES.filter(m => podeAcessar(m.id));
  const { mode, colors, toggleTheme } = useContext(ThemeContext);
  const t = useMemo(() => createTypography(colors), [colors]);
  const s = useMemo(() => createStyles(colors), [colors]);

  return (
    <SafeAreaView style={s.safe} edges={['top', 'bottom']}>
      <View style={s.header}>
        <Image source={require('../../assets/favicon.png')} style={{ width: 36, height: 36 }} accessibilityLabel="Postora" />
        <View style={s.flex}>
          <Text style={s.brandName}>Postora</Text>
          <Text style={s.brandSub}>Central de módulos</Text>
        </View>
        <IconButton icon={mode === 'dark' ? SunIcon : MoonIcon} label={mode === 'dark' ? 'Ativar modo claro' : 'Ativar modo escuro'} onPress={toggleTheme} />
        <Pressable onPress={() => router.push('/conta')} accessibilityRole="button" accessibilityLabel="Minha conta" hitSlop={6}>
          <Avatar uri={avatar} nome={nome || userEmail} size={36} />
        </Pressable>
        {isSupabaseConfigured && userEmail ? (
          <IconButton icon={SignOutIcon} label="Sair da conta" onPress={() => confirmAction('Sair da conta?', 'Você volta para a tela de login. Registros ainda não enviados continuam salvos neste aparelho.', 'Sair', () => void signOut())} />
        ) : null}
      </View>

      <ScrollView contentContainerStyle={s.content}>
        <Pressable style={s.account} onPress={() => router.push('/conta')} accessibilityRole="button" accessibilityLabel="Minha conta">
          <UserCircleIcon size={18} color={colors.textMuted} />
          <Text style={t.caption} numberOfLines={1}>
            {nome || userEmail || (isSupabaseConfigured ? 'Sessão sem e-mail' : 'Modo local, sem conta conectada')}
          </Text>
          {isAdmin && isSupabaseConfigured ? <StatusPill label="Administrador" tone="accent" /> : null}
        </Pressable>

        {pendentes > 0 ? (
          <Card style={s.listCard}>
            <ListRow icon={UserCircleIcon} tint="amber" title={`${pendentes} conta${pendentes > 1 ? 's' : ''} aguardando aprovação`} subtitle="Aprovar e escolher os módulos de cada uma" onPress={() => router.push('/usuarios')} />
          </Card>
        ) : null}

        <View style={s.head}>
          <Text style={t.title}>Módulos</Text>
          <Text style={t.caption}>Escolha onde você quer trabalhar.</Text>
        </View>

        {!modulos.length ? (
          <EmptyState icon={LockSimpleIcon} title="Nenhum módulo liberado" text="O administrador ainda não liberou módulos para a sua conta." />
        ) : null}
        <View style={s.grid}>
          {modulos.map(m => <ModuleCard key={m.id} module={m} onOpen={() => router.push(m.route)} />)}
          <View style={[s.tile, s.placeholder]}>
            <IconTile icon={SquaresFourIcon} tint="slate" size={44} />
            <Text style={t.bodyStrong}>Novos módulos</Text>
            <Text style={t.caption}>Aparecem aqui assim que forem integrados à plataforma.</Text>
          </View>
        </View>

        <SectionHeader title="Cadastros" />
        <Card style={s.listCard}>
          <ListRow icon={StorefrontIcon} tint="sky" title="Filiais" subtitle="Cadastro único: dados, bandeira, croqui e equipamentos de cada filial" onPress={() => router.push('/filiais')} />
          <ListRow style={s.divided} icon={DropIcon} tint="amber" title="Combustíveis" subtitle="Tipos de combustível usados nos bicos e nos croquis" onPress={() => router.push('/combustiveis')} />
          <ListRow style={s.divided} icon={StorefrontIcon} tint="indigo" title="Bandeiras" subtitle="Bandeiras dos postos, com cores para o croqui" onPress={() => router.push('/bandeiras')} />
          {isAdmin && isSupabaseConfigured ? <ListRow style={s.divided} icon={UserCircleIcon} tint="slate" title="Usuários e permissões" subtitle="Liberar contas e escolher os módulos de cada uma" onPress={() => router.push('/usuarios')} /> : null}
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}

function ModuleCard({ module: m, onOpen }: { module: AppModule; onOpen: () => void }) {
  const { colors } = useContext(ThemeContext);
  const t = useMemo(() => createTypography(colors), [colors]);
  const s = useMemo(() => createStyles(colors), [colors]);
  const aviso = m.useAviso?.() ?? null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Abrir módulo ${m.name}`}
      onPress={onOpen}
      style={({ pressed }) => [s.tile, s.card, pressed && s.pressed]}
    >
      <View style={s.tileTop}>
        <IconTile icon={m.icon} tint={m.tint} size={48} />
        <View style={s.open}><ArrowRightIcon size={16} color={colors.accentText} weight="bold" /></View>
      </View>
      <Text style={[t.section, s.tileName]}>{m.name}</Text>
      <Text style={t.caption}>{m.description}</Text>
      {aviso ? <View style={{ marginTop: 6 }}><StatusPill label={aviso} tone="accent" /></View> : null}
    </Pressable>
  );
}

const createStyles = (c: ThemeColors) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: c.bg },
  flex: { flex: 1 },

  header: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.lg, paddingVertical: space.md, backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border },
  brandMark: { width: 34, height: 34, borderRadius: radius.tile, backgroundColor: c.accent, alignItems: 'center', justifyContent: 'center' },
  brandName: { fontSize: 15.5, fontWeight: '800', color: c.text, letterSpacing: -0.2 },
  brandSub: { fontSize: 12, color: c.textMuted },

  content: { padding: space.lg, paddingBottom: space.xxl * 2, gap: space.lg, width: '100%', maxWidth: 960, alignSelf: 'center' },
  account: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  head: { gap: 2 },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md },
  tile: { flexGrow: 1, flexBasis: 260, minHeight: 172, padding: space.lg, gap: 6, borderRadius: radius.card },
  card: { backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, shadowColor: '#1b2333', shadowOpacity: 0.05, shadowRadius: 10, shadowOffset: { width: 0, height: 3 }, elevation: 1 },
  pressed: { transform: [{ scale: 0.98 }], backgroundColor: c.surfaceMuted },
  placeholder: { borderWidth: 1, borderStyle: 'dashed', borderColor: c.borderStrong },
  tileTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: space.sm },
  tileName: { marginTop: 2 },
  listCard: { padding: space.xs, gap: 0 },
  divided: { borderTopWidth: 1, borderTopColor: c.border, borderRadius: 0 },
  open: { width: 32, height: 32, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: c.accentSoft },
});
