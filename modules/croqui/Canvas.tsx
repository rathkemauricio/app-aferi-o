import { useMemo, useRef, useState } from 'react';
import { type LayoutChangeEvent, PanResponder, ScrollView, Text, View } from 'react-native';
import { SvgXml } from 'react-native-svg';
import { useBandeiras } from '../../lib/bandeiras';
import { useCombustiveis } from '../../lib/combustiveis';
import { areaDasBombas, clamp, croquiSvg, filhosDaIlha, hitTest, type Item, type Paleta, registrarCombustiveis, resumo, VH, VW } from './model';

/** Registra os catálogos (combustíveis e bandeiras) usados no desenho (chamar antes de desenhar ou resumir). */
export function useCatalogoCroqui() {
  const lista = useCombustiveis();
  const bandeiras = useBandeiras(); // atualiza cores e nomes das bandeiras usados no desenho
  registrarCombustiveis(lista);
  return [lista, bandeiras] as const;
}

export type Movimento = { id: string; x: number; y: number };

type Props = {
  items: Item[];
  bandeira: string;
  mostrarNomes: boolean;
  paleta: Paleta;
  editavel?: boolean;
  selecionado?: string | null;
  /** Ampliação do desenho (1 = largura disponível). Acima de 1, arraste em área vazia para deslizar. */
  zoom?: number;
  /** Encaixe ao mover (10 = grade; 1 = posição livre). */
  passo?: number;
  /** Contorno colorido por item (ex.: andamento da aferição de cada bomba). */
  destaques?: Record<string, string>;
  onSelect?: (id: string | null) => void;
  /** Durante o arraste `final` é falso (só tela); ao soltar é verdadeiro (grava). A ilha move junto as bombas apoiadas nela. */
  onMove?: (movs: Movimento[], final: boolean) => void;
  onDragChange?: (arrastando: boolean) => void;
  /** Modo visualização: toque em um item (ex.: abrir a bomba na aferição). */
  onTapItem?: (item: Item) => void;
  /** Mostra só a área das bombas (pista), legível em telas pequenas; a legenda de combustíveis vai embaixo. */
  enquadrar?: boolean;
};

/** Desenho do croqui. No modo editável, toque seleciona e arrastar move o item. */
export function CroquiCanvas({ items, bandeira, mostrarNomes, paleta, editavel = false, selecionado = null, zoom = 1, passo = 10, destaques, onSelect, onMove, onDragChange, onTapItem, enquadrar = false }: Props) {
  const catalogo = useCatalogoCroqui();
  const [base, setBase] = useState(0);
  const area = useMemo(() => (enquadrar && !editavel ? areaDasBombas(items) : null), [enquadrar, editavel, items]);
  const vw = area?.w ?? VW, vh = area?.h ?? VH, ox = area?.x ?? 0, oy = area?.y ?? 0;
  const w = base * zoom, h = w * (vh / vw);
  const sel = editavel ? items.find(i => i.id === selecionado) : undefined;
  const grupo = sel ? filhosDaIlha(items, sel).map(i => i.id) : undefined;
  const chaveGrupo = grupo?.join(',') ?? '';
  const xml = useMemo(
    () => croquiSvg(items, { bandeira, mostrarNomes, selecionado: editavel ? selecionado : null, p: paleta, destaques, grupo, area }),
    [items, bandeira, mostrarNomes, selecionado, editavel, paleta, destaques, chaveGrupo, catalogo, area], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const legenda = useMemo(() => (area ? resumo(items).porCombustivel : []), [area, items, catalogo]); // eslint-disable-line react-hooks/exhaustive-deps

  // Refs: o PanResponder é criado uma vez e precisa enxergar os valores atuais.
  const live = useRef({ items, w, vw, ox, oy, passo, editavel, onSelect, onMove, onDragChange, onTapItem });
  live.current = { items, w, vw, ox, oy, passo, editavel, onSelect, onMove, onDragChange, onTapItem };
  type Arraste = { item: Item; movs: Movimento[]; filhos: Item[]; x: number; y: number; moveu: boolean };
  const arraste = useRef<Arraste | null>(null);

  const responder = useMemo(() => PanResponder.create({
    // Só captura o toque se cair sobre um item; em área vazia a tela continua rolando.
    onStartShouldSetPanResponder: e => {
      const L = live.current;
      if (!L.w) return false;
      const k = L.vw / L.w; // unidades do desenho por pixel (considera o recorte)
      const hit = hitTest(L.items, L.ox + e.nativeEvent.locationX * k, L.oy + e.nativeEvent.locationY * k);
      if (L.editavel) {
        if (!hit) { L.onSelect?.(null); return false; }
        arraste.current = { item: hit, movs: [], filhos: filhosDaIlha(L.items, hit), x: hit.x, y: hit.y, moveu: false };
        L.onSelect?.(hit.id);
        return true;
      }
      if (hit && L.onTapItem) { arraste.current = { item: hit, movs: [], filhos: [], x: hit.x, y: hit.y, moveu: false }; return true; }
      return false;
    },
    onMoveShouldSetPanResponder: () => !!arraste.current,
    onPanResponderTerminationRequest: () => !arraste.current,
    onPanResponderMove: (_e, g) => {
      const d = arraste.current, L = live.current;
      if (!d || !L.w) return;
      if (!d.moveu && (Math.abs(g.dx) > 4 || Math.abs(g.dy) > 4)) { d.moveu = true; if (L.editavel) L.onDragChange?.(true); }
      if (!L.editavel || !d.moveu) return;
      const k = L.vw / L.w, p = L.passo;
      const x = clamp(Math.round((d.item.x + g.dx * k) / p) * p, 0, VW), y = clamp(Math.round((d.item.y + g.dy * k) / p) * p, 0, VH);
      if (x === d.x && y === d.y) return;
      d.x = x; d.y = y;
      const dx = x - d.item.x, dy = y - d.item.y;
      d.movs = [{ id: d.item.id, x, y }, ...d.filhos.map(f => ({ id: f.id, x: clamp(f.x + dx, 0, VW), y: clamp(f.y + dy, 0, VH) }))];
      L.onMove?.(d.movs, false);
    },
    onPanResponderRelease: () => {
      const d = arraste.current, L = live.current;
      arraste.current = null;
      if (!d) return;
      if (!L.editavel) { if (!d.moveu) L.onTapItem?.(d.item); return; }
      if (d.moveu) { if (d.movs.length) L.onMove?.(d.movs, true); L.onDragChange?.(false); }
    },
    onPanResponderTerminate: () => {
      const d = arraste.current, L = live.current;
      arraste.current = null;
      if (d?.moveu && L.editavel) { if (d.movs.length) L.onMove?.(d.movs, true); L.onDragChange?.(false); }
    },
  }), []);

  const desenho = (
    <View style={{ width: w, height: h }}>
      <SvgXml xml={xml} width={w} height={h} />
      {editavel || onTapItem ? <View style={{ position: 'absolute', left: 0, top: 0, width: w, height: h }} {...responder.panHandlers} /> : null}
    </View>
  );

  return (
    <View style={{ width: '100%', gap: 6 }}>
      <View onLayout={(e: LayoutChangeEvent) => setBase(e.nativeEvent.layout.width)} style={{ width: '100%', borderRadius: 12, overflow: 'hidden', backgroundColor: paleta.ground }}>
        {base <= 0 ? <View style={{ aspectRatio: vw / vh }} />
          : zoom > 1 ? <ScrollView horizontal nestedScrollEnabled showsHorizontalScrollIndicator>{desenho}</ScrollView>
          : desenho}
      </View>
      {legenda.length ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 12, rowGap: 4 }}>
          {legenda.map(c => (
            <View key={c.tipo} style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
              <View style={{ width: 11, height: 11, borderRadius: 3, backgroundColor: c.cor }} />
              <Text style={{ fontSize: 12, color: paleta.text }}>{c.nome}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

/** Ícone de um elemento da paleta. */
export function IconeElemento({ xml, size = 38 }: { xml: string; size?: number }) {
  return <SvgXml xml={xml} width={size} height={size} />;
}
