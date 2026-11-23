import { useRouter } from 'expo-router';
import { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../lib/auth';
import { ONLINE_MS } from '../../lib/presenca';
import { TrocarRede, useEntrarNaRede } from '../../components/TrocarRede';
import { supabase } from '../../lib/supabase';
import { MODULES } from '../../modules/registry';
import { BroadcastIcon, EyeIcon, SwapIcon, ArrowLeftIcon, CheckIcon, EnvelopeIcon, LockSimpleIcon, PencilSimpleIcon, StorefrontIcon, UserCircleIcon } from '../../ui/icons';
import { Button, Card, ChoiceChips, confirmAction, EmptyState, Field, IconButton, notify, SectionHeader, Sheet, Skeleton, StatusPill } from '../../ui/kit';
import { createTypography, pageMaxWidth, radius, space, ThemeContext } from '../../ui/theme';
import { BotaoVoltar } from '../../ui/voltar';

type Status = 'aguardando' | 'ativa' | 'suspensa';
type Empresa = {
  id: string; nome: string; documento: string; telefone: string; plano_id: string; limite_contas: number; modulos: string[]; status: Status; created_at: string;
  contas_ativas: number; administradores: { email: string; nome: string | null }[];
  /** Quem pediu para entrar nesta rede e ainda espera resposta. */
  pedidos: PedidoAcesso[];
  /** Todas as contas da rede. */
  contas: Conta[];
};
/** Conta de usuário (de uma rede ou sem rede). `filial`: conta de acesso de filial (só Contagens). */
type Conta = { user_id: string; email: string; nome: string | null; papel: 'admin' | 'usuario'; ativo: boolean; modulos: string[]; filial: boolean; created_at: string };
/** Mudar conta de rede: destino null = sem rede (a conta volta a escolher entre cadastrar o posto ou pedir acesso). */
type Mudanca = { c: Conta; origem: Empresa | null; destino: string | null | undefined; papel: 'usuario' | 'admin'; modulos: string[] };
type PedidoAcesso = { id: string; email: string; nome: string; created_at: string };
type Aprovacao = { e: Empresa; pd: PedidoAcesso; papel: 'usuario' | 'admin'; modulos: string[] };
type Plano = { id: string; nome: string; descricao: string; preco_mensal: number | null; limite_contas: number; modulos: string[]; ordem: number; ativo: boolean };
type EdicaoEmpresa = { e: Empresa; plano_id: string; limite: string; modulos: string[] };
type EdicaoPlano = { p: Plano; nome: string; descricao: string; preco: string; limite: string; modulos: string[]; ativo: boolean };

const ROTULO: Record<Status, string> = { aguardando: 'Aguardando', ativa: 'Ativa', suspensa: 'Suspensa' };
const TOM: Record<Status, 'warning' | 'success' | 'danger'> = { aguardando: 'warning', ativa: 'success', suspensa: 'danger' };
const preco = (v: number | null) => (v === null ? 'Sob consulta' : `${v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}/mês`);

async function chamar(body: Record<string, unknown>): Promise<{ ok: true; data: unknown } | { ok: false; erro: string }> {
  if (!supabase) return { ok: false, erro: 'Sem servidor configurado.' };
  const { data, error } = await supabase.functions.invoke('empresas', { body });
  if (!error) return { ok: true, data };
  let erro = 'Não foi possível falar com o servidor. Verifique a conexão.';
  try { const r = (error as { context?: Response }).context; const c = r ? await r.json() : null; if (c?.erro) erro = String(c.erro); } catch { /* sem JSON */ }
  return { ok: false, erro };
}

/** Painel do dono da plataforma: empresas (liberar, suspender, plano, limite, módulos) e planos (preço, limite, módulos). */
export default function PlataformaScreen() {
  const router = useRouter();
  const { dono, visita, visitaEdita, empresa: minhaRede } = useAuth();
  const { pedir: entrarNaRede, entrando } = useEntrarNaRede();
  const [trocar, setTrocar] = useState(false);
  const { colors } = useContext(ThemeContext);
  const t = useMemo(() => createTypography(colors), [colors]);
  const [aba, setAba] = useState<'Empresas' | 'Planos'>('Empresas');
  const [empresas, setEmpresas] = useState<Empresa[] | null>(null);
  const [planos, setPlanos] = useState<Plano[]>([]);
  const [erro, setErro] = useState('');
  const [atualizando, setAtualizando] = useState(false);
  const [edEmp, setEdEmp] = useState<EdicaoEmpresa | null>(null);
  const [edPlano, setEdPlano] = useState<EdicaoPlano | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [aprovacao, setAprovacao] = useState<Aprovacao | null>(null);
  const [semRede, setSemRede] = useState<Conta[]>([]);
  const [contasAbertas, setContasAbertas] = useState<Record<string, boolean>>({});
  const [mudanca, setMudanca] = useState<Mudanca | null>(null);
  /** Contas online agora em cada rede (presença dos últimos 2 min). */
  const [online, setOnline] = useState<Record<string, number>>({});

  const carregar = useCallback(async () => {
    const r = await chamar({ acao: 'listar' });
    if (!r.ok) { setErro(r.erro); return; }
    const d = r.data as { empresas: Empresa[]; planos: Plano[]; sem_rede?: Conta[] };
    setErro(''); setEmpresas(d.empresas); setPlanos(d.planos); setSemRede(d.sem_rede ?? []);
    const p = await supabase?.from('presenca').select('empresa_id').gte('visto_em', new Date(Date.now() - ONLINE_MS).toISOString());
    const n: Record<string, number> = {};
    (p?.data ?? []).forEach((x: { empresa_id: string | null }) => { if (x.empresa_id) n[x.empresa_id] = (n[x.empresa_id] ?? 0) + 1; });
    setOnline(n);
  }, []);
  const atualizar = async (body: Record<string, unknown>, ok: string) => {
    setSalvando(true);
    const r = await chamar({ acao: 'atualizar', ...body });
    setSalvando(false);
    if (!r.ok) { notify('Não foi possível salvar', r.erro); return false; }
    notify(ok); void carregar(); return true;
  };
  const nomePlano = (id: string) => planos.find(p => p.id === id)?.nome ?? id;
  const voltar = () => (router.canGoBack() ? router.back() : router.replace('/'));

  /** Pedido de acesso a uma rede: aprovar (com o papel e os módulos) ou recusar, no lugar do administrador dela. */
  const responderPedido = async (body: Record<string, unknown>, ok: string) => {
    setSalvando(true);
    const r = await chamar(body);
    setSalvando(false);
    if (!r.ok) { notify('Pedido não respondido', r.erro); return false; }
    notify(ok); void carregar(); return true;
  };
  /** Uma linha de conta (nas contas de uma rede ou nas contas sem rede), com o botão de mudar de rede. */
  const linhaConta = (c: Conta, origem: Empresa | null) => (
    <View key={c.user_id} style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: 6, borderTopWidth: 1, borderTopColor: colors.border }}>
      <View style={{ flex: 1 }}>
        <Text style={t.bodyStrong} numberOfLines={1}>{c.nome || c.email}</Text>
        <Text style={t.caption} numberOfLines={1}>{c.nome ? `${c.email} · ` : ''}{c.filial ? 'acesso de filial' : origem ? (c.papel === 'admin' ? 'administrador' : `${c.modulos.length} módulo(s)`) : `conta criada em ${new Date(c.created_at).toLocaleDateString('pt-BR')}`}</Text>
      </View>
      {origem ? <StatusPill label={!c.ativo ? 'Inativa' : c.papel === 'admin' ? 'Admin' : 'Ativa'} tone={!c.ativo ? 'danger' : c.papel === 'admin' ? 'accent' : 'success'} /> : null}
      {c.filial ? null : (
        <Button title={origem ? 'Mudar de rede' : 'Colocar numa rede'} variant="secondary" size="sm" disabled={salvando}
          onPress={() => setMudanca({ c, origem, destino: undefined, papel: c.papel === 'admin' && origem ? 'admin' : 'usuario', modulos: [...c.modulos] })} />
      )}
    </View>
  );
  /** Administradores ativos da rede (para avisar quando a mudança deixa a rede sem nenhum). */
  const adminsAtivos = (e: Empresa) => e.contas.filter(c => c.ativo && c.papel === 'admin' && !c.filial).length;

  const recusar = (e: Empresa, pd: PedidoAcesso) => confirmAction('Recusar o pedido?', `${pd.nome || pd.email} continua sem acesso à ${e.nome} e recebe um e-mail avisando.`, 'Recusar',
    () => void responderPedido({ acao: 'recusar_pedido', pedido_id: pd.id }, 'Pedido recusado.'));

  const modChips = (sel: string[], onToggle: (id: string) => void, so?: string[]) => (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
      {MODULES.filter(m => !so || so.includes(m.id)).map(m => {
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
  const alternar = (l: string[], id: string) => (l.includes(id) ? l.filter(x => x !== id) : [...l, id]);

  const cartao = (e: Empresa) => (
    <Card key={e.id} style={e.status === 'aguardando' ? { borderColor: colors.warning } : undefined}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
        <View style={{ flex: 1 }}>
          <Text style={t.bodyStrong} numberOfLines={1}>{e.nome}</Text>
          <Text style={t.caption} numberOfLines={2}>
            Plano {nomePlano(e.plano_id)} · {e.contas_ativas} de {e.limite_contas} contas · desde {new Date(e.created_at).toLocaleDateString('pt-BR')}
          </Text>
        </View>
        {online[e.id] ? <StatusPill label={`${online[e.id]} online`} tone="success" icon={BroadcastIcon} /> : null}
        <StatusPill label={ROTULO[e.status]} tone={TOM[e.status]} />
      </View>
      <Text style={t.caption}>
        Administrador{e.administradores.length === 1 ? '' : 'es'}: {e.administradores.map(a => (a.nome ? `${a.nome} (${a.email})` : a.email)).join(', ') || 'nenhum'}
        {e.documento ? `\nCNPJ ${e.documento}` : ''}{e.telefone ? `\nTelefone ${e.telefone}` : ''}
      </Text>
      <Text style={t.caption}>Módulos: {e.modulos.map(id => MODULES.find(m => m.id === id)?.name ?? id).join(', ')}</Text>
      {e.pedidos.length ? (
        <View style={{ gap: space.sm, padding: space.sm, borderRadius: radius.control, borderWidth: 1, borderColor: colors.warning, backgroundColor: colors.surfaceMuted }}>
          <StatusPill label={`${e.pedidos.length} ${e.pedidos.length === 1 ? 'usuário aguardando' : 'usuários aguardando'} acesso a esta rede`} tone="warning" icon={UserCircleIcon} />
          {e.pedidos.map(pd => (
            <View key={pd.id} style={{ gap: 6 }}>
              <Text style={t.bodyStrong} numberOfLines={1}>{pd.nome || pd.email}</Text>
              <Text style={t.caption} numberOfLines={1}>{pd.nome ? `${pd.email} · ` : ''}pediu acesso em {new Date(pd.created_at).toLocaleDateString('pt-BR')}</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
                <Button title="Aprovar" icon={CheckIcon} size="sm" disabled={salvando || e.status !== 'ativa'} onPress={() => setAprovacao({ e, pd, papel: 'usuario', modulos: [] })} />
                <Button title="Recusar" variant="danger" size="sm" disabled={salvando} onPress={() => recusar(e, pd)} />
              </View>
            </View>
          ))}
          <Text style={t.caption}>O administrador da rede também vê e responde estes pedidos em Usuários e permissões.</Text>
        </View>
      ) : null}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
        {e.status !== 'ativa' ? (
          <Button title={e.status === 'aguardando' ? 'Liberar empresa' : 'Reativar'} icon={CheckIcon} size="sm" disabled={salvando}
            onPress={() => confirmAction(e.status === 'aguardando' ? 'Liberar empresa?' : 'Reativar empresa?', `${e.nome} passa a usar o EasyAudit no plano ${nomePlano(e.plano_id)}. ${e.status === 'aguardando' ? 'Os administradores recebem um e-mail.' : ''}`, 'Liberar', () => void atualizar({ id: e.id, status: 'ativa' }, `${e.nome} liberada.`))} />
        ) : (
          <Button title="Suspender" variant="danger" size="sm" disabled={salvando}
            onPress={() => confirmAction('Suspender empresa?', `Ninguém da ${e.nome} consegue usar o sistema enquanto estiver suspensa. Os dados continuam guardados.`, 'Suspender', () => void atualizar({ id: e.id, status: 'suspensa' }, `${e.nome} suspensa.`))} />
        )}
        <Button title="Plano, limite e módulos" icon={PencilSimpleIcon} variant="secondary" size="sm"
          onPress={() => setEdEmp({ e, plano_id: e.plano_id, limite: String(e.limite_contas), modulos: [...e.modulos] })} />
        <Button title="Quem está online" icon={BroadcastIcon} variant="ghost" size="sm" onPress={() => router.push(`/online?rede=${encodeURIComponent(e.id)}`)} />
        {e.status === 'ativa' && (e.id !== minhaRede?.id || visita) ? <>
          <Button title="Ver dados" icon={EyeIcon} variant="ghost" size="sm" disabled={salvando || entrando || (visita?.id === e.id && !visitaEdita)} onPress={() => entrarNaRede(e, false)} />
          <Button title="Administrar" icon={PencilSimpleIcon} variant="ghost" size="sm" disabled={salvando || entrando || (visita?.id === e.id && visitaEdita)} onPress={() => entrarNaRede(e, true)} />
        </> : null}
        <Button title={`${contasAbertas[e.id] ? 'Esconder contas' : 'Contas'} (${e.contas.length})`} icon={UserCircleIcon} variant="ghost" size="sm"
          onPress={() => setContasAbertas(a => ({ ...a, [e.id]: !a[e.id] }))} />
      </View>
      {contasAbertas[e.id] ? (
        <View>
          {e.contas.length ? e.contas.map(c => linhaConta(c, e)) : <Text style={t.caption}>Nenhuma conta nesta rede.</Text>}
        </View>
      ) : null}
    </Card>
  );

  const totalPedidos = (empresas ?? []).reduce((n, e) => n + e.pedidos.length, 0);
  const grupos: { titulo: string; lista: Empresa[] }[] = [
    { titulo: 'Aguardando liberação', lista: (empresas ?? []).filter(e => e.status === 'aguardando') },
    // Redes com pedidos de acesso esperando vêm primeiro.
    { titulo: 'Ativas', lista: (empresas ?? []).filter(e => e.status === 'ativa').sort((a, b) => b.pedidos.length - a.pedidos.length) },
    { titulo: 'Suspensas', lista: (empresas ?? []).filter(e => e.status === 'suspensa') },
  ];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.lg, paddingVertical: space.md, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border }}>
        <BotaoVoltar label="Voltar" onPress={voltar} />
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 15.5, fontWeight: '800', color: colors.text }}>Empresas e planos</Text>
          <Text style={t.caption}>Clientes do EasyAudit, liberação e planos</Text>
        </View>
        {dono ? <Button title="Trocar de rede" icon={SwapIcon} variant="secondary" size="sm" onPress={() => setTrocar(true)} /> : null}
      </View>
      <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.md, width: '100%', maxWidth: pageMaxWidth(820), alignSelf: 'center', paddingBottom: 56 }}
        refreshControl={<RefreshControl refreshing={atualizando} onRefresh={() => { setAtualizando(true); void carregar().finally(() => setAtualizando(false)); }} />}>
        {!dono ? <EmptyState icon={LockSimpleIcon} title="Acesso restrito" text="Somente o dono do EasyAudit administra as empresas." />
          : erro ? <EmptyState icon={StorefrontIcon} title="Não foi possível carregar" text={erro} action={{ label: 'Tentar de novo', onPress: () => void carregar() }} />
          : !empresas ? <><Skeleton height={120} /><Skeleton height={120} /></>
          : <>
            <ChoiceChips value={aba} options={['Empresas', 'Planos']} onChange={v => setAba(v as typeof aba)} />
            {aba === 'Empresas' && totalPedidos ? (
              <Card style={{ borderColor: colors.warning, flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
                <EnvelopeIcon size={22} color={colors.warning} weight="duotone" />
                <Text style={[t.body, { flex: 1 }]}>
                  {totalPedidos} {totalPedidos === 1 ? 'pedido de acesso aguardando' : 'pedidos de acesso aguardando'} resposta em: {(empresas ?? []).filter(e => e.pedidos.length).map(e => `${e.nome} (${e.pedidos.length})`).join(', ')}.
                </Text>
              </Card>
            ) : null}
            {aba === 'Empresas' ? grupos.map(g => (g.lista.length || g.titulo === 'Aguardando liberação' ? (
              <View key={g.titulo} style={{ gap: space.md }}>
                <SectionHeader title={`${g.titulo} (${g.lista.length})`} />
                {g.lista.length ? g.lista.map(cartao) : <Text style={t.caption}>Nenhuma empresa esperando. Quem se cadastra pelo site aparece aqui, e você recebe um e-mail.</Text>}
              </View>
            ) : null)) : null}
            {aba === 'Empresas' && semRede.length ? (
              <View style={{ gap: space.md }}>
                <SectionHeader title={`Contas sem rede (${semRede.length})`} />
                <Card>
                  <Text style={t.caption}>Criaram a conta e ainda não cadastraram um posto nem entraram numa rede (ou foram tiradas de uma rede).</Text>
                  {semRede.map(c => linhaConta(c, null))}
                </Card>
              </View>
            ) : null}
            {aba === 'Planos' ? <>
              <Text style={t.caption}>Os planos aparecem no site para quem vai criar a empresa. Mudar um plano não muda as empresas que já estão nele (ajuste cada uma em Empresas).</Text>
              {planos.map(p => (
                <Card key={p.id}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
                    <View style={{ flex: 1 }}>
                      <Text style={t.bodyStrong}>{p.nome}</Text>
                      <Text style={t.caption}>{preco(p.preco_mensal)} · até {p.limite_contas} contas · {p.modulos.length} módulos</Text>
                    </View>
                    <StatusPill label={p.ativo ? 'No site' : 'Oculto'} tone={p.ativo ? 'success' : 'neutral'} />
                  </View>
                  <Text style={t.caption}>{p.descricao}</Text>
                  <Button title="Editar plano" icon={PencilSimpleIcon} variant="secondary" size="sm" style={{ alignSelf: 'flex-start' }}
                    onPress={() => setEdPlano({ p, nome: p.nome, descricao: p.descricao, preco: p.preco_mensal === null ? '' : String(p.preco_mensal).replace('.', ','), limite: String(p.limite_contas), modulos: [...p.modulos], ativo: p.ativo })} />
                </Card>
              ))}
            </> : null}
          </>}
      </ScrollView>

      {trocar ? <TrocarRede onClose={() => setTrocar(false)} /> : null}
      {edEmp && (
        <Sheet title={edEmp.e.nome} onClose={() => !salvando && setEdEmp(null)}
          footer={<Button title={salvando ? 'Salvando…' : 'Salvar'} icon={CheckIcon} disabled={salvando} onPress={() => void (async () => {
            const limite = Math.floor(Number(edEmp.limite));
            if (!(limite >= 1)) { notify('Limite inválido', 'Informe quantas contas ativas a empresa pode ter.'); return; }
            if (!edEmp.modulos.length) { notify('Marque os módulos'); return; }
            const body: Record<string, unknown> = { id: edEmp.e.id };
            if (edEmp.plano_id !== edEmp.e.plano_id) body.plano_id = edEmp.plano_id;
            body.limite_contas = limite; body.modulos = edEmp.modulos;
            if (await atualizar(body, 'Empresa atualizada.')) setEdEmp(null);
          })()} />}>
          <Text style={t.label}>Plano</Text>
          <ChoiceChips value={nomePlano(edEmp.plano_id)} options={planos.map(p => p.nome)}
            onChange={v => { const p = planos.find(x => x.nome === v); if (p) setEdEmp({ ...edEmp, plano_id: p.id, limite: String(p.limite_contas), modulos: [...p.modulos] }); }} />
          <Text style={t.caption}>Trocar o plano traz o limite e os módulos dele; dá para ajustar abaixo só para esta empresa.</Text>
          <Field label="Limite de contas ativas" value={edEmp.limite} onChangeText={v => setEdEmp({ ...edEmp, limite: v.replace(/\D/g, '') })} keyboardType="number-pad" />
          <Text style={t.caption}>Hoje: {edEmp.e.contas_ativas} conta(s) ativa(s).</Text>
          <Text style={t.label}>Módulos da empresa</Text>
          {modChips(edEmp.modulos, id => setEdEmp({ ...edEmp, modulos: alternar(edEmp.modulos, id) }))}
        </Sheet>
      )}

      {mudanca && (() => {
        const { c, origem, destino } = mudanca;
        const alvo = destino ? (empresas ?? []).find(e => e.id === destino) ?? null : null;
        const opcoes = (empresas ?? []).filter(e => e.id !== origem?.id);
        const deixaSemAdmin = !!origem && c.papel === 'admin' && c.ativo && adminsAtivos(origem) <= 1;
        const pronto = destino === null || (!!alvo && (mudanca.papel === 'admin' || mudanca.modulos.length > 0));
        const confirmar = () => void (async () => {
          setSalvando(true);
          const r = await chamar({ acao: 'mover_conta', user_id: c.user_id, empresa_id: destino ?? null, papel: mudanca.papel, modulos: mudanca.modulos });
          setSalvando(false);
          if (!r.ok) { notify('Conta não mudou de rede', r.erro); return; }
          setMudanca(null); void carregar();
          notify(alvo ? `${c.nome || c.email} agora é da ${alvo.nome}.` : `${c.nome || c.email} ficou sem rede.`);
        })();
        return (
          <Sheet title={origem ? 'Mudar de rede' : 'Colocar numa rede'} onClose={() => !salvando && setMudanca(null)}
            footer={<Button title={salvando ? 'Salvando…' : alvo ? `Mudar para ${alvo.nome}` : destino === null ? 'Tirar da rede' : 'Escolha o destino'} icon={CheckIcon}
              disabled={salvando || !pronto}
              onPress={() => (deixaSemAdmin
                ? confirmAction('A rede ficará sem administrador', `${c.nome || c.email} é o único administrador ativo da ${origem?.nome}. Depois da mudança, ninguém administra essa rede (você ainda a gerencia por aqui). Continuar?`, 'Continuar', confirmar)
                : confirmar())} />}>
            <Text style={t.body}><Text style={t.bodyStrong}>{c.nome || c.email}</Text>{c.nome ? ` (${c.email})` : ''} · hoje: {origem ? origem.nome : 'sem rede'}</Text>
            <Text style={t.label}>Para onde</Text>
            <View style={{ gap: 6 }}>
              {[...opcoes.map(e => ({ id: e.id as string | null, nome: e.nome, info: `${e.contas_ativas} de ${e.limite_contas} contas${e.status !== 'ativa' ? ` · ${ROTULO[e.status].toLowerCase()}` : ''}` })),
                ...(origem ? [{ id: null as string | null, nome: 'Sem rede', info: 'a conta volta a escolher entre cadastrar o posto ou pedir acesso' }] : [])].map(o => {
                const on = destino === o.id;
                return (
                  <Pressable key={o.id ?? 'sem-rede'} accessibilityRole="radio" accessibilityState={{ selected: on }}
                    onPress={() => setMudanca({ ...mudanca, destino: o.id, modulos: o.id ? mudanca.modulos.filter(m => (empresas ?? []).find(e => e.id === o.id)?.modulos.includes(m)) : [] })}
                    style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 44, paddingHorizontal: space.md, paddingVertical: 6, borderRadius: radius.control, borderWidth: 1, borderColor: on ? colors.accent : colors.border, backgroundColor: on ? colors.accentSoft : colors.surface }, pressed && { opacity: 0.8 }]}>
                    <View style={{ flex: 1 }}>
                      <Text style={[t.bodyStrong, on && { color: colors.accentText }]} numberOfLines={1}>{o.nome}</Text>
                      <Text style={t.caption} numberOfLines={1}>{o.info}</Text>
                    </View>
                    {on ? <CheckIcon size={16} color={colors.accentText} weight="bold" /> : null}
                  </Pressable>
                );
              })}
            </View>
            {alvo ? <>
              <Text style={t.label}>Papel na {alvo.nome}</Text>
              <ChoiceChips value={mudanca.papel === 'admin' ? 'Administrador' : 'Usuário'} options={['Usuário', 'Administrador']}
                onChange={v => setMudanca({ ...mudanca, papel: v === 'Administrador' ? 'admin' : 'usuario' })} />
              {mudanca.papel === 'admin' ? <Text style={t.caption}>Administrador usa todos os módulos da rede e gerencia as contas dela.</Text> : <>
                <Text style={t.label}>Módulos que a conta vai usar</Text>
                {modChips(mudanca.modulos, id => setMudanca({ ...mudanca, modulos: alternar(mudanca.modulos, id) }), alvo.modulos)}
              </>}
            </> : null}
            {deixaSemAdmin ? <Text style={[t.caption, { color: colors.warning }]}>Atenção: é o único administrador ativo da {origem?.nome}.</Text> : null}
            <Text style={t.caption}>{origem ? `Os registros que a conta já fez continuam na ${origem.nome}. ` : ''}A pessoa recebe um e-mail avisando e, ao entrar de novo, vê só os dados da rede nova.</Text>
          </Sheet>
        );
      })()}

      {aprovacao && (
        <Sheet title="Aprovar acesso" onClose={() => !salvando && setAprovacao(null)}
          footer={<Button title={salvando ? 'Salvando…' : 'Aprovar acesso'} icon={CheckIcon} disabled={salvando || (aprovacao.papel === 'usuario' && !aprovacao.modulos.length)}
            onPress={() => void (async () => {
              const { e, pd, papel, modulos } = aprovacao;
              if (await responderPedido({ acao: 'aceitar_pedido', pedido_id: pd.id, papel, modulos }, `${pd.nome || pd.email} agora faz parte da ${e.nome}.`)) setAprovacao(null);
            })()} />}>
          <Text style={t.body}><Text style={t.bodyStrong}>{aprovacao.pd.nome || aprovacao.pd.email}</Text> pediu acesso à <Text style={t.bodyStrong}>{aprovacao.e.nome}</Text>.</Text>
          <Text style={t.label}>Papel na rede</Text>
          <ChoiceChips value={aprovacao.papel === 'admin' ? 'Administrador' : 'Usuário'} options={['Usuário', 'Administrador']}
            onChange={v => setAprovacao({ ...aprovacao, papel: v === 'Administrador' ? 'admin' : 'usuario' })} />
          {aprovacao.papel === 'admin' ? <Text style={t.caption}>Administrador usa todos os módulos da rede e gerencia as contas dela.</Text> : <>
            <Text style={t.label}>Módulos que a conta vai usar</Text>
            {modChips(aprovacao.modulos, id => setAprovacao({ ...aprovacao, modulos: alternar(aprovacao.modulos, id) }), aprovacao.e.modulos)}
          </>}
          <Text style={t.caption}>A pessoa recebe um e-mail avisando. A conta ocupa uma das {aprovacao.e.limite_contas} contas da rede ({aprovacao.e.contas_ativas} em uso).</Text>
        </Sheet>
      )}

      {edPlano && (
        <Sheet title={`Plano ${edPlano.p.nome}`} onClose={() => !salvando && setEdPlano(null)}
          footer={<Button title={salvando ? 'Salvando…' : 'Salvar plano'} icon={CheckIcon} disabled={salvando} onPress={() => void (async () => {
            const limite = Math.floor(Number(edPlano.limite));
            const precoTxt = edPlano.preco.trim().replace(/\./g, '').replace(',', '.');
            const valor = precoTxt === '' ? null : Number(precoTxt);
            if (!(limite >= 1)) { notify('Limite inválido'); return; }
            if (valor !== null && !(valor >= 0)) { notify('Preço inválido', 'Digite só o valor mensal (ex.: 490 ou 1.290,00), ou deixe vazio para "Sob consulta".'); return; }
            if (!edPlano.modulos.length) { notify('Marque os módulos'); return; }
            setSalvando(true);
            const r = await chamar({ acao: 'salvar_plano', id: edPlano.p.id, nome: edPlano.nome, descricao: edPlano.descricao, preco_mensal: valor, limite_contas: limite, modulos: edPlano.modulos, ativo: edPlano.ativo });
            setSalvando(false);
            if (!r.ok) { notify('Plano não salvo', r.erro); return; }
            setEdPlano(null); void carregar();
          })()} />}>
          <Field label="Nome" value={edPlano.nome} onChangeText={v => setEdPlano({ ...edPlano, nome: v })} maxLength={60} />
          <Field label="Descrição (aparece no site)" value={edPlano.descricao} onChangeText={v => setEdPlano({ ...edPlano, descricao: v })} maxLength={300} multiline />
          <Field label="Preço mensal (R$)" value={edPlano.preco} onChangeText={v => setEdPlano({ ...edPlano, preco: v })} keyboardType="decimal-pad" placeholder="Vazio = Sob consulta" />
          <Field label="Limite de contas" value={edPlano.limite} onChangeText={v => setEdPlano({ ...edPlano, limite: v.replace(/\D/g, '') })} keyboardType="number-pad" />
          <Text style={t.label}>Módulos do plano</Text>
          {modChips(edPlano.modulos, id => setEdPlano({ ...edPlano, modulos: alternar(edPlano.modulos, id) }))}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
            <Text style={[t.bodyStrong, { flex: 1 }]}>Mostrar no site</Text>
            <Switch value={edPlano.ativo} onValueChange={v => setEdPlano({ ...edPlano, ativo: v })} accessibilityLabel="Mostrar no site" />
          </View>
        </Sheet>
      )}
    </SafeAreaView>
  );
}
