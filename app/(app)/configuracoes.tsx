import { useRouter } from 'expo-router';
import * as Updates from 'expo-updates';
import { useContext, useMemo, useState } from 'react';
import { Platform, ScrollView, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFiliais } from '../../lib/data';
import { PADRAO, restaurarPadrao, setPreferencia, usePreferencias } from '../../lib/preferencias';
import { tocar } from '../../lib/sons';
import { rotuloFilial } from '../../lib/util';
import { rotuloVersao, VERSAO } from '../../lib/versao';
import { ArrowLeftIcon, MinusIcon, PlusIcon, ResetIcon } from '../../ui/icons';
import { Button, Card, ChoiceChips, confirmAction, IconButton, notify, SectionHeader, Sheet } from '../../ui/kit';
import { createTypography, ESCALAS, pageMaxWidth, type PreferenciaTema, space, ThemeContext } from '../../ui/theme';

const TEMAS: [PreferenciaTema, string][] = [['light', 'Claro'], ['dark', 'Escuro'], ['auto', 'Automático']];
const LIMITES: [number, string][] = [[0, 'Nunca'], [50, 'Acima de 50'], [100, 'Acima de 100'], [500, 'Acima de 500']];
const TIPOS: ['completo' | 'parcial', string][] = [['completo', 'Completo'], ['parcial', 'Parcial']];
const LAYOUTS: ['simples' | 'completo', string][] = [['simples', 'Simples'], ['completo', 'Completo']];

/** Configurações personalizadas deste aparelho (celular ou navegador): aparência, coleta, inventário e atualizações. */
export default function ConfiguracoesScreen() {
  const router = useRouter();
  const { colors, preferenciaTema, setPreferenciaTema, escala, setEscala } = useContext(ThemeContext);
  const t = useMemo(() => createTypography(colors), [colors]);
  const pref = usePreferencias();
  const { filiais } = useFiliais();
  const [escolherFilial, setEscolherFilial] = useState(false);
  const [procurando, setProcurando] = useState(false);
  const voltar = () => (router.canGoBack() ? router.back() : router.replace('/'));
  const iEscala = ESCALAS.indexOf(escala as (typeof ESCALAS)[number]);
  const filial = filiais.find(f => f.id === pref.filialPadrao);
  const celular = Platform.OS !== 'web';

  const linha = (titulo: string, sub: string, direita: React.ReactNode) => (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.sm }}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={t.bodyStrong}>{titulo}</Text>
        {sub ? <Text style={t.caption}>{sub}</Text> : null}
      </View>
      {direita}
    </View>
  );
  const escolha = <T extends string | number>(opcoes: [T, string][], valor: T, mudar: (v: T) => void) => (
    <ChoiceChips value={opcoes.find(o => o[0] === valor)?.[1] ?? ''} options={opcoes.map(o => o[1])} onChange={rot => { const o = opcoes.find(x => x[1] === rot); if (o) mudar(o[0]); }} />
  );

  const procurarAtualizacao = async () => {
    setProcurando(true);
    try {
      const r = await Updates.checkForUpdateAsync();
      if (!r.isAvailable) { notify('O app está atualizado', `Você já está com a versão mais recente (${rotuloVersao}).`); return; }
      await Updates.fetchUpdateAsync();
      confirmAction('Atualização baixada', 'O app vai reiniciar já atualizado. Coletas salvas não se perdem.', 'Atualizar agora', () => void Updates.reloadAsync());
    } catch (e) {
      notify('Não foi possível procurar', e instanceof Error && /network|internet|fetch/i.test(e.message) ? 'Confira a internet e tente de novo.' : 'Tente de novo em instantes.');
    } finally { setProcurando(false); }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.lg, paddingVertical: space.md, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border }}>
        <IconButton icon={ArrowLeftIcon} label="Voltar" onPress={voltar} />
        <Text style={{ flex: 1, fontSize: 15.5, fontWeight: '800', color: colors.text }}>Configurações</Text>
      </View>
      <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.md, width: '100%', maxWidth: pageMaxWidth(640), alignSelf: 'center', paddingBottom: 56 }}>
        <Text style={t.caption}>Valem só para {celular ? 'este celular' : 'este navegador'}. Cada aparelho pode ter as suas.</Text>

        <SectionHeader title="Aparência" />
        <Card>
          {linha('Tema', preferenciaTema === 'auto' ? 'Segue o tema do aparelho' : '', null)}
          {escolha(TEMAS, preferenciaTema, setPreferenciaTema)}
          {linha('Tamanho de fontes e ícones', escala === 1 ? 'Padrão' : `${Math.round(escala * 100)}% do padrão`,
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <IconButton icon={MinusIcon} label="Diminuir fontes e ícones" onPress={() => { if (iEscala > 0) setEscala(ESCALAS[iEscala - 1]); }} />
              <Text style={{ minWidth: 44, textAlign: 'center', fontWeight: '800', color: colors.text, fontVariant: ['tabular-nums'] }}>{Math.round(escala * 100)}%</Text>
              <IconButton icon={PlusIcon} label="Aumentar fontes e ícones" onPress={() => { if (iEscala < ESCALAS.length - 1) setEscala(ESCALAS[iEscala + 1]); }} />
            </View>)}
        </Card>

        <SectionHeader title="Coleta" />
        <Card>
          {linha('Layout da tela de coleta', pref.layoutColeta === 'simples' ? 'Simples: quadro amarelo do item e botões grandes com nome.' : 'Completo: cartão do item, quantidade com Salvar ao lado e total embaixo.', null)}
          {escolha(LAYOUTS, pref.layoutColeta, v => setPreferencia('layoutColeta', v))}
          {linha('Sons', 'Correto ao reconhecer o item, salvo ao gravar e barrado quando não pode coletar.',
            <Switch value={pref.sons} onValueChange={v => { setPreferencia('sons', v); if (v) tocar('correto'); }} accessibilityLabel="Sons da coleta" />)}
          {linha('Teclado na tela', 'Já ligado ao abrir a coleta. Desligue em coletores com leitor de código.',
            <Switch value={pref.tecladoColeta} onValueChange={v => setPreferencia('tecladoColeta', v)} accessibilityLabel="Teclado na tela ao abrir a coleta" />)}
          {linha('Confirmar quantidades grandes', 'Pergunta antes de salvar, para evitar erro de digitação.', null)}
          {escolha(LIMITES, pref.confirmarAcima, v => setPreferencia('confirmarAcima', v))}
        </Card>

        <SectionHeader title="Padrões do inventário" />
        <Card>
          {linha('Filial padrão', filial ? rotuloFilial(filial) : 'Nenhuma: escolher a cada inventário',
            <Button title={filial ? 'Trocar' : 'Escolher'} size="sm" variant="secondary" onPress={() => setEscolherFilial(true)} />)}
          {filial ? <Button title="Limpar filial padrão" size="sm" variant="secondary" onPress={() => setPreferencia('filialPadrao', null)} style={{ alignSelf: 'flex-start' }} /> : null}
          {linha('Tipo padrão', 'Já vem escolhido ao abrir inventário.', null)}
          {escolha(TIPOS, pref.tipoPadrao, v => setPreferencia('tipoPadrao', v))}
        </Card>

        <SectionHeader title="Atualizações e sobre" />
        <Card>
          {linha('Versão', rotuloVersao, null)}
          {celular
            ? <>
              {linha('Atualização em uso', Updates.isEnabled ? (Updates.isEmbeddedLaunch ? 'A que veio no APK' : `Publicada em ${Updates.createdAt?.toLocaleString('pt-BR') ?? '—'}`) : 'Atualizações automáticas desligadas neste APK', null)}
              <Button title={procurando ? 'Procurando…' : 'Procurar atualização agora'} icon={ResetIcon} variant="secondary" disabled={procurando || !Updates.isEnabled} onPress={() => void procurarAtualizacao()} />
              <Text style={t.caption}>O app também procura sozinho ao abrir e mostra "Atualização pronta" quando houver.</Text>
            </>
            : <Text style={t.caption}>Painel web: sempre na versão mais recente ao recarregar a página ({VERSAO}).</Text>}
        </Card>

        <Button title="Restaurar padrões deste aparelho" variant="secondary" onPress={() => confirmAction('Restaurar padrões?', 'Sons, teclado, confirmação, filial e tipo voltam ao padrão. Tema e tamanho de fontes também.', 'Restaurar', () => { restaurarPadrao(); setPreferenciaTema('light'); setEscala(1); })} />
        <Text style={[t.caption, { textAlign: 'center' }]}>Padrão: coleta simples, sons ligados, teclado desligado, confirmar acima de {PADRAO.confirmarAcima}, tipo completo.</Text>
      </ScrollView>

      {escolherFilial && (
        <Sheet title="Filial padrão" onClose={() => setEscolherFilial(false)}>
          {filiais.map(f => (
            <Button key={f.id} title={rotuloFilial(f)} variant={f.id === pref.filialPadrao ? 'primary' : 'secondary'} size="sm" onPress={() => { setPreferencia('filialPadrao', f.id); setEscolherFilial(false); }} />
          ))}
        </Sheet>
      )}
    </SafeAreaView>
  );
}
