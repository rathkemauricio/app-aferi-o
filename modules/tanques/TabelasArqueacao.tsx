import * as DocumentPicker from 'expo-document-picker';
import { useContext, useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { imprimirHtml } from '../../lib/util';
import { CheckIcon, FileArrowUpIcon, PrinterIcon, RulerIcon, TrashIcon, WarningIcon } from '../../ui/icons';
import { Button, Card, confirmAction, Field, ListRow, notify, SectionHeader, Sheet, StatusPill } from '../../ui/kit';
import { createTypography, radius, space, ThemeContext } from '../../ui/theme';
import { lerTextosPdf } from '../coleta/barras';
import {
  alturaMaxima, htmlTabela, lerTabela, linhasDoPdf, litrosPelaTabela, pontosParaConferir, type TabelaArqueacao, tabelasCol, useTabelas, volumeTotal,
} from './arqueacao';
import { lerNumero, uid } from './model';

const fmt = (v: number | null | undefined) => (v === null || v === undefined ? '—' : v.toLocaleString('pt-BR'));
const ordenar = (l: string[]) => [...l].sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true }));

/**
 * Tabelas de arqueação da filial: importar do PDF, conferir, escolher os tanques que usam cada uma, imprimir e excluir.
 * `tanquesConhecidos` = números dos tanques do croqui e da última medição (para marcar quais usam a tabela).
 */
export function TabelasArqueacao({ filialId, filialCodigo, filialNome, tanquesConhecidos }: {
  filialId: string; filialCodigo: string; filialNome: string; tanquesConhecidos: string[];
}) {
  const { colors } = useContext(ThemeContext);
  const t = useMemo(() => createTypography(colors), [colors]);
  const tabelas = useTabelas(filialId);
  const [lendo, setLendo] = useState<string | null>(null);
  const [editando, setEditando] = useState<{ tabela: TabelaArqueacao; nova: boolean; avisos: string[] } | null>(null);

  const importar = async () => {
    if (lendo) return;
    try {
      const r = await DocumentPicker.getDocumentAsync({ type: 'application/pdf', copyToCacheDirectory: true, multiple: false });
      const a = r.canceled ? undefined : r.assets?.[0];
      if (!a) return;
      setLendo('Abrindo o PDF…');
      const lida = lerTabela(linhasDoPdf(await lerTextosPdf(a, 'arqueacao', setLendo)));
      setLendo(null);
      if (lida.pontos.length < 10) { notify('Tabela não reconhecida', `Não encontrei as colunas de altura (cm) e volume (L) em "${a.name}". O PDF precisa ter texto (não pode ser só uma foto).`); return; }
      const avisos: string[] = [];
      if (lida.filialNoArquivo && Number(lida.filialNoArquivo) !== Number(filialCodigo)) avisos.push(`O arquivo diz "Filial ${lida.filialNoArquivo}", mas você está importando na filial ${filialCodigo}. Confira se é a filial certa.`);
      if (lida.repetidos.length) avisos.push(`Alturas repetidas com volumes diferentes (ficou o primeiro): ${lida.repetidos.join(', ')} cm.`);
      if (lida.foraDeOrdem.length) avisos.push(`Volumes que não crescem com a altura foram ignorados: ${lida.foraDeOrdem.join(', ')} cm.`);
      const nomeArquivo = a.name.replace(/\.pdf$/i, '');
      const cap = lida.capacidade ?? volumeTotal(lida);
      setEditando({
        nova: true, avisos,
        tabela: {
          id: uid('tab'), filial_id: filialId, nome: `${lida.tanqueNoArquivo ?? nomeArquivo} · ${fmt(cap)} L`, tanques: [],
          capacidade: lida.capacidade, diametro_cm: lida.diametro_cm, comprimento_m: lida.comprimento_m, pontos: lida.pontos, arquivo: a.name,
        },
      });
    } catch (e) {
      setLendo(null);
      notify('Não foi possível ler o PDF', e instanceof Error ? e.message : '');
    }
  };

  return <>
    <SectionHeader title={`Tabelas de arqueação (${tabelas.length})`} />
    <Text style={t.caption}>Cada tabela é desta filial e serve aos tanques marcados nela. Com a tabela, os litros saem sozinhos da altura medida na régua (a digitação continua possível).</Text>
    {tabelas.map(x => {
      const conferir = pontosParaConferir(x.pontos).length;
      return (
        <Card key={x.id} style={{ padding: space.xs, gap: 0 }}>
          <ListRow icon={RulerIcon} tint={x.tanques.length ? 'sky' : 'slate'} title={x.nome || 'Tabela sem nome'}
            subtitle={`${x.tanques.length ? `Tanque${x.tanques.length === 1 ? '' : 's'} ${x.tanques.join(', ')}` : 'Nenhum tanque usa ainda'} · ${fmt(volumeTotal(x))} L em ${fmt(alturaMaxima(x))} cm`}
            right={conferir ? <StatusPill icon={WarningIcon} label={`${conferir} a conferir`} tone="warning" /> : undefined}
            onPress={() => setEditando({ tabela: x, nova: false, avisos: [] })} />
        </Card>
      );
    })}
    <Button title={lendo ?? 'Importar tabela de arqueação (PDF)'} icon={FileArrowUpIcon} variant="secondary" disabled={!!lendo} onPress={() => void importar()} />
    {editando ? (
      <EditorTabela inicial={editando.tabela} nova={editando.nova} avisos={editando.avisos} outras={tabelas.filter(x => x.id !== editando.tabela.id)}
        filialNome={filialNome} tanquesConhecidos={tanquesConhecidos} onFechar={() => setEditando(null)} />
    ) : null}
  </>;
}

function EditorTabela({ inicial, nova, avisos, outras, filialNome, tanquesConhecidos, onFechar }: {
  inicial: TabelaArqueacao; nova: boolean; avisos: string[]; outras: TabelaArqueacao[]; filialNome: string; tanquesConhecidos: string[]; onFechar: () => void;
}) {
  const { colors } = useContext(ThemeContext);
  const t = useMemo(() => createTypography(colors), [colors]);
  const [d, setD] = useState(inicial);
  const [verTodos, setVerTodos] = useState(false);
  const [ponto, setPonto] = useState<{ cm: number; txt: string } | null>(null);
  const [teste, setTeste] = useState('');
  const conferir = useMemo(() => pontosParaConferir(d.pontos), [d.pontos]);
  const marcados = new Set(conferir.map(x => x.cm));
  const tanques = ordenar([...new Set([...tanquesConhecidos, ...d.tanques])]);
  const usadoEm = (tq: string) => outras.find(o => o.tanques.includes(tq));
  const alternar = (tq: string) => setD(x => ({ ...x, tanques: x.tanques.includes(tq) ? x.tanques.filter(y => y !== tq) : ordenar([...x.tanques, tq]) }));
  const cmTeste = lerNumero(teste);

  const salvar = () => {
    if (!d.nome.trim()) { notify('Dê um nome à tabela', 'Ex.: NEV09 · 15.000 L.'); return; }
    tabelasCol.put({ ...d, nome: d.nome.trim() });
    // Um tanque usa uma só tabela: sai das outras tabelas da filial.
    outras.forEach(o => { const resto = o.tanques.filter(x => !d.tanques.includes(x)); if (resto.length !== o.tanques.length) tabelasCol.put({ ...o, tanques: resto }); });
    onFechar();
  };
  const aplicarPonto = () => {
    if (!ponto) return;
    const v = lerNumero(ponto.txt);
    if (v === null || v < 0) { notify('Valor inválido', 'Digite os litros.'); return; }
    setD(x => ({ ...x, pontos: x.pontos.map(p => (p[0] === ponto.cm ? [p[0], v] : p)) }));
    setPonto(null);
  };
  const celula = (p: [number, number]) => {
    const marcado = marcados.has(p[0]);
    return (
      <Pressable key={p[0]} accessibilityRole="button" accessibilityLabel={`${p[0]} centímetros: ${p[1]} litros. Toque para corrigir.`} onPress={() => setPonto({ cm: p[0], txt: String(p[1]) })}
        style={({ pressed }) => [{ width: '25%', flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3, paddingHorizontal: 6, borderRadius: 6 },
          marcado && { backgroundColor: colors.warningSoft ?? '#fff3c4' }, pressed && { opacity: 0.6 }]}>
        <Text style={[t.caption, { fontWeight: '700' }]}>{p[0]}</Text>
        <Text style={[t.caption, { color: colors.text, fontVariant: ['tabular-nums'], fontWeight: marcado ? '800' : '500' }]}>{fmt(p[1])}</Text>
      </Pressable>
    );
  };

  return (
    <Sheet title={nova ? 'Nova tabela de arqueação' : 'Tabela de arqueação'} onClose={onFechar}
      footer={<View style={{ gap: space.sm }}>
        <Button title={nova ? 'Salvar tabela' : 'Salvar alterações'} icon={CheckIcon} onPress={salvar} />
        {!nova ? <View style={{ flexDirection: 'row', gap: space.sm }}>
          <Button title="Imprimir" icon={PrinterIcon} variant="secondary" style={{ flex: 1 }} onPress={() => void imprimirHtml(htmlTabela(d, filialNome), `Tabela de arqueação ${d.nome}`)} />
          <Button title="Excluir" icon={TrashIcon} variant="danger" style={{ flex: 1 }}
            onPress={() => confirmAction('Excluir tabela?', `${d.nome}. Os tanques ${d.tanques.join(', ') || ''} ficam sem tabela (os litros voltam a ser digitados). Medições já feitas não mudam.`, 'Excluir', () => { tabelasCol.remove(d.id); onFechar(); })} />
        </View> : null}
      </View>}>
      {avisos.map(a => <View key={a} style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}><WarningIcon size={18} color={colors.warning} /><Text style={[t.body, { flex: 1 }]}>{a}</Text></View>)}
      <Text style={t.body}>{d.pontos.length} alturas, de {fmt(d.pontos[0]?.[0])} a {fmt(d.pontos[d.pontos.length - 1]?.[0])} cm · volume total <Text style={{ fontWeight: '800' }}>{fmt(volumeTotal(d))} L</Text>{d.arquivo ? ` · ${d.arquivo}` : ''}</Text>
      <Field label="Nome da tabela" value={d.nome} onChangeText={v => setD(x => ({ ...x, nome: v }))} placeholder="Ex.: NEV09 · 15.000 L" />
      <View style={{ flexDirection: 'row', gap: space.sm }}>
        <Field estavel label="Capacidade nominal (L)" style={{ flex: 1 }} keyboardType="decimal-pad" value={d.capacidade === null ? '' : String(d.capacidade)} onChangeText={v => setD(x => ({ ...x, capacidade: lerNumero(v) }))} />
        <Field estavel label="Diâmetro / régua (cm)" style={{ flex: 1 }} keyboardType="decimal-pad" placeholder={String(d.pontos[d.pontos.length - 1]?.[0] ?? '')} value={d.diametro_cm === null ? '' : String(d.diametro_cm)} onChangeText={v => setD(x => ({ ...x, diametro_cm: lerNumero(v) }))} />
      </View>

      <Text style={t.label}>Tanques desta filial que usam esta tabela</Text>
      {tanques.length ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {tanques.map(tq => {
            const on = d.tanques.includes(tq), outra = usadoEm(tq);
            return (
              <Pressable key={tq} accessibilityRole="checkbox" accessibilityState={{ checked: on }} onPress={() => alternar(tq)}
                style={{ paddingVertical: 8, paddingHorizontal: 12, borderRadius: radius.pill, borderWidth: 1.5, borderColor: on ? colors.accent : colors.borderStrong, backgroundColor: on ? colors.accent : colors.campo }}>
                <Text style={{ fontWeight: '800', color: on ? colors.primaryText : colors.text }}>Tanque {tq}</Text>
                {outra && !on ? <Text style={[t.caption, { fontSize: 10 }]}>usa {outra.nome}</Text> : null}
              </Pressable>
            );
          })}
        </View>
      ) : <Text style={t.caption}>Esta filial ainda não tem tanques no croqui nem em medições. Desenhe os tanques no Croqui ou faça uma medição e volte aqui.</Text>}

      <Text style={t.label}>Testar a tabela</Text>
      <View style={{ flexDirection: 'row', gap: space.sm, alignItems: 'flex-end' }}>
        <Field estavel label="Altura na régua (cm)" style={{ flex: 1 }} keyboardType="decimal-pad" value={teste} onChangeText={setTeste} placeholder="Ex.: 87" />
        <View style={{ flex: 1, minHeight: 46, justifyContent: 'center' }}>
          <Text style={[t.section, { fontVariant: ['tabular-nums'] }]}>{cmTeste === null ? '—' : `${fmt(litrosPelaTabela(d, cmTeste))} L`}</Text>
        </View>
      </View>

      {conferir.length ? <>
        <Text style={t.label}>Confira com a tabela original ({conferir.length})</Text>
        <Text style={t.caption}>Estes volumes fogem da curva dos vizinhos (pode ser erro de digitação ou reflexo na foto). Toque para corrigir.</Text>
        {conferir.map(x => (
          <Pressable key={x.cm} accessibilityRole="button" onPress={() => setPonto({ cm: x.cm, txt: String(x.litros) })}
            style={({ pressed }) => [{ flexDirection: 'row', gap: 8, alignItems: 'center', padding: 8, borderRadius: radius.control, backgroundColor: colors.campo }, pressed && { opacity: 0.7 }]}>
            <WarningIcon size={16} color={colors.warning} />
            <Text style={[t.body, { flex: 1 }]}>{x.cm} cm = <Text style={{ fontWeight: '800' }}>{fmt(x.litros)} L</Text></Text>
            <Text style={t.caption}>esperado ~{fmt(x.esperado)} L</Text>
          </Pressable>
        ))}
      </> : <Text style={t.caption}>Nenhum volume fora da curva.</Text>}

      {ponto ? (
        <View style={{ flexDirection: 'row', gap: space.sm, alignItems: 'flex-end' }}>
          <Field estavel label={`Litros em ${ponto.cm} cm`} style={{ flex: 1 }} keyboardType="decimal-pad" autoFocus value={ponto.txt} onChangeText={v => setPonto({ ...ponto, txt: v })} />
          <Button title="Aplicar" onPress={aplicarPonto} />
        </View>
      ) : null}

      <Button title={verTodos ? 'Ocultar a tabela completa' : `Ver a tabela completa (${d.pontos.length})`} variant="ghost" size="sm" style={{ alignSelf: 'flex-start' }} onPress={() => setVerTodos(v => !v)} />
      {verTodos ? <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>{d.pontos.map(celula)}</View> : null}
    </Sheet>
  );
}
