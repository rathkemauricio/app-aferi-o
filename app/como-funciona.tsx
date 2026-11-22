import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { Image, type ImageSourcePropType, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Revela } from '../components/site/motion';
import { BotaoSite, CTA_COMECAR, Faixa, MENTA, ROTA_COMECAR, SITE_CORES, SiteFooter, SiteNav, SiteTema, useSite } from '../components/site/SiteChrome';
import { MODULES } from '../modules/registry';
import { CheckIcon, XIcon } from '../ui/icons';

const C = SITE_CORES;

const E_PARA = [
  'Você cuida de uma rede de postos de combustível e quer o mesmo padrão em todas as filiais.',
  'A aferição, a medição dos tanques e as contagens ainda são feitas em papel ou em planilhas que cada um faz de um jeito.',
  'Você precisa saber quem fez cada verificação, quando, e o que ficou pendente.',
  'O relatório demora dias para chegar a quem decide.',
];
const AINDA_NAO = [
  'Você tem um posto só e poucas verificações por mês.',
  'Você procura um sistema de gestão completo (PDV, fiscal, financeiro). O EasyAudit cuida da auditoria e da operação na pista.',
  'A sua empresa não é um posto de combustível. Por enquanto, o EasyAudit é feito só para postos.',
];

const PERGUNTAS: [string, string][] = [
  ['Serve para outros tipos de empresa?', 'Por enquanto, não. O EasyAudit é feito para redes de postos de combustível: pista, tanques, conveniência e a auditoria da operação.'],
  ['Funciona sem internet?', 'Sim. Os registros ficam guardados no celular e são enviados quando o sinal volta.'],
  ['Precisa instalar alguma coisa?', 'A equipe usa o app no celular Android. O painel abre no navegador do computador, sem instalar nada.'],
  ['Quanto custa?', 'Depende do número de contas e dos módulos que a rede vai usar. O preço é combinado com a gente.'],
  ['Quem vê os dados?', 'Só as contas da sua empresa. E cada pessoa vê só os módulos liberados para ela.'],
  ['Como eu começo?', 'Toque em Começar agora, cadastre a empresa e confirme o e-mail. Quando a empresa for liberada, você recebe um aviso e convida a equipe.'],
];

/** Moldura de celular em volta de um print real. */
function Celular({ src, legenda, largura }: { src: ImageSourcePropType; legenda: string; largura: number }) {
  return (
    <View style={{ width: largura, gap: 12, alignItems: 'center' }}>
      <View style={[st.celular, { width: largura, height: largura * 2.164 + 14 }]}>
        <Image source={src} style={{ flex: 1, width: '100%', borderRadius: 26 }} resizeMode="cover" accessibilityLabel={legenda} />
      </View>
      <Text style={[st.legenda, { textAlign: 'center' }]}>{legenda}</Text>
    </View>
  );
}

export default function ComoFunciona() {
  return <SiteTema><Pagina /></SiteTema>;
}

function Pagina() {
  const router = useRouter();
  const { desktop, width } = useSite();
  const s = useMemo(() => estilos(desktop), [desktop]);
  const larguraCel = desktop ? 260 : Math.min(240, (width - 36 - 16) / 2);

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <SiteNav />
      <ScrollView>
        {/* Abertura */}
        <Faixa style={s.topo}>
          <Revela><Text style={s.h1} accessibilityRole="header">{'O EasyAudit é para a\nsua rede de postos?'}</Text></Revela>
          <Revela atraso={80}><Text style={s.sub}>Veja como a equipe trabalha no celular, o que você acompanha no painel e o que recebe no fim de cada visita.</Text></Revela>
        </Faixa>

        {/* Para quem é */}
        <Faixa style={[s.secao, desktop && { flexDirection: 'row', gap: 24 }]}>
          <Revela style={{ flex: desktop ? 1.4 : undefined }}>
            <View style={s.bloco}>
              <Text style={s.h3}>É para você se</Text>
              {E_PARA.map(t => (
                <View key={t} style={s.item}>
                  <View style={[s.marca, { backgroundColor: MENTA }]}><CheckIcon size={13} color={C.text} weight="bold" /></View>
                  <Text style={s.itemTxt}>{t}</Text>
                </View>
              ))}
            </View>
          </Revela>
          <Revela atraso={90} style={{ flex: desktop ? 1 : undefined, marginTop: desktop ? 0 : 16 }}>
            <View style={[s.bloco, { backgroundColor: 'transparent' }]}>
              <Text style={s.h3}>Talvez ainda não seja</Text>
              {AINDA_NAO.map(t => (
                <View key={t} style={s.item}>
                  <View style={[s.marca, { backgroundColor: C.surfaceMuted }]}><XIcon size={12} color={C.textMuted} weight="bold" /></View>
                  <Text style={s.itemTxt}>{t}</Text>
                </View>
              ))}
            </View>
          </Revela>
        </Faixa>

        {/* Passo 1: painel */}
        <Faixa style={s.secao}>
          <Revela><Text style={s.passo}>1. Você cadastra os postos e a equipe</Text></Revela>
          <Revela atraso={60}><Text style={s.corpo}>No painel web você cadastra os postos, importa as tabelas de arqueação dos tanques e convida cada pessoa por e-mail, escolhendo os módulos que ela vai usar.</Text></Revela>
          <Revela atraso={120} style={{ marginTop: 24 }}>
            <View style={s.janela}>
              <View style={{ width: '100%', aspectRatio: 2160 / 1350 }}><Image source={require('../assets/site/painel-tanques.jpg')} style={st.preenche} resizeMode="cover"
                accessibilityLabel="Painel web do EasyAudit: medições de uma unidade, com o resultado de cada uma, e os tanques cadastrados com a tabela de cada um" /></View>
            </View>
            <Text style={[s.legenda, { marginTop: 10 }]}>Painel web: medições da unidade e os tanques com a tabela de cada um. Dados de exemplo.</Text>
          </Revela>
        </Faixa>

        {/* Passos 2 e 3: celular */}
        <Faixa style={[s.secao, desktop && { flexDirection: 'row', alignItems: 'center', gap: 56 }]}>
          <View style={{ flex: desktop ? 1 : undefined, gap: 12 }}>
            <Revela><Text style={s.passo}>2. A equipe faz as verificações no celular</Text></Revela>
            <Revela atraso={60}><Text style={s.corpo}>Telas feitas para a pista: a pessoa mede o tanque arrastando o nível, afere cada bico com a medida-padrão e marca o que está conforme. Funciona mesmo sem sinal.</Text></Revela>
            <Revela atraso={100}><Text style={[s.passo, { marginTop: 24 }]}>3. Cada registro sai com nome e horário</Text></Revela>
            <Revela atraso={140}><Text style={s.corpo}>Ninguém digita nada de novo depois: o que foi feito no celular já está no painel, com quem fez e quando.</Text></Revela>
          </View>
          <Revela atraso={120} style={{ marginTop: desktop ? 0 : 28 }}>
            <View style={{ flexDirection: 'row', gap: 16, justifyContent: 'center' }}>
              <Celular src={require('../assets/site/celular-tanques.jpg')} largura={larguraCel} legenda="Conferência de estoque: litros pela régua" />
              <Celular src={require('../assets/site/celular-afericao.jpg')} largura={larguraCel} legenda="Aferição dos bicos, um por um" />
            </View>
          </Revela>
        </Faixa>

        {/* Passo 4: relatório */}
        <Faixa style={s.secao}>
          <Revela><Text style={s.passo}>4. Você recebe o relatório e cuida das pendências</Text></Revela>
          <Revela atraso={60}><Text style={s.corpo}>No fim da visita sai o relatório em PDF, pronto para enviar. O que ficou com observação ou não conformidade aparece separado.</Text></Revela>
          <Revela atraso={120} style={{ marginTop: 24 }}>
            <View style={s.folha}>
              <View style={{ width: '100%', aspectRatio: 1684 / 810 }}><Image source={require('../assets/site/relatorio-afericao.jpg')} style={st.preenche} resizeMode="contain"
                accessibilityLabel="Relatório de aferição em PDF: dados da visita, tabela por bico com conforme e observação, e a lista do que ficou pendente" /></View>
            </View>
            <Text style={[s.legenda, { marginTop: 10 }]}>Relatório de aferição gerado pelo sistema. Dados de exemplo.</Text>
          </Revela>
        </Faixa>

        {/* Módulos */}
        <Faixa style={s.secao}>
          <Revela><Text style={s.h2} accessibilityRole="header">Os módulos</Text></Revela>
          <Revela atraso={60}><Text style={s.corpo}>A rede usa os módulos combinados; cada pessoa, só os que você liberar.</Text></Revela>
          <View style={[s.modulos, desktop && { flexDirection: 'row', flexWrap: 'wrap' }]}>
            {MODULES.map((m, i) => (
              <Revela key={m.id} atraso={(i % 3) * 70} style={desktop ? { width: '33.33%' } : undefined}>
                <View style={s.modulo}>
                  <View style={s.moduloIcone}><m.icon size={20} color={C.text} weight="duotone" /></View>
                  <View style={{ flex: 1, gap: 3 }}>
                    <Text style={s.moduloNome}>{m.name}</Text>
                    <Text style={s.moduloTxt}>{m.description}</Text>
                  </View>
                </View>
              </Revela>
            ))}
          </View>
        </Faixa>

        {/* Perguntas */}
        <Faixa style={[s.secao, desktop && { flexDirection: 'row', gap: 56 }]}>
          <Revela style={{ width: desktop ? 300 : undefined }}><Text style={s.h2} accessibilityRole="header">Perguntas frequentes</Text></Revela>
          <View style={{ flex: desktop ? 1 : undefined, gap: 22, marginTop: desktop ? 0 : 18 }}>
            {PERGUNTAS.map(([p, r], i) => (
              <Revela key={p} atraso={i * 60} distancia={14}>
                <Text style={s.pergunta}>{p}</Text>
                <Text style={s.corpo}>{r}</Text>
              </Revela>
            ))}
          </View>
        </Faixa>

        {/* Fechamento */}
        <Faixa style={[s.secao, { paddingBottom: 48 }]}>
          <Revela>
            <View style={s.final}>
              <Text style={[s.h2, { color: '#ffffff', flex: desktop ? 1 : undefined }]}>Faz sentido para você? Comece agora.</Text>
              <BotaoSite titulo={CTA_COMECAR} tipo="destaque" grande onPress={() => router.push(ROTA_COMECAR)} />
            </View>
          </Revela>
        </Faixa>
        <SiteFooter />
      </ScrollView>
    </View>
  );
}

const st = StyleSheet.create({
  celular: { borderRadius: 32, backgroundColor: C.text, padding: 7, shadowColor: '#0f1f3d', shadowOpacity: 0.18, shadowRadius: 24, shadowOffset: { width: 0, height: 14 } },
  legenda: { color: C.textFaint, fontSize: 13, lineHeight: 19 },
  // Largura e altura explícitas: a imagem do React Native Web usa o tamanho do arquivo se só houver posição absoluta.
  preenche: { position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' },
});

const estilos = (desktop: boolean) => StyleSheet.create({
  topo: { paddingTop: desktop ? 72 : 40, gap: 16 },
  h1: { color: C.text, fontSize: desktop ? 52 : 34, lineHeight: desktop ? 58 : 40, fontWeight: '800', letterSpacing: desktop ? -1.6 : -1 },
  sub: { color: C.textMuted, fontSize: desktop ? 19 : 16.5, lineHeight: desktop ? 30 : 25, maxWidth: 620 },
  secao: { paddingTop: desktop ? 96 : 60, gap: 10 },
  h2: { color: C.text, fontSize: desktop ? 36 : 26, lineHeight: desktop ? 42 : 32, fontWeight: '800', letterSpacing: desktop ? -1 : -0.6 },
  h3: { color: C.text, fontSize: 20, fontWeight: '800', letterSpacing: -0.3, marginBottom: 6 },
  passo: { color: C.text, fontSize: desktop ? 28 : 22, lineHeight: desktop ? 34 : 28, fontWeight: '800', letterSpacing: -0.6 },
  corpo: { color: C.textMuted, fontSize: desktop ? 16.5 : 15.5, lineHeight: desktop ? 26 : 24, maxWidth: 640 },
  bloco: { backgroundColor: '#ffffff', borderRadius: 18, borderWidth: 1, borderColor: C.border, padding: desktop ? 28 : 20, gap: 14 },
  item: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  marca: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  itemTxt: { flex: 1, color: C.text, fontSize: 15.5, lineHeight: 23 },
  janela: { borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: C.border, backgroundColor: '#ffffff', shadowColor: '#0f1f3d', shadowOpacity: 0.1, shadowRadius: 28, shadowOffset: { width: 0, height: 16 } },
  folha: { borderRadius: 8, overflow: 'hidden', borderWidth: 1, borderColor: C.border, backgroundColor: '#ffffff', padding: desktop ? 20 : 10, shadowColor: '#0f1f3d', shadowOpacity: 0.08, shadowRadius: 22, shadowOffset: { width: 0, height: 12 } },
  legenda: { color: C.textFaint, fontSize: 13, lineHeight: 19 },
  modulos: { marginTop: 24, marginHorizontal: desktop ? -10 : 0, gap: desktop ? 0 : 14 },
  modulo: { flexDirection: 'row', gap: 14, padding: desktop ? 10 : 0, paddingVertical: desktop ? 14 : 0 },
  moduloIcone: { width: 40, height: 40, borderRadius: 12, backgroundColor: '#ffffff', borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center' },
  moduloNome: { color: C.text, fontSize: 16, fontWeight: '800' },
  moduloTxt: { color: C.textMuted, fontSize: 14, lineHeight: 20 },
  pergunta: { color: C.text, fontSize: 17, fontWeight: '800', marginBottom: 4 },
  final: { borderRadius: 20, padding: desktop ? 48 : 28, gap: 24, flexDirection: desktop ? 'row' : 'column', alignItems: desktop ? 'center' : 'flex-start', backgroundColor: C.text },
});
