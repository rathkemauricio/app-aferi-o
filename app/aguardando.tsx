import { useCallback, useContext, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { useAuth } from '../lib/auth';
import { enviarEmail } from '../lib/email';
import { supabase } from '../lib/supabase';
import { LockSimpleIcon, ResetIcon, SignOutIcon, StorefrontIcon } from '../ui/icons';
import { Button, ChoiceChips, Field, IconTile, notify } from '../ui/kit';
import { createTypography, ThemeContext } from '../ui/theme';

type Plano = { id: string; nome: string; limite_contas: number };

/** Chama a função "empresas" e devolve o erro em português, se houver. */
async function chamarEmpresas(body: Record<string, unknown>): Promise<string | null> {
  if (!supabase) return 'Sem servidor configurado.';
  const { error } = await supabase.functions.invoke('empresas', { body });
  if (!error) return null;
  try { const r = (error as { context?: Response }).context; const c = r ? await r.json() : null; if (c?.erro) return String(c.erro); } catch { /* sem JSON */ }
  return 'Não foi possível falar com o servidor. Verifique a conexão.';
}

/**
 * Conta logada que ainda não usa o sistema. Multiempresa:
 * - sem empresa: veio do site (a empresa é criada aqui, com os dados do cadastro), criou a conta sem convite
 *   (pode cadastrar a própria empresa) ou aguarda o convite do administrador da empresa dela;
 * - empresa aguardando liberação ou suspensa (o dono do EasyAudit libera);
 * - conta da empresa ainda não liberada pelo administrador dela.
 */
export default function AguardandoRoute() {
  const { colors } = useContext(ThemeContext);
  const t = createTypography(colors);
  const { userEmail, signOut, recarregarPerfil, empresa } = useAuth();
  const [verificando, setVerificando] = useState(false);
  const [criando, setCriando] = useState(false);
  const [erro, setErro] = useState('');
  const [form, setForm] = useState<{ nome: string; plano: string } | null>(null);
  const [planos, setPlanos] = useState<Plano[]>([]);
  const tentou = useRef(false);

  // Conta de uma empresa: avisa os administradores dela por e-mail (o servidor só envia uma vez por conta).
  useEffect(() => { if (empresa?.status === 'ativa') void enviarEmail({ acao: 'conta_pendente' }); }, [empresa?.status]);

  const criar = useCallback(async (body: Record<string, unknown>) => {
    setCriando(true); setErro('');
    const e = await chamarEmpresas({ acao: 'criar', ...body });
    if (e) { setErro(e); setCriando(false); return; }
    await recarregarPerfil();
    setCriando(false); setForm(null);
  }, [recarregarPerfil]);

  // Veio do site: os dados da empresa estão na própria conta; cria a empresa no primeiro acesso.
  useEffect(() => {
    if (empresa || tentou.current || !supabase) return;
    tentou.current = true;
    void supabase.auth.getUser().then(({ data }) => { if (data.user?.user_metadata?.empresa_pendente?.nome) void criar({}); });
  }, [empresa, criar]);

  const abrirForm = async () => {
    setForm({ nome: '', plano: '' });
    if (!planos.length && supabase) {
      const { data } = await supabase.from('planos').select('id,nome,limite_contas').eq('ativo', true).order('ordem');
      const lista = (data ?? []) as Plano[];
      setPlanos(lista);
      setForm(f => (f ? { ...f, plano: f.plano || lista[0]?.id || '' } : f));
    }
  };

  if (criando) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14, backgroundColor: colors.bg, padding: 24 }}>
        <ActivityIndicator color={colors.accent} />
        <Text style={[t.body, { textAlign: 'center' }]}>Cadastrando a sua empresa…</Text>
      </View>
    );
  }

  const caso = !empresa
    ? { icone: StorefrontIcon, titulo: 'Conta sem empresa', texto: `A conta ${userEmail ?? ''} ainda não faz parte de nenhuma empresa no EasyAudit. Se a sua empresa já usa o sistema, peça um convite ao administrador dela para este e-mail. Se quiser usar o EasyAudit na sua empresa, cadastre-a abaixo.` }
    : empresa.status === 'aguardando'
      ? { icone: StorefrontIcon, titulo: 'Empresa aguardando liberação', texto: `O cadastro da ${empresa.nome} foi recebido e está aguardando a liberação do EasyAudit. Você recebe um e-mail quando o acesso for liberado.` }
      : empresa.status === 'suspensa'
        ? { icone: LockSimpleIcon, titulo: 'Acesso da empresa suspenso', texto: `O acesso da ${empresa.nome} ao EasyAudit está suspenso. Os dados continuam guardados. Fale com o EasyAudit para regularizar o plano.` }
        : { icone: LockSimpleIcon, titulo: 'Conta aguardando liberação', texto: `Sua conta (${userEmail}) faz parte da ${empresa.nome}, mas ainda não tem acesso. Peça ao administrador para liberá-la e escolher os módulos que você vai usar. Quando ela for liberada, você recebe um e-mail.` };

  return (
    <ScrollView contentContainerStyle={{ flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12, backgroundColor: colors.bg }} keyboardShouldPersistTaps="handled">
      <IconTile icon={caso.icone} tint="amber" size={56} />
      <Text style={[t.title, { textAlign: 'center' }]}>{caso.titulo}</Text>
      <Text style={[t.caption, { textAlign: 'center', maxWidth: 400 }]}>{caso.texto}</Text>
      {erro ? <Text style={[t.caption, { color: colors.danger, textAlign: 'center', maxWidth: 400 }]}>{erro}</Text> : null}

      {!empresa && form ? (
        <View style={{ width: '100%', maxWidth: 400, gap: 10, marginTop: 6 }}>
          <Field label="Nome da empresa" value={form.nome} onChangeText={v => setForm({ ...form, nome: v })} maxLength={120} placeholder="Ex.: Rede de Postos Horizonte" />
          {planos.length ? <>
            <Text style={t.label}>Plano</Text>
            <ChoiceChips value={planos.find(p => p.id === form.plano)?.nome ?? ''} options={planos.map(p => p.nome)}
              onChange={v => setForm({ ...form, plano: planos.find(p => p.nome === v)?.id ?? form.plano })} />
            <Text style={t.caption}>{(p => (p ? `Até ${p.limite_contas} contas. O plano pode mudar depois.` : ''))(planos.find(p => p.id === form.plano))}</Text>
          </> : <ActivityIndicator color={colors.accent} />}
          <Button title="Cadastrar empresa" icon={StorefrontIcon}
            onPress={() => { if (form.nome.trim().length < 2) { notify('Informe o nome da empresa'); return; } void criar({ nome: form.nome.trim(), plano_id: form.plano }); }} />
          <Button title="Cancelar" variant="ghost" size="sm" onPress={() => setForm(null)} />
        </View>
      ) : null}

      {!empresa && !form ? <Button title="Cadastrar minha empresa" icon={StorefrontIcon} variant="secondary" onPress={() => void abrirForm()} /> : null}
      <Button title={verificando ? 'Verificando…' : 'Verificar novamente'} icon={ResetIcon} disabled={verificando}
        onPress={() => { setVerificando(true); void recarregarPerfil().finally(() => setVerificando(false)); }} />
      <Button title="Entrar com outra conta" icon={SignOutIcon} variant="ghost" onPress={() => void signOut()} />
    </ScrollView>
  );
}
