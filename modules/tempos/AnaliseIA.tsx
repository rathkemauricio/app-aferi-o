import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import type { Filial } from '../../lib/data';
import { supabase } from '../../lib/supabase';
import { imprimirHtml } from '../../lib/util';
import { PrinterIcon, SparkleIcon } from '../../ui/icons';
import { Button, Card, notify, StatusPill } from '../../ui/kit';
import { atendimentosDe, indicadores, ociosidade, recorte } from './calc';
import { type AnaliseParaRelatorio, type OpcoesRelatorio, relatorioTemposHtml } from './relatorio';
import { OpcoesImpressao } from './OpcoesImpressao';
import { useIdentidade } from '../../lib/identidade';
import { useUsuarioLogado } from '../../lib/auth';
import { DEMANDAS, fmtMin, num, TIPOS_OPERACAO, TURNOS } from './model';
import { setoresDoTipo, tipoDe, type TmData } from './store';
import { useLook } from './ui';

// Análise com IA (Gemini) do dimensionamento da filial. O app monta um resumo dos tempos (sem nomes de pessoas),
// a Edge Function "analise-ia" pergunta ao Gemini e guarda o resultado com quem pediu (tm_analises_ia).

/** Dimensionamento calculado na tela (mesmos números que o gestor vê). */
export type ResumoDimensionamento = {
  dias: number; quadro_atual: number; total_funcionarios_planilha: number; usa_media_observada: boolean;
  blocos: { bloco: string; fator_cobertura: number; horas_por_funcionario_mes: number; horas_mes: number; funcionarios: number }[];
  maiores_cargas: { atividade: string; minutos: number; frequencia: string; quantidade: number; horas_mes: number }[];
};

type Analise = NonNullable<AnaliseParaRelatorio['resultado']>;
type Registro = { id: string; modelo: string | null; resultado: Analise | null; usuario_nome: string; updated_at: string; status?: 'processando' | 'pronta' | 'erro'; erro?: string | null };
const CAMPOS = 'id,modelo,resultado,usuario_nome,updated_at,status,erro';

const r1 = (v: number) => Math.round(v * 10) / 10;
const nf = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v.toLocaleString('pt-BR', { maximumFractionDigits: 1 }) : '—');
const lista = (v: unknown): string[] => (Array.isArray(v) ? v.map(String).filter(Boolean) : []);

/** Resumo enviado à IA: agregados da cronometragem e o dimensionamento (nenhum nome de funcionário). */
function montarDados(d: TmData, filial: Filial, dim: ResumoDimensionamento) {
  const cs = d.coletas.filter(c => c.filial_id === filial.id);
  const datas = [...new Set(cs.map(c => c.data))].sort();
  const ind = indicadores(d, { filialId: filial.id, setor: '', demanda: '' });
  const grupo = (nome: string, filtro: (c: (typeof cs)[number]) => boolean, recorteSetor?: ReturnType<typeof recorte>) => {
    // Por setor, as coletas de todos os setores entram só com as etapas daquele setor.
    const sel = recorteSetor ? recorteSetor.cs : cs.filter(filtro);
    const ats = recorteSetor ? recorteSetor.ats : atendimentosDe(d, sel), completos = ats.filter(a => a.tipo === 'completo');
    return { [nome]: '', coletas: sel.length, atendimentos: completos.length, media_atendimento_min: completos.length ? r1(completos.reduce((s, a) => s + a.duracao_s, 0) / completos.length / 60) : null, volume_litros: r1(ats.reduce((s, a) => s + (a.volume ?? 0), 0)) };
  };
  const classeDe = new Map(d.atividades.map(a => [a.id, a.classe]));
  return {
    perfil: TIPOS_OPERACAO[tipoDe(d, filial.id)].perfilIa, tipo_de_operacao: TIPOS_OPERACAO[tipoDe(d, filial.id)].nome,
    unidade: { codigo: filial.codigo, nome: filial.nome, cidade: filial.cidade, uf: filial.uf, bandeira: filial.bandeira },
    periodo: { de: datas[0] ?? null, ate: datas[datas.length - 1] ?? null, dias_com_coleta: datas.length },
    totais: {
      coletas: ind.coletas, atendimentos_completos: ind.atendimentos, etapas_isoladas: ind.isoladas, etapas: ind.etapas,
      media_atendimento_min: r1(ind.mediaAtendimentoSeg / 60), ocupacao_pct: r1(ind.ocupacao),
      espera_h: r1(ind.esperaSeg / 3600), retrabalho_h: r1(ind.retrabalhoSeg / 3600), interrupcoes_h: r1(ind.interrupcoesSeg / 3600),
      deslocamentos: ind.deslocamentos, volume_litros: r1(ind.volume),
    },
    por_turno: TURNOS.map(tu => ({ ...grupo('turno', c => c.turno === tu), turno: tu })).filter(x => x.coletas),
    por_demanda: DEMANDAS.map(de => ({ ...grupo('demanda', c => c.demanda === de), demanda: de })).filter(x => x.coletas),
    por_setor: setoresDoTipo(d, tipoDe(d, filial.id)).map(se => ({ ...grupo('setor', () => false, recorte(d, { filialId: filial.id, setor: se, demanda: '' })), setor: se })).filter(x => x.coletas),
    por_veiculo: ind.porVeiculo.map(([veiculo, seg, n]) => ({ veiculo, atendimentos: n, media_min: r1(seg / 60) })),
    tempo_por_classe_h: Object.fromEntries(ind.porClasse.map(([c, seg]) => [c, r1(seg / 3600)])),
    atividades: ind.atividades.slice(0, 30).map(a => ({
      atividade: a.nome, classe: classeDe.get(a.id) ?? '', ciclos: a.ciclos, media_min: r1(a.mediaSeg / 60),
      ...(d.atividades.find(x => x.id === a.id)?.qualquerHora ? { a_qualquer_hora_do_dia: true } : {}),
      tempo_padrao_min: a.padraoSeg === null ? null : r1(a.padraoSeg / 60), referencia_min: a.ref, situacao: a.situacao,
    })),
    // Ociosidade calculada pelo sistema (não pela IA): espera + intervalos entre atendimentos no tempo observado.
    ociosidade: (() => {
      const o = ociosidade(d, { filialId: filial.id, setor: '', demanda: '' });
      const g = (x: { nome?: string; pct: number; minPorHora: number; observadoSeg: number; ativoSeg: number; ociosoSeg: number; observacoes: number }) => ({
        ...(x.nome ? { grupo: x.nome } : {}), percentual: r1(x.pct), minutos_ociosos_por_hora: r1(x.minPorHora), horas_observadas: r1(x.observadoSeg / 3600), horas_trabalhando: r1(x.ativoSeg / 3600), horas_ociosas: r1(x.ociosoSeg / 3600), funcionarios_observados: x.observacoes,
      });
      return { como_calcula: 'ocioso = etapas de Espera + intervalos de até 20 min entre registros do mesmo funcionário na coleta', total: g(o.total), por_turno: o.porTurno.map(g), por_demanda: o.porDemanda.map(g), por_setor: o.porSetor.map(g) };
    })(),
    parametros: { ritmo: d.parametros.ritmo, tolerancia_pct: d.parametros.tol, meta_ocupacao_pct: '75 a 85' },
    dimensionamento: dim,
  };
}

/** Última análise pronta da filial e o dimensionamento enviado com ela (para o relatório completo em PDF). */
export async function ultimaAnaliseDaFilial(filialId: string) {
  if (!supabase) return { ia: null, dim: null };
  const { data: rows } = await supabase.from('tm_analises_ia').select('modelo,resultado,usuario_nome,updated_at,status,dados').eq('filial_id', filialId).is('deleted_at', null).order('updated_at', { ascending: false }).limit(10);
  const x = (rows ?? []).find(r => (r.status ?? 'pronta') === 'pronta' && r.resultado) as (AnaliseParaRelatorio & { dados?: { dimensionamento?: ResumoDimensionamento } }) | undefined;
  return { ia: x ?? null, dim: x?.dados?.dimensionamento ?? null };
}

export function AnaliseIA({ data, filial, dim }: { data: TmData; filial: Filial; dim: ResumoDimensionamento }) {
  const { s, t, colors } = useLook();
  const marca = useIdentidade();
  const usuario = useUsuarioLogado();
  const oc = ociosidade(data, { filialId: filial.id, setor: '', demanda: '' });
  const ind = indicadores(data, { filialId: filial.id, setor: '', demanda: '' });
  const [ultima, setUltima] = useState<Registro | null>(null);
  /** Pedido em andamento ou que falhou por último (mostra a situação e o motivo). */
  const [pedido, setPedido] = useState<Registro | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [analisando, setAnalisando] = useState(false);
  const [pdf, setPdf] = useState(false);
  const vivo = useRef(true);
  useEffect(() => () => { vivo.current = false; }, []);

  const carregar = useCallback(async () => {
    if (!supabase) return;
    setCarregando(true);
    const { data: rows } = await supabase.from('tm_analises_ia').select(CAMPOS).eq('filial_id', filial.id).is('deleted_at', null).order('updated_at', { ascending: false }).limit(5);
    const lista = (rows ?? []) as Registro[];
    if (!vivo.current) return;
    setUltima(lista.find(r => (r.status ?? 'pronta') === 'pronta' && r.resultado) ?? null);
    const recente = lista[0];
    setPedido(recente && recente.status && recente.status !== 'pronta' ? recente : null);
    setCarregando(false);
  }, [filial.id]);
  useEffect(() => { void carregar(); }, [carregar]);

  /** Acompanha a análise no servidor (roda em segundo plano) até ficar pronta ou falhar (máx. 4 min). */
  const acompanhar = useCallback(async (id: string) => {
    if (!supabase) return;
    setAnalisando(true);
    const fim = Date.now() + 4 * 60_000;
    while (vivo.current && Date.now() < fim) {
      await new Promise(r => setTimeout(r, 4000));
      const { data: row } = await supabase.from('tm_analises_ia').select(CAMPOS).eq('id', id).maybeSingle();
      const reg = row as Registro | null;
      if (!reg || reg.status === 'processando') continue;
      if (!vivo.current) return;
      setAnalisando(false);
      if (reg.status === 'erro') { setPedido(reg); notify('Análise não concluída', reg.erro || 'O servidor não informou o motivo.'); return; }
      setPedido(null); setUltima(reg); return;
    }
    if (vivo.current) { setAnalisando(false); notify('A análise está demorando', 'Ela continua no servidor. Volte a esta tela em alguns minutos para ver o resultado.'); }
  }, []);
  // Abriu a tela com uma análise ainda rodando: continua acompanhando.
  useEffect(() => { if (pedido?.status === 'processando' && !analisando) void acompanhar(pedido.id); }, [pedido?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const coletas = data.coletas.filter(c => c.filial_id === filial.id).length;
  const analisar = async () => {
    if (!supabase) return;
    setAnalisando(true); setPedido(null);
    const { data: r, error } = await supabase.functions.invoke('analise-ia', { body: { acao: 'tempos', filial_id: filial.id, perfil: TIPOS_OPERACAO[tipoDe(data, filial.id)].perfilIa, dados: montarDados(data, filial, dim) } });
    if (error) {
      setAnalisando(false);
      let msg = 'Não foi possível falar com o servidor. Verifique a conexão.';
      try { const res = (error as { context?: Response }).context; const c = res ? await res.json() : null; if (c?.erro) msg = String(c.erro); } catch { /* sem JSON */ }
      notify('Análise não concluída', msg); return;
    }
    const x = r as { id: string; status?: string; modelo?: string; resultado?: Analise };
    // Servidor antigo (resposta direta) ou novo (em segundo plano).
    if (x.resultado) { setAnalisando(false); setUltima({ id: x.id, modelo: x.modelo ?? '', resultado: x.resultado, usuario_nome: '', updated_at: new Date().toISOString() }); void carregar(); return; }
    void acompanhar(x.id);
  };

  const a = ultima?.resultado;
  const bloco = (titulo: string, itens: unknown) => {
    const xs = lista(itens);
    return xs.length ? <View style={{ gap: 3 }}><Text style={t.bodyStrong}>{titulo}</Text>{xs.map((x, i) => <Text key={i} style={t.body}>• {x}</Text>)}</View> : null;
  };
  return (
    <Card>
      <View style={[s.row, { gap: 8 }]}>
        <SparkleIcon size={20} color={colors.accentText} weight="fill" />
        <Text style={[t.section, { flex: 1 }]}>Análise com IA (Gemini)</Text>
        {a?.confianca ? <StatusPill label={`Confiança ${a.confianca}`} tone={a.confianca === 'alta' ? 'success' : a.confianca === 'media' ? 'warning' : 'danger'} /> : null}
      </View>
      <Text style={t.caption}>A IA analisa os tempos cronometrados desta filial ({coletas} coleta{coletas === 1 ? '' : 's'}) e o dimensionamento abaixo e diz quantos funcionários são realmente necessários. Nenhum nome de funcionário é enviado.</Text>
      {/* As 3 respostas: quanto leva cada atividade, quanto fica ocioso e quantos funcionários são necessários. */}
      <View style={[s.row, { gap: 8, flexWrap: 'wrap', alignItems: 'stretch' }]}>
        <View style={{ flexGrow: 1, flexBasis: 200, backgroundColor: colors.campo, borderRadius: 10, padding: 10, gap: 2 }}>
          <Text style={t.caption}>Atendimento completo (média)</Text>
          <Text style={[t.section, { fontSize: 20 }]}>{ind.mediaAtendimentoSeg ? `${fmtMin(ind.mediaAtendimentoSeg)} min` : '—'}</Text>
          {[...ind.atividades].sort((x, y) => y.totalSeg - x.totalSeg).slice(0, 3).map(x => <Text key={x.id} style={t.caption} numberOfLines={1}>{x.nome}: {fmtMin(x.mediaSeg)} min{x.padraoSeg !== null ? ` (padrão ${fmtMin(x.padraoSeg)})` : ''}</Text>)}
        </View>
        <View style={{ flexGrow: 1, flexBasis: 200, backgroundColor: colors.campo, borderRadius: 10, padding: 10, gap: 2 }}>
          <Text style={t.caption}>Tempo ocioso</Text>
          <Text style={[t.section, { fontSize: 20 }]}>{oc.total.observadoSeg ? `${num(oc.total.pct)}%` : '—'}</Text>
          <Text style={t.caption}>{oc.total.observadoSeg ? `${num(oc.total.minPorHora)} min parados a cada hora` : 'Sem tempo observado'}</Text>
          {oc.porTurno.length > 1 ? <Text style={t.caption} numberOfLines={2}>{oc.porTurno.map(x => `${x.nome} ${num(x.pct)}%`).join(' · ')}</Text> : null}
        </View>
        <View style={{ flexGrow: 1, flexBasis: 200, backgroundColor: colors.campo, borderRadius: 10, padding: 10, gap: 2 }}>
          <Text style={t.caption}>Funcionários necessários</Text>
          <Text style={[t.section, { fontSize: 20 }]}>{a?.funcionarios_necessarios !== undefined ? nf(a.funcionarios_necessarios) : nf(dim.total_funcionarios_planilha)}</Text>
          <Text style={t.caption}>{a?.funcionarios_necessarios !== undefined ? `pela IA · planilha ${nf(dim.total_funcionarios_planilha)} · quadro ${nf(dim.quadro_atual)}` : `pela planilha · quadro atual ${nf(dim.quadro_atual)}`}</Text>
        </View>
      </View>
      {carregando && !ultima ? <ActivityIndicator color={colors.textMuted} /> : null}
      {a ? <>
        <View style={[s.row, { gap: 8, flexWrap: 'wrap' }]}>
          {([['Necessários (IA)', nf(a.funcionarios_necessarios)], ['Faixa', `${nf(a.faixa?.minimo)} a ${nf(a.faixa?.maximo)}`], ['Planilha', nf(a.comparacao?.planilha ?? dim.total_funcionarios_planilha)], ['Quadro atual', nf(a.comparacao?.quadro_atual ?? dim.quadro_atual)]] as const).map(([r, v]) => (
            <View key={r} style={{ flexGrow: 1, flexBasis: 120, backgroundColor: colors.campo, borderRadius: 10, padding: 10 }}>
              <Text style={t.caption}>{r}</Text><Text style={[t.section, { fontSize: 20 }]}>{v}</Text>
            </View>
          ))}
        </View>
        {a.resumo ? <Text style={t.body}>{a.resumo}</Text> : null}
        {a.comparacao?.comentario ? <Text style={t.body}>{a.comparacao.comentario}</Text> : null}
        {a.ociosidade?.leitura ? <Text style={t.body}><Text style={{ fontWeight: '800' }}>Ociosidade: </Text>{a.ociosidade.leitura}</Text> : null}
        {(a.tempo_por_atividade ?? []).length ? (
          <View style={{ gap: 4 }}>
            <Text style={t.bodyStrong}>Tempo por atividade</Text>
            {(a.tempo_por_atividade ?? []).slice(0, 10).map((x, i) => <Text key={i} style={t.body}>• {x.atividade}: <Text style={{ fontWeight: '800' }}>{nf(x.media_min)} min</Text>{typeof x.padrao_min === 'number' ? ` (padrão ${nf(x.padrao_min)})` : ''}{x.leitura ? ` — ${x.leitura}` : ''}</Text>)}
          </View>
        ) : null}
        {(a.por_turno_setor ?? []).length ? (
          <View style={{ gap: 4 }}>
            <Text style={t.bodyStrong}>Por turno e setor</Text>
            {(a.por_turno_setor ?? []).map((x, i) => <Text key={i} style={t.body}>• {[x.turno, x.setor].filter(Boolean).join(' · ')}: <Text style={{ fontWeight: '800' }}>{nf(x.funcionarios)}</Text>{x.observacao ? ` — ${x.observacao}` : ''}</Text>)}
          </View>
        ) : null}
        {bloco('Justificativa', a.justificativa)}
        {bloco('Riscos', a.riscos)}
        {bloco('Recomendações', a.recomendacoes)}
        {bloco('Dados que faltam', a.dados_faltantes)}
        <Text style={t.caption}>{ultima ? `${new Date(ultima.updated_at).toLocaleString('pt-BR')}${ultima.usuario_nome ? ` · pedida por ${ultima.usuario_nome}` : ''} · ${ultima.modelo ?? ''}` : ''} · Gerada por IA: confira antes de decidir.</Text>
        <Button title="Relatório completo (PDF)" icon={PrinterIcon} variant="secondary" size="sm" style={s.alignStart} onPress={() => setPdf(true)} />
        {pdf && ultima ? <OpcoesImpressao onClose={() => setPdf(false)} onGerar={(o: OpcoesRelatorio) => void imprimirHtml(relatorioTemposHtml(data, { filialId: filial.id, setor: '', demanda: '' }, marca, usuario, { ia: ultima, dim, opcoes: o }), `Tempos e Movimentos ${filial.nome}`).catch(e => notify('PDF não gerado', e instanceof Error ? e.message : 'Tente de novo.'))} /> : null}
      </> : null}
      {pedido?.status === 'erro' && !analisando ? (
        <View style={{ gap: 4, padding: 10, borderRadius: 10, borderWidth: 1, borderColor: colors.danger }}>
          <Text style={[t.bodyStrong, { color: colors.danger }]}>A última análise não foi concluída</Text>
          <Text style={t.caption}>{pedido.erro || 'O servidor não informou o motivo.'}</Text>
          <Text style={t.caption}>{new Date(pedido.updated_at).toLocaleString('pt-BR')}</Text>
        </View>
      ) : null}
      {analisando ? <Text style={t.caption}>A IA está analisando no servidor. Pode levar até 2 minutos; você pode sair desta tela e voltar depois.</Text> : null}
      <Button title={analisando ? 'Analisando…' : a ? 'Analisar de novo' : 'Analisar com IA'} icon={SparkleIcon} disabled={analisando || !coletas} onPress={() => void analisar()} />
      {!coletas ? <Text style={t.caption}>Faça coletas de tempos nesta filial para a IA ter dados.</Text> : null}
    </Card>
  );
}
