import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import type { Filial } from '../../lib/data';
import { supabase } from '../../lib/supabase';
import { esc, imprimirHtml, rotuloFilial } from '../../lib/util';
import { PrinterIcon, SparkleIcon } from '../../ui/icons';
import { Button, Card, notify, StatusPill } from '../../ui/kit';
import { atendimentosDe, indicadores } from './calc';
import { DEMANDAS, SETORES, TURNOS } from './model';
import type { TmData } from './store';
import { useLook } from './ui';

// Análise com IA (Gemini) do dimensionamento da filial. O app monta um resumo dos tempos (sem nomes de pessoas),
// a Edge Function "analise-ia" pergunta ao Gemini e guarda o resultado com quem pediu (tm_analises_ia).

/** Dimensionamento calculado na tela (mesmos números que o gestor vê). */
export type ResumoDimensionamento = {
  dias: number; quadro_atual: number; total_funcionarios_planilha: number; usa_media_observada: boolean;
  blocos: { bloco: string; fator_cobertura: number; horas_por_funcionario_mes: number; horas_mes: number; funcionarios: number }[];
  maiores_cargas: { atividade: string; minutos: number; frequencia: string; quantidade: number; horas_mes: number }[];
};

type Analise = {
  resumo?: string; funcionarios_necessarios?: number; faixa?: { minimo?: number; maximo?: number };
  comparacao?: { quadro_atual?: number | null; planilha?: number | null; diferenca_para_quadro?: number | null; comentario?: string };
  por_turno_setor?: { turno?: string; setor?: string; funcionarios?: number; observacao?: string }[];
  justificativa?: string[]; riscos?: string[]; recomendacoes?: string[]; dados_faltantes?: string[]; confianca?: string;
};
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
  const grupo = (nome: string, filtro: (c: (typeof cs)[number]) => boolean) => {
    const sel = cs.filter(filtro);
    const ats = atendimentosDe(d, sel), completos = ats.filter(a => a.tipo === 'completo');
    return { [nome]: '', coletas: sel.length, atendimentos: completos.length, media_atendimento_min: completos.length ? r1(completos.reduce((s, a) => s + a.duracao_s, 0) / completos.length / 60) : null, volume_litros: r1(ats.reduce((s, a) => s + (a.volume ?? 0), 0)) };
  };
  const classeDe = new Map(d.atividades.map(a => [a.id, a.classe]));
  return {
    perfil: 'posto_combustivel',
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
    por_setor: SETORES.map(se => ({ ...grupo('setor', c => c.setor === se), setor: se })).filter(x => x.coletas),
    por_veiculo: ind.porVeiculo.map(([veiculo, seg, n]) => ({ veiculo, atendimentos: n, media_min: r1(seg / 60) })),
    tempo_por_classe_h: Object.fromEntries(ind.porClasse.map(([c, seg]) => [c, r1(seg / 3600)])),
    atividades: ind.atividades.slice(0, 30).map(a => ({
      atividade: a.nome, classe: classeDe.get(a.id) ?? '', ciclos: a.ciclos, media_min: r1(a.mediaSeg / 60),
      tempo_padrao_min: a.padraoSeg === null ? null : r1(a.padraoSeg / 60), referencia_min: a.ref, situacao: a.situacao,
    })),
    parametros: { ritmo: d.parametros.ritmo, tolerancia_pct: d.parametros.tol },
    dimensionamento: dim,
  };
}

function relatorioHtml(filial: Filial, reg: Registro) {
  const a: Analise = reg.resultado ?? {};
  const li = (xs: unknown) => lista(xs).map(x => `<li>${esc(x)}</li>`).join('') || '<li>—</li>';
  const linhas = (a.por_turno_setor ?? []).map(x => `<tr><td>${esc(x.turno)}</td><td>${esc(x.setor)}</td><td class="n">${nf(x.funcionarios)}</td><td>${esc(x.observacao)}</td></tr>`).join('');
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Análise com IA · ${esc(filial.nome)}</title><style>
@page{size:A4;margin:12mm}body{font:11px Arial,sans-serif;color:#1b2230;margin:0}h1{font-size:17px;margin:0 0 2px}.sub{color:#5b6475;margin-bottom:8px}
h2{font-size:12.5px;margin:12px 0 4px}.kpis{display:flex;gap:8px}.kpis div{flex:1;background:#f2f4f7;border-radius:6px;padding:7px}.kpis b{display:block;font-size:17px}
table{width:100%;border-collapse:collapse}th{background:#102a46;color:#fff;text-align:left;padding:3px 5px}td{border-bottom:1px solid #e3e6ec;padding:3px 5px}.n{text-align:right}
ul{margin:0;padding-left:16px}.aviso{margin-top:10px;color:#5b6475;font-size:10px}</style></head><body>
<h1>Análise de dimensionamento com IA · ${esc(rotuloFilial(filial))}</h1>
<div class="sub">${new Date(reg.updated_at).toLocaleString('pt-BR')} · pedida por ${esc(reg.usuario_nome || '—')} · modelo ${esc(reg.modelo)} · confiança ${esc(a.confianca ?? '—')}</div>
<div class="kpis"><div><b>${nf(a.funcionarios_necessarios)}</b>Funcionários necessários (IA)</div><div><b>${nf(a.faixa?.minimo)} a ${nf(a.faixa?.maximo)}</b>Faixa</div><div><b>${nf(a.comparacao?.planilha)}</b>Cálculo da planilha</div><div><b>${nf(a.comparacao?.quadro_atual)}</b>Quadro atual</div></div>
<h2>Resumo</h2><p>${esc(a.resumo ?? '')}</p>${a.comparacao?.comentario ? `<p>${esc(a.comparacao.comentario)}</p>` : ''}
${linhas ? `<h2>Por turno e setor</h2><table><tr><th>Turno</th><th>Setor</th><th class="n">Funcionários</th><th>Observação</th></tr>${linhas}</table>` : ''}
<h2>Justificativa</h2><ul>${li(a.justificativa)}</ul><h2>Riscos</h2><ul>${li(a.riscos)}</ul><h2>Recomendações</h2><ul>${li(a.recomendacoes)}</ul><h2>Dados que faltam</h2><ul>${li(a.dados_faltantes)}</ul>
<div class="aviso">Análise gerada por inteligência artificial (Google Gemini) a partir dos tempos cronometrados no EasyAudit. Confira antes de decidir.</div></body></html>`;
}

export function AnaliseIA({ data, filial, dim }: { data: TmData; filial: Filial; dim: ResumoDimensionamento }) {
  const { s, t, colors } = useLook();
  const [ultima, setUltima] = useState<Registro | null>(null);
  /** Pedido em andamento ou que falhou por último (mostra a situação e o motivo). */
  const [pedido, setPedido] = useState<Registro | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [analisando, setAnalisando] = useState(false);
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
    const { data: r, error } = await supabase.functions.invoke('analise-ia', { body: { acao: 'tempos', filial_id: filial.id, perfil: 'posto_combustivel', dados: montarDados(data, filial, dim) } });
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
        <Button title="Imprimir / PDF" icon={PrinterIcon} variant="secondary" size="sm" style={s.alignStart} onPress={() => { if (ultima) void imprimirHtml(relatorioHtml(filial, ultima), `Análise IA ${filial.nome}`); }} />
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
