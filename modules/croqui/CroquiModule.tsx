import * as Print from 'expo-print';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../lib/auth';
import { bandeirasAtivas, nomeBandeira } from '../../lib/bandeiras';
import { docsCol, filiaisCol, saveFilialDoc, useFiliais, useFilialDoc } from '../../lib/data';
import { isSyncEnabled, useCollection } from '../../lib/sync';
import {
  ArrowClockwiseIcon, ArrowDownIcon, ArrowLeftIcon, ArrowRightIcon, ArrowsInIcon, ArrowsOutIcon, ArrowUpIcon, CheckIcon, CopySimpleIcon, DownloadSimpleIcon, DropIcon, FilePdfIcon,
  GasPumpIcon, GridFourIcon, MagnifyingGlassIcon, MagnifyingGlassMinusIcon, MagnifyingGlassPlusIcon, PencilSimpleIcon, ResetIcon, StorefrontIcon, TrashIcon, WarningCircleIcon,
} from '../../ui/icons';
import { Button, Card, ChoiceChips, confirmAction, EmptyState, Field, IconButton, ListRow, notify, SectionHeader, Sheet, StatusPill } from '../../ui/kit';
import { createTypography, radius, space, ThemeContext, type ThemeColors } from '../../ui/theme';
import { CroquiCanvas, IconeElemento, type Movimento, useCatalogoCroqui } from './Canvas';
import {
  type BombaCadastro, clamp, croquiSvg, type CroquiDoc, elementosDoGrupo, espelharBombas, filhosDaIlha, fuelOf, girarPonto, GRUPOS, iconSvg, type Item, lerCroquiAntigo, modeloBasico,
  nBicos, novoItem, novoItemId, PALETA_CLARA, PALETA_ESCURA, resumo, T, tipoDoCombustivel, tiposBomba, VH, VW,
} from './model';

/** Bomba que vem do cadastro (Aferições → Filiais): no croqui só muda de posição. */
const espelhada = (i: Item) => T[i.type]?.k === 'b' && !!i.ref;

export default function CroquiModule() {
  const router = useRouter();
  const params = useLocalSearchParams<{ filial?: string; editar?: string }>();
  const { isAdmin } = useAuth();
  const { colors, mode } = useContext(ThemeContext);
  const t = useMemo(() => createTypography(colors), [colors]);
  const s = useMemo(() => createStyles(colors), [colors]);
  const paleta = useMemo(() => ({ ...(mode === 'dark' ? PALETA_ESCURA : PALETA_CLARA), accent: colors.accent }), [mode, colors.accent]);

  const [catalogo, bandeiras] = useCatalogoCroqui(); // combustíveis (tipos de bomba) e bandeiras cadastrados
  const { filiais } = useFiliais();
  const [filialId, setFilialId] = useState<string>(params.filial ?? '');
  const filial = filiais.find(f => f.id === filialId) ?? null;
  const { doc } = useFilialDoc<CroquiDoc>(filial?.id, 'croqui');
  const { payload: equipamentos } = useFilialDoc<{ pumps: BombaCadastro[] }>(filial?.id, 'equipamentos');
  const bombas = useMemo(() => equipamentos?.pumps ?? [], [equipamentos]);
  const docsSnap = useCollection(docsCol);
  // Só grava o espelho depois de sincronizar: num aparelho novo, o croqui do servidor ainda pode estar chegando.
  const podeGravarEspelho = docsSnap.loaded && (!isSyncEnabled() || docsCol.pulledOnce);
  const tipo = useCallback((nome: string) => tipoDoCombustivel(nome, catalogo), [catalogo]);
  const espelho = useMemo(() => espelharBombas(doc?.payload?.items ?? [], bombas, tipo), [doc?.payload, bombas, tipo]);

  const [editando, setEditando] = useState(params.editar === '1');
  const [items, setItems] = useState<Item[]>([]);
  const [sel, setSel] = useState<string | null>(null);
  const [nomes, setNomes] = useState(true);
  const [arrastando, setArrastando] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [grade, setGrade] = useState(true);   // encaixe de 10 em 10; desligado = posição livre
  const [telaCheia, setTelaCheia] = useState(false);
  const [escolherFilial, setEscolherFilial] = useState(!params.filial);
  const [busca, setBusca] = useState('');
  const [importar, setImportar] = useState<string | null>(null);
  const [opcoesImport, setOpcoesImport] = useState<ReturnType<typeof lerCroquiAntigo> | null>(null);
  const arrastandoRef = useRef(false);
  arrastandoRef.current = arrastando;

  // Carrega o croqui da filial já espelhando o cadastro de bombas (e atualizações do servidor, exceto durante um arraste).
  useEffect(() => { if (!arrastandoRef.current) setItems(espelho.items); }, [espelho, filialId]);
  // Cadastro mudou (bomba nova, bico novo, combustível trocado): grava o croqui atualizado.
  useEffect(() => {
    if (filial && espelho.mudou && podeGravarEspelho) saveFilialDoc<CroquiDoc>(filial.id, 'croqui', { items: espelho.items });
  }, [espelho, filial, podeGravarEspelho]);
  useEffect(() => { setSel(null); }, [filialId]);

  const item = items.find(i => i.id === sel) ?? null;
  const commit = (next: Item[]) => { setItems(next); if (filial) saveFilialDoc<CroquiDoc>(filial.id, 'croqui', { items: next }); };
  const patch = (id: string, p: Partial<Item>) => commit(items.map(i => (i.id === id ? { ...i, ...p } : i)));
  const filhos = item ? filhosDaIlha(items, item) : [];
  const norm = (r: number) => Math.round((((r % 360) + 360) % 360) * 10) / 10;
  /** Gira o item; se for ilha, as bombas sobre ela giram junto em torno do centro da ilha. */
  const girar = (graus = 90) => {
    if (!item) return;
    const ids = new Set(filhos.map(f => f.id));
    commit(items.map(i => {
      if (i.id === item.id) return { ...i, rot: norm(i.rot + graus) };
      if (!ids.has(i.id)) return i;
      const p = girarPonto(i.x, i.y, item.x, item.y, graus);
      return { ...i, x: Math.round(p.x), y: Math.round(p.y), rot: norm(i.rot + graus) };
    }));
  };
  const definirAngulo = (graus: number) => { if (item) girar(norm(graus) - item.rot); };
  /** Ajuste fino com as setas (com grade: 10; livre: 2). A ilha leva as bombas. */
  const mover = (dx: number, dy: number) => {
    if (!item) return;
    const ids = new Set([item.id, ...filhos.map(f => f.id)]);
    commit(items.map(i => (ids.has(i.id) ? { ...i, x: clamp(i.x + dx, 0, VW), y: clamp(i.y + dy, 0, VH) } : i)));
  };
  // Bombas do cadastro não são excluídas nem duplicadas aqui: saem do croqui só quando saem do cadastro.
  const excluir = () => {
    if (!item || espelhada(item)) return;
    const levar = filhos.filter(f => !espelhada(f));
    const ficam = filhos.length - levar.length;
    const remover = () => { const ids = new Set([item.id, ...levar.map(f => f.id)]); commit(items.filter(i => !ids.has(i.id))); setSel(null); };
    if (levar.length) confirmAction('Excluir a ilha?', `As ${levar.length} bomba(s) sem cadastro apoiadas nela também serão excluídas.${ficam ? ` As ${ficam} bomba(s) do cadastro continuam no desenho.` : ''}`, 'Excluir', remover);
    else remover();
  };
  const duplicar = () => {
    if (!item || espelhada(item)) return;
    const c = { ...item, id: novoItemId(), x: item.x + 30, y: item.y + 30 };
    const copias = filhos.filter(f => !espelhada(f)).map(f => ({ ...f, id: novoItemId(), x: f.x + 30, y: f.y + 30 }));
    commit([...items, c, ...copias]); setSel(c.id);
  };
  const removerSemCadastro = () => {
    const ids = new Set(espelho.semCadastro.map(i => i.id));
    confirmAction('Remover bombas sem cadastro?', `${ids.size} bomba(s) do desenho não existem no cadastro desta filial e serão removidas do croqui.`, 'Remover', () => {
      commit(items.filter(i => !ids.has(i.id))); if (sel && ids.has(sel)) setSel(null);
    });
  };
  const aplicarMovimentos = (movs: Movimento[], final: boolean) => {
    const m = new Map(movs.map(v => [v.id, v]));
    const next = items.map(i => { const v = m.get(i.id); return v ? { ...i, x: v.x, y: v.y } : i; });
    if (final) commit(next); else setItems(next);
  };
  const passo = grade ? 10 : 2;
  const ZOOMS = [1, 1.5, 2, 3];
  const mudarZoom = (dir: 1 | -1) => setZoom(z => ZOOMS[Math.max(0, Math.min(ZOOMS.length - 1, ZOOMS.indexOf(z) + dir))]);
  const adicionar = (type: string) => { const it = novoItem(type, items); commit([...items, it]); setSel(it.id); };

  // Teclado na web: Delete remove, R gira (como no HTML).
  useEffect(() => {
    if (Platform.OS !== 'web' || !editando) return;
    const h = (e: KeyboardEvent) => {
      const tag = (document.activeElement?.tagName ?? '').toUpperCase();
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag)) return;
      if (e.key === 'Delete' || e.key === 'Backspace') excluir();
      else if (e.key.toLowerCase() === 'r') girar(90);
      else if (e.key.toLowerCase() === 'q') girar(-15);
      else if (e.key.toLowerCase() === 'e') girar(15);
      else if (e.key.startsWith('Arrow')) { e.preventDefault(); const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key] ?? [0, 0]; mover(d[0] * passo, d[1] * passo); }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  });

  const imprimir = async () => {
    if (!filial) return;
    const svg = croquiSvg(items, { bandeira: filial.bandeira, mostrarNomes: nomes, p: PALETA_CLARA });
    const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Croqui ${filial.nome}</title><style>@page{size:A4 landscape;margin:10mm}body{font:12px Arial,sans-serif;margin:0}h1{font-size:16px;margin:0 0 8px}svg{width:100%;height:auto}</style></head><body><h1>Croqui · ${filial.codigo} ${filial.nome}</h1>${svg}</body></html>`;
    try {
      if (Platform.OS === 'web') { await Print.printAsync({ html }); return; }
      const file = await Print.printToFileAsync({ html, width: 842, height: 595 });
      if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(file.uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf' });
    } catch { notify('Não foi possível gerar o PDF'); }
  };

  const voltar = () => { if (router.canGoBack()) router.back(); else router.replace('/'); };
  const filtradas = filiais.filter(f => `${f.codigo} ${f.nome}`.toLowerCase().includes(busca.toLowerCase()));
  const r = resumo(items);

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <View style={s.header}>
        <IconButton icon={ArrowLeftIcon} label="Voltar" onPress={voltar} />
        <View style={s.flex}>
          <Text style={s.title} numberOfLines={1}>Croqui</Text>
          <Text style={t.caption} numberOfLines={1}>{filial ? `${filial.codigo} · ${filial.nome}` : 'Escolha a filial'}</Text>
        </View>
        <Button title="Filial" icon={StorefrontIcon} variant="secondary" size="sm" onPress={() => setEscolherFilial(true)} />
      </View>

      <ScrollView contentContainerStyle={s.content} scrollEnabled={!arrastando} keyboardShouldPersistTaps="handled">
        {!filial ? (
          <EmptyState icon={StorefrontIcon} title="Nenhuma filial escolhida" text="Cada filial tem o seu croqui." action={{ label: 'Escolher filial', onPress: () => setEscolherFilial(true) }} />
        ) : <>
          <View style={s.toolbar}>
            <StatusPill label={editando ? 'Modo edição' : 'Visualização'} tone={editando ? 'accent' : 'neutral'} />
            <View style={s.flex} />
            <IconButton icon={MagnifyingGlassMinusIcon} label="Diminuir zoom" onPress={() => mudarZoom(-1)} />
            <Text style={[t.label, { minWidth: 40, textAlign: 'center' }]}>{Math.round(zoom * 100)}%</Text>
            <IconButton icon={MagnifyingGlassPlusIcon} label="Aumentar zoom" onPress={() => mudarZoom(1)} />
            <IconButton icon={ArrowsOutIcon} label="Tela cheia" onPress={() => setTelaCheia(true)} />
            <Button title={nomes ? 'Ocultar nomes' : 'Mostrar nomes'} variant="ghost" size="sm" onPress={() => setNomes(v => !v)} />
            {editando
              ? <Button title="Concluir" icon={CheckIcon} size="sm" onPress={() => { setEditando(false); setSel(null); }} />
              : <Button title="Editar" icon={PencilSimpleIcon} size="sm" onPress={() => setEditando(true)} />}
          </View>

          {espelho.semCadastro.length > 0 && (
            <Card style={{ borderColor: colors.warning }}>
              <View style={s.row}>
                <WarningCircleIcon size={18} color={colors.warning} />
                <Text style={[t.bodyStrong, s.flex]}>Bombas sem cadastro: {espelho.semCadastro.map(i => i.label || '?').join(', ')}</Text>
              </View>
              <Text style={t.caption}>Estas bombas estão no desenho, mas não no cadastro da filial (Aferições → Filiais), por isso não aparecem nas aferições. Cadastre-as lá com o mesmo número ou remova do croqui.</Text>
              <Button title="Remover do croqui" icon={TrashIcon} variant="secondary" size="sm" style={{ alignSelf: 'flex-start' }} onPress={removerSemCadastro} />
            </Card>
          )}

          {!items.length && !editando ? (
            <EmptyState icon={StorefrontIcon} title="Esta filial ainda não tem croqui"
              text="Cadastre as bombas e os bicos da filial em Aferições → Filiais: o croqui é montado com elas automaticamente. Ou entre no modo de edição para desenhar o terreno."
              action={{ label: 'Começar a desenhar', icon: PencilSimpleIcon, onPress: () => setEditando(true) }} />
          ) : (
            <CroquiCanvas items={items} bandeira={filial.bandeira} mostrarNomes={nomes} paleta={paleta} editavel={editando} selecionado={sel}
              zoom={zoom} passo={passo} onSelect={setSel} onDragChange={setArrastando} onMove={aplicarMovimentos} />
          )}

          {editando && <>
            {!items.length && <Button title="Começar com o modelo básico" icon={ResetIcon} variant="secondary" onPress={() => commit(modeloBasico())} />}
            <View style={s.row}>
              <Text style={[t.caption, s.flex]}>Toque num elemento da paleta para adicioná-lo. Arraste no desenho para mover; a ilha leva as bombas junto. Com zoom, arraste em área vazia para deslizar.{Platform.OS === 'web' ? ' Teclado: setas movem, Q/E giram 15°, R gira 90°, Delete exclui.' : ''}</Text>
              <Pressable onPress={() => setGrade(g => !g)} accessibilityRole="switch" accessibilityState={{ checked: grade }}
                style={[s.toggle, grade && { borderColor: colors.accent, backgroundColor: colors.accentSoft }]}>
                <GridFourIcon size={16} color={grade ? colors.accentText : colors.textMuted} />
                <Text style={[t.caption, grade && { color: colors.accentText, fontWeight: '700' }]}>{grade ? 'Grade' : 'Livre'}</Text>
              </Pressable>
            </View>

            {item ? (
              <Card>
                {espelhada(item) ? <>
                  <View style={s.row}>
                    <GasPumpIcon size={18} color={colors.accentText} weight="duotone" />
                    <Text style={[t.section, s.flex]}>Bomba {item.label}</Text>
                    <StatusPill label="Do cadastro" tone="accent" />
                  </View>
                  {(item.bicosNum ?? []).map((n, i) => (
                    <View key={i} style={s.row}>
                      <View style={[s.swatch, { backgroundColor: T[fuelOf(item, i)]?.c }]} />
                      <Text style={[t.body, s.flex]}>Bico {n}</Text>
                      <Text style={t.caption}>{T[fuelOf(item, i)]?.n}</Text>
                    </View>
                  ))}
                  {!item.bicosNum?.length ? <Text style={t.caption}>Nenhum bico cadastrado nesta bomba.</Text> : null}
                  <Text style={t.caption}>Número, bicos e combustíveis vêm do cadastro (Aferições → Filiais). Aqui você só posiciona e gira a bomba.</Text>
                </> : <>
                  <View style={s.row}><Text style={[t.section, s.flex]}>{T[item.type]?.n}</Text><IconButton icon={TrashIcon} tone="danger" label="Excluir item" onPress={excluir} /></View>
                  <Field label="Rótulo" value={item.label} onChangeText={v => patch(item.id, { label: v })} />
                  <View style={s.twoCol}>
                    <Field estavel label="Largura" style={s.flex} keyboardType="numeric" value={String(item.w)} onChangeText={v => patch(item.id, { w: Math.max(10, Math.min(1000, Number(v) || 10)) })} />
                    <Field estavel label="Altura" style={s.flex} keyboardType="numeric" value={String(item.h)} onChangeText={v => patch(item.id, { h: Math.max(10, Math.min(640, Number(v) || 10)) })} />
                  </View>
                </>}
                {T[item.type]?.k === 'b' && !espelhada(item) && <>
                  <View style={s.group}>
                    <Text style={t.label}>Bicos</Text>
                    <ChoiceChips value={String(nBicos(item))} options={['1', '2', '3', '4', '5', '6']} onChange={v => patch(item.id, { bicos: Number(v) })} />
                  </View>
                  {Array.from({ length: nBicos(item) }, (_, i) => (
                    <View key={i} style={s.group}>
                      <Text style={t.label}>Bico {i + 1}</Text>
                      <View style={s.fuels}>
                        {tiposBomba().map(k => {
                          const on = fuelOf(item, i) === k;
                          return (
                            <Pressable key={k} onPress={() => { const a = Array.from({ length: 6 }, (_, j) => fuelOf(item, j)); a[i] = k; patch(item.id, { fuels: a }); }}
                              style={[s.fuel, on && { borderColor: T[k].c, borderWidth: 2 }]} accessibilityLabel={T[k].n} accessibilityState={{ selected: on }}>
                              <View style={[s.swatch, { backgroundColor: T[k].c }]} /><Text style={[t.caption, on && { color: colors.text, fontWeight: '700' }]}>{T[k].n}</Text>
                            </Pressable>
                          );
                        })}
                      </View>
                    </View>
                  ))}
                </>}
                {filhos.length ? <Text style={[t.caption, { color: colors.accentText }]}>Ilha com {filhos.length} bomba(s): elas movem, giram, duplicam e são excluídas junto.</Text> : null}
                <Text style={t.label}>Rotação: {Math.round(item.rot)}°</Text>
                <View style={s.row}>
                  <IconButton icon={ResetIcon} label="Girar 15° para a esquerda" onPress={() => girar(-15)} />
                  <IconButton icon={ArrowClockwiseIcon} label="Girar 15° para a direita" onPress={() => girar(15)} />
                  <Button title="90°" variant="secondary" size="sm" onPress={() => girar(90)} />
                  <Field style={{ width: 90 }} keyboardType="numeric" placeholder="Ângulo" defaultValue={String(Math.round(item.rot))} key={item.id + ':' + item.rot}
                    onEndEditing={e => { const v = Number(e.nativeEvent.text.replace(',', '.')); if (!Number.isNaN(v)) definirAngulo(v); }} />
                </View>
                <Text style={t.label}>Ajuste fino ({passo} por toque)</Text>
                <View style={s.row}>
                  <IconButton icon={ArrowLeftIcon} label="Mover para a esquerda" onPress={() => mover(-passo, 0)} />
                  <IconButton icon={ArrowUpIcon} label="Mover para cima" onPress={() => mover(0, -passo)} />
                  <IconButton icon={ArrowDownIcon} label="Mover para baixo" onPress={() => mover(0, passo)} />
                  <IconButton icon={ArrowRightIcon} label="Mover para a direita" onPress={() => mover(passo, 0)} />
                  <View style={s.flex} />
                  {!espelhada(item) && <Button title="Duplicar" icon={CopySimpleIcon} variant="secondary" size="sm" onPress={duplicar} />}
                </View>
              </Card>
            ) : null}

            <SectionHeader title="Elementos" />
            <View style={s.row}>
              <GasPumpIcon size={16} color={colors.textMuted} />
              <Text style={[t.caption, s.flex]}>
                As bombas vêm do cadastro da filial (Aferições → Filiais), com número, bicos e combustíveis. {bombas.length ? `${bombas.length} bomba(s) cadastrada(s): arraste cada uma para o lugar certo.` : 'Esta filial ainda não tem bombas cadastradas.'}
              </Text>
            </View>
            {GRUPOS.filter(g => g !== 'Bombas').map(g => (
              <View key={g} style={s.group}>
                <Text style={t.label}>{g}</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.palette}>
                  {elementosDoGrupo(g).map(k => (
                    <Pressable key={k} onPress={() => adicionar(k)} style={({ pressed }) => [s.pi, pressed && { opacity: 0.6 }]} accessibilityLabel={`Adicionar ${T[k].n}`}>
                      <IconeElemento xml={iconSvg(k)} />
                      <Text style={s.piText} numberOfLines={2}>{T[k].n}</Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>
            ))}

            <SectionHeader title="Bandeira do posto" />
            {isAdmin
              ? <ChoiceChips value={nomeBandeira(filial.bandeira)} options={bandeirasAtivas(bandeiras).map(b => b.nome)}
                  onChange={n => { const b = bandeiras.find(x => x.nome === n); if (b) filiaisCol.put({ ...filial, bandeira: b.id }); }} />
              : <Text style={t.caption}>{nomeBandeira(filial.bandeira)}. Somente o administrador altera a bandeira.</Text>}

            <Card style={s.listCard}>
              <ListRow icon={DropIcon} tint="amber" title="Combustíveis" subtitle="Cadastrar novos tipos de combustível e cores" onPress={() => router.push('/combustiveis')} />
              <ListRow style={s.divided} icon={DownloadSimpleIcon} tint="slate" title="Importar do HTML antigo" subtitle="Traz o desenho salvo no navegador pelo Croqui de Postos.html" onPress={() => setImportar('')} />
              {items.length ? <ListRow style={s.divided} icon={TrashIcon} tint="slate" title="Limpar croqui" subtitle="Remove todos os elementos desta filial"
                onPress={() => confirmAction('Limpar croqui?', 'Todos os elementos desta filial serão removidos.', 'Limpar', () => { commit([]); setSel(null); })} /> : null}
            </Card>
          </>}

          {!editando && items.length > 0 && <>
            <Card>
              <Text style={t.section}>Resumo</Text>
              <Text style={t.body}>Bombas: <Text style={{ fontWeight: '800' }}>{r.bombas}</Text></Text>
              {r.porCombustivel.map(c => (
                <View key={c.tipo} style={s.row}><View style={[s.swatch, { backgroundColor: c.cor }]} /><Text style={[t.body, s.flex]}>{c.nome}</Text><Text style={t.bodyStrong}>{c.n} bico(s)</Text></View>
              ))}
            </Card>
            <Button title="Imprimir ou gerar PDF" icon={FilePdfIcon} variant="secondary" onPress={() => void imprimir()} />
          </>}
        </>}
      </ScrollView>

      {telaCheia && filial ? (
        <Modal visible animationType="fade" onRequestClose={() => setTelaCheia(false)} supportedOrientations={['portrait', 'landscape']}>
          <SafeAreaView style={[s.safe, { backgroundColor: colors.bg }]}>
            <View style={s.header}>
              <IconButton icon={ArrowsInIcon} label="Sair da tela cheia" onPress={() => setTelaCheia(false)} />
              <Text style={[s.title, s.flex]} numberOfLines={1}>{filial.codigo} · {filial.nome}</Text>
              <IconButton icon={MagnifyingGlassMinusIcon} label="Diminuir zoom" onPress={() => mudarZoom(-1)} />
              <Text style={[t.label, { minWidth: 40, textAlign: 'center' }]}>{Math.round(zoom * 100)}%</Text>
              <IconButton icon={MagnifyingGlassPlusIcon} label="Aumentar zoom" onPress={() => mudarZoom(1)} />
            </View>
            <ScrollView contentContainerStyle={{ padding: space.sm }} scrollEnabled={!arrastando}>
              <CroquiCanvas items={items} bandeira={filial.bandeira} mostrarNomes={nomes} paleta={paleta} editavel={editando} selecionado={sel}
                zoom={zoom} passo={passo} onSelect={setSel} onDragChange={setArrastando} onMove={aplicarMovimentos} />
            </ScrollView>
            {editando && item ? (
              <View style={s.barraItem}>
                <Text style={[t.bodyStrong, s.flex]} numberOfLines={1}>{T[item.type]?.n}{item.label ? ` · ${item.label}` : ''}</Text>
                <IconButton icon={ResetIcon} label="Girar 15° para a esquerda" onPress={() => girar(-15)} />
                <IconButton icon={ArrowClockwiseIcon} label="Girar 15° para a direita" onPress={() => girar(15)} />
                {!espelhada(item) && <IconButton icon={CopySimpleIcon} label="Duplicar" onPress={duplicar} />}
                {!espelhada(item) && <IconButton icon={TrashIcon} tone="danger" label="Excluir" onPress={excluir} />}
              </View>
            ) : null}
          </SafeAreaView>
        </Modal>
      ) : null}

      {escolherFilial && (
        <Sheet title="Escolha a filial" onClose={() => setEscolherFilial(false)}>
          <Field icon={MagnifyingGlassIcon} value={busca} onChangeText={setBusca} placeholder="Código ou nome" />
          <Card style={s.listCard}>
            {filtradas.map((f, i) => (
              <ListRow key={f.id} style={i > 0 && s.divided} icon={StorefrontIcon} tint="sky" title={`${f.codigo} · ${f.nome}`} subtitle={[f.cidade, f.uf].filter(Boolean).join(', ')}
                right={f.id === filialId ? <StatusPill label="Atual" tone="accent" /> : undefined}
                onPress={() => { setFilialId(f.id); setEscolherFilial(false); router.setParams({ filial: f.id }); }} />
            ))}
            {!filtradas.length && <Text style={[t.caption, { padding: 12 }]}>Nenhuma filial encontrada.</Text>}
          </Card>
        </Sheet>
      )}

      {importar !== null && (
        <Sheet title="Importar croqui antigo" onClose={() => { setImportar(null); setOpcoesImport(null); }}
          footer={!opcoesImport ? <Button title="Ler conteúdo" disabled={!importar.trim()} onPress={() => { try { setOpcoesImport(lerCroquiAntigo(importar)); } catch { notify('Conteúdo inválido', 'Cole exatamente o texto copiado do navegador.'); } }} /> : undefined}>
          {!opcoesImport ? <>
            <Text style={t.caption}>
              1. Abra o Croqui de Postos.html no mesmo navegador em que ele foi usado.{'\n'}
              2. Abra o console do navegador (F12, aba Console) e execute: copy(localStorage.getItem(&apos;croqui-postos&apos;)){'\n'}
              3. Cole aqui o conteúdo copiado.
            </Text>
            <Field multiline value={importar} onChangeText={setImportar} placeholder="Cole aqui" style={{ minHeight: 160 }} />
          </> : <>
            <Text style={t.caption}>Escolha qual desenho do arquivo antigo vai para {filial ? `${filial.codigo} · ${filial.nome}` : 'esta filial'}. O croqui atual da filial será substituído.</Text>
            <Card style={s.listCard}>
              {opcoesImport.map((o, i) => (
                <ListRow key={i} style={i > 0 && s.divided} icon={StorefrontIcon} tint="slate" title={o.nome} subtitle={`${o.items.length} elemento(s) · ${nomeBandeira(o.bandeira)}`}
                  onPress={() => {
                    if (!filial) return;
                    commit(o.items);
                    if (isAdmin && o.bandeira !== filial.bandeira) filiaisCol.put({ ...filial, bandeira: o.bandeira });
                    setImportar(null); setOpcoesImport(null);
                    notify('Croqui importado', `${o.items.length} elemento(s) copiados para ${filial.nome}.`);
                  }} />
              ))}
            </Card>
          </>}
        </Sheet>
      )}
    </SafeAreaView>
  );
}

const createStyles = (c: ThemeColors) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: c.bg },
  flex: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  twoCol: { flexDirection: 'row', gap: space.md },
  group: { gap: space.sm },
  header: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.lg, paddingVertical: space.md, backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border },
  title: { fontSize: 15.5, fontWeight: '800', color: c.text },
  content: { padding: space.lg, paddingBottom: space.xxl * 2, width: '100%', maxWidth: 1100, alignSelf: 'center', gap: space.md },
  toolbar: { flexDirection: 'row', alignItems: 'center', gap: space.sm, flexWrap: 'wrap' },
  listCard: { padding: space.xs, gap: 0 },
  divided: { borderTopWidth: 1, borderTopColor: c.border, borderRadius: 0 },
  palette: { gap: space.sm, paddingRight: space.lg },
  pi: { width: 78, alignItems: 'center', gap: 4, paddingVertical: 8, paddingHorizontal: 4, borderRadius: radius.control, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface },
  piText: { fontSize: 11, textAlign: 'center', color: c.textMuted },
  fuels: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  fuel: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6, paddingHorizontal: 10, borderRadius: radius.pill, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface },
  swatch: { width: 12, height: 12, borderRadius: 3 },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, minHeight: 34, borderRadius: radius.pill, borderWidth: 1, borderColor: c.border },
  barraItem: { flexDirection: 'row', alignItems: 'center', gap: space.xs, paddingHorizontal: space.lg, paddingVertical: space.sm, borderTopWidth: 1, borderTopColor: c.border, backgroundColor: c.surface },
});
