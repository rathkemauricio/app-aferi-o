import * as Updates from 'expo-updates';
import { useState } from 'react';
import { ActivityIndicator, Platform, Pressable, Text, View } from 'react-native';

/**
 * O app não roda sem servidor: sem o endereço/chave do Supabase não há login, e não se sabe quem faz as
 * atividades. Em vez do antigo "modo local", a tela fica bloqueada e oferece buscar a atualização corrigida.
 */
export function SemServidor() {
  const [procurando, setProcurando] = useState(false);
  const [msg, setMsg] = useState('');
  const nativo = Platform.OS !== 'web' && Updates.isEnabled;
  const procurar = async () => {
    setProcurando(true); setMsg('');
    try {
      const r = await Updates.checkForUpdateAsync();
      if (!r.isAvailable) { setMsg('Nenhuma atualização nova ainda. Confira a internet e tente de novo em instantes.'); return; }
      await Updates.fetchUpdateAsync();
      await Updates.reloadAsync();
    } catch { setMsg('Não foi possível procurar. Confira a internet e tente de novo.'); } finally { setProcurando(false); }
  };
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28, gap: 14, backgroundColor: '#0f1724' }}>
      <Text style={{ color: '#fff', fontSize: 22, fontWeight: '800', textAlign: 'center' }}>Sem conexão com o servidor do Postora</Text>
      <Text style={{ color: '#c9d4e2', fontSize: 15, textAlign: 'center', lineHeight: 22 }}>
        Este aparelho está sem a configuração do servidor, e o Postora não funciona sem login.{'\n'}
        {nativo ? 'Toque abaixo para buscar a versão corrigida.' : 'Recarregue a página; se continuar, avise o administrador.'}
      </Text>
      {nativo ? (
        <Pressable accessibilityRole="button" onPress={() => void procurar()} disabled={procurando}
          style={({ pressed }) => ({ backgroundColor: '#f3a200', borderRadius: 12, paddingVertical: 14, paddingHorizontal: 22, opacity: procurando ? 0.6 : pressed ? 0.85 : 1 })}>
          {procurando ? <ActivityIndicator color="#1b2230" /> : <Text style={{ color: '#1b2230', fontSize: 16, fontWeight: '800' }}>Procurar atualização</Text>}
        </Pressable>
      ) : null}
      {msg ? <Text style={{ color: '#ffb4ae', fontSize: 14, textAlign: 'center' }}>{msg}</Text> : null}
    </View>
  );
}
