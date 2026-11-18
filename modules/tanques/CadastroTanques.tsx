import { useContext, useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import type { Combustivel } from '../../lib/combustiveis';
import { CheckIcon, CopySimpleIcon, PlusIcon, TrashIcon } from '../../ui/icons';
import { Button, Card, confirmAction, Field, notify, SectionHeader, Sheet } from '../../ui/kit';
import { createTypography, radius, space, ThemeContext } from '../../ui/theme';
import { type TabelaArqueacao, tabelaDoTanque, vincularTanque } from './arqueacao';
import { ordenarTanques, proximoNumero, salvarTanque, type TanqueFilial, tanquesCol } from './cadastro';
import { uid } from './model';
import type { TanqueCroqui } from './store';

type Edicao = { t: TanqueFilial; numeroAntigo: string | null; tabela: string | null };

/**
 * Tanques da filial: número, combustível e tabela de arqueação. A nova medição vem com eles prontos.
 * `sugestao` = tanques do croqui (ou da última medição) para trazer de uma vez quando o cadastro está vazio.
 */
export function CadastroTanques({ filialId, cadastro, tabelas, sugestao, origemSugestao, combustiveis, nomeComb, corComb }: {
  filialId: string; cadastro: TanqueFilial[]; tabelas: TabelaArqueacao[]; sugestao: TanqueCroqui[]; origemSugestao: string;
  combustiveis: Combustivel[]; nomeComb: (id: string) => string; corComb: (id: string) => string;
}) {
  const { colors } = useContext(ThemeContext);
  const t = useMemo(() => createTypography(colors), [colors]);
  const [ed, setEd] = useState<Edicao | null>(null);

  /** Novo tanque já no padrão do último (mesmo combustível e mesma tabela), com o próximo número livre. */
  const novo = (base?: TanqueFilial) => {
    const modelo = base ?? cadastro[cadastro.length - 1];
    setEd({
      t: { id: uid('tqf'), filial_id: filialId, numero: proximoNumero(cadastro), combustivel: modelo?.combustivel ?? '' },
      numeroAntigo: null, tabela: modelo ? tabelaDoTanque(tabelas, modelo.numero)?.id ?? null : (tabelas.length === 1 ? tabelas[0].id : null),
    });
  };
  const trazer = () => {
    sugestao.forEach(x => tanquesCol.put({ id: uid('tqf'), filial_id: filialId, numero: x.tanque, combustivel: x.combustivel }));
    notify('Tanques cadastrados', `${sugestao.length} tanque(s) ${origemSugestao}. Confira o combustível e a tabela de cada um.`);
  };
  const salvar = () => {
    if (!ed) return;
    const numero = ed.t.numero.trim();
    if (!numero) { notify('Informe o número do tanque', 'Ex.: 1, 2, 3.'); return; }
    if (cadastro.some(x => x.id !== ed.t.id && x.numero.trim().toLowerCase() === numero.toLowerCase())) { notify('Número repetido', `Já existe o tanque ${numero} nesta filial.`); return; }
    salvarTanque({ ...ed.t, numero }, ed.numeroAntigo, tabelas);
    // A tabela é ligada pelo número (depois de renomear, as tabelas já acompanham o número novo).
    const tabelasAtualizadas = tabelas.map(x => ({ ...x, tanques: ed.numeroAntigo ? x.tanques.map(n => (n.trim().toLowerCase() === ed.numeroAntigo!.trim().toLowerCase() ? numero : n)) : x.tanques }));
    vincularTanque(tabelasAtualizadas, numero, ed.tabela);
    setEd(null);
  };
  const excluir = (x: TanqueFilial) => confirmAction('Excluir tanque?', `Tanque ${x.numero}. Sai do cadastro da filial (as medições já feitas não mudam).`, 'Excluir', () => {
    vincularTanque(tabelas, x.numero, null);
    tanquesCol.remove(x.id);
    setEd(null);
  });

  const opcao = (on: boolean, rotulo: string, onPress: () => void, cor?: string, extra?: string) => (
    <Pressable key={rotulo} accessibilityRole="radio" accessibilityState={{ selected: on }} onPress={onPress}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44, paddingHorizontal: 10, borderRadius: radius.control, borderWidth: 1.5, borderColor: on ? colors.accent : colors.border, backgroundColor: on ? colors.accentSoft : colors.campo }}>
      {cor ? <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: cor }} /> : null}
      <Text style={[t.body, { flex: 1 }, on && { fontWeight: '800', color: colors.accentText }]}>{rotulo}</Text>
      {extra ? <Text style={t.caption}>{extra}</Text> : null}
      {on ? <CheckIcon size={16} color={colors.accentText} /> : null}
    </Pressable>
  );

  return <>
    <SectionHeader title={`Tanques da filial (${cadastro.length})`} />
    <Text style={t.caption}>Cadastre aqui os tanques da filial. Toda nova medição já vem com eles (número, combustível e tabela de arqueação).</Text>
    {cadastro.length ? (
      <Card style={{ padding: space.xs, gap: 0 }}>
        {ordenarTanques(cadastro).map((x, i) => {
          const tab = tabelaDoTanque(tabelas, x.numero);
          return (
            <Pressable key={x.id} accessibilityRole="button" accessibilityLabel={`Editar tanque ${x.numero}`}
              onPress={() => setEd({ t: x, numeroAntigo: x.numero, tabela: tab?.id ?? null })}
              style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10 }, i > 0 && { borderTopWidth: 1, borderTopColor: colors.border }, pressed && { opacity: 0.7 }]}>
              <View style={{ minWidth: 34, height: 34, borderRadius: 17, paddingHorizontal: 6, backgroundColor: x.combustivel ? corComb(x.combustivel) : colors.surfaceMuted, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: '#fff', fontWeight: '800' }}>{x.numero}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={t.bodyStrong} numberOfLines={1}>Tanque {x.numero} · {x.combustivel ? nomeComb(x.combustivel) : 'sem combustível'}</Text>
                <Text style={t.caption} numberOfLines={1}>{tab ? `Tabela ${tab.nome}` : 'Sem tabela de arqueação (litros digitados)'}</Text>
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
    {cadastro.length ? <Text style={t.caption}>O botão de cópia ao lado de cada tanque cria outro igual (mesmo combustível e tabela) com o próximo número.</Text> : null}

    {ed ? (
      <Sheet title={ed.numeroAntigo ? `Tanque ${ed.numeroAntigo}` : 'Novo tanque'} onClose={() => setEd(null)}
        footer={<View style={{ gap: space.sm }}>
          <Button title="Salvar tanque" icon={CheckIcon} onPress={salvar} />
          {ed.numeroAntigo ? <Button title="Excluir tanque" icon={TrashIcon} variant="danger" size="sm" onPress={() => excluir(ed.t)} /> : null}
        </View>}>
        <Field label="Número do tanque" value={ed.t.numero} onChangeText={v => setEd({ ...ed, t: { ...ed.t, numero: v } })} placeholder="Ex.: 1" />
        <Text style={t.label}>Combustível</Text>
        <View style={{ gap: 6 }}>
          {combustiveis.filter(c => c.ativo !== false || c.id === ed.t.combustivel).map(c => opcao(ed.t.combustivel === c.id, c.nome, () => setEd({ ...ed, t: { ...ed.t, combustivel: c.id } }), c.cor))}
        </View>
        <Text style={t.label}>Tabela de arqueação</Text>
        <View style={{ gap: 6 }}>
          {tabelas.map(x => opcao(ed.tabela === x.id, x.nome, () => setEd({ ...ed, tabela: x.id }), undefined,
            x.tanques.filter(n => n !== ed.numeroAntigo).length ? `também tanque${x.tanques.length > 1 ? 's' : ''} ${x.tanques.filter(n => n !== ed.numeroAntigo).join(', ')}` : undefined))}
          {opcao(ed.tabela === null, 'Sem tabela (digitar os litros)', () => setEd({ ...ed, tabela: null }))}
        </View>
        {!tabelas.length ? <Text style={t.caption}>Esta filial ainda não tem tabela de arqueação: importe o PDF pelo painel web, em Tabelas de arqueação.</Text> : null}
      </Sheet>
    ) : null}
  </>;
}
