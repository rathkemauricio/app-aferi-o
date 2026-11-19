import { useContext, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { useAuth, useUsuarioLogado } from '../../lib/auth';
import { useCombustiveis } from '../../lib/combustiveis';
import type { Filial } from '../../lib/data';
import { useCollection } from '../../lib/sync';
import { imprimirHtml, rotuloFilial } from '../../lib/util';
import { BarcodeIcon, CaretDownIcon, CheckIcon, ClipboardTextIcon, GasPumpIcon, type Icon, MagnifyingGlassIcon, PrinterIcon, RulerIcon, StorefrontIcon } from '../../ui/icons';
import { Card, Field, ListRow, notify, Sheet } from '../../ui/kit';
import { createTypography, radius, space, ThemeContext, type Tint } from '../../ui/theme';
import { afericoesCol } from '../afericoes/registros';
import { auditReportHtml } from '../afericoes/relatorio';
import { auditoriasCol, lerRelatorio } from '../auditoria/store';
import { htmlDoInventario } from '../coleta/impressao';
import { carregarProdutos, coletasDe, contagensCol, inventariosCol } from '../coleta/store';
import { resumo as resumoMedicao, fmtSinal } from '../tanques/model';
import { medicoesCol } from '../tanques/store';
import { relatorioHtml as relatorioMedicao } from '../tanques/TanquesModule';
import { isoDe } from './store';

// Agenda → "Realizado neste dia": o que foi concluído no dia em cada filial (inventários encerrados, medições de
// tanques, aferições e auditorias), cada um com o seu relatório em PDF. Só aparecem os módulos liberados para a conta.

export type Realizado = {
  id: string; dia: string; filialId: string; tipo: 'inventario' | 'medicao' | 'afericao' | 'auditoria';
  titulo: string; detalhe: string; pdf: () => Promise<void>;
};

const TIPOS: Record<Realizado['tipo'], { rotulo: string; icone: Icon; tint: Tint }> = {
  inventario: { rotulo: 'Inventário encerrado', icone: BarcodeIcon, tint: 'amber' },
  medicao: { rotulo: 'Conferência de estoque', icone: RulerIcon, tint: 'sky' },
  afericao: { rotulo: 'Aferição', icone: GasPumpIcon, tint: 'indigo' },
  auditoria: { rotulo: 'Auditoria', icone: ClipboardTextIcon, tint: 'emerald' },
};
const diaDe = (iso: string | null | undefined) => (iso ? isoDe(new Date(iso)) : '');

/** Tudo o que foi realizado, por dia (AAAA-MM-DD), no filtro de filial escolhido ('' = todas). */
export function useRealizados(filiais: Filial[], filialId: string) {
  const { podeAcessar } = useAuth();
  const usuario = useUsuarioLogado();
  const combustiveis = useCombustiveis();
  const inv = useCollection(inventariosCol);
  const cont = useCollection(contagensCol);
  const med = useCollection(medicoesCol);
  const afe = useCollection(afericoesCol);
  const aud = useCollection(auditoriasCol);
  const nome = (id: string) => { const f = filiais.find(x => x.id === id); return f ? rotuloFilial(f) : 'Filial removida'; };
  const nomeComb = (id: string) => combustiveis.find(c => c.id === id)?.nome ?? (id || '—');

  const lista = useMemo(() => {
    const out: Realizado[] = [];
    if (podeAcessar('coleta')) inv.list.filter(i => i.status === 'encerrado' && i.encerrado_em).forEach(i => out.push({
      id: `inv:${i.id}`, dia: diaDe(i.encerrado_em), filialId: i.filial_id, tipo: 'inventario',
      titulo: `Inventário ${i.codigo} encerrado`, detalhe: `${i.tipo === 'completo' ? 'Completo' : 'Parcial'} · ${cont.list.filter(c => c.inventario_id === i.id).length} contagem(ns)`,
      pdf: async () => {
        const col = coletasDe(i.id);
        await col.sync().catch(() => undefined);
        const produtos = await carregarProdutos(i);
        await imprimirHtml(htmlDoInventario({ inv: i, filialNome: nome(i.filial_id), usuario, produtos, contagens: contagensCol.list(), coletas: col.list() }), `Inventário ${i.codigo}`, true);
      },
    }));
    if (podeAcessar('tanques')) med.list.filter(m => m.status === 'finalizada').forEach(m => {
      const g = resumoMedicao(m).geral;
      out.push({
        id: `med:${m.id}`, dia: m.data, filialId: m.filial_id, tipo: 'medicao',
        titulo: 'Conferência de estoque de combustíveis', detalhe: `${m.tanques.length} tanque(s) · resultado ${fmtSinal(g.resultado)} L · ${m.responsavel_nome || '—'}`,
        pdf: () => imprimirHtml(relatorioMedicao(m, nome(m.filial_id), nomeComb), `Conferência de estoque ${nome(m.filial_id)}`, true),
      });
    });
    if (podeAcessar('afericoes')) afe.list.forEach(r => {
      const a = r.payload?.value;
      if (!a) return;
      const bicos = a.results.filter(x => x.done).length;
      out.push({
        id: `afe:${r.id}`, dia: a.date || r.service_date, filialId: a.branchId, tipo: 'afericao',
        titulo: 'Aferição de bombas', detalhe: `${bicos} bico(s) aferido(s) · ${a.auditor || '—'}`,
        pdf: () => imprimirHtml(auditReportHtml(a), `Aferição ${a.branchCode} ${a.date}`, true),
      });
    });
    if (podeAcessar('auditoria')) aud.list.filter(a => a.status === 'concluida').forEach(a => {
      const ult = [...(a.relatorios ?? [])].sort((x, y) => y.em.localeCompare(x.em))[0];
      out.push({
        id: `aud:${a.id}`, dia: a.data, filialId: a.filial_id, tipo: 'auditoria',
        titulo: 'Auditoria concluída', detalhe: `${a.escopo || 'Auditoria'} · ${a.auditores || '—'}`,
        pdf: async () => {
          if (!ult) throw new Error('Esta auditoria não tem relatório final guardado. Abra-a no módulo Auditoria para gerar.');
          await imprimirHtml(await lerRelatorio(ult.caminho), `Auditoria ${nome(a.filial_id)} ${a.data}`);
        },
      });
    });
    return out.filter(x => x.dia && (!filialId || x.filialId === filialId));
  }, [podeAcessar, inv.list, cont.list, med.list, afe.list, aud.list, filialId, filiais, combustiveis, usuario]); // eslint-disable-line react-hooks/exhaustive-deps

  const porDia = useMemo(() => {
    const m = new Map<string, Realizado[]>();
    lista.forEach(x => m.set(x.dia, [...(m.get(x.dia) ?? []), x]));
    return m;
  }, [lista]);
  const algum = podeAcessar('coleta') || podeAcessar('tanques') || podeAcessar('afericoes') || podeAcessar('auditoria');
  return { porDia, algum, nome };
}

/** Escolha da filial do filtro (todas ou uma). */
export function FiltroFilial({ filiais, valor, onChange }: { filiais: Filial[]; valor: string; onChange: (id: string) => void }) {
  const { colors } = useContext(ThemeContext);
  const t = useMemo(() => createTypography(colors), [colors]);
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState('');
  const f = filiais.find(x => x.id === valor);
  const filtradas = filiais.filter(x => `${x.codigo} ${x.nome} ${x.cidade}`.toLowerCase().includes(busca.trim().toLowerCase()));
  const opcao = (id: string, rotulo: string) => (
    <Pressable key={id || 'todas'} accessibilityRole="radio" accessibilityState={{ selected: valor === id }} onPress={() => { onChange(id); setAberto(false); }}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 46, paddingHorizontal: 8, borderBottomWidth: 1, borderBottomColor: colors.border }}>
      <StorefrontIcon size={16} color={colors.textMuted} />
      <Text style={[t.body, { flex: 1 }]} numberOfLines={1}>{rotulo}</Text>
      {valor === id ? <CheckIcon size={16} color={colors.success} weight="bold" /> : null}
    </Pressable>
  );
  return <>
    <Pressable accessibilityRole="button" accessibilityLabel="Filial do que foi realizado" onPress={() => setAberto(true)}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44, paddingHorizontal: 12, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.control, backgroundColor: colors.surface }}>
      <StorefrontIcon size={16} color={colors.textMuted} />
      <Text style={[t.bodyStrong, { flex: 1 }]} numberOfLines={1}>{f ? rotuloFilial(f) : 'Todas as filiais'}</Text>
      <CaretDownIcon size={14} color={colors.textMuted} />
    </Pressable>
    {aberto ? (
      <Sheet title="Filial" onClose={() => setAberto(false)}>
        <Field icon={MagnifyingGlassIcon} value={busca} onChangeText={setBusca} placeholder="Código, nome ou cidade" />
        {opcao('', 'Todas as filiais')}
        {filtradas.slice(0, 80).map(x => opcao(x.id, rotuloFilial(x)))}
      </Sheet>
    ) : null}
  </>;
}

/** Lista do realizado no dia, com o PDF de cada um. */
export function RealizadoNoDia({ itens, nome, mostrarFilial }: { itens: Realizado[]; nome: (id: string) => string; mostrarFilial: boolean }) {
  const { colors } = useContext(ThemeContext);
  const t = useMemo(() => createTypography(colors), [colors]);
  const [gerando, setGerando] = useState<string | null>(null);
  const abrir = async (x: Realizado) => {
    if (gerando) return;
    setGerando(x.id);
    try { await x.pdf(); } catch (e) { notify('Não foi possível gerar o PDF', e instanceof Error ? e.message : ''); } finally { setGerando(null); }
  };
  if (!itens.length) return <Text style={t.caption}>Nada concluído neste dia{mostrarFilial ? '' : ' nesta filial'}.</Text>;
  return (
    <Card style={{ padding: space.xs, gap: 0 }}>
      {itens.map((x, i) => {
        const tp = TIPOS[x.tipo];
        return (
          <ListRow key={x.id} style={i > 0 && { borderTopWidth: 1, borderTopColor: colors.border, borderRadius: 0 }} icon={tp.icone} tint={tp.tint}
            title={x.titulo}
            subtitle={`${mostrarFilial ? `${nome(x.filialId)} · ` : ''}${x.detalhe}`}
            right={gerando === x.id ? <ActivityIndicator color={colors.textMuted} /> : (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <PrinterIcon size={16} color={colors.accentText} />
                <Text style={[t.caption, { color: colors.accentText, fontWeight: '700' }]}>PDF</Text>
              </View>
            )}
            chevron={false}
            onPress={() => void abrir(x)} />
        );
      })}
    </Card>
  );
}
