import { useEffect, useState } from 'react';
import { Image, type ImageSourcePropType, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import { EASE } from './motion';
import { SITE_CORES } from './SiteChrome';

// Galeria com prints reais do painel web (nomes de postos e pessoas trocados por fictícios).
// Todas as imagens ficam montadas, uma sobre a outra: a troca é só de opacidade (sem recarregar a imagem).
const C = SITE_CORES;
const PROPORCAO = 2048 / 1200;

type Tela = { nome: string; legenda: string; src: ImageSourcePropType };
const TELAS: Tela[] = [
  { nome: 'Visão geral', legenda: 'Os módulos da rede e o que está em andamento em cada um.', src: require('../../assets/site/tela-visao-geral.jpg') },
  { nome: 'Aferições', legenda: 'As aferições recentes com o resultado de cada posto e o total de bombas e bicos da rede.', src: require('../../assets/site/tela-afericoes.jpg') },
  { nome: 'Auditoria', legenda: 'O checklist da auditoria por setor, com o que está conforme, não conforme ou com observação.', src: require('../../assets/site/tela-auditoria.jpg') },
  { nome: 'Tanques', legenda: 'Litros medidos, venda e recebimento de cada tanque, com a sobra ou a falta por combustível.', src: require('../../assets/site/tela-tanques.jpg') },
  { nome: 'Mapa de risco', legenda: 'A pontuação de risco de cada posto e a distribuição da rede entre baixo, médio e alto.', src: require('../../assets/site/tela-mapa-risco.jpg') },
  { nome: 'Equipe', legenda: 'O dimensionamento da equipe: horas de trabalho e funcionários necessários por bloco de atividade.', src: require('../../assets/site/tela-equipe.jpg') },
];

function Camada({ tela, ativa }: { tela: Tela; ativa: boolean }) {
  const reduz = useReducedMotion();
  const op = useSharedValue(ativa ? 1 : 0);
  useEffect(() => {
    op.value = reduz ? (ativa ? 1 : 0) : withTiming(ativa ? 1 : 0, { duration: 280, easing: EASE });
  }, [ativa, reduz, op]);
  const anim = useAnimatedStyle(() => ({ opacity: op.value }));
  return (
    <Animated.View style={[StyleSheet.absoluteFill, anim]} pointerEvents="none" accessibilityElementsHidden={!ativa} importantForAccessibility={ativa ? 'auto' : 'no-hide-descendants'}>
      <Image source={tela.src} style={st.preenche} resizeMode="cover" accessibilityLabel={`Tela de ${tela.nome} do EasyAudit no painel web. ${tela.legenda}`} />
    </Animated.View>
  );
}

function Aba({ nome, ativa, onPress }: { nome: string; ativa: boolean; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="tab" accessibilityState={{ selected: ativa }} onPress={onPress}
      style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
        st.aba, ativa ? st.abaAtiva : hovered && Platform.OS === 'web' ? { borderColor: C.borderStrong } : null, pressed && { transform: [{ scale: 0.97 }] },
      ]}>
      <Text style={[st.abaTxt, ativa && { color: '#ffffff' }]}>{nome}</Text>
    </Pressable>
  );
}

/** Abas com o nome de cada tela e, abaixo, o print numa moldura de navegador com a legenda. */
export function Telas({ desktop }: { desktop: boolean }) {
  const [atual, setAtual] = useState(0);
  return (
    <View style={{ gap: desktop ? 20 : 14 }}>
      <View style={st.abas} accessibilityRole="tablist">
        {TELAS.map((t, i) => <Aba key={t.nome} nome={t.nome} ativa={i === atual} onPress={() => setAtual(i)} />)}
      </View>
      <View style={st.janela}>
        <View style={st.barra}>{[0, 1, 2].map(i => <View key={i} style={st.ponto} />)}</View>
        <View style={{ width: '100%', aspectRatio: PROPORCAO }}>
          {TELAS.map((t, i) => <Camada key={t.nome} tela={t} ativa={i === atual} />)}
        </View>
      </View>
      <Text style={st.legenda}>{TELAS[atual].legenda}</Text>
      <Text style={st.nota}>Telas reais do sistema. Os nomes de postos e de pessoas foram trocados.</Text>
    </View>
  );
}

const st = StyleSheet.create({
  abas: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  aba: { paddingHorizontal: 16, height: 38, borderRadius: 999, borderWidth: 1, borderColor: C.border, backgroundColor: '#ffffff', justifyContent: 'center' },
  abaAtiva: { backgroundColor: C.text, borderColor: C.text },
  abaTxt: { color: C.text, fontSize: 14, fontWeight: '700' },
  janela: {
    borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: C.border, backgroundColor: '#ffffff',
    shadowColor: '#0f1f3d', shadowOpacity: 0.12, shadowRadius: 30, shadowOffset: { width: 0, height: 18 },
  },
  barra: { height: 30, flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 14, backgroundColor: '#eef1f6', borderBottomWidth: 1, borderBottomColor: C.border },
  ponto: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#cbd3df' },
  // Largura e altura explícitas: a imagem do React Native Web usa o tamanho do arquivo se só houver posição absoluta.
  preenche: { position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' },
  legenda: { color: C.text, fontSize: 16, lineHeight: 24, fontWeight: '600', maxWidth: 720 },
  nota: { color: C.textFaint, fontSize: 13, lineHeight: 19, marginTop: -8 },
});
