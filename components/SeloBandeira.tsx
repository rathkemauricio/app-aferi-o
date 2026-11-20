import { Image, Text, View } from 'react-native';

export type DadosSelo = { nome: string; cor: string; corTexto: string; logo?: string | null };

/**
 * Selo da bandeira do posto: o logotipo da companhia (quando cadastrado) num fundo branco, para aparecer bem em
 * qualquer tema; sem logotipo, a etiqueta colorida com o nome. `pequeno` para listas; o normal para prévias.
 */
export function SeloBandeira({ b, pequeno = false }: { b: DadosSelo; pequeno?: boolean }) {
  if (b.logo) {
    const alt = pequeno ? 34 : 64;
    return (
      <View style={{ height: alt, width: alt * 2.2, borderRadius: 8, backgroundColor: '#ffffff', borderWidth: 1, borderColor: 'rgba(0,0,0,0.12)', padding: pequeno ? 3 : 6, alignItems: 'center', justifyContent: 'center' }}>
        <Image source={{ uri: b.logo }} resizeMode="contain" style={{ width: '100%', height: '100%' }} accessibilityLabel={`Logotipo ${b.nome}`} />
      </View>
    );
  }
  return (
    <View style={{ backgroundColor: b.cor, borderRadius: 8, paddingHorizontal: pequeno ? 8 : 14, paddingVertical: pequeno ? 4 : 8, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(0,0,0,0.25)' }}>
      {!pequeno ? <Text style={{ color: b.corTexto, fontSize: 9, opacity: 0.85, letterSpacing: 1 }}>BANDEIRA</Text> : null}
      <Text style={{ color: b.corTexto, fontSize: pequeno ? 11 : 15, fontWeight: '800' }} numberOfLines={1}>{(b.nome || 'Nome').toUpperCase()}</Text>
    </View>
  );
}
