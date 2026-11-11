import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { useContext } from 'react';
import { Image, Text, View } from 'react-native';
import { ThemeContext } from '../ui/theme';

/** Foto da conta ou, sem foto, as iniciais do nome/e-mail. */
export function Avatar({ uri, nome, size = 40 }: { uri?: string | null; nome?: string | null; size?: number }) {
  const { colors } = useContext(ThemeContext);
  const base = (nome || '?').trim();
  const partes = base.includes('@') ? [base[0]] : base.split(/\s+/).slice(0, 2).map(p => p[0]);
  const iniciais = partes.join('').toUpperCase() || '?';
  if (uri) return <Image source={{ uri }} style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: colors.surfaceMuted }} accessibilityLabel="Foto de perfil" />;
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' }} accessibilityLabel="Sem foto de perfil">
      <Text style={{ color: colors.accentText, fontWeight: '800', fontSize: size * 0.38 }}>{iniciais}</Text>
    </View>
  );
}

/**
 * Escolhe uma foto (galeria ou câmera), recorta quadrada e reduz para 160 px em JPEG.
 * Devolve uma data URL pequena (cerca de 10 KB), ou null se o usuário cancelar.
 */
export async function escolherFoto(origem: 'galeria' | 'camera'): Promise<string | null> {
  if (origem === 'camera') {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) throw new Error('Permita o acesso à câmera nas configurações do aparelho.');
  }
  const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 1 };
  const r = origem === 'camera' ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
  if (r.canceled || !r.assets?.[0]) return null;
  const a = r.assets[0];
  const lado = Math.min(a.width || 160, a.height || 160);
  const acoes: ImageManipulator.Action[] = [];
  if (a.width && a.height && a.width !== a.height) acoes.push({ crop: { originX: (a.width - lado) / 2, originY: (a.height - lado) / 2, width: lado, height: lado } });
  acoes.push({ resize: { width: 160, height: 160 } });
  const out = await ImageManipulator.manipulateAsync(a.uri, acoes, { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG, base64: true });
  if (!out.base64) throw new Error('Não foi possível processar a imagem.');
  return `data:image/jpeg;base64,${out.base64}`;
}
