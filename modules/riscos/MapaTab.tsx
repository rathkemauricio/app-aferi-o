import { useRouter } from 'expo-router';
import { useState } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import type { Filial } from '../../lib/data';
import { useAtividade } from '../../lib/presenca';
import { ehSomenteLeitura } from '../../lib/sync';
import { shareText } from '../../lib/share';
import { dataBR, isoValida, rotuloFilial } from '../../lib/util';
import { CheckIcon, EyeIcon, FileCsvIcon, MagnifyingGlassIcon, PencilSimpleIcon, PlusIcon, ShieldWarningIcon, StorefrontIcon, TrashIcon, UploadSimpleIcon } from '../../ui/icons';
import { Button, Card, ChoiceChips, confirmAction, EmptyState, Field, notify, Sheet } from '../../ui/kit';
import { space } from '../../ui/theme';
import { avaliada, calcProxima, type Classe, CLASSES, COR_CLASSE, CRITS, MATRIZ, riscoDe, type Unidade, vencida } from './model';
import { type DadosRiscos, idUnidadeDaFilial, importarBackup, lerArquivoJson, nomeUnidade, salvarUnidade, unidadesCol } from './store';
import { Barra, CritPicker, EtiquetaClasse, Kpis, Meta, Pips, useEstilos } from './ui';

const FILTROS = ['Todas', 'Baixo', 'Médio', 'Alto'];

export default function MapaTab({ d }: { d: DadosRiscos }) {
  const router = useRouter();
  const { s, t, colors } = useEstilos();
  const [filtro, setFiltro] = useState('Todas');
  const [busca, setBusca] = useState('');
  const [editar, setEditar] = useState<Unidade | 'nova' | null>(null);
  const [ver, setVer] = useState<Unidade | null>(null);
  const us = d.unidades;
  const conta = (cl: Classe) => us.filter(u => riscoDe(u).cl === cl).length;
  const lista = us.filter(u => (filtro === 'Todas' || riscoDe(u).cl === `Risco ${filtro}`) && u.nome.toLowerCase().includes(busca.toLowerCase()));
  const top = [...us].sort((a, b) => riscoDe(b).tot - riscoDe(a).tot).slice(0, 20);
  const max = top[0] ? riscoDe(top[0]).tot || 1 : 1;

  const exportarCsv = () => {
    const cel = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const linhas = us.map(u => { const r = riscoDe(u); return [u.nome, u.p, u.c, u.cx, u.pe, u.h, r.tot, r.cl, r.fr, dataBR(u.ultima_revisao), dataBR(u.proxima_visita)].map(cel).join(','); });
    void shareText(`mapa_risco_${new Date().toISOString().slice(0, 10)}.csv`, ['Unidade,Produtos,Combustíveis,Caixa/Valores,Pessoas/Gestão,Hist.Auditorias,Total,Classificação,Frequência,Última Revisão,Próxima Visita', ...linhas].join('\r\n'), 'text/csv;charset=utf-8');
  };
  const importar = async () => {
    try {
      const dados = await lerArquivoJson();
      if (!dados) return;
      const r = importarBackup(dados, 2026);
      notify('Backup importado', `${r.unidades} unidade(s) (${r.novas} nova(s)), ${r.notas} nota(s) mensal(is), ${r.pontuacoes} pontuação(ões), ${r.atividades} atividade(s) e ${r.visitas} visita(s) do planejamento.`);
    } catch { notify('Arquivo inválido', 'Escolha o arquivo .json gerado pelo botão "Backup" do HTML antigo.'); }
  };

  const cabecalho = (
    <View style={s.stack}>
      <Kpis itens={[
        { label: 'Total', valor: us.length, cor: colors.accent },
        { label: 'Risco baixo', valor: conta('Risco Baixo'), cor: COR_CLASSE['Risco Baixo'] },
        { label: 'Risco médio', valor: conta('Risco Médio'), cor: COR_CLASSE['Risco Médio'] },
        { label: 'Risco alto', valor: conta('Risco Alto'), cor: COR_CLASSE['Risco Alto'] },
        { label: 'Visitas vencidas', valor: us.filter(u => vencida(u.proxima_visita)).length, cor: '#7c4dcc' },
      ]} />
      {us.length ? (
        <View style={s.wrap}>
          <Card style={{ flexGrow: 2, flexBasis: 300 }}>
            <Text style={t.label}>Pontuação por unidade (top 20)</Text>
            {top.map(u => { const r = riscoDe(u); return (
              <View key={u.id} style={s.row}>
                <Text style={[t.caption, { width: 120 }]} numberOfLines={1}>{u.nome}</Text>
                <Barra pct={(r.tot / max) * 100} cor={COR_CLASSE[r.cl]} />
                <Text style={[t.bodyStrong, { width: 26, textAlign: 'right' }]}>{r.tot}</Text>
              </View>
            ); })}
          </Card>
          <Card style={{ flexGrow: 1, flexBasis: 220 }}>
            <Text style={t.label}>Distribuição de risco</Text>
            <Rosca valores={CLASSES.map(conta)} cores={CLASSES.map(c => COR_CLASSE[c])} />
            {CLASSES.map(c => <View key={c} style={s.row}><View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: COR_CLASSE[c] }} /><Text style={[t.body, s.flex]}>{c}</Text><Text style={[t.bodyStrong, { color: COR_CLASSE[c] }]}>{conta(c)}</Text></View>)}
          </Card>
        </View>
      ) : null}
      <View style={s.pageHead}>
        <Text style={[t.sectionBg, s.flex]}>Filiais</Text>
        <Button title="Dividir em áreas" icon={PlusIcon} variant="secondary" size="sm" disabled={!d.filiais.length} onPress={() => setEditar('nova')} />
      </View>
      <Text style={t.captionBg}>Toda filial do cadastro aparece aqui. Toque em Editar para avaliar o risco; divida uma filial em áreas (ex.: Pista e Loja) só se cada parte for avaliada separadamente.</Text>
      <ChoiceChips value={filtro} options={FILTROS} onChange={setFiltro} toneFor={o => (o === 'Baixo' ? 'success' : o === 'Médio' ? 'warning' : o === 'Alto' ? 'danger' : 'accent')} />
      <Field icon={MagnifyingGlassIcon} value={busca} onChangeText={setBusca} placeholder="Buscar filial ou área" />
    </View>
  );

  return (
    <>
      <FlatList
        data={lista}
        keyExtractor={u => u.id}
        contentContainerStyle={s.content}
        keyboardShouldPersistTaps="handled"
        ItemSeparatorComponent={() => <View style={{ height: space.sm }} />}
        ListHeaderComponent={<View style={{ marginBottom: space.md }}>{cabecalho}</View>}
        ListEmptyComponent={us.length ? <EmptyState icon={MagnifyingGlassIcon} title="Nenhuma filial encontrada" text="Troque o filtro ou a busca." />
          : <EmptyState icon={ShieldWarningIcon} title="Nenhuma filial cadastrada" text="Cadastre as filiais da rede em Filiais: cada uma aparece aqui automaticamente para avaliar o risco." action={{ label: 'Abrir Filiais', icon: StorefrontIcon, onPress: () => router.push('/filiais') }} />}
        ListFooterComponent={<View style={[s.wrap, { marginTop: space.lg }]}>
          <Button title="Exportar CSV" icon={FileCsvIcon} variant="secondary" size="sm" disabled={!us.length} onPress={exportarCsv} />
          <Button title="Importar backup do HTML" icon={UploadSimpleIcon} variant="secondary" size="sm" onPress={() => void importar()} />
        </View>}
        renderItem={({ item: u }) => <CartaoUnidade u={u} filiais={d.filiais} semRegistro={d.semRegistro.has(u.id)} unicaDaFilial={!!u.filial_id && us.filter(x => x.filial_id === u.filial_id).length === 1}
          onVer={() => setVer(u)} onEditar={() => setEditar(u)} />}
      />
      {editar && <UnidadeForm unidade={editar === 'nova' ? null : editar} filiais={d.filiais} unidades={us} onClose={() => setEditar(null)} />}
      {ver && <VerUnidade u={ver} filiais={d.filiais} onClose={() => setVer(null)} onEditar={() => { setEditar(ver); setVer(null); }} />}
    </>
  );
}

function Rosca({ valores, cores }: { valores: number[]; cores: string[] }) {
  const tot = valores.reduce((a, b) => a + b, 0) || 1;
  const r = 46, c = 2 * Math.PI * r;
  let acc = 0;
  return (
    <View style={{ alignItems: 'center', paddingVertical: 4 }}>
      <Svg width={120} height={120} viewBox="0 0 120 120">
        <Circle cx={60} cy={60} r={r} stroke="#e5e7ec" strokeWidth={20} fill="none" />
        {valores.map((v, i) => {
          const len = (v / tot) * c; const off = acc; acc += len;
          return v ? <Circle key={i} cx={60} cy={60} r={r} stroke={cores[i]} strokeWidth={20} fill="none" strokeDasharray={`${len} ${c - len}`} strokeDashoffset={-off} transform="rotate(-90 60 60)" /> : null;
        })}
      </Svg>
    </View>
  );
}

function CartaoUnidade({ u, filiais, semRegistro, unicaDaFilial, onVer, onEditar }: { u: Unidade; filiais: Filial[]; semRegistro: boolean; unicaDaFilial: boolean; onVer: () => void; onEditar: () => void }) {
  const { s, t } = useEstilos();
  const r = riscoDe(u);
  const f = u.filial_id ? filiais.find(x => x.id === u.filial_id) : undefined;
  const venc = vencida(u.proxima_visita);
  return (
    <Card>
      <View style={s.row}>
        <View style={s.flex}>
          <Text style={t.bodyStrong} numberOfLines={1}>{u.nome}</Text>
          <Text style={t.caption} numberOfLines={1}>{f ? `${f.cidade}${f.uf ? `/${f.uf}` : ''} · ` : 'Sem filial no cadastro · '}{avaliada(u) ? r.fr : 'Sem avaliação'}</Text>
        </View>
        {avaliada(u) ? <EtiquetaClasse cl={r.cl} /> : null}
      </View>
      <Meta itens={[
        { label: 'Total', valor: String(r.tot), cor: COR_CLASSE[r.cl] },
        { label: 'Última revisão', valor: dataBR(u.ultima_revisao) || '—' },
        { label: 'Próxima visita', valor: (dataBR(u.proxima_visita) || '—') + (venc ? ' (vencida)' : ''), cor: venc ? '#7c4dcc' : undefined },
      ]} />
      <Pips u={u} />
      <View style={s.wrap}>
        <Button title="Ver" icon={EyeIcon} variant="secondary" size="sm" onPress={onVer} />
        <Button title={avaliada(u) ? 'Editar' : 'Avaliar'} icon={PencilSimpleIcon} variant="secondary" size="sm" onPress={onEditar} />
        {semRegistro ? null : (
          <Button title={unicaDaFilial ? 'Zerar avaliação' : 'Excluir área'} icon={TrashIcon} variant="danger" size="sm"
            onPress={() => confirmAction(unicaDaFilial ? `Zerar a avaliação de "${u.nome}"?` : `Excluir "${u.nome}"?`,
              unicaDaFilial ? 'A filial continua no mapa, sem avaliação. Pontuações, atividades e visitas já registradas ficam guardadas.'
                : 'A área sai do mapa. Pontuações, atividades e visitas dela ficam guardadas no servidor.',
              unicaDaFilial ? 'Zerar' : 'Excluir', () => unidadesCol.remove(u.id))} />
        )}
      </View>
    </Card>
  );
}

function VerUnidade({ u, filiais, onClose, onEditar }: { u: Unidade; filiais: Filial[]; onClose: () => void; onEditar: () => void }) {
  const { s, t } = useEstilos();
  const r = riscoDe(u);
  const f = u.filial_id ? filiais.find(x => x.id === u.filial_id) : undefined;
  return (
    <Sheet title={u.nome} onClose={onClose} footer={<Button title="Editar" icon={PencilSimpleIcon} onPress={onEditar} />}>
      {avaliada(u) ? <EtiquetaClasse cl={r.cl} /> : <Text style={t.caption}>Sem avaliação na matriz.</Text>}
      {f ? <Text style={t.caption}>Filial: {rotuloFilial(f)}</Text> : null}
      <Meta itens={[
        { label: 'Pontuação total', valor: String(r.tot), cor: COR_CLASSE[r.cl] },
        { label: 'Frequência', valor: r.fr },
        { label: 'Última revisão', valor: dataBR(u.ultima_revisao) || '—' },
        { label: 'Próxima visita', valor: dataBR(u.proxima_visita) || '—', cor: vencida(u.proxima_visita) ? '#7c4dcc' : undefined },
      ]} />
      <Text style={t.label}>Critérios de pontuação</Text>
      {MATRIZ.map(m => (
        <View key={m.k} style={s.row}>
          <Text style={[t.body, { width: 140 }]}>{m.nome}</Text>
          <Barra pct={(u[m.k] / 5) * 100} cor={u[m.k] <= 2 ? COR_CLASSE['Risco Baixo'] : u[m.k] <= 3 ? COR_CLASSE['Risco Médio'] : COR_CLASSE['Risco Alto']} />
          <Text style={[t.bodyStrong, { width: 20, textAlign: 'right' }]}>{u[m.k]}</Text>
        </View>
      ))}
    </Sheet>
  );
}

export function UnidadeForm({ unidade, filiais, unidades, onClose }: { unidade: Unidade | null; filiais: Filial[]; unidades: Unidade[]; onClose: () => void }) {
  const { s, t, colors } = useEstilos();
  const nova = !unidade;
  const [filialId, setFilialId] = useState(unidade?.filial_id ?? '');
  const [area, setArea] = useState(unidade?.area ?? '');
  const [buscaF, setBuscaF] = useState('');
  const [crit, setCrit] = useState({ p: unidade?.p ?? 0, c: unidade?.c ?? 0, cx: unidade?.cx ?? 0, pe: unidade?.pe ?? 0, h: unidade?.h ?? 0 });
  const [ur, setUr] = useState(unidade?.ultima_revisao ?? '');
  const n = CRITS.filter(k => crit[k] >= 1).length;
  const r = riscoDe(crit);
  const pv = isoValida(ur) ? calcProxima(ur, r.cl) : null;
  const filial = filiais.find(f => f.id === filialId);
  const filtradas = filiais.filter(f => `${f.codigo} ${f.nome} ${f.cidade}`.toLowerCase().includes(buscaF.toLowerCase())).slice(0, 40);
  // Quem está online: avaliação de risco em andamento (critérios marcados até agora).
  useAtividade(unidade && !ehSomenteLeitura() ? {
    modulo: 'riscos', titulo: 'Avaliação de risco', filial: unidade.nome,
    detalhe: `${n} de 5 critérios marcados${n === 5 ? ` · risco ${r.cl}` : ''}`, pct: (n / 5) * 100, abrir: '/riscos',
  } : null);
  const salvar = () => {
    if (!filial && !unidade) { notify('Escolha a filial', 'A unidade do mapa é uma filial do cadastro (ou uma área dela).'); return; }
    if (nova && !area.trim()) { notify('Informe a área', 'Toda filial já está no mapa. Para dividir, dê um nome à área (ex.: Pista ou Loja).'); return; }
    // Uma unidade por filial e área.
    const repetida = filial && unidades.some(x => x.id !== unidade?.id && x.filial_id === filial.id && (x.area ?? '').trim().toLowerCase() === area.trim().toLowerCase());
    if (repetida) { notify('Já existe', `${nomeUnidade(filial, area)} já está no mapa.`); return; }
    if (n > 0 && n < 5) { notify('Critérios incompletos', 'Selecione de 1 a 5 em todos os critérios, ou deixe todos em branco.'); return; }
    if (ur && !isoValida(ur)) { notify('Data inválida', 'Use o formato AAAA-MM-DD na última revisão.'); return; }
    const id = unidade?.id ?? (area.trim() ? `rmu-${Date.now().toString(36)}` : idUnidadeDaFilial(filialId));
    const nome = filial ? nomeUnidade(filial, area) : unidade!.nome;
    salvarUnidade({ ...(unidade ?? { notas: {}, proxima_visita: null }), id, nome, filial_id: filial?.id ?? unidade?.filial_id ?? null, area: area.trim(), ...crit, ultima_revisao: ur || null } as Unidade);
    onClose();
  };
  return (
    <Sheet title={nova ? 'Dividir filial em áreas' : `Avaliar ${unidade.nome}`} onClose={onClose}
      footer={<View style={s.twoCol}><Button title="Cancelar" variant="secondary" style={s.flex} onPress={onClose} /><Button title="Salvar" icon={CheckIcon} style={s.flex} onPress={salvar} /></View>}>
      {nova ? <>
        <Text style={t.caption}>Toda filial do cadastro já está no mapa. Crie uma área só para avaliar uma parte da filial separadamente (ex.: a Pista e a Loja).</Text>
        <Text style={t.label}>Filial</Text>
        <Field value={buscaF} onChangeText={setBuscaF} placeholder="Buscar filial (código, nome ou cidade)" icon={MagnifyingGlassIcon} />
        <View style={s.listBox}>
          {filtradas.map((f, i) => (
            <Pressable key={f.id} accessibilityRole="radio" accessibilityState={{ selected: f.id === filialId }} onPress={() => setFilialId(f.id)} style={[s.opcao, i > 0 && s.divided, f.id === filialId && { backgroundColor: colors.accentSoft }]}>
              <Text style={[t.body, s.flex, f.id === filialId && { color: colors.accentText, fontWeight: '700' }]} numberOfLines={1}>{rotuloFilial(f)}</Text>
              {f.id === filialId ? <CheckIcon size={16} color={colors.accentText} weight="bold" /> : null}
            </Pressable>
          ))}
          {!filtradas.length ? <Text style={[t.caption, { padding: 12 }]}>Nenhuma filial encontrada.</Text> : null}
        </View>
      </> : <Text style={t.caption}>{filial ? `Filial do cadastro: ${rotuloFilial(filial)}` : 'Unidade sem filial no cadastro.'}</Text>}
      <Field label={nova ? 'Área' : 'Área (opcional)'} value={area} onChangeText={setArea} placeholder="Ex.: Pista" maxLength={40}
        helper={filial ? `Aparece como: ${nomeUnidade(filial, area)}` : undefined} />
      <View style={s.wrap}>{['Pista', 'Loja', 'Conveniência', 'Troca de óleo'].map(a => (
        <Button key={a} title={a} variant={area === a ? 'primary' : 'secondary'} size="sm" onPress={() => setArea(a)} />
      ))}</View>
      <Text style={t.label}>Matriz de classificação de risco (1 a 2 Baixo · 3 Médio · 4 a 5 Alto)</Text>
      {MATRIZ.map(m => <CritPicker key={m.k} k={m.k} valor={crit[m.k]} onChange={v => setCrit(c => ({ ...c, [m.k]: v }))} />)}
      <Text style={t.bodyStrong}>{n === 0 ? 'Sem avaliação. Selecione de 1 a 5 em cada critério.' : n < 5 ? `Faltam ${5 - n} critério(s).` : `Total ${r.tot} · ${r.cl} · frequência ${r.fr}`}</Text>
      <Field label="Última revisão" helper="Formato AAAA-MM-DD" value={ur} onChangeText={setUr} placeholder="AAAA-MM-DD" />
      <Text style={t.caption}>Próxima visita (calculada pela frequência): <Text style={{ fontWeight: '800' }}>{pv ? dataBR(pv) : unidade?.proxima_visita && !ur ? dataBR(unidade.proxima_visita) : '—'}</Text></Text>
    </Sheet>
  );
}
