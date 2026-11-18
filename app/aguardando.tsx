import { useContext, useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { useAuth } from '../lib/auth';
import { enviarEmail } from '../lib/email';
import { LockSimpleIcon, ResetIcon, SignOutIcon, StorefrontIcon } from '../ui/icons';
import { Button, IconTile } from '../ui/kit';
import { createTypography, ThemeContext } from '../ui/theme';

/**
 * Conta logada que ainda não usa o sistema. Multiempresa:
 * - sem empresa: criou a conta sozinha, sem convite (precisa do convite do administrador da empresa);
 * - empresa aguardando liberação ou suspensa (o dono do EasyAudit libera);
 * - conta da empresa ainda não liberada pelo administrador dela.
 */
export default function AguardandoRoute() {
  const { colors } = useContext(ThemeContext);
  const t = createTypography(colors);
  const { userEmail, signOut, recarregarPerfil, empresa } = useAuth();
  const [verificando, setVerificando] = useState(false);
  // Conta de uma empresa: avisa os administradores dela por e-mail (o servidor só envia uma vez por conta).
  useEffect(() => { if (empresa?.status === 'ativa') void enviarEmail({ acao: 'conta_pendente' }); }, [empresa?.status]);

  const caso = !empresa
    ? { icone: StorefrontIcon, titulo: 'Conta sem empresa', texto: `A conta ${userEmail ?? ''} ainda não faz parte de nenhuma empresa no EasyAudit. Peça ao administrador da sua empresa um convite para este e-mail: quando ele convidar, é só tocar em "Verificar novamente".` }
    : empresa.status === 'aguardando'
      ? { icone: StorefrontIcon, titulo: 'Empresa aguardando liberação', texto: `O cadastro da ${empresa.nome} foi recebido e está aguardando a liberação do EasyAudit. Você recebe um e-mail quando o acesso for liberado.` }
      : empresa.status === 'suspensa'
        ? { icone: LockSimpleIcon, titulo: 'Acesso da empresa suspenso', texto: `O acesso da ${empresa.nome} ao EasyAudit está suspenso. Os dados continuam guardados. Fale com o EasyAudit para regularizar o plano.` }
        : { icone: LockSimpleIcon, titulo: 'Conta aguardando liberação', texto: `Sua conta (${userEmail}) faz parte da ${empresa.nome}, mas ainda não tem acesso. Peça ao administrador para liberá-la e escolher os módulos que você vai usar. Quando ela for liberada, você recebe um e-mail.` };

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12, backgroundColor: colors.bg }}>
      <IconTile icon={caso.icone} tint="amber" size={56} />
      <Text style={[t.title, { textAlign: 'center' }]}>{caso.titulo}</Text>
      <Text style={[t.caption, { textAlign: 'center', maxWidth: 380 }]}>{caso.texto}</Text>
      <Button title={verificando ? 'Verificando…' : 'Verificar novamente'} icon={ResetIcon} disabled={verificando}
        onPress={() => { setVerificando(true); void recarregarPerfil().finally(() => setVerificando(false)); }} />
      <Button title="Entrar com outra conta" icon={SignOutIcon} variant="ghost" onPress={() => void signOut()} />
    </View>
  );
}
