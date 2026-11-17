import AsyncStorage from '@react-native-async-storage/async-storage';
import * as DocumentPicker from 'expo-document-picker';
import { useRouter } from 'expo-router';
import { type ComponentRef, type ReactNode, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle } from 'react-native-svg';
import { useUsuarioLogado } from '../../lib/auth';
import { preferencias, usePreferencias } from '../../lib/preferencias';
import { tocar } from '../../lib/sons';
import { shareText } from '../../lib/share';
import { isSupabaseConfigured } from '../../lib/supabase';
import { dataBR, esc, imprimirHtml, rotuloFilial } from '../../lib/util';
import { ArrowRightIcon, BarcodeIcon, CaretDownIcon, FloppyDiskIcon, ClockCounterClockwiseIcon, DotsThreeVerticalIcon, EraserIcon, KeyboardIcon, PauseIcon, PencilSimpleIcon, PlayIcon, ResetIcon, TrashIcon, CaretLeftIcon, CaretRightIcon, CheckIcon, FileCsvIcon, MagnifyingGlassIcon, MinusIcon, PackageIcon, PrinterIcon, StorefrontIcon, UploadSimpleIcon } from '../../ui/icons';
import { confirmAction, EmptyState, Field, notify, Sheet } from '../../ui/kit';
import { pageMaxWidth, space, ThemeContext } from '../../ui/theme';
import {
  bateBusca, categoriasDe, categoriasDoArquivo, podeSobra, rotuloSemSaldo, normalizar, progressoPorCategoria, type ClasseContagem, type Consolidado, type Contagem, concluida, detalheContagem, type LinhaDetalhe, porCategoria, escopo, finalizarRodada, fmtQ, type Inventario, itensDaRodada, motivo, type Produto,
  percentualContagem, percentualGeral, proximoCodigo, quantidades, reabrir, relatorio, resultadoCsv, resumoRodada, type Rodada, ROTULO_CLASSE, ROTULO_RODADA,
  rodadaAtual, situacaoNaRodada, type StatusRodada, uid,
} from './model';
import {
  apagarCopiaLocal, basesCol, carregarErp, limparCopiasAntigas, salvarNoServidor, coletasDe, contagensCol, enviarResultadoErp, escolherArquivoErp, gravarBarras, idDispositivo, indiceLeitura, inventariosCol, registrarLeitura, statusErp, useColeta, useColetas, useProdutos,
} from './store';
import { lerPdfBarras } from './barras';
import { Deslizavel } from '../tempos/Deslizavel';

// Cores do design da Contagem de Estoque (cabeçalho azul-marinho, ação principal âmbar).
const NAVY = '#102a46', AMBER = '#f3a200', AMBER_TXT = '#1b2230', VERDE = '#1e9e55';

type Tela =
  | { n: 'lista' } | { n: 'abrir' } | { n: 'editarInv'; id: string } | { n: 'bases'; filial?: string } | { n: 'inventario'; id: string } | { n: 'nova'; inv: string; editar?: string }
  | { n: 'contagem'; id: string; aba: 'itens' | 'coleta' | 'detalhe'; rodada?: Rodada } | { n: 'finalizar'; id: string; rodada: Rodada } | { n: 'relatorio'; inv: string; divergentes?: boolean; contagem?: string };
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
  // Apaga do aparelho as cópias dos arquivos de inventários que não estão mais abertos.
  useEffect(() => {
    if (!dados.loaded) return;
    void limparCopiasAntigas(new Set(dados.inventarios.filter(i => i.status !== 'encerrado').map(i => i.id)));
  }, [dados.loaded]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!pronto || !dados.loaded) return <View style={{ flex: 1, backgroundColor: colors.bg }}><Topo titulo="Contagem de Estoque" onVoltar={voltar} /></View>;
  const inv = (id: string) => dados.inventarios.find(i => i.id === id);
  const cont = (id: string) => dados.contagens.find(c => c.id === id);

  switch (tela.n) {
    case 'abrir': return <AbrirInventario dados={dados} nav={nav} />;
    case 'editarInv': { const i = inv(tela.id); return i ? <EditarInventario inv={i} dados={dados} nav={nav} /> : <Sumiu nav={nav} />; }
    case 'bases': return <BasesBarras dados={dados} nav={nav} destaque={tela.filial} />;
    case 'inventario': { const i = inv(tela.id); return i ? <InventarioTela inv={i} dados={dados} nav={nav} /> : <Sumiu nav={nav} />; }
    case 'nova': { const i = inv(tela.inv), ed = tela.editar ? cont(tela.editar) : undefined; return i && (!tela.editar || ed) ? <NovaContagem key={tela.editar ?? 'nova'} inv={i} dados={dados} nav={nav} editar={ed} /> : <Sumiu nav={nav} />; }
    case 'contagem': { const c = cont(tela.id), i = c && inv(c.inventario_id); return c && i ? <ContagemTela key={c.id} c={c} inv={i} dados={dados} tela={tela} nav={nav} /> : <Sumiu nav={nav} />; }
    case 'finalizar': { const c = cont(tela.id), i = c && inv(c.inventario_id); return c && i ? <FinalizarRodada c={c} inv={i} r={tela.rodada} dados={dados} nav={nav} /> : <Sumiu nav={nav} />; }
    case 'relatorio': { const i = inv(tela.inv), ct = tela.contagem ? cont(tela.contagem) : undefined; return i && (!tela.contagem || ct) ? <Relatorio inv={i} dados={dados} nav={nav} divergentes={!!tela.divergentes} contagem={ct} /> : <Sumiu nav={nav} />; }
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

function Topo({ titulo, sub, onVoltar, direita, cor }: { titulo: string; sub?: string; onVoltar?: () => void; direita?: ReactNode; cor?: string }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[k.topo, { paddingTop: insets.top + 12 }, cor ? { backgroundColor: cor } : null]}>
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
  const usuario = useUsuarioLogado();
  const [petros, setPetros] = useState<boolean | null>(null);
  const [aba, setAba] = useState<'abertos' | 'encerrados'>('abertos');
  useEffect(() => { if (isSupabaseConfigured) void statusErp().then(r => setPetros(r.petros)).catch(() => setPetros(null)); }, []);
  const ultimaCarga = dados.inventarios.map(i => i.erp_em).filter(Boolean).sort().pop();
  const sub = `Usuário ${usuario} · ${petros ? 'Petros conectado (API)' : ultimaCarga ? `Petros carregado ${new Date(ultimaCarga).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}` : 'Petros por arquivo'}`;
  // Em aberto: uma filial por cartão (cada filial tem no máximo um inventário aberto). Encerrados: os mais recentes primeiro.
  const abertos = useMemo(() => dados.inventarios.filter(i => i.status !== 'encerrado').sort((a, b) => nomeFilial(dados, a.filial_id).localeCompare(nomeFilial(dados, b.filial_id), 'pt-BR', { numeric: true })), [dados]);
  const encerrados = useMemo(() => dados.inventarios.filter(i => i.status === 'encerrado').sort((a, b) => (b.encerrado_em ?? '').localeCompare(a.encerrado_em ?? '')), [dados.inventarios]);
  const lista = aba === 'abertos' ? abertos : encerrados;
  const reabrirSeLivre = (i: Inventario) => {
    const outro = dados.inventarios.find(x => x.filial_id === i.filial_id && x.id !== i.id && x.status !== 'encerrado');
    if (outro) { notify('Filial com inventário aberto', `${nomeFilial(dados, i.filial_id)} já tem o ${outro.codigo} aberto. Encerre-o antes de reabrir o ${i.codigo}.`); return; }
    confirmAction(`Reabrir ${i.codigo}?`, 'O inventário volta para as filiais em aberto e as contagens voltam a aceitar leituras.', 'Reabrir', () => { reabrirInventario(i); setAba('abertos'); });
  };
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Topo titulo="Inventários" sub={sub} onVoltar={nav.voltar} />
      <Corpo rodape={<Botao titulo="Abrir inventário" onPress={() => nav.ir({ n: 'abrir' })} desabilitado={!isSupabaseConfigured} />}>
        <Segmentos opcoes={[
          { id: 'abertos', titulo: 'Em aberto', sub: `${abertos.length} filia${abertos.length === 1 ? 'l' : 'is'}` },
          { id: 'encerrados', titulo: 'Encerrados', sub: `${encerrados.length} inventário${encerrados.length === 1 ? '' : 's'}` },
        ]} valor={aba} onChange={setAba} />
        {aba === 'abertos' ? (
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
        {!lista.length
          ? (aba === 'abertos'
            ? <EmptyState icon={PackageIcon} title="Nenhuma filial com inventário aberto" text="Toque em Abrir inventário: escolha a filial e carregue os saldos do Petros." />
            : <EmptyState icon={PackageIcon} title="Nenhum inventário encerrado" text="Os inventários finalizados aparecem aqui, com o relatório e a opção de reabrir." />)
          : <>
            <Text style={[k.secao, { color: c.text }]}>{aba === 'abertos' ? 'Filiais com inventário aberto' : 'Inventários encerrados'}</Text>
            <Text style={[k.cap, { color: c.textMuted }]}>{aba === 'abertos'
              ? 'Toque na filial para ver as contagens. Arraste para a direita para editar ou para a esquerda para excluir.'
              : 'Toque para ver o relatório. Arraste para a direita para reabrir ou para a esquerda para excluir.'}</Text>
            {lista.map(i => {
              const enc = i.status === 'encerrado';
              return (
                <Deslizavel key={i.id} raio={16} direita={enc ? ARRASTE_REABRIR : ARRASTE_EDITAR} esquerda={ARRASTE_EXCLUIR}
                  onDireita={() => (enc ? reabrirSeLivre(i) : nav.ir({ n: 'editarInv', id: i.id }))}
                  onEsquerda={() => excluirInventario(i, dados.contagens.filter(x => x.inventario_id === i.id))}>
                  <CartaoInventario inv={i} dados={dados} onPress={() => nav.ir(enc ? { n: 'relatorio', inv: i.id } : { n: 'inventario', id: i.id })} />
                </Deslizavel>
              );
            })}
          </>}
      </Corpo>
    </View>
  );
}

/* =====================================================================
   Ações de inventário e contagem (arrastar para o lado nas listas e menu da contagem)
   ===================================================================== */
const ARRASTE_EDITAR = { rotulo: 'Editar', cor: '#1d4ed8', icone: PencilSimpleIcon } as const;
const ARRASTE_REABRIR = { rotulo: 'Reabrir', cor: '#15803d', icone: ResetIcon } as const;
const ARRASTE_EXCLUIR = { rotulo: 'Excluir', cor: '#c0262d', icone: TrashIcon } as const;

/** Exclui a contagem e as coletas dela (em todos os aparelhos). */
function excluirContagem(ct: Contagem, depois?: () => void) {
  confirmAction(`Excluir "${ct.nome}"?`, 'A contagem e todas as coletas dela saem do inventário, em todos os aparelhos. Não dá para desfazer.', 'Excluir', () => {
    const cc = coletasDe(ct.inventario_id);
    cc.list().filter(x => x.contagem_id === ct.id).forEach(x => cc.remove(x.id));
    contagensCol.remove(ct.id);
    depois?.();
  });
}
/** Exclui o inventário com as contagens e coletas dele. */
function excluirInventario(inv: Inventario, contagens: Contagem[]) {
  confirmAction(`Excluir o inventário ${inv.codigo}?`, `O inventário, ${contagens.length} contage${contagens.length === 1 ? 'm' : 'ns'} e todas as coletas saem de todos os aparelhos. Não dá para desfazer.`, 'Excluir', () => {
    const cc = coletasDe(inv.id);
    cc.list().forEach(x => cc.remove(x.id));
    contagens.forEach(x => contagensCol.remove(x.id));
    inventariosCol.remove(inv.id);
  });
}
const reabrirInventario = (inv: Inventario) => inventariosCol.put({ ...inv, status: 'aberto', encerrado_em: null });

function CartaoInventario({ inv, dados, onPress }: { inv: Inventario; dados: Dados; onPress: () => void }) {
  const c = useCores();
  const col = useColetas(inv.id);
  const enc = inv.status === 'encerrado';
  const conts = useMemo(() => dados.contagens.filter(x => x.inventario_id === inv.id), [dados.contagens, inv.id]);
  const nCont = conts.length;
  // Progresso só das categorias das contagens abertas (não o arquivo inteiro); encerrado não carrega a lista.
  const { produtos } = useProdutos(enc ? undefined : inv);
  const prog = useMemo(() => (produtos ? percentualGeral(produtos, conts, col.list) : null), [produtos, col.list, conts]);
  return (
    <Cartao onPress={onPress}>
      <View style={k.linha}>
        <Text style={[k.cTit, { color: c.text, flex: 1 }]} numberOfLines={1}>{nomeFilial(dados, inv.filial_id)}</Text>
        <Pilula texto={inv.status === 'carregando' ? 'Carregando' : enc ? 'Encerrado' : 'Aberto'} tom={enc ? 'alerta' : inv.status === 'carregando' ? 'neutro' : 'ok'} />
      </View>
      <Text style={[k.mono, { color: c.textMuted }]}>{inv.codigo}</Text>
      <Text style={[k.cTxt, { color: c.text }]}>{inv.tipo === 'completo' ? 'Completo' : 'Parcial'} · {nCont} contage{nCont === 1 ? 'm' : 'ns'}</Text>
      <Barra pct={enc ? 1 : prog?.pct ?? 0} />
      <Text style={[k.cap, { color: c.textMuted }]}>
        {enc ? (inv.enviado_erp_em ? `Enviado ao Petros em ${dataBR(inv.enviado_erp_em)}` : `Encerrado em ${dataBR(inv.encerrado_em)}`)
          : prog ? `Geral ${Math.round(prog.pct * 100)}% · ${fmtQ(prog.contado)} de ${fmtQ(prog.sistema)} unidades do arquivo${nCont ? '' : ' · nenhuma contagem aberta'}` : 'Calculando…'}
      </Text>
    </Cartao>
  );
}

function AbrirInventario({ dados, nav }: { dados: Dados; nav: Nav }) {
  const c = useCores();
  // Padrões deste aparelho (Configurações): filial e tipo já escolhidos.
  const [filialId, setFilialId] = useState(() => { const f = preferencias().filialPadrao; return f && dados.filiais.some(x => x.id === f) ? f : ''; });
  const [tipo, setTipo] = useState<'completo' | 'parcial'>(() => preferencias().tipoPadrao);
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
      notify('Inventário não aberto', `${e instanceof Error ? e.message : ''}\n\nO inventário ficou como "carregando": abra-o para tentar carregar os saldos de novo.`);
      await inventariosCol.sync().catch(() => undefined);
    } finally { setEnviando(false); }
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Topo titulo="Abrir inventário" sub="Selecione a filial e o tipo" onVoltar={nav.voltar} />
      <Corpo rodape={<>
        <Botao titulo={enviando ? 'Carregando os saldos…' : 'Abrir inventário'} onPress={() => void abrir()} desabilitado={enviando || !filialId || !base} />
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
          <Text style={[k.cTit, { color: c.text }]}>Classificação automática (Petros)</Text>
          <Text style={[k.cTxt, { color: c.textMuted }]}>Produtos e categorias são separados pelo Petros entre Pista e Conveniência.</Text>
          <View style={k.linha}><Pilula texto="Pista" tom="alerta" /><Pilula texto="Conveniência" tom="neutro" /></View>
          <Text style={[k.cap, { color: c.textMuted }]}>Só entram itens com saldo diferente de zero na filial.</Text>
        </Cartao>
        <Rotulo>Saldos do Petros</Rotulo>
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

/** Editar inventário aberto: tipo (completo/parcial) e, se quiser, recarregar os PDFs de saldo (as coletas continuam). */
function EditarInventario({ inv, dados, nav }: { inv: Inventario; dados: Dados; nav: Nav }) {
  const c = useCores();
  const [tipo, setTipo] = useState(inv.tipo);
  const [custo, setCusto] = useState<ArquivoErp | null>(null);
  const [venda, setVenda] = useState<ArquivoErp | null>(null);
  const [salvando, setSalvando] = useState(false);
  const salvar = async () => {
    setSalvando(true);
    try {
      if (tipo !== inv.tipo) { inventariosCol.put({ ...inv, tipo }); await inventariosCol.flush(); }
      if (inv.fonte === 'arquivo' && (custo || venda)) {
        const r = await carregarErp(inv.id, 'arquivo', custo ?? undefined, venda ?? undefined);
        await inventariosCol.sync();
        notify(`${r.itens.toLocaleString('pt-BR')} itens recarregados`, ['Os saldos foram substituídos; as coletas feitas continuam valendo.', ...r.avisos].join('\n'));
      }
      nav.voltar();
    } catch (e) { notify('Inventário não alterado', e instanceof Error ? e.message : ''); } finally { setSalvando(false); }
  };
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Topo titulo={`Editar ${inv.codigo}`} sub={nomeFilial(dados, inv.filial_id)} onVoltar={nav.voltar} />
      <Corpo rodape={<>
        <Botao titulo={salvando ? 'Salvando…' : 'Salvar alterações'} onPress={() => void salvar()} desabilitado={salvando || (tipo === inv.tipo && !custo && !venda)} />
        <Botao titulo="Cancelar" tipo="s" onPress={nav.voltar} desabilitado={salvando} />
      </>}>
        <Rotulo>Tipo de inventário</Rotulo>
        <Segmentos opcoes={[{ id: 'completo', titulo: 'Completo' }, { id: 'parcial', titulo: 'Parcial' }]} valor={tipo} onChange={setTipo} />
        {inv.fonte === 'arquivo' ? <>
          <Rotulo>Recarregar saldos (opcional)</Rotulo>
          <Text style={[k.cap, { color: c.textMuted }]}>Saldo atual de {dataHora(inv.saldo_em ?? inv.erp_em)} · {inv.arquivo}{inv.arquivo_venda ? ` + ${inv.arquivo_venda}` : ''}. Escolha novos PDFs só se quiser trocar os saldos; o que já foi coletado continua.</Text>
          <ArquivosErp custo={custo} setCusto={setCusto} venda={venda} setVenda={setVenda} />
        </> : null}
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
  // Só os itens das categorias das contagens abertas (não o arquivo inteiro).
  // Percentual geral do arquivo: unidades contadas ÷ saldo de todos os itens carregados (cada contagem mostra o seu no cartão).
  const prog = useMemo(() => (produtos ? percentualGeral(produtos, contagens, col.list) : { contado: 0, sistema: 0, itens: 0, coletados: 0, pct: 0 }), [produtos, contagens, col.list]);
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
    } catch (e) { notify('Saldos não carregados', e instanceof Error ? e.message : ''); } finally { setRecarregando(false); }
  };
  const finalizarInv = () => {
    const abertas = contagens.filter(x => !concluida(x)).length;
    confirmAction('Finalizar inventário?', `${abertas ? `${abertas} contagem(ns) ainda não foram finalizadas; os itens entram com a última quantidade coletada. ` : ''}O inventário é encerrado, as coletas são salvas no servidor e a cópia do arquivo carregado (PDF de saldos) é apagada deste aparelho. O relatório fica disponível aqui e no painel web.`, 'Finalizar', () => {
      void (async () => {
        inventariosCol.put({ ...inv, status: 'encerrado', encerrado_em: new Date().toISOString() });
        const pendentes = await salvarNoServidor(inv.id);
        await apagarCopiaLocal(inv.id);
        notify(pendentes ? 'Inventário finalizado · envio pendente' : 'Inventário finalizado',
          pendentes ? `${pendentes} registro(s) ainda não chegaram ao servidor (sem internet). Eles ficam guardados no aparelho e são enviados sozinhos quando a conexão voltar.`
            : 'Todas as coletas foram salvas no servidor e a cópia do arquivo foi apagada deste aparelho.');
        nav.trocar({ n: 'relatorio', inv: inv.id });
      })();
    });
  };

  if (inv.status === 'carregando') return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Topo titulo={inv.codigo} sub={sub} onVoltar={nav.voltar} />
      <Corpo rodape={<Botao titulo={recarregando ? 'Carregando…' : inv.fonte === 'arquivo' ? 'Carregar os PDFs' : 'Carregar do Petros'} onPress={() => void recarregar()} desabilitado={recarregando || (inv.fonte === 'arquivo' && !arqCusto && !arqVenda)} />}>
        <EmptyState icon={PackageIcon} title="Saldos do Petros ainda não carregados" text="A carga dos produtos não terminou. Carregue de novo para começar as contagens." />
        {inv.fonte === 'arquivo' ? <ArquivosErp custo={arqCusto} setCusto={setArqCusto} venda={arqVenda} setVenda={setArqVenda} /> : null}
      </Corpo>
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Topo titulo={inv.codigo} sub={`${sub} · saldo ${dataHora(inv.saldo_em ?? inv.erp_em)}`} onVoltar={nav.voltar} />
      <Corpo rodape={enc
        ? <><Botao titulo="Ver relatório" onPress={() => nav.ir({ n: 'relatorio', inv: inv.id })} /><Botao titulo="Reabrir inventário" tipo="s" onPress={() => {
          const outro = dados.inventarios.find(x => x.filial_id === inv.filial_id && x.id !== inv.id && x.status !== 'encerrado');
          if (outro) { notify('Filial com inventário aberto', `${nomeFilial(dados, inv.filial_id)} já tem o ${outro.codigo} aberto. Encerre-o antes de reabrir este.`); return; }
          confirmAction('Reabrir inventário?', 'As contagens voltam a aceitar leituras.', 'Reabrir', () => reabrirInventario(inv));
        }} /></>
        : <><Botao titulo="Abrir nova contagem" onPress={() => nav.ir({ n: 'nova', inv: inv.id })} desabilitado={!produtos} /><Botao titulo="Finalizar inventário" tipo="s" onPress={finalizarInv} desabilitado={!contagens.length} /></>}>
        <Cartao style={k.linha}>
          <Anel pct={prog.pct} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={[k.cTit, { color: c.text }]}>Percentual geral do arquivo</Text>
            <Text style={[k.cTxt, { color: c.textMuted }]}>{fmtQ(prog.contado)} de {fmtQ(prog.sistema)} unidades contadas</Text>
            <Text style={[k.cap, { color: c.textMuted }]}>{prog.coletados.toLocaleString('pt-BR')} de {prog.itens.toLocaleString('pt-BR')} itens do arquivo já coletados · cada contagem mostra o próprio percentual</Text>
          </View>
        </Cartao>
        {erro ? <Text style={[k.cap, { color: c.danger }]}>{erro}</Text> : null}
        {!produtos && !erro ? <ActivityIndicator color={c.textMuted} /> : null}
        <Text style={[k.secao, { color: c.text }]}>Contagens</Text>
        {!contagens.length ? <EmptyState icon={BarcodeIcon} title="Nenhuma contagem aberta" text="Abra uma contagem por grupo de categorias (ex.: Bebidas alcoólicas) ou uma contagem completa." /> : null}
        {produtos && contagens.map(ct => {
          const q = quantidades(col.list, ct.id), itens = escopo(ct, produtos, q), pc = percentualContagem(ct, itens, q).pct, feita = concluida(ct);
          const cartao = (
            <Cartao onPress={() => nav.ir({ n: 'contagem', id: ct.id, aba: 'itens' })}>
              <Text style={[k.cTit, { color: c.text }]}>{ct.nome}</Text>
              <Text style={[k.cTxt, { color: c.textMuted }]}>{ROTULO_CLASSE[ct.classe]} · {ct.classe === 'completa' ? 'todas as categorias' : `${ct.categorias.length} categoria${ct.categorias.length === 1 ? '' : 's'}`} · {Math.round(pc * 100)}%</Text>
              <View style={[k.linha, { flexWrap: 'wrap' }]}>{ct.pausada ? <Pilula texto="Pausada" tom="alerta" /> : null}{ct.rodadas.map((r, i) => <Pilula key={i} texto={`${i + 1}ª ${ROTULO_RODADA[r]}`} tom={tomRodada(r)} />)}</View>
              {feita && !enc ? (
                <View style={k.linha}>
                  <View style={{ flex: 1 }}><Botao titulo="Reabrir contagem" tipo="s" onPress={() => contagensCol.put({ ...ct, rodadas: reabrir(ct, itens, q) })} /></View>
                  <View style={{ flex: 1 }}><Botao titulo="Ver relatório" tipo="s" onPress={() => nav.ir({ n: 'relatorio', inv: inv.id, contagem: ct.id })} /></View>
                </View>
              ) : null}
            </Cartao>
          );
          // Arrastar: direita edita (ou reabre a contagem concluída); esquerda exclui.
          return enc ? <View key={ct.id}>{cartao}</View> : (
            <Deslizavel key={ct.id} raio={16} direita={feita ? ARRASTE_REABRIR : ARRASTE_EDITAR} esquerda={ARRASTE_EXCLUIR}
              onDireita={() => (feita ? contagensCol.put({ ...ct, rodadas: reabrir(ct, itens, q) }) : nav.ir({ n: 'nova', inv: inv.id, editar: ct.id }))}
              onEsquerda={() => excluirContagem(ct)}>
              {cartao}
            </Deslizavel>
          );
        })}
        {contagens.length && !enc ? <Text style={[k.cap, { color: c.textMuted }]}>Arraste uma contagem: para a direita edita (ou reabre, se concluída); para a esquerda exclui.</Text> : null}
        {contagens.length ? (
          <Cartao onPress={() => nav.ir({ n: 'relatorio', inv: inv.id })}>
            <View style={k.linha}>
              <FileCsvIcon size={22} color={c.text} />
              <View style={{ flex: 1 }}>
                <Text style={[k.cTit, { color: c.text, fontSize: 15 }]}>Visualizar relatório geral</Text>
                <Text style={[k.cap, { color: c.textMuted }]}>Todas as contagens do inventário juntas. O relatório de uma contagem só fica no menu ⋮ dela ou em "Ver relatório".</Text>
              </View>
              <CaretRightIcon size={18} color={c.textMuted} />
            </View>
          </Cartao>
        ) : null}
        <Text style={[k.cap, { color: c.textMuted }]}>Saldo do Petros de {dataHora(inv.saldo_em ?? inv.erp_em)} · {inv.arquivo || (inv.fonte === 'petros' ? 'API Petros' : 'arquivo')}{inv.arquivo_venda ? ` + ${inv.arquivo_venda}` : ''} · {inv.itens_total.toLocaleString('pt-BR')} itens com saldo{inv.sem_barras ? ` · ${inv.sem_barras.toLocaleString('pt-BR')} sem código de barras (ler pelo código interno)` : ''}</Text>
      </Corpo>
    </View>
  );
}

/* =====================================================================
   Nova contagem
   ===================================================================== */
function NovaContagem({ inv, dados, nav, editar }: { inv: Inventario; dados: Dados; nav: Nav; editar?: Contagem }) {
  const c = useCores();
  const { produtos } = useProdutos(inv);
  const parcial = inv.tipo === 'parcial';
  const [nome, setNome] = useState(editar?.nome ?? '');
  const [classes, setClasses] = useState<(ClasseContagem)[]>(
    editar ? (editar.classe === 'mista' ? ['pista', 'conveniencia'] : [editar.classe]) : parcial ? ['conveniencia'] : ['completa']);
  const [cats, setCats] = useState<string[]>(editar?.categorias ?? []);
  const completa = classes.includes('completa');
  const [buscaCat, setBuscaCat] = useState('');
  const todasCats = useMemo(() => (produtos ? categoriasDe(produtos) : []), [produtos]);
  const lista = useMemo(() => todasCats.filter(x => classes.includes(x.classe)), [todasCats, classes]);
  // Pesquisando, procura em pista e conveniência; sem pesquisa, mostra as da classificação escolhida.
  const mostradas = useMemo(() => {
    const termo = normalizar(buscaCat.trim());
    return termo ? todasCats.filter(x => termo.split(/\s+/).every(w => normalizar(x.nome).includes(w))) : lista;
  }, [buscaCat, todasCats, lista]);
  const itens = produtos ? escopo({ classe: completa ? 'completa' : 'mista', categorias: cats }, produtos).length : 0;
  // Categorias que já têm contagem neste inventário (só aviso: dá para abrir outra com a mesma categoria) e o quanto já foi coletado de cada uma.
  const col = useColetas(inv.id);
  const progCat = useMemo(() => (produtos ? progressoPorCategoria(produtos, col.list) : new Map<string, { coletados: number; total: number; pct: number }>()), [produtos, col.list]);
  const outras = useMemo(() => dados.contagens.filter(x => x.inventario_id === inv.id && x.id !== editar?.id), [dados.contagens, inv.id, editar?.id]);
  const jaEm = useMemo(() => {
    const m = new Map<string, string[]>();
    const todas = produtos ? categoriasDe(produtos).map(x => x.nome) : [];
    outras.forEach(ct => (ct.classe === 'completa' ? todas : ct.categorias).forEach(cat => m.set(cat, [...(m.get(cat) ?? []), ct.nome])));
    return m;
  }, [outras, produtos]);
  const completasAbertas = outras.filter(x => x.classe === 'completa');
  const comContagem = lista.filter(x => jaEm.has(x.nome)).length;
  const alternarClasse = (v: ClasseContagem) => {
    if (v === 'completa') { setClasses(['completa']); return; }
    setClasses(cl => { const base = cl.filter(x => x !== 'completa'); return base.includes(v) ? (base.length > 1 ? base.filter(x => x !== v) : base) : [...base, v]; });
  };
  const criar = () => {
    if (!completa && !cats.length) { notify('Escolha as categorias'); return; }
    const classesMarcadas = [...new Set(todasCats.filter(x => cats.includes(x.nome)).map(x => x.classe))];
    const classe: ClasseContagem = completa ? 'completa' : classesMarcadas.length > 1 ? 'mista' : classesMarcadas[0] ?? (classes[0] === 'completa' ? 'mista' : classes[0]);
    if (editar) {
      // Edição no meio da contagem: mantém as rodadas e as coletas; muda nome, classificação e categorias.
      contagensCol.put({ ...editar, nome: nome.trim() || editar.nome, classe, categorias: completa ? [] : cats });
      nav.voltar();
      return;
    }
    const id = uid('cont');
    contagensCol.put({ id, inventario_id: inv.id, nome: nome.trim() || (completa ? 'Contagem completa' : cats.length === 1 ? cats[0] : `${ROTULO_CLASSE[classe]} (${cats.length} categorias)`), classe, categorias: completa ? [] : cats, rodadas: ['andamento', 'aguardando', 'aguardando'] });
    nav.trocar({ n: 'contagem', id, aba: 'coleta' });
  };
  const opcoes = (parcial ? [] : [{ id: 'completa' as ClasseContagem, titulo: 'Completa' }]).concat([{ id: 'pista', titulo: 'Pista' }, { id: 'conveniencia', titulo: 'Conveniência' }]);
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Topo titulo={editar ? 'Editar contagem' : 'Nova contagem'} sub={`${inv.codigo} · ${filialCurta(dados, inv.filial_id)} · ${parcial ? 'Parcial' : 'Completo'}`} onVoltar={nav.voltar} />
      <Corpo rodape={<>
        <Text style={[k.cap, { color: c.textMuted, textAlign: 'center' }]}>{completa ? 'Todas as categorias' : `${cats.length} categoria${cats.length === 1 ? '' : 's'} selecionada${cats.length === 1 ? '' : 's'}`} · {itens.toLocaleString('pt-BR')} itens com saldo</Text>
        <Botao titulo={editar ? 'Salvar alterações' : 'Criar contagem'} onPress={criar} desabilitado={!produtos || !itens} />
      </>}>
        <Rotulo>Nome da contagem</Rotulo>
        <Field value={nome} onChangeText={setNome} placeholder={completa ? 'Contagem completa' : 'Ex.: Bebidas alcoólicas'} />
        <Rotulo>Classificação</Rotulo>
        <Segmentos opcoes={opcoes} valor={classes} multi onChange={alternarClasse} />
        {editar ? <Text style={[k.cap, { color: c.textMuted }]}>Incluir ou tirar categorias no meio da contagem: os itens das categorias novas entram como pendentes; o que já foi coletado continua salvo.</Text> : null}
        <Text style={[k.cap, { color: c.textMuted }]}>Completa: todas as categorias do Petros. Pista e Conveniência podem ser combinadas.</Text>
        {completasAbertas.length ? <Text style={[k.cap, k.b, { color: c.warning }]}>Já existe contagem completa neste inventário: {completasAbertas.map(x => x.nome).join(', ')}. Você ainda pode abrir outra.</Text> : null}
        {!completa && (
          <View style={[k.cartao, { padding: 0, backgroundColor: c.surface, borderColor: c.border, overflow: 'hidden' }]}>
            <View style={{ padding: space.lg, borderBottomWidth: 1, borderBottomColor: c.border, gap: 2 }}>
              <Text style={[k.cTit, { color: c.text, fontSize: 15 }]}>Categorias de {classes.map(x => ROTULO_CLASSE[x]).join(' e ')}</Text>
              {comContagem ? <Text style={[k.cap, { color: c.textMuted }]}>{comContagem} de {lista.length} já têm contagem neste inventário (em amarelo). Pode marcar de novo se quiser contar outra vez.</Text> : null}
            </View>
            <View style={{ paddingHorizontal: space.lg, paddingVertical: space.md, gap: space.sm, borderBottomWidth: 1, borderBottomColor: c.border }}>
              <Field icon={MagnifyingGlassIcon} value={buscaCat} onChangeText={setBuscaCat} placeholder="Pesquisar categoria (pista e conveniência)" autoCorrect={false} />
              <View style={[k.linha, { flexWrap: 'wrap', gap: space.sm }]}>
                <Pressable accessibilityRole="button" disabled={!mostradas.length} onPress={() => setCats(cs => [...new Set([...cs, ...mostradas.map(x => x.nome)])])} style={[k.acaoMini, { borderColor: c.borderStrong }]}>
                  <Text style={[k.b, { color: c.text }]}>Marcar as {mostradas.length} mostradas</Text>
                </Pressable>
                {cats.length ? (
                  <Pressable accessibilityRole="button" onPress={() => setCats([])} style={[k.acaoMini, { borderColor: c.borderStrong }]}>
                    <Text style={[k.b, { color: c.danger }]}>Desmarcar todas</Text>
                  </Pressable>
                ) : null}
                <Text style={[k.cap, { color: c.textMuted }]}>{cats.length} marcada{cats.length === 1 ? '' : 's'}</Text>
              </View>
            </View>
            {!produtos ? <ActivityIndicator style={{ margin: 16 }} color={c.textMuted} /> : mostradas.map(cat => {
              const on = cats.includes(cat.nome);
              return (
                <Pressable key={cat.nome} accessibilityRole="checkbox" accessibilityState={{ checked: on }} onPress={() => setCats(cs => (on ? cs.filter(x => x !== cat.nome) : [...cs, cat.nome]))}
                  style={[k.opcao, { borderBottomColor: c.border, paddingHorizontal: space.lg }]}>
                  <View style={[k.check, { borderColor: on ? NAVY : c.borderStrong, backgroundColor: on ? NAVY : 'transparent' }]}>{on ? <CheckIcon size={14} color="#fff" weight="bold" /> : null}</View>
                  <View style={{ flex: 1, gap: 1 }}>
                    <Text style={[k.cTxt, { color: c.text }]} numberOfLines={1}>{cat.nome}</Text>
                    {(() => {
                      const em = jaEm.get(cat.nome), pg = progCat.get(cat.nome);
                      const pct = pg && pg.coletados ? `${Math.round(pg.pct * 100)}% coletado` : '';
                      if (em) return <Text style={[k.cap, k.b, { color: c.warning }]} numberOfLines={2}>Já em: {em.join(', ')}{pct ? ` · ${pct}` : ''}</Text>;
                      return pct ? <Text style={[k.cap, { color: c.textMuted }]}>{pct}</Text> : null;
                    })()}
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={[k.cap, { color: c.textMuted }]}>{cat.itens.toLocaleString('pt-BR')} itens</Text>
                    {buscaCat.trim() || classes.length > 1 ? <Text style={[k.cap, k.b, { color: cat.classe === 'pista' ? c.accentText : c.textMuted }]}>{cat.classe === 'pista' ? 'Pista' : 'Conveniência'}</Text> : null}
                  </View>
                </Pressable>
              );
            })}
            {produtos && !mostradas.length ? <Text style={[k.cap, { color: c.textMuted, padding: space.lg }]}>{buscaCat.trim() ? `Nenhuma categoria com "${buscaCat.trim()}".` : 'Nenhuma categoria com saldo nesta classificação.'}</Text> : null}
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
  const q = useMemo(() => quantidades(col.list, ct.id), [col.list, ct.id]);
  const itens = useMemo(() => (produtos ? escopo(ct, produtos, q) : []), [produtos, ct, q]);
  const lista = useMemo(() => itensDaRodada(r, itens, q), [r, itens, q]);
  // Percentual das categorias desta contagem (o mesmo do cartão da contagem), não do inventário inteiro.
  const prog = produtos ? percentualContagem(ct, itens, q).pct : 0;
  const ativa = ct.rodadas[r - 1] === 'andamento' && inv.status !== 'encerrado' && !ct.pausada;
  const [sel, setSel] = useState<string | null>(null);
  const [menu, setMenu] = useState(false);
  const [busca, setBusca] = useState('');
  const [corrigir, setCorrigir] = useState<Produto | null>(null);
  const simples = usePreferencias().layoutColeta === 'simples';
  const minhas = useMinhasColetas(ct, r);
  const avisoLista = (msg: string) => { setCorrigir(null); notify(msg); };
  const mudar = (p: Partial<Extract<Tela, { n: 'contagem' }>>) => nav.trocar({ ...tela, ...p });
  // Pesquisa: itens desta contagem e, abaixo, qualquer outro item da carga (inclusive os zerados da base de barras).
  const naLista = useMemo(() => new Set(lista.map(x => x.codigo)), [lista]);
  const filtrada = useMemo(() => (busca.trim() ? lista.filter(x => bateBusca(x, busca)) : lista), [lista, busca]);
  const outros = useMemo(() => (produtos && busca.trim().length >= 2 ? produtos.filter(x => !naLista.has(x.codigo) && bateBusca(x, busca)).slice(0, 40) : []), [produtos, naLista, busca]);
  const noEscopo = useMemo(() => new Set(itens.map(x => x.codigo)), [itens]);
  const catsArquivo = useMemo(() => (produtos ? categoriasDoArquivo(produtos) : new Set<string>()), [produtos]);
  const encerrado = inv.status === 'encerrado';
  const pausar = () => { contagensCol.put({ ...ct, pausada: !ct.pausada }); setMenu(false); };
  const excluir = () => { setMenu(false); excluirContagem(ct, nav.voltar); };

  const rodadas = (
    <Segmentos opcoes={ct.rodadas.map((s, i) => ({ id: String(i + 1) as '1' | '2' | '3', titulo: `Contagem ${i + 1}`, sub: ROTULO_RODADA[s] }))} valor={String(r) as '1' | '2' | '3'} onChange={v => mudar({ rodada: Number(v) as Rodada })} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Topo titulo={ct.nome} cor={tela.aba === 'coleta' && ativa && simples ? VERDE : undefined}
        sub={tela.aba === 'coleta' ? `${r}ª contagem · ${filialCurta(dados, inv.filial_id)}${ct.pausada ? ' · PAUSADA' : ''}` : `${inv.codigo} · ${filialCurta(dados, inv.filial_id)}${ct.pausada ? ' · PAUSADA' : ''}`}
        onVoltar={nav.voltar} direita={<View style={k.linha}>
        {tela.aba === 'coleta' ? <Anel pct={prog} size={46} claro /> : null}
        {!encerrado ? <Pressable accessibilityRole="button" accessibilityLabel="Opções da contagem" hitSlop={10} onPress={() => setMenu(true)} style={k.voltar}><DotsThreeVerticalIcon size={24} color="#fff" weight="bold" /></Pressable> : null}
      </View>} />
      {ct.pausada ? (
        <Pressable accessibilityRole="button" onPress={pausar} style={[k.linha, { backgroundColor: c.warningSoft, paddingHorizontal: space.lg, paddingVertical: 10 }]}>
          <PauseIcon size={18} color={c.warning} weight="fill" />
          <Text style={[k.b, { color: c.warning, flex: 1 }]}>Contagem pausada: não recebe leituras.</Text>
          <Text style={[k.b, { color: c.accentText }]}>Retomar</Text>
        </Pressable>
      ) : null}
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
              data={filtrada}
              keyExtractor={p => p.codigo}
              contentContainerStyle={k.corpo}
              initialNumToRender={14}
              windowSize={9}
              keyboardShouldPersistTaps="handled"
              ListHeaderComponent={<View style={{ gap: space.md }}>
                {rodadas}
                <Field icon={MagnifyingGlassIcon} value={busca} onChangeText={setBusca} placeholder="Pesquisar item: nome, código ou código de barras" />
                {busca.trim() ? <Text style={[k.cap, { color: c.textMuted }]}>{filtrada.length.toLocaleString('pt-BR')} de {lista.length.toLocaleString('pt-BR')} itens desta contagem</Text>
                  : ativa ? <Text style={[k.cap, { color: c.textMuted }]}>Arraste um item já coletado: para a direita corrige, para a esquerda zera.</Text> : null}
                {r > 1 ? <Cartao><Text style={[k.cTit, { color: c.text, fontSize: 15 }]}>Recontagem: {lista.length.toLocaleString('pt-BR')} itens vindos da contagem {r - 1}</Text><Text style={[k.cTxt, { color: c.textMuted }]}>{r === 2 ? 'Divergentes, saldo negativo e não coletados. Os corretos já estão fechados.' : 'Não coletados e divergências não confirmadas na 2ª. Esta contagem confirma o resultado.'}</Text></Cartao> : null}
                {ct.rodadas[r - 1] === 'aguardando' ? <Text style={[k.cap, { color: c.textMuted }]}>Esta contagem começa quando a anterior for finalizada.</Text> : null}
              </View>}
              ItemSeparatorComponent={() => <View style={{ height: space.sm }} />}
              ListEmptyComponent={busca.trim() ? <Text style={[k.cap, { color: c.textMuted }]}>Nenhum item desta contagem com "{busca.trim()}".</Text> : <EmptyState icon={CheckIcon} title="Nenhum item nesta contagem" text={r > 1 ? 'Tudo fechou na contagem anterior.' : 'Sem itens com saldo nas categorias escolhidas.'} />}
              ListFooterComponent={outros.length ? <View style={{ gap: space.sm, marginTop: space.lg }}>
                <Text style={[k.secao, { color: c.text }]}>Outros itens da carga ({outros.length}{outros.length === 40 ? '+' : ''})</Text>
                <Text style={[k.cap, { color: c.textMuted }]}>Itens fora desta lista. Os zerados no Petros (a categoria veio no arquivo, o item não) podem ser coletados e entram como sobra. Itens de categorias que não vieram no arquivo podem ter saldo no Petros e não entram.</Text>
                {outros.map(x => {
                  const pode = ativa && podeSobra(x, ct, catsArquivo);
                  const desconhecido = x.saldo === 0 && !catsArquivo.has(x.categoria);
                  const motivoFora = x.saldo === 0
                    ? (pode ? `${desconhecido ? 'Não veio no arquivo' : 'Zerado no Petros'}: toque para coletar (sobra)` : desconhecido ? 'Não veio no arquivo de saldos: pode ter saldo no Petros' : 'Zerado no Petros, mas de outra categoria (fora desta contagem)')
                    : noEscopo.has(x.codigo) ? 'Já fechado na contagem anterior' : 'De outra categoria (fora desta contagem)';
                  return (
                    <Pressable key={x.codigo} accessibilityRole={pode ? 'button' : undefined} disabled={!pode} onPress={() => { setSel(x.codigo); mudar({ aba: 'coleta' }); }}
                      style={({ pressed }) => [k.item, { backgroundColor: c.surface, borderLeftColor: x.saldo === 0 ? AMBER : c.borderStrong }, pressed && { opacity: 0.8 }]}>
                      <View style={{ flex: 1, gap: 2 }}>
                        <Text style={[k.mono, { color: c.textMuted }]} numberOfLines={1}>{x.codigo} · {x.categoria}</Text>
                        <Text style={[k.cTxt, { color: c.text, fontSize: 15 }]} numberOfLines={2}>{x.nome}</Text>
                        <Text style={[k.cap, { color: pode ? c.accentText : c.textMuted }]}>{desconhecido ? 'Saldo desconhecido' : `Saldo ${fmtQ(x.saldo)}`} · {motivoFora}</Text>
                      </View>
                      {pode ? <View style={{ justifyContent: 'center' }}><CaretRightIcon size={16} color={c.textMuted} /></View> : null}
                    </Pressable>
                  );
                })}
              </View> : undefined}
              renderItem={({ item: p }) => {
                const qq = q.get(p.codigo) ?? [null, null, null];
                const linha = <LinhaItem p={p} r={r} q={qq} onPress={ativa ? () => { setSel(p.codigo); mudar({ aba: 'coleta' }); } : undefined} />;
                const total = qq[r - 1];
                // Arrastar para a direita: corrigir a quantidade; para a esquerda: zerar o que foi coletado.
                return ativa && total !== null ? (
                  <Deslizavel raio={12} direita={ARRASTE_CORRIGIR} esquerda={{ ...ARRASTE_ZERAR, habilitada: total > 0 }}
                    onDireita={() => setCorrigir(p)} onEsquerda={() => zerarItem(ct, r, p, total, minhas(p.codigo).meu, avisoLista)}>
                    {linha}
                  </Deslizavel>
                ) : linha;
              }}
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
      {corrigir ? (() => {
        const m = minhas(corrigir.codigo);
        return <CorrigirItem ct={ct} r={r} p={corrigir} total={q.get(corrigir.codigo)?.[r - 1] ?? 0} meu={m.meu} ultima={m.ultima} onClose={() => setCorrigir(null)} onFeito={avisoLista} />;
      })() : null}
      {menu ? (
        <Sheet title={ct.nome} onClose={() => setMenu(false)}>
          <Botao titulo="Editar contagem (nome e categorias)" tipo="s" icone={PencilSimpleIcon} onPress={() => { setMenu(false); nav.ir({ n: 'nova', inv: inv.id, editar: ct.id }); }} />
          <Botao titulo={ct.pausada ? 'Retomar contagem' : 'Pausar contagem'} tipo="s" icone={ct.pausada ? PlayIcon : PauseIcon} onPress={pausar} />
          <Botao titulo="Ver relatório desta contagem" tipo="s" icone={FileCsvIcon} onPress={() => { setMenu(false); nav.ir({ n: 'relatorio', inv: inv.id, contagem: ct.id }); }} />
          <Botao titulo="Excluir contagem" tipo="s" icone={TrashIcon} onPress={excluir} />
          <Text style={[k.cap, { color: c.textMuted }]}>Pausada, a contagem não recebe leituras até ser retomada. Ao editar, dá para incluir ou tirar categorias no meio da contagem: o que já foi coletado continua valendo.</Text>
        </Sheet>
      ) : null}
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
      ListEmptyComponent={<EmptyState icon={CheckIcon} title="Sem faltas nem sobras" text="Todos os itens desta contagem bateram com o saldo do Petros." />}
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
        <Text style={[k.mono, { color: c.textMuted }]} numberOfLines={1}>{p.codigo}{m ? ` · ${m}` : ` · ${p.categoria}`}{p.saldo === 0 ? ' · zerado no Petros' : ''}</Text>
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

/* =====================================================================
   Correção da coleta de um item (arrastar para o lado na lista ou no item da coleta)
   ===================================================================== */
/** O que ESTE aparelho coletou de cada item na rodada (cada coletor grava só as próprias linhas). */
function useMinhasColetas(ct: Contagem, r: Rodada) {
  const col = useColetas(ct.inventario_id);
  const [disp, setDisp] = useState<string | null>(null);
  useEffect(() => { void idDispositivo().then(setDisp); }, []);
  return (codigo: string) => {
    const minha = disp ? col.list.find(x => x.id === `${ct.id}:${r}:${codigo}:${disp}`) : undefined;
    return { meu: minha?.qtd ?? 0, ultima: minha?.hist.find(([, n]) => n > 0) };
  };
}
/** Leva o total do item na rodada para `novo`, mexendo só no que este aparelho coletou. Devolve o erro, se houver. */
function ajustarTotal(ct: Contagem, r: Rodada, codigo: string, total: number, meu: number, novo: number): string | null {
  const delta = novo - total;
  if (meu + delta < 0) return `Este aparelho coletou ${fmtQ(meu)} e outros aparelhos ${fmtQ(total - meu)}. Por aqui o total não pode ficar abaixo de ${fmtQ(total - meu)}: corrija o restante no outro aparelho.`;
  if (delta) void registrarLeitura(ct, r, codigo, delta);
  return null;
}
/** Zerar a quantidade coletada do item na rodada (pede confirmação). */
function zerarItem(ct: Contagem, r: Rodada, p: Produto, total: number, meu: number, onFeito: (msg: string) => void) {
  confirmAction(`Zerar ${p.nome}?`, `A quantidade coletada (${fmtQ(total)}) volta a zero nesta contagem e o item fica pendente de novo.`, 'Zerar', () => {
    const erro = ajustarTotal(ct, r, p.codigo, total, meu, 0);
    if (erro) { tocar('barrado'); notify('Parte foi coletada em outro aparelho', erro); return; }
    tocar('salvo');
    onFeito(`Zerado: ${p.nome}.`);
  });
}
const ARRASTE_CORRIGIR = { rotulo: 'Corrigir', cor: '#1d4ed8', icone: PencilSimpleIcon } as const;
const ARRASTE_ZERAR = { rotulo: 'Zerar', cor: '#c0262d', icone: TrashIcon } as const;

function CorrigirItem({ ct, r, p, total, meu, ultima, onClose, onFeito }: {
  ct: Contagem; r: Rodada; p: Produto; total: number; meu: number; ultima?: [string, number]; onClose: () => void; onFeito: (msg: string) => void;
}) {
  const c = useCores();
  const [novaQtd, setNovaQtd] = useState('');
  const outros = total - meu;
  const salvar = (bruto: string) => {
    const t = bruto.trim();
    const n = Number(t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t);
    if (!t || !Number.isFinite(n) || n < 0 || n > 99999) { tocar('barrado'); notify('Quantidade inválida', 'Informe o total correto do item nesta contagem (0 para zerar).'); return; }
    const erro = ajustarTotal(ct, r, p.codigo, total, meu, n);
    if (erro) { tocar('barrado'); notify('Parte foi coletada em outro aparelho', erro); return; }
    tocar('salvo');
    onFeito(`Corrigido: ${p.nome} agora com ${fmtQ(n)}.`);
  };
  const desfazer = () => {
    if (!ultima) return;
    void registrarLeitura(ct, r, p.codigo, -ultima[1]);
    tocar('salvo');
    onFeito(`Desfeita a coleta de ${fmtQ(ultima[1])} (${ultima[0]}) de ${p.nome}.`);
  };
  return (
    <Sheet title="Corrigir coleta" onClose={onClose}>
      <Text style={[k.cTit, { color: c.text, fontSize: 17 }]}>{p.nome}</Text>
      <Text style={[k.cap, { color: c.textMuted }]}>{p.codigo} · contagem {r} · total coletado {fmtQ(total)}{outros > 0 ? ` (${fmtQ(meu)} neste aparelho, ${fmtQ(outros)} em outros)` : ''}</Text>
      {ultima ? <Botao titulo={`Desfazer a última coleta (+${fmtQ(ultima[1])} às ${ultima[0]})`} tipo="s" icone={ResetIcon} onPress={desfazer} /> : null}
      <Rotulo>Quantidade correta do item</Rotulo>
      <TextInput autoFocus value={novaQtd} onChangeText={setNovaQtd} onSubmitEditing={e => salvar(e.nativeEvent.text)} keyboardType="decimal-pad" returnKeyType="done" placeholder={fmtQ(total)} placeholderTextColor={c.textFaint}
        style={[k.codigo, { flex: 0, color: c.text, backgroundColor: c.surface, borderColor: AMBER, textAlign: 'center', fontSize: 26 }]} accessibilityLabel="Quantidade correta do item" />
      <Botao titulo="Salvar correção" icone={CheckIcon} onPress={() => salvar(novaQtd)} desabilitado={!novaQtd.trim()} />
      <Botao titulo="Zerar a quantidade coletada" tipo="s" icone={TrashIcon} onPress={() => zerarItem(ct, r, p, total, meu, onFeito)} />
    </Sheet>
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
  const teclado = usePreferencias().tecladoColeta; // teclado na tela: só em Configurações → Coleta (coletor com leitor não precisa)
  const [verHist, setVerHist] = useState(false);
  const [corrigindo, setCorrigindo] = useState(false);
  const minhas = useMinhasColetas(ct, r);
  const modo = useContext(ThemeContext).mode;
  const layoutColeta = usePreferencias().layoutColeta;
  const campo = useRef<ComponentRef<typeof TextInput>>(null);
  const campoQtd = useRef<ComponentRef<typeof TextInput>>(null);
  const indice = useMemo(() => indiceLeitura(produtos), [produtos]);
  const naRodada = useMemo(() => new Set(lista.map(p => p.codigo)), [lista]);
  const noEscopo = useMemo(() => new Set(itens.map(p => p.codigo)), [itens]);
  const col = useColetas(ct.inventario_id);
  const p = sel ? produtos.find(x => x.codigo === sel) : undefined;
  const ja = p ? q.get(p.codigo)?.[r - 1] ?? null : null;
  const hist = useMemo(() => (p ? col.list.filter(x => x.contagem_id === ct.id && x.rodada === r && x.codigo === p.codigo).flatMap(x => x.hist).sort((a, b) => b[0].localeCompare(a[0])).slice(0, 40) : []), [col.list, ct.id, r, p]);
  // Foco com nova tentativa: no Android o campo de quantidade acaba de ser montado quando o item aparece.
  const focar = (qual: 'codigo' | 'qtd') => {
    const ref = qual === 'qtd' ? campoQtd : campo;
    setTimeout(() => ref.current?.focus(), 60);
    setTimeout(() => { if (!ref.current?.isFocused()) ref.current?.focus(); }, 280);
  };
  // Item sem saldo no arquivo: só vira sobra se a categoria dele veio no arquivo (zerado no Petros) — ver podeSobra.
  const catsArquivo = useMemo(() => categoriasDoArquivo(produtos), [produtos]);
  const zerado = (x: Produto) => podeSobra(x, ct, catsArquivo);

  // Item tocado na aba "Itens": já chega identificado, pedindo a quantidade.
  useEffect(() => {
    const x = sel ? produtos.find(y => y.codigo === sel) : undefined;
    // Mesmo bip da leitura: sinaliza que o item tocado na lista está pronto para coletar.
    if (ativa && x && (naRodada.has(x.codigo) || zerado(x))) { tocar('correto'); setPendente(true); setLido(null); focar('qtd'); }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // DUN-14 (caixa): a relação de barras do Petros imprime só 13 dígitos (pula o 13º) — tenta também essa forma.
  const achar = (cod: string) => indice.get(cod) ?? indice.get(cod.replace(/^0+/, '')) ?? (/^\d{14}$/.test(cod) ? indice.get(cod.slice(0, 12) + cod.slice(13)) : undefined);

  // 1º passo: lê o código e mostra qual item é (bip). A quantidade só é pedida depois.
  const ler = (bruto: string) => {
    const cod = bruto.trim();
    setCodigo('');
    if (!cod) { focar('codigo'); return; }
    const prod = achar(cod);
    setQtd('');
    if (!prod) { tocar('barrado'); setSel(null); setPendente(false); setLido(cod); setAviso({ txt: `Código ${cod} não está na carga do Petros nem na base de códigos de barra desta filial.`, tom: 'erro' }); focar('codigo'); return; }
    setSel(prod.codigo); setLido(cod);
    if (!naRodada.has(prod.codigo) && zerado(prod)) {
      // Estoque físico de item zerado no Petros: entra na contagem como sobra.
      tocar('correto'); setPendente(true);
      setAviso({ txt: catsArquivo.has(prod.categoria) ? 'Item zerado no Petros: a quantidade entra como sobra.' : 'Item que não veio no arquivo de saldos: na contagem completa, a quantidade entra como sobra.', tom: 'erro' });
      focar('qtd');
      return;
    }
    if (!naRodada.has(prod.codigo) && prod.saldo === 0 && !catsArquivo.has(prod.categoria)) {
      // Categoria que não veio no PDF: o app não sabe o saldo (pode ter no Petros) e não conta como sobra falsa.
      tocar('barrado'); setPendente(false);
      setAviso({ txt: 'Este item não veio no arquivo de saldos carregado e pode ter saldo no Petros. Para contá-lo, recarregue os saldos com um PDF que inclua a categoria dele (Editar inventário).', tom: 'erro' });
      focar('codigo');
      return;
    }
    if (!naRodada.has(prod.codigo)) {
      tocar('barrado'); setPendente(false);
      setAviso({ txt: noEscopo.has(prod.codigo) ? 'Este item já fechou na contagem anterior: não precisa coletar.' : 'Este item está fora desta contagem (outra categoria).', tom: 'erro' });
      focar('codigo');
      return;
    }
    tocar('correto'); setPendente(true); setAviso(null); focar('qtd');
  };

  // 2º passo: salva a quantidade do item que está na tela (bip diferente).
  const registrar = (bruto: string) => {
    if (!p || !pendente) return;
    const t = bruto.trim();
    // Coletor disparado no campo de quantidade: é um código de barras, não quantidade → identifica o novo item.
    if (/^\d{8,}$/.test(t) && achar(t)) { ler(t); return; }
    const n = Number(t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t); // 1,5 ou 1.5
    if (!t || !Number.isFinite(n) || n <= 0) { tocar('barrado'); setAviso({ txt: 'Informe a quantidade contada deste item.', tom: 'erro' }); focar('qtd'); return; }
    if (n > 99999) { tocar('barrado'); setAviso({ txt: `Quantidade ${t} muito alta: confira o número digitado.`, tom: 'erro' }); setQtd(''); focar('qtd'); return; }
    const gravar = () => {
      void registrarLeitura(ct, r, p.codigo, n);
      tocar('salvo');
      setAviso({ txt: `Salvo: +${fmtQ(n)} · ${p.nome}`, tom: 'ok' });
      setPendente(false); setQtd(''); focar('codigo');
    };
    // Confirmação de quantidade grande (limite em Configurações; 0 = nunca pedir).
    const limite = preferencias().confirmarAcima;
    if (limite > 0 && n > limite) { confirmAction(`Salvar ${fmtQ(n)}?`, `${p.nome}\n\nQuantidade acima de ${fmtQ(limite)}: confira se está certa.`, 'Salvar', gravar); return; }
    gravar();
  };
  /** Borracha: limpa a tela inteira e volta para a leitura, sem item. */
  const apagar = () => { setCodigo(''); setQtd(''); setLido(null); setSel(null); setPendente(false); setAviso(null); focar('codigo'); };
  const { meu, ultima } = p ? minhas(p.codigo) : { meu: 0, ultima: undefined };
  const abrirCorrecao = () => { setPendente(false); setCorrigindo(true); };
  const feito = (msg: string) => { setCorrigindo(false); setAviso({ txt: msg, tom: 'ok' }); focar('codigo'); };

  if (!ativa) return (
    <ScrollView contentContainerStyle={k.corpo}>
      {rodadas}
      {ct.pausada
        ? <EmptyState icon={PauseIcon} title="Contagem pausada" text="Retome a contagem no menu do topo (⋮) para voltar a coletar." action={{ label: 'Retomar contagem', onPress: () => contagensCol.put({ ...ct, pausada: false }) }} />
        : <EmptyState icon={BarcodeIcon} title={`Contagem ${r} ${ROTULO_RODADA[ct.rodadas[r - 1]].toLowerCase()}`} text="Só a contagem em andamento recebe leituras. Para corrigir uma finalizada, reabra a contagem na tela do inventário." />}
    </ScrollView>
  );

  const janelas = <>
      {verHist && p ? (
        <Sheet title="Histórico de coletas do item" onClose={() => setVerHist(false)}>
          <Text style={[k.cap, { color: c.textMuted }]}>{p.codigo} · {p.nome} · contagem {r}</Text>
          {hist.length ? hist.map(([h, n], i) => (
            <View key={i} style={[k.linha, { paddingVertical: 8, borderBottomWidth: i < hist.length - 1 ? 1 : 0, borderBottomColor: c.border }]}>
              <Text style={[k.monoM, { color: c.text, flex: 1 }]}>{h}</Text>
              <Text style={[k.monoM, k.b, { color: n < 0 ? c.danger : c.text }]}>{n > 0 ? '+' : ''}{fmtQ(n)}</Text>
            </View>
          )) : <Text style={[k.cap, { color: c.textMuted }]}>Nenhuma coleta deste item nesta contagem.</Text>}
          {ja !== null ? <Botao titulo="Corrigir a coleta deste item" tipo="s" icone={PencilSimpleIcon} onPress={() => { setVerHist(false); abrirCorrecao(); }} /> : null}
        </Sheet>
      ) : null}
      {corrigindo && p ? <CorrigirItem ct={ct} r={r} p={p} total={ja ?? 0} meu={meu} ultima={ultima} onClose={() => { setCorrigindo(false); focar('codigo'); }} onFeito={feito} /> : null}
  </>;

  // Layout completo (o anterior): escolhido em Configurações → Coleta.
  if (layoutColeta === 'completo') {
  // Layout completo (compacto): leitura numa linha, cartão do item com Saldo · Coletado · Diferença e quantidade com Salvar ao lado.
  const corAviso = aviso ? (aviso.tom === 'ok' ? c.success : c.danger) : c.textMuted;
  const dif = p && ja !== null ? ja - p.saldo : null;
  const mini = (rotulo: string, valor: string, cor?: string) => (
    <View style={[k.cMini, { backgroundColor: c.bg }]}>
      <Text style={[k.cMiniRot, { color: c.textMuted }]}>{rotulo}</Text>
      <Text style={[k.cMiniVal, { color: cor ?? c.text }]} numberOfLines={1}>{valor}</Text>
    </View>
  );
  const icone = (rotulo: string, Icone: typeof CheckIcon, onPress: () => void, opc: { cor?: string; fundo?: string; ativo?: boolean } = {}) => (
    <Pressable accessibilityRole="button" accessibilityLabel={rotulo} onPress={onPress} style={({ pressed }) => [k.cIcone, { backgroundColor: opc.fundo ?? c.surface, borderColor: c.borderStrong }, pressed && { opacity: 0.75 }]}>
      <Icone size={20} color={opc.cor ?? c.text} weight={opc.ativo ? 'bold' : 'regular'} />
    </Pressable>
  );
  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={k.coleta} keyboardShouldPersistTaps="always">
        {rodadas}
        {/* Leitura: código + (buscar) + teclado + borracha, tudo numa linha */}
        <View style={[k.linha, { gap: 6 }]}>
          <TextInput ref={campo} autoFocus={!pendente} value={codigo} onChangeText={setCodigo} onSubmitEditing={e => ler(e.nativeEvent.text)} submitBehavior="submit" blurOnSubmit={false}
            placeholder={pendente ? 'Ler outro código' : 'Leia o código de barras'} placeholderTextColor={c.textFaint} autoCapitalize="none" autoCorrect={false} showSoftInputOnFocus={teclado} keyboardType="number-pad" returnKeyType="search"
            style={[k.cCodigo, { color: c.text, backgroundColor: c.surface, borderColor: pendente ? c.borderStrong : AMBER }]} accessibilityLabel="Código de barras" />
          {codigo.trim() ? icone('Buscar item', MagnifyingGlassIcon, () => ler(codigo), { fundo: AMBER, cor: AMBER_TXT, ativo: true }) : null}
          {icone('Apagar tudo e ler outro item', EraserIcon, apagar, { cor: c.danger, ativo: true })}
        </View>
        <Text style={[k.cap, { color: corAviso }]} numberOfLines={2}>{aviso?.txt ?? (pendente ? 'Confira o item e informe a quantidade.' : 'Leia o código: o item aparece aqui e depois você informa a quantidade.')}</Text>

        {/* Item identificado: arrastar para a direita corrige, para a esquerda zera */}
        {p ? (
          <Deslizavel key={p.codigo} raio={12} direita={{ ...ARRASTE_CORRIGIR, habilitada: ja !== null }} esquerda={{ ...ARRASTE_ZERAR, habilitada: !!ja }}
            onDireita={abrirCorrecao} onEsquerda={() => zerarItem(ct, r, p, ja ?? 0, meu, feito)}
            onBloqueada={() => setAviso({ txt: 'Nada coletado deste item ainda: não há o que corrigir.', tom: 'erro' })}>
            <View style={[k.cItem, { backgroundColor: c.surface, borderColor: pendente ? AMBER : c.border }]}>
              <View style={[k.linha, { gap: 10 }]}>
                <Text style={[k.mono, { color: c.textMuted, flex: 1 }]} numberOfLines={1}>Cód. <Text style={[k.b, { color: c.text }]}>{p.codigo}</Text>{lido && lido !== p.codigo ? `  ·  lido ${lido}` : ''}</Text>
                <Pressable accessibilityRole="button" accessibilityLabel="Histórico de coletas do item" hitSlop={8} onPress={() => setVerHist(true)} style={[k.linha, { gap: 3 }]}>
                  <ClockCounterClockwiseIcon size={17} color={c.accentText} />
                  <Text style={[k.cap, k.b, { color: c.accentText }]}>{hist.length}</Text>
                </Pressable>
                {ja !== null ? (
                  <Pressable accessibilityRole="button" accessibilityLabel={`Corrigir a coleta de ${p.nome} (ou arraste o item para o lado)`} hitSlop={8} onPress={abrirCorrecao}>
                    <PencilSimpleIcon size={17} color={c.accentText} />
                  </Pressable>
                ) : null}
              </View>
              <Text style={[k.cNome, { color: c.text }]} numberOfLines={2}>{p.nome}</Text>
              <Text style={[k.cap, { color: c.textMuted }]} numberOfLines={1}>{p.categoria}{p.saldo === 0 ? `  ·  ${rotuloSemSaldo(p, catsArquivo)}` : ''}</Text>
              <View style={[k.linha, { gap: 6 }]}>
                {mini('Saldo Petros', p.saldo === 0 && !catsArquivo.has(p.categoria) ? '?' : fmtQ(p.saldo))}
                {mini('Coletado', fmtQ(ja ?? 0))}
                {mini('Diferença', dif === null ? '—' : `${dif > 0 ? '+' : ''}${fmtQ(dif)}`, dif ? (dif < 0 ? c.danger : c.warning) : dif === 0 ? c.success : undefined)}
              </View>
            </View>
          </Deslizavel>
        ) : (
          <View style={[k.cVazio, { borderColor: c.border }]}>
            <BarcodeIcon size={22} color={c.textMuted} />
            <Text style={[k.cTxt, { color: c.textMuted, flex: 1 }]}>Aguardando leitura · {lista.length.toLocaleString('pt-BR')} itens nesta contagem</Text>
          </View>
        )}

        {/* Quantidade: só depois de identificar o item */}
        {pendente && p ? (
          <View style={[k.linha, { gap: 6 }]}>
            <TextInput ref={campoQtd} autoFocus value={qtd} onChangeText={setQtd} onSubmitEditing={e => registrar(e.nativeEvent.text)} submitBehavior="submit" blurOnSubmit={false}
              placeholder="Quantidade" placeholderTextColor={c.textFaint} keyboardType="decimal-pad" returnKeyType="done" selectTextOnFocus
              style={[k.cQtd, { color: c.text, backgroundColor: c.surface, borderColor: AMBER }]} accessibilityLabel={`Quantidade contada de ${p.nome}`} />
            <Pressable accessibilityRole="button" accessibilityLabel="Salvar quantidade" accessibilityState={{ disabled: !qtd.trim() }} disabled={!qtd.trim()} onPress={() => registrar(qtd)}
              style={({ pressed }) => [k.cSalvar, !qtd.trim() && { opacity: 0.45 }, pressed && { opacity: 0.85 }]}>
              <CheckIcon size={18} color={AMBER_TXT} weight="bold" />
              <Text style={[k.b, { color: AMBER_TXT, fontSize: 15 }]}>Salvar</Text>
            </Pressable>
          </View>
        ) : null}
      </ScrollView>
      {janelas}
    </View>
  );
  }

  // Layout simples e familiar: leitura → quadro amarelo do item → quantidade → últimas coletas → botões grandes embaixo.
  const corAviso = aviso ? (aviso.tom === 'ok' ? c.success : c.danger) : c.textMuted;
  const amarelo = modo === 'dark' ? '#3b3418' : '#fff4bf';
  const linhaInfo = (rotulo: string, valor: string, grande = false) => (
    <View style={k.infoLinha}>
      <Text style={[k.infoRot, { color: c.textMuted }]}>{rotulo}</Text>
      <Text style={[grande ? k.infoValG : k.infoVal, { color: c.text }]} numberOfLines={grande ? 3 : 1}>{valor}</Text>
    </View>
  );
  // Últimas coletas com o total antes e depois de cada uma (da mais recente para a mais antiga).
  const ultimas = (() => {
    let total = ja ?? 0;
    return hist.slice(0, 5).map(([hora, n]) => { const linha = { hora, antes: total - n, n, total }; total -= n; return linha; });
  })();
  const temQtd = !!qtd.trim() && pendente;
  const botao = (rotulo: string, Icone: typeof CheckIcon, onPress: () => void, opc: { fundo?: string; cor?: string; desab?: boolean; destaque?: boolean } = {}) => (
    <Pressable accessibilityRole="button" accessibilityLabel={rotulo} accessibilityState={{ disabled: !!opc.desab }} disabled={opc.desab} onPress={onPress} style={k.acao}>
      {({ pressed }) => <>
        <View style={[k.acaoBola, { backgroundColor: opc.fundo ?? c.surface, borderColor: opc.destaque ? AMBER : c.borderStrong }, opc.desab && { opacity: 0.35 }, pressed && { transform: [{ scale: 0.94 }] }]}>
          <Icone size={24} color={opc.cor ?? c.text} weight={opc.destaque ? 'fill' : 'regular'} />
        </View>
        <Text style={[k.acaoTxt, { color: opc.desab ? c.textFaint : c.text }]}>{rotulo}</Text>
      </>}
    </Pressable>
  );
  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={k.coleta} keyboardShouldPersistTaps="always">
        {/* Leitura do código */}
        <View style={[k.leitura, { backgroundColor: c.surface, borderColor: pendente ? c.borderStrong : VERDE }]}>
          <TextInput ref={campo} autoFocus={!pendente} value={codigo} onChangeText={setCodigo} onSubmitEditing={e => ler(e.nativeEvent.text)} submitBehavior="submit" blurOnSubmit={false}
            placeholder="Código de barras" placeholderTextColor={c.textFaint} autoCapitalize="none" autoCorrect={false} showSoftInputOnFocus={teclado} keyboardType="number-pad" returnKeyType="search"
            style={[k.leituraCampo, { color: c.text }]} accessibilityLabel="Código de barras" />
          <Pressable accessibilityRole="button" accessibilityLabel="Buscar o item deste código" onPress={() => ler(codigo)} style={({ pressed }) => [k.leituraIr, pressed && { opacity: 0.8 }]}>
            <ArrowRightIcon size={26} color="#fff" weight="bold" />
          </Pressable>
        </View>
        {aviso ? <Text style={[k.avisoG, { color: corAviso }]} numberOfLines={3}>{aviso.txt}</Text> : null}

        {/* Quadro do item (sempre visível; vazio até ler um código). Arrastar para o lado também corrige/zera. */}
        <Deslizavel key={p?.codigo ?? 'vazio'} raio={12} direita={{ ...ARRASTE_CORRIGIR, habilitada: !!p && ja !== null }} esquerda={{ ...ARRASTE_ZERAR, habilitada: !!p && !!ja }}
          onDireita={abrirCorrecao} onEsquerda={() => { if (p) zerarItem(ct, r, p, ja ?? 0, meu, feito); }} onBloqueada={() => undefined}>
          <View style={[k.info, { backgroundColor: amarelo, borderColor: pendente ? AMBER : 'transparent' }]}>
            {linhaInfo('Categoria', p?.categoria ?? '')}
            {linhaInfo('Produto', p?.nome ?? '', true)}
            {linhaInfo('Código', p ? `${p.codigo}${lido && lido !== p.codigo ? `   (lido ${lido})` : ''}` : '')}
            {linhaInfo('Saldo no sistema', p ? (p.saldo === 0 && !catsArquivo.has(p.categoria) ? 'desconhecido (não veio no arquivo)' : `${fmtQ(p.saldo)}${p.saldo === 0 ? '  (zerado no Petros)' : ''}`) : '')}
            {linhaInfo('Já coletado', p ? fmtQ(ja ?? 0) : '')}
          </View>
        </Deslizavel>

        {/* Quantidade */}
        <Text style={[k.infoRot, { color: c.text, marginTop: 4 }]}>Quantidade</Text>
        {pendente && p ? (
          <TextInput ref={campoQtd} autoFocus value={qtd} onChangeText={setQtd} onSubmitEditing={e => registrar(e.nativeEvent.text)} submitBehavior="submit" blurOnSubmit={false}
            placeholder="Digite a quantidade" placeholderTextColor={c.textFaint} keyboardType="decimal-pad" returnKeyType="done" selectTextOnFocus
            style={[k.qtdG, { color: c.text, backgroundColor: c.surface, borderColor: AMBER }]} accessibilityLabel={`Quantidade contada de ${p.nome}`} />
        ) : (
          <View style={[k.qtdG, { backgroundColor: c.surface, borderColor: c.border, justifyContent: 'center' }]}>
            <Text style={[k.cap, { color: c.textFaint, textAlign: 'center', fontSize: 16 }]}>{p ? 'Leia o código de novo para somar' : 'Leia o código primeiro'}</Text>
          </View>
        )}

        {/* Últimas coletas deste item */}
        {p ? (
          <View style={{ marginTop: 6 }}>
            <Text style={[k.infoRot, { color: c.text }]}>Últimas coletas deste item</Text>
            <View style={[k.tabLinha, { borderBottomColor: c.borderStrong }]}>
              {['Hora', 'Antes', 'Adicionou', 'Total'].map((t, i) => <Text key={t} style={[k.tabCab, { color: c.textMuted, textAlign: i ? 'right' : 'left' }]}>{t}</Text>)}
            </View>
            {ultimas.length ? ultimas.map((u, i) => (
              <View key={i} style={[k.tabLinha, { borderBottomColor: c.border }]}>
                <Text style={[k.tabCel, { color: c.text }]}>{u.hora.slice(0, 5)}</Text>
                <Text style={[k.tabCel, { color: c.text, textAlign: 'right' }]}>{fmtQ(u.antes)}</Text>
                <Text style={[k.tabCel, { color: u.n < 0 ? c.danger : c.text, textAlign: 'right' }]}>{u.n > 0 ? '+' : ''}{fmtQ(u.n)}</Text>
                <Text style={[k.tabCel, k.b, { color: c.text, textAlign: 'right' }]}>{fmtQ(u.total)}</Text>
              </View>
            )) : <Text style={[k.cap, { color: c.textMuted, paddingVertical: 8 }]}>Nenhuma coleta deste item ainda.</Text>}
          </View>
        ) : null}
      </ScrollView>

      {/* Botões grandes, com nome */}
      <View style={[k.acoes, { backgroundColor: c.surface, borderTopColor: c.border, paddingBottom: Math.max(insets.bottom, 10) }]}>
        {botao('Apagar', EraserIcon, apagar, { cor: c.danger })}
        {botao('Salvar', FloppyDiskIcon, () => registrar(qtd), { fundo: temQtd ? AMBER : undefined, cor: temQtd ? AMBER_TXT : undefined, desab: !temQtd, destaque: temQtd })}
        {botao('Corrigir', PencilSimpleIcon, abrirCorrecao, { desab: !p || ja === null })}
      </View>
      {janelas}
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
  const q = useMemo(() => quantidades(col.list, ct.id), [col.list, ct.id]);
  const itens = useMemo(() => (produtos ? escopo(ct, produtos, q) : []), [produtos, ct, q]);
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
function Relatorio({ inv, dados, nav, divergentes, contagem: soDela }: { inv: Inventario; dados: Dados; nav: Nav; divergentes: boolean; contagem?: Contagem }) {
  const c = useCores();
  const usuario = useUsuarioLogado();
  const { produtos } = useProdutos(inv);
  const col = useColetas(inv.id);
  const [enviando, setEnviando] = useState(false);
  const [petros, setPetros] = useState(false);
  useEffect(() => { void statusErp().then(r => setPetros(r.petros)).catch(() => undefined); }, []);
  // Relatório de uma contagem só (mesmo layout, só os itens dela) ou geral (todas as contagens).
  const contagens = useMemo(() => dados.contagens.filter(x => x.inventario_id === inv.id && (!soDela || x.id === soDela.id)), [dados.contagens, inv.id, soDela]);
  const rel = useMemo(() => (produtos ? relatorio(produtos, contagens, col.list) : null), [produtos, contagens, col.list]);
  const enc = inv.status === 'encerrado';
  const filial = nomeFilial(dados, inv.filial_id);
  const problemas = rel ? rel.linhas.filter(l => l.status !== 'correto') : [];

  const exportar = async () => {
    if (!rel) return;
    await shareText(`resultado_${inv.codigo}.csv`, resultadoCsv(inv, rel.linhas), 'text/csv;charset=utf-8');
    if (enc && !soDela && !inv.enviado_erp_em) inventariosCol.put({ ...inv, enviado_erp_em: new Date().toISOString() });
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
    const geral = !soDela && produtos ? percentualGeral(produtos, contagens, col.list) : null;
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
      metrica(soDela ? 'Percentual da contagem (acurácia)' : 'Percentual contado (acurácia)', pct(t.acuracia)), metrica('Eficiência', pct(t.eficiencia)),
      ...(geral ? [metrica('Percentual geral do arquivo', `${fmtQ(Math.round(geral.pct * 1000) / 10)}%`), metrica('Itens do arquivo coletados', `${geral.coletados.toLocaleString('pt-BR')} de ${geral.itens.toLocaleString('pt-BR')}`)] : []),
      metrica('Itens corretos', rel.corretos.toLocaleString('pt-BR')), metrica('Itens divergentes', rel.divergentes.toLocaleString('pt-BR')), metrica('Não encontrados', rel.naoEncontrados.toLocaleString('pt-BR')),
    ].join('');
    const linhaCat = (x: Consolidado, tot = false) => `<tr${tot ? ' class="tot"' : ''}><td>${esc(x.nome)}</td><td class="n">${n(x.itens)}</td><td class="n">${n(x.sistema)}</td><td class="n">${n(x.contagem)}</td><td class="n">${n(x.faltas)}</td><td class="n">${n(x.sobras)}</td><td class="n${cor(x.resultado)}">${sinal(x.resultado)}</td><td class="n">${rs(x.custo.faltas, x.temCusto)}</td><td class="n">${rs(x.custo.sobras, x.temCusto)}</td><td class="n${cor(x.custo.resultado)}">${rs(x.custo.resultado, x.temCusto)}</td><td class="n">${rs(x.venda.faltas, x.temVenda)}</td><td class="n">${rs(x.venda.sobras, x.temVenda)}</td><td class="n${cor(x.venda.resultado)}">${rs(x.venda.resultado, x.temVenda)}</td><td class="n">${pct(x.acuracia)}</td><td class="n">${pct(x.eficiencia)}</td></tr>`;
    const categorias = cons.categorias.map(x => linhaCat(x)).join('') + linhaCat(t, true);
    // Detalhamento: faltas e sobras por categoria (maiores diferenças primeiro).
    const porCat = new Map<string, typeof problemas>();
    problemas.forEach(l => { const g = porCat.get(l.produto.categoria) ?? []; g.push(l); porCat.set(l.produto.categoria, g); });
    const detalhe = [...porCat.entries()].sort((a, b) => a[0].localeCompare(b[0], 'pt-BR')).map(([cat, g]) => `<tr class="grp"><td colspan="9">${esc(cat)}</td></tr>` + g.sort((a, b) => a.diferenca - b.diferenca).map(l =>
      `<tr><td>${esc(l.produto.codigo)}</td><td>${esc(l.produto.nome)}</td><td class="n">${n(l.produto.saldo)}</td><td class="n">${n(l.qtd)}</td><td class="n${cor(l.diferenca)}"><b>${sinal(l.diferenca)}</b></td><td class="n">${l.difCusto === null ? '—' : brl(l.difCusto)}</td><td class="n">${l.difVenda === null ? '—' : brl(l.difVenda)}</td><td>${l.status === 'divergente' ? (l.diferenca < 0 ? 'Falta' : 'Sobra') : 'Não encontrado'}</td><td>${esc(l.contagem)}</td></tr>`).join('')).join('');
    const contagensTab = rel.porContagem.map(p => `<tr><td>${esc(p.contagem.nome)}</td><td class="n">${p.itens}</td><td class="n">${n(p.sistema)}</td><td class="n">${n(p.contado)}</td><td class="n"><b>${fmtQ(Math.round(p.pct * 1000) / 10)}%</b></td><td class="n">${p.corretos}</td><td class="n">${p.divergentes}</td><td class="n">${p.naoEncontrados}</td></tr>`).join('');
    const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Inventário ${esc(inv.codigo)}</title><style>
@page{size:A4 landscape;margin:10mm}body{font:10px Arial,sans-serif;color:#1b2230;margin:0}h1{font-size:17px;margin:0 0 2px;color:${NAVY}}.sub{color:#5b6475;margin-bottom:8px}
h2{font-size:12px;margin:12px 0 5px;color:${NAVY}}.grid{display:grid;grid-template-columns:repeat(8,1fr);gap:5px}.m{background:#f2f4f7;border-radius:5px;padding:5px 6px}.m span{display:block;color:#5b6475;font-size:9px}.m b{font-size:13px;font-variant-numeric:tabular-nums}
table{width:100%;border-collapse:collapse}th{background:${NAVY};color:#fff;text-align:left;padding:3px 4px;font-size:9px}td{border-bottom:1px solid #e3e6ec;padding:2px 4px}.n{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
.neg{color:#c0262d}.pos{color:#a86400}.tot td{font-weight:700;background:#eef1f6;border-top:2px solid ${NAVY}}.grp td{background:#e8edf5;font-weight:700;color:${NAVY}}tr{page-break-inside:avoid}
</style></head><body>
<h1>${soDela ? `Relatório da contagem ${esc(soDela.nome)}` : 'Relatório do inventário'} · ${esc(inv.codigo)}</h1>
<div class="sub">${esc(filial)} · ${inv.tipo === 'completo' ? 'Completo' : 'Parcial'} · Saldo do Petros de ${dataHora(inv.saldo_em ?? inv.erp_em)} · ${enc ? `Finalizado em ${dataBR(inv.encerrado_em)}` : 'Em andamento (parcial)'} · Emitido em ${new Date().toLocaleString('pt-BR')}${usuario ? ` · Responsável: ${esc(usuario)}` : ''}</div>
<h2>Resumo</h2><div class="grid">${resumo}</div>
<h2>Resultado por categoria</h2><table><tr><th>Categoria</th><th class="n">Itens</th><th class="n">Sistema</th><th class="n">Contagem</th><th class="n">Falta</th><th class="n">Sobra</th><th class="n">Resultado</th><th class="n">Falta R$ custo</th><th class="n">Sobra R$ custo</th><th class="n">Result. R$ custo</th><th class="n">Falta R$ venda</th><th class="n">Sobra R$ venda</th><th class="n">Result. R$ venda</th><th class="n">Acurácia</th><th class="n">Eficiência</th></tr>${categorias}</table>
<h2>${soDela ? 'Resultado da contagem' : 'Resultado por contagem'}</h2><table><tr><th>Contagem</th><th class="n">Itens</th><th class="n">Sistema</th><th class="n">Contado</th><th class="n">Percentual</th><th class="n">Corretos</th><th class="n">Divergentes</th><th class="n">Não encontrados</th></tr>${contagensTab}</table>
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
      <Topo titulo={soDela ? `Relatório · ${soDela.nome}` : 'Relatório geral do inventário'} sub={`${inv.codigo} · ${filialCurta(dados, inv.filial_id)} · ${soDela ? 'só esta contagem' : enc ? 'Finalizado' : 'Parcial'}`} onVoltar={nav.voltar} />
      <Corpo rodape={<>
        <Botao titulo={divergentes ? 'Ocultar itens divergentes' : 'Ver itens divergentes'} onPress={() => nav.trocar({ n: 'relatorio', inv: inv.id, divergentes: !divergentes, contagem: soDela?.id })} desabilitado={!rel} />
        <Botao titulo="Voltar ao início" tipo="s" onPress={nav.inicio} />
      </>}>
        {!rel ? <ActivityIndicator color={c.textMuted} /> : <>
          <View style={k.linha}>
            {tile(rel.corretos, 'Corretos', [c.successSoft, c.success])}
            {tile(rel.divergentes, 'Divergentes', [c.dangerSoft, c.danger])}
            {tile(rel.naoEncontrados, 'Não encontrados', [c.accentSoft, c.accent])}
          </View>
          {(() => {
            const t = porCategoria(rel.linhas).total;
            const geralTela = !soDela && produtos ? percentualGeral(produtos, contagens, col.list) : null;
            return (
              <Cartao>
                <View style={k.linha}>
                  <View style={{ flex: 1 }}>
                    <Text style={[k.cap, { color: c.textMuted }]}>{soDela ? 'Percentual da contagem' : 'Percentual contado'} (contado ÷ sistema)</Text>
                    <Text style={[k.monoM, k.b, { color: c.text, fontSize: 22 }]}>{t.acuracia === null ? '—' : `${fmtQ(t.acuracia)}%`}</Text>
                    <Text style={[k.cap, { color: c.textMuted }]}>{fmtQ(t.contagem)} de {fmtQ(t.sistema)} unidades</Text>
                  </View>
                  {geralTela ? (
                    <View style={{ flex: 1 }}>
                      <Text style={[k.cap, { color: c.textMuted }]}>Percentual geral do arquivo</Text>
                      <Text style={[k.monoM, k.b, { color: c.text, fontSize: 22 }]}>{fmtQ(Math.round(geralTela.pct * 1000) / 10)}%</Text>
                      <Text style={[k.cap, { color: c.textMuted }]}>{geralTela.coletados.toLocaleString('pt-BR')} de {geralTela.itens.toLocaleString('pt-BR')} itens coletados</Text>
                    </View>
                  ) : null}
                </View>
              </Cartao>
            );
          })()}
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
              <Text style={[k.cTit, { color: c.text }]}>{soDela ? 'Resultado da contagem' : 'Resultado por contagem'}</Text>
              {rel.porContagem.map((p, i) => (
                <View key={p.contagem.id} style={[k.linha, { alignItems: 'flex-start', paddingVertical: 10, borderTopWidth: i ? 1 : 0, borderTopColor: c.border }]}>
                  <View style={{ flex: 1 }}><Text style={[k.cTit, { color: c.text, fontSize: 16 }]}>{p.contagem.nome}</Text><Text style={[k.cap, { color: c.textMuted }]}>{p.itens.toLocaleString('pt-BR')} itens · {fmtQ(p.contado)} de {fmtQ(p.sistema)} unidades</Text><Text style={[k.monoM, k.b, { color: c.text }]}>{fmtQ(Math.round(p.pct * 1000) / 10)}% contado</Text></View>
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
            <Text style={[k.cTxt, { color: c.textMuted }]}>Este relatório fica disponível no dashboard e aqui no app.{inv.enviado_erp_em ? ` Resultado enviado ao Petros em ${dataBR(inv.enviado_erp_em)}.` : ''}</Text>
            <View style={[k.linha, { flexWrap: 'wrap' }]}>
              <Pressable accessibilityRole="button" onPress={() => void imprimir()} style={[k.linha, k.acaoMini, { borderColor: c.borderStrong }]}><PrinterIcon size={16} color={c.text} /><Text style={[k.b, { color: c.text }]}>PDF</Text></Pressable>
              <Pressable accessibilityRole="button" onPress={() => void exportar()} style={[k.linha, k.acaoMini, { borderColor: c.borderStrong }]}><FileCsvIcon size={16} color={c.text} /><Text style={[k.b, { color: c.text }]}>Arquivo para o Petros</Text></Pressable>
              {petros && enc && !soDela ? <Pressable accessibilityRole="button" disabled={enviando} onPress={() => void enviar()} style={[k.linha, k.acaoMini, { borderColor: c.borderStrong }]}><UploadSimpleIcon size={16} color={c.text} /><Text style={[k.b, { color: c.text }]}>{enviando ? 'Enviando…' : 'Enviar ao Petros'}</Text></Pressable> : null}
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
  corrigir: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1.5, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6 },
  caixa: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center', alignSelf: 'center' },
  codigo: { flex: 1, minHeight: 54, borderWidth: 2, borderRadius: 12, paddingHorizontal: 14, fontSize: 19, fontFamily: 'monospace' },
  kpi: { flex: 1, borderRadius: 10, padding: 12, gap: 2 },
  coleta: { padding: space.md, gap: space.sm, width: '100%', maxWidth: 720, alignSelf: 'center' },
  cCodigo: { flex: 1, minHeight: 46, borderWidth: 2, borderRadius: 10, paddingHorizontal: 12, fontSize: 17, fontFamily: 'monospace' },
  cIcone: { width: 46, height: 46, borderRadius: 10, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  cItem: { borderWidth: 2, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, gap: 4 },
  cNome: { fontSize: 16, fontWeight: '800', lineHeight: 21 },
  cMini: { flex: 1, borderRadius: 8, paddingVertical: 6, paddingHorizontal: 8, gap: 1 },
  cMiniRot: { fontSize: 11, fontWeight: '700' },
  cMiniVal: { fontSize: 18, fontWeight: '800', fontFamily: 'monospace' },
  cVazio: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderStyle: 'dashed', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 14 },
  cQtd: { flex: 1, minHeight: 48, borderWidth: 2, borderRadius: 10, paddingHorizontal: 12, fontSize: 22, fontWeight: '800', textAlign: 'center' },
  cSalvar: { minHeight: 48, paddingHorizontal: 16, borderRadius: 10, backgroundColor: AMBER, flexDirection: 'row', alignItems: 'center', gap: 6 },
  leitura: { flexDirection: 'row', alignItems: 'center', borderWidth: 2, borderRadius: 12, overflow: 'hidden' },
  leituraCampo: { flex: 1, minHeight: 58, paddingHorizontal: 14, fontSize: 22, textAlign: 'center', fontFamily: 'monospace' },
  leituraIr: { width: 64, alignSelf: 'stretch', backgroundColor: VERDE, alignItems: 'center', justifyContent: 'center' },
  avisoG: { fontSize: 16, fontWeight: '700', textAlign: 'center' },
  info: { borderRadius: 12, borderWidth: 2, paddingHorizontal: 14, paddingVertical: 10, gap: 4 },
  infoLinha: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  infoRot: { fontSize: 15, fontWeight: '700' },
  infoVal: { flex: 1, fontSize: 18, fontWeight: '600' },
  infoValG: { flex: 1, fontSize: 20, fontWeight: '800' },
  qtdG: { minHeight: 64, borderWidth: 2, borderRadius: 12, paddingHorizontal: 14, fontSize: 30, fontWeight: '800', textAlign: 'center' },
  tabLinha: { flexDirection: 'row', paddingVertical: 6, borderBottomWidth: 1 },
  tabCab: { flex: 1, fontSize: 14, fontWeight: '700' },
  tabCel: { flex: 1, fontSize: 16, fontFamily: 'monospace' },
  acoes: { flexDirection: 'row', justifyContent: 'space-around', paddingTop: 8, borderTopWidth: 1 },
  acao: { alignItems: 'center', gap: 3, minWidth: 64 },
  acaoBola: { width: 50, height: 50, borderRadius: 25, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  acaoTxt: { fontSize: 13, fontWeight: '700' },
  icone: { width: 54, height: 54, borderRadius: 12, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  itemCol: { borderWidth: 2, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10, gap: 4 },
  salvar: { minHeight: 54, paddingHorizontal: 18, borderRadius: 12, backgroundColor: AMBER, flexDirection: 'row', alignItems: 'center', gap: 6 },
  chip: { flex: 1, borderWidth: 1.5, borderRadius: 999, paddingVertical: 4, paddingHorizontal: 8, alignItems: 'center' },
  kpiN: { fontFamily: 'monospace', fontSize: 30, fontWeight: '700' },
  total: { backgroundColor: NAVY, flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.xl, paddingTop: 14 },
  totalTxt: { color: '#c9d4e2', fontSize: 16, flex: 1 },
  totalN: { color: '#fff', fontFamily: 'monospace', fontSize: 34, fontWeight: '700' },
  resN: { fontSize: 30, width: 92, fontVariant: ['tabular-nums'] },
  tile: { flex: 1, borderRadius: 12, borderTopWidth: 5, padding: 12, gap: 2, minHeight: 92 },
  tileN: { fontFamily: 'monospace', fontSize: 22, fontWeight: '700' },
  acaoMini: { borderWidth: 1.5, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
});

