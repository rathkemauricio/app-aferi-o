import { useContext, useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import type { Combustivel } from '../../lib/combustiveis';
import { CheckIcon, CopySimpleIcon, PlusIcon, TrashIcon, WarningIcon } from '../../ui/icons';
import { Button, Card, confirmAction, Field, notify, SectionHeader, Sheet } from '../../ui/kit';
import { createTypography, radius, space, ThemeContext } from '../../ui/theme';
import { alturaMaxima, type TabelaArqueacao, tabelaDoTanque, volumeTotal } from './arqueacao';
import {
  excluirTanque, nomeTipo, ordenarTanques, partesDo, pontosDoTanque, proximoNumero, salvarTanque, type TanqueFilial, tanquesCol, TIPOS, type TipoTanque,
} from './cadastro';
import { uid } from './model';
import type { TanqueCroqui } from './store';

/** `tabelas[i]` = tabela escolhida para o ponto de medição i (tanque simples ou compartimento A, B, C). */
type Edicao = { t: TanqueFilial; antigo: TanqueFilial | null; tabelas: (string | null)[] };

const fmt = (v: number | null | undefined) => (v === null || v === undefined ? '—' : v.toLocaleString('pt-BR'));
const norm = (t: string) => t.trim().toLowerCase();

/**
 * Tanques da filial: número, tipo (simples, bipartido, tripartido), combustível, marca/modelo e a tabela de medição
 * de cada um (ou de cada compartimento), como nos PDFs de arqueação. A nova medição vem com eles prontos.
 * `sugestao` = tanques do croqui (ou da última medição) para trazer de uma vez quando o cadastro está vazio.
 */
export function CadastroTanques({ filialId, cadastro, tabelas, sugestao, origemSugestao, combustiveis, nomeComb, corComb }: {
  filialId: string; cadastro: TanqueFilial[]; tabelas: TabelaArqueacao[]; sugestao: TanqueCroqui[]; origemSugestao: string;
  combustiveis: Combustivel[]; nomeComb: (id: string) => string; corComb: (id: string) => string;
}) {
  const { colors } = useContext(ThemeContext);
  const t = useMemo(() => createTypography(colors), [colors]);
  const [ed, setEd] = useState<Edicao | null>(null);

  const tabelasDe = (x: TanqueFilial) => pontosDoTanque(x).map(p => tabelaDoTanque(tabelas, p.tanque)?.id ?? null);

  /** Novo tanque já no padrão do modelo (mesmo tipo, combustíveis, marca e tabelas), com o próximo número livre. */
  const novo = (base?: TanqueFilial) => {
    const modelo = base ?? cadastro[cadastro.length - 1];
    setEd({
      t: {
        id: uid('tqf'), filial_id: filialId, numero: proximoNumero(cadastro), combustivel: modelo?.combustivel ?? '',
        tipo: modelo?.tipo ?? 'simples', combustiveis: [...(modelo?.combustiveis ?? [])], modelo: modelo?.modelo ?? '',
      },
      antigo: null,
      tabelas: modelo ? tabelasDe(modelo) : [tabelas.length === 1 ? tabelas[0].id : null],
    });
  };
  const trazer = () => {
    sugestao.forEach(x => tanquesCol.put({ id: uid('tqf'), filial_id: filialId, numero: x.tanque, combustivel: x.combustivel, tipo: 'simples', combustiveis: [], modelo: '' }));
    notify('Tanques cadastrados', `${sugestao.length} tanque(s) ${origemSugestao}. Abra cada um para conferir o tipo, o combustível e a tabela de medição.`);
  };

  const mudarTipo = (tipo: TipoTanque) => {
    if (!ed) return;
    const n = partesDo(tipo), antes = partesDo(ed.t.tipo);
    const combs = antes > 1 ? [...(ed.t.combustiveis ?? [])] : [ed.t.combustivel];
    while (combs.length < n) combs.push('');
    const tabs = [...ed.tabelas];
    while (tabs.length < n) tabs.push(null);
    setEd({ ...ed, t: { ...ed.t, tipo, combustiveis: n > 1 ? combs.slice(0, n) : [], combustivel: combs[0] ?? '' }, tabelas: tabs.slice(0, n) });
  };
  const mudarComb = (i: number, id: string) => {
    if (!ed) return;
    if (partesDo(ed.t.tipo) === 1) { setEd({ ...ed, t: { ...ed.t, combustivel: id } }); return; }
    const combs = [...(ed.t.combustiveis ?? [])];
    combs[i] = id;
    setEd({ ...ed, t: { ...ed.t, combustiveis: combs, combustivel: combs[0] ?? '' } });
  };
  const mudarTabela = (i: number, id: string | null) => {
    if (!ed) return;
    const tabs = [...ed.tabelas];
    tabs[i] = id;
    setEd({ ...ed, tabelas: tabs });
  };

  const salvar = () => {
    if (!ed) return;
    const numero = ed.t.numero.trim();
    if (!numero) { notify('Informe o número do tanque', 'Ex.: 1, 2, 3.'); return; }
    const meus = new Set([norm(numero), ...pontosDoTanque({ ...ed.t, numero }).map(p => norm(p.tanque))]);
    const outro = cadastro.find(x => x.id !== ed.t.id && [x.numero, ...pontosDoTanque(x).map(p => p.tanque)].some(n => meus.has(norm(n))));
    if (outro) { notify('Número repetido', `Já existe o tanque ${outro.numero} nesta filial com esse número.`); return; }
    const pontos = pontosDoTanque({ ...ed.t, numero });
    const gravar = () => { salvarTanque({ ...ed.t, numero }, ed.antigo, ed.tabelas, tabelas); setEd(null); };
    const semTabela = pontos.filter((_, i) => !ed.tabelas[i]);
    if (tabelas.length && semTabela.length) {
      confirmAction('Salvar sem tabela de medição?',
        `${semTabela.map(p => (p.compartimento ? `Compartimento ${p.compartimento}` : `Tanque ${p.tanque}`)).join(', ')} sem tabela: os litros terão de ser digitados na medição.`,
        'Salvar assim', gravar);
      return;
    }
    gravar();
  };
  const excluir = (x: TanqueFilial) => confirmAction('Excluir tanque?', `Tanque ${x.numero}. Sai do cadastro da filial e das tabelas de medição (as medições já feitas não mudam).`, 'Excluir', () => {
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
  /** Detalhes da tabela como no PDF (volume, régua, comprimento) e quem mais a usa. */
  const detalhes = (x: TabelaArqueacao, meus: string[]) => {
    const outros = x.tanques.filter(n => !meus.some(m => norm(m) === norm(n)));
    return [
      `${fmt(x.capacidade ?? volumeTotal(x))} L`, `régua ${fmt(alturaMaxima(x))} cm`, x.comprimento_m ? `${fmt(x.comprimento_m)} m` : '',
      outros.length ? `também ${outros.join(', ')}` : '',
    ].filter(Boolean).join(' · ');
  };

  const pontosEd = ed ? pontosDoTanque(ed.t) : [];
  const meusAntigos = ed?.antigo ? pontosDoTanque(ed.antigo).map(p => p.tanque) : [];

  return <>
    <SectionHeader title={`Tanques da filial (${cadastro.length})`} />
    <Text style={t.caption}>Cadastre os tanques da filial e ligue cada um (ou cada compartimento, no bi/tripartido) à sua tabela de medição, como nos PDFs de arqueação. Toda nova medição já vem com eles.</Text>
    {cadastro.length ? (
      <Card style={{ padding: space.xs, gap: 0 }}>
        {ordenarTanques(cadastro).map((x, i) => {
          const pontos = pontosDoTanque(x);
          const partido = pontos.length > 1;
          return (
            <Pressable key={x.id} accessibilityRole="button" accessibilityLabel={`Editar tanque ${x.numero}`}
              onPress={() => setEd({ t: x, antigo: x, tabelas: tabelasDe(x) })}
              style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10 }, i > 0 && { borderTopWidth: 1, borderTopColor: colors.border }, pressed && { opacity: 0.7 }]}>
              <View style={{ minWidth: 34, height: 34, borderRadius: 17, paddingHorizontal: 6, backgroundColor: x.combustivel ? corComb(x.combustivel) : colors.surfaceMuted, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: '#fff', fontWeight: '800' }}>{x.numero}</Text>
              </View>
              <View style={{ flex: 1, gap: 1 }}>
                <Text style={t.bodyStrong} numberOfLines={1}>
                  Tanque {x.numero}{partido ? ` · ${nomeTipo(x.tipo)}` : ` · ${x.combustivel ? nomeComb(x.combustivel) : 'sem combustível'}`}{x.modelo ? ` · ${x.modelo}` : ''}
                </Text>
                {pontos.map(p => {
                  const tab = tabelaDoTanque(tabelas, p.tanque);
                  return (
                    <Text key={p.tanque} style={[t.caption, !tab && tabelas.length > 0 && { color: colors.warning, fontWeight: '700' }]} numberOfLines={1}>
                      {partido ? `${p.tanque} · ${p.combustivel ? nomeComb(p.combustivel) : 'sem combustível'} · ` : ''}{tab ? `Tabela ${tab.nome}` : 'Sem tabela (litros digitados)'}
                    </Text>
                  );
                })}
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
    {cadastro.length ? <Text style={t.caption}>O botão de cópia ao lado de cada tanque cria outro igual (mesmo tipo, combustível, marca e tabelas) com o próximo número.</Text> : null}

    {ed ? (
      <Sheet title={ed.antigo ? `Tanque ${ed.antigo.numero}` : 'Novo tanque'} onClose={() => setEd(null)}
        footer={<View style={{ gap: space.sm }}>
          <Button title="Salvar tanque" icon={CheckIcon} onPress={salvar} />
          {ed.antigo ? <Button title="Excluir tanque" icon={TrashIcon} variant="danger" size="sm" onPress={() => excluir(ed.antigo!)} /> : null}
        </View>}>
        <Field label="Número do tanque" value={ed.t.numero} onChangeText={v => setEd({ ...ed, t: { ...ed.t, numero: v } })} placeholder="Ex.: 1" />
        <Text style={t.label}>Tipo do tanque</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {TIPOS.map(x => chip((ed.t.tipo ?? 'simples') === x.id, x.partes > 1 ? `${x.nome} (${x.partes})` : x.nome, () => mudarTipo(x.id)))}
        </View>
        {pontosEd.length > 1 ? <Text style={t.caption}>Cada compartimento é medido à parte na medição ({pontosEd.map(p => p.tanque).join(', ')}), com combustível e tabela próprios.</Text> : null}
        <Field label="Marca / modelo (opcional)" value={ed.t.modelo ?? ''} onChangeText={v => setEd({ ...ed, t: { ...ed.t, modelo: v } })} placeholder="Como no PDF da tabela. Ex.: Zeppini 15.000 L" />

        {pontosEd.map((p, i) => (
          <View key={i} style={[{ gap: space.sm }, pontosEd.length > 1 && { padding: space.sm, borderRadius: radius.control, borderWidth: 1, borderColor: colors.border }]}>
            {p.compartimento ? <Text style={t.bodyStrong}>Compartimento {p.compartimento} · medido como {p.tanque || '—'}</Text> : null}
            <Text style={t.label}>Combustível</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {combustiveis.filter(c => c.ativo !== false || c.id === p.combustivel).map(c => chip(p.combustivel === c.id, c.nome, () => mudarComb(i, c.id), c.cor))}
            </View>
            <Text style={t.label}>Tabela de medição (arqueação)</Text>
            <View style={{ gap: 6 }}>
              {tabelas.map(x => opcao(ed.tabelas[i] === x.id, x.nome, () => mudarTabela(i, x.id), detalhes(x, [...meusAntigos, ...pontosEd.map(q => q.tanque)])))}
              {opcao(!ed.tabelas[i], 'Sem tabela (digitar os litros)', () => mudarTabela(i, null))}
            </View>
          </View>
        ))}
        {!tabelas.length ? (
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}>
            <WarningIcon size={18} color={colors.warning} />
            <Text style={[t.caption, { flex: 1 }]}>Esta filial ainda não tem tabela de medição: importe o PDF de cada tanque pelo painel web, em Tabelas de arqueação, e volte aqui para ligar.</Text>
          </View>
        ) : <Text style={t.caption}>Escolha a tabela do PDF deste tanque{pontosEd.length > 1 ? ' (ou de cada compartimento)' : ''}: tanques de outra marca, bipartidos ou tripartidos têm medidas diferentes.</Text>}
      </Sheet>
    ) : null}
  </>;
}
