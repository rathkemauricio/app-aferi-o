import { useCallback, useEffect, useMemo, useState } from 'react';
import { type Filial, useFiliais } from '../../lib/data';
import { supabase } from '../../lib/supabase';
import { Collection, combinedStatus, type SyncRow, useCollection } from '../../lib/sync';
import { filialPorNumero, numeroDe, rotuloFilial } from '../../lib/util';

// Base histórica de inventários (sistema legado) + inventários lançados no app.
// Hierarquia: Unidade (filial) → Inventário (linhas por tipo, mesmo cau_id) → Resultado por categoria.

type Valores = {
  sistema: number; contagem: number; faltas: number; sobras: number; resultado: number;
  faltas_rs: number; sobras_rs: number; resultado_rs: number; acuracia: number | null; eficiencia: number | null;
};
export type Inventario = SyncRow & Valores & {
  cau_id: number; descricao: string; tin_id: number | null; cfi_id: number | null; empresa: string; filial_id: string | null;
  agendamento: string; data: string | null; ativo: boolean; origem: 'historico' | 'manual';
};
export type Categoria = SyncRow & Valores & {
  cau_id: number; empresa: string; classe: string; ativo: boolean; origem: 'historico' | 'manual';
  faltas_venda_rs: number | null; sobras_venda_rs: number | null; resultado_venda_rs: number | null;
};

/** Inventários: poucos milhares de linhas, ficam no aparelho e funcionam sem internet. */
export const inventariosCol = new Collection<Inventario>({ table: 'inv_inventarios', storageKey: 'nevoeiro.inventarios.lista.v1' });

export type Unidade = {
  chave: string; nome: string; legado: string; filial?: Filial;
  inventarios: Inventario[]; contagem: number; inativos: number;
  sobraR: number; faltaR: number; resultadoR: number; sobraQ: number; faltaQ: number; ultima: string | null; ultimaTxt: string;
};

/** Unidade do inventário: filial do cadastro (escolhida no lançamento ou pelo número do nome antigo). */
export function chaveUnidade(inv: Inventario, filiais: Filial[]) {
  const f = (inv.filial_id && filiais.find(x => x.id === inv.filial_id)) || filialPorNumero(filiais, numeroDe(inv.empresa));
  return { chave: f ? `f:${f.id}` : `e:${inv.empresa || '—'}`, filial: f || undefined };
}

export const num = (v: unknown) => Number(v ?? 0) || 0;

export function useInventarios() {
  const f = useFiliais();
  const snap = useCollection(inventariosCol);
  const unidades = useMemo(() => {
    const mapa = new Map<string, Unidade>();
    snap.list.forEach(inv => {
      const { chave, filial } = chaveUnidade(inv, f.filiais);
      let u = mapa.get(chave);
      if (!u) {
        u = { chave, filial, nome: filial ? rotuloFilial(filial) : inv.empresa || '—', legado: inv.empresa, inventarios: [], contagem: 0, inativos: 0, sobraR: 0, faltaR: 0, resultadoR: 0, sobraQ: 0, faltaQ: 0, ultima: null, ultimaTxt: '' };
        mapa.set(chave, u);
      }
      u.inventarios.push(inv);
      if (!inv.ativo) { u.inativos++; return; }
      u.sobraR += num(inv.sobras_rs); u.faltaR += num(inv.faltas_rs); u.resultadoR += num(inv.resultado_rs);
      u.sobraQ += num(inv.sobras); u.faltaQ += num(inv.faltas);
      if (inv.data && (!u.ultima || inv.data > u.ultima)) { u.ultima = inv.data; u.ultimaTxt = inv.agendamento; }
    });
    mapa.forEach(u => { u.contagem = new Set(u.inventarios.filter(i => i.ativo).map(i => i.cau_id)).size; });
    return [...mapa.values()].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR', { numeric: true }));
  }, [snap.list, f.filiais]);
  return { unidades, todos: snap.list, filiais: f.filiais, loaded: snap.loaded && f.loaded, status: combinedStatus([snap.status, f.status]) };
}

/* ---------- Categorias: buscadas no servidor quando o inventário é aberto ----------
   São milhares de linhas de detalhe; não cabem bem no armazenamento do aparelho. */
const cache = new Map<number, Categoria[]>();

export function useCategorias(cauId: number | null) {
  const [lista, setLista] = useState<Categoria[] | null>(cauId !== null ? cache.get(cauId) ?? null : null);
  const [erro, setErro] = useState('');
  const [carregando, setCarregando] = useState(false);
  const carregar = useCallback(async () => {
    if (cauId === null) return;
    if (!supabase) { setErro('O detalhamento por categoria fica no servidor: o app está em modo local.'); return; }
    setCarregando(true); setErro('');
    const { data, error } = await supabase.from('inv_categorias').select('*').eq('cau_id', cauId).is('deleted_at', null).order('id');
    setCarregando(false);
    if (error) { setErro(error.message.includes('fetch') ? 'Sem conexão com o servidor. Tente de novo com internet.' : error.message); return; }
    const rows = (data ?? []) as Categoria[];
    cache.set(cauId, rows);
    setLista(rows);
  }, [cauId]);
  useEffect(() => { void carregar(); }, [carregar]);

  const gravar = useCallback(async (row: Partial<Categoria> & { id: string }) => {
    if (!supabase) throw new Error('Sem servidor configurado.');
    const { updated_at: _u, ...rest } = row;
    const { error } = await supabase.from('inv_categorias').upsert(rest);
    if (error) throw new Error(error.message.includes('fetch') ? 'Sem conexão com o servidor. Tente de novo com internet.' : error.message);
    await carregar();
  }, [carregar]);
  return { lista, erro, carregando, recarregar: carregar, gravar };
}
