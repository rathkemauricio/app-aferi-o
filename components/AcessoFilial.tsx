import { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Switch, Text, View } from 'react-native';
import { type Filial, filiaisCol } from '../lib/data';
import { supabase } from '../lib/supabase';
import { EnvelopeSimpleIcon, LockSimpleIcon } from '../ui/icons';
import { Button, Card, confirmAction, Field, notify, SectionHeader, StatusPill } from '../ui/kit';
import { createTypography, space, ThemeContext } from '../ui/theme';

type ContaFilial = { user_id: string; email: string; ativo: boolean };

/** Chama a função "usuarios" e devolve o erro em português, se houver. */
async function chamarUsuarios(body: Record<string, unknown>): Promise<string | null> {
  if (!supabase) return 'Sem servidor configurado.';
  const { error } = await supabase.functions.invoke('usuarios', { body });
  if (!error) return null;
  let erro = 'Não foi possível falar com o servidor. Verifique a conexão.';
  try { const r = (error as { context?: Response }).context; const c = r ? await r.json() : null; if (c?.erro) erro = String(c.erro); } catch { /* sem JSON */ }
  return erro;
}

/**
 * Acesso da filial às Contagens (só o administrador vê):
 * - e-mail da filial: a conta desse e-mail só usa Contagens e só vê as contagens que a própria filial abrir
 *   (as contagens da auditoria não aparecem para ela);
 * - modo de contagem da filial: com leitor de código (coletor) ou celular sem leitor (câmera, digitação ou lista).
 */
export function AcessoFilial({ filial }: { filial: Filial }) {
  const { colors } = useContext(ThemeContext);
  const t = useMemo(() => createTypography(colors), [colors]);
  const [email, setEmail] = useState(filial.email ?? '');
  const [conta, setConta] = useState<ContaFilial | null | undefined>(undefined);
  const [enviando, setEnviando] = useState(false);
  const leitor = filial.contagem_leitor !== false;

  const carregar = useCallback(async () => {
    if (!supabase) { setConta(null); return; }
    const { data } = await supabase.from('profiles').select('user_id,email,ativo').eq('filial_id', filial.id).maybeSingle();
    setConta((data as ContaFilial | null) ?? null);
  }, [filial.id]);
  useEffect(() => { void carregar(); }, [carregar]);
  useEffect(() => { setEmail(filial.email ?? ''); }, [filial.email]);

  const enviar = async () => {
    const e = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) { notify('E-mail inválido', 'Informe o e-mail da filial.'); return; }
    setEnviando(true);
    const erro = await chamarUsuarios({ acao: 'acesso_filial', filial_id: filial.id, email: e });
    setEnviando(false);
    if (erro) { notify('Acesso não enviado', erro); return; }
    void filiaisCol.sync();
    await carregar();
    notify('Acesso enviado', `${e} recebeu o link para criar a senha. Com ele a filial entra só em Contagens.`);
  };
  const bloquear = () => confirmAction('Bloquear o acesso da filial?', 'A filial deixa de entrar no EasyAudit. As contagens já feitas continuam guardadas. Para liberar de novo, envie o acesso.', 'Bloquear', () => {
    void (async () => {
      setEnviando(true);
      const erro = await chamarUsuarios({ acao: 'bloquear_filial', filial_id: filial.id });
      setEnviando(false);
      if (erro) { notify('Não foi possível bloquear', erro); return; }
      await carregar();
    })();
  });

  const situacao = conta === undefined ? null
    : !conta ? <StatusPill label="Sem acesso" />
    : conta.ativo ? <StatusPill label="Acesso liberado" tone="success" />
    : <StatusPill label="Acesso bloqueado" tone="danger" />;
  const mudou = email.trim().toLowerCase() !== (conta?.email ?? filial.email ?? '');

  return <>
    <SectionHeader title="Acesso da filial (Contagens)" />
    <Card>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
        <Text style={[t.bodyStrong, { flex: 1 }]}>E-mail da filial</Text>
        {situacao}
      </View>
      <Text style={t.caption}>Com este e-mail a filial entra só no módulo Contagens e vê só as contagens que ela mesma abrir. As contagens da auditoria não aparecem para a filial; você vê todas.</Text>
      <Field value={email} onChangeText={setEmail} placeholder="filial@empresa.com.br" autoCapitalize="none" keyboardType="email-address" autoComplete="off" icon={EnvelopeSimpleIcon} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
        <Button title={enviando ? 'Enviando…' : conta && !mudou ? 'Enviar o link de novo' : 'Enviar acesso'} icon={EnvelopeSimpleIcon} disabled={enviando} onPress={() => void enviar()} />
        {conta?.ativo ? <Button title="Bloquear acesso" icon={LockSimpleIcon} variant="secondary" disabled={enviando} onPress={bloquear} /> : null}
      </View>

      <View style={{ height: 1, backgroundColor: colors.border, marginVertical: space.xs }} />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={t.bodyStrong}>Contagem com leitor de código</Text>
          <Text style={t.caption}>{leitor
            ? 'Ligado: a contagem espera o leitor do coletor.'
            : 'Desligado: celular sem leitor. A contagem usa a câmera, a digitação do código ou a lista dos itens.'}</Text>
        </View>
        <Switch value={leitor} onValueChange={v => filiaisCol.put({ ...filial, contagem_leitor: v })} accessibilityLabel="Contagem com leitor de código" />
      </View>
    </Card>
  </>;
}
