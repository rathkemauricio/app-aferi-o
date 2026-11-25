import { useRouter } from 'expo-router';
import * as Updates from 'expo-updates';
import { useContext, useMemo, useState } from 'react';
import { Image, Platform, Pressable, ScrollView, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../lib/auth';
import { escolherLogo } from '../../lib/bandeiras';
import { useFiliais } from '../../lib/data';
import { salvarLogoDaRede, useIdentidade } from '../../lib/identidade';
import { PADRAO, restaurarPadrao, setPreferencia, usePreferencias } from '../../lib/preferencias';
import { tocar } from '../../lib/sons';
import { rotuloFilial } from '../../lib/util';
import { rotuloVersao, VERSAO } from '../../lib/versao';
import { ArrowLeftIcon, CheckIcon, MinusIcon, PlusIcon, ResetIcon } from '../../ui/icons';
import { Button, Card, ChoiceChips, confirmAction, IconButton, notify, SectionHeader, Sheet } from '../../ui/kit';
import { createTypography, ESCALAS, pageMaxWidth, radius, space, type Tema, TEMAS, ThemeContext } from '../../ui/theme';
import { BotaoVoltar } from '../../ui/voltar';

const LIMITES: [number, string][] = [[0, 'Nunca'], [50, 'Acima de 50'], [100, 'Acima de 100'], [500, 'Acima de 500']];
const TIPOS: ['completo' | 'parcial', string][] = [['completo', 'Completo'], ['parcial', 'Parcial']];
const LAYOUTS: ['simples' | 'completo', string][] = [['simples', 'Simples'], ['completo', 'Completo']];
const MODOS_SEM_LEITOR: ['lista' | 'camera' | 'digitar', string][] = [['lista', 'Lista'], ['camera', 'Câmera'], ['digitar', 'Digitar']];

/** Configurações personalizadas deste aparelho (celular ou navegador): aparência, coleta, inventário e atualizações. */
export default function ConfiguracoesScreen() {
  const router = useRouter();
  const { colors, preferenciaTema, setPreferenciaTema, escala, setEscala } = useContext(ThemeContext);
  const t = useMemo(() => createTypography(colors), [colors]);
  const pref = usePreferencias();
  const { filiais } = useFiliais();
  const { isAdmin, empresa } = useAuth();
  const marca = useIdentidade();
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

  /** Miniatura do tema: fundo, cartão sólido, botão e destaque nas cores dele. */
  const amostra = (tm: Tema) => {
    const on = preferenciaTema === tm.id;
    const k = tm.cores;
    return (
      <Pressable key={tm.id} accessibilityRole="radio" accessibilityState={{ selected: on }} accessibilityLabel={`Tema ${tm.nome}`} onPress={() => setPreferenciaTema(tm.id)}
        style={({ pressed }) => [{ width: 148, flexGrow: 1, borderRadius: radius.control, borderWidth: on ? 2.5 : 1, borderColor: on ? colors.accent : colors.border, overflow: 'hidden' }, pressed && { opacity: 0.85 }]}>
        <View style={{ backgroundColor: k.bg, padding: 10, gap: 6 }}>
          <View style={{ backgroundColor: k.surface, borderRadius: 8, padding: 8, gap: 5, borderWidth: 1, borderColor: k.border }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <View style={{ width: 16, height: 16, borderRadius: 5, backgroundColor: k.surfaceMuted }} />
              <View style={{ flex: 1, height: 6, borderRadius: 3, backgroundColor: k.text, opacity: 0.85 }} />
              <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: k.mint }} />
            </View>
            <View style={{ height: 5, width: '70%', borderRadius: 3, backgroundColor: k.textMuted, opacity: 0.7 }} />
          </View>
          <View style={{ height: 16, borderRadius: 6, backgroundColor: k.accent }} />
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 8, backgroundColor: colors.surface }}>
          <Text style={{ flex: 1, fontSize: 12.5, fontWeight: '700', color: colors.text }} numberOfLines={2}>{tm.nome}</Text>
          {on ? <CheckIcon size={14} color={colors.accentText} weight="bold" /> : null}
        </View>
      </Pressable>
    );
  };
  const amostraAuto = (
    <Pressable accessibilityRole="radio" accessibilityState={{ selected: preferenciaTema === 'auto' }} onPress={() => setPreferenciaTema('auto')}
      style={({ pressed }) => [{ width: 148, flexGrow: 1, borderRadius: radius.control, borderWidth: preferenciaTema === 'auto' ? 2.5 : 1, borderColor: preferenciaTema === 'auto' ? colors.accent : colors.border, overflow: 'hidden' }, pressed && { opacity: 0.85 }]}>
      <View style={{ flexDirection: 'row', height: 86 }}>
        <View style={{ flex: 1, backgroundColor: TEMAS[0].cores.bg }} />
        <View style={{ flex: 1, backgroundColor: TEMAS[1].cores.bg }} />
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 8, backgroundColor: colors.surface }}>
        <Text style={{ flex: 1, fontSize: 12.5, fontWeight: '700', color: colors.text }} numberOfLines={2}>Automático</Text>
        {preferenciaTema === 'auto' ? <CheckIcon size={14} color={colors.accentText} weight="bold" /> : null}
      </View>
    </Pressable>
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
        <BotaoVoltar label="Voltar" onPress={voltar} />
        <Text style={{ flex: 1, fontSize: 15.5, fontWeight: '800', color: colors.text }}>Configurações</Text>
      </View>
      <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.md, width: '100%', maxWidth: pageMaxWidth(640), alignSelf: 'center', paddingBottom: 56 }}>
        <Text style={t.caption}>As preferências abaixo valem só para {celular ? 'este celular' : 'este navegador'}: cada aparelho pode ter as suas.{isAdmin && empresa ? ' A identidade da rede vale para todos.' : ''}</Text>

        {isAdmin && empresa ? <>
          <SectionHeader title="Identidade da rede" />
          <Card>
            <Text style={t.caption}>Vale para a rede toda (só o administrador altera). O nome e o logotipo aparecem nos certificados do Filial Destaque, nos checklists impressos e nos relatórios de auditoria.</Text>
            {linha('Nome da rede', `${empresa.nome} (vem do cadastro da empresa no EasyAudit)`, null)}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.sm }}>
              <View style={{ width: 120, height: 56, borderRadius: radius.control, borderWidth: 1, borderColor: colors.border, backgroundColor: '#ffffff', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                {marca.logo ? <Image source={{ uri: marca.logo }} style={{ width: 112, height: 48 }} resizeMode="contain" accessibilityLabel={`Logotipo da ${empresa.nome}`} />
                  : <Text style={[t.caption, { textAlign: 'center' }]}>Sem logotipo</Text>}
              </View>
              <View style={{ flex: 1, gap: space.sm }}>
                <Button title={marca.logo ? 'Trocar logotipo' : 'Escolher logotipo'} size="sm" variant="secondary"
                  onPress={() => void escolherLogo().then(l => { if (l) { salvarLogoDaRede(l); notify('Logotipo salvo', 'Os próximos impressos já saem com ele.'); } }).catch(e => notify('Logotipo não salvo', e instanceof Error ? e.message : ''))} />
                {marca.logo ? <Button title="Remover" size="sm" variant="ghost" onPress={() => confirmAction('Remover o logotipo?', 'Os impressos passam a mostrar só o nome da rede.', 'Remover', () => salvarLogoDaRede(null))} /> : null}
              </View>
            </View>
          </Card>
        </> : null}

        <SectionHeader title="Ajuda" />
        <Card>
          {linha('Tutoriais', 'Passeios guiados pelas telas: primeiros passos, contagens e usuários.',
            <Button title="Abrir" size="sm" variant="secondary" onPress={() => router.push('/tutoriais')} />)}
        </Card>

        <SectionHeader title="Aparência" />
        <Card>
          {linha('Tema', preferenciaTema === 'auto' ? 'Automático: EasyAudit claro ou escuro, conforme o aparelho' : 'Toque numa aparência para usar. O sol/lua do topo troca entre a versão clara e a escura.', null)}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
            {amostraAuto}
            {TEMAS.map(tm => amostra(tm))}
          </View>
          {linha('Tamanho de fontes e ícones', escala === 1 ? 'Padrão' : `${Math.round(escala * 100)}% do padrão`,
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <IconButton icon={MinusIcon} label="Diminuir fontes e ícones" onPress={() => { if (iEscala > 0) setEscala(ESCALAS[iEscala - 1]); }} />
              <Text style={{ minWidth: 44, textAlign: 'center', fontWeight: '800', color: colors.text, fontVariant: ['tabular-nums'] }}>{Math.round(escala * 100)}%</Text>
              <IconButton icon={PlusIcon} label="Aumentar fontes e ícones" onPress={() => { if (iEscala < ESCALAS.length - 1) setEscala(ESCALAS[iEscala + 1]); }} />
            </View>)}
        </Card>

        <SectionHeader title="Contagens" />
        <Card>
          {linha('Layout da tela de coleta', pref.layoutColeta === 'simples' ? 'Simples: quadro amarelo do item e botões grandes com nome.' : 'Completo: cartão do item, quantidade com Salvar ao lado e total embaixo.', null)}
          {escolha(LAYOUTS, pref.layoutColeta, v => setPreferencia('layoutColeta', v))}
          {linha('Coleta simples', 'Ligada, a aba vira a própria coleta: só a pesquisa e os itens, cada um com o campo para somar, corrigir e, ao tocar no cartão, as informações e o histórico. Desligada, a aba Itens só consulta: não dá para coletar nem corrigir pelos itens (a coleta é pela aba Coleta).',
            <Switch value={pref.coletaSimples} onValueChange={v => setPreferencia('coletaSimples', v)} accessibilityLabel="Coleta simples" />)}
          {linha('Sons', 'Correto ao reconhecer o item, salvo ao gravar e barrado quando não pode coletar.',
            <Switch value={pref.sons} onValueChange={v => { setPreferencia('sons', v); if (v) tocar('correto'); }} accessibilityLabel="Sons da coleta" />)}
          {linha('Celular sem leitor', 'Nas filiais marcadas "sem leitor" (cadastro da filial): como contar neste aparelho. Dá para trocar na tela da contagem.', null)}
          {escolha(MODOS_SEM_LEITOR, pref.modoSemLeitor, v => setPreferencia('modoSemLeitor', v))}
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
