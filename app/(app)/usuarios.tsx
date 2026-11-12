import { useRouter } from 'expo-router';
import { type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Avatar } from '../../components/Avatar';
import { useAuth } from '../../lib/auth';
import { enviarEmail } from '../../lib/email';
import { supabase } from '../../lib/supabase';
import { MODULES } from '../../modules/registry';
import { ArrowLeftIcon, CheckIcon, LockSimpleIcon, MagnifyingGlassIcon, UserCircleIcon } from '../../ui/icons';
import { Button, Card, ChoiceChips, confirmAction, EmptyState, Field, IconButton, notify, SectionHeader, StatusPill } from '../../ui/kit';
import { createTypography, pageMaxWidth, radius, space, ThemeContext } from '../../ui/theme';

type Perfil = { user_id: string; email: string; nome: string; avatar: string | null; papel: 'admin' | 'usuario'; ativo: boolean; modulos: string[]; created_at: string };

/** Gerenciamento de usuários (somente administrador): aprovar contas novas, bloquear, definir papel e módulos. */
export default function UsuariosScreen() {
  const router = useRouter();
  const { isAdmin, userId, recarregarPerfil } = useAuth();
  const { colors } = useContext(ThemeContext);
  const t = useMemo(() => createTypography(colors), [colors]);
  const [perfis, setPerfis] = useState<Perfil[] | null>(null);
  const [erro, setErro] = useState('');
  const [busca, setBusca] = useState('');
  const [atualizando, setAtualizando] = useState(false);
  const [escolha, setEscolha] = useState<Record<string, string[]>>({}); // módulos marcados antes de aprovar

  const carregar = useCallback(async () => {
    if (!supabase) return;
    const { data, error } = await supabase.from('profiles').select('user_id,email,nome,avatar,papel,ativo,modulos,created_at').order('created_at');
    if (error) { setErro('Não foi possível carregar os usuários. Verifique a conexão.'); return; }
    setErro(''); setPerfis(data as Perfil[]);
  }, []);
  useEffect(() => { void carregar(); }, [carregar]);

  const alterar = async (p: Perfil, patch: Partial<Pick<Perfil, 'ativo' | 'papel' | 'modulos'>>) => {
    if (!supabase) return;
    const { error } = await supabase.from('profiles').update(patch).eq('user_id', p.user_id);
    if (error) { notify('Não foi possível salvar', error.message); return; }
    if (p.user_id === userId) void recarregarPerfil();
    void carregar();
    // Liberou ou bloqueou: avisa o dono da conta por e-mail (o servidor lê o perfil já atualizado).
    if (patch.ativo !== undefined && patch.ativo !== p.ativo) {
      const r = await enviarEmail({ acao: 'conta_alterada', user_id: p.user_id });
      if (!r.ok) notify('Aviso por e-mail não enviado', `A alteração foi salva, mas ${p.email} não foi avisado por e-mail. ${r.erro}`);
    }
  };

  const lista = (perfis ?? []).filter(p => `${p.email} ${p.nome}`.toLowerCase().includes(busca.toLowerCase()));
  // Pendente: nunca aprovada (inativa e sem módulos). Bloqueada: inativa depois de já ter tido acesso.
  const pendentes = lista.filter(p => !p.ativo && p.papel !== 'admin' && !(p.modulos ?? []).length);
  const ativos = lista.filter(p => p.ativo);
  const bloqueados = lista.filter(p => !p.ativo && !pendentes.includes(p));
  const voltar = () => (router.canGoBack() ? router.back() : router.replace('/'));

  const modChips = (sel: string[], onToggle: (id: string) => void) => (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
      {MODULES.map(m => {
        const on = sel.includes(m.id);
        return (
          <Pressable key={m.id} accessibilityRole="checkbox" accessibilityState={{ checked: on }} onPress={() => onToggle(m.id)}
            style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 36, paddingHorizontal: 12, borderRadius: radius.pill, borderWidth: 1, borderColor: on ? colors.accent : colors.borderStrong, backgroundColor: on ? colors.accentSoft : colors.surface }, pressed && { opacity: 0.7 }]}>
            {on ? <CheckIcon size={14} color={colors.accentText} weight="bold" /> : null}
            <Text style={{ fontSize: 13, fontWeight: '600', color: on ? colors.accentText : colors.textMuted }}>{m.name}</Text>
          </Pressable>
        );
      })}
    </View>
  );

  const cabecalho = (p: Perfil, pill: ReactNode) => (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
      <Avatar uri={p.avatar} nome={p.nome || p.email} size={40} />
      <View style={{ flex: 1 }}>
        <Text style={t.bodyStrong} numberOfLines={1}>{p.nome || p.email}{p.user_id === userId ? ' (você)' : ''}</Text>
        <Text style={t.caption} numberOfLines={1}>{p.nome ? `${p.email} · ` : ''}conta criada em {new Date(p.created_at).toLocaleDateString('pt-BR')}</Text>
      </View>
      {pill}
    </View>
  );

  const cartaoConta = (p: Perfil) => {
    const eu = p.user_id === userId;
    const mods = p.modulos ?? [];
    return (
      <Card key={p.user_id}>
        {cabecalho(p, <StatusPill label={p.ativo ? (p.papel === 'admin' ? 'Administrador' : 'Com acesso') : 'Bloqueada'} tone={p.ativo ? (p.papel === 'admin' ? 'accent' : 'success') : 'danger'} />)}
        {eu ? <Text style={t.caption}>Você não pode alterar o próprio papel nem bloquear a própria conta.</Text> : <>
          <ChoiceChips value={p.papel === 'admin' ? 'Administrador' : 'Usuário'} options={['Usuário', 'Administrador']}
            onChange={v => confirmAction('Alterar papel?', v === 'Administrador'
              ? `${p.email} passará a acessar todos os módulos e a gerenciar usuários, filiais e parâmetros.`
              : `${p.email} passará a usar só os módulos marcados.`, 'Alterar', () => void alterar(p, { papel: v === 'Administrador' ? 'admin' : 'usuario' }))} />
          {p.papel === 'admin' ? <Text style={t.caption}>Administrador acessa todos os módulos.</Text> : <>
            <Text style={t.label}>Módulos liberados</Text>
            {modChips(mods, id => void alterar(p, { modulos: mods.includes(id) ? mods.filter(x => x !== id) : [...mods, id] }))}
            {p.ativo && !mods.length ? <Text style={[t.caption, { color: colors.warning }]}>Conta com acesso, mas sem módulos: ela entra e não vê nenhum módulo.</Text> : null}
          </>}
          <Button title={p.ativo ? 'Bloquear acesso' : 'Desbloquear'} variant={p.ativo ? 'danger' : 'secondary'} size="sm"
            onPress={() => (p.ativo
              ? confirmAction('Bloquear acesso?', `${p.email} não conseguirá mais ver nem enviar dados. Registros feitos por ela continuam guardados.`, 'Bloquear', () => void alterar(p, { ativo: false }))
              : void alterar(p, { ativo: true }))} />
        </>}
      </Card>
    );
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.lg, paddingVertical: space.md, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border }}>
        <IconButton icon={ArrowLeftIcon} label="Voltar" onPress={voltar} />
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 15.5, fontWeight: '800', color: colors.text }}>Usuários e permissões</Text>
          <Text style={t.caption}>Contas novas só acessam depois da sua aprovação</Text>
        </View>
      </View>
      <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.md, width: '100%', maxWidth: pageMaxWidth(760), alignSelf: 'center', paddingBottom: 56 }}
        refreshControl={<RefreshControl refreshing={atualizando} onRefresh={() => { setAtualizando(true); void carregar().finally(() => setAtualizando(false)); }} />}>
        {!isAdmin ? <EmptyState icon={LockSimpleIcon} title="Acesso restrito" text="Somente o administrador gerencia usuários." />
          : erro ? <EmptyState icon={UserCircleIcon} title="Sem conexão" text={erro} action={{ label: 'Tentar de novo', onPress: () => void carregar() }} />
          : <>
            <Field icon={MagnifyingGlassIcon} value={busca} onChangeText={setBusca} placeholder="Buscar por nome ou e-mail" />

            <SectionHeader title={`Aguardando aprovação (${pendentes.length})`} />
            {pendentes.length ? pendentes.map(p => {
              const sel = escolha[p.user_id] ?? [];
              return (
                <Card key={p.user_id} style={{ borderColor: colors.warning }}>
                  {cabecalho(p, <StatusPill label="Aguardando" tone="warning" />)}
                  <Text style={t.label}>Módulos que esta conta vai usar</Text>
                  {modChips(sel, id => setEscolha(e => ({ ...e, [p.user_id]: sel.includes(id) ? sel.filter(x => x !== id) : [...sel, id] })))}
                  <Button title="Aprovar acesso" icon={CheckIcon} size="sm" disabled={!sel.length} onPress={() => void alterar(p, { ativo: true, modulos: sel })} />
                  <Text style={t.caption}>{sel.length ? 'A conta passa a ver apenas os módulos marcados.' : 'Marque ao menos um módulo para aprovar. Sem aprovação, a conta continua sem acesso a nenhum dado.'}</Text>
                </Card>
              );
            }) : <Text style={t.caption}>Nenhuma conta nova esperando. Quem criar conta pela tela de login aparece aqui.</Text>}

            <SectionHeader title={`Com acesso (${ativos.length})`} />
            {ativos.map(cartaoConta)}

            {bloqueados.length ? <>
              <SectionHeader title={`Bloqueadas (${bloqueados.length})`} />
              {bloqueados.map(cartaoConta)}
            </> : null}

            <Text style={t.caption}>Cada conta vê e usa só os módulos marcados; o banco de dados aplica a mesma regra. Para apagar uma conta definitivamente, use o painel do Supabase (Authentication → Users).</Text>
          </>}
      </ScrollView>
    </SafeAreaView>
  );
}
