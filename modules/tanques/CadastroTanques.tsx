import { useContext, useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import type { Combustivel } from '../../lib/combustiveis';
import { CheckIcon, CopySimpleIcon, PlusIcon, TrashIcon, WarningIcon } from '../../ui/icons';
import { Button, Card, confirmAction, Field, notify, SectionHeader, Sheet } from '../../ui/kit';
import { createTypography, radius, space, ThemeContext } from '../../ui/theme';
import { alturaMaxima, type TabelaArqueacao, tabelaDoTanque, volumeTotal } from './arqueacao';
import { excluirTanque, nomeTipo, ordenarTanques, proximoNumero, salvarTanque, type TanqueFilial, tanquesCol, TIPOS } from './cadastro';
import { lerNumero, uid } from './model';
import type { TanqueCroqui } from './store';

type Edicao = { t: TanqueFilial; numeroAntigo: string | null; tabela: string | null; capTxt: string };

const fmt = (v: number | null | undefined) => (v === null || v === undefined ? '—' : v.toLocaleString('pt-BR'));
const norm = (t: string) => t.trim().toLowerCase();

/**
 * Tanques da filial: número, combustível, capacidade, tipo (simples, ou compartimento de bi/tripartido), marca/modelo
 * e a tabela de medição de cada um, como nos documentos das filiais. A nova medição vem com eles prontos.
 * `sugestao` = tanques do croqui (ou da última medição) para trazer de uma vez quando o cadastro está vazio.
 */
export function CadastroTanques({ filialId, cadastro, tabelas, sugestao, origemSugestao, combustiveis, nomeComb, corComb }: {
  filialId: string; cadastro: TanqueFilial[]; tabelas: TabelaArqueacao[]; sugestao: TanqueCroqui[]; origemSugestao: string;
  combustiveis: Combustivel[]; nomeComb: (id: string) => string; corComb: (id: string) => string;
}) {
  const { colors } = useContext(ThemeContext);
  const t = useMemo(() => createTypography(colors), [colors]);
  const [ed, setEd] = useState<Edicao | null>(null);

  const editar = (x: TanqueFilial, novo: boolean) => setEd({
    t: x, numeroAntigo: novo ? null : x.numero, tabela: tabelaDoTanque(tabelas, novo ? '' : x.numero)?.id ?? null,
    capTxt: x.capacidade === null || x.capacidade === undefined ? '' : String(x.capacidade).replace('.', ','),
  });
  /** Novo tanque já no padrão do modelo (mesmo combustível, capacidade, tipo, marca e tabela), com o próximo número livre. */
  const novo = (base?: TanqueFilial) => {
    const modelo = base ?? cadastro[cadastro.length - 1];
    const x: TanqueFilial = {
      id: uid('tqf'), filial_id: filialId, numero: proximoNumero(cadastro), combustivel: modelo?.combustivel ?? '',
      tipo: modelo?.tipo ?? 'simples', modelo: modelo?.modelo ?? '', capacidade: modelo?.capacidade ?? null,
    };
    setEd({
      t: x, numeroAntigo: null,
      tabela: modelo ? tabelaDoTanque(tabelas, modelo.numero)?.id ?? null : (tabelas.length === 1 ? tabelas[0].id : null),
      capTxt: x.capacidade === null || x.capacidade === undefined ? '' : String(x.capacidade),
    });
  };
  const trazer = () => {
    sugestao.forEach(x => tanquesCol.put({ id: uid('tqf'), filial_id: filialId, numero: x.tanque, combustivel: x.combustivel, tipo: 'simples', modelo: '', capacidade: null }));
    notify('Tanques cadastrados', `${sugestao.length} tanque(s) ${origemSugestao}. Abra cada um para conferir o combustível e a tabela de medição.`);
  };

  const salvar = () => {
    if (!ed) return;
    const numero = ed.t.numero.trim();
    if (!numero) { notify('Informe o número do tanque', 'Ex.: 1, 2, 3.'); return; }
    if (cadastro.some(x => x.id !== ed.t.id && norm(x.numero) === norm(numero))) { notify('Número repetido', `Já existe o tanque ${numero} nesta filial.`); return; }
    const gravar = () => { salvarTanque({ ...ed.t, numero, capacidade: lerNumero(ed.capTxt) }, ed.numeroAntigo, ed.tabela, tabelas); setEd(null); };
    if (tabelas.length && !ed.tabela) {
      confirmAction('Salvar sem tabela de medição?', `Tanque ${numero} sem tabela: os litros terão de ser digitados na medição.`, 'Salvar assim', gravar);
      return;
    }
    gravar();
  };
  const excluir = (x: TanqueFilial) => confirmAction('Excluir tanque?', `Tanque ${x.numero}. Sai do cadastro da filial e da tabela de medição (as medições já feitas não mudam).`, 'Excluir', () => {
    excluirTanque(x, tabelas);
    setEd(null);
  });

  const chip = (on: boolean, rotulo: string, onPress: () => void, cor?: string) => (
    <Pressable key={rotulo} accessibilityRole="radio" accessibilityState={{ selected: on }} onPress={onPress}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 40, paddingHorizontal: 12, borderRadius: radius.pill, borderWidth: 1.5, borderColor: on ? colors.accent : colors.borderStrong, backgroundColor: on ? colors.accentSoft : colors.campo }}>
      {cor ? <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: cor }} /> : null}
      <Text style={[t.body, on && { fontWeight: '800', color: colors.accentText }]}>{rotulo}</Text>
    </Pressable>
  );
  const opcao = (on: boolean, rotulo: string, onPress: () => void, extra?: string) => (
    <Pressable key={rotulo} accessibilityRole="radio" accessibilityState={{ selected: on }} onPress={onPress}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44, paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.control, borderWidth: 1.5, borderColor: on ? colors.accent : colors.border, backgroundColor: on ? colors.accentSoft : colors.campo }}>
      <View style={{ flex: 1 }}>
        <Text style={[t.body, on && { fontWeight: '800', color: colors.accentText }]}>{rotulo}</Text>
        {extra ? <Text style={t.caption}>{extra}</Text> : null}
      </View>
      {on ? <CheckIcon size={16} color={colors.accentText} /> : null}
    </Pressable>
  );
  /** Detalhes da tabela como no documento (volume, régua, comprimento) e quais outros tanques a usam. */
  const detalhes = (x: TabelaArqueacao) => {
    const outros = x.tanques.filter(n => !ed?.numeroAntigo || norm(n) !== norm(ed.numeroAntigo));
    return [
      `${fmt(volumeTotal(x))} L em ${fmt(alturaMaxima(x))} cm`, x.comprimento_m ? `comp. ${fmt(x.comprimento_m)} m` : '',
      outros.length ? `tanque${outros.length > 1 ? 's' : ''} ${outros.join(', ')}` : '',
    ].filter(Boolean).join(' · ');
  };

  return <>
    <SectionHeader title={`Tanques da filial (${cadastro.length})`} />
    <Text style={t.caption}>Cada tanque (no bi/tripartido, cada compartimento, com número próprio) fica ligado à sua tabela de medição. Toda nova medição já vem com eles. No painel web, o PDF da filial cadastra tudo de uma vez.</Text>
    {cadastro.length ? (
      <Card style={{ padding: space.xs, gap: 0 }}>
        {ordenarTanques(cadastro).map((x, i) => {
          const tab = tabelaDoTanque(tabelas, x.numero);
          const info = [x.capacidade ? `${fmt(x.capacidade)} L` : '', x.tipo && x.tipo !== 'simples' ? nomeTipo(x.tipo) : '', x.modelo ?? ''].filter(Boolean).join(' · ');
          return (
            <Pressable key={x.id} accessibilityRole="button" accessibilityLabel={`Editar tanque ${x.numero}`} onPress={() => editar(x, false)}
              style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10 }, i > 0 && { borderTopWidth: 1, borderTopColor: colors.border }, pressed && { opacity: 0.7 }]}>
              <View style={{ minWidth: 34, height: 34, borderRadius: 17, paddingHorizontal: 6, backgroundColor: x.combustivel ? corComb(x.combustivel) : colors.surfaceMuted, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: '#fff', fontWeight: '800' }}>{x.numero}</Text>
              </View>
              <View style={{ flex: 1, gap: 1 }}>
                <Text style={t.bodyStrong} numberOfLines={1}>Tanque {x.numero} · {x.combustivel ? nomeComb(x.combustivel) : 'sem combustível'}</Text>
                {info ? <Text style={t.caption} numberOfLines={1}>{info}</Text> : null}
                <Text style={[t.caption, !tab && tabelas.length > 0 && { color: colors.warning, fontWeight: '700' }]} numberOfLines={1}>
                  {tab ? `Tabela ${tab.nome}` : 'Sem tabela (litros digitados)'}
                </Text>
              </View>
              <Pressable accessibilityRole="button" accessibilityLabel={`Novo tanque igual ao ${x.numero}`} hitSlop={8} onPress={() => novo(x)}
                style={{ padding: 8, borderRadius: radius.control, backgroundColor: colors.surfaceMuted }}>
                <CopySimpleIcon size={16} color={colors.textMuted} />
              </Pressable>
            </Pressable>
          );
        })}
      </Card>
    ) : null}
    <Button title={cadastro.length ? 'Adicionar tanque (igual ao último)' : 'Adicionar tanque'} icon={PlusIcon} variant="secondary" onPress={() => novo()} />
    {!cadastro.length && sugestao.length ? (
      <Button title={`Trazer ${sugestao.length} tanque(s) ${origemSugestao}`} icon={CopySimpleIcon} variant="ghost" size="sm" style={{ alignSelf: 'flex-start' }} onPress={trazer} />
    ) : null}
    {cadastro.length ? <Text style={t.caption}>O botão de cópia ao lado de cada tanque cria outro igual (combustível, capacidade, tipo, marca e tabela) com o próximo número.</Text> : null}

    {ed ? (
      <Sheet title={ed.numeroAntigo ? `Tanque ${ed.numeroAntigo}` : 'Novo tanque'} onClose={() => setEd(null)}
        footer={<View style={{ gap: space.sm }}>
          <Button title="Salvar tanque" icon={CheckIcon} onPress={salvar} />
          {ed.numeroAntigo ? <Button title="Excluir tanque" icon={TrashIcon} variant="danger" size="sm" onPress={() => excluir(ed.t)} /> : null}
        </View>}>
        <View style={{ flexDirection: 'row', gap: space.sm }}>
          <Field estavel label="Número do tanque" style={{ flex: 1 }} value={ed.t.numero} onChangeText={v => setEd({ ...ed, t: { ...ed.t, numero: v } })} placeholder="Ex.: 1" />
          <Field estavel label="Capacidade (L)" style={{ flex: 1 }} keyboardType="decimal-pad" value={ed.capTxt} onChangeText={v => setEd({ ...ed, capTxt: v })} placeholder="Ex.: 15.000" />
        </View>
        <Text style={t.label}>Combustível</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {combustiveis.filter(c => c.ativo !== false || c.id === ed.t.combustivel).map(c => chip(ed.t.combustivel === c.id, c.nome, () => setEd({ ...ed, t: { ...ed.t, combustivel: c.id } }), c.cor))}
        </View>
        <Text style={t.label}>Tipo do tanque</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {TIPOS.map(x => chip((ed.t.tipo ?? 'simples') === x.id, x.nome, () => setEd({ ...ed, t: { ...ed.t, tipo: x.id } })))}
        </View>
        {(ed.t.tipo ?? 'simples') !== 'simples' ? <Text style={t.caption}>No bi/tripartido, cada compartimento é cadastrado como um tanque com número próprio (ex.: tanques 3, 4 e 5 de um tripartido), cada um com sua tabela.</Text> : null}
        <Field label="Marca / modelo (opcional)" value={ed.t.modelo ?? ''} onChangeText={v => setEd({ ...ed, t: { ...ed.t, modelo: v } })} placeholder="Como no PDF. Ex.: ARXO 10.000 L" />
        <Text style={t.label}>Tabela de medição (arqueação)</Text>
        <View style={{ gap: 6 }}>
          {tabelas.map(x => opcao(ed.tabela === x.id, x.nome, () => setEd({ ...ed, tabela: x.id }), detalhes(x)))}
          {opcao(ed.tabela === null, 'Sem tabela (digitar os litros)', () => setEd({ ...ed, tabela: null }))}
        </View>
        {!tabelas.length ? (
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}>
            <WarningIcon size={18} color={colors.warning} />
            <Text style={[t.caption, { flex: 1 }]}>Esta filial ainda não tem tabela de medição: importe o PDF da filial pelo painel web, em Tabelas de arqueação.</Text>
          </View>
        ) : <Text style={t.caption}>Tanques de outra marca, bipartidos ou tripartidos têm medidas diferentes: escolha a tabela do documento deste tanque.</Text>}
      </Sheet>
    ) : null}
  </>;
}
