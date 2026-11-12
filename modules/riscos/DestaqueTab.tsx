import { type ReactNode, useMemo, useState } from 'react';
import { FlatList, Platform, ScrollView, Text, useWindowDimensions, View } from 'react-native';
import { imprimirHtml } from '../../lib/util';
import { CertificateIcon, CheckIcon, EyeIcon, PencilSimpleIcon, PlusIcon, PrinterIcon, TrashIcon, TrophyIcon } from '../../ui/icons';
import { Button, Card, ChoiceChips, confirmAction, EmptyState, Field, notify, Sheet } from '../../ui/kit';
import { space } from '../../ui/theme';
import { certificadoHtml, rankingHtml } from './impressos';
import {
  bloqueios, calcProxima, compsDe, corNivel, corPontos, CRITS, fmt1, fmtNota, type LinhaRanking, MATRIZ, NIVEIS, nivelCertificado, nivelDe, NOTA_FAIXAS, notaFaixa,
  periodoAtual, periodoCurto, periodoLongo, planosPadrao, type Pontuacao, risco, ranking, SELO_UI, seloDe, statsPlano, totalDe, type Unidade, historicoNotas,
} from './model';
import { type DadosRiscos, pontuacoesCol, unidadesCol } from './store';
import { Barra, Caixa, CritPicker, Etiqueta, Kpis, Marcar, UnidadePicker, useEstilos } from './ui';

const ROTULO_MODO = (m: string) => (m === 'current' ? 'Último lançamento' : /^\d{4}$/.test(m) ? `Ano ${m} (média)` : periodoCurto(m));

export default function DestaqueTab({ d }: { d: DadosRiscos }) {
  const { s, t, colors } = useEstilos();
  const { width } = useWindowDimensions();
  const desktop = Platform.OS === 'web' && width >= 1180;
  const [modo, setModo] = useState('current');
  const [lancar, setLancar] = useState<{ unidade?: string; periodo?: string } | null>(null);
  const [detalhe, setDetalhe] = useState<string | null>(null);
  const [cert, setCert] = useState<string | null>(null);
  const modos = useMemo(() => {
    const per = [...new Set(d.pontuacoes.map(p => p.periodo))].sort().reverse();
    return ['current', ...new Set(per.map(p => p.slice(0, 4))), ...per];
  }, [d.pontuacoes]);
  const dados = useMemo(() => ranking(d.unidades, d.pontuacoes, d.visitas, modo), [d.unidades, d.pontuacoes, d.visitas, modo]);
  const reais = dados.filter(x => x.m.real);
  const dest = dados.find(x => x.m.destaque);
  const evo = reais.filter(x => x.m.delta !== null && x.m.delta > 0).sort((a, b) => (b.m.delta ?? 0) - (a.m.delta ?? 0))[0];
  const nomeU = (id: string) => d.unidades.find(u => u.id === id)?.nome ?? 'Unidade removida';
  const lancadas = [...d.pontuacoes].sort((a, b) => b.periodo.localeCompare(a.periodo) || nomeU(a.unidade_id).localeCompare(nomeU(b.unidade_id), 'pt-BR', { numeric: true }));
  const imprimir = async () => { try { await imprimirHtml(rankingHtml(dados), 'Ranking Filial Destaque'); } catch (e) { notify('Não foi possível gerar o PDF', e instanceof Error ? e.message : ''); } };
  const abrirCertificado = (x: LinhaRanking) => {
    const lv = nivelCertificado(x);
    if (!lv.ok) { notify('Certificado', lv.motivo); return; }
    setCert(x.u.id);
  };
  const linhaDetalhe = detalhe ? dados.find(x => x.u.id === detalhe) : undefined;
  const linhaCert = cert ? dados.find(x => x.u.id === cert) : undefined;

  const cabecalho = (
    <View style={[s.stack, { marginBottom: space.md }]}>
      <Kpis itens={[
        { label: 'Avaliados', valor: `${reais.length} de ${dados.length}` },
        { label: 'Destaque', valor: dest ? dest.u.nome : '—', destaque: true },
        { label: 'Maior Evolução', valor: evo ? `${evo.u.nome} +${fmtNota(evo.m.delta ?? 0)}` : '—', cor: '#157a3c' },
        { label: 'Ouro', valor: reais.filter(x => x.m.selo === 'Ouro').length, cor: '#946500' },
        { label: 'Aguardando Lançamento', valor: dados.length - reais.length, cor: '#6250a4' },
      ]} />
      <Text style={t.caption}>A pontuação vai de 0 a 100 e usa os critérios das auditorias: <Text style={{ fontWeight: '800' }}>Auditoria 40%</Text> (nota 0–10 × 10), <Text style={{ fontWeight: '800' }}>Evolução 20%</Text> (Histórico Auditorias), <Text style={{ fontWeight: '800' }}>Controle de Perdas 15%</Text> (média de Produtos, Combustíveis e Caixa), <Text style={{ fontWeight: '800' }}>Planos de Ação 15%</Text> (% concluídos) e <Text style={{ fontWeight: '800' }}>Consistência 10%</Text> (Pessoas e Gestão). Nos critérios de risco, 1 vale 100 pontos e 5 vale 0. Unidades sem lançamento ou nota aparecem estimadas e não recebem selo nem certificado.</Text>
      <ChoiceChips value={modo} options={modos} onChange={setModo} toneFor={() => 'accent'} />
      {modos.length > 1 ? <Text style={t.caption}>Período: {ROTULO_MODO(modo)}</Text> : null}
      <View style={s.wrap}>
        <Button title="Lançar pontuação" icon={PlusIcon} size="sm" disabled={!d.unidades.length} onPress={() => setLancar({})} />
        <Button title="Imprimir ranking" icon={PrinterIcon} variant="secondary" size="sm" disabled={!dados.length} onPress={() => void imprimir()} />
      </View>
      <Text style={t.section}>🏆 Ranking do Programa Filial Destaque</Text>
    </View>
  );

  const rodape = (
    <View style={[s.stack, { marginTop: space.lg }]}>
      <Text style={t.section}>Critérios e premiações</Text>
      <View style={s.wrap}>
        {[
          ['🏆 Filial Destaque', 'Maior pontuação entre as avaliadas, com auditoria Boa ou Excelente (nota 7 ou mais), sem Risco Alto e sem plano de ação não concluído.'],
          ['⭐ Filial Ouro', 'Pontuação de 90 ou mais, auditoria Excelente (nota 9 ou 10), sem Risco Alto e com planos de ação em dia.'],
          ['🥈 Filial Prata', 'Pontuação de 80 a 89,9 com auditoria Boa ou melhor (nota 7 ou mais).'],
          ['🥉 Filial Bronze', 'Pontuação de 70 a 79,9 com auditoria Boa ou melhor (nota 7 ou mais).'],
          ['📈 Maior Evolução', 'Maior alta na nota da auditoria em relação à avaliação anterior.'],
          ['Em acompanhamento', 'Pontuação abaixo de 70 ou auditoria Regular ou Crítica (nota abaixo de 7). Sem selo e sem certificado.'],
        ].map(([a, b]) => <Card key={a} style={{ flexGrow: 1, flexBasis: 220 }}><Text style={t.bodyStrong}>{a}</Text><Text style={t.caption}>{b}</Text></Card>)}
      </View>
      <Text style={t.section}>Pontuações lançadas</Text>
      {!lancadas.length ? <Text style={t.caption}>Nenhuma pontuação lançada ainda. Use "Lançar pontuação".</Text> : null}
      {lancadas.map(p => {
        const sc = { nota: Number(p.nota), p: p.p, c: p.c, cx: p.cx, pe: p.pe, h: p.h, plans: Number(p.planos) };
        const tot = totalDe(compsDe(sc)); const f = notaFaixa(sc.nota);
        return (
          <Card key={p.id}>
            <View style={s.row}>
              <View style={s.flex}>
                <Text style={t.bodyStrong} numberOfLines={1}>{nomeU(p.unidade_id)} · {periodoCurto(p.periodo)}</Text>
                <Text style={t.caption}>Nota <Text style={{ color: f.cor, fontWeight: '800' }}>{fmtNota(sc.nota)} {f.label}</Text> · {MATRIZ.map(m => `${m.curto} ${p[m.k]}`).join(' · ')} · Planos {fmt1(sc.plans).replace(',0', '')}%</Text>
              </View>
              <Text style={{ fontSize: 18, fontWeight: '800', color: corPontos(tot) }}>{fmt1(tot)}</Text>
            </View>
            <View style={s.wrap}>
              <Button title="Editar" icon={PencilSimpleIcon} variant="secondary" size="sm" onPress={() => setLancar({ unidade: p.unidade_id, periodo: p.periodo })} />
              <Button title="Excluir" icon={TrashIcon} variant="danger" size="sm" onPress={() => confirmAction('Excluir esta pontuação?', 'A nota já gravada no Histórico de Auditorias e os critérios do Mapa de Risco não são alterados.', 'Excluir', () => pontuacoesCol.remove(p.id))} />
            </View>
          </Card>
        );
      })}
    </View>
  );

  return (
    <>
      <FlatList
        data={dados}
        keyExtractor={x => x.u.id}
        contentContainerStyle={s.content}
        ItemSeparatorComponent={() => <View style={{ height: space.sm }} />}
        ListHeaderComponent={cabecalho}
        ListFooterComponent={rodape}
        ListEmptyComponent={<EmptyState icon={TrophyIcon} title="Nenhuma unidade no mapa" text="Cadastre as unidades na aba Mapa de Risco." />}
        renderItem={({ item: x }) => <CartaoRanking x={x} onLancar={() => setLancar({ unidade: x.u.id })} onDetalhe={() => setDetalhe(x.u.id)} onCert={() => {
          const lv = nivelCertificado(x);
          if (!lv.ok) { notify('Certificado', lv.motivo); return; }
          setCert(x.u.id);
        }} />}
      />
      {lancar && <LancarSheet d={d} inicial={lancar} onClose={() => setLancar(null)} />}
      {linhaDetalhe && <DetalheSheet x={linhaDetalhe} onClose={() => setDetalhe(null)} onLancar={() => { setDetalhe(null); setLancar({ unidade: linhaDetalhe.u.id }); }} />}
      {linhaCert && <CertificadoSheet x={linhaCert} onClose={() => setCert(null)} />}
    </>
  );
}

function SeloTag({ x }: { x: LinhaRanking }) {
  const ui = SELO_UI[x.m.selo];
  return <Etiqueta texto={x.m.destaque && x.m.selo !== 'Ouro' ? '🏆 FILIAL DESTAQUE' : ui.t} cor={ui.cor} fundo={ui.fundo} />;
}
function NotaTag({ x }: { x: LinhaRanking }) {
  if (x.m.nota === null) return null;
  const f = notaFaixa(x.m.nota);
  return <Etiqueta texto={`${x.m.fonte === 'estimado' ? 'Nota ~' : 'Nota '}${fmtNota(Math.round(x.m.nota * 10) / 10)} · ${f.label}`} cor={f.cor} />;
}

function CartaoRanking({ x, onLancar, onDetalhe, onCert }: { x: LinhaRanking; onLancar: () => void; onDetalhe: () => void; onCert: () => void }) {
  const { s, t, colors } = useEstilos();
  const m = x.m;
  const medalha = !m.real ? '—' : x.pos === 1 ? '🥇' : x.pos === 2 ? '🥈' : x.pos === 3 ? '🥉' : `${x.pos}º`;
  const fonte = m.fonte === 'lancamento' ? `Lançado · ${m.periodoTxt}` : m.fonte === 'auditoria' ? `Nota do Histórico de Auditorias · ${m.periodoTxt}` : m.fonte === 'estimado' ? 'Estimado pelo Mapa de Risco, sem nota de auditoria' : 'Sem avaliação no Mapa de Risco';
  const comp = (lb: string, v: number | undefined) => (
    <View key={lb} style={{ flexGrow: 1, flexBasis: 90 }}>
      <Text style={[t.caption, { fontSize: 10.5, fontWeight: '700' }]}>{lb}</Text>
      <Text style={[t.bodyStrong, { color: v === undefined ? colors.textFaint : corPontos(v) }]}>{v === undefined ? '—' : fmt1(v)}</Text>
    </View>
  );
  return (
    <Card style={[m.destaque && { borderColor: '#d4a72c', borderWidth: 2 }, !m.real && { opacity: 0.8 }]}>
      <View style={s.row}>
        <Text style={{ fontSize: 20, width: 38, textAlign: 'center', fontWeight: '800', color: colors.text }}>{medalha}</Text>
        <View style={s.flex}>
          <Text style={t.bodyStrong} numberOfLines={1}>{x.u.nome}</Text>
          <View style={[s.row, { flexWrap: 'wrap', marginTop: 3 }]}><SeloTag x={x} /><NotaTag x={x} /></View>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={[t.caption, { fontSize: 10.5 }]}>PONTUAÇÃO</Text>
          <Text style={{ fontSize: 24, fontWeight: '800', color: m.total === null ? colors.textFaint : corPontos(m.total) }}>{m.total === null ? '—' : fmt1(m.total)}</Text>
        </View>
      </View>
      <Text style={t.caption}>{fonte}</Text>
      {m.bloqueado ? <Text style={[t.caption, { color: colors.danger }]}>⚠ Ouro e Destaque bloqueados: {m.motivos.join(' · ')}</Text> : null}
      <View style={s.wrap}>
        {comp('Auditoria 40%', m.comps?.audit)}{comp('Evolução 20%', m.comps?.evolution)}{comp('Perdas 15%', m.comps?.loss)}{comp('Planos 15%', m.comps?.action)}{comp('Consistência 10%', m.comps?.consistency)}
      </View>
      <View style={s.wrap}>
        <Button title="Certificado" icon={CertificateIcon} variant="secondary" size="sm" onPress={onCert} />
        <Button title="Lançar" icon={PlusIcon} variant="secondary" size="sm" onPress={onLancar} />
        <Button title="Detalhes" icon={EyeIcon} variant="ghost" size="sm" onPress={onDetalhe} />
      </View>
    </Card>
  );
}

/* ---------- Lançar pontuação ---------- */
function LancarSheet({ d, inicial, onClose }: { d: DadosRiscos; inicial: { unidade?: string; periodo?: string }; onClose: () => void }) {
  const { s, t, colors } = useEstilos();
  const [uid, setUid] = useState(inicial.unidade ?? d.unidades[0]?.id ?? '');
  const [periodo, setPeriodo] = useState(inicial.periodo ?? periodoAtual());
  const u = d.unidades.find(x => x.id === uid);
  const ps = statsPlano(d.visitas, uid);
  const existente = d.pontuacoes.find(p => p.unidade_id === uid && p.periodo === periodo);
  const carregar = (un: Unidade | undefined, per: string) => {
    const ex = d.pontuacoes.find(p => p.unidade_id === un?.id && p.periodo === per);
    if (ex) return { nota: String(ex.nota).replace('.', ','), planos: String(ex.planos), crit: { p: ex.p, c: ex.c, cx: ex.cx, pe: ex.pe, h: ex.h }, obs: ex.obs };
    const mesma = un ? historicoNotas(un, d.pontuacoes).find(h => h.periodo === per) : undefined;
    const temCrit = un && CRITS.every(k => un[k] >= 1);
    return { nota: mesma ? String(mesma.nota).replace('.', ',') : '', planos: String(planosPadrao(statsPlano(d.visitas, un?.id ?? ''))), crit: temCrit ? { p: un.p, c: un.c, cx: un.cx, pe: un.pe, h: un.h } : { p: 0, c: 0, cx: 0, pe: 0, h: 0 }, obs: '' };
  };
  const [f, setF] = useState(() => carregar(u, periodo));
  const [sync, setSync] = useState(periodo >= periodoAtual());
  const trocar = (novoU: string, novoP: string) => {
    setUid(novoU); setPeriodo(novoP);
    if (/^\d{4}-\d{2}$/.test(novoP)) { setF(carregar(d.unidades.find(x => x.id === novoU), novoP)); setSync(novoP >= periodoAtual()); }
  };

  const nota = f.nota.trim() === '' ? null : Math.max(0, Math.min(10, Number(f.nota.replace(',', '.'))));
  const notaOk = nota !== null && Number.isFinite(nota);
  const planos = f.planos.trim() === '' ? planosPadrao(ps) : Math.max(0, Math.min(100, Number(f.planos.replace(',', '.')) || 0));
  const vals = CRITS.map(k => f.crit[k]);
  const cheios = vals.filter(v => v >= 1).length;
  const rk = risco(f.crit.p, f.crit.c, f.crit.cx, f.crit.pe, f.crit.h);
  const ultima = u ? historicoNotas(u, d.pontuacoes).pop() : undefined;

  let previa: ReactNode = <Text style={t.caption}>Preencha a nota e os 5 critérios para ver o total do programa.</Text>;
  if (notaOk && cheios === 5) {
    const comps = compsDe({ nota: nota!, ...f.crit, plans: planos });
    const total = totalDe(comps);
    const mot = bloqueios(rk.cl, ps, true);
    const selo = seloDe(total, nota!, mot.length > 0);
    const fx = notaFaixa(nota!);
    const porque = selo === 'Acompanhamento' ? (nota! < 7 ? `Sem selo: auditoria ${fx.label} (nota ${fmtNota(nota!)}); o mínimo é Bom (7).` : 'Sem selo: pontuação abaixo de 70.')
      : selo !== 'Ouro' && total >= 90 && nota! < 9 ? 'Ouro exige auditoria Excelente (nota 9 ou mais).'
      : selo !== 'Ouro' && total >= 90 && mot.length ? `Ouro bloqueado: ${mot.join(' e ')}.` : '';
    previa = (
      <>
        <View style={s.wrap}>
          {([['Auditoria 40%', comps.audit], ['Evolução 20%', comps.evolution], ['Perdas 15%', comps.loss], ['Planos 15%', comps.action], ['Consistência 10%', comps.consistency]] as const).map(([lb, v]) => (
            <View key={lb} style={{ flexGrow: 1, flexBasis: 90 }}><Text style={[t.caption, { fontSize: 10.5 }]}>{lb}</Text><Text style={[t.bodyStrong, { color: corPontos(v) }]}>{fmt1(v)}</Text></View>
          ))}
        </View>
        <View style={[s.row, { flexWrap: 'wrap' }]}>
          <Text style={t.bodyStrong}>Total <Text style={{ color: corPontos(total), fontSize: 18 }}>{fmt1(total)}</Text> pontos</Text>
          <Etiqueta texto={SELO_UI[selo].t} cor={SELO_UI[selo].cor} fundo={SELO_UI[selo].fundo} />
        </View>
        {porque ? <Text style={t.caption}>{porque}</Text> : null}
      </>
    );
  }

  const salvar = () => {
    if (!u || !/^\d{4}-\d{2}$/.test(periodo)) { notify('Informe a unidade e o período', 'Período no formato AAAA-MM.'); return; }
    if (!notaOk) { notify('Informe a nota da auditoria (0 a 10)'); return; }
    if (cheios < 5) { notify('Selecione a pontuação (1 a 5) de todos os critérios'); return; }
    const row: Pontuacao = { id: `${u.id}:${periodo}`, unidade_id: u.id, periodo, nota: nota!, ...f.crit, planos, obs: f.obs.trim() };
    pontuacoesCol.put(row);
    // A nota entra no Histórico de Auditorias; se marcado, os critérios atualizam o Mapa de Risco.
    const atual = unidadesCol.get(u.id) ?? u;
    const notas = { ...(atual.notas ?? {}), [periodo]: nota! };
    unidadesCol.put(sync ? { ...atual, notas, ...f.crit, proxima_visita: calcProxima(atual.ultima_revisao, rk.cl) ?? atual.proxima_visita } : { ...atual, notas });
    notify(existente ? 'Pontuação atualizada' : 'Pontuação lançada', sync ? 'O Mapa de Risco desta unidade também foi atualizado.' : '');
    onClose();
  };

  return (
    <Sheet title="Lançar pontuação" onClose={onClose}
      footer={<View style={s.twoCol}><Button title="Cancelar" variant="secondary" style={s.flex} onPress={onClose} /><Button title="Salvar pontuação" icon={CheckIcon} style={s.flex} onPress={salvar} /></View>}>
      <Text style={t.caption}>Informe a nota da auditoria (0 a 10) e a pontuação de risco (1 a 5) de cada critério, como na Matriz de Classificação de Risco. O total do programa é calculado automaticamente.</Text>
      <Text style={t.label}>Unidade</Text>
      <UnidadePicker unidades={d.unidades} valor={uid} onChange={id => trocar(id, periodo)} />
      <Field label="Período" helper="Formato AAAA-MM" value={periodo} onChangeText={p => trocar(uid, p)} />
      {existente ? <Caixa cor="#2f6fd0"><Text style={t.caption}>Já existe lançamento de {periodoCurto(periodo)} para esta unidade. Ao salvar, ele será atualizado.</Text></Caixa> : null}
      <Card>
        <Text style={t.label}>Nota da auditoria · 0 a 10 · peso 40%</Text>
        <Field value={f.nota} onChangeText={v => setF(o => ({ ...o, nota: v }))} placeholder="0 a 10" keyboardType="decimal-pad" />
        {notaOk ? <Text style={t.caption}><Text style={{ fontWeight: '800', color: notaFaixa(nota!).cor }}>{notaFaixa(nota!).label}</Text> {notaFaixa(nota!).desc} <Text style={{ fontWeight: '800' }}>Ação:</Text> {notaFaixa(nota!).acao}</Text>
          : <Text style={t.caption}>Informe a nota da auditoria.{ultima ? ` Última nota registrada: ${fmtNota(ultima.nota)} (${periodoCurto(ultima.periodo)}).` : ''}</Text>}
        <View style={s.wrap}>{NOTA_FAIXAS.map(x => <Text key={x.label} style={[t.caption, { color: x.cor }]}><Text style={{ fontWeight: '800' }}>{x.faixa}</Text> {x.label}</Text>)}</View>
      </Card>
      <Card>
        <Text style={t.label}>Matriz de risco · 1 = melhor · 5 = pior</Text>
        {MATRIZ.map(m => <CritPicker key={m.k} k={m.k} valor={f.crit[m.k]} mostrarPeso onChange={v => setF(o => ({ ...o, crit: { ...o.crit, [m.k]: v } }))} />)}
        <Text style={t.bodyStrong}>{cheios === 0 ? 'Selecione a pontuação de cada critério.' : cheios < 5 ? `Faltam ${5 - cheios} critério(s).` : `Total de risco ${rk.tot} · ${rk.cl} · frequência ${rk.fr}`}</Text>
      </Card>
      <Card>
        <Text style={t.label}>Planos de ação · % concluídos · peso 15%</Text>
        <Field value={f.planos} onChangeText={v => setF(o => ({ ...o, planos: v }))} keyboardType="number-pad" />
        <Text style={t.caption}>{ps.total ? `Planejamento: ${ps.done} de ${ps.total} atividades concluídas${ps.notDone ? ` · ${ps.notDone} não concluída(s)` : ''}.` : 'Sem atividades no Planejamento: 100% por padrão.'}</Text>
      </Card>
      <Field label="Observações" multiline value={f.obs} onChangeText={v => setF(o => ({ ...o, obs: v }))} placeholder="Justificativa, evidências ou observações da pontuação" />
      <Marcar valor={sync} onChange={setSync} texto="Atualizar também o Mapa de Risco desta unidade com estes critérios" />
      <Card style={{ borderColor: colors.accent }}>{previa}</Card>
    </Sheet>
  );
}

/* ---------- Detalhes ---------- */
function DetalheSheet({ x, onClose, onLancar }: { x: LinhaRanking; onClose: () => void; onLancar: () => void }) {
  const { s, t, colors } = useEstilos();
  const m = x.m;
  const f = m.nota !== null ? notaFaixa(m.nota) : null;
  const origem = m.fonte === 'lancamento' ? `Lançamento de ${m.periodoTxt}.` : m.fonte === 'auditoria' ? `Nota do Histórico de Auditorias (${m.periodoTxt}) e critérios do Mapa de Risco. Sem lançamento no programa.` : m.fonte === 'estimado' ? 'Ainda sem lançamento e sem nota de auditoria: a nota foi estimada a partir da pontuação do Mapa de Risco e não gera selo nem certificado.' : 'Esta unidade ainda não tem pontuação no Mapa de Risco nem lançamento.';
  return (
    <Sheet title={x.u.nome} onClose={onClose} footer={<Button title="Lançar pontuação" icon={PlusIcon} onPress={onLancar} />}>
      <View style={[s.row, { flexWrap: 'wrap' }]}><SeloTag x={x} /><NotaTag x={x} /></View>
      <View style={s.wrap}>
        <Card style={{ flexGrow: 1, flexBasis: 140 }}><Text style={t.label}>Pontuação do programa</Text><Text style={{ fontSize: 26, fontWeight: '800', color: m.total === null ? colors.textFaint : corPontos(m.total) }}>{m.total === null ? '—' : fmt1(m.total)}</Text></Card>
        <Card style={{ flexGrow: 1, flexBasis: 140 }}><Text style={t.label}>Nota da auditoria</Text><Text style={t.bodyStrong}>{m.nota === null ? 'Sem nota' : `${m.fonte === 'estimado' ? '~' : ''}${fmtNota(Math.round(m.nota * 10) / 10)}/10 · ${f?.label}`}</Text>{f ? <Text style={t.caption}>{f.desc} Ação: {f.acao}</Text> : null}</Card>
        <Card style={{ flexGrow: 1, flexBasis: 140 }}><Text style={t.label}>Evolução da nota</Text><Text style={t.bodyStrong}>{m.delta !== null && m.anterior !== null ? `${m.delta >= 0 ? '+' : ''}${fmtNota(Math.round(m.delta * 10) / 10)} vs. ${fmtNota(m.anterior)}` : 'Sem avaliação anterior'}</Text></Card>
        <Card style={{ flexGrow: 1, flexBasis: 140 }}><Text style={t.label}>Planos de ação</Text><Text style={t.bodyStrong}>{m.ps.total ? `${m.ps.done} de ${m.ps.total} concluídos` : 'Sem atividades'}</Text></Card>
      </View>
      <Text style={t.caption}>{origem}</Text>
      <Text style={t.section}>Matriz de risco</Text>
      {m.scores ? MATRIZ.map(c => { const v = m.scores![c.k]; const lv = nivelDe(v); return (
        <View key={c.k} style={s.row}>
          <Text style={[t.body, { width: 130 }]}>{c.nome}</Text>
          <Text style={{ fontWeight: '800', color: corNivel(v), width: 18 }}>{v}</Text>
          <Text style={[t.caption, s.flex]}><Text style={{ fontWeight: '800', color: corNivel(v) }}>{NIVEIS[lv].label}</Text> {c[lv]}</Text>
        </View>
      ); }) : <Text style={t.caption}>Sem pontuação por critério.</Text>}
      {m.comps ? (
        <>
          <Text style={t.section}>Composição da pontuação</Text>
          {([['Resultado da Auditoria (40%)', m.comps.audit], ['Evolução — Histórico de Auditorias (20%)', m.comps.evolution], ['Controle de Perdas (15%)', m.comps.loss], ['Planos de Ação (15%)', m.comps.action], ['Consistência — Pessoas e Gestão (10%)', m.comps.consistency]] as const).map(([lb, v]) => (
            <View key={lb} style={{ gap: 4 }}>
              <View style={s.row}><Text style={[t.caption, s.flex]}>{lb}</Text><Text style={t.bodyStrong}>{fmt1(v)}</Text></View>
              <Barra pct={v} cor={corPontos(v)} />
            </View>
          ))}
        </>
      ) : null}
      {m.obs ? <><Text style={t.section}>Observações</Text><Text style={t.body}>{m.obs}</Text></> : null}
      {m.bloqueado ? <Text style={[t.caption, { color: colors.danger }]}>⚠ Ouro e Destaque bloqueados: {m.motivos.join(' e ')}.</Text> : null}
    </Sheet>
  );
}

/* ---------- Certificado ---------- */
function CertificadoSheet({ x, onClose }: { x: LinhaRanking; onClose: () => void }) {
  const { t } = useEstilos();
  const lv = nivelCertificado(x);
  const m = x.m;
  // O certificado segue o modelo impresso da rede, que usa ponto decimal.
  const fmtCertificado = (n: number) => n.toFixed(1);
  const [v, setV] = useState({
    unidade: x.u.nome,
    periodo: periodoLongo(m.periodo),
    premio: lv.ok ? lv.premio : '',
    pontuacao: m.total !== null && m.nota !== null ? `${fmtCertificado(m.total)} pontos · Auditoria ${fmtCertificado(m.nota)}/10 (${notaFaixa(m.nota).label})` : '',
    mensagem: `Certificamos que a ${x.u.nome} foi reconhecida por seu desempenho no Programa Filial Destaque, demonstrando comprometimento com os processos, controle de perdas e melhoria contínua.`,
  });
  const [gerando, setGerando] = useState(false);
  const set = (k: keyof typeof v) => (val: string) => setV(o => {
    // Ao trocar o nome da unidade, a mensagem acompanha.
    if (k === 'unidade' && o.mensagem.includes(`a ${o.unidade} foi reconhecida`)) return { ...o, unidade: val, mensagem: o.mensagem.split(`a ${o.unidade} foi reconhecida`).join(`a ${val} foi reconhecida`) };
    return { ...o, [k]: val };
  });
  const emitir = async () => {
    setGerando(true);
    try { await imprimirHtml(certificadoHtml(v), `Certificado ${v.unidade}`, true); onClose(); }
    catch (e) { notify('Não foi possível gerar o certificado', e instanceof Error ? e.message : ''); } finally { setGerando(false); }
  };
  return (
    <Sheet title="Emitir certificado" onClose={onClose} footer={<Button title={gerando ? 'Gerando…' : 'Emitir e imprimir'} icon={CertificateIcon} disabled={gerando} onPress={() => void emitir()} />}>
      <Text style={t.caption}>O certificado vem preenchido com o nível e a pontuação do ranking e sai em PDF (A4 paisagem), pronto para impressão.</Text>
      <Field label="Filial" value={v.unidade} onChangeText={set('unidade')} />
      <Field label="Período" value={v.periodo} onChangeText={set('periodo')} />
      <Field label="Reconhecimento" value={v.premio} onChangeText={set('premio')} />
      <Field label="Pontuação" value={v.pontuacao} onChangeText={set('pontuacao')} />
      <Field label="Mensagem do certificado" multiline value={v.mensagem} onChangeText={set('mensagem')} />
      <Text style={t.caption}>Prévia: <Text style={{ fontWeight: '800' }}>{v.unidade}</Text> • {v.pontuacao.split(' · ')[0]} • {v.premio.toUpperCase()}</Text>
    </Sheet>
  );
}
