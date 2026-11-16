import AsyncStorage from '@react-native-async-storage/async-storage';
import * as DocumentPicker from 'expo-document-picker';
import { useRouter } from 'expo-router';
import { type ComponentRef, type ReactNode, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle } from 'react-native-svg';
import { useAuth } from '../../lib/auth';
import { tocar } from '../../lib/sons';
import { shareText } from '../../lib/share';
import { isSupabaseConfigured } from '../../lib/supabase';
import { dataBR, esc, imprimirHtml, rotuloFilial } from '../../lib/util';
import { BarcodeIcon, CaretDownIcon, ClockCounterClockwiseIcon, EraserIcon, KeyboardIcon, CaretLeftIcon, CaretRightIcon, CheckIcon, FileCsvIcon, MagnifyingGlassIcon, MinusIcon, PackageIcon, PrinterIcon, StorefrontIcon, UploadSimpleIcon } from '../../ui/icons';
import { confirmAction, EmptyState, Field, notify, Sheet } from '../../ui/kit';
import { pageMaxWidth, space, ThemeContext } from '../../ui/theme';
import {
  categoriasDe, type ClasseContagem, type Consolidado, type Contagem, concluida, detalheContagem, type LinhaDetalhe, porCategoria, escopo, finalizarRodada, fmtQ, type Inventario, itensDaRodada, motivo, type Produto,
  progressoContagem, progressoInventario, proximoCodigo, quantidades, reabrir, relatorio, resultadoCsv, resumoRodada, type Rodada, ROTULO_CLASSE, ROTULO_RODADA,
  rodadaAtual, situacaoNaRodada, type StatusRodada, uid,
} from './model';
import {
  basesCol, carregarErp, coletasDe, contagensCol, enviarResultadoErp, escolherArquivoErp, gravarBarras, indiceLeitura, inventariosCol, registrarLeitura, statusErp, useColeta, useColetas, useProdutos,
} from './store';
import { lerPdfBarras } from './barras';

// Cores do design da Contagem de Estoque (cabeçalho azul-marinho, ação principal âmbar).
const NAVY = '#102a46', AMBER = '#f3a200', AMBER_TXT = '#1b2230';

type Tela =
  | { n: 'lista' } | { n: 'abrir' } | { n: 'bases'; filial?: string } | { n: 'inventario'; id: string } | { n: 'nova'; inv: string }
  | { n: 'contagem'; id: string; aba: 'itens' | 'coleta' | 'detalhe'; rodada?: Rodada } | { n: 'finalizar'; id: string; rodada: Rodada } | { n: 'relatorio'; inv: string; divergentes?: boolean };
const TELA_KEY = 'nevoeiro.coleta.tela.v1';

export default function ColetaModule() {
  const router = useRouter();
  const [pilha, setPilha] = useState<Tela[]>([{ n: 'lista' }]);
  const [pronto, setPronto] = useState(false);
  useEffect(() => { void AsyncStorage.getItem(TELA_KEY).then(v => { if (v) setPilha(JSON.parse(v) as Tela[]); }).catch(() => undefined).finally(() => setPronto(true)); void inventariosCol.sync(); void contagensCol.sync(); void basesCol.sync(); }, []);
  useEffect(() => { if (pronto) void AsyncStorage.setItem(TELA_KEY, JSON.stringify(pilha)).catch(() => undefined); }, [pilha, pronto]);
  const tela = pilha[pilha.length - 1];
  const ir = (t: Tela) => setPilha(p => [...p, t]);
  const trocar = (t: Tela) => setPilha(p => [...p.slice(0, -1), t]);
  const voltar = () => { if (pilha.length > 1) setPilha(p => p.slice(0, -1)); else if (router.canGoBack()) router.back(); else router.replace('/'); };
  const inicio = () => setPilha([{ n: 'lista' }]);
  const nav = { ir, trocar, voltar, inicio };
  const dados = useColeta();
  const { colors } = useContext(ThemeContext);
  if (!pronto || !dados.loaded) return <View style={{ flex: 1, backgroundColor: colors.bg }}><Topo titulo="Contagem de Estoque" onVoltar={voltar} /></View>;
  const inv = (id: string) => dados.inventarios.find(i => i.id === id);
  const cont = (id: string) => dados.contagens.find(c => c.id === id);

  switch (tela.n) {
    case 'abrir': return <AbrirInventario dados={dados} nav={nav} />;
    case 'bases': return <BasesBarras dados={dados} nav={nav} destaque={tela.filial} />;
    case 'inventario': { const i = inv(tela.id); return i ? <InventarioTela inv={i} dados={dados} nav={nav} /> : <Sumiu nav={nav} />; }
    case 'nova': { const i = inv(tela.inv); return i ? <NovaContagem inv={i} dados={dados} nav={nav} /> : <Sumiu nav={nav} />; }
    case 'contagem': { const c = cont(tela.id), i = c && inv(c.inventario_id); return c && i ? <ContagemTela key={c.id} c={c} inv={i} dados={dados} tela={tela} nav={nav} /> : <Sumiu nav={nav} />; }
    case 'finalizar': { const c = cont(tela.id), i = c && inv(c.inventario_id); return c && i ? <FinalizarRodada c={c} inv={i} r={tela.rodada} dados={dados} nav={nav} /> : <Sumiu nav={nav} />; }
    case 'relatorio': { const i = inv(tela.inv); return i ? <Relatorio inv={i} dados={dados} nav={nav} divergentes={!!tela.divergentes} /> : <Sumiu nav={nav} />; }
    default: return <ListaInventarios dados={dados} nav={nav} />;
  }
}

type Dados = ReturnType<typeof useColeta>;
type Nav = { ir: (t: Tela) => void; trocar: (t: Tela) => void; voltar: () => void; inicio: () => void };
const nomeFilial = (d: Dados, id: string) => { const f = d.filiais.find(x => x.id === id); return f ? rotuloFilial(f) : 'Filial removida'; };
const filialCurta = (d: Dados, id: string) => { const f = d.filiais.find(x => x.id === id); return f ? `Filial ${f.codigo}` : 'Filial'; };

/* =====================================================================
   Peças visuais
   ===================================================================== */
function useCores() { return useContext(ThemeContext).colors; }

function Topo({ titulo, sub, onVoltar, direita }: { titulo: string; sub?: string; onVoltar?: () => void; direita?: ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[k.topo, { paddingTop: insets.top + 12 }]}>
      {onVoltar ? <Pressable accessibilityRole="button" accessibilityLabel="Voltar" hitSlop={10} onPress={onVoltar} style={k.voltar}><CaretLeftIcon size={22} color="#fff" weight="bold" /></Pressable> : null}
      <View style={{ flex: 1 }}>
        <Text style={k.topoTit} numberOfLines={1}>{titulo}</Text>
        {sub ? <Text style={k.topoSub} numberOfLines={1}>{sub}</Text> : null}
      </View>
      {direita}
    </View>
  );
}

function Corpo({ children, rodape }: { children: ReactNode; rodape?: ReactNode }) {
  const c = useCores();
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <ScrollView contentContainerStyle={k.corpo} keyboardShouldPersistTaps="handled">{children}</ScrollView>
      {rodape ? <Rodape>{rodape}</Rodape> : null}
    </View>
  );
}
function Rodape({ children }: { children: ReactNode }) {
  const c = useCores(), insets = useSafeAreaInsets();
  return <View style={[k.rodape, { backgroundColor: c.surface, borderTopColor: c.border, paddingBottom: Math.max(insets.bottom, 12) }]}><View style={k.rodapeIn}>{children}</View></View>;
}

function Botao({ titulo, onPress, tipo = 'p', desabilitado = false, icone: I }: { titulo: string; onPress: () => void; tipo?: 'p' | 's'; desabilitado?: boolean; icone?: typeof CheckIcon }) {
  const c = useCores();
  const p = tipo === 'p';
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ disabled: desabilitado }} disabled={desabilitado} onPress={onPress}
      style={({ pressed }) => [k.botao, p ? { backgroundColor: AMBER } : { backgroundColor: c.surface, borderWidth: 1.5, borderColor: c.text }, desabilitado && { opacity: 0.45 }, pressed && { transform: [{ scale: 0.98 }], opacity: 0.9 }]}>
      {I ? <I size={18} color={p ? AMBER_TXT : c.text} weight="bold" /> : null}
      <Text style={[k.botaoTxt, { color: p ? AMBER_TXT : c.text }]}>{titulo}</Text>
    </Pressable>
  );
}

type Tom = 'ok' | 'alerta' | 'neutro' | 'erro' | 'info';
function Pilula({ texto, tom }: { texto: string; tom: Tom }) {
  const c = useCores();
  const m: Record<Tom, [string, string]> = { ok: [c.successSoft, c.success], alerta: [c.warningSoft, c.warning], neutro: [c.neutralSoft, c.textMuted], erro: [c.dangerSoft, c.danger], info: [c.accentSoft, c.accentText] };
  return <View style={[k.pilula, { backgroundColor: m[tom][0] }]}><Text style={[k.pilulaTxt, { color: m[tom][1] }]}>{texto}</Text></View>;
}
const tomRodada = (s: StatusRodada): Tom => (s === 'finalizada' ? 'ok' : s === 'andamento' ? 'alerta' : 'neutro');

function Cartao({ children, style, onPress }: { children: ReactNode; style?: object; onPress?: () => void }) {
  const c = useCores();
  const base = [k.cartao, { backgroundColor: c.surface, borderColor: c.border }, style];
  return onPress
    ? <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [...base, pressed && { opacity: 0.8 }]}>{children}</Pressable>
    : <View style={base}>{children}</View>;
}

function Anel({ pct, size = 108, claro = false }: { pct: number; size?: number; claro?: boolean }) {
  const c = useCores();
  const r = size / 2 - size * 0.07, circ = 2 * Math.PI * r, w = size * 0.09;
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }} accessibilityLabel={`${Math.round(pct * 100)}% coletado`}>
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={claro ? 'rgba(255,255,255,0.25)' : c.neutralSoft} strokeWidth={w} fill="none" />
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={claro ? AMBER : c.success} strokeWidth={w} fill="none" strokeLinecap="round"
          strokeDasharray={`${circ * Math.min(1, pct)} ${circ}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      </Svg>
      <Text style={{ fontSize: size * 0.24, fontWeight: '800', color: claro ? '#fff' : c.text, fontVariant: ['tabular-nums'] }}>{Math.round(pct * 100)}%</Text>
    </View>
  );
}

function Barra({ pct }: { pct: number }) {
  const c = useCores();
  return <View style={[k.barra, { backgroundColor: c.neutralSoft }]}><View style={[k.barraIn, { width: `${Math.min(100, Math.max(pct > 0 ? 2 : 0, pct * 100))}%`, backgroundColor: c.success }]} /></View>;
}

function Segmentos<T extends string>({ opcoes, valor, onChange, multi }: { opcoes: { id: T; titulo: string; sub?: string; desab?: boolean }[]; valor: T | T[]; onChange: (v: T) => void; multi?: boolean }) {
  const c = useCores();
  return (
    <View style={k.segs}>
      {opcoes.map(o => {
        const on = multi ? (valor as T[]).includes(o.id) : valor === o.id;
        return (
          <Pressable key={o.id} accessibilityRole={multi ? 'checkbox' : 'radio'} accessibilityState={{ selected: on, checked: on, disabled: o.desab }} disabled={o.desab} onPress={() => onChange(o.id)}
            style={[k.seg, { borderColor: on ? NAVY : c.borderStrong, backgroundColor: on ? NAVY : c.surface }, o.desab && { opacity: 0.4 }]}>
            <Text style={[k.segTit, { color: on ? '#fff' : c.text }]} numberOfLines={1}>{o.titulo}</Text>
            {o.sub ? <Text style={[k.segSub, { color: on ? '#dbe4ef' : c.textMuted }]} numberOfLines={1}>{o.sub}</Text> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

function Rotulo({ children }: { children: string }) { const c = useCores(); return <Text style={[k.rotulo, { color: c.textMuted }]}>{children}</Text>; }
function Sumiu({ nav }: { nav: Nav }) {
  return <View style={{ flex: 1 }}><Topo titulo="Contagem de Estoque" onVoltar={nav.inicio} /><EmptyState icon={PackageIcon} title="Registro não encontrado" text="Ele pode ter sido removido em outro aparelho." action={{ label: 'Voltar ao início', onPress: nav.inicio }} /></View>;
}

/* =====================================================================
   Inventários
   ===================================================================== */
function ListaInventarios({ dados, nav }: { dados: Dados; nav: Nav }) {
  const c = useCores();
  const { nome, userEmail } = useAuth();
  const [petros, setPetros] = useState<boolean | null>(null);
  useEffect(() => { if (isSupabaseConfigured) void statusErp().then(r => setPetros(r.petros)).catch(() => setPetros(null)); }, []);
  const ultimaCarga = dados.inventarios.map(i => i.erp_em).filter(Boolean).sort().pop();
  const sub = `Usuário ${nome || userEmail?.split('@')[0] || ''} · ${petros ? 'ERP Petros conectado' : ultimaCarga ? `ERP carregado ${new Date(ultimaCarga).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}` : 'ERP por arquivo'}`;
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Topo titulo="Inventários" sub={sub} onVoltar={nav.voltar} />
      <Corpo rodape={<Botao titulo="Abrir inventário" onPress={() => nav.ir({ n: 'abrir' })} desabilitado={!isSupabaseConfigured} />}>
        {isSupabaseConfigured ? (
          <Cartao onPress={() => nav.ir({ n: 'bases' })}>
            <View style={k.linha}>
              <BarcodeIcon size={22} color={c.text} />
              <View style={{ flex: 1 }}>
                <Text style={[k.cTit, { color: c.text, fontSize: 15 }]}>Bases de códigos de barra</Text>
                <Text style={[k.cap, { color: c.textMuted }]}>{dados.bases.size.toLocaleString('pt-BR')} de {dados.filiais.length.toLocaleString('pt-BR')} filiais com a relação importada</Text>
              </View>
              <CaretRightIcon size={18} color={c.textMuted} />
            </View>
          </Cartao>
        ) : null}
        {!dados.inventarios.length
          ? <EmptyState icon={PackageIcon} title="Nenhum inventário ainda" text={isSupabaseConfigured ? 'Abra um inventário: escolha a filial e carregue os saldos do ERP.' : 'A contagem de estoque precisa do servidor (o app está em modo local).'} />
          : dados.inventarios.map(i => <CartaoInventario key={i.id} inv={i} dados={dados} onPress={() => nav.ir({ n: 'inventario', id: i.id })} />)}
      </Corpo>
    </View>
  );
}

function CartaoInventario({ inv, dados, onPress }: { inv: Inventario; dados: Dados; onPress: () => void }) {
  const c = useCores();
  const col = useColetas(inv.id);
  const coletados = useMemo(() => new Set(col.list.map(x => x.codigo)).size, [col.list]);
  const nCont = dados.contagens.filter(x => x.inventario_id === inv.id).length;
  const enc = inv.status === 'encerrado';
  return (
    <Cartao onPress={onPress}>
      <View style={k.linha}>
        <Text style={[k.cTit, { color: c.text, flex: 1 }]} numberOfLines={1}>{nomeFilial(dados, inv.filial_id)}</Text>
        <Pilula texto={inv.status === 'carregando' ? 'Carregando' : enc ? 'Encerrado' : 'Aberto'} tom={enc ? 'alerta' : inv.status === 'carregando' ? 'neutro' : 'ok'} />
      </View>
      <Text style={[k.mono, { color: c.textMuted }]}>{inv.codigo}</Text>
      <Text style={[k.cTxt, { color: c.text }]}>{inv.tipo === 'completo' ? 'Completo' : 'Parcial'} · {nCont} contage{nCont === 1 ? 'm' : 'ns'}</Text>
      <Barra pct={enc ? 1 : inv.itens_total ? coletados / inv.itens_total : 0} />
      <Text style={[k.cap, { color: c.textMuted }]}>
        {enc ? (inv.enviado_erp_em ? `Enviado ao ERP em ${dataBR(inv.enviado_erp_em)}` : `Encerrado em ${dataBR(inv.encerrado_em)}`) : `${coletados.toLocaleString('pt-BR')} de ${inv.itens_total.toLocaleString('pt-BR')} itens coletados`}
      </Text>
    </Cartao>
  );
}

function AbrirInventario({ dados, nav }: { dados: Dados; nav: Nav }) {
  const c = useCores();
  const [filialId, setFilialId] = useState('');
  const [tipo, setTipo] = useState<'completo' | 'parcial'>('completo');
  const [escolher, setEscolher] = useState(false);
  const [busca, setBusca] = useState('');
  const [petros, setPetros] = useState(false);
  const [fonte, setFonte] = useState<'arquivo' | 'petros'>('arquivo');
  const [arquivo, setArquivo] = useState<ArquivoErp | null>(null);
  const [arquivoVenda, setArquivoVenda] = useState<ArquivoErp | null>(null);
  const [enviando, setEnviando] = useState(false);
  useEffect(() => { void statusErp().then(r => { setPetros(r.petros); if (r.petros) setFonte('petros'); }).catch(() => undefined); }, []);
  const aberto = dados.inventarios.find(i => i.filial_id === filialId && i.status !== 'encerrado');
  const base = filialId ? dados.bases.get(filialId) : undefined;
  const filtradas = dados.filiais.filter(f => `${f.codigo} ${f.nome} ${f.cidade}`.toLowerCase().includes(busca.toLowerCase()));

  const abrir = async () => {
    if (!filialId) { notify('Escolha a filial'); return; }
    if (aberto) { notify('Filial com inventário aberto', `${aberto.codigo} ainda está aberto nesta filial. Encerre-o antes de abrir outro.`); return; }
    if (!base) { notify('Base de códigos de barra pendente', 'Importe a relação de códigos de barra desta filial antes de abrir o inventário.'); return; }
    if (fonte === 'arquivo' && !arquivo && !arquivoVenda) { notify('Escolha o PDF de saldos', 'Use a Conferência de Estoque da filial com preço de custo, com preço de venda ou as duas.'); return; }
    setEnviando(true);
    const id = uid('inv');
    try {
      inventariosCol.put({ id, codigo: proximoCodigo(dados.inventarios.map(i => i.codigo)), filial_id: filialId, tipo, status: 'carregando', fonte, arquivo: arquivo?.nome ?? '', itens_total: 0, erp_em: null, encerrado_em: null, enviado_erp_em: null });
      await inventariosCol.flush();
      const r = await carregarErp(id, fonte, arquivo ?? undefined, arquivoVenda ?? undefined);
      await inventariosCol.sync();
      if (r.avisos.length) notify(`${r.itens.toLocaleString('pt-BR')} itens carregados`, r.avisos.join('\n'));
      nav.trocar({ n: 'inventario', id });
    } catch (e) {
      notify('Inventário não aberto', `${e instanceof Error ? e.message : ''}\n\nO inventário ficou como "carregando": abra-o para tentar carregar o ERP de novo.`);
      await inventariosCol.sync().catch(() => undefined);
    } finally { setEnviando(false); }
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Topo titulo="Abrir inventário" sub="Selecione a filial e o tipo" onVoltar={nav.voltar} />
      <Corpo rodape={<>
        <Botao titulo={enviando ? 'Carregando o ERP…' : 'Abrir inventário'} onPress={() => void abrir()} desabilitado={enviando || !filialId || !base} />
        <Botao titulo="Cancelar" tipo="s" onPress={nav.voltar} desabilitado={enviando} />
      </>}>
        <Rotulo>Filial</Rotulo>
        <Pressable accessibilityRole="button" onPress={() => setEscolher(true)} style={[k.select, { backgroundColor: c.surface, borderColor: c.borderStrong }]}>
          <Text style={[k.selectTxt, { color: filialId ? c.text : c.textFaint }]} numberOfLines={1}>{filialId ? nomeFilial(dados, filialId) : 'Escolha a filial'}</Text>
          <CaretDownIcon size={18} color={c.textMuted} />
        </Pressable>
        {aberto ? <Text style={[k.cap, { color: c.danger }]}>{aberto.codigo} ainda está aberto nesta filial.</Text> : null}
        {filialId ? (
          <Cartao onPress={() => nav.ir({ n: 'bases', filial: filialId })}>
            <View style={k.linha}>
              <BarcodeIcon size={22} color={base ? c.success : c.danger} />
              <View style={{ flex: 1 }}>
                <Text style={[k.cTit, { color: c.text, fontSize: 15 }]}>{base ? 'Base de códigos de barra importada' : 'Falta a base de códigos de barra'}</Text>
                <Text style={[k.cap, { color: c.textMuted }]}>{base ? `${base.itens.toLocaleString('pt-BR')} itens · ${base.eans.toLocaleString('pt-BR')} códigos · ${dataHora(base.importado_em)}` : 'Importe uma vez a relação de códigos de barra desta filial.'}</Text>
              </View>
              <CaretRightIcon size={18} color={c.textMuted} />
            </View>
          </Cartao>
        ) : null}
        <Rotulo>Tipo de inventário</Rotulo>
        <Segmentos opcoes={[{ id: 'completo', titulo: 'Completo' }, { id: 'parcial', titulo: 'Parcial' }]} valor={tipo} onChange={setTipo} />
        <Cartao>
          <Text style={[k.cTit, { color: c.text }]}>Classificação automática (ERP)</Text>
          <Text style={[k.cTxt, { color: c.textMuted }]}>Produtos e categorias são separados pelo ERP entre Pista e Conveniência.</Text>
          <View style={k.linha}><Pilula texto="Pista" tom="alerta" /><Pilula texto="Conveniência" tom="neutro" /></View>
          <Text style={[k.cap, { color: c.textMuted }]}>Só entram itens com saldo diferente de zero na filial.</Text>
        </Cartao>
        <Rotulo>Saldos do ERP (Petros)</Rotulo>
        <Segmentos opcoes={[{ id: 'arquivo', titulo: 'Arquivo exportado', sub: 'PDF ou CSV' }, { id: 'petros', titulo: 'API do Petros', sub: petros ? 'Conectada' : 'Em breve', desab: !petros }]} valor={fonte} onChange={setFonte} />
        {fonte === 'arquivo' ? <ArquivosErp custo={arquivo} setCusto={setArquivo} venda={arquivoVenda} setVenda={setArquivoVenda} /> : null}
      </Corpo>
      {escolher && (
        <Sheet title="Filial" onClose={() => setEscolher(false)}>
          <Field icon={MagnifyingGlassIcon} value={busca} onChangeText={setBusca} placeholder="Código, nome ou cidade" />
          {filtradas.slice(0, 60).map(f => (
            <Pressable key={f.id} accessibilityRole="radio" accessibilityState={{ selected: f.id === filialId }} onPress={() => { setFilialId(f.id); setEscolher(false); }}
              style={[k.opcao, { borderBottomColor: c.border }]}>
              <StorefrontIcon size={18} color={c.textMuted} />
              <Text style={[k.cTxt, { color: c.text, flex: 1 }]} numberOfLines={1}>{f.codigo} · {f.nome}{f.cidade ? ` · ${f.cidade}` : ''}</Text>
              {f.id === filialId ? <CheckIcon size={16} color={c.success} weight="bold" /> : null}
            </Pressable>
          ))}
        </Sheet>
      )}
    </View>
  );
}

type ArquivoErp = { nome: string; base64: string };
/** Os dois PDFs da Conferência de Estoque: o mesmo relatório com o preço de custo e com o preço de venda. */
function ArquivosErp({ custo, setCusto, venda, setVenda }: { custo: ArquivoErp | null; setCusto: (a: ArquivoErp) => void; venda: ArquivoErp | null; setVenda: (a: ArquivoErp) => void }) {
  const c = useCores();
  const pegar = async (set: (a: ArquivoErp) => void) => { try { const a = await escolherArquivoErp(); if (a) set(a); } catch (e) { notify('Arquivo não lido', e instanceof Error ? e.message : ''); } };
  const campo = (titulo: string, sub: string, a: ArquivoErp | null, set: (a: ArquivoErp) => void) => (
    <Cartao onPress={() => void pegar(set)}>
      <View style={k.linha}>
        <UploadSimpleIcon size={22} color={c.text} />
        <View style={{ flex: 1 }}>
          <Text style={[k.cap, k.b, { color: c.textMuted }]}>{titulo}</Text>
          <Text style={[k.cTit, { color: c.text, fontSize: 15 }]} numberOfLines={1}>{a ? a.nome : 'Escolher PDF'}</Text>
          <Text style={[k.cap, { color: c.textMuted }]}>{a ? 'Toque para trocar' : sub}</Text>
        </View>
        {a ? <CheckIcon size={18} color={c.success} weight="bold" /> : null}
      </View>
    </Cartao>
  );
  return <>
    {campo('SALDOS COM PREÇO DE CUSTO', 'Conferência de Estoque - Custo (saldo no momento da abertura)', custo, setCusto)}
    {campo('SALDOS COM PREÇO DE VENDA', 'O mesmo relatório, tirado na tela com preço de venda', venda, setVenda)}
    <Text style={[k.cap, { color: c.textMuted }]}>Basta um dos dois (custo ou venda); com os dois, o relatório traz os valores a custo e a venda. Eles são ligados pelo código interno, e o app percebe qual é qual pelo título do relatório.</Text>
  </>;
}

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const dataHora = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');

/* =====================================================================
   Bases de códigos de barra (uma por filial, importada uma vez)
   ===================================================================== */
function BasesBarras({ dados, nav, destaque }: { dados: Dados; nav: Nav; destaque?: string }) {
  const c = useCores();
  const [busca, setBusca] = useState('');
  const [lendo, setLendo] = useState<{ filial: string; txt: string } | null>(null);
  const filiais = useMemo(() => {
    const q = busca.toLowerCase();
    return dados.filiais.filter(f => `${f.codigo} ${f.nome} ${f.cidade}`.toLowerCase().includes(q))
      .sort((a, b) => (a.id === destaque ? -1 : b.id === destaque ? 1 : 0) || (dados.bases.has(a.id) ? 1 : 0) - (dados.bases.has(b.id) ? 1 : 0) || String(a.codigo).localeCompare(String(b.codigo), 'pt-BR', { numeric: true }));
  }, [dados.filiais, dados.bases, busca, destaque]);

  const importar = async (filialId: string) => {
    if (lendo) return;
    try {
      const r = await DocumentPicker.getDocumentAsync({ type: 'application/pdf', copyToCacheDirectory: true, multiple: false });
      const a = r.canceled ? undefined : r.assets?.[0];
      if (!a) return;
      const nome = filialCurta(dados, filialId);
      setLendo({ filial: filialId, txt: 'Abrindo o PDF…' });
      const lido = await lerPdfBarras(a, txt => setLendo({ filial: filialId, txt }));
      setLendo(null);
      const ja = dados.bases.get(filialId);
      confirmAction(`Importar base da ${nome}?`,
        `${lido.itens.length.toLocaleString('pt-BR')} itens e ${lido.eans.toLocaleString('pt-BR')} códigos de barra em "${a.name}" (${lido.semEan.toLocaleString('pt-BR')} itens sem código de barra).${ja ? `\n\nSubstitui a base atual (${ja.itens.toLocaleString('pt-BR')} itens, ${dataHora(ja.importado_em)}). Inventários já abertos não mudam.` : ''}`,
        ja ? 'Substituir' : 'Importar', () => {
          void (async () => {
            setLendo({ filial: filialId, txt: 'Gravando no servidor…' });
            try {
              const g = await gravarBarras(filialId, a.name, lido.itens);
              await basesCol.sync();
              notify('Base importada', `${nome}: ${g.itens.toLocaleString('pt-BR')} itens e ${g.eans.toLocaleString('pt-BR')} códigos de barra. Os próximos inventários desta filial já usam esta base.`);
            } catch (e) { notify('Base não gravada', e instanceof Error ? e.message : ''); } finally { setLendo(null); }
          })();
        });
    } catch (e) { setLendo(null); notify('PDF não lido', e instanceof Error ? e.message : ''); }
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Topo titulo="Bases de códigos de barra" sub={`${dados.bases.size} de ${dados.filiais.length} filiais com base`} onVoltar={nav.voltar} />
      <Corpo>
        <Cartao>
          <Text style={[k.cTit, { color: c.text, fontSize: 15 }]}>Uma base fixa por filial</Text>
          <Text style={[k.cTxt, { color: c.textMuted }]}>Importe a "Relação de Códigos de Barra por Categoria" do Petros de cada filial. Ela liga o código interno aos códigos de barra (ex.: 7790 Monster Green → 0708470220156). Em cada inventário entra só o PDF de saldos; os códigos de barra vêm daqui e seguem para os coletores.</Text>
          <Text style={[k.cap, { color: c.textMuted }]}>Pode importar pela versão web ou pelo app: a base fica no servidor e sincroniza com todos os aparelhos.</Text>
        </Cartao>
        <Field icon={MagnifyingGlassIcon} value={busca} onChangeText={setBusca} placeholder="Código, nome ou cidade" />
        {filiais.map(f => {
          const b = dados.bases.get(f.id), aqui = lendo?.filial === f.id;
          return (
            <Cartao key={f.id} onPress={!lendo ? () => void importar(f.id) : undefined} style={f.id === destaque ? { borderColor: AMBER, borderWidth: 2 } : undefined}>
              <View style={k.linha}>
                <Text style={[k.cTit, { color: c.text, flex: 1, fontSize: 15 }]} numberOfLines={1}>{rotuloFilial(f)}</Text>
                <Pilula texto={b ? 'Importada' : 'Pendente'} tom={b ? 'ok' : 'erro'} />
              </View>
              <Text style={[k.cap, { color: c.textMuted }]} numberOfLines={2}>
                {aqui && lendo ? lendo.txt : b ? `${b.itens.toLocaleString('pt-BR')} itens · ${b.eans.toLocaleString('pt-BR')} códigos · ${dataHora(b.importado_em)} · ${b.arquivo}` : 'Sem relação de códigos de barra: ainda não dá para abrir inventário.'}
              </Text>
              {aqui ? <ActivityIndicator color={c.textMuted} /> : !lendo ? <Text style={[k.cap, k.b, { color: c.accentText }]}>{b ? 'Toque para substituir pelo PDF mais recente' : 'Toque para importar o PDF'}</Text> : null}
            </Cartao>
          );
        })}
      </Corpo>
    </View>
  );
}

function InventarioTela({ inv, dados, nav }: { inv: Inventario; dados: Dados; nav: Nav }) {
  const c = useCores();
  const { produtos, erro } = useProdutos(inv);
  const col = useColetas(inv.id);
  const [recarregando, setRecarregando] = useState(false);
  const contagens = useMemo(() => dados.contagens.filter(x => x.inventario_id === inv.id).sort((a, b) => (concluida(a) ? 1 : 0) - (concluida(b) ? 1 : 0)), [dados.contagens, inv.id]);
  const prog = produtos ? progressoInventario(produtos, col.list) : { coletados: 0, total: inv.itens_total, pct: 0 };
  const enc = inv.status === 'encerrado';
  const sub = `${nomeFilial(dados, inv.filial_id)} · ${inv.tipo === 'completo' ? 'Completo' : 'Parcial'}`;

  const [arqCusto, setArqCusto] = useState<ArquivoErp | null>(null);
  const [arqVenda, setArqVenda] = useState<ArquivoErp | null>(null);
  const recarregar = async () => {
    if (inv.fonte === 'arquivo' && !arqCusto && !arqVenda) { notify('Escolha o PDF de saldos', 'Use a Conferência de Estoque com preço de custo, com preço de venda ou as duas.'); return; }
    try {
      setRecarregando(true);
      const r = await carregarErp(inv.id, inv.fonte, arqCusto ?? undefined, arqVenda ?? undefined);
      await inventariosCol.sync();
      if (r.avisos.length) notify(`${r.itens.toLocaleString('pt-BR')} itens carregados`, r.avisos.join('\n'));
    } catch (e) { notify('ERP não carregado', e instanceof Error ? e.message : ''); } finally { setRecarregando(false); }
  };
  const finalizarInv = () => {
    const abertas = contagens.filter(x => !concluida(x)).length;
    confirmAction('Finalizar inventário?', `${abertas ? `${abertas} contagem(ns) ainda não foram finalizadas; os itens entram com a última quantidade coletada. ` : ''}O inventário é encerrado e o relatório fica disponível aqui e no painel web.`, 'Finalizar', () => {
      inventariosCol.put({ ...inv, status: 'encerrado', encerrado_em: new Date().toISOString() });
      nav.trocar({ n: 'relatorio', inv: inv.id });
    });
  };

  if (inv.status === 'carregando') return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Topo titulo={inv.codigo} sub={sub} onVoltar={nav.voltar} />
      <Corpo rodape={<Botao titulo={recarregando ? 'Carregando…' : inv.fonte === 'arquivo' ? 'Carregar os PDFs' : 'Carregar do Petros'} onPress={() => void recarregar()} desabilitado={recarregando || (inv.fonte === 'arquivo' && !arqCusto && !arqVenda)} />}>
        <EmptyState icon={PackageIcon} title="Saldos do ERP ainda não carregados" text="A carga dos produtos não terminou. Carregue de novo para começar as contagens." />
        {inv.fonte === 'arquivo' ? <ArquivosErp custo={arqCusto} setCusto={setArqCusto} venda={arqVenda} setVenda={setArqVenda} /> : null}
      </Corpo>
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Topo titulo={inv.codigo} sub={`${sub} · saldo ${dataHora(inv.saldo_em ?? inv.erp_em)}`} onVoltar={nav.voltar} />
      <Corpo rodape={enc
        ? <><Botao titulo="Ver relatório" onPress={() => nav.ir({ n: 'relatorio', inv: inv.id })} /><Botao titulo="Reabrir inventário" tipo="s" onPress={() => confirmAction('Reabrir inventário?', 'As contagens voltam a aceitar leituras.', 'Reabrir', () => inventariosCol.put({ ...inv, status: 'aberto', encerrado_em: null }))} /></>
        : <><Botao titulo="Abrir nova contagem" onPress={() => nav.ir({ n: 'nova', inv: inv.id })} desabilitado={!produtos} /><Botao titulo="Finalizar inventário" tipo="s" onPress={finalizarInv} desabilitado={!contagens.length} /></>}>
        <Cartao style={k.linha}>
          <Anel pct={prog.pct} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={[k.cTit, { color: c.text }]}>Progresso da coleta</Text>
            <Text style={[k.cTxt, { color: c.textMuted }]}>{prog.coletados.toLocaleString('pt-BR')} de {prog.total.toLocaleString('pt-BR')} itens coletados</Text>
            <Text style={[k.cap, { color: c.textMuted }]}>Não muda ao finalizar contagens</Text>
          </View>
        </Cartao>
        {erro ? <Text style={[k.cap, { color: c.danger }]}>{erro}</Text> : null}
        {!produtos && !erro ? <ActivityIndicator color={c.textMuted} /> : null}
        <Text style={[k.secao, { color: c.text }]}>Contagens</Text>
        {!contagens.length ? <EmptyState icon={BarcodeIcon} title="Nenhuma contagem aberta" text="Abra uma contagem por grupo de categorias (ex.: Bebidas alcoólicas) ou uma contagem completa." /> : null}
        {produtos && contagens.map(ct => {
          const itens = escopo(ct, produtos), q = quantidades(col.list, ct.id), pc = progressoContagem(ct, itens, q), feita = concluida(ct);
          return (
            <Cartao key={ct.id} onPress={() => nav.ir({ n: 'contagem', id: ct.id, aba: 'itens' })}>
              <Text style={[k.cTit, { color: c.text }]}>{ct.nome}</Text>
              <Text style={[k.cTxt, { color: c.textMuted }]}>{ROTULO_CLASSE[ct.classe]} · {ct.classe === 'completa' ? 'todas as categorias' : `${ct.categorias.length} categoria${ct.categorias.length === 1 ? '' : 's'}`} · {Math.round(pc * 100)}%</Text>
              <View style={[k.linha, { flexWrap: 'wrap' }]}>{ct.rodadas.map((r, i) => <Pilula key={i} texto={`${i + 1}ª ${ROTULO_RODADA[r]}`} tom={tomRodada(r)} />)}</View>
              {feita && !enc ? (
                <View style={k.linha}>
                  <View style={{ flex: 1 }}><Botao titulo="Reabrir contagem" tipo="s" onPress={() => contagensCol.put({ ...ct, rodadas: reabrir(ct, itens, q) })} /></View>
                  <View style={{ flex: 1 }}><Botao titulo="Ver relatório" tipo="s" onPress={() => nav.ir({ n: 'relatorio', inv: inv.id })} /></View>
                </View>
              ) : null}
            </Cartao>
          );
        })}
        <Text style={[k.cap, { color: c.textMuted }]}>Saldo do ERP de {dataHora(inv.saldo_em ?? inv.erp_em)} · {inv.arquivo || (inv.fonte === 'petros' ? 'API Petros' : 'arquivo')}{inv.arquivo_venda ? ` + ${inv.arquivo_venda}` : ''} · {inv.itens_total.toLocaleString('pt-BR')} itens com saldo{inv.sem_barras ? ` · ${inv.sem_barras.toLocaleString('pt-BR')} sem código de barras (ler pelo código interno)` : ''}</Text>
      </Corpo>
    </View>
  );
}

/* =====================================================================
   Nova contagem
   ===================================================================== */
function NovaContagem({ inv, dados, nav }: { inv: Inventario; dados: Dados; nav: Nav }) {
  const c = useCores();
  const { produtos } = useProdutos(inv);
  const parcial = inv.tipo === 'parcial';
  const [nome, setNome] = useState('');
  const [classes, setClasses] = useState<(ClasseContagem)[]>(parcial ? ['conveniencia'] : ['completa']);
  const [cats, setCats] = useState<string[]>([]);
  const completa = classes.includes('completa');
  const lista = useMemo(() => (produtos ? categoriasDe(produtos).filter(x => classes.includes(x.classe)) : []), [produtos, classes]);
  const itens = produtos ? escopo({ classe: completa ? 'completa' : 'mista', categorias: cats }, produtos).length : 0;
  const alternarClasse = (v: ClasseContagem) => {
    if (!parcial) { setClasses([v]); setCats([]); return; }
    setClasses(cl => (cl.includes(v) ? (cl.length > 1 ? cl.filter(x => x !== v) : cl) : [...cl, v]));
    setCats(cs => cs.filter(x => lista.some(l => l.nome === x)));
  };
  const criar = () => {
    if (!completa && !cats.length) { notify('Escolha as categorias'); return; }
    const classe: ClasseContagem = completa ? 'completa' : classes.length > 1 ? 'mista' : classes[0];
    const id = uid('cont');
    contagensCol.put({ id, inventario_id: inv.id, nome: nome.trim() || (completa ? 'Contagem completa' : cats.length === 1 ? cats[0] : `${ROTULO_CLASSE[classe]} (${cats.length} categorias)`), classe, categorias: completa ? [] : cats, rodadas: ['andamento', 'aguardando', 'aguardando'] });
    nav.trocar({ n: 'contagem', id, aba: 'coleta' });
  };
  const opcoes = (parcial ? [] : [{ id: 'completa' as ClasseContagem, titulo: 'Completa' }]).concat([{ id: 'pista', titulo: 'Pista' }, { id: 'conveniencia', titulo: 'Conveniência' }]);
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Topo titulo="Nova contagem" sub={`${inv.codigo} · ${filialCurta(dados, inv.filial_id)} · ${parcial ? 'Parcial' : 'Completo'}`} onVoltar={nav.voltar} />
      <Corpo rodape={<>
        <Text style={[k.cap, { color: c.textMuted, textAlign: 'center' }]}>{completa ? 'Todas as categorias' : `${cats.length} categoria${cats.length === 1 ? '' : 's'} selecionada${cats.length === 1 ? '' : 's'}`} · {itens.toLocaleString('pt-BR')} itens com saldo</Text>
        <Botao titulo="Criar contagem" onPress={criar} desabilitado={!produtos || !itens} />
      </>}>
        <Rotulo>Nome da contagem</Rotulo>
        <Field value={nome} onChangeText={setNome} placeholder={completa ? 'Contagem completa' : 'Ex.: Bebidas alcoólicas'} />
        <Rotulo>Classificação</Rotulo>
        <Segmentos opcoes={opcoes} valor={classes} multi onChange={alternarClasse} />
        <Text style={[k.cap, { color: c.textMuted }]}>Completa: todas as categorias do ERP. Em inventário parcial, Pista e Conveniência podem ser combinadas.</Text>
        {!completa && (
          <View style={[k.cartao, { padding: 0, backgroundColor: c.surface, borderColor: c.border, overflow: 'hidden' }]}>
            <Text style={[k.cTit, { color: c.text, fontSize: 15, padding: space.lg, borderBottomWidth: 1, borderBottomColor: c.border }]}>Categorias de {classes.map(x => ROTULO_CLASSE[x]).join(' e ')}</Text>
            {!produtos ? <ActivityIndicator style={{ margin: 16 }} color={c.textMuted} /> : lista.map(cat => {
              const on = cats.includes(cat.nome);
              return (
                <Pressable key={cat.nome} accessibilityRole="checkbox" accessibilityState={{ checked: on }} onPress={() => setCats(cs => (on ? cs.filter(x => x !== cat.nome) : [...cs, cat.nome]))}
                  style={[k.opcao, { borderBottomColor: c.border, paddingHorizontal: space.lg }]}>
                  <View style={[k.check, { borderColor: on ? NAVY : c.borderStrong, backgroundColor: on ? NAVY : 'transparent' }]}>{on ? <CheckIcon size={14} color="#fff" weight="bold" /> : null}</View>
                  <Text style={[k.cTxt, { color: c.text, flex: 1 }]} numberOfLines={1}>{cat.nome}</Text>
                  <Text style={[k.cap, { color: c.textMuted }]}>{cat.itens.toLocaleString('pt-BR')} itens</Text>
                </Pressable>
              );
            })}
            {produtos && !lista.length ? <Text style={[k.cap, { color: c.textMuted, padding: space.lg }]}>Nenhuma categoria com saldo nesta classificação.</Text> : null}
          </View>
        )}
      </Corpo>
    </View>
  );
}

/* =====================================================================
   Contagem: Itens e Coleta
   ===================================================================== */
function ContagemTela({ c: ct, inv, dados, tela, nav }: { c: Contagem; inv: Inventario; dados: Dados; tela: Extract<Tela, { n: 'contagem' }>; nav: Nav }) {
  const c = useCores();
  const { produtos } = useProdutos(inv);
  const col = useColetas(inv.id);
  const atual = rodadaAtual(ct);
  const r: Rodada = tela.rodada ?? atual ?? 3;
  const itens = useMemo(() => (produtos ? escopo(ct, produtos) : []), [produtos, ct]);
  const q = useMemo(() => quantidades(col.list, ct.id), [col.list, ct.id]);
  const lista = useMemo(() => itensDaRodada(r, itens, q), [r, itens, q]);
  const prog = produtos ? progressoInventario(produtos, col.list).pct : 0;
  const ativa = ct.rodadas[r - 1] === 'andamento' && inv.status !== 'encerrado';
  const [sel, setSel] = useState<string | null>(null);
  const mudar = (p: Partial<Extract<Tela, { n: 'contagem' }>>) => nav.trocar({ ...tela, ...p });

  const rodadas = (
    <Segmentos opcoes={ct.rodadas.map((s, i) => ({ id: String(i + 1) as '1' | '2' | '3', titulo: `Contagem ${i + 1}`, sub: ROTULO_RODADA[s] }))} valor={String(r) as '1' | '2' | '3'} onChange={v => mudar({ rodada: Number(v) as Rodada })} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Topo titulo={ct.nome} sub={`${inv.codigo} · ${filialCurta(dados, inv.filial_id)}`} onVoltar={nav.voltar} direita={tela.aba === 'coleta' ? <Anel pct={prog} size={46} claro /> : null} />
      <View style={[k.abas, { backgroundColor: c.surface, borderBottomColor: c.border }]}>
        {(['itens', 'coleta', 'detalhe'] as const).map(a => (
          <Pressable key={a} accessibilityRole="tab" accessibilityState={{ selected: tela.aba === a }} onPress={() => mudar({ aba: a })} style={[k.aba, tela.aba === a && { borderBottomColor: AMBER }]}>
            <Text style={[k.abaTxt, { color: tela.aba === a ? c.text : c.textMuted }]}>{a === 'itens' ? 'Itens' : a === 'coleta' ? 'Coleta' : 'Detalhamento'}</Text>
          </Pressable>
        ))}
      </View>
      {!produtos ? <ActivityIndicator style={{ marginTop: 40 }} color={c.textMuted} />
        : tela.aba === 'detalhe' ? <Detalhamento ct={ct} produtos={produtos} q={q} />
        : tela.aba === 'itens' ? (
          <View style={{ flex: 1 }}>
            <FlatList
              data={lista}
              keyExtractor={p => p.codigo}
              contentContainerStyle={k.corpo}
              initialNumToRender={14}
              windowSize={9}
              ListHeaderComponent={<View style={{ gap: space.md }}>
                {rodadas}
                {r > 1 ? <Cartao><Text style={[k.cTit, { color: c.text, fontSize: 15 }]}>Recontagem: {lista.length.toLocaleString('pt-BR')} itens vindos da contagem {r - 1}</Text><Text style={[k.cTxt, { color: c.textMuted }]}>{r === 2 ? 'Divergentes, saldo negativo e não coletados. Os corretos já estão fechados.' : 'Não coletados e divergências não confirmadas na 2ª. Esta contagem confirma o resultado.'}</Text></Cartao> : null}
                {ct.rodadas[r - 1] === 'aguardando' ? <Text style={[k.cap, { color: c.textMuted }]}>Esta contagem começa quando a anterior for finalizada.</Text> : null}
              </View>}
              ItemSeparatorComponent={() => <View style={{ height: space.sm }} />}
              ListEmptyComponent={<EmptyState icon={CheckIcon} title="Nenhum item nesta contagem" text={r > 1 ? 'Tudo fechou na contagem anterior.' : 'Sem itens com saldo nas categorias escolhidas.'} />}
              renderItem={({ item: p }) => <LinhaItem p={p} r={r} q={q.get(p.codigo) ?? [null, null, null]} onPress={ativa ? () => { setSel(p.codigo); mudar({ aba: 'coleta' }); } : undefined} />}
            />
            {ativa ? <Rodape><Botao titulo={`Finalizar contagem ${r}`} tipo="s" onPress={() => nav.ir({ n: 'finalizar', id: ct.id, rodada: r })} /></Rodape> : null}
          </View>
        ) : (
          <Coleta ct={ct} r={r} ativa={ativa} produtos={produtos} itens={itens} lista={lista} q={q} sel={sel} setSel={setSel} rodadas={
            <View style={[k.linha, { gap: 6 }]}>
              {ct.rodadas.map((s, i) => {
                const on = r === i + 1;
                return (
                  <Pressable key={i} accessibilityRole="radio" accessibilityState={{ selected: on }} onPress={() => mudar({ rodada: (i + 1) as Rodada })}
                    style={[k.chip, { borderColor: on ? NAVY : c.borderStrong, backgroundColor: on ? NAVY : c.surface }]}>
                    <Text style={[k.cap, k.b, { color: on ? '#fff' : c.text }]} numberOfLines={1}>{i + 1}ª · {ROTULO_RODADA[s]}</Text>
                  </Pressable>
                );
              })}
            </View>
          } />
        )}
    </View>
  );
}

/** Detalhamento da contagem: cada item que deu falta ou sobra (ex.: "Coca-Cola 2L  −1"). */
function Detalhamento({ ct, produtos, q }: { ct: Contagem; produtos: Produto[]; q: Map<string, [number | null, number | null, number | null]> }) {
  const c = useCores();
  const d = useMemo(() => detalheContagem(ct, produtos, q), [ct, produtos, q]);
  type Linha = { tipo: 'cab'; titulo: string; n: number; cor: string } | { tipo: 'item'; l: LinhaDetalhe };
  const dados: Linha[] = [
    ...(d.faltas.length ? [{ tipo: 'cab' as const, titulo: 'Faltas', n: d.faltas.length, cor: c.danger }, ...d.faltas.map(l => ({ tipo: 'item' as const, l }))] : []),
    ...(d.sobras.length ? [{ tipo: 'cab' as const, titulo: 'Sobras', n: d.sobras.length, cor: c.warning }, ...d.sobras.map(l => ({ tipo: 'item' as const, l }))] : []),
    ...(d.naoColetados.length ? [{ tipo: 'cab' as const, titulo: 'Não coletados (entram como falta)', n: d.naoColetados.length, cor: c.textMuted }, ...d.naoColetados.map(l => ({ tipo: 'item' as const, l }))] : []),
  ];
  const t = d.total;
  const kpi = (rotulo: string, valor: string, cor?: string) => (
    <View style={[k.kpi, { backgroundColor: c.surface, padding: 10 }]}><Text style={[k.cap, { color: c.textMuted }]}>{rotulo}</Text><Text style={[k.monoM, k.b, { color: cor ?? c.text, fontSize: 18 }]}>{valor}</Text></View>
  );
  const sinal = (v: number) => `${v > 0 ? '+' : ''}${fmtQ(v)}`;
  return (
    <FlatList
      data={dados}
      keyExtractor={(x, i) => (x.tipo === 'cab' ? `c${i}` : x.l.produto.codigo)}
      contentContainerStyle={k.corpo}
      initialNumToRender={20}
      windowSize={9}
      ListHeaderComponent={<View style={{ gap: space.sm }}>
        <View style={k.linha}>
          {kpi('Falta', fmtQ(t.faltas), t.faltas ? c.danger : undefined)}
          {kpi('Sobra', fmtQ(t.sobras), t.sobras ? c.warning : undefined)}
          {kpi('Resultado', sinal(t.resultado), t.resultado < 0 ? c.danger : undefined)}
        </View>
        <View style={k.linha}>
          {kpi('Resultado R$ custo', t.temCusto ? brl(t.custo.resultado) : '—', t.custo.resultado < 0 ? c.danger : undefined)}
          {kpi('Resultado R$ venda', t.temVenda ? brl(t.venda.resultado) : '—', t.venda.resultado < 0 ? c.danger : undefined)}
        </View>
        <Text style={[k.cap, { color: c.textMuted }]}>{t.itens.toLocaleString('pt-BR')} itens · estoque sistema {fmtQ(t.sistema)} · contado {fmtQ(t.contagem)}{t.acuracia !== null ? ` · acurácia ${fmtQ(t.acuracia)}%` : ''}{t.eficiencia !== null ? ` · eficiência ${fmtQ(t.eficiencia)}%` : ''}. Vale a última quantidade coletada de cada item.</Text>
      </View>}
      ListEmptyComponent={<EmptyState icon={CheckIcon} title="Sem faltas nem sobras" text="Todos os itens desta contagem bateram com o saldo do ERP." />}
      renderItem={({ item: x }) => x.tipo === 'cab'
        ? <Text style={[k.secao, { color: x.cor, marginTop: space.sm }]}>{x.titulo} ({x.n.toLocaleString('pt-BR')})</Text>
        : (
          <View style={[k.linha, { paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: c.border }]}>
            <View style={{ flex: 1 }}>
              <Text style={[k.cTxt, { color: c.text, fontSize: 15 }]} numberOfLines={2}>{x.l.produto.nome}</Text>
              <Text style={[k.cap, { color: c.textMuted }]} numberOfLines={1}>{x.l.produto.codigo} · saldo {fmtQ(x.l.produto.saldo)} · contado {fmtQ(x.l.qtd)}</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={[k.monoM, k.b, { fontSize: 20, color: x.l.diferenca < 0 ? c.danger : c.warning }]}>{sinal(x.l.diferenca)}</Text>
              {x.l.difCusto !== null || x.l.difVenda !== null ? <Text style={[k.cap, { color: c.textMuted }]}>{[x.l.difCusto !== null ? `custo ${brl(x.l.difCusto)}` : '', x.l.difVenda !== null ? `venda ${brl(x.l.difVenda)}` : ''].filter(Boolean).join(' · ')}</Text> : null}
            </View>
          </View>
        )}
    />
  );
}

function LinhaItem({ p, r, q, onPress }: { p: Produto; r: Rodada; q: [number | null, number | null, number | null]; onPress?: () => void }) {
  const c = useCores();
  const s = situacaoNaRodada(p, r, q);
  // Caixinha verde = correto, amarela = pendente (ainda não coletado), vermelha = divergente (coletado diferente do saldo).
  const cor = s === 'correto' ? [c.successSoft, c.success] : s === 'divergente' ? [c.dangerSoft, c.danger] : [c.warningSoft, c.warning];
  const m = motivo(p, r, q);
  const coletado = q[r - 1];
  const dif = coletado === null ? null : coletado - p.saldo;
  const rotulo = s === 'correto' ? 'Correto' : s === 'divergente' ? 'Divergente' : 'Pendente';
  const caixa = s === 'pendente' ? AMBER : cor[1];
  return (
    <Pressable accessibilityRole={onPress ? 'button' : undefined} accessibilityLabel={`${p.nome}: ${rotulo}${coletado !== null ? `, coletado ${fmtQ(coletado)}` : ''}`} disabled={!onPress} onPress={onPress}
      style={({ pressed }) => [k.item, { backgroundColor: cor[0], borderLeftColor: caixa }, pressed && { opacity: 0.8 }]}>
      <View style={[k.caixa, { backgroundColor: caixa }]}>
        <PackageIcon size={22} color={s === 'pendente' ? AMBER_TXT : '#fff'} weight="fill" />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[k.mono, { color: c.textMuted }]} numberOfLines={1}>{p.codigo}{m ? ` · ${m}` : ` · ${p.categoria}`}</Text>
        <Text style={[k.cTxt, { color: c.text, fontSize: 16 }]} numberOfLines={2}>{p.nome}</Text>
        <Text style={[k.cTxt, { color: c.text }]}>Saldo <Text style={k.b}>{fmtQ(p.saldo)}</Text>{r > 1 ? Array.from({ length: r - 1 }, (_, i) => <Text key={i}> · {i + 1}ª <Text style={k.b}>{fmtQ(q[i])}</Text></Text>) : null}</Text>
      </View>
      <View style={{ alignItems: 'flex-end', justifyContent: 'center', gap: 2, minWidth: 74 }}>
        <Text style={[k.cap, k.b, { color: cor[1] }]}>{rotulo}</Text>
        {coletado !== null ? <>
          <Text style={[k.cap, { color: c.textMuted }]}>Coletado</Text>
          <Text style={[k.monoM, k.b, { color: c.text, fontSize: 20 }]}>{fmtQ(coletado)}</Text>
          {dif ? <Text style={[k.cap, k.b, { color: cor[1] }]}>{dif > 0 ? '+' : ''}{fmtQ(dif)}</Text> : null}
        </> : <Text style={[k.cap, { color: c.textMuted }]}>Não coletado</Text>}
      </View>
      {onPress ? <View style={{ justifyContent: 'center' }}><CaretRightIcon size={16} color={c.textMuted} /></View> : null}
    </Pressable>
  );
}

function Coleta({ ct, r, ativa, produtos, itens, lista, q, sel, setSel, rodadas }: {
  ct: Contagem; r: Rodada; ativa: boolean; produtos: Produto[]; itens: Produto[]; lista: Produto[]; q: Map<string, [number | null, number | null, number | null]>;
  sel: string | null; setSel: (s: string | null) => void; rodadas: ReactNode;
}) {
  const c = useCores();
  const insets = useSafeAreaInsets();
  const [codigo, setCodigo] = useState('');
  const [qtd, setQtd] = useState('');
  const [lido, setLido] = useState<string | null>(null);
  /** Item identificado e aguardando a quantidade (2º passo). */
  const [pendente, setPendente] = useState(false);
  const [aviso, setAviso] = useState<{ txt: string; tom: 'ok' | 'erro' } | null>(null);
  const [teclado, setTeclado] = useState(false); // coletor não precisa do teclado na tela; no celular comum, liga aqui
  const [verHist, setVerHist] = useState(false);
  const campo = useRef<ComponentRef<typeof TextInput>>(null);
  const campoQtd = useRef<ComponentRef<typeof TextInput>>(null);
  const indice = useMemo(() => indiceLeitura(produtos), [produtos]);
  const naRodada = useMemo(() => new Set(lista.map(p => p.codigo)), [lista]);
  const noEscopo = useMemo(() => new Set(itens.map(p => p.codigo)), [itens]);
  const col = useColetas(ct.inventario_id);
  const p = sel ? produtos.find(x => x.codigo === sel) : undefined;
  const ja = p ? q.get(p.codigo)?.[r - 1] ?? null : null;
  const hist = useMemo(() => (p ? col.list.filter(x => x.contagem_id === ct.id && x.rodada === r && x.codigo === p.codigo).flatMap(x => x.hist).sort((a, b) => b[0].localeCompare(a[0])).slice(0, 40) : []), [col.list, ct.id, r, p]);
  const focar = (qual: 'codigo' | 'qtd') => setTimeout(() => (qual === 'qtd' ? campoQtd : campo).current?.focus(), 60);

  // Item tocado na aba "Itens": já chega identificado, pedindo a quantidade.
  useEffect(() => { if (ativa && sel && naRodada.has(sel)) { setPendente(true); setLido(null); focar('qtd'); } }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // DUN-14 (caixa): a relação de barras do Petros imprime só 13 dígitos (pula o 13º) — tenta também essa forma.
  const achar = (cod: string) => indice.get(cod) ?? indice.get(cod.replace(/^0+/, '')) ?? (/^\d{14}$/.test(cod) ? indice.get(cod.slice(0, 12) + cod.slice(13)) : undefined);

  // 1º passo: lê o código e mostra qual item é (bip). A quantidade só é pedida depois.
  const ler = (bruto: string) => {
    const cod = bruto.trim();
    setCodigo('');
    if (!cod) { focar('codigo'); return; }
    const prod = achar(cod);
    setQtd('');
    if (!prod) { tocar('erro'); setSel(null); setPendente(false); setLido(cod); setAviso({ txt: `Código ${cod} não está na carga do ERP desta filial.`, tom: 'erro' }); focar('codigo'); return; }
    setSel(prod.codigo); setLido(cod);
    if (!naRodada.has(prod.codigo)) {
      tocar('erro'); setPendente(false);
      setAviso({ txt: noEscopo.has(prod.codigo) ? 'Este item já fechou na contagem anterior: não precisa coletar.' : 'Este item está fora desta contagem (outra categoria).', tom: 'erro' });
      focar('codigo');
      return;
    }
    tocar('bip'); setPendente(true); setAviso(null); focar('qtd');
  };

  // 2º passo: salva a quantidade do item que está na tela (bip diferente).
  const registrar = (bruto: string) => {
    if (!p || !pendente) return;
    const t = bruto.trim();
    // Coletor disparado no campo de quantidade: é um código de barras, não quantidade → identifica o novo item.
    if (/^\d{8,}$/.test(t) && achar(t)) { ler(t); return; }
    const n = Number(t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t); // 1,5 ou 1.5
    if (!t || !Number.isFinite(n) || n <= 0) { tocar('erro'); setAviso({ txt: 'Informe a quantidade contada deste item.', tom: 'erro' }); focar('qtd'); return; }
    if (n > 99999) { tocar('erro'); setAviso({ txt: `Quantidade ${t} muito alta: confira o número digitado.`, tom: 'erro' }); setQtd(''); focar('qtd'); return; }
    void registrarLeitura(ct, r, p.codigo, n);
    tocar('salvo');
    setAviso({ txt: `Salvo: +${fmtQ(n)} · ${p.nome}`, tom: 'ok' });
    setPendente(false); setQtd(''); focar('codigo');
  };
  /** Borracha: limpa a tela inteira e volta para a leitura, sem item. */
  const apagar = () => { setCodigo(''); setQtd(''); setLido(null); setSel(null); setPendente(false); setAviso(null); focar('codigo'); };
  const corrigir = () => { if (p && ja) void registrarLeitura(ct, r, p.codigo, -1); };

  if (!ativa) return (
    <ScrollView contentContainerStyle={k.corpo}>
      {rodadas}
      <EmptyState icon={BarcodeIcon} title={`Contagem ${r} ${ROTULO_RODADA[ct.rodadas[r - 1]].toLowerCase()}`} text="Só a contagem em andamento recebe leituras. Para corrigir uma finalizada, reabra a contagem na tela do inventário." />
    </ScrollView>
  );

  const corAviso = aviso ? (aviso.tom === 'ok' ? c.success : c.danger) : c.textMuted;
  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={k.coleta} keyboardShouldPersistTaps="always">
        {rodadas}
        {/* Leitura: código + teclado + borracha */}
        <View style={k.linha}>
          <TextInput ref={campo} autoFocus={!pendente} value={codigo} onChangeText={setCodigo} onSubmitEditing={e => ler(e.nativeEvent.text)} submitBehavior="submit" blurOnSubmit={false}
            placeholder={pendente ? 'Ler outro código' : 'Leia o código de barras'} placeholderTextColor={c.textFaint} autoCapitalize="none" autoCorrect={false} showSoftInputOnFocus={teclado} returnKeyType="search"
            style={[k.codigo, { color: c.text, backgroundColor: c.surface, borderColor: pendente ? c.borderStrong : AMBER }]} accessibilityLabel="Código de barras" />
          <Pressable accessibilityRole="switch" accessibilityLabel={teclado ? 'Esconder teclado' : 'Mostrar teclado para digitar o código'} accessibilityState={{ checked: teclado }}
            onPress={() => { setTeclado(v => !v); focar('codigo'); }} style={[k.icone, { backgroundColor: teclado ? NAVY : c.surface, borderColor: c.borderStrong }]}>
            <KeyboardIcon size={24} color={teclado ? '#fff' : c.text} />
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Apagar tudo e ler outro item" onPress={apagar} style={[k.icone, { backgroundColor: c.surface, borderColor: c.borderStrong }]}>
            <EraserIcon size={24} color={c.danger} weight="bold" />
          </Pressable>
        </View>
        {codigo.trim() ? <Botao titulo="Buscar item" tipo="s" icone={MagnifyingGlassIcon} onPress={() => ler(codigo)} /> : null}
        <Text style={[k.cap, { color: corAviso }]} numberOfLines={2}>{aviso?.txt ?? (pendente ? 'Confira o item e informe a quantidade.' : 'Leia o código: o item aparece aqui e depois você informa a quantidade.')}</Text>

        {/* Item identificado */}
        {p ? (
          <View style={[k.itemCol, { backgroundColor: c.surface, borderColor: pendente ? AMBER : c.border }]}>
            <View style={k.linha}>
              <Text style={[k.cap, k.b, { color: c.textMuted }]}>CÓD. INTERNO</Text>
              <Text style={[k.monoG, { color: c.text, flex: 1, fontSize: 22 }]} numberOfLines={1}>{p.codigo}</Text>
              <Pressable accessibilityRole="button" accessibilityLabel="Histórico de coletas do item" hitSlop={8} onPress={() => setVerHist(true)} style={[k.linha, { gap: 4 }]}>
                <ClockCounterClockwiseIcon size={20} color={c.accentText} />
                <Text style={[k.cap, k.b, { color: c.accentText }]}>{hist.length}</Text>
              </Pressable>
            </View>
            <Text style={[k.cTit, { color: c.text, fontSize: 19 }]} numberOfLines={2}>{p.nome}</Text>
            <Text style={[k.cap, { color: c.textMuted }]} numberOfLines={1}>{lido && lido !== p.codigo ? `Lido ${lido} · ` : ''}{p.categoria}</Text>
            <View style={k.linha}>
              <Text style={[k.cap, { color: c.textMuted }]}>Saldo ERP</Text>
              <Text style={[k.monoM, k.b, { color: c.text, fontSize: 20 }]}>{fmtQ(p.saldo)}</Text>
            </View>
          </View>
        ) : <EmptyState icon={BarcodeIcon} title="Aguardando leitura" text={`${lista.length.toLocaleString('pt-BR')} itens nesta contagem.`} />}

        {/* Quantidade: só depois de identificar o item */}
        {pendente && p ? (
          <View style={k.linha}>
            <TextInput ref={campoQtd} autoFocus value={qtd} onChangeText={setQtd} onSubmitEditing={e => registrar(e.nativeEvent.text)} submitBehavior="submit" blurOnSubmit={false}
              placeholder="Quantidade" placeholderTextColor={c.textFaint} keyboardType="decimal-pad" returnKeyType="done" selectTextOnFocus
              style={[k.codigo, { color: c.text, backgroundColor: c.surface, borderColor: AMBER, textAlign: 'center', fontSize: 26 }]} accessibilityLabel={`Quantidade contada de ${p.nome}`} />
            <Pressable accessibilityRole="button" accessibilityLabel="Salvar quantidade" accessibilityState={{ disabled: !qtd.trim() }} disabled={!qtd.trim()} onPress={() => registrar(qtd)}
              style={({ pressed }) => [k.salvar, !qtd.trim() && { opacity: 0.45 }, pressed && { opacity: 0.85 }]}>
              <CheckIcon size={22} color={AMBER_TXT} weight="bold" />
              <Text style={[k.botaoTxt, { color: AMBER_TXT }]}>Salvar</Text>
            </Pressable>
          </View>
        ) : null}
      </ScrollView>
      {p ? (
        <View style={[k.total, { paddingBottom: Math.max(insets.bottom, 12) }]}>
          <Text style={k.totalTxt}>Total coletado do item</Text>
          <Text style={k.totalN}>{fmtQ(ja ?? 0)}</Text>
        </View>
      ) : null}
      {verHist && p ? (
        <Sheet title="Histórico de coletas do item" onClose={() => setVerHist(false)}>
          <Text style={[k.cap, { color: c.textMuted }]}>{p.codigo} · {p.nome} · contagem {r}</Text>
          {hist.length ? hist.map(([h, n], i) => (
            <View key={i} style={[k.linha, { paddingVertical: 8, borderBottomWidth: i < hist.length - 1 ? 1 : 0, borderBottomColor: c.border }]}>
              <Text style={[k.monoM, { color: c.text, flex: 1 }]}>{h}</Text>
              <Text style={[k.monoM, k.b, { color: n < 0 ? c.danger : c.text }]}>{n > 0 ? '+' : ''}{fmtQ(n)}</Text>
            </View>
          )) : <Text style={[k.cap, { color: c.textMuted }]}>Nenhuma coleta deste item nesta contagem.</Text>}
          {ja ? <Botao titulo="Corrigir: tirar 1" tipo="s" icone={MinusIcon} onPress={corrigir} /> : null}
        </Sheet>
      ) : null}
    </View>
  );
}

/* =====================================================================
   Finalizar contagem (rodada)
   ===================================================================== */
function FinalizarRodada({ c: ct, inv, r, nav }: { c: Contagem; inv: Inventario; r: Rodada; dados: Dados; nav: Nav }) {
  const c = useCores();
  const { produtos } = useProdutos(inv);
  const col = useColetas(inv.id);
  const itens = useMemo(() => (produtos ? escopo(ct, produtos) : []), [produtos, ct]);
  const q = useMemo(() => quantidades(col.list, ct.id), [col.list, ct.id]);
  const res = resumoRodada(r, itens, q);
  const prox = r < 3 ? `Vão para a contagem ${r + 1}` : 'Entram como divergentes';
  const linhas: [number, string, string, Tom][] = [
    [res.corretos, 'Corretos', 'Ficam fechados', 'ok'],
    ...(r === 2 ? [[res.confirmados, 'Divergência confirmada', '2ª igual à 1ª: fica fechado', 'alerta'] as [number, string, string, Tom]] : []),
    [res.divergentes, 'Divergentes (mais ou menos)', prox, 'erro'],
    [res.negativos, 'Saldo negativo', prox, 'erro'],
    [res.naoColetados, 'Não coletados com saldo', r < 3 ? prox : 'Entram como não encontrados', 'info'],
  ];
  const finalizar = () => {
    contagensCol.put({ ...ct, rodadas: finalizarRodada(ct, r, itens, q) });
    nav.trocar({ n: 'contagem', id: ct.id, aba: 'itens' });
  };
  const cor = (t: Tom) => (t === 'ok' ? [c.successSoft, c.success] : t === 'erro' ? [c.dangerSoft, c.danger] : t === 'alerta' ? [c.warningSoft, c.warning] : [c.accentSoft, c.accent]);
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Topo titulo={`Finalizar contagem ${r}`} sub={`${ct.nome} · ${inv.codigo}`} onVoltar={nav.voltar} />
      <Corpo rodape={<>
        <Botao titulo={`Finalizar contagem ${r}`} onPress={finalizar} desabilitado={!produtos} />
        <Text style={[k.cap, { color: c.textMuted, textAlign: 'center' }]}>Pode ser reaberta depois. Os itens já coletados são mantidos.</Text>
      </>}>
        <Segmentos opcoes={ct.rodadas.map((s, i) => ({ id: String(i + 1), titulo: `Contagem ${i + 1}`, sub: ROTULO_RODADA[s] }))} valor={String(r)} onChange={() => undefined} />
        <Text style={[k.secao, { color: c.text }]}>Resumo da contagem · {res.total.toLocaleString('pt-BR')} itens</Text>
        {linhas.map(([n, t, s, tom]) => (
          <View key={t} style={[k.item, { backgroundColor: cor(tom)[0], borderLeftColor: cor(tom)[1], alignItems: 'center' }]}>
            <Text style={[k.resN, { color: c.text }]}>{n.toLocaleString('pt-BR')}</Text>
            <View style={{ flex: 1 }}><Text style={[k.cTit, { color: c.text, fontSize: 16 }]}>{t}</Text><Text style={[k.cTxt, { color: c.textMuted }]}>{s}</Text></View>
          </View>
        ))}
        <Text style={[k.cap, { color: c.textMuted }]}>
          {r === 1 ? 'Itens ainda não coletados na contagem 2 seguem para a 3, que confirma os divergentes e os não encontrados. Ao finalizá-la, a contagem é encerrada.'
            : r === 2 ? 'A contagem 3 confirma os itens que ainda não bateram. Se nada seguir, a contagem é encerrada.'
            : 'Ao finalizar a contagem 3, a contagem é encerrada com a última quantidade coletada de cada item.'}
          {res.seguem ? ` ${res.seguem.toLocaleString('pt-BR')} item(ns) seguem para a contagem ${r + 1}.` : ''}
        </Text>
      </Corpo>
    </View>
  );
}

/* =====================================================================
   Relatório do inventário
   ===================================================================== */
function Relatorio({ inv, dados, nav, divergentes }: { inv: Inventario; dados: Dados; nav: Nav; divergentes: boolean }) {
  const c = useCores();
  const { produtos } = useProdutos(inv);
  const col = useColetas(inv.id);
  const [enviando, setEnviando] = useState(false);
  const [petros, setPetros] = useState(false);
  useEffect(() => { void statusErp().then(r => setPetros(r.petros)).catch(() => undefined); }, []);
  const contagens = useMemo(() => dados.contagens.filter(x => x.inventario_id === inv.id), [dados.contagens, inv.id]);
  const rel = useMemo(() => (produtos ? relatorio(produtos, contagens, col.list) : null), [produtos, contagens, col.list]);
  const enc = inv.status === 'encerrado';
  const filial = nomeFilial(dados, inv.filial_id);
  const problemas = rel ? rel.linhas.filter(l => l.status !== 'correto') : [];

  const exportar = async () => {
    if (!rel) return;
    await shareText(`resultado_${inv.codigo}.csv`, resultadoCsv(inv, rel.linhas), 'text/csv;charset=utf-8');
    if (enc && !inv.enviado_erp_em) inventariosCol.put({ ...inv, enviado_erp_em: new Date().toISOString() });
  };
  const enviar = async () => {
    if (!rel) return;
    setEnviando(true);
    try {
      await inventariosCol.flush();
      const r = await enviarResultadoErp(inv.id, rel.linhas.map(l => ({ codigo: l.produto.codigo, saldo: l.produto.saldo, contado: l.qtd })));
      await inventariosCol.sync();
      notify('Resultado enviado ao Petros', `${r.enviados.toLocaleString('pt-BR')} itens enviados.`);
    } catch (e) { notify('Não enviado ao Petros', e instanceof Error ? e.message : ''); } finally { setEnviando(false); }
  };
  const imprimir = async () => {
    if (!rel) return;
    // Mesmo formato do módulo Inventários: resumo, categorias e o detalhamento item a item das faltas e sobras.
    const cons = porCategoria(rel.linhas);
    const n = (v: number) => fmtQ(v);
    const pct = (v: number | null) => (v === null ? '—' : `${fmtQ(v)}%`);
    const rs = (v: number, tem: boolean) => (tem ? brl(v) : '—');
    const sinal = (v: number) => `${v > 0 ? '+' : ''}${fmtQ(v)}`;
    const cor = (v: number) => (v < 0 ? ' neg' : v > 0 ? ' pos' : '');
    const t = cons.total;
    const metrica = (rot: string, val: string, cls = '') => `<div class="m"><span>${rot}</span><b class="${cls}">${val}</b></div>`;
    const resumo = [
      metrica('Estoque sistema', n(t.sistema)), metrica('Contagem', n(t.contagem)), metrica('Falta', n(t.faltas), t.faltas ? 'neg' : ''), metrica('Sobra', n(t.sobras), t.sobras ? 'pos' : ''), metrica('Resultado', sinal(t.resultado), cor(t.resultado).trim()),
      metrica('Falta R$ (custo)', rs(t.custo.faltas, t.temCusto), 'neg'), metrica('Sobra R$ (custo)', rs(t.custo.sobras, t.temCusto), 'pos'), metrica('Resultado R$ (custo)', rs(t.custo.resultado, t.temCusto), cor(t.custo.resultado).trim()),
      metrica('Falta R$ (venda)', rs(t.venda.faltas, t.temVenda), 'neg'), metrica('Sobra R$ (venda)', rs(t.venda.sobras, t.temVenda), 'pos'), metrica('Resultado R$ (venda)', rs(t.venda.resultado, t.temVenda), cor(t.venda.resultado).trim()),
      metrica('Acurácia', pct(t.acuracia)), metrica('Eficiência', pct(t.eficiencia)),
      metrica('Itens corretos', rel.corretos.toLocaleString('pt-BR')), metrica('Itens divergentes', rel.divergentes.toLocaleString('pt-BR')), metrica('Não encontrados', rel.naoEncontrados.toLocaleString('pt-BR')),
    ].join('');
    const linhaCat = (x: Consolidado, tot = false) => `<tr${tot ? ' class="tot"' : ''}><td>${esc(x.nome)}</td><td class="n">${n(x.itens)}</td><td class="n">${n(x.sistema)}</td><td class="n">${n(x.contagem)}</td><td class="n">${n(x.faltas)}</td><td class="n">${n(x.sobras)}</td><td class="n${cor(x.resultado)}">${sinal(x.resultado)}</td><td class="n">${rs(x.custo.faltas, x.temCusto)}</td><td class="n">${rs(x.custo.sobras, x.temCusto)}</td><td class="n${cor(x.custo.resultado)}">${rs(x.custo.resultado, x.temCusto)}</td><td class="n">${rs(x.venda.faltas, x.temVenda)}</td><td class="n">${rs(x.venda.sobras, x.temVenda)}</td><td class="n${cor(x.venda.resultado)}">${rs(x.venda.resultado, x.temVenda)}</td><td class="n">${pct(x.acuracia)}</td><td class="n">${pct(x.eficiencia)}</td></tr>`;
    const categorias = cons.categorias.map(x => linhaCat(x)).join('') + linhaCat(t, true);
    // Detalhamento: faltas e sobras por categoria (maiores diferenças primeiro).
    const porCat = new Map<string, typeof problemas>();
    problemas.forEach(l => { const g = porCat.get(l.produto.categoria) ?? []; g.push(l); porCat.set(l.produto.categoria, g); });
    const detalhe = [...porCat.entries()].sort((a, b) => a[0].localeCompare(b[0], 'pt-BR')).map(([cat, g]) => `<tr class="grp"><td colspan="9">${esc(cat)}</td></tr>` + g.sort((a, b) => a.diferenca - b.diferenca).map(l =>
      `<tr><td>${esc(l.produto.codigo)}</td><td>${esc(l.produto.nome)}</td><td class="n">${n(l.produto.saldo)}</td><td class="n">${n(l.qtd)}</td><td class="n${cor(l.diferenca)}"><b>${sinal(l.diferenca)}</b></td><td class="n">${l.difCusto === null ? '—' : brl(l.difCusto)}</td><td class="n">${l.difVenda === null ? '—' : brl(l.difVenda)}</td><td>${l.status === 'divergente' ? (l.diferenca < 0 ? 'Falta' : 'Sobra') : 'Não encontrado'}</td><td>${esc(l.contagem)}</td></tr>`).join('')).join('');
    const contagensTab = rel.porContagem.map(p => `<tr><td>${esc(p.contagem.nome)}</td><td class="n">${p.itens}</td><td class="n">${p.corretos}</td><td class="n">${p.divergentes}</td><td class="n">${p.naoEncontrados}</td></tr>`).join('');
    const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Inventário ${esc(inv.codigo)}</title><style>
@page{size:A4 landscape;margin:10mm}body{font:10px Arial,sans-serif;color:#1b2230;margin:0}h1{font-size:17px;margin:0 0 2px;color:${NAVY}}.sub{color:#5b6475;margin-bottom:8px}
h2{font-size:12px;margin:12px 0 5px;color:${NAVY}}.grid{display:grid;grid-template-columns:repeat(8,1fr);gap:5px}.m{background:#f2f4f7;border-radius:5px;padding:5px 6px}.m span{display:block;color:#5b6475;font-size:9px}.m b{font-size:13px;font-variant-numeric:tabular-nums}
table{width:100%;border-collapse:collapse}th{background:${NAVY};color:#fff;text-align:left;padding:3px 4px;font-size:9px}td{border-bottom:1px solid #e3e6ec;padding:2px 4px}.n{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
.neg{color:#c0262d}.pos{color:#a86400}.tot td{font-weight:700;background:#eef1f6;border-top:2px solid ${NAVY}}.grp td{background:#e8edf5;font-weight:700;color:${NAVY}}tr{page-break-inside:avoid}
</style></head><body>
<h1>Relatório do inventário ${esc(inv.codigo)}</h1>
<div class="sub">${esc(filial)} · ${inv.tipo === 'completo' ? 'Completo' : 'Parcial'} · Saldo do ERP de ${dataHora(inv.saldo_em ?? inv.erp_em)} · ${enc ? `Finalizado em ${dataBR(inv.encerrado_em)}` : 'Em andamento (parcial)'} · Emitido em ${new Date().toLocaleString('pt-BR')}</div>
<h2>Resumo</h2><div class="grid">${resumo}</div>
<h2>Resultado por categoria</h2><table><tr><th>Categoria</th><th class="n">Itens</th><th class="n">Sistema</th><th class="n">Contagem</th><th class="n">Falta</th><th class="n">Sobra</th><th class="n">Resultado</th><th class="n">Falta R$ custo</th><th class="n">Sobra R$ custo</th><th class="n">Result. R$ custo</th><th class="n">Falta R$ venda</th><th class="n">Sobra R$ venda</th><th class="n">Result. R$ venda</th><th class="n">Acurácia</th><th class="n">Eficiência</th></tr>${categorias}</table>
<h2>Resultado por contagem</h2><table><tr><th>Contagem</th><th class="n">Itens</th><th class="n">Corretos</th><th class="n">Divergentes</th><th class="n">Não encontrados</th></tr>${contagensTab}</table>
<h2>Detalhamento: faltas e sobras (${problemas.length.toLocaleString('pt-BR')} itens)</h2><table><tr><th>Código</th><th>Produto</th><th class="n">Saldo</th><th class="n">Contado</th><th class="n">Dif.</th><th class="n">Dif. R$ custo</th><th class="n">Dif. R$ venda</th><th>Situação</th><th>Contagem</th></tr>${detalhe || '<tr><td colspan="9">Nenhuma falta ou sobra.</td></tr>'}</table>
<p class="sub" style="margin-top:8px">Acurácia = contagem ÷ estoque sistema × 100. Eficiência = (1 − (falta + sobra) ÷ estoque sistema) × 100. Valores em R$ = diferença × preço unitário de custo ou de venda dos PDFs da carga.</p>
</body></html>`;
    try { await imprimirHtml(html, `Inventário ${inv.codigo}`); } catch (e) { notify('Não foi possível gerar o PDF', e instanceof Error ? e.message : ''); }
  };

  const tile = (n: number, t: string, cores: [string, string]) => (
    <View style={[k.tile, { backgroundColor: cores[0], borderTopColor: cores[1] }]}><Text style={[k.tileN, { color: c.text }]}>{n.toLocaleString('pt-BR')}</Text><Text style={[k.b, { color: c.text }]}>{t}</Text></View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Topo titulo="Relatório do inventário" sub={`${inv.codigo} · ${filialCurta(dados, inv.filial_id)} · ${enc ? 'Finalizado' : 'Parcial'}`} onVoltar={nav.voltar} />
      <Corpo rodape={<>
        <Botao titulo={divergentes ? 'Ocultar itens divergentes' : 'Ver itens divergentes'} onPress={() => nav.trocar({ n: 'relatorio', inv: inv.id, divergentes: !divergentes })} desabilitado={!rel} />
        <Botao titulo="Voltar ao início" tipo="s" onPress={nav.inicio} />
      </>}>
        {!rel ? <ActivityIndicator color={c.textMuted} /> : <>
          <View style={k.linha}>
            {tile(rel.corretos, 'Corretos', [c.successSoft, c.success])}
            {tile(rel.divergentes, 'Divergentes', [c.dangerSoft, c.danger])}
            {tile(rel.naoEncontrados, 'Não encontrados', [c.accentSoft, c.accent])}
          </View>
          <Cartao>
            <Text style={[k.cTit, { color: c.text }]}>Resultado em R$</Text>
            {([['A preço de custo', rel.custo, rel.temCusto], ['A preço de venda', rel.venda, rel.temVenda]] as const).map(([t, v, tem]) => (
              <View key={t} style={[k.linha, { alignItems: 'flex-start', paddingVertical: 6 }]}>
                <Text style={[k.cTxt, k.b, { color: c.text, flex: 1 }]}>{t}</Text>
                {tem ? (
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={[k.monoM, { color: c.danger }]}>Faltas {brl(v.faltas)}</Text>
                    <Text style={[k.monoM, { color: c.warning }]}>Sobras {brl(v.sobras)}</Text>
                    <Text style={[k.monoM, k.b, { color: v.resultado < 0 ? c.danger : c.text }]}>Resultado {brl(v.resultado)}</Text>
                  </View>
                ) : <Text style={[k.cap, { color: c.textMuted }]}>sem o PDF</Text>}
              </View>
            ))}
          </Cartao>
          {divergentes ? (
            <Cartao>
              <Text style={[k.cTit, { color: c.text }]}>Itens divergentes e não encontrados ({problemas.length.toLocaleString('pt-BR')})</Text>
              {problemas.slice(0, 400).map(l => (
                <View key={l.produto.codigo} style={[k.linha, { paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: c.border }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={[k.mono, { color: c.textMuted }]}>{l.produto.codigo} · {l.contagem}</Text>
                    <Text style={[k.cTxt, { color: c.text }]} numberOfLines={2}>{l.produto.nome}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={[k.monoM, { color: c.text }]}>{fmtQ(l.qtd)} / {fmtQ(l.produto.saldo)}</Text>
                    <Text style={[k.monoM, k.b, { color: l.diferenca < 0 ? c.danger : c.warning }]}>{l.diferenca > 0 ? '+' : ''}{fmtQ(l.diferenca)}</Text>
                    {l.difCusto !== null || l.difVenda !== null ? <Text style={[k.cap, { color: c.textMuted }]}>{l.difCusto !== null ? `custo ${brl(l.difCusto)}` : ''}{l.difCusto !== null && l.difVenda !== null ? ' · ' : ''}{l.difVenda !== null ? `venda ${brl(l.difVenda)}` : ''}</Text> : null}
                  </View>
                </View>
              ))}
              {problemas.length > 400 ? <Text style={[k.cap, { color: c.textMuted }]}>Mostrando 400. A lista completa está no PDF e no arquivo de resultado.</Text> : null}
            </Cartao>
          ) : (
            <Cartao>
              <Text style={[k.cTit, { color: c.text }]}>Resultado por contagem</Text>
              {rel.porContagem.map((p, i) => (
                <View key={p.contagem.id} style={[k.linha, { alignItems: 'flex-start', paddingVertical: 10, borderTopWidth: i ? 1 : 0, borderTopColor: c.border }]}>
                  <View style={{ flex: 1 }}><Text style={[k.cTit, { color: c.text, fontSize: 16 }]}>{p.contagem.nome}</Text><Text style={[k.cap, { color: c.textMuted }]}>{p.itens.toLocaleString('pt-BR')} itens</Text></View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={[k.monoM, { color: c.text }]}>{p.corretos.toLocaleString('pt-BR')} corretos</Text>
                    <Text style={[k.monoM, { color: c.text }]}>{p.divergentes.toLocaleString('pt-BR')} divergentes</Text>
                    <Text style={[k.monoM, { color: c.text }]}>{p.naoEncontrados.toLocaleString('pt-BR')} não encontrados</Text>
                  </View>
                </View>
              ))}
            </Cartao>
          )}
          <Cartao>
            <Text style={[k.cTit, { color: c.text }]}>Também no painel web</Text>
            <Text style={[k.cTxt, { color: c.textMuted }]}>Este relatório fica disponível no dashboard e aqui no app.{inv.enviado_erp_em ? ` Resultado enviado ao ERP em ${dataBR(inv.enviado_erp_em)}.` : ''}</Text>
            <View style={[k.linha, { flexWrap: 'wrap' }]}>
              <Pressable accessibilityRole="button" onPress={() => void imprimir()} style={[k.linha, k.acaoMini, { borderColor: c.borderStrong }]}><PrinterIcon size={16} color={c.text} /><Text style={[k.b, { color: c.text }]}>PDF</Text></Pressable>
              <Pressable accessibilityRole="button" onPress={() => void exportar()} style={[k.linha, k.acaoMini, { borderColor: c.borderStrong }]}><FileCsvIcon size={16} color={c.text} /><Text style={[k.b, { color: c.text }]}>Arquivo para o ERP</Text></Pressable>
              {petros && enc ? <Pressable accessibilityRole="button" disabled={enviando} onPress={() => void enviar()} style={[k.linha, k.acaoMini, { borderColor: c.borderStrong }]}><UploadSimpleIcon size={16} color={c.text} /><Text style={[k.b, { color: c.text }]}>{enviando ? 'Enviando…' : 'Enviar ao Petros'}</Text></Pressable> : null}
            </View>
          </Cartao>
        </>}
      </Corpo>
    </View>
  );
}

/* ---------- Estilos ---------- */
const k = StyleSheet.create({
  topo: { backgroundColor: NAVY, flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, paddingBottom: 14 },
  voltar: { width: 32, height: 40, alignItems: 'center', justifyContent: 'center', marginLeft: -6 },
  topoTit: { color: '#fff', fontSize: 22, fontWeight: '800', letterSpacing: -0.3 },
  topoSub: { color: '#c9d4e2', fontSize: 14 },
  corpo: { padding: space.lg, paddingBottom: space.xxl * 2, gap: space.md, width: '100%', maxWidth: pageMaxWidth(720), alignSelf: 'center' },
  rodape: { borderTopWidth: 1, paddingTop: 12, paddingHorizontal: space.lg },
  rodapeIn: { gap: 10, width: '100%', maxWidth: pageMaxWidth(720), alignSelf: 'center' },
  botao: { minHeight: 52, borderRadius: 12, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8, paddingHorizontal: 16 },
  botaoTxt: { fontSize: 16.5, fontWeight: '800' },
  pilula: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  pilulaTxt: { fontSize: 12.5, fontWeight: '800' },
  cartao: { borderWidth: 1, borderRadius: 14, padding: space.lg, gap: 8 },
  linha: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  cTit: { fontSize: 18, fontWeight: '800' },
  cTxt: { fontSize: 14.5 },
  cap: { fontSize: 13 },
  secao: { fontSize: 16, fontWeight: '800', marginTop: 4 },
  rotulo: { fontSize: 13.5, fontWeight: '700', marginBottom: -4 },
  mono: { fontFamily: 'monospace', fontSize: 13 },
  monoM: { fontFamily: 'monospace', fontSize: 14 },
  monoG: { fontFamily: 'monospace', fontSize: 24, fontWeight: '700' },
  b: { fontWeight: '800' },
  barra: { height: 8, borderRadius: 4, overflow: 'hidden' },
  barraIn: { height: 8, borderRadius: 4 },
  segs: { flexDirection: 'row', gap: space.sm },
  seg: { flex: 1, minHeight: 50, borderWidth: 1.5, borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6, paddingVertical: 6 },
  segTit: { fontSize: 15.5, fontWeight: '800' },
  segSub: { fontSize: 12, fontWeight: '600' },
  select: { minHeight: 52, borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 8 },
  selectTxt: { flex: 1, fontSize: 16.5, fontWeight: '600' },
  opcao: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 50, borderBottomWidth: 1 },
  check: { width: 22, height: 22, borderRadius: 5, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  abas: { flexDirection: 'row', borderBottomWidth: 1 },
  aba: { flex: 1, alignItems: 'center', paddingVertical: 13, borderBottomWidth: 3, borderBottomColor: 'transparent' },
  abaTxt: { fontSize: 16, fontWeight: '800' },
  item: { flexDirection: 'row', gap: space.sm, padding: 14, borderRadius: 12, borderLeftWidth: 5 },
  caixa: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center', alignSelf: 'center' },
  codigo: { flex: 1, minHeight: 54, borderWidth: 2, borderRadius: 12, paddingHorizontal: 14, fontSize: 19, fontFamily: 'monospace' },
  kpi: { flex: 1, borderRadius: 10, padding: 12, gap: 2 },
  coleta: { padding: space.md, gap: space.sm, width: '100%', maxWidth: 720, alignSelf: 'center' },
  icone: { width: 54, height: 54, borderRadius: 12, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  itemCol: { borderWidth: 2, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10, gap: 4 },
  salvar: { minHeight: 54, paddingHorizontal: 18, borderRadius: 12, backgroundColor: AMBER, flexDirection: 'row', alignItems: 'center', gap: 6 },
  chip: { flex: 1, borderWidth: 1.5, borderRadius: 999, paddingVertical: 6, paddingHorizontal: 8, alignItems: 'center' },
  kpiN: { fontFamily: 'monospace', fontSize: 30, fontWeight: '700' },
  total: { backgroundColor: NAVY, flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.xl, paddingTop: 14 },
  totalTxt: { color: '#c9d4e2', fontSize: 16, flex: 1 },
  totalN: { color: '#fff', fontFamily: 'monospace', fontSize: 34, fontWeight: '700' },
  resN: { fontSize: 30, width: 92, fontVariant: ['tabular-nums'] },
  tile: { flex: 1, borderRadius: 12, borderTopWidth: 5, padding: 12, gap: 2, minHeight: 92 },
  tileN: { fontFamily: 'monospace', fontSize: 22, fontWeight: '700' },
  acaoMini: { borderWidth: 1.5, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
});

