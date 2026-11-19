import { useRouter } from 'expo-router';
import { type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Avatar } from '../../components/Avatar';
import { useAuth } from '../../lib/auth';
import { emailValido, enviarEmail } from '../../lib/email';
import { supabase } from '../../lib/supabase';
import { MODULES } from '../../modules/registry';
import { ArrowLeftIcon, CheckIcon, EnvelopeIcon, LockSimpleIcon, MagnifyingGlassIcon, PencilSimpleIcon, PlusIcon, UserCircleIcon } from '../../ui/icons';
import { Button, Card, ChoiceChips, confirmAction, EmptyState, Field, IconButton, notify, SectionHeader, Sheet, StatusPill } from '../../ui/kit';
import { createTypography, pageMaxWidth, radius, space, ThemeContext } from '../../ui/theme';

type Perfil = { user_id: string; email: string; nome: string; avatar: string | null; papel: 'admin' | 'usuario'; ativo: boolean; modulos: string[]; created_at: string };

/** Contas da empresa (somente administrador da empresa): convidar por e-mail, bloquear, definir papel e módulos. */
export default function UsuariosScreen() {
  const router = useRouter();
  const { isAdmin, userId, recarregarPerfil, empresa } = useAuth();
  // Módulos que o plano da empresa tem (só esses podem ser liberados para as contas).
  const modulosDoPlano = MODULES.filter(m => !empresa || empresa.modulos.includes(m.id));
  const { colors } = useContext(ThemeContext);
  const t = useMemo(() => createTypography(colors), [colors]);
  const [perfis, setPerfis] = useState<Perfil[] | null>(null);
  const [erro, setErro] = useState('');
  const [busca, setBusca] = useState('');
  const [atualizando, setAtualizando] = useState(false);
  const [escolha, setEscolha] = useState<Record<string, string[]>>({}); // módulos marcados antes de aprovar
  const [novo, setNovo] = useState<NovoUsuario | null>(null);
  const [criando, setCriando] = useState(false);
  const [edicao, setEdicao] = useState<{ p: Perfil; nome: string; email: string; senha: string } | null>(null);
  const [salvandoEdicao, setSalvandoEdicao] = useState(false);

  const carregar = useCallback(async () => {
    if (!supabase) return;
    const { data, error } = await supabase.from('profiles').select('user_id,email,nome,avatar,papel,ativo,modulos,created_at').is('filial_id', null).order('created_at'); // contas de filial: na tela da filial
    if (error) { setErro('Não foi possível carregar os usuários. Verifique a conexão.'); return; }
    setErro(''); setPerfis(data as Perfil[]);
  }, []);
  useEffect(() => { void carregar(); }, [carregar]);

  const alterar = async (p: Perfil, patch: Partial<Pick<Perfil, 'ativo' | 'papel' | 'modulos'>>) => {
    if (!supabase) return;
    const { error } = await supabase.from('profiles').update(patch).eq('user_id', p.user_id);
    if (error) {
      notify('Não foi possível salvar', /limite de contas/i.test(error.message)
        ? `O plano da empresa permite ${empresa?.limite_contas ?? '?'} contas ativas e todas estão em uso. Inative uma conta ou fale com o EasyAudit para aumentar o plano.`
        : error.message);
      return;
    }
    if (p.user_id === userId) void recarregarPerfil();
    void carregar();
    // Liberou ou bloqueou: avisa o dono da conta por e-mail (o servidor lê o perfil já atualizado).
    if (patch.ativo !== undefined && patch.ativo !== p.ativo) {
      const r = await enviarEmail({ acao: 'conta_alterada', user_id: p.user_id });
      if (!r.ok) notify('Aviso por e-mail não enviado', `A alteração foi salva, mas ${p.email} não foi avisado por e-mail. ${r.erro}`);
    }
  };

  /** Chama a Edge Function "usuarios" (criar, editar, inativar/reativar); devolve o erro em português, se houver. */
  const chamarUsuarios = async (body: Record<string, unknown>): Promise<{ ok: true; data: unknown } | { ok: false; erro: string }> => {
    if (!supabase) return { ok: false, erro: 'Sem servidor configurado.' };
    const { data, error } = await supabase.functions.invoke('usuarios', { body });
    if (!error) return { ok: true, data };
    let erro = 'Não foi possível falar com o servidor. Verifique a conexão.';
    try { const r = (error as { context?: Response }).context; const c = r ? await r.json() : null; if (c?.erro) erro = String(c.erro); } catch { /* sem JSON */ }
    return { ok: false, erro };
  };

  const salvarEdicao = async () => {
    if (!edicao) return;
    const { p } = edicao;
    const nome = edicao.nome.trim(), email = edicao.email.trim().toLowerCase(), senha = edicao.senha;
    if (!nome) { notify('Informe o nome'); return; }
    if (!emailValido(email)) { notify('E-mail inválido', 'Confira o e-mail digitado.'); return; }
    if (senha && senha.length < 8) { notify('Senha muito curta', 'Use pelo menos 8 caracteres (ou toque em "Gerar").'); return; }
    const body: Record<string, unknown> = { acao: 'editar', user_id: p.user_id };
    if (nome !== (p.nome ?? '')) body.nome = nome;
    if (email !== p.email) body.email = email;
    if (senha) body.senha = senha;
    if (Object.keys(body).length === 2) { setEdicao(null); return; }
    setSalvandoEdicao(true);
    const r = await chamarUsuarios(body);
    setSalvandoEdicao(false);
    if (!r.ok) { notify('Dados não alterados', r.erro); return; }
    setEdicao(null); void carregar();
    const partes = [body.nome ? 'nome' : '', body.email ? `e-mail (login agora é ${email})` : '', body.senha ? 'senha' : ''].filter(Boolean);
    notify('Dados alterados', `${nome}: ${partes.join(', ')} atualizado${partes.length > 1 ? 's' : ''}.${body.senha ? ' Passe a nova senha para a pessoa.' : ''}`);
  };

  /** Inativar: tira o acesso aos dados e bloqueia o login no servidor. Reativar: libera os dois. */
  const mudarStatus = async (p: Perfil, ativo: boolean) => {
    const r = await chamarUsuarios({ acao: 'status', user_id: p.user_id, ativo });
    if (!r.ok) { notify(ativo ? 'Usuário não reativado' : 'Usuário não inativado', r.erro); return; }
    void carregar();
    const aviso = await enviarEmail({ acao: 'conta_alterada', user_id: p.user_id });
    if (!aviso.ok) notify('Aviso por e-mail não enviado', `A alteração foi salva, mas ${p.email} não foi avisado por e-mail. ${aviso.erro}`);
  };

  /** Convite por e-mail: a pessoa recebe o link, cria a própria senha e entra na empresa com o papel e os módulos. */
  const convidar = async () => {
    if (!supabase || !novo) return;
    const email = novo.email.trim().toLowerCase();
    if (!novo.nome.trim()) { notify('Informe o nome', 'O nome aparece nos registros e relatórios de quem fez cada atividade.'); return; }
    if (!emailValido(email)) { notify('E-mail inválido', 'Confira o e-mail digitado.'); return; }
    if (novo.papel === 'usuario' && !novo.modulos.length) { notify('Marque os módulos', 'Escolha ao menos um módulo que a pessoa vai usar.'); return; }
    setCriando(true);
    const res = await chamarUsuarios({ acao: 'convidar', email, nome: novo.nome.trim(), papel: novo.papel, modulos: novo.modulos });
    setCriando(false);
    if (!res.ok) { notify('Convite não enviado', res.erro); return; }
    const existente = (res.data as { existente?: boolean } | null)?.existente;
    setNovo(null); void carregar();
    notify('Convite enviado', existente
      ? `${email} já tinha conta no EasyAudit e agora faz parte da sua empresa. Ela recebeu um e-mail com o link para entrar.`
      : `${novo.nome.trim()} recebeu um e-mail em ${email} com o link para criar a senha. A conta já aparece na lista e ocupa uma das contas do plano.`);
  };
  const reenviar = async (p: Perfil) => {
    const r = await chamarUsuarios({ acao: 'reenviar', user_id: p.user_id });
    notify(r.ok ? 'Link enviado' : 'Link não enviado', r.ok ? `${p.email} recebeu um e-mail com o link para definir a senha e entrar.` : r.erro);
  };

  const lista = (perfis ?? []).filter(p => `${p.email} ${p.nome}`.toLowerCase().includes(busca.toLowerCase()));
  // Pendente: nunca aprovada (inativa e sem módulos). Bloqueada: inativa depois de já ter tido acesso.
  const pendentes = lista.filter(p => !p.ativo && p.papel !== 'admin' && !(p.modulos ?? []).length);
  const ativos = lista.filter(p => p.ativo);
  const bloqueados = lista.filter(p => !p.ativo && !pendentes.includes(p));
  const voltar = () => (router.canGoBack() ? router.back() : router.replace('/'));

  const modChips = (sel: string[], onToggle: (id: string) => void) => (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
      {modulosDoPlano.map(m => {
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
        {cabecalho(p, <StatusPill label={p.ativo ? (p.papel === 'admin' ? 'Administrador' : 'Ativo') : 'Inativo'} tone={p.ativo ? (p.papel === 'admin' ? 'accent' : 'success') : 'danger'} />)}
        {eu ? <Text style={t.caption}>Sua conta: o nome, o e-mail e a senha se alteram em Minha conta. Você não pode mudar o próprio papel nem inativar a própria conta.</Text> : <>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
            <Button title="Editar dados (nome, e-mail, senha)" icon={PencilSimpleIcon} variant="secondary" size="sm"
              onPress={() => setEdicao({ p, nome: p.nome ?? '', email: p.email, senha: '' })} />
            {p.ativo ? <Button title="Enviar link de acesso" icon={EnvelopeIcon} variant="ghost" size="sm" onPress={() => void reenviar(p)} /> : null}
          </View>
          <ChoiceChips value={p.papel === 'admin' ? 'Administrador' : 'Usuário'} options={['Usuário', 'Administrador']}
            onChange={v => confirmAction('Alterar papel?', v === 'Administrador'
              ? `${p.email} passará a acessar todos os módulos e a gerenciar usuários, filiais e parâmetros.`
              : `${p.email} passará a usar só os módulos marcados.`, 'Alterar', () => void alterar(p, { papel: v === 'Administrador' ? 'admin' : 'usuario' }))} />
          {p.papel === 'admin' ? <Text style={t.caption}>Administrador acessa todos os módulos.</Text> : <>
            <Text style={t.label}>Módulos liberados</Text>
            {modChips(mods, id => void alterar(p, { modulos: mods.includes(id) ? mods.filter(x => x !== id) : [...mods, id] }))}
            {p.ativo && !mods.length ? <Text style={[t.caption, { color: colors.warning }]}>Conta com acesso, mas sem módulos: ela entra e não vê nenhum módulo.</Text> : null}
          </>}
          <Button title={p.ativo ? 'Inativar usuário' : 'Reativar usuário'} variant={p.ativo ? 'danger' : 'secondary'} size="sm"
            onPress={() => (p.ativo
              ? confirmAction('Inativar usuário?', `${p.nome || p.email} não conseguirá mais entrar no EasyAudit nem ver ou enviar dados. Tudo o que essa pessoa já registrou continua guardado, com o nome dela. Dá para reativar depois.`, 'Inativar', () => void mudarStatus(p, false))
              : confirmAction('Reativar usuário?', `${p.nome || p.email} volta a entrar no EasyAudit com o mesmo e-mail e senha, e a ver os módulos marcados.`, 'Reativar', () => void mudarStatus(p, true)))} />
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
          <Text style={t.caption}>{empresa ? `Contas da ${empresa.nome}` : 'Convide as contas da sua empresa'}</Text>
        </View>
      </View>
      <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.md, width: '100%', maxWidth: pageMaxWidth(760), alignSelf: 'center', paddingBottom: 56 }}
        refreshControl={<RefreshControl refreshing={atualizando} onRefresh={() => { setAtualizando(true); void carregar().finally(() => setAtualizando(false)); }} />}>
        {!isAdmin ? <EmptyState icon={LockSimpleIcon} title="Acesso restrito" text="Somente o administrador gerencia usuários." />
          : erro ? <EmptyState icon={UserCircleIcon} title="Sem conexão" text={erro} action={{ label: 'Tentar de novo', onPress: () => void carregar() }} />
          : <>
            {empresa ? (() => {
              const usadas = (perfis ?? []).filter(p => p.ativo).length;
              const cheio = usadas >= empresa.limite_contas;
              return (
                <Card style={{ gap: 6 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
                    <Text style={[t.bodyStrong, { flex: 1 }]}>Contas ativas: {usadas} de {empresa.limite_contas}</Text>
                    <StatusPill label={cheio ? 'Plano cheio' : `${empresa.limite_contas - usadas} livre(s)`} tone={cheio ? 'danger' : 'success'} />
                  </View>
                  <View style={{ height: 8, borderRadius: 4, backgroundColor: colors.surfaceMuted, overflow: 'hidden' }}>
                    <View style={{ width: `${Math.min(100, (usadas / empresa.limite_contas) * 100)}%`, height: 8, borderRadius: 4, backgroundColor: cheio ? colors.danger : colors.accent }} />
                  </View>
                  <Text style={t.caption}>Contas inativas e acessos de filial não contam. Para mais contas ou módulos, fale com o EasyAudit para mudar o plano.</Text>
                </Card>
              );
            })() : null}
            <Button title="Convidar pessoa por e-mail" icon={PlusIcon} onPress={() => setNovo({ nome: '', email: '', senha: '', papel: 'usuario', modulos: [], avisar: true })} />
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
            }) : <Text style={t.caption}>Nenhuma conta esperando. Para incluir alguém, use "Convidar pessoa por e-mail".</Text>}

            <SectionHeader title={`Com acesso (${ativos.length})`} />
            {ativos.map(cartaoConta)}

            {bloqueados.length ? <>
              <SectionHeader title={`Inativos (${bloqueados.length})`} />
              {bloqueados.map(cartaoConta)}
            </> : null}

            <Text style={t.caption}>Cada conta vê só os dados da sua empresa e usa só os módulos marcados; o banco de dados aplica a mesma regra.</Text>
          </>}
      </ScrollView>

      {edicao && (
        <Sheet title="Editar usuário" onClose={() => !salvandoEdicao && setEdicao(null)}
          footer={<Button title={salvandoEdicao ? 'Salvando…' : 'Salvar alterações'} icon={CheckIcon} disabled={salvandoEdicao} onPress={() => void salvarEdicao()} />}>
          <Field label="Nome" value={edicao.nome} onChangeText={v => setEdicao({ ...edicao, nome: v })} maxLength={80} />
          <Field label="E-mail (login)" value={edicao.email} onChangeText={v => setEdicao({ ...edicao, email: v })} keyboardType="email-address" autoCapitalize="none" autoComplete="off" />
          {edicao.email.trim().toLowerCase() !== edicao.p.email ? <Text style={[t.caption, { color: colors.warning }]}>O login muda na hora: a pessoa passa a entrar com o e-mail novo.</Text> : null}
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: space.sm }}>
            <View style={{ flex: 1 }}>
              <Field label="Nova senha (deixe vazio para manter)" value={edicao.senha} onChangeText={v => setEdicao({ ...edicao, senha: v })} placeholder="Mínimo 8 caracteres" autoCapitalize="none" autoCorrect={false} autoComplete="off" />
            </View>
            <Button title="Gerar" size="sm" variant="secondary" onPress={() => setEdicao({ ...edicao, senha: gerarSenha() })} />
          </View>
          <Text style={t.caption}>Se trocar a senha, passe a nova para a pessoa. Papel e módulos se alteram no próprio cartão do usuário.</Text>
        </Sheet>
      )}

      {novo && (
        <Sheet title="Convidar pessoa" onClose={() => !criando && setNovo(null)}
          footer={<Button title={criando ? 'Enviando…' : 'Enviar convite'} icon={EnvelopeIcon} disabled={criando} onPress={() => void convidar()} />}>
          <Field label="Nome" value={novo.nome} onChangeText={v => setNovo({ ...novo, nome: v })} placeholder="Como aparece nos registros e relatórios" maxLength={80} />
          <Field label="E-mail (login)" value={novo.email} onChangeText={v => setNovo({ ...novo, email: v })} placeholder="pessoa@email.com" keyboardType="email-address" autoCapitalize="none" autoComplete="off" />
          <Text style={t.caption}>A pessoa recebe um e-mail com o link para criar a própria senha. Você não precisa saber nem passar a senha.</Text>
          <Text style={t.label}>Papel</Text>
          <ChoiceChips value={novo.papel === 'admin' ? 'Administrador' : 'Usuário'} options={['Usuário', 'Administrador']} onChange={v => setNovo({ ...novo, papel: v === 'Administrador' ? 'admin' : 'usuario' })} />
          {novo.papel === 'admin'
            ? <Text style={t.caption}>Administrador acessa todos os módulos do plano e gerencia usuários, filiais e parâmetros da empresa.</Text>
            : <>
              <Text style={t.label}>Módulos que esta conta vai usar</Text>
              {modChips(novo.modulos, id => setNovo({ ...novo, modulos: novo.modulos.includes(id) ? novo.modulos.filter(x => x !== id) : [...novo.modulos, id] }))}
            </>}
        </Sheet>
      )}
    </SafeAreaView>
  );
}

type NovoUsuario = { nome: string; email: string; senha: string; papel: 'usuario' | 'admin'; modulos: string[]; avisar: boolean };

/** Senha inicial fácil de ditar: sem letras parecidas (l, I, O, 0). */
function gerarSenha() {
  const letras = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ', numeros = '23456789';
  const sorteio = (conj: string, n: number) => Array.from({ length: n }, () => conj[Math.floor(Math.random() * conj.length)]).join('');
  return `${sorteio(letras, 6)}${sorteio(numeros, 4)}`;
}
