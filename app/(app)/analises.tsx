import { useRouter } from 'expo-router';
import { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { type LayoutChangeEvent, Platform, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle, Line, Path, Rect } from 'react-native-svg';
import { useAuth } from '../../lib/auth';
import { GA_ID } from '../../lib/analytics';
import { supabase } from '../../lib/supabase';
import { ChartLineUpIcon, GlobeIcon, LockSimpleIcon, ResetIcon, TrendDownIcon, TrendUpIcon } from '../../ui/icons';
import { Button, Card, ChoiceChips, EmptyState, SectionHeader, Skeleton } from '../../ui/kit';
import { createTypography, pageMaxWidth, radius, space, ThemeContext } from '../../ui/theme';
import { BotaoVoltar } from '../../ui/voltar';

/**
 * Análises do site (Google Analytics 4), dentro do EasyAudit: só o dono da plataforma. Os números vêm da função
 * `analytics` (Data API do Google); o site mede com o código G-… (lib/analytics.ts) depois do aceite de cookies.
 */
type Totais = { visitantes: number; novos: number; sessoes: number; visualizacoes: number; duracaoMediaSeg: number; engajamento: number };
type Resumo = {
  configurado: true; dias: number; totais: Totais; anterior: Totais; cadastros: number; agora: number | null;
  porDia: { data: string; visitantes: number; sessoes: number; visualizacoes: number }[];
  paginas: { pagina: string; visualizacoes: number; visitantes: number }[];
  canais: { canal: string; sessoes: number }[];
  aparelhos: { aparelho: string; visitantes: number }[];
  cidades: { cidade: string; visitantes: number }[];
};
type Resposta = Resumo | { configurado: false; faltam: string[] };

const NOME_PAGINA: Record<string, string> = { '/inicio': 'Início', '/como-funciona': 'Como funciona', '/comecar': 'Cadastro da rede', '/login': 'Entrar', '/': 'Raiz' };
const NOME_CANAL: Record<string, string> = {
  Direct: 'Direto (digitou o endereço)', 'Organic Search': 'Busca no Google', 'Organic Social': 'Redes sociais', Referral: 'Outros sites',
  'Paid Search': 'Anúncio em busca', Email: 'E-mail', Unassigned: 'Não identificado', 'Organic Video': 'Vídeo', 'Paid Social': 'Anúncio em rede social',
};
const NOME_APARELHO: Record<string, string> = { desktop: 'Computador', mobile: 'Celular', tablet: 'Tablet' };
const n0 = (v: number) => Math.round(v).toLocaleString('pt-BR');
const dur = (s: number) => { const m = Math.floor(s / 60), r = Math.round(s % 60); return m ? `${m} min ${String(r).padStart(2, '0')} s` : `${r} s`; };
const dataCurta = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

export default function AnalisesScreen() {
  const router = useRouter();
  const { dono } = useAuth();
  const { colors } = useContext(ThemeContext);
  const t = useMemo(() => createTypography(colors), [colors]);
  const [dias, setDias] = useState(30);
  const [dados, setDados] = useState<Resposta | null>(null);
  const [erro, setErro] = useState('');
  const [atualizando, setAtualizando] = useState(false);

  const carregar = useCallback(async () => {
    if (!supabase) return;
    setErro('');
    const { data, error } = await supabase.functions.invoke('analytics', { body: { acao: 'resumo', dias } });
    if (error) {
      let msg = 'Não foi possível falar com o servidor. Verifique a conexão.';
      try { const r = (error as { context?: Response }).context; const c = r ? await r.json() : null; if (c?.erro) msg = String(c.erro); } catch { /* sem JSON */ }
      setErro(msg); return;
    }
    setDados(data as Resposta);
  }, [dias]);
  useEffect(() => { if (dono) { setDados(null); void carregar(); } }, [dono, carregar]);
  const voltar = () => (router.canGoBack() ? router.back() : router.replace('/'));

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.lg, paddingVertical: space.md, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border }}>
        <BotaoVoltar label="Voltar" onPress={voltar} />
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 15.5, fontWeight: '800', color: colors.text }}>Análises do site</Text>
          <Text style={t.caption}>Google Analytics · visitas ao site do EasyAudit</Text>
        </View>
      </View>
      <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.md, width: '100%', maxWidth: pageMaxWidth(920), alignSelf: 'center', paddingBottom: 56 }}
        refreshControl={<RefreshControl refreshing={atualizando} onRefresh={() => { setAtualizando(true); void carregar().finally(() => setAtualizando(false)); }} />}>
        {!dono ? <EmptyState icon={LockSimpleIcon} title="Acesso restrito" text="Somente o dono do EasyAudit vê as análises do site." />
          : erro ? <EmptyState icon={GlobeIcon} title="Não foi possível carregar" text={erro} action={{ label: 'Tentar de novo', onPress: () => void carregar() }} />
          : !dados ? <><Skeleton height={90} /><Skeleton height={220} /><Skeleton height={160} /></>
          : !dados.configurado ? <Configurar faltam={dados.faltam} />
          : <Painel r={dados} dias={dias} setDias={setDias} onAtualizar={() => { setDados(null); void carregar(); }} />}
      </ScrollView>
    </SafeAreaView>
  );
}

/* ---------- Ainda sem ligação com o Google: o passo a passo ---------- */
export function Configurar({ faltam }: { faltam: string[] }) {
  const { colors } = useContext(ThemeContext);
  const t = useMemo(() => createTypography(colors), [colors]);
  const passo = (n: number, feito: boolean, titulo: string, texto: string) => (
    <View style={{ flexDirection: 'row', gap: space.sm, paddingVertical: 8, borderTopWidth: n > 1 ? 1 : 0, borderTopColor: colors.border }}>
      <View style={{ width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: feito ? colors.successSoft : colors.neutralSoft }}>
        <Text style={{ fontWeight: '800', color: feito ? colors.success : colors.textMuted }}>{feito ? '✓' : n}</Text>
      </View>
      <View style={{ flex: 1, gap: 2 }}><Text style={t.bodyStrong}>{titulo}</Text><Text style={t.caption}>{texto}</Text></View>
    </View>
  );
  const semPropriedade = faltam.includes('GA_PROPERTY_ID'), semChave = faltam.includes('GA_SA_JSON');
  return <>
    <Card>
      <Text style={t.section}>Ligar o Google Analytics</Text>
      <Text style={t.caption}>O painel fica pronto quando estes passos estiverem feitos. Os dados do site não são de clientes; a área logada não é medida.</Text>
      {passo(1, !!GA_ID, 'Criar a propriedade GA4 e me passar o código de medição', GA_ID ? `Medindo o site com ${GA_ID} (o visitante vê o aviso de cookies e escolhe).` : 'analytics.google.com → Administrador → Criar propriedade → Fluxo de dados da Web com o endereço do site. O código começa com G- (é público; eu coloco no site).')}
      {passo(2, !semChave, 'Criar a conta de serviço no Google Cloud', 'console.cloud.google.com → ative a "Google Analytics Data API" → IAM → Contas de serviço → criar → Chaves → Adicionar chave → JSON (baixa um arquivo).')}
      {passo(3, false, 'Dar acesso de leitura à conta de serviço', 'No Google Analytics: Administrador → Gerenciamento de acesso da propriedade → adicionar o e-mail da conta de serviço (…@….iam.gserviceaccount.com) como Leitor.')}
      {passo(4, !semPropriedade && !semChave, 'Gravar a ligação no servidor (você mesmo)', 'No PowerShell, na pasta do projeto, troque o número e o caminho do arquivo:')}
      <View style={{ backgroundColor: colors.campo, borderRadius: radius.control, padding: space.sm }}>
        <Text selectable style={{ fontFamily: Platform.OS === 'web' ? 'ui-monospace, Consolas, monospace' : 'monospace', fontSize: 12, color: colors.text }}>
          {'$b64 = [Convert]::ToBase64String([IO.File]::ReadAllBytes("C:\\caminho\\chave.json"))\nnpx supabase secrets set GA_PROPERTY_ID=123456789 GA_SA_JSON=$b64 --yes'}
        </Text>
      </View>
      <Text style={t.caption}>O número da propriedade fica em Administrador → Detalhes da propriedade (só os dígitos). Depois, guarde o arquivo da chave em lugar seguro ou apague: o servidor já tem a cópia.</Text>
    </Card>
    <Text style={t.caption}>Faltando no servidor: {faltam.join(', ')}.</Text>
  </>;
}

/* ---------- Painel ---------- */
export function Painel({ r, dias, setDias, onAtualizar }: { r: Resumo; dias: number; setDias: (d: number) => void; onAtualizar: () => void }) {
  const { colors } = useContext(ThemeContext);
  const t = useMemo(() => createTypography(colors), [colors]);
  const variacao = (atual: number, antes: number) => (antes > 0 ? ((atual - antes) / antes) * 100 : null);
  const tile = (rotulo: string, valor: string, atual?: number, antes?: number) => {
    const v = atual !== undefined && antes !== undefined ? variacao(atual, antes) : null;
    const sobe = v !== null && v >= 0;
    const Icone = sobe ? TrendUpIcon : TrendDownIcon;
    return (
      <View key={rotulo} style={{ flexGrow: 1, flexBasis: 150, backgroundColor: colors.surface, borderRadius: radius.card ?? 14, borderWidth: 1, borderColor: colors.border, padding: space.md, gap: 4 }}>
        <Text style={t.caption}>{rotulo}</Text>
        <Text style={{ fontSize: 24, fontWeight: '800', color: colors.text, fontVariant: ['tabular-nums'] }}>{valor}</Text>
        {v !== null ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Icone size={14} color={sobe ? colors.success : colors.danger} weight="bold" />
            <Text style={[t.caption, { color: colors.textMuted }]}>{sobe ? '+' : ''}{v.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}% vs. {dias} dias antes</Text>
          </View>
        ) : atual !== undefined ? <Text style={t.caption}>sem período anterior para comparar</Text> : null}
      </View>
    );
  };
  return <>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, flexWrap: 'wrap' }}>
      <View style={{ flex: 1, minWidth: 220 }}>
        <ChoiceChips value={`${dias} dias`} options={['7 dias', '30 dias', '90 dias']} onChange={v => setDias(Number(v.split(' ')[0]))} />
      </View>
      <Button title="Atualizar" icon={ResetIcon} variant="secondary" size="sm" onPress={onAtualizar} />
    </View>

    {r.agora !== null ? (
      <Card style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
        <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: colors.success }} />
        <Text style={t.body}><Text style={{ fontWeight: '800' }}>{n0(r.agora)}</Text> {r.agora === 1 ? 'pessoa no site agora' : 'pessoas no site agora'} (últimos 30 minutos)</Text>
      </Card>
    ) : null}

    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
      {tile('Visitantes', n0(r.totais.visitantes), r.totais.visitantes, r.anterior.visitantes)}
      {tile('Visitantes novos', n0(r.totais.novos), r.totais.novos, r.anterior.novos)}
      {tile('Sessões', n0(r.totais.sessoes), r.totais.sessoes, r.anterior.sessoes)}
      {tile('Páginas vistas', n0(r.totais.visualizacoes), r.totais.visualizacoes, r.anterior.visualizacoes)}
      {tile('Tempo médio da visita', dur(r.totais.duracaoMediaSeg), r.totais.duracaoMediaSeg, r.anterior.duracaoMediaSeg)}
      {tile('Visitas engajadas', `${Math.round(r.totais.engajamento * 100)}%`, r.totais.engajamento, r.anterior.engajamento)}
      {tile('Redes cadastradas pelo site', n0(r.cadastros))}
    </View>

    <Card>
      <Text style={t.section}>Visitantes por dia</Text>
      <GraficoLinha pontos={r.porDia.map(p => ({ rotulo: dataCurta(p.data), valor: p.visitantes, extra: `${n0(p.sessoes)} sessões · ${n0(p.visualizacoes)} páginas` }))} />
    </Card>

    <SectionHeader title="Páginas mais vistas" />
    <Card><Barras itens={r.paginas.map(p => ({ rotulo: NOME_PAGINA[p.pagina] ?? p.pagina, valor: p.visualizacoes, detalhe: `${n0(p.visitantes)} visitantes` }))} vazio="Nenhuma página vista no período." /></Card>
    <SectionHeader title="De onde vêm as visitas (sessões)" />
    <Card><Barras itens={r.canais.map(c => ({ rotulo: NOME_CANAL[c.canal] ?? c.canal, valor: c.sessoes }))} porcentagem vazio="Sem visitas no período." /></Card>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.md }}>
      <View style={{ flexGrow: 1, flexBasis: 280, gap: space.sm }}>
        <SectionHeader title="Aparelhos" />
        <Card><Barras itens={r.aparelhos.map(a => ({ rotulo: NOME_APARELHO[a.aparelho] ?? a.aparelho, valor: a.visitantes }))} porcentagem vazio="Sem dados." /></Card>
      </View>
      <View style={{ flexGrow: 1, flexBasis: 280, gap: space.sm }}>
        <SectionHeader title="Cidades" />
        <Card><Barras itens={r.cidades.map(c => ({ rotulo: c.cidade === '(not set)' ? 'Não identificada' : c.cidade, valor: c.visitantes }))} vazio="Sem dados." /></Card>
      </View>
    </View>
    <Text style={t.caption}>Só entram visitantes que aceitaram os cookies de análise. Os números do Google podem levar algumas horas para fechar o dia.</Text>
  </>;
}

/* ---------- Barras horizontais (uma cor; número ao lado: serve de tabela) ---------- */
function Barras({ itens, porcentagem = false, vazio }: { itens: { rotulo: string; valor: number; detalhe?: string }[]; porcentagem?: boolean; vazio: string }) {
  const { colors } = useContext(ThemeContext);
  const t = useMemo(() => createTypography(colors), [colors]);
  if (!itens.length) return <Text style={t.caption}>{vazio}</Text>;
  const max = Math.max(...itens.map(i => i.valor), 1), total = itens.reduce((s, i) => s + i.valor, 0);
  return (
    <View style={{ gap: 10 }}>
      {itens.map(i => (
        <View key={i.rotulo} style={{ gap: 4 }} accessible accessibilityLabel={`${i.rotulo}: ${n0(i.valor)}${porcentagem && total ? `, ${Math.round((i.valor / total) * 100)}%` : ''}`}>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Text style={[t.body, { flex: 1 }]} numberOfLines={1}>{i.rotulo}</Text>
            <Text style={[t.bodyStrong, { fontVariant: ['tabular-nums'] }]}>{n0(i.valor)}</Text>
            {porcentagem && total ? <Text style={[t.caption, { width: 40, textAlign: 'right', fontVariant: ['tabular-nums'] }]}>{Math.round((i.valor / total) * 100)}%</Text> : null}
          </View>
          <View style={{ height: 8, borderRadius: 4, backgroundColor: colors.neutralSoft, overflow: 'hidden' }}>
            <View style={{ width: `${Math.max(2, (i.valor / max) * 100)}%`, height: 8, borderRadius: 4, backgroundColor: colors.accent }} />
          </View>
          {i.detalhe ? <Text style={t.caption}>{i.detalhe}</Text> : null}
        </View>
      ))}
    </View>
  );
}

/* ---------- Linha por dia (uma série; toque/passe o mouse num dia para ver o valor) ---------- */
function GraficoLinha({ pontos }: { pontos: { rotulo: string; valor: number; extra: string }[] }) {
  const { colors } = useContext(ThemeContext);
  const t = useMemo(() => createTypography(colors), [colors]);
  const [largura, setLargura] = useState(0);
  const [sel, setSel] = useState<number | null>(null);
  const ALTURA = 180, PAD_X = 8, PAD_Y = 14;
  if (!pontos.length) return <Text style={t.caption}>Sem visitas no período.</Text>;
  const max = Math.max(...pontos.map(p => p.valor), 1);
  const passo = pontos.length > 1 ? (largura - PAD_X * 2) / (pontos.length - 1) : 0;
  const x = (i: number) => PAD_X + i * passo;
  const y = (v: number) => PAD_Y + (1 - v / max) * (ALTURA - PAD_Y * 2);
  const linha = pontos.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.valor).toFixed(1)}`).join(' ');
  const area = `${linha} L${x(pontos.length - 1).toFixed(1)},${ALTURA - PAD_Y} L${x(0).toFixed(1)},${ALTURA - PAD_Y} Z`;
  const mostrado = sel ?? pontos.length - 1;
  const p = pontos[mostrado];
  const faixa = pontos.length > 1 ? passo : largura;
  return (
    <View style={{ gap: 6 }}>
      <Text style={t.body}><Text style={{ fontWeight: '800' }}>{p.rotulo}: {n0(p.valor)} visitantes</Text> · {p.extra}</Text>
      <View onLayout={(e: LayoutChangeEvent) => setLargura(e.nativeEvent.layout.width)} style={{ height: ALTURA }}>
        {largura > 0 ? (
          <Svg width={largura} height={ALTURA}>
            {[0, 0.5, 1].map(f => <Line key={f} x1={0} x2={largura} y1={PAD_Y + f * (ALTURA - PAD_Y * 2)} y2={PAD_Y + f * (ALTURA - PAD_Y * 2)} stroke={colors.border} strokeWidth={1} />)}
            <Path d={area} fill={colors.accent} opacity={0.12} />
            <Path d={linha} stroke={colors.accent} strokeWidth={2} fill="none" strokeLinejoin="round" strokeLinecap="round" />
            <Line x1={x(mostrado)} x2={x(mostrado)} y1={PAD_Y} y2={ALTURA - PAD_Y} stroke={colors.textMuted} strokeWidth={1} strokeDasharray="3 3" />
            <Circle cx={x(mostrado)} cy={y(p.valor)} r={5} fill={colors.accent} stroke={colors.surface} strokeWidth={2} />
            {pontos.map((_, i) => (
              <Rect key={i} x={x(i) - faixa / 2} y={0} width={Math.max(faixa, 8)} height={ALTURA} fill="transparent"
                onPress={() => setSel(i)} {...(Platform.OS === 'web' ? { onMouseEnter: () => setSel(i) } as object : {})} />
            ))}
          </Svg>
        ) : null}
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text style={t.caption}>{pontos[0].rotulo}</Text>
        <Text style={t.caption}>máximo {n0(max)} por dia</Text>
        <Text style={t.caption}>{pontos[pontos.length - 1].rotulo}</Text>
      </View>
    </View>
  );
}
