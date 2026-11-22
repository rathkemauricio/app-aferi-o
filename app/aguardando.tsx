import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { useAuth } from '../lib/auth';
import { enviarEmail } from '../lib/email';
import { supabase } from '../lib/supabase';
import { BuildingsIcon, CheckIcon, EnvelopeIcon, LockSimpleIcon, MagnifyingGlassIcon, ResetIcon, SignOutIcon, StorefrontIcon, type Icon } from '../ui/icons';
import { Button, Card, confirmAction, Field, IconTile, notify } from '../ui/kit';
import { createTypography, radius, space, ThemeContext } from '../ui/theme';

type Rede = { id: string; nome: string };
type Pedido = { id: string; empresa_id: string; empresa_nome: string; status: 'pendente' | 'aceito' | 'recusado' | 'cancelado'; created_at: string };
type Opcao = 'posto' | 'rede';

/** Chama a função "empresas"; devolve os dados ou o erro em português. */
async function chamarEmpresas<T = unknown>(body: Record<string, unknown>): Promise<{ data: T | null; erro: string | null }> {
  if (!supabase) return { data: null, erro: 'Sem servidor configurado.' };
  const { data, error } = await supabase.functions.invoke('empresas', { body });
  if (!error) return { data: data as T, erro: null };
  try { const r = (error as { context?: Response }).context; const c = r ? await r.json() : null; if (c?.erro) return { data: null, erro: String(c.erro) }; } catch { /* sem JSON */ }
  return { data: null, erro: 'Não foi possível falar com o servidor. Verifique a conexão.' };
}

/**
 * Conta logada que ainda não usa o sistema. Multiempresa:
 * - sem empresa: escolhe entre cadastrar o próprio posto (vira dona e já entra, com todos os módulos vazios) ou
 *   pedir acesso a uma rede que já usa o EasyAudit (só entra quando o administrador dela aprovar). Quem veio do
 *   cadastro da rede pelo site tem a empresa criada aqui, com os dados do cadastro (também já entra);
 * - empresa aguardando liberação (cadastros antigos) ou suspensa (o dono do EasyAudit libera);
 * - conta da empresa ainda não liberada pelo administrador dela.
 */
export default function AguardandoRoute() {
  const { colors } = useContext(ThemeContext);
  const t = useMemo(() => createTypography(colors), [colors]);
  const { userEmail, signOut, recarregarPerfil, empresa } = useAuth();
  const [verificando, setVerificando] = useState(false);
  const [criando, setCriando] = useState(false);
  const [erro, setErro] = useState('');
  const tentou = useRef(false);

  // Sem empresa: redes que já usam o EasyAudit e o último pedido desta conta.
  const [redes, setRedes] = useState<Rede[] | null>(null);
  const [pedido, setPedido] = useState<Pedido | null>(null);
  const [opcao, setOpcao] = useState<Opcao | null>(null);
  const [nomePosto, setNomePosto] = useState('');
  const [busca, setBusca] = useState('');
  const [redeEscolhida, setRedeEscolhida] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  // Conta de uma empresa: avisa os administradores dela por e-mail (o servidor só envia uma vez por conta).
  useEffect(() => { if (empresa?.status === 'ativa') void enviarEmail({ acao: 'conta_pendente' }); }, [empresa?.status]);

  const carregarRedes = useCallback(async () => {
    const r = await chamarEmpresas<{ redes: Rede[]; pedido: Pedido | null }>({ acao: 'redes' });
    if (r.erro || !r.data) { setRedes([]); if (r.erro) setErro(r.erro); return; }
    setRedes(r.data.redes ?? []); setPedido(r.data.pedido ?? null);
  }, []);

  const criar = useCallback(async (body: Record<string, unknown>) => {
    setCriando(true); setErro('');
    const r = await chamarEmpresas({ acao: 'criar', ...body });
    if (r.erro) { setErro(r.erro); setCriando(false); return; }
    await recarregarPerfil();
    setCriando(false);
  }, [recarregarPerfil]);

  // Veio do site: os dados da empresa estão na própria conta; cria a empresa no primeiro acesso.
  // Sem isso, carrega as redes para a pessoa escolher.
  useEffect(() => {
    if (empresa || tentou.current || !supabase) return;
    tentou.current = true;
    void supabase.auth.getUser().then(({ data }) => {
      if (data.user?.user_metadata?.empresa_pendente?.nome) void criar({});
      else void carregarRedes();
    });
  }, [empresa, criar, carregarRedes]);

  const verificar = () => {
    setVerificando(true);
    void Promise.all([recarregarPerfil(), empresa ? Promise.resolve() : carregarRedes()]).finally(() => setVerificando(false));
  };

  const pedirAcesso = async () => {
    const rede = redes?.find(r => r.id === redeEscolhida);
    if (!rede) return;
    setEnviando(true); setErro('');
    const r = await chamarEmpresas({ acao: 'pedir_acesso', empresa_id: rede.id });
    setEnviando(false);
    if (r.erro) { setErro(r.erro); return; }
    notify('Pedido enviado', `Os administradores da ${rede.nome} foram avisados. Você recebe um e-mail quando o pedido for respondido.`, { tom: 'sucesso' });
    void carregarRedes();
  };

  const cancelarPedido = () => confirmAction('Cancelar o pedido?', `O pedido de acesso à ${pedido?.empresa_nome ?? 'rede'} será cancelado. Você pode pedir de novo ou cadastrar o seu posto.`, 'Cancelar pedido', async () => {
    const r = await chamarEmpresas({ acao: 'cancelar_pedido' });
    if (r.erro) { notify('Pedido não cancelado', r.erro); return; }
    setRedeEscolhida(null); void carregarRedes();
  });

  const tela = (conteudo: React.ReactNode) => (
    <ScrollView contentContainerStyle={{ flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12, backgroundColor: colors.bg }} keyboardShouldPersistTaps="handled">
      {conteudo}
      {erro ? <Text style={[t.caption, { color: colors.danger, textAlign: 'center', maxWidth: 440 }]}>{erro}</Text> : null}
      <View style={{ width: '100%', maxWidth: 440, gap: 8, marginTop: 4 }}>
        <Button title={verificando ? 'Verificando…' : 'Verificar novamente'} icon={ResetIcon} variant="secondary" disabled={verificando} onPress={verificar} />
        <Button title="Entrar com outra conta" icon={SignOutIcon} variant="ghost" onPress={() => void signOut()} />
      </View>
    </ScrollView>
  );

  if (criando) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14, backgroundColor: colors.bg, padding: 24 }}>
        <ActivityIndicator color={colors.accent} />
        <Text style={[t.body, { textAlign: 'center' }]}>Cadastrando…</Text>
      </View>
    );
  }

  /* ----- Conta com empresa: aguardando liberação, suspensa ou aguardando o administrador ----- */
  if (empresa) {
    const caso = empresa.status === 'aguardando'
      ? { icone: StorefrontIcon, titulo: 'Empresa aguardando liberação', texto: `O cadastro da ${empresa.nome} foi recebido e está aguardando a liberação do EasyAudit. Você recebe um e-mail quando o acesso for liberado.` }
      : empresa.status === 'suspensa'
        ? { icone: LockSimpleIcon, titulo: 'Acesso da empresa suspenso', texto: `O acesso da ${empresa.nome} ao EasyAudit está suspenso. Os dados continuam guardados. Fale com o EasyAudit para regularizar o plano.` }
        : { icone: LockSimpleIcon, titulo: 'Conta aguardando liberação', texto: `Sua conta (${userEmail}) faz parte da ${empresa.nome}, mas ainda não tem acesso. Peça ao administrador para liberá-la e escolher os módulos que você vai usar. Quando ela for liberada, você recebe um e-mail.` };
    return tela(<>
      <IconTile icon={caso.icone} tint="amber" size={56} />
      <Text style={[t.title, { textAlign: 'center' }]}>{caso.titulo}</Text>
      <Text style={[t.caption, { textAlign: 'center', maxWidth: 420 }]}>{caso.texto}</Text>
    </>);
  }

  if (!redes) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg }}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  /* ----- Sem empresa, com pedido aberto: aguardando o administrador da rede ----- */
  if (pedido?.status === 'pendente') {
    return tela(<>
      <IconTile icon={EnvelopeIcon} tint="amber" size={56} />
      <Text style={[t.title, { textAlign: 'center' }]}>Pedido enviado</Text>
      <Text style={[t.caption, { textAlign: 'center', maxWidth: 420 }]}>
        Você pediu acesso à {pedido.empresa_nome} em {new Date(pedido.created_at).toLocaleDateString('pt-BR')}. O administrador dela precisa aprovar: até lá, a conta {userEmail} não vê nenhum dado da rede. Você recebe um e-mail quando o pedido for respondido.
      </Text>
      <Button title="Cancelar pedido" variant="ghost" size="sm" onPress={cancelarPedido} />
    </>);
  }

  /* ----- Sem empresa: cadastrar o próprio posto ou pedir acesso a uma rede ----- */
  const cartaoOpcao = (id: Opcao, icone: Icon, titulo: string, texto: string) => {
    const on = opcao === id;
    return (
      <Pressable key={id} accessibilityRole="radio" accessibilityState={{ selected: on }} onPress={() => { setOpcao(id); setErro(''); }}
        style={({ pressed }) => [{ flexDirection: 'row', gap: space.md, alignItems: 'flex-start', padding: space.md, borderRadius: radius.card, borderWidth: 1.5, borderColor: on ? colors.accent : colors.border, backgroundColor: on ? colors.accentSoft : colors.surface }, pressed && { opacity: 0.85 }]}>
        <IconTile icon={icone} tint={id === 'posto' ? 'emerald' : 'sky'} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={[t.bodyStrong, on && { color: colors.accentText }]}>{titulo}</Text>
          <Text style={t.caption}>{texto}</Text>
        </View>
      </Pressable>
    );
  };
  const filtradas = redes.filter(r => r.nome.toLowerCase().includes(busca.trim().toLowerCase()));

  return tela(<View style={{ width: '100%', maxWidth: 440, gap: space.md }}>
    <View style={{ alignItems: 'center', gap: 6 }}>
      <IconTile icon={StorefrontIcon} tint="indigo" size={56} />
      <Text style={[t.title, { textAlign: 'center' }]}>Como você quer usar o EasyAudit?</Text>
      <Text style={[t.caption, { textAlign: 'center' }]}>A conta {userEmail} ainda não faz parte de nenhum posto ou rede.</Text>
    </View>
    {pedido?.status === 'recusado' ? (
      <Text style={[t.caption, { color: colors.warning, textAlign: 'center' }]}>O administrador da {pedido.empresa_nome} não aprovou o seu pedido de acesso. Escolha outra opção abaixo.</Text>
    ) : null}

    <View accessibilityRole="radiogroup" style={{ gap: space.sm }}>
      {cartaoOpcao('posto', StorefrontIcon, 'Cadastrar meu posto', 'Você vira o dono do posto e entra na hora. Os módulos começam vazios, prontos para você cadastrar.')}
      {cartaoOpcao('rede', BuildingsIcon, 'Entrar numa rede', 'Escolha uma rede que já usa o EasyAudit e peça acesso. Você só vê os dados depois que o administrador dela aprovar.')}
    </View>

    {opcao === 'posto' ? (
      <Card>
        <Field label="Nome do posto" value={nomePosto} onChangeText={setNomePosto} maxLength={120} placeholder="Ex.: Posto Horizonte" />
        <Button title="Cadastrar e entrar" icon={StorefrontIcon}
          onPress={() => { if (nomePosto.trim().length < 2) { notify('Informe o nome do posto'); return; } void criar({ nome: nomePosto.trim() }); }} />
      </Card>
    ) : null}

    {opcao === 'rede' ? (
      <Card>
        {redes.length ? <>
          <Field icon={MagnifyingGlassIcon} value={busca} onChangeText={setBusca} placeholder="Buscar a rede pelo nome" />
          <View accessibilityRole="radiogroup" style={{ gap: 6, maxHeight: 280 }}>
            <ScrollView nestedScrollEnabled keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 6 }}>
              {filtradas.map(r => {
                const on = r.id === redeEscolhida;
                return (
                  <Pressable key={r.id} accessibilityRole="radio" accessibilityState={{ selected: on }} onPress={() => setRedeEscolhida(r.id)}
                    style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 44, paddingHorizontal: space.md, borderRadius: radius.control, borderWidth: 1, borderColor: on ? colors.accent : colors.border, backgroundColor: on ? colors.accentSoft : colors.campo }, pressed && { opacity: 0.8 }]}>
                    <BuildingsIcon size={18} color={on ? colors.accentText : colors.textMuted} />
                    <Text style={[t.body, { flex: 1 }, on && { color: colors.accentText, fontWeight: '700' }]} numberOfLines={1}>{r.nome}</Text>
                    {on ? <CheckIcon size={16} color={colors.accentText} weight="bold" /> : null}
                  </Pressable>
                );
              })}
              {!filtradas.length ? <Text style={t.caption}>Nenhuma rede com esse nome.</Text> : null}
            </ScrollView>
          </View>
          <Button title={enviando ? 'Enviando…' : 'Pedir acesso'} icon={EnvelopeIcon} disabled={!redeEscolhida || enviando} onPress={() => void pedirAcesso()} />
          <Text style={t.caption}>O pedido vai para os administradores da rede. A conta só passa a ver os dados quando um deles aprovar.</Text>
        </> : <Text style={t.caption}>Ainda não há redes disponíveis. Cadastre o seu posto para começar.</Text>}
      </Card>
    ) : null}
  </View>);
}
