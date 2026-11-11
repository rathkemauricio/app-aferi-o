import * as Linking from 'expo-linking';
import { useRouter } from 'expo-router';
import { useContext, useEffect, useMemo, useState } from 'react';
import { Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { traduzirErro } from '../../components/AuthScreen';
import { Avatar, escolherFoto } from '../../components/Avatar';
import { useAuth } from '../../lib/auth';
import { isSupabaseConfigured, supabase } from '../../lib/supabase';
import { MODULES } from '../../modules/registry';
import { ArrowLeftIcon, CheckIcon, EnvelopeIcon, LockSimpleIcon, MoonIcon, PencilSimpleIcon, SignOutIcon, SunIcon, TrashIcon, UserCircleIcon } from '../../ui/icons';
import { Button, Card, confirmAction, Field, IconButton, ListRow, notify, SectionHeader, Sheet, StatusPill } from '../../ui/kit';
import { createTypography, space, ThemeContext } from '../../ui/theme';

/** Informações da conta: foto, nome, e-mail, senha, módulos liberados, tema e saída. */
export default function ContaScreen() {
  const router = useRouter();
  const { userEmail, isAdmin, ativo, podeAcessar, signOut, nome, avatar, recarregarPerfil } = useAuth();
  const { colors, mode, toggleTheme } = useContext(ThemeContext);
  const t = useMemo(() => createTypography(colors), [colors]);
  const liberados = MODULES.filter(m => podeAcessar(m.id));
  const voltar = () => (router.canGoBack() ? router.back() : router.replace('/'));
  const divisor = { borderTopWidth: 1, borderTopColor: colors.border, borderRadius: 0 };

  const [nomeEdit, setNomeEdit] = useState(nome);
  const [salvando, setSalvando] = useState(false);
  const [foto, setFoto] = useState(false);
  const [novoEmail, setNovoEmail] = useState<string | null>(null);
  useEffect(() => { setNomeEdit(nome); }, [nome]);

  const salvarPerfil = async (n: string, a: string | null) => {
    if (!supabase) return;
    setSalvando(true);
    const { error } = await supabase.rpc('atualizar_meu_perfil', { p_nome: n.trim(), p_avatar: a });
    setSalvando(false);
    if (error) { notify('Não foi possível salvar', traduzirErro(error)); return false; }
    await recarregarPerfil();
    return true;
  };
  const trocarFoto = async (origem: 'galeria' | 'camera') => {
    setFoto(false);
    try {
      const uri = await escolherFoto(origem);
      if (uri) await salvarPerfil(nomeEdit || nome, uri);
    } catch (e) { notify('Não foi possível usar a foto', e instanceof Error ? e.message : ''); }
  };
  const pedirTrocaEmail = async () => {
    if (!supabase || !novoEmail) return;
    const mail = novoEmail.trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(mail)) { notify('E-mail inválido'); return; }
    if (mail === userEmail) { notify('Este já é o e-mail da conta'); return; }
    setSalvando(true);
    const { error } = await supabase.auth.updateUser({ email: mail }, { emailRedirectTo: Linking.createURL('/conta') });
    setSalvando(false);
    if (error) { notify('Não foi possível alterar o e-mail', traduzirErro(error)); return; }
    setNovoEmail(null);
    notify('Confirme a troca de e-mail', `Enviamos links de confirmação para ${userEmail} e ${mail}. A troca vale depois da confirmação; até lá, continue entrando com o e-mail atual.`);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.lg, paddingVertical: space.md, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border }}>
        <IconButton icon={ArrowLeftIcon} label="Voltar" onPress={voltar} />
        <Text style={{ flex: 1, fontSize: 15.5, fontWeight: '800', color: colors.text }}>Minha conta</Text>
      </View>
      <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.md, width: '100%', maxWidth: 640, alignSelf: 'center', paddingBottom: 56 }} keyboardShouldPersistTaps="handled">
        <Card style={{ alignItems: 'center', gap: space.sm, paddingVertical: space.xl }}>
          <Pressable onPress={() => isSupabaseConfigured && setFoto(true)} accessibilityRole="button" accessibilityLabel="Alterar foto de perfil">
            <Avatar uri={avatar} nome={nome || userEmail} size={88} />
            {isSupabaseConfigured ? (
              <View style={{ position: 'absolute', right: -2, bottom: -2, width: 30, height: 30, borderRadius: 15, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.surface }}>
                <PencilSimpleIcon size={14} color="#fff" weight="bold" />
              </View>
            ) : null}
          </Pressable>
          <Text style={t.section} numberOfLines={1}>{nome || userEmail || 'Modo local'}</Text>
          {nome && userEmail ? <Text style={t.caption}>{userEmail}</Text> : null}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'center' }}>
            {isSupabaseConfigured
              ? <><StatusPill label={isAdmin ? 'Administrador' : 'Usuário'} tone={isAdmin ? 'accent' : 'neutral'} /><StatusPill label={ativo ? 'Conta liberada' : 'Aguardando liberação'} tone={ativo ? 'success' : 'warning'} /></>
              : <StatusPill label="Sem conta: dados só neste aparelho" />}
          </View>
        </Card>

        {isSupabaseConfigured && <>
          <SectionHeader title="Dados da conta" />
          <Card>
            <Field label="Nome de exibição" value={nomeEdit} onChangeText={setNomeEdit} placeholder="Como você quer ser chamado" maxLength={80} />
            <Button title="Salvar nome" icon={CheckIcon} size="sm" variant="secondary" disabled={salvando || nomeEdit.trim() === nome.trim()} onPress={() => void salvarPerfil(nomeEdit, avatar)} style={{ alignSelf: 'flex-start' }} />
          </Card>
          <Card style={{ padding: space.xs, gap: 0 }}>
            <ListRow icon={EnvelopeIcon} tint="slate" title="Alterar e-mail" subtitle={userEmail ?? ''} onPress={() => setNovoEmail('')} />
            <ListRow style={divisor} icon={LockSimpleIcon} tint="slate" title="Alterar senha" subtitle="Definir uma nova senha para esta conta" onPress={() => router.push('/redefinir-senha')} />
          </Card>
        </>}

        <SectionHeader title="Módulos liberados" />
        <Card style={{ padding: space.xs, gap: 0 }}>
          {liberados.length ? liberados.map((m, i) => (
            <ListRow key={m.id} style={i > 0 && divisor} icon={m.icon} tint={m.tint} title={m.name} onPress={() => router.push(m.route)} />
          )) : <Text style={[t.caption, { padding: space.md }]}>Nenhum módulo liberado. Peça ao administrador.</Text>}
        </Card>

        <SectionHeader title="Configurações" />
        <Card style={{ padding: space.xs, gap: 0 }}>
          {isAdmin && isSupabaseConfigured ? <ListRow icon={UserCircleIcon} tint="indigo" title="Usuários e permissões" subtitle="Aprovar contas, papel e módulos de cada uma" onPress={() => router.push('/usuarios')} /> : null}
          <ListRow style={isAdmin && isSupabaseConfigured && divisor} icon={mode === 'dark' ? SunIcon : MoonIcon} tint="slate" title={mode === 'dark' ? 'Usar tema claro' : 'Usar tema escuro'} onPress={toggleTheme} />
        </Card>

        {isSupabaseConfigured ? (
          <View style={{ gap: space.sm, marginTop: space.sm }}>
            <Button title="Entrar com outra conta" variant="secondary" icon={UserCircleIcon} onPress={() => confirmAction('Trocar de conta?', 'Você sai desta conta e volta para a tela de login. Registros ainda não enviados continuam salvos neste aparelho.', 'Trocar', () => void signOut())} />
            <Button title="Sair" variant="danger" icon={SignOutIcon} onPress={() => confirmAction('Sair da conta?', 'Você volta para a tela de login.', 'Sair', () => void signOut())} />
          </View>
        ) : null}
      </ScrollView>

      {foto && (
        <Sheet title="Foto de perfil" onClose={() => setFoto(false)}>
          <Card style={{ padding: space.xs, gap: 0 }}>
            <ListRow icon={UserCircleIcon} tint="indigo" title="Escolher da galeria" onPress={() => void trocarFoto('galeria')} />
            {Platform.OS !== 'web' ? <ListRow style={divisor} icon={UserCircleIcon} tint="indigo" title="Tirar foto" onPress={() => void trocarFoto('camera')} /> : null}
            {avatar ? <ListRow style={divisor} icon={TrashIcon} tint="slate" title="Remover foto" onPress={() => { setFoto(false); void salvarPerfil(nomeEdit || nome, null); }} /> : null}
          </Card>
          <Text style={t.caption}>A foto é reduzida para uma miniatura antes de ser salva.</Text>
        </Sheet>
      )}

      {novoEmail !== null && (
        <Sheet title="Alterar e-mail" onClose={() => setNovoEmail(null)}
          footer={<Button title={salvando ? 'Enviando…' : 'Enviar confirmação'} icon={EnvelopeIcon} disabled={salvando || !novoEmail.trim()} onPress={() => void pedirTrocaEmail()} />}>
          <Text style={t.caption}>E-mail atual: {userEmail}. Enviaremos um link de confirmação para o e-mail atual e para o novo. A troca vale depois da confirmação.</Text>
          <Field label="Novo e-mail" value={novoEmail} onChangeText={setNovoEmail} keyboardType="email-address" autoCapitalize="none" autoComplete="email" placeholder="novo@email.com" />
        </Sheet>
      )}
    </SafeAreaView>
  );
}
