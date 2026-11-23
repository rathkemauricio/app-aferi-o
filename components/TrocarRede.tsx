import { useRouter } from 'expo-router';
import { useContext, useEffect, useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { useAuth } from '../lib/auth';
import { supabase } from '../lib/supabase';
import { EyeIcon, MagnifyingGlassIcon, PencilSimpleIcon } from '../ui/icons';
import { Button, confirmAction, Field, notify, Sheet } from '../ui/kit';
import { createTypography, space, ThemeContext } from '../ui/theme';

type Rede = { id: string; nome: string; status: string };

/** Entrar numa rede (só ver ou administrar), com a confirmação e o aviso. Usado pelo seletor e pelo painel de redes. */
export function useEntrarNaRede() {
  const { visitar } = useAuth();
  const router = useRouter();
  const [entrando, setEntrando] = useState(false);
  const entrar = async (r: { id: string; nome: string }, editar: boolean, depois = '/') => {
    setEntrando(true);
    const erro = await visitar(r.id, editar);
    setEntrando(false);
    if (erro) { notify('Não deu para entrar na rede', erro); return false; }
    notify(editar ? `Você está administrando a ${r.nome}` : `Você está na ${r.nome} como auditor`,
      editar ? 'O que você alterar vale para esta rede e fica no registro de ações em seu nome. Para voltar, use a faixa do alto.'
        : 'Pode abrir qualquer módulo para ver. Nada é alterado. Para voltar, use a faixa do alto.');
    router.replace(depois as never);
    return true;
  };
  const pedir = (r: { id: string; nome: string }, editar: boolean, depois?: string) => {
    if (!editar) { void entrar(r, false, depois); return; }
    confirmAction(`Administrar a ${r.nome}?`, 'Você passa a alterar os dados desta rede (filiais, contagens, usuários, cadastros…) como administrador dela. Cada alteração fica no registro de ações em seu nome.', 'Administrar', () => void entrar(r, true, depois));
  };
  return { pedir, entrando };
}

/** Dono da plataforma: escolher outra rede para ver ou administrar, ou voltar para a própria. */
export function TrocarRede({ onClose }: { onClose: () => void }) {
  const { empresa, visita, visitaEdita, visitar } = useAuth();
  const { colors } = useContext(ThemeContext);
  const t = useMemo(() => createTypography(colors), [colors]);
  const router = useRouter();
  const { pedir, entrando } = useEntrarNaRede();
  const [redes, setRedes] = useState<Rede[] | null>(null);
  const [busca, setBusca] = useState('');
  useEffect(() => {
    void supabase?.from('empresas').select('id,nome,status').eq('status', 'ativa').order('nome').then(r => setRedes((r.data ?? []) as Rede[]));
  }, []);
  const lista = (redes ?? []).filter(r => r.nome.toLowerCase().includes(busca.trim().toLowerCase()));
  const voltar = async () => {
    const erro = await visitar(null);
    if (erro) { notify('Não deu para voltar', erro); return; }
    onClose(); router.replace('/plataforma');
  };
  return (
    <Sheet title="Trocar de rede" onClose={onClose}
      footer={visita ? <Button title="Voltar para a minha rede" variant="secondary" disabled={entrando} onPress={() => void voltar()} /> : undefined}>
      <Text style={t.caption}>"Ver" abre a rede só para consulta. "Administrar" deixa alterar tudo, como administrador dela.</Text>
      <Field icon={MagnifyingGlassIcon} value={busca} onChangeText={setBusca} placeholder="Buscar rede" />
      {!redes ? <Text style={t.caption}>Carregando…</Text> : lista.map(r => {
        const atual = r.id === empresa?.id;
        const modo = !atual ? '' : !visita ? 'sua rede' : visitaEdita ? 'administrando agora' : 'vendo agora';
        return (
          <View key={r.id} style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: 6, borderTopWidth: 1, borderTopColor: colors.border }}>
            <View style={{ flex: 1 }}>
              <Text style={t.bodyStrong} numberOfLines={1}>{r.nome}</Text>
              {modo ? <Text style={t.caption}>{modo}</Text> : null}
            </View>
            {atual && !visita ? null : <>
              <Button title="Ver" icon={EyeIcon} variant="ghost" size="sm" disabled={entrando || (atual && !visitaEdita)} onPress={() => { onClose(); pedir(r, false); }} />
              <Button title="Administrar" icon={PencilSimpleIcon} variant="secondary" size="sm" disabled={entrando || (atual && visitaEdita)} onPress={() => { onClose(); pedir(r, true); }} />
            </>}
          </View>
        );
      })}
    </Sheet>
  );
}
