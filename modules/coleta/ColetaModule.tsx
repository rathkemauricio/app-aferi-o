import AsyncStorage from '@react-native-async-storage/async-storage';
import * as DocumentPicker from 'expo-document-picker';
import { useRouter } from 'expo-router';
import { type ComponentRef, type ReactNode, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle } from 'react-native-svg';
import { useAuth } from '../../lib/auth';
import { shareText } from '../../lib/share';
import { isSupabaseConfigured } from '../../lib/supabase';
import { dataBR, esc, imprimirHtml, rotuloFilial } from '../../lib/util';
import { BarcodeIcon, CaretDownIcon, CaretLeftIcon, CaretRightIcon, CheckIcon, FileCsvIcon, MagnifyingGlassIcon, MinusIcon, PackageIcon, PrinterIcon, StorefrontIcon, UploadSimpleIcon } from '../../ui/icons';
import { confirmAction, EmptyState, Field, notify, Sheet } from '../../ui/kit';
import { pageMaxWidth, space, ThemeContext } from '../../ui/theme';
import {
  categoriasDe, type ClasseContagem, type Contagem, concluida, escopo, finalizarRodada, fmtQ, type Inventario, itensDaRodada, motivo, type Produto,
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
  | { n: 'contagem'; id: string; aba: 'itens' | 'coleta'; rodada?: Rodada } | { n: 'finalizar'; id: string; rodada: Rodada } | { n: 'relatorio'; inv: string; divergentes?: boolean };
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
  const [arquivo, setArquivo] = useState<{ nome: string; base64: string } | null>(null);
  const [enviando, setEnviando] = useState(false);
  useEffect(() => { void statusErp().then(r => { setPetros(r.petros); if (r.petros) setFonte('petros'); }).catch(() => undefined); }, []);
  const aberto = dados.inventarios.find(i => i.filial_id === filialId && i.status !== 'encerrado');
  const base = filialId ? dados.bases.get(filialId) : undefined;
  const filtradas = dados.filiais.filter(f => `${f.codigo} ${f.nome} ${f.cidade}`.toLowerCase().includes(busca.toLowerCase()));

  const pegarArquivo = async () => { try { const a = await escolherArquivoErp(); if (a) setArquivo(a); } catch (e) { notify('Arquivo não lido', e instanceof Error ? e.message : ''); } };
  const abrir = async () => {
    if (!filialId) { notify('Escolha a filial'); return; }
    if (aberto) { notify('Filial com inventário aberto', `${aberto.codigo} ainda está aberto nesta filial. Encerre-o antes de abrir outro.`); return; }
    if (!base) { notify('Base de códigos de barra pendente', 'Importe a relação de códigos de barra desta filial antes de abrir o inventário.'); return; }
    if (fonte === 'arquivo' && !arquivo) { notify('Escolha o arquivo do ERP', 'Use o relatório de saldos exportado pelo Petros (PDF) ou um CSV.'); return; }
    setEnviando(true);
    const id = uid('inv');
    try {
      inventariosCol.put({ id, codigo: proximoCodigo(dados.inventarios.map(i => i.codigo)), filial_id: filialId, tipo, status: 'carregando', fonte, arquivo: arquivo?.nome ?? '', itens_total: 0, erp_em: null, encerrado_em: null, enviado_erp_em: null });
      await inventariosCol.flush();
      const r = await carregarErp(id, fonte, arquivo ?? undefined);
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
        {fonte === 'arquivo' ? (
          <Cartao onPress={() => void pegarArquivo()}>
            <View style={k.linha}>
              <UploadSimpleIcon size={22} color={c.text} />
              <View style={{ flex: 1 }}>
                <Text style={[k.cTit, { color: c.text, fontSize: 15 }]} numberOfLines={1}>{arquivo ? arquivo.nome : 'Escolher arquivo do ERP'}</Text>
                <Text style={[k.cap, { color: c.textMuted }]}>{arquivo ? 'Toque para trocar' : 'PDF de saldos da filial no momento da abertura (Petros)'}</Text>
              </View>
              {arquivo ? <CheckIcon size={18} color={c.success} weight="bold" /> : null}
            </View>
          </Cartao>
        ) : null}
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

  const recarregar = async () => {
    try {
      const a = inv.fonte === 'arquivo' ? await escolherArquivoErp() : null;
      if (inv.fonte === 'arquivo' && !a) return;
      setRecarregando(true);
      await carregarErp(inv.id, inv.fonte, a ?? undefined);
      await inventariosCol.sync();
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
      <Corpo rodape={<Botao titulo={recarregando ? 'Carregando…' : inv.fonte === 'arquivo' ? 'Escolher arquivo e carregar' : 'Carregar do Petros'} onPress={() => void recarregar()} desabilitado={recarregando} />}>
        <EmptyState icon={PackageIcon} title="Saldos do ERP ainda não carregados" text="A carga dos produtos não terminou. Carregue de novo para começar as contagens." />
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
        <Text style={[k.cap, { color: c.textMuted }]}>Saldo do ERP de {dataHora(inv.saldo_em ?? inv.erp_em)} · {inv.arquivo || (inv.fonte === 'petros' ? 'API Petros' : 'arquivo')} · {inv.itens_total.toLocaleString('pt-BR')} itens com saldo{inv.sem_barras ? ` · ${inv.sem_barras.toLocaleString('pt-BR')} sem código de barras (ler pelo código interno)` : ''}</Text>
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
        {(['itens', 'coleta'] as const).map(a => (
          <Pressable key={a} accessibilityRole="tab" accessibilityState={{ selected: tela.aba === a }} onPress={() => mudar({ aba: a })} style={[k.aba, tela.aba === a && { borderBottomColor: AMBER }]}>
            <Text style={[k.abaTxt, { color: tela.aba === a ? c.text : c.textMuted }]}>{a === 'itens' ? 'Itens' : 'Coleta'}</Text>
          </Pressable>
        ))}
      </View>
      {!produtos ? <ActivityIndicator style={{ marginTop: 40 }} color={c.textMuted} />
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
          <Coleta ct={ct} r={r} ativa={ativa} produtos={produtos} itens={itens} lista={lista} q={q} sel={sel} setSel={setSel} rodadas={rodadas} />
        )}
    </View>
  );
}

function LinhaItem({ p, r, q, onPress }: { p: Produto; r: Rodada; q: [number | null, number | null, number | null]; onPress?: () => void }) {
  const c = useCores();
  const s = situacaoNaRodada(p, r, q);
  const cor = s === 'correto' ? [c.successSoft, c.success] : s === 'divergente' ? [c.dangerSoft, c.danger] : [c.accentSoft, c.accent];
  const m = motivo(p, r, q);
  return (
    <Pressable accessibilityRole={onPress ? 'button' : undefined} disabled={!onPress} onPress={onPress} style={({ pressed }) => [k.item, { backgroundColor: cor[0], borderLeftColor: cor[1] }, pressed && { opacity: 0.8 }]}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[k.mono, { color: c.textMuted }]} numberOfLines={1}>{p.codigo}{m ? ` · ${m}` : ` · ${p.categoria}`}</Text>
        <Text style={[k.cTxt, { color: c.text, fontSize: 16 }]} numberOfLines={2}>{p.nome}</Text>
        <Text style={[k.cTxt, { color: c.text }]}>Saldo <Text style={k.b}>{fmtQ(p.saldo)}</Text>{Array.from({ length: r }, (_, i) => <Text key={i}> · {i + 1}ª <Text style={k.b}>{fmtQ(q[i])}</Text></Text>)}</Text>
      </View>
      <View style={{ alignItems: 'flex-end', gap: 6 }}>
        <Text style={[k.b, { color: c.text, fontSize: 13 }]}>{s === 'correto' ? 'Correto' : s === 'divergente' ? 'Divergente' : 'Pendente'}</Text>
        {onPress ? <CaretRightIcon size={16} color={c.textMuted} /> : null}
      </View>
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
  const [mult, setMult] = useState('1');
  const [aviso, setAviso] = useState<{ txt: string; tom: 'ok' | 'erro' } | null>(null);
  const [teclado, setTeclado] = useState(false); // coletor não precisa do teclado na tela; no celular comum, liga aqui
  const campo = useRef<ComponentRef<typeof TextInput>>(null);
  const indice = useMemo(() => indiceLeitura(produtos), [produtos]);
  const naRodada = useMemo(() => new Set(lista.map(p => p.codigo)), [lista]);
  const noEscopo = useMemo(() => new Set(itens.map(p => p.codigo)), [itens]);
  const col = useColetas(ct.inventario_id);
  const p = sel ? produtos.find(x => x.codigo === sel) : undefined;
  const ja = p ? q.get(p.codigo)?.[r - 1] ?? null : null;
  const hist = useMemo(() => (p ? col.list.filter(x => x.contagem_id === ct.id && x.rodada === r && x.codigo === p.codigo).flatMap(x => x.hist).sort((a, b) => b[0].localeCompare(a[0])).slice(0, 40) : []), [col.list, ct.id, r, p]);

  // O coletor "digita" o código e envia Enter: cada leitura soma a quantidade por leitura (padrão 1).
  const ler = (bruto: string) => {
    const cod = bruto.trim();
    setCodigo('');
    setTimeout(() => campo.current?.focus(), 30);
    if (!cod) return;
    // DUN-14 (caixa): a relação de barras do Petros imprime só 13 dígitos (pula o 13º) — tenta também essa forma.
    const prod = indice.get(cod) ?? indice.get(cod.replace(/^0+/, '')) ?? (/^\d{14}$/.test(cod) ? indice.get(cod.slice(0, 12) + cod.slice(13)) : undefined);
    if (!prod) { setAviso({ txt: `Código ${cod} não está na carga do ERP desta filial.`, tom: 'erro' }); return; }
    setSel(prod.codigo);
    if (!naRodada.has(prod.codigo)) {
      setAviso({ txt: noEscopo.has(prod.codigo) ? `${prod.nome}: já fechado na contagem anterior.` : `${prod.nome}: fora desta contagem (outra categoria).`, tom: 'erro' });
      return;
    }
    const n = Number(mult.replace(',', '.'));
    const qtd = Number.isFinite(n) && n > 0 ? n : 1;
    void registrarLeitura(ct, r, prod.codigo, qtd);
    setAviso({ txt: `+${fmtQ(qtd)} · ${prod.nome}`, tom: 'ok' });
  };
  const corrigir = () => { if (p && ja) void registrarLeitura(ct, r, p.codigo, -1); };

  if (!ativa) return (
    <ScrollView contentContainerStyle={k.corpo}>
      {rodadas}
      <EmptyState icon={BarcodeIcon} title={`Contagem ${r} ${ROTULO_RODADA[ct.rodadas[r - 1]].toLowerCase()}`} text="Só a contagem em andamento recebe leituras. Para corrigir uma finalizada, reabra a contagem na tela do inventário." />
    </ScrollView>
  );

  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={k.corpo} keyboardShouldPersistTaps="always">
        {rodadas}
        <View style={k.linha}>
          <View style={{ flex: 1 }}><Rotulo>Código</Rotulo></View>
          <View style={{ width: 110 }}><Rotulo>Qtd por leitura</Rotulo></View>
        </View>
        <View style={k.linha}>
          <TextInput ref={campo} autoFocus value={codigo} onChangeText={setCodigo} onSubmitEditing={e => ler(e.nativeEvent.text)} submitBehavior="submit" blurOnSubmit={false}
            placeholder="Leia o código de barras" placeholderTextColor={c.textFaint} autoCapitalize="none" autoCorrect={false} showSoftInputOnFocus={teclado} returnKeyType="done"
            style={[k.codigo, { color: c.text, backgroundColor: c.surface, borderColor: AMBER }]} accessibilityLabel="Código de barras" />
          <TextInput value={mult} onChangeText={setMult} keyboardType="decimal-pad" selectTextOnFocus style={[k.codigo, { width: 110, flex: 0, color: c.text, backgroundColor: c.surface, borderColor: c.borderStrong, textAlign: 'center' }]} accessibilityLabel="Quantidade por leitura" />
        </View>
        <Text style={[k.cap, { color: aviso ? (aviso.tom === 'ok' ? c.success : c.danger) : c.textMuted }]}>{aviso?.txt ?? 'Aponte o coletor: a leitura é registrada e o item aparece sozinho.'}</Text>
        <Pressable accessibilityRole="switch" accessibilityState={{ checked: teclado }} onPress={() => { setTeclado(v => !v); setTimeout(() => campo.current?.focus(), 50); }} style={{ alignSelf: 'flex-start', paddingVertical: 4 }}>
          <Text style={[k.cap, k.b, { color: c.accentText }]}>{teclado ? 'Esconder teclado (uso com coletor)' : 'Mostrar teclado para digitar o código'}</Text>
        </Pressable>
        {codigo.trim() ? <Botao titulo="Registrar código digitado" tipo="s" icone={BarcodeIcon} onPress={() => ler(codigo)} /> : null}
        {p ? <>
          <Cartao>
            <Text style={[k.cap, { color: c.textMuted }]}>Código interno</Text>
            <Text style={[k.monoG, { color: c.text }]}>{p.codigo}</Text>
            <Text style={[k.cap, { color: c.textMuted, marginTop: 6 }]}>Nome</Text>
            <Text style={[k.cTit, { color: c.text }]}>{p.nome}</Text>
            <View style={k.linha}>
              <View style={[k.kpi, { backgroundColor: c.bg }]}><Text style={[k.cap, { color: c.textMuted }]}>Já coletado</Text><Text style={[k.kpiN, { color: c.text }]}>{fmtQ(ja ?? 0)}</Text></View>
              <View style={[k.kpi, { backgroundColor: c.bg }]}><Text style={[k.cap, { color: c.textMuted }]}>Saldo atual (ERP)</Text><Text style={[k.kpiN, { color: c.text }]}>{fmtQ(p.saldo)}</Text></View>
            </View>
            {ja ? <Pressable accessibilityRole="button" onPress={corrigir} style={[k.linha, { alignSelf: 'flex-start', paddingVertical: 6 }]}><MinusIcon size={16} color={c.danger} weight="bold" /><Text style={[k.b, { color: c.danger }]}>Corrigir: tirar 1</Text></Pressable> : null}
          </Cartao>
          <Cartao>
            <Text style={[k.cTit, { color: c.text, fontSize: 16 }]}>Histórico de coletas do item</Text>
            <Text style={[k.cap, { color: c.textMuted }]}>Horário · quantidade</Text>
            {hist.length ? hist.map(([h, n], i) => (
              <View key={i} style={[k.linha, { paddingVertical: 8, borderBottomWidth: i < hist.length - 1 ? 1 : 0, borderBottomColor: c.border }]}>
                <Text style={[k.monoM, { color: c.text, flex: 1 }]}>{h}</Text>
                <Text style={[k.monoM, k.b, { color: n < 0 ? c.danger : c.text }]}>{n > 0 ? '+' : ''}{fmtQ(n)}</Text>
              </View>
            )) : <Text style={[k.cap, { color: c.textMuted }]}>Nenhuma leitura deste item nesta contagem.</Text>}
          </Cartao>
        </> : <EmptyState icon={BarcodeIcon} title="Aguardando leitura" text={`${lista.length.toLocaleString('pt-BR')} itens nesta contagem. Leia um código para começar.`} />}
      </ScrollView>
      {p ? (
        <View style={[k.total, { paddingBottom: Math.max(insets.bottom, 14) }]}>
          <Text style={k.totalTxt}>Total coletado do item</Text>
          <Text style={k.totalN}>{fmtQ(ja ?? 0)}</Text>
        </View>
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
    const linhas = problemas.slice(0, 3000).map(l => `<tr><td>${esc(l.produto.codigo)}</td><td>${esc(l.produto.nome)}</td><td>${esc(l.produto.categoria)}</td><td class="n">${fmtQ(l.produto.saldo)}</td><td class="n">${fmtQ(l.qtd)}</td><td class="n">${l.diferenca > 0 ? '+' : ''}${fmtQ(l.diferenca)}</td><td>${l.status === 'divergente' ? 'Divergente' : 'Não encontrado'}</td></tr>`).join('');
    const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Inventário ${esc(inv.codigo)}</title><style>@page{size:A4;margin:12mm}body{font:11px Arial,sans-serif;color:#1b2230;margin:0}h1{font-size:18px;margin:0 0 2px;color:${NAVY}}.sub{color:#5b6475;margin-bottom:10px}.kpis{display:flex;gap:8px;margin:8px 0 12px}.kpis div{flex:1;padding:8px;border-radius:6px;background:#f2f4f7}.kpis b{display:block;font-size:18px}h2{font-size:13px;margin:14px 0 6px}table{width:100%;border-collapse:collapse}th{background:${NAVY};color:#fff;text-align:left;padding:4px}td{border-bottom:1px solid #e3e6ec;padding:3px 4px}.n{text-align:right;font-variant-numeric:tabular-nums}</style></head><body>
<h1>Relatório do inventário ${esc(inv.codigo)}</h1><div class="sub">${esc(filial)} · ${inv.tipo === 'completo' ? 'Completo' : 'Parcial'} · ${enc ? `Finalizado em ${dataBR(inv.encerrado_em)}` : 'Em andamento'}</div>
<div class="kpis"><div><b>${rel.corretos.toLocaleString('pt-BR')}</b>Corretos</div><div><b>${rel.divergentes.toLocaleString('pt-BR')}</b>Divergentes</div><div><b>${rel.naoEncontrados.toLocaleString('pt-BR')}</b>Não encontrados</div></div>
<h2>Resultado por contagem</h2><table><tr><th>Contagem</th><th class="n">Itens</th><th class="n">Corretos</th><th class="n">Divergentes</th><th class="n">Não encontrados</th></tr>${rel.porContagem.map(p => `<tr><td>${esc(p.contagem.nome)}</td><td class="n">${p.itens}</td><td class="n">${p.corretos}</td><td class="n">${p.divergentes}</td><td class="n">${p.naoEncontrados}</td></tr>`).join('')}</table>
<h2>Itens divergentes e não encontrados (${problemas.length})</h2><table><tr><th>Código</th><th>Produto</th><th>Categoria</th><th class="n">Saldo</th><th class="n">Contado</th><th class="n">Dif.</th><th>Situação</th></tr>${linhas}</table></body></html>`;
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
  codigo: { flex: 1, minHeight: 54, borderWidth: 2, borderRadius: 12, paddingHorizontal: 14, fontSize: 19, fontFamily: 'monospace' },
  kpi: { flex: 1, borderRadius: 10, padding: 12, gap: 2 },
  kpiN: { fontFamily: 'monospace', fontSize: 30, fontWeight: '700' },
  total: { backgroundColor: NAVY, flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.xl, paddingTop: 14 },
  totalTxt: { color: '#c9d4e2', fontSize: 16, flex: 1 },
  totalN: { color: '#fff', fontFamily: 'monospace', fontSize: 34, fontWeight: '700' },
  resN: { fontSize: 30, width: 92, fontVariant: ['tabular-nums'] },
  tile: { flex: 1, borderRadius: 12, borderTopWidth: 5, padding: 12, gap: 2, minHeight: 92 },
  tileN: { fontFamily: 'monospace', fontSize: 22, fontWeight: '700' },
  acaoMini: { borderWidth: 1.5, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
});

