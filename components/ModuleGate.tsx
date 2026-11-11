import { useRouter } from 'expo-router';
import { type ReactNode, useContext } from 'react';
import { Text, View } from 'react-native';
import { useAuth } from '../lib/auth';
import { LockSimpleIcon } from '../ui/icons';
import { Button, IconTile } from '../ui/kit';
import { createTypography, ThemeContext } from '../ui/theme';

/** Mostra o módulo só se a conta tiver acesso (definido pelo administrador). O banco aplica a mesma regra. */
export function ModuleGate({ id, nome, children }: { id: string; nome: string; children: ReactNode }) {
  const { podeAcessar } = useAuth();
  const router = useRouter();
  const { colors } = useContext(ThemeContext);
  if (podeAcessar(id)) return <>{children}</>;
  const t = createTypography(colors);
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12, backgroundColor: colors.bg }}>
      <IconTile icon={LockSimpleIcon} tint="amber" size={56} />
      <Text style={[t.title, { textAlign: 'center' }]}>Sem acesso a {nome}</Text>
      <Text style={[t.caption, { textAlign: 'center', maxWidth: 360 }]}>Este módulo não está liberado para a sua conta. Peça ao administrador para incluí-lo.</Text>
      <Button title="Voltar aos módulos" onPress={() => router.replace('/')} />
    </View>
  );
}
