import { useRouter } from 'expo-router';
import { type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Avatar } from '../../components/Avatar';
import { useAuth } from '../../lib/auth';
import { useFiliais } from '../../lib/data';
import { Alvo, RolagemTutorial } from '../../tutoriais';
import { emailValido, enviarEmail } from '../../lib/email';
import { supabase } from '../../lib/supabase';
import { MODULES } from '../../modules/registry';
import { ArrowLeftIcon, BuildingsIcon, CheckIcon, EnvelopeIcon, LockSimpleIcon, MagnifyingGlassIcon, PencilSimpleIcon, PlusIcon, StorefrontIcon, UserCircleIcon } from '../../ui/icons';
import { Button, Card, ChoiceChips, confirmAction, EmptyState, Field, IconButton, notify, SectionHeader, Sheet, StatusPill } from '../../ui/kit';
import { createTypography, pageMaxWidth, radius, space, ThemeContext } from '../../ui/theme';
import { BotaoVoltar } from '../../ui/voltar';

type Perfil = { user_id: string; email: string; nome: string; avatar: string | null; papel: 'admin' | 'usuario'; ativo: boolean; modulos: string[]; created_at: string };

/** Contas da empresa (somente administrador da empresa): convidar por e-mail, bloquear, definir papel e módulos. */
export default function UsuariosScreen() {
  const router = useRouter();
  const { isAdmin, userId, recarregarPerfil, empresa, dono } = useAuth();
  const { filiais } = useFiliais();
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
  const [contasFilial, setContasFilial] = useState<{ user_id: string; email: string; ativo: boolean; filial_id: string }[]>([]);
  const [planos, setPlanos] = useState<{ id: string; nome: string; limite_contas: number; modulos: string[] }[]>([]);
  const [buscaFilial, setBuscaFilial] = useState('');
  useEffect(() => {
    if (!supabase || !dono) return;
    void supabase.from('planos').select('id,nome,limite_contas,modulos').eq('ativo', true).order('ordem').then(({ data }) => setPlanos((data ?? []) as typeof planos));
  }, [dono]);

  const carregar = useCallback(async () => {
    if (!supabase) return;
    const { data, error } = await supabase.from('profiles').select('user_id,email,nome,avatar,papel,ativo,modulos,created_at').is('filial_id', null).order('created_at'); // contas de filial: lista própria
    void supabase.from('profiles').select('user_id,email,ativo,filial_id').not('filial_id', 'is', null).then(({ data: f }) => setContasFilial((f ?? []) as typeof contasFilial));
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

  /** Chama a função "empresas" (dono da plataforma); devolve o erro em português, se houver. */
  const chamarEmpresas = async (body: Record<string, unknown>): Promise<string | null> => {
    if (!supabase) return 'Sem servidor configurado.';
    const { error } = await supabase.functions.invoke('empresas', { body });
    if (!error) return null;
    try { const r = (error as { context?: Response }).context; const c = r ? await r.json() : null; if (c?.erro) return String(c.erro); } catch { /* sem JSON */ }
    return 'Não foi possível falar com o servidor. Verifique a conexão.';
  };

  /** Criar conta: pessoa (convite ou senha definida agora), acesso de filial ou empresa nova (dono da plataforma). */
  const convidar = async () => {
    if (!supabase || !novo) return;
    const email = novo.email.trim().toLowerCase();
    if (!emailValido(email)) { notify('E-mail inválido', 'Confira o e-mail digitado.'); return; }
    if (novo.tipo === 'filial') {
      if (!novo.filialId) { notify('Escolha a filial', 'A conta da filial fica presa a uma filial.'); return; }
      setCriando(true);
      const r = await chamarUsuarios({ acao: 'acesso_filial', filial_id: novo.filialId, email });
      setCriando(false);
      if (!r.ok) { notify('Conta não criada', r.erro); return; }
      const f = filiais.find(x => x.id === novo.filialId);
      setNovo(null); void carregar();
      notify('Acesso da filial criado', `${email} recebeu o link para criar a senha. A filial ${f ? `${f.codigo} · ${f.nome}` : ''} entra só em Contagens.`);
      return;
    }
    if (!novo.nome.trim()) { notify('Informe o nome', novo.tipo === 'empresa' ? 'Nome de quem vai administrar a empresa.' : 'O nome aparece nos registros e relatórios de quem fez cada atividade.'); return; }
    if (novo.tipo === 'empresa') {
      if (novo.empresaNome.trim().length < 2) { notify('Informe a empresa', 'Digite o nome da empresa.'); return; }
      if (!novo.planoId) { notify('Escolha o plano'); return; }
      if (!novo.modulosEmpresa.length) { notify('Marque os módulos', 'Escolha ao menos um módulo para a empresa.'); return; }
      setCriando(true);
      const erro = await chamarEmpresas({ acao: 'criar_para', nome: novo.empresaNome.trim(), plano_id: novo.planoId, modulos: novo.modulosEmpresa, limite_contas: novo.limite, admin_nome: novo.nome.trim(), admin_email: email });
      setCriando(false);
      if (erro) { notify('Empresa não criada', erro); return; }
      setNovo(null);
      notify('Empresa criada', `${novo.empresaNome.trim()} já está liberada. ${novo.nome.trim()} recebeu em ${email} o link para criar a senha e administrar a empresa. Ela aparece em Empresas e planos.`);
      return;
    }
    if (novo.entrega === 'senha') {
      if (novo.senha.length < 8) { notify('Senha curta', 'A senha precisa ter pelo menos 8 caracteres (use Gerar).'); return; }
      if (novo.papel === 'usuario' && !novo.modulos.length) { notify('Marque os módulos', 'Escolha ao menos um módulo que a pessoa vai usar.'); return; }
      setCriando(true);
      const r = await chamarUsuarios({ acao: 'criar', email, nome: novo.nome.trim(), senha: novo.senha, papel: novo.papel, modulos: novo.modulos });
      setCriando(false);
      if (!r.ok) { notify('Conta não criada', r.erro); return; }
      setNovo(null); void carregar();
      notify('Conta criada', `Passe para ${novo.nome.trim()} o login ${email} e a senha ${novo.senha}. A pessoa já pode entrar (e trocar a senha em Minha conta).`, { fixo: true, tom: 'sucesso' });
      return;
    }
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
        <BotaoVoltar label="Voltar" onPress={voltar} />
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 15.5, fontWeight: '800', color: colors.text }}>Usuários e permissões</Text>
          <Text style={t.caption}>{empresa ? `Contas da ${empresa.nome}` : 'Convide as contas da sua empresa'}</Text>
        </View>
      </View>
      <RolagemTutorial contentContainerStyle={{ padding: space.lg, gap: space.md, width: '100%', maxWidth: pageMaxWidth(760), alignSelf: 'center', paddingBottom: 56 }}
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
            <Alvo id="usuarios-criar"><Button title="Criar conta" icon={PlusIcon} onPress={() => setNovo({ ...NOVO_VAZIO })} /></Alvo>
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
            }) : <Text style={t.caption}>Nenhuma conta esperando. Para incluir alguém, use "Criar conta".</Text>}

            <SectionHeader title={`Com acesso (${ativos.length})`} />
            {ativos.map(cartaoConta)}

            {contasFilial.length ? <>
              <SectionHeader title={`Acessos de filial (${contasFilial.length})`} />
              <Card style={{ gap: 0, paddingVertical: space.xs }}>
                {contasFilial.map((cf, i) => {
                  const f = filiais.find(x => x.id === cf.filial_id);
                  return (
                    <Pressable key={cf.user_id} accessibilityRole="button" onPress={() => router.push(`/filiais/${cf.filial_id}`)}
                      style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: 10 }, i > 0 && { borderTopWidth: 1, borderTopColor: colors.border }, pressed && { opacity: 0.7 }]}>
                      <StorefrontIcon size={20} color={colors.textMuted} />
                      <View style={{ flex: 1 }}>
                        <Text style={t.bodyStrong} numberOfLines={1}>{f ? `${f.codigo} · ${f.nome}` : 'Filial'}</Text>
                        <Text style={t.caption} numberOfLines={1}>{cf.email} · só Contagens</Text>
                      </View>
                      <StatusPill label={cf.ativo ? 'Liberado' : 'Bloqueado'} tone={cf.ativo ? 'success' : 'danger'} />
                    </Pressable>
                  );
                })}
              </Card>
              <Text style={t.caption}>Toque na filial para trocar o e-mail, reenviar o link ou bloquear o acesso.</Text>
            </> : null}

            {bloqueados.length ? <>
              <SectionHeader title={`Inativos (${bloqueados.length})`} />
              {bloqueados.map(cartaoConta)}
            </> : null}

            <Text style={t.caption}>Cada conta vê só os dados da sua empresa e usa só os módulos marcados; o banco de dados aplica a mesma regra.</Text>
          </>}
      </RolagemTutorial>

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

      {novo && (() => {
        const tituloBotao = criando ? 'Criando…' : novo.tipo === 'empresa' ? 'Criar empresa e enviar convite' : novo.tipo === 'filial' ? 'Criar acesso da filial' : novo.entrega === 'senha' ? 'Criar conta' : 'Enviar convite';
        const tipos: { id: NovoUsuario['tipo']; rotulo: string; sub: string; Icone: typeof UserCircleIcon }[] = [
          { id: 'pessoa', rotulo: 'Pessoa', sub: 'Auditor, gerente, equipe', Icone: UserCircleIcon },
          { id: 'filial', rotulo: 'Filial', sub: 'Só Contagens da filial', Icone: StorefrontIcon },
          ...(dono ? [{ id: 'empresa' as const, rotulo: 'Empresa', sub: 'Cliente novo, já liberado', Icone: BuildingsIcon }] : []),
        ];
        const filiaisBusca = filiais.filter(f => `${f.codigo} ${f.nome} ${f.cidade}`.toLowerCase().includes(buscaFilial.toLowerCase())).slice(0, 30);
        const plano = planos.find(pl => pl.id === novo.planoId);
        return (
        <Sheet title="Criar conta" onClose={() => !criando && setNovo(null)}
          footer={<Button title={tituloBotao} icon={novo.tipo === 'pessoa' && novo.entrega === 'senha' ? CheckIcon : EnvelopeIcon} disabled={criando} onPress={() => void convidar()} />}>
          <Text style={t.label}>Tipo de conta</Text>
          <Alvo id="usuarios-tipos"><View style={{ flexDirection: 'row', gap: space.sm }}>
            {tipos.map(tp => {
              const on = novo.tipo === tp.id;
              return (
                <Pressable key={tp.id} accessibilityRole="radio" accessibilityState={{ selected: on }} onPress={() => setNovo({ ...novo, tipo: tp.id })}
                  style={({ pressed }) => [{ flex: 1, gap: 4, padding: 12, borderRadius: radius.control, borderWidth: 1.5, borderColor: on ? colors.accent : colors.border, backgroundColor: on ? colors.accentSoft : colors.surface }, pressed && !on && { opacity: 0.75 }]}>
                  <tp.Icone size={22} color={on ? colors.accentText : colors.textMuted} weight={on ? 'fill' : 'regular'} />
                  <Text style={[t.bodyStrong, { color: on ? colors.accentText : colors.text }]}>{tp.rotulo}</Text>
                  <Text style={t.caption} numberOfLines={2}>{tp.sub}</Text>
                </Pressable>
              );
            })}
          </View></Alvo>

          {novo.tipo === 'filial' ? <>
            <Text style={t.label}>Filial</Text>
            <Field icon={MagnifyingGlassIcon} value={buscaFilial} onChangeText={setBuscaFilial} placeholder="Buscar filial por código ou nome" />
            <View style={{ maxHeight: 220, borderWidth: 1, borderColor: colors.border, borderRadius: radius.control, overflow: 'hidden' }}>
              <ScrollView nestedScrollEnabled keyboardShouldPersistTaps="handled">
                {filiaisBusca.map((f, i) => {
                  const on = novo.filialId === f.id;
                  const ja = contasFilial.find(cf => cf.filial_id === f.id);
                  return (
                    <Pressable key={f.id} accessibilityRole="radio" accessibilityState={{ selected: on }} onPress={() => setNovo({ ...novo, filialId: f.id, email: novo.email || f.email || '' })}
                      style={[{ flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: on ? colors.accentSoft : colors.surface }, i > 0 && { borderTopWidth: 1, borderTopColor: colors.border }]}>
                      <StorefrontIcon size={18} color={on ? colors.accentText : colors.textMuted} />
                      <Text style={[t.body, { flex: 1, color: on ? colors.accentText : colors.text }]} numberOfLines={1}>{f.codigo} · {f.nome}</Text>
                      {ja ? <Text style={t.caption}>já tem acesso</Text> : null}
                      {on ? <CheckIcon size={16} color={colors.accentText} weight="bold" /> : null}
                    </Pressable>
                  );
                })}
                {!filiaisBusca.length ? <Text style={[t.caption, { padding: 12 }]}>Nenhuma filial encontrada.</Text> : null}
              </ScrollView>
            </View>
            <Field label="E-mail da filial (login)" value={novo.email} onChangeText={v => setNovo({ ...novo, email: v })} placeholder="filial@empresa.com.br" keyboardType="email-address" autoCapitalize="none" autoComplete="off" />
            <Text style={t.caption}>A conta da filial usa só o módulo Contagens e vê só as contagens que ela abrir. Ela recebe o link para criar a senha. Se a filial já tiver acesso, o e-mail é trocado e o link vai de novo.</Text>
          </> : null}

          {novo.tipo === 'empresa' ? <>
            <Field label="Nome da empresa" value={novo.empresaNome} onChangeText={v => setNovo({ ...novo, empresaNome: v })} placeholder="Ex.: Rede Exemplo" maxLength={120} />
            <Text style={t.label}>Plano</Text>
            <ChoiceChips value={plano?.nome ?? ''} options={planos.map(pl => pl.nome)} onChange={v => {
              const pl = planos.find(x => x.nome === v);
              if (pl) setNovo({ ...novo, planoId: pl.id, modulosEmpresa: pl.modulos, limite: String(pl.limite_contas) });
            }} />
            <Field label="Limite de contas" value={novo.limite} onChangeText={v => setNovo({ ...novo, limite: v.replace(/\D/g, '') })} keyboardType="number-pad" placeholder={plano ? String(plano.limite_contas) : ''} />
            <Text style={t.label}>Módulos da empresa</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
              {MODULES.map(m => {
                const on = novo.modulosEmpresa.includes(m.id);
                return (
                  <Pressable key={m.id} accessibilityRole="checkbox" accessibilityState={{ checked: on }} onPress={() => setNovo({ ...novo, modulosEmpresa: on ? novo.modulosEmpresa.filter(x => x !== m.id) : [...novo.modulosEmpresa, m.id] })}
                    style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 36, paddingHorizontal: 12, borderRadius: radius.pill, borderWidth: 1, borderColor: on ? colors.accent : colors.borderStrong, backgroundColor: on ? colors.accentSoft : colors.surface }, pressed && { opacity: 0.7 }]}>
                    {on ? <CheckIcon size={14} color={colors.accentText} weight="bold" /> : null}
                    <Text style={{ fontSize: 13, fontWeight: '600', color: on ? colors.accentText : colors.textMuted }}>{m.curto ?? m.name}</Text>
                  </Pressable>
                );
              })}
            </View>
            <Field label="Nome do administrador" value={novo.nome} onChangeText={v => setNovo({ ...novo, nome: v })} placeholder="Quem vai administrar a empresa" maxLength={80} />
            <Field label="E-mail do administrador (login)" value={novo.email} onChangeText={v => setNovo({ ...novo, email: v })} placeholder="admin@empresa.com.br" keyboardType="email-address" autoCapitalize="none" autoComplete="off" />
            <Text style={t.caption}>A empresa já nasce liberada. O administrador recebe o link para criar a senha e cria as contas da equipe e das filiais dela.</Text>
          </> : null}

          {novo.tipo === 'pessoa' ? <>
            <Field label="Nome" value={novo.nome} onChangeText={v => setNovo({ ...novo, nome: v })} placeholder="Como aparece nos registros e relatórios" maxLength={80} />
            <Field label="E-mail (login)" value={novo.email} onChangeText={v => setNovo({ ...novo, email: v })} placeholder="pessoa@email.com" keyboardType="email-address" autoCapitalize="none" autoComplete="off" />
            <Text style={t.label}>Senha</Text>
            <ChoiceChips value={novo.entrega === 'senha' ? 'Definir agora' : 'A pessoa cria (convite por e-mail)'} options={['A pessoa cria (convite por e-mail)', 'Definir agora']}
              onChange={v => setNovo({ ...novo, entrega: v === 'Definir agora' ? 'senha' : 'convite', senha: v === 'Definir agora' && !novo.senha ? gerarSenha() : novo.senha })} />
            {novo.entrega === 'senha' ? (
              <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: space.sm }}>
                <View style={{ flex: 1 }}>
                  <Field value={novo.senha} onChangeText={v => setNovo({ ...novo, senha: v })} placeholder="Mínimo 8 caracteres" autoCapitalize="none" autoCorrect={false} autoComplete="off" />
                </View>
                <Button title="Gerar" size="sm" variant="secondary" onPress={() => setNovo({ ...novo, senha: gerarSenha() })} />
              </View>
            ) : null}
            <Text style={t.caption}>{novo.entrega === 'senha' ? 'A conta já fica pronta para entrar. Passe o login e a senha para a pessoa; ela pode trocar a senha em Minha conta.' : 'A pessoa recebe um e-mail com o link para criar a própria senha.'}</Text>
            <Text style={t.label}>Papel</Text>
            <ChoiceChips value={novo.papel === 'admin' ? 'Administrador' : 'Usuário'} options={['Usuário', 'Administrador']} onChange={v => setNovo({ ...novo, papel: v === 'Administrador' ? 'admin' : 'usuario' })} />
            {novo.papel === 'admin'
              ? <Text style={t.caption}>Administrador acessa todos os módulos do plano e gerencia usuários, filiais e parâmetros da empresa.</Text>
              : <>
                <Text style={t.label}>Módulos que esta conta vai usar</Text>
                {modChips(novo.modulos, id => setNovo({ ...novo, modulos: novo.modulos.includes(id) ? novo.modulos.filter(x => x !== id) : [...novo.modulos, id] }))}
              </>}
          </> : null}
        </Sheet>
        );
      })()}
    </SafeAreaView>
  );
}

type NovoUsuario = {
  tipo: 'pessoa' | 'filial' | 'empresa'; nome: string; email: string; senha: string; papel: 'usuario' | 'admin'; modulos: string[];
  /** Pessoa: convite por e-mail (a pessoa cria a senha) ou senha definida agora. */
  entrega: 'convite' | 'senha';
  filialId: string; empresaNome: string; planoId: string; limite: string; modulosEmpresa: string[];
};
const NOVO_VAZIO: NovoUsuario = { tipo: 'pessoa', nome: '', email: '', senha: '', papel: 'usuario', modulos: [], entrega: 'convite', filialId: '', empresaNome: '', planoId: '', limite: '', modulosEmpresa: [] };

/** Senha inicial fácil de ditar: sem letras parecidas (l, I, O, 0). */
function gerarSenha() {
  const letras = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ', numeros = '23456789';
  const sorteio = (conj: string, n: number) => Array.from({ length: n }, () => conj[Math.floor(Math.random() * conj.length)]).join('');
  return `${sorteio(letras, 6)}${sorteio(numeros, 4)}`;
}
