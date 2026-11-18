import { Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Path } from 'react-native-svg';

/** Cores da marca EasyAudit: azul-marinho, verde-menta, cinza e papel. */
export const MARCA = { navy: '#0f1f3d', mint: '#5fd39a', cinza: '#cfd4da', papel: '#f4f3ef' } as const;

// Símbolo "e✓": o "e" em traço grosso e o visto saindo da ponta dele. viewBox 100 × 64.
export const LOGO_E = 'M13 34 H51 C51 20.5 42.5 12 31.5 12 C19.5 12 11 21 11 33 C11 45.5 20 54 32 54 C38.5 54 43.5 51.5 47.5 47';
export const LOGO_CHECK = 'M52 38 L61.5 48 L89 13';

/** Só o símbolo "e✓". `altura` em pontos; a largura acompanha a proporção. */
export function LogoSimbolo({ altura = 28, cor = MARCA.navy, check = MARCA.mint }: { altura?: number; cor?: string; check?: string }) {
  return (
    <Svg width={(altura * 100) / 64} height={altura} viewBox="0 0 100 64" accessibilityLabel="EasyAudit">
      <Path d={LOGO_E} stroke={cor} strokeWidth={9.5} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <Path d={LOGO_CHECK} stroke={check} strokeWidth={9.5} fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

/** Símbolo + "easy audit" (easy fino, audit em negrito). `claro` = para fundo escuro. */
export function Logo({ altura = 28, claro = false, style }: { altura?: number; claro?: boolean; style?: StyleProp<ViewStyle> }) {
  const cor = claro ? '#ffffff' : MARCA.navy;
  return (
    <View style={[{ flexDirection: 'row', alignItems: 'center', gap: altura * 0.3 }, style]} accessibilityRole="image" accessibilityLabel="EasyAudit">
      <LogoSimbolo altura={altura} cor={cor} />
      <Text style={{ color: cor, fontSize: altura * 0.95, letterSpacing: -0.3 }} allowFontScaling={false}>
        <Text style={{ fontWeight: '400' }}>easy </Text>
        <Text style={{ fontWeight: '800' }}>audit</Text>
      </Text>
    </View>
  );
}

/** Ícone do app: quadrado arredondado azul-marinho com o "e✓" branco e verde. */
export function LogoIcone({ tamanho = 40 }: { tamanho?: number }) {
  return (
    <View style={{ width: tamanho, height: tamanho, borderRadius: tamanho * 0.24, backgroundColor: MARCA.navy, alignItems: 'center', justifyContent: 'center' }}>
      <LogoSimbolo altura={tamanho * 0.5} cor="#ffffff" />
    </View>
  );
}
