import { useRouter } from 'expo-router';
import { type ComponentRef, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { type LayoutChangeEvent, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, FadeIn, FadeInDown, useReducedMotion } from 'react-native-reanimated';
import { CTA_EMPRESA, Faixa, SiteFooter, SiteNav, useSite } from '../components/site/SiteChrome';
import { COMBUSTIVEIS_PADRAO } from '../lib/combustiveis';
import { supabase } from '../lib/supabase';
import { CroquiCanvas } from '../modules/croqui/Canvas';
import { type BombaCadastro, layoutInicial, PALETA_CLARA, PALETA_ESCURA, tipoDoCombustivel } from '../modules/croqui/model';
import { MODULES } from '../modules/registry';
import { CheckIcon, EnvelopeIcon, GasPumpIcon, StorefrontIcon, WarningCircleIcon } from '../ui/icons';
import { Button } from '../ui/kit';
import { tint, type ThemeColors } from '../ui/theme';

type Plano = { id: string; nome: string; descricao: string; preco_mensal: number | null; limite_contas: number; modulos: string[]; ordem: number };

const EASE = Easing.bezier(0.23, 1, 0.32, 1);
const nomeModulo = (id: string) => MODULES.find(m => m.id === id)?.name ?? id;
const preco = (v: number | null) => (v === null ? 'Sob consulta' : `${v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })}/mês`);

/** Croqui de exemplo (o componente real do sistema): 6 bombas e o andamento da aferição de cada uma. */
function useCroquiExemplo() {
  return useMemo(() => {
    const bombas: BombaCadastro[] = [
      ['Gasolina comum', 'Gasolina aditivada', 'Etanol', 'Gasolina comum'],
      ['Gasolina comum', 'Etanol'],
      ['Diesel S10', 'Diesel S10', 'Diesel S500'],
      ['Gasolina comum', 'Gasolina aditivada', 'Etanol', 'Gasolina comum'],
      ['Diesel S10', 'Diesel S500'],
      ['Gasolina comum', 'Etanol'],
    ].map((fuels, i) => ({ id: `ex-${i + 1}`, number: `Bomba 0${i + 1}`, nozzles: fuels.map((f, j) => ({ id: `ex-${i + 1}-${j}`, number: String(i * 4 + j + 1).padStart(2, '0'), fuel: f })) }));
    const items = layoutInicial(bombas, nome => tipoDoCombustivel(nome, COMBUSTIVEIS_PADRAO));
    const cores = ['#16a34a', '#16a34a', '#d97706', '#16a34a', '#dc2626', '#d97706'];
    const destaques: Record<string, string> = {};
    items.forEach(it => { const i = bombas.findIndex(b => b.id === it.ref); if (i >= 0) destaques[it.id] = cores[i]; });
    return { items, destaques };
  }, []);
}

export default function Inicio() {
  const router = useRouter();
  const { colors, mode, desktop } = useSite();
  const s = useMemo(() => estilos(colors, desktop), [colors, desktop]);
  const reduz = useReducedMotion();
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  const yPlanos = useRef(0);
  const irParaPlanos = useCallback(() => scroll.current?.scrollTo({ y: yPlanos.current - 8, animated: !reduz }), [reduz]);
  const croqui = useCroquiExemplo();
  const paleta = useMemo(() => ({ ...(mode === 'dark' ? PALETA_ESCURA : PALETA_CLARA), accent: colors.accent }), [mode, colors.accent]);

  const [planos, setPlanos] = useState<Plano[] | null>(null);
  const [erroPlanos, setErroPlanos] = useState(false);
  const carregarPlanos = useCallback(async () => {
    setErroPlanos(false);
    if (!supabase) { setErroPlanos(true); return; }
    const { data, error } = await supabase.from('planos').select('id,nome,descricao,preco_mensal,limite_contas,modulos,ordem').eq('ativo', true).order('ordem');
    if (error) setErroPlanos(true); else setPlanos((data ?? []) as Plano[]);
  }, []);
  useEffect(() => { void carregarPlanos(); }, [carregarPlanos]);

  const entrada = (atraso: number) => (reduz ? undefined : FadeInDown.duration(420).delay(atraso).easing(EASE));
  // Mosaico dos módulos: linhas com larguras diferentes (2+1, 1+1+1, 1+2, 1+1), uma célula por módulo.
  const linhasMosaico = desktop ? [[2, 1], [1, 1, 1], [1, 2], [1, 1]] : MODULES.map(() => [1]);
  let k = 0;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <SiteNav onPlanos={irParaPlanos} />
      <ScrollView ref={scroll} contentContainerStyle={{ paddingBottom: 0 }}>
        {/* Abertura: mensagem à esquerda, o croqui real do sistema à direita. */}
        <Faixa style={s.hero}>
          <Animated.View entering={entrada(0)} style={s.heroTexto}>
            <Text style={s.h1} accessibilityRole="header">Auditoria de postos, do pátio ao relatório.</Text>
            <Text style={s.sub}>Aferições, tanques, inventários e auditorias num só app, com o nome de quem fez cada registro.</Text>
            <View style={s.ctas}>
              <Button title={CTA_EMPRESA} onPress={() => router.push('/criar-empresa')} />
              <Button title="Ver planos" variant="secondary" onPress={irParaPlanos} />
            </View>
          </Animated.View>
          <Animated.View entering={reduz ? undefined : FadeIn.duration(520).delay(140).easing(EASE)} style={s.heroVisual}>
            <View style={s.moldura}>
              <CroquiCanvas items={croqui.items} bandeira="branca" mostrarNomes={false} paleta={paleta} destaques={croqui.destaques} enquadrar />
            </View>
            <Text style={s.legenda}>Croqui da filial no sistema: verde aferida, amarelo em andamento, vermelho com não conformidade.</Text>
          </Animated.View>
        </Faixa>

        {/* Módulos em mosaico. */}
        <Faixa style={s.secao}>
          <Text style={s.h2} accessibilityRole="header">Um módulo para cada rotina da rede.</Text>
          <Text style={s.corpo}>Libere só o que cada pessoa usa. O plano define quantas contas e quais módulos a empresa tem.</Text>
          <View style={{ gap: 12, marginTop: 24 }}>
            {linhasMosaico.map((linha, li) => (
              <View key={li} style={{ flexDirection: 'row', gap: 12 }}>
                {linha.map(peso => {
                  const m = MODULES[k++];
                  if (!m) return null;
                  const grande = peso === 2;
                  const t = tint[m.tint];
                  return (
                    <View key={m.id} style={[s.celula, { flex: peso, backgroundColor: mode === 'dark' ? colors.surface : t.bg }, grande && desktop && { minHeight: 200 }]}>
                      <View style={[s.iconeCelula, { backgroundColor: mode === 'dark' ? colors.surfaceMuted : '#ffffffaa' }]}>
                        <m.icon size={grande ? 26 : 22} color={mode === 'dark' ? colors.accent : t.fg} weight="duotone" />
                      </View>
                      <Text style={[s.celulaTitulo, grande && { fontSize: 20 }]}>{m.name}</Text>
                      <Text style={s.celulaTexto} numberOfLines={grande ? 4 : 3}>{m.description}</Text>
                    </View>
                  );
                })}
              </View>
            ))}
          </View>
        </Faixa>

        {/* Como começar: linha do tempo ao lado da explicação. */}
        <Faixa style={[s.secao, desktop && { flexDirection: 'row', gap: 64 }]}>
          {/* No celular as colunas não levam flex: numa coluna, flex 1 sem altura definida encolhe a seção a zero. */}
          <View style={{ flex: desktop ? 1 : undefined, maxWidth: 440, gap: 12 }}>
            <Text style={s.h2} accessibilityRole="header">Da assinatura à primeira aferição.</Text>
            <Text style={s.corpo}>A empresa é sua: você cadastra, convida a equipe e acompanha tudo pelo painel web.</Text>
          </View>
          <View style={{ flex: desktop ? 1 : undefined, marginTop: desktop ? 0 : 24 }}>
            {[
              { icone: StorefrontIcon, titulo: 'Cadastre a empresa', texto: 'Escolha o plano e crie o seu acesso de administrador. Quando a empresa for liberada, você recebe um e-mail.' },
              { icone: EnvelopeIcon, titulo: 'Convide a equipe', texto: 'Cada auditor recebe o convite por e-mail e cria a própria senha. Você escolhe os módulos de cada um.' },
              { icone: GasPumpIcon, titulo: 'Audite as filiais', texto: 'Aferições, medições e inventários no celular, mesmo sem internet, com relatório em PDF.' },
            ].map((p, i, l) => (
              <View key={p.titulo} style={{ flexDirection: 'row', gap: 16 }}>
                <View style={{ alignItems: 'center' }}>
                  <View style={s.passoIcone}><p.icone size={20} color={colors.accentText} weight="duotone" /></View>
                  {i < l.length - 1 ? <View style={[s.passoLinha, { backgroundColor: colors.border }]} /> : null}
                </View>
                <View style={{ flex: 1, paddingBottom: i < l.length - 1 ? 28 : 0, paddingTop: 8 }}>
                  <Text style={s.passoTitulo}>{p.titulo}</Text>
                  <Text style={s.corpo}>{p.texto}</Text>
                </View>
              </View>
            ))}
          </View>
        </Faixa>

        {/* Planos (lidos do banco). */}
        <View onLayout={(e: LayoutChangeEvent) => { yPlanos.current = e.nativeEvent.layout.y; }}>
          <Faixa style={s.secao}>
            <Text style={s.h2} accessibilityRole="header">Planos por tamanho de equipe.</Text>
            <Text style={s.corpo}>Comece com poucas contas e aumente quando a rede crescer. Contas inativas não contam.</Text>
            {erroPlanos ? (
              <View style={[s.aviso, { borderColor: colors.border }]}>
                <WarningCircleIcon size={20} color={colors.warning} />
                <Text style={[s.corpo, { flex: 1 }]}>Não foi possível carregar os planos agora.</Text>
                <Button title="Tentar de novo" size="sm" variant="secondary" onPress={() => void carregarPlanos()} />
              </View>
            ) : (
              <View style={[s.planos, desktop && { flexDirection: 'row', alignItems: 'stretch' }]}>
                {(planos ?? [null, null, null]).map((p, i) => {
                  if (!p) return <View key={i} style={[s.plano, s.planoEsqueleto, { backgroundColor: colors.surface }]} />;
                  const destaque = p.ordem === 2;
                  const fg = destaque ? colors.primaryText : colors.text;
                  const fgSuave = destaque ? `${colors.primaryText}cc` : colors.textMuted;
                  // Sem preço definido, o número que diferencia os planos é o de contas.
                  const semPreco = p.preco_mensal === null;
                  return (
                    <View key={p.id} style={[s.plano, desktop && { flex: 1 }, { backgroundColor: destaque ? colors.accent : colors.surface, borderColor: destaque ? colors.accent : colors.border }, desktop && destaque && { marginTop: -16, paddingTop: 40 }]}>
                      <Text style={[s.planoNome, { color: fg }]}>{p.nome}</Text>
                      <Text style={[s.planoPreco, { color: fg }]}>{semPreco ? `${p.limite_contas} contas` : preco(p.preco_mensal)}</Text>
                      <Text style={[s.planoContas, { color: fgSuave }]}>{semPreco ? 'Preço sob consulta' : `Até ${p.limite_contas} contas`}</Text>
                      <Text style={[s.corpo, { color: fgSuave }]}>{p.descricao}</Text>
                      <View style={{ gap: 8, flex: 1 }}>
                        {p.modulos.map(id => (
                          <View key={id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                            <CheckIcon size={15} color={destaque ? colors.primaryText : colors.accent} weight="bold" />
                            <Text style={[s.planoItem, { color: fg }]}>{nomeModulo(id)}</Text>
                          </View>
                        ))}
                      </View>
                      <Button title={CTA_EMPRESA} variant={destaque ? 'secondary' : 'primary'} onPress={() => router.push(`/criar-empresa?plano=${p.id}`)} style={{ marginTop: 8 }} />
                    </View>
                  );
                })}
              </View>
            )}
          </Faixa>
        </View>

        {/* Faixa final. */}
        <Faixa style={[s.secao, { paddingBottom: 24 }]}>
          <View style={[s.final, { backgroundColor: colors.accent }]}>
            <Text style={[s.h2, { color: colors.primaryText, flex: desktop ? 1 : undefined }]}>Sua equipe auditando com o EasyAudit.</Text>
            <Button title={CTA_EMPRESA} variant="secondary" onPress={() => router.push('/criar-empresa')} />
          </View>
        </Faixa>
        <SiteFooter />
      </ScrollView>
    </View>
  );
}

const estilos = (c: ThemeColors, desktop: boolean) => StyleSheet.create({
  hero: { flexDirection: desktop ? 'row' : 'column', alignItems: desktop ? 'center' : 'stretch', gap: desktop ? 56 : 32, paddingTop: desktop ? 72 : 40, paddingBottom: desktop ? 72 : 32 },
  heroTexto: { flex: desktop ? 1 : undefined, maxWidth: 560, gap: 18 },
  h1: { color: c.text, fontSize: desktop ? 48 : 34, lineHeight: desktop ? 54 : 40, fontWeight: '800', letterSpacing: desktop ? -1.4 : -0.8 },
  sub: { color: c.textMuted, fontSize: desktop ? 18 : 16, lineHeight: desktop ? 28 : 24, maxWidth: 480 },
  ctas: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 6 },
  heroVisual: { flex: desktop ? 1.1 : undefined, gap: 10 },
  moldura: { borderRadius: 20, overflow: 'hidden', borderWidth: 1, borderColor: c.border, backgroundColor: c.surface, padding: 10 },
  legenda: { color: c.textFaint, fontSize: 12.5, lineHeight: 18 },
  secao: { paddingTop: desktop ? 88 : 56, gap: 10 },
  h2: { color: c.text, fontSize: desktop ? 34 : 26, lineHeight: desktop ? 40 : 32, fontWeight: '800', letterSpacing: -0.8 },
  corpo: { color: c.textMuted, fontSize: 15.5, lineHeight: 24, maxWidth: 620 },
  celula: { borderRadius: 20, padding: desktop ? 20 : 16, gap: desktop ? 8 : 4, minHeight: desktop ? 168 : undefined },
  iconeCelula: { width: desktop ? 44 : 36, height: desktop ? 44 : 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginBottom: desktop ? 6 : 4 },
  celulaTitulo: { color: c.text, fontSize: 16.5, fontWeight: '800', letterSpacing: -0.2 },
  celulaTexto: { color: c.textMuted, fontSize: 14, lineHeight: 20 },
  passoIcone: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: c.accentSoft },
  passoLinha: { width: 2, flex: 1, marginVertical: 6, borderRadius: 1 },
  passoTitulo: { color: c.text, fontSize: 16.5, fontWeight: '800', marginBottom: 4 },
  planos: { gap: 16, marginTop: 28 },
  plano: { borderRadius: 20, borderWidth: 1, padding: 24, gap: 12 },
  planoEsqueleto: { minHeight: 380, borderWidth: 0, opacity: 0.6 },
  planoNome: { fontSize: 15, fontWeight: '800', letterSpacing: 0.2 },
  planoPreco: { fontSize: 28, fontWeight: '800', letterSpacing: -0.6 },
  planoContas: { fontSize: 14, fontWeight: '700', marginTop: -6 },
  planoItem: { fontSize: 14.5 },
  aviso: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderRadius: 16, padding: 16, marginTop: 24 },
  final: { borderRadius: 24, padding: desktop ? 40 : 28, gap: 20, flexDirection: desktop ? 'row' : 'column', alignItems: desktop ? 'center' : 'flex-start' },
});
