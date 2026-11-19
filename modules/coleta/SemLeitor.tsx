import { type BarcodeScanningResult, CameraView, useCameraPermissions } from 'expo-camera';
import { useContext, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../../lib/auth';
import { filiaisCol, useFiliais } from '../../lib/data';
import { type Preferencias, setPreferencia, usePreferencias } from '../../lib/preferencias';
import { supabase } from '../../lib/supabase';
import { BarcodeIcon, CameraIcon, KeyboardIcon, FlashlightIcon, ListChecksIcon } from '../../ui/icons';
import { notify } from '../../ui/kit';
import { ThemeContext } from '../../ui/theme';

// Contagem em celular sem leitor de código (filial configurada "sem leitor" no cadastro da filial):
// a pessoa escolhe como contar — pela lista dos itens, pela câmera ou digitando o código.

export type ModoSemLeitor = Preferencias['modoSemLeitor'];
const MODOS: { id: ModoSemLeitor; titulo: string; icone: typeof CameraIcon }[] = [
  { id: 'lista', titulo: 'Lista', icone: ListChecksIcon },
  { id: 'camera', titulo: 'Câmera', icone: CameraIcon },
  { id: 'digitar', titulo: 'Digitar', icone: KeyboardIcon },
];

/** Escolha do modo de contagem sem leitor (fica guardada neste aparelho). */
export function SeletorModo() {
  const { colors: c } = useContext(ThemeContext);
  const modo = usePreferencias().modoSemLeitor;
  return (
    <View style={[s.seletor, { backgroundColor: c.surfaceMuted, borderColor: c.border }]} accessibilityRole="tablist">
      {MODOS.map(m => {
        const on = m.id === modo;
        const Icone = m.icone;
        return (
          <Pressable key={m.id} accessibilityRole="tab" accessibilityState={{ selected: on }} onPress={() => setPreferencia('modoSemLeitor', m.id)}
            style={({ pressed }) => [s.opcao, on && { backgroundColor: c.surface, borderColor: c.borderStrong }, pressed && !on && { opacity: 0.7 }]}>
            <Icone size={18} color={on ? c.text : c.textMuted} weight={on ? 'bold' : 'regular'} />
            <Text style={[s.opcaoTxt, { color: on ? c.text : c.textMuted }]}>{m.titulo}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Tipos de código de barras de produto (varejo e caixa). */
const TIPOS = ['ean13', 'ean8', 'upc_a', 'upc_e', 'code128', 'code39', 'code93', 'itf14', 'codabar'] as const;

/**
 * Câmera lendo códigos de barra. Cada código lido vai para `onLer` (o mesmo caminho da leitura do coletor).
 * Evita leituras repetidas: o mesmo código só vale de novo depois de 2,5 s; qualquer código, depois de 1 s.
 */
export function LeitorCamera({ onLer }: { onLer: (codigo: string) => void }) {
  const { colors: c } = useContext(ThemeContext);
  const [permissao, pedir] = useCameraPermissions();
  const [luz, setLuz] = useState(false);
  const ultimo = useRef<{ cod: string; em: number }>({ cod: '', em: 0 });

  const lido = (r: BarcodeScanningResult) => {
    const cod = String(r.data ?? '').trim();
    const agora = Date.now();
    if (!cod) return;
    if (agora - ultimo.current.em < 1000 || (cod === ultimo.current.cod && agora - ultimo.current.em < 2500)) return;
    ultimo.current = { cod, em: agora };
    onLer(cod);
  };

  if (!permissao) return <View style={[s.caixa, { backgroundColor: '#0b1220' }]} />;
  if (!permissao.granted) return (
    <View style={[s.caixa, s.semPermissao, { backgroundColor: c.surface, borderColor: c.border }]}>
      <CameraIcon size={28} color={c.textMuted} />
      <Text style={[s.txt, { color: c.text }]}>Permita a câmera para ler os códigos de barra.</Text>
      {permissao.canAskAgain
        ? <Pressable accessibilityRole="button" onPress={() => void pedir()} style={({ pressed }) => [s.botao, { backgroundColor: c.accent }, pressed && { opacity: 0.85 }]}><Text style={s.botaoTxt}>Permitir a câmera</Text></Pressable>
        : <Text style={[s.txt, { color: c.textMuted }]}>A câmera foi negada. Libere nas configurações do Android (Apps → EasyAudit → Permissões) ou use a Lista.</Text>}
    </View>
  );
  return (
    <View style={s.caixa}>
      <CameraView style={StyleSheet.absoluteFill} facing="back" enableTorch={luz} barcodeScannerSettings={{ barcodeTypes: [...TIPOS] }} onBarcodeScanned={lido} />
      {/* Guia: a faixa onde o código deve ficar. */}
      <View pointerEvents="none" style={s.guia}><View style={s.linha} /></View>
      <Text pointerEvents="none" style={s.dica}>Aponte para o código de barras</Text>
      <Pressable accessibilityRole="button" accessibilityLabel={luz ? 'Desligar a lanterna' : 'Ligar a lanterna'} hitSlop={8} onPress={() => setLuz(v => !v)}
        style={[s.lanterna, luz && { backgroundColor: '#ffd84d' }]}>
        <FlashlightIcon size={20} color={luz ? '#0f1f3d' : '#fff'} weight={luz ? 'fill' : 'bold'} />
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  seletor: { flexDirection: 'row', borderRadius: 14, borderWidth: 1, padding: 4, gap: 4 },
  opcao: { flex: 1, minHeight: 44, borderRadius: 10, borderWidth: 1, borderColor: 'transparent', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  opcaoTxt: { fontSize: 14.5, fontWeight: '700' },
  leitorOp: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 12, borderWidth: 1.5 },
  caixa: { height: 210, borderRadius: 16, overflow: 'hidden', backgroundColor: '#000' },
  semPermissao: { borderWidth: 1, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 16, height: undefined, minHeight: 170 },
  txt: { fontSize: 14, textAlign: 'center' },
  botao: { height: 44, paddingHorizontal: 18, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  botaoTxt: { color: '#fff', fontWeight: '800', fontSize: 15 },
  guia: { position: 'absolute', left: '10%', right: '10%', top: '30%', bottom: '30%', borderWidth: 2, borderColor: 'rgba(255,255,255,0.85)', borderRadius: 12, justifyContent: 'center' },
  linha: { height: 2, marginHorizontal: 10, backgroundColor: '#5fd39a' },
  dica: { position: 'absolute', bottom: 10, left: 0, right: 0, textAlign: 'center', color: '#fff', fontSize: 13, fontWeight: '700', textShadowColor: 'rgba(0,0,0,0.6)', textShadowRadius: 4 },
  lanterna: { position: 'absolute', top: 10, right: 10, width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' },
});

/**
 * Conta de filial: a própria filial escolhe se conta com leitor de código (coletor) ou com o celular sem leitor
 * (câmera, digitação ou lista). Fica no cadastro da filial (vale para todos os aparelhos dela); a auditoria só vê.
 */
export function LeitorDaFilial() {
  const { colors: c } = useContext(ThemeContext);
  const { filialConta } = useAuth();
  const { filiais } = useFiliais();
  const [salvando, setSalvando] = useState<boolean | null>(null);
  if (!filialConta) return null;
  const filial = filiais.find(f => f.id === filialConta);
  const leitor = salvando ?? filial?.contagem_leitor !== false;
  const mudar = async (v: boolean) => {
    if (!supabase || v === leitor) return;
    setSalvando(v);
    const { error } = await supabase.rpc('definir_leitor_da_filial', { leitor: v });
    if (error) notify('Não foi possível salvar', 'Confira a internet e tente de novo.');
    else await filiaisCol.sync().catch(() => undefined);
    setSalvando(null);
  };
  const opcao = (v: boolean, titulo: string, sub: string, Icone: typeof CameraIcon) => {
    const on = leitor === v;
    return (
      <Pressable accessibilityRole="radio" accessibilityState={{ selected: on }} onPress={() => void mudar(v)}
        style={({ pressed }) => [s.leitorOp, { borderColor: on ? c.text : c.border, backgroundColor: on ? c.surface : c.surfaceMuted }, pressed && !on && { opacity: 0.75 }]}>
        <Icone size={20} color={on ? c.text : c.textMuted} weight={on ? 'bold' : 'regular'} />
        <View style={{ flex: 1 }}>
          <Text style={[s.opcaoTxt, { color: on ? c.text : c.textMuted }]}>{titulo}</Text>
          <Text style={{ fontSize: 12.5, color: c.textMuted }}>{sub}</Text>
        </View>
      </Pressable>
    );
  };
  return (
    <View style={{ gap: 8 }}>
      <Text style={{ fontSize: 13, fontWeight: '800', color: c.textMuted, letterSpacing: 0.4 }}>COMO A FILIAL CONTA{salvando !== null ? ' · salvando…' : ''}</Text>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {opcao(true, 'Com leitor', 'Coletor com leitor de código', BarcodeIcon)}
        {opcao(false, 'Sem leitor', 'Celular: lista, câmera ou digitar', CameraIcon)}
      </View>
    </View>
  );
}
