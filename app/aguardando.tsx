import { useContext, useState } from 'react';
import { Text, View } from 'react-native';
import { useAuth } from '../lib/auth';
import { LockSimpleIcon, ResetIcon, SignOutIcon } from '../ui/icons';
import { Button, IconTile } from '../ui/kit';
import { createTypography, ThemeContext } from '../ui/theme';

/** Conta criada, mas ainda não liberada pelo administrador. */
export default function AguardandoRoute() {
  const { colors } = useContext(ThemeContext);
  const t = createTypography(colors);
  const { userEmail, signOut, recarregarPerfil } = useAuth();
  const [verificando, setVerificando] = useState(false);
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12, backgroundColor: colors.bg }}>
      <IconTile icon={LockSimpleIcon} tint="amber" size={56} />
      <Text style={[t.title, { textAlign: 'center' }]}>Conta aguardando liberação</Text>
      <Text style={[t.caption, { textAlign: 'center', maxWidth: 360 }]}>
        Sua conta ({userEmail}) foi criada, mas ainda não tem acesso. Peça ao administrador para liberá-la e escolher os módulos que você vai usar.
      </Text>
      <Button title={verificando ? 'Verificando…' : 'Verificar novamente'} icon={ResetIcon} disabled={verificando}
        onPress={() => { setVerificando(true); void recarregarPerfil().finally(() => setVerificando(false)); }} />
      <Button title="Entrar com outra conta" icon={SignOutIcon} variant="ghost" onPress={() => void signOut()} />
    </View>
  );
}
