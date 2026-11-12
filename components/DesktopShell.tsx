import { usePathname, useRouter, type Href } from 'expo-router';
import { type ReactNode, useContext, useMemo, useState } from 'react';
import { Image, Platform, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Avatar } from './Avatar';
import { useAuth } from '../lib/auth';
import { isSupabaseConfigured } from '../lib/supabase';
import { MODULES } from '../modules/registry';
import { DropIcon, HouseIcon, MoonIcon, SidebarSimpleIcon, SignOutIcon, StorefrontIcon, SunIcon, UserCircleIcon, type Icon } from '../ui/icons';
import { IconButton, confirmAction } from '../ui/kit';
import { radius, ThemeContext, type ThemeColors } from '../ui/theme';

type LinkItem = { label: string; route: Href; icon: Icon };

export function DesktopShell({ children }: { children: ReactNode }) {
  const { width } = useWindowDimensions();
  const [collapsed, setCollapsed] = useState(width < 1220);
  const pathname = usePathname();
  const router = useRouter();
  const { colors, mode, toggleTheme } = useContext(ThemeContext);
  const { userEmail, isAdmin, podeAcessar, nome, avatar, signOut } = useAuth();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  if (Platform.OS !== 'web' || width < 980) return <>{children}</>;
  const compact = collapsed;
  const available = MODULES.filter(m => podeAcessar(m.id));
  const isActive = (route: string) => route === '/' ? pathname === '/' || pathname === '/index' : pathname === route || pathname.startsWith(`${route}/`);
  const NavItem = ({ item }: { item: LinkItem }) => {
    const active = isActive(String(item.route));
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={item.label}
        accessibilityState={{ selected: active }}
        onPress={() => router.push(item.route)}
        style={({ pressed }) => [styles.navItem, active && styles.navItemActive, pressed && styles.navPressed]}
      >
        <item.icon size={18} color={active ? '#f2ef57' : colors.textMuted} weight={active ? 'fill' : 'regular'} />
        {!compact ? <Text numberOfLines={1} style={[styles.navLabel, active && styles.navLabelActive]}>{item.label}</Text> : null}
      </Pressable>
    );
  };

  return (
    <View style={styles.shell}>
      <View style={[styles.sidebar, compact && styles.sidebarCompact]}>
        <View style={[styles.brand, compact && styles.brandCompact]}>
          <Image source={require('../assets/favicon.png')} style={styles.logo} accessibilityLabel="Postora" />
          {!compact ? <View style={styles.brandCopy}><Text style={styles.brandName}>Postora</Text><Text style={styles.brandSub}>Rede Nevoeiro</Text></View> : null}
          <IconButton icon={SidebarSimpleIcon} label={compact ? 'Expandir menu lateral' : 'Recolher menu lateral'} onPress={() => setCollapsed(value => !value)} />
        </View>

        <ScrollView style={styles.navScroll} contentContainerStyle={styles.navContent}>
          <Text style={styles.groupLabel}>{compact ? '·' : 'INÍCIO'}</Text>
          <NavItem item={{ label: 'Visão geral', route: '/', icon: HouseIcon }} />
          <Text style={styles.groupLabel}>{compact ? '·' : 'OPERAÇÃO'}</Text>
          {available.map(m => <NavItem key={m.id} item={{ label: m.name, route: m.route, icon: m.icon }} />)}
          <Text style={styles.groupLabel}>{compact ? '·' : 'CADASTROS'}</Text>
          <NavItem item={{ label: 'Filiais', route: '/filiais', icon: StorefrontIcon }} />
          <NavItem item={{ label: 'Combustíveis', route: '/combustiveis', icon: DropIcon }} />
          <NavItem item={{ label: 'Bandeiras', route: '/bandeiras', icon: StorefrontIcon }} />
          {isAdmin ? <><Text style={styles.groupLabel}>{compact ? '·' : 'ADMINISTRAÇÃO'}</Text><NavItem item={{ label: 'Usuários e permissões', route: '/usuarios', icon: UserCircleIcon }} /></> : null}
        </ScrollView>

        <View style={styles.sidebarFooter}>
          <View style={[styles.footerActions, compact && styles.footerActionsCompact]}>
            <IconButton icon={mode === 'dark' ? SunIcon : MoonIcon} label={mode === 'dark' ? 'Ativar modo claro' : 'Ativar modo escuro'} onPress={toggleTheme} />
            {isSupabaseConfigured && userEmail ? <IconButton icon={SignOutIcon} label="Sair da conta" onPress={() => confirmAction('Sair da conta?', 'Você volta para a tela de login. Registros ainda não enviados continuam salvos neste aparelho.', 'Sair', () => void signOut())} /> : null}
          </View>
          <Pressable onPress={() => router.push('/conta')} accessibilityRole="button" accessibilityLabel="Minha conta" style={({ pressed }) => [styles.profile, compact && styles.profileCompact, pressed && styles.navPressed]}>
            <Avatar uri={avatar} nome={nome || userEmail} size={34} />
            {!compact ? <View style={styles.profileCopy}><Text numberOfLines={1} style={styles.profileName}>{nome || userEmail || 'Modo local'}</Text><Text style={styles.profileRole}>{isAdmin ? 'Administrador' : 'Minha conta'}</Text></View> : null}
          </Pressable>
        </View>
      </View>
      <View style={styles.main}>{children}</View>
    </View>
  );
}

const makeStyles = (c: ThemeColors) => StyleSheet.create({
  shell: { flex: 1, minHeight: '100%', flexDirection: 'row', backgroundColor: c.bg },
  sidebar: { width: 244, flexShrink: 0, paddingHorizontal: 14, paddingTop: 18, paddingBottom: 12, backgroundColor: c.surface, borderRightWidth: 1, borderRightColor: c.border },
  sidebarCompact: { width: 76, paddingHorizontal: 8, alignItems: 'center' },
  brand: { minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingHorizontal: 8, marginBottom: 18 },
  brandCompact: { minHeight: 82, flexDirection: 'column', justifyContent: 'center', gap: 2, paddingHorizontal: 0 },
  logo: { width: 34, height: 34, borderRadius: 10 },
  brandCopy: { gap: 1 },
  brandName: { color: c.text, fontSize: 15, fontWeight: '800', letterSpacing: -0.3 },
  brandSub: { color: c.textMuted, fontSize: 11 },
  navScroll: { flex: 1, width: '100%' },
  navContent: { gap: 4, paddingBottom: 12 },
  groupLabel: { color: c.textFaint, fontSize: 9, fontWeight: '800', letterSpacing: 1.2, paddingHorizontal: 11, paddingTop: 12, paddingBottom: 5 },
  navItem: { minHeight: 40, flexDirection: 'row', alignItems: 'center', gap: 11, paddingHorizontal: 11, borderRadius: 10 },
  navItemActive: { backgroundColor: '#252722' },
  navLabel: { flex: 1, color: c.textMuted, fontSize: 12.5, fontWeight: '600' },
  navLabelActive: { color: '#ffffff', fontWeight: '700' },
  navPressed: { opacity: 0.78, transform: [{ scale: 0.985 }] },
  sidebarFooter: { width: '100%', gap: 10, borderTopWidth: 1, borderTopColor: c.border, paddingTop: 10 },
  footerActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 2 },
  footerActionsCompact: { justifyContent: 'center' },
  profile: { flexDirection: 'row', alignItems: 'center', gap: 9, padding: 7, borderRadius: radius.control },
  profileCompact: { justifyContent: 'center' },
  profileCopy: { flex: 1, gap: 2 },
  profileName: { color: c.text, fontSize: 11.5, fontWeight: '700' },
  profileRole: { color: c.textMuted, fontSize: 10.5 },
  main: { flex: 1, minWidth: 0, minHeight: 0 },
});
