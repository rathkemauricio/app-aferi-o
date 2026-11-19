import { usePathname, useRouter, type Href } from 'expo-router';
import { Fragment, type ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Image, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, FadeInLeft, interpolateColor, type SharedValue, useAnimatedStyle, useReducedMotion, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { useTela } from '../ui/zoom';
import { VERSAO } from '../lib/versao';
import { Avatar } from './Avatar';
import { useAuth } from '../lib/auth';
import { isSupabaseConfigured } from '../lib/supabase';
import { MODULES } from '../modules/registry';
import { CaretLeftIcon, DropIcon, GearIcon, HouseIcon, MoonIcon, SignOutIcon, SquaresFourIcon, StorefrontIcon, SunIcon, UserCircleIcon, type Icon } from '../ui/icons';
import { confirmAction } from '../ui/kit';
import { ThemeContext, type ThemeColors } from '../ui/theme';

type LinkItem = { label: string; route: Href; icon: Icon };

const W_ABERTA = 252;
const W_FECHADA = 78;
const RAIO = 24; // curva da aba ativa (e dos cantos da barra)
const CURVA = 22; // curvas invertidas em cima e embaixo da aba ativa
const EASE = Easing.bezier(0.22, 1, 0.36, 1);

/** 0 = barra recolhida, 1 = aberta (acompanha a largura animada). */
const abertura = (w: number) => { 'worklet'; return Math.min(1, Math.max(0, (w - W_FECHADA) / (W_ABERTA - W_FECHADA))); };
/** Textos só aparecem quando a barra já está quase aberta (e somem logo ao recolher), sem cortar no meio. */
const textoOp = (w: number) => { 'worklet'; return Math.min(1, Math.max(0, (abertura(w) - 0.55) / 0.45)); };

const alfa = (hex: string, a: number) => {
  const h = hex.replace('#', '');
  const n = h.length === 3 ? h.split('').map(x => x + x).join('') : h.slice(0, 6);
  const v = parseInt(n, 16);
  return `rgba(${(v >> 16) & 255},${(v >> 8) & 255},${v & 255},${a})`;
};

/** Cores da barra: no tema claro ela é da cor de destaque (texto claro); no escuro, da cor de superfície. */
type Paleta = { fundo: string; texto: string; suave: string; fraco: string; linha: string; hover: string; abaFundo: string; abaTexto: string };
const paletaDa = (c: ThemeColors, escuro: boolean): Paleta => escuro
  ? { fundo: c.surface, texto: c.text, suave: c.textMuted, fraco: c.textFaint, linha: c.border, hover: c.surfaceMuted, abaFundo: c.bg, abaTexto: c.accent }
  : { fundo: c.accent, texto: c.primaryText, suave: alfa(c.primaryText, 0.8), fraco: alfa(c.primaryText, 0.55), linha: alfa(c.primaryText, 0.22), hover: alfa(c.primaryText, 0.13), abaFundo: c.bg, abaTexto: c.accent };

function Grupo({ texto, p, larg }: { texto: string; p: Paleta; larg: SharedValue<number> }) {
  const sTexto = useAnimatedStyle(() => ({ opacity: textoOp(larg.value) }));
  const sTraco = useAnimatedStyle(() => ({ opacity: 1 - textoOp(larg.value) }));
  return (
    <View style={{ height: 32, justifyContent: 'flex-end', paddingBottom: 7, paddingLeft: 24 }}>
      <Animated.Text numberOfLines={1} style={[{ width: 170, color: p.fraco, fontSize: 9.5, fontWeight: '800', letterSpacing: 1.4 }, sTexto]}>{texto}</Animated.Text>
      <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: 31, bottom: 12, width: 18, height: 2, borderRadius: 1, backgroundColor: p.linha }, sTraco]} />
    </View>
  );
}

function ItemMenu({ item, chave, ativo, p, larg, indice, reduz, onIr, onMedir }: {
  item: LinkItem; chave: string; ativo: boolean; p: Paleta; larg: SharedValue<number>; indice: number; reduz: boolean;
  onIr: (r: Href) => void; onMedir: (chave: string, y: number, h: number) => void;
}) {
  const ativoSv = useSharedValue(ativo ? 1 : 0);
  const hover = useSharedValue(0);
  const toque = useSharedValue(0);
  const tempo = (v: number, duration = 160) => (reduz ? v : withTiming(v, { duration }));
  useEffect(() => { ativoSv.value = tempo(ativo ? 1 : 0, 240); }, [ativo, reduz]); // eslint-disable-line react-hooks/exhaustive-deps

  const sCaixa = useAnimatedStyle(() => ({ transform: [{ scale: 1 - toque.value * 0.03 }] }));
  const sHover = useAnimatedStyle(() => ({ opacity: hover.value * (1 - ativoSv.value) }));
  const sIcoOff = useAnimatedStyle(() => ({ opacity: 1 - ativoSv.value, transform: [{ scale: 1 + hover.value * 0.12 }] }));
  const sIcoOn = useAnimatedStyle(() => ({ opacity: ativoSv.value, transform: [{ scale: 0.8 + ativoSv.value * 0.2 }] }));
  const sTexto = useAnimatedStyle(() => ({
    opacity: textoOp(larg.value),
    color: interpolateColor(ativoSv.value, [0, 1], [p.suave, p.abaTexto]),
    transform: [{ translateX: (1 - abertura(larg.value)) * -8 + hover.value * 3 }],
  }));

  return (
    <Animated.View entering={reduz ? undefined : FadeInLeft.duration(380).delay(Math.min(indice, 12) * 32).easing(EASE)}
      onLayout={e => onMedir(chave, e.nativeEvent.layout.y, e.nativeEvent.layout.height)}>
      <Pressable accessibilityRole="button" accessibilityLabel={item.label} accessibilityState={{ selected: ativo }} onPress={() => onIr(item.route)}
        onHoverIn={() => { hover.value = tempo(1, 150); }} onHoverOut={() => { hover.value = tempo(0, 200); }}
        onPressIn={() => { toque.value = tempo(1, 90); }} onPressOut={() => { toque.value = tempo(0, 180); }}>
        <Animated.View style={[st.item, sCaixa]}>
          <Animated.View pointerEvents="none" style={[st.itemHover, { backgroundColor: p.hover }, sHover]} />
          <View style={st.iconeBox}>
            <Animated.View style={[st.iconeCamada, sIcoOff]}><item.icon size={20} color={p.suave} weight="regular" /></Animated.View>
            <Animated.View style={[st.iconeCamada, sIcoOn]}><item.icon size={20} color={p.abaTexto} weight="fill" /></Animated.View>
          </View>
          <Animated.Text numberOfLines={1} style={[st.rotulo, sTexto, ativo && { fontWeight: '800' }]}>{item.label}</Animated.Text>
        </Animated.View>
      </Pressable>
    </Animated.View>
  );
}

function BotaoLateral({ icon: IconCmp, label, onPress, p }: { icon: Icon; label: string; onPress: () => void; p: Paleta }) {
  const hover = useSharedValue(0);
  const s = useAnimatedStyle(() => ({ backgroundColor: interpolateColor(hover.value, [0, 1], ['transparent', p.hover]), transform: [{ scale: 1 + hover.value * 0.06 }] }));
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} hitSlop={4} onPress={onPress}
      onHoverIn={() => { hover.value = withTiming(1, { duration: 140 }); }} onHoverOut={() => { hover.value = withTiming(0, { duration: 180 }); }}>
      <Animated.View style={[{ width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }, s]}>
        <IconCmp size={19} color={p.suave} weight="regular" />
      </Animated.View>
    </Pressable>
  );
}

export function DesktopShell({ children }: { children: ReactNode }) {
  const { width } = useTela();
  const [collapsed, setCollapsed] = useState(width < 1220);
  const pathname = usePathname();
  const router = useRouter();
  const { colors, mode, toggleTheme } = useContext(ThemeContext);
  const { userEmail, isAdmin, podeAcessar, nome, avatar, signOut, empresa, dono, filialConta } = useAuth();
  const reduz = useReducedMotion();
  const p = useMemo(() => paletaDa(colors, mode === 'dark'), [colors, mode]);
  const styles = useMemo(() => makeStyles(colors, p), [colors, p]);

  // Largura animada da barra e aba ativa que desliza até o item da página atual.
  const larg = useSharedValue(collapsed ? W_FECHADA : W_ABERTA);
  useEffect(() => {
    const alvo = collapsed ? W_FECHADA : W_ABERTA;
    larg.value = reduz ? alvo : withTiming(alvo, { duration: 320, easing: EASE });
  }, [collapsed, reduz]); // eslint-disable-line react-hooks/exhaustive-deps
  const indY = useSharedValue(0);
  const indH = useSharedValue(44);
  const indOp = useSharedValue(0);
  const posicionado = useRef(false);
  const medidas = useRef<Record<string, { y: number; h: number }>>({});
  const [medidaVersao, setMedidaVersao] = useState(0);
  const medir = useCallback((chave: string, y: number, h: number) => {
    const antes = medidas.current[chave];
    if (antes && antes.y === y && antes.h === h) return;
    medidas.current[chave] = { y, h };
    setMedidaVersao(v => v + 1);
  }, []);

  const sBarra = useAnimatedStyle(() => ({ width: larg.value }));
  const sMarca = useAnimatedStyle(() => ({ opacity: textoOp(larg.value), transform: [{ translateX: (1 - abertura(larg.value)) * -10 }] }));
  const sPerfil = useAnimatedStyle(() => ({ opacity: textoOp(larg.value), transform: [{ translateX: (1 - abertura(larg.value)) * -10 }] }));
  const sAba = useAnimatedStyle(() => ({ opacity: indOp.value, height: indH.value, transform: [{ translateY: indY.value }] }));
  const sAlca = useAnimatedStyle(() => ({ left: larg.value - 16 }));
  const sSeta = useAnimatedStyle(() => ({ transform: [{ rotate: `${(1 - abertura(larg.value)) * 180}deg` }] }));

  const isActive = (route: string) => route === '/' ? pathname === '/' || pathname === '/index' : pathname === route || pathname.startsWith(`${route}/`);
  const grupos: { titulo: string; itens: LinkItem[] }[] = [
    { titulo: 'INÍCIO', itens: [{ label: 'Visão geral', route: '/', icon: HouseIcon }] },
    { titulo: 'OPERAÇÃO', itens: MODULES.filter(m => podeAcessar(m.id)).map(m => ({ label: m.curto ?? m.name, route: m.route, icon: m.icon })) },
    ...(filialConta ? [] : [{ titulo: 'CADASTROS', itens: [
      { label: 'Filiais', route: '/filiais' as Href, icon: StorefrontIcon },
      { label: 'Combustíveis', route: '/combustiveis' as Href, icon: DropIcon },
      { label: 'Bandeiras', route: '/bandeiras' as Href, icon: StorefrontIcon },
    ] }]),
    ...(isAdmin ? [{ titulo: 'ADMINISTRAÇÃO', itens: [{ label: 'Usuários e permissões', route: '/usuarios' as Href, icon: UserCircleIcon }] }] : []),
    ...(dono ? [{ titulo: 'PLATAFORMA', itens: [{ label: 'Empresas e planos', route: '/plataforma' as Href, icon: SquaresFourIcon }] }] : []),
    { titulo: 'PREFERÊNCIAS', itens: [{ label: 'Configurações', route: '/configuracoes', icon: GearIcon }] },
  ];
  const chaveAtiva = grupos.flatMap(g => g.itens).find(i => isActive(String(i.route)))?.route;
  const ativaKey = chaveAtiva === undefined ? null : String(chaveAtiva);

  useEffect(() => {
    const m = ativaKey ? medidas.current[ativaKey] : undefined;
    if (!m) { indOp.value = reduz ? 0 : withTiming(0, { duration: 160 }); return; }
    if (!posicionado.current || reduz) { indY.value = m.y; indH.value = m.h; indOp.value = 1; posicionado.current = true; return; }
    indY.value = withSpring(m.y, { damping: 22, stiffness: 230, mass: 0.75 });
    indH.value = withTiming(m.h, { duration: 220 });
    indOp.value = withTiming(1, { duration: 160 });
  }, [ativaKey, medidaVersao, reduz]); // eslint-disable-line react-hooks/exhaustive-deps

  if (Platform.OS !== 'web' || width < 980) return <>{children}</>;
  const compact = collapsed;
  let indice = 0;

  return (
    <View style={styles.shell}>
      <Animated.View style={[styles.sidebar, sBarra]}>
        <View style={styles.brand}>
          <Image source={require('../assets/favicon.png')} style={styles.logo} accessibilityLabel="EasyAudit" />
          <Animated.View style={[styles.brandCopy, sMarca]}><Text style={styles.brandName}>EasyAudit</Text><Text numberOfLines={1} style={styles.brandSub}>{empresa?.nome ?? 'EasyAudit'}</Text></Animated.View>
        </View>

        <ScrollView style={styles.navScroll} contentContainerStyle={styles.navContent} showsVerticalScrollIndicator={false}>
          {/* Aba da página atual: arredondada à esquerda e com curvas invertidas em cima e embaixo, abraçando o conteúdo. */}
          <Animated.View pointerEvents="none" style={[styles.aba, sAba]}>
            <View style={[styles.abaCanto, { top: -CURVA }]}><View style={[styles.abaCantoMiolo, { borderBottomRightRadius: CURVA }]} /></View>
            <View style={[styles.abaCanto, { bottom: -CURVA }]}><View style={[styles.abaCantoMiolo, { borderTopRightRadius: CURVA }]} /></View>
          </Animated.View>
          {grupos.map(g => (g.itens.length ? (
            // Rótulo e itens ficam direto no conteúdo da lista: a posição medida de cada item vale para a aba deslizante.
            <Fragment key={g.titulo}>
              <Grupo texto={g.titulo} p={p} larg={larg} />
              {g.itens.map(item => {
                const chave = String(item.route);
                return <ItemMenu key={chave} item={item} chave={chave} ativo={chave === ativaKey} p={p} larg={larg} indice={indice++} reduz={reduz} onIr={r => router.push(r)} onMedir={medir} />;
              })}
            </Fragment>
          ) : null))}
        </ScrollView>

        <View style={styles.sidebarFooter}>
          <View style={[styles.footerActions, compact && styles.footerActionsCompact]}>
            <BotaoLateral icon={mode === 'dark' ? SunIcon : MoonIcon} label={mode === 'dark' ? 'Ativar modo claro' : 'Ativar modo escuro'} onPress={toggleTheme} p={p} />
            {isSupabaseConfigured && userEmail ? <BotaoLateral icon={SignOutIcon} label="Sair da conta" p={p}
              onPress={() => confirmAction('Sair da conta?', 'Você volta para a tela de login. Registros ainda não enviados continuam salvos neste aparelho.', 'Sair', () => void signOut())} /> : null}
          </View>
          <Pressable onPress={() => router.push('/conta')} accessibilityRole="button" accessibilityLabel="Minha conta" style={({ pressed }) => [styles.profile, pressed && { opacity: 0.8 }]}>
            <Avatar uri={avatar} nome={nome || userEmail} size={36} />
            <Animated.View style={[styles.profileCopy, sPerfil]}>
              <Text numberOfLines={1} style={styles.profileName}>{nome || userEmail || 'Minha conta'}</Text>
              <Text numberOfLines={1} style={styles.profileRole}>{isAdmin ? 'Administrador' : 'Minha conta'} · v{VERSAO}</Text>
            </Animated.View>
          </Pressable>
        </View>
      </Animated.View>

      <Animated.View style={[styles.alca, sAlca]}>
        <Pressable accessibilityRole="button" accessibilityLabel={compact ? 'Expandir menu lateral' : 'Recolher menu lateral'} hitSlop={8} onPress={() => setCollapsed(v => !v)}
          style={({ pressed }) => [styles.alcaBotao, pressed && { transform: [{ scale: 0.92 }] }]}>
          <Animated.View style={sSeta}><CaretLeftIcon size={14} color={colors.accent} weight="bold" /></Animated.View>
        </Pressable>
      </Animated.View>

      <View style={styles.main}>{children}</View>
    </View>
  );
}

/** Estilos fixos dos itens (não dependem do tema; as cores vêm da paleta). */
const st = StyleSheet.create({
  item: { height: 44, flexDirection: 'row', alignItems: 'center', paddingLeft: 18, gap: 14, borderTopLeftRadius: RAIO - 2, borderBottomLeftRadius: RAIO - 2 },
  itemHover: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, borderTopLeftRadius: RAIO - 2, borderBottomLeftRadius: RAIO - 2 },
  iconeBox: { width: 20, height: 20 },
  iconeCamada: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  rotulo: { width: 176, fontSize: 13, fontWeight: '600' },
});

const makeStyles = (c: ThemeColors, p: Paleta) => StyleSheet.create({
  shell: { flex: 1, minHeight: '100%', flexDirection: 'row', backgroundColor: c.bg },
  sidebar: { flexShrink: 0, overflow: 'hidden', paddingTop: 22, paddingBottom: 14, backgroundColor: p.fundo, borderTopRightRadius: RAIO + 8, borderBottomRightRadius: RAIO + 8 },
  brand: { height: 52, flexDirection: 'row', alignItems: 'center', gap: 12, paddingLeft: 20, marginBottom: 14 },
  logo: { width: 38, height: 38, borderRadius: 12 },
  brandCopy: { width: 150, gap: 1 },
  brandName: { color: p.texto, fontSize: 16, fontWeight: '800', letterSpacing: -0.3 },
  brandSub: { color: p.suave, fontSize: 11 },
  navScroll: { flex: 1 },
  navContent: { paddingLeft: 12, paddingBottom: 12, gap: 4 },
  aba: { position: 'absolute', top: 0, left: 12, right: 0, overflow: 'visible', backgroundColor: p.abaFundo, borderTopLeftRadius: RAIO, borderBottomLeftRadius: RAIO },
  // Curva invertida: quadrado da cor da aba com um "miolo" da cor da barra arredondado no canto de fora.
  abaCanto: { position: 'absolute', right: 0, width: CURVA, height: CURVA, backgroundColor: p.abaFundo },
  abaCantoMiolo: { flex: 1, backgroundColor: p.fundo },
  sidebarFooter: { gap: 8, marginHorizontal: 14, borderTopWidth: 1, borderTopColor: p.linha, paddingTop: 12 },
  footerActions: { flexDirection: 'row', gap: 4, paddingLeft: 7 },
  footerActionsCompact: { flexDirection: 'column' },
  profile: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4, paddingLeft: 7 },
  profileCopy: { width: 130, gap: 2 },
  profileName: { color: p.texto, fontSize: 12, fontWeight: '700' },
  profileRole: { color: p.suave, fontSize: 10.5 },
  alca: { position: 'absolute', top: 30, zIndex: 30 },
  alcaBotao: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: c.bg, borderWidth: 1, borderColor: c.border },
  main: { flex: 1, minWidth: 0, minHeight: 0 },
});
