import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { useCollection } from '../lib/sync';
import { auditoriasCol } from './auditoria/store';
import { inventariosCol } from './coleta/store';
import { medicoesCol } from './tanques/store';

// Avisos nos cartões dos módulos (tela inicial): o que está aberto ou em andamento em cada um.

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

export function useAvisoColeta() {
  const { list } = useCollection(inventariosCol);
  const n = list.filter(i => i.status !== 'encerrado').length;
  return n ? `${plural(n, 'inventário aberto', 'inventários abertos')}` : null;
}

export function useAvisoTanques() {
  const { list } = useCollection(medicoesCol);
  const n = list.filter(m => m.status === 'rascunho').length;
  return n ? `${plural(n, 'medição em andamento', 'medições em andamento')}` : null;
}

export function useAvisoAuditoria() {
  const { list } = useCollection(auditoriasCol);
  const n = list.filter(a => a.status !== 'concluida').length;
  return n ? `${plural(n, 'auditoria em andamento', 'auditorias em andamento')}` : null;
}

/** Aferição começada e ainda não salva (fica no rascunho deste aparelho). */
const SESSAO_AFERICOES = 'nevoeiro.afericoes.dashboard.v1.session.v1';
export function useAvisoAfericoes() {
  const [aviso, setAviso] = useState<string | null>(null);
  useFocusEffect(useCallback(() => {
    void AsyncStorage.getItem(SESSAO_AFERICOES).then(v => {
      try {
        const s = v ? JSON.parse(v) as { draft?: { branchId?: string; data?: Record<string, unknown> }; auditMeta?: { editId?: string } } : null;
        const n = Object.keys(s?.draft?.data ?? {}).length;
        setAviso(s?.draft?.branchId ? (s.auditMeta?.editId ? 'Edição de aferição em andamento' : n ? `Aferição em andamento · ${plural(n, 'bico', 'bicos')}` : 'Aferição em andamento') : null);
      } catch { setAviso(null); }
    }).catch(() => setAviso(null));
  }, []));
  return aviso;
}
