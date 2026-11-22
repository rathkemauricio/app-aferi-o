// TEMPORÁRIO (teste visual local, não versionar): Mapa de Risco e Inventários com dados simulados no navegador.
import { useContext, useEffect, useState } from 'react';
import { AuthContext } from '../lib/auth';
import { filiaisCol, type Filial } from '../lib/data';
import InventariosModule from '../modules/inventarios/InventariosModule';
import { inventariosCol, type Inventario } from '../modules/inventarios/store';
import RiscosModule from '../modules/riscos/RiscosModule';
import { atividadesCol, unidadesCol } from '../modules/riscos/store';
import type { Unidade } from '../modules/riscos/model';

const q = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : new URLSearchParams();
const fil = (id: string, codigo: string, nome: string, cidade: string): Filial => ({ id, codigo, nome, cidade, uf: 'RS', bandeira: 'branca' });
const FILIAIS = [fil('f1', '01', 'MATRIZ', 'Centro'), fil('f2', '02', 'Posto 02', 'Centro'), fil('f3', '03', 'Posto 03', 'Vila Nova'), fil('f14', '14', 'Posto 14', 'Bairro Alto')];
const uni = (id: string, nome: string, p: number, filial_id: string | null = null): Unidade => ({ id, nome, filial_id, p, c: p, cx: 2, pe: 2, h: 1, ultima_revisao: '2026-11-01', proxima_visita: '2026-12-01', notas: {} });
const UNIDADES = [uni('rmu-02l', '2 Loja (Santa Cruz)', 3), uni('rmu-02p', '2 Pista (Santa Cruz)', 4), uni('rmu-14', '14 (Santa Cruz)', 2), uni('rmu-99', '99 (Cidade Antiga)', 1)];
const inv = (id: string, empresa: string, filial_id: string | null, cau: number): Inventario => ({
  id, cau_id: cau, descricao: `Inventário ${cau}`, tin_id: null, cfi_id: null, empresa, filial_id, agendamento: '01/10/2026', data: '2026-10-01',
  sistema: 100, contagem: 98, faltas: 3, sobras: 1, resultado: -2, faltas_rs: 30, sobras_rs: 10, resultado_rs: -20, acuracia: 98, eficiencia: 97, ativo: true, origem: 'historico',
});
const INVENTARIOS = [inv('i1', 'NEVOEIRO 02', null, 101), inv('i2', 'NEVOEIRO 40', null, 102), { ...inv('i3', 'Posto 14', 'f14', 103), origem: 'manual' as const, criado_por_nome: 'Ana Souza' }];

export default function TesteVisual() {
  const auth = useContext(AuthContext);
  const [pronto, setPronto] = useState(false);
  useEffect(() => {
    void Promise.all([filiaisCol.whenLoaded(), unidadesCol.whenLoaded(), inventariosCol.whenLoaded(), atividadesCol.whenLoaded()]).then(() => {
      filiaisCol.replaceLocal(FILIAIS); unidadesCol.replaceLocal(UNIDADES); inventariosCol.replaceLocal(INVENTARIOS);
      atividadesCol.replaceLocal([{ id: 'a1', unidade_id: 'rmu-14', data: '2026-11-20', tarefa: 'Conferir caixa', categoria: 'Checklist', obs: '', status: 'Concluído', levar_proxima: false, proxima_visita: null, evidencia: null, concluido_em: null, criado_por_nome: 'Ana Souza' }]);
      setPronto(true);
    });
  }, []);
  if (!pronto) return null;
  const valor = { ...auth, isAdmin: true, ativo: true, empresa: { id: 'e', nome: 'Rede Horizonte', status: 'ativa' as const, modulos: [], limite_contas: 10, plano_id: 'essencial' } };
  return <AuthContext.Provider value={valor}>{q.get('tela') === 'inv' ? <InventariosModule /> : <RiscosModule />}</AuthContext.Provider>;
}
