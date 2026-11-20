import { useRouter } from 'expo-router';
import { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../lib/auth';
import { supabase } from '../../lib/supabase';
import { MODULES } from '../../modules/registry';
import { ArrowLeftIcon, CheckIcon, LockSimpleIcon, PencilSimpleIcon, StorefrontIcon } from '../../ui/icons';
import { Button, Card, ChoiceChips, confirmAction, EmptyState, Field, IconButton, notify, SectionHeader, Sheet, Skeleton, StatusPill } from '../../ui/kit';
import { createTypography, pageMaxWidth, radius, space, ThemeContext } from '../../ui/theme';
import { BotaoVoltar } from '../../ui/voltar';

type Status = 'aguardando' | 'ativa' | 'suspensa';
type Empresa = {
  id: string; nome: string; documento: string; telefone: string; plano_id: string; limite_contas: number; modulos: string[]; status: Status; created_at: string;
  contas_ativas: number; administradores: { email: string; nome: string | null }[];
};
type Plano = { id: string; nome: string; descricao: string; preco_mensal: number | null; limite_contas: number; modulos: string[]; ordem: number; ativo: boolean };
type EdicaoEmpresa = { e: Empresa; plano_id: string; limite: string; modulos: string[] };
type EdicaoPlano = { p: Plano; nome: string; descricao: string; preco: string; limite: string; modulos: string[]; ativo: boolean };

const ROTULO: Record<Status, string> = { aguardando: 'Aguardando', ativa: 'Ativa', suspensa: 'Suspensa' };
const TOM: Record<Status, 'warning' | 'success' | 'danger'> = { aguardando: 'warning', ativa: 'success', suspensa: 'danger' };
const preco = (v: number | null) => (v === null ? 'Sob consulta' : `${v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}/mês`);

async function chamar(body: Record<string, unknown>): Promise<{ ok: true; data: unknown } | { ok: false; erro: string }> {
  if (!supabase) return { ok: false, erro: 'Sem servidor configurado.' };
  const { data, error } = await supabase.functions.invoke('empresas', { body });
  if (!error) return { ok: true, data };
  let erro = 'Não foi possível falar com o servidor. Verifique a conexão.';
  try { const r = (error as { context?: Response }).context; const c = r ? await r.json() : null; if (c?.erro) erro = String(c.erro); } catch { /* sem JSON */ }
  return { ok: false, erro };
}

/** Painel do dono da plataforma: empresas (liberar, suspender, plano, limite, módulos) e planos (preço, limite, módulos). */
export default function PlataformaScreen() {
  const router = useRouter();
  const { dono } = useAuth();
  const { colors } = useContext(ThemeContext);
  const t = useMemo(() => createTypography(colors), [colors]);
  const [aba, setAba] = useState<'Empresas' | 'Planos'>('Empresas');
  const [empresas, setEmpresas] = useState<Empresa[] | null>(null);
  const [planos, setPlanos] = useState<Plano[]>([]);
  const [erro, setErro] = useState('');
  const [atualizando, setAtualizando] = useState(false);
  const [edEmp, setEdEmp] = useState<EdicaoEmpresa | null>(null);
  const [edPlano, setEdPlano] = useState<EdicaoPlano | null>(null);
  const [salvando, setSalvando] = useState(false);

  const carregar = useCallback(async () => {
    const r = await chamar({ acao: 'listar' });
    if (!r.ok) { setErro(r.erro); return; }
    const d = r.data as { empresas: Empresa[]; planos: Plano[] };
    setErro(''); setEmpresas(d.empresas); setPlanos(d.planos);
  }, []);
  useEffect(() => { if (dono) void carregar(); }, [dono, carregar]);

  const atualizar = async (body: Record<string, unknown>, ok: string) => {
    setSalvando(true);
    const r = await chamar({ acao: 'atualizar', ...body });
    setSalvando(false);
    if (!r.ok) { notify('Não foi possível salvar', r.erro); return false; }
    notify(ok); void carregar(); return true;
  };
  const nomePlano = (id: string) => planos.find(p => p.id === id)?.nome ?? id;
  const voltar = () => (router.canGoBack() ? router.back() : router.replace('/'));

  const modChips = (sel: string[], onToggle: (id: string) => void) => (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
      {MODULES.map(m => {
        const on = sel.includes(m.id);
        return (
          <Pressable key={m.id} accessibilityRole="checkbox" accessibilityState={{ checked: on }} onPress={() => onToggle(m.id)}
            style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 36, paddingHorizontal: 12, borderRadius: radius.pill, borderWidth: 1, borderColor: on ? colors.accent : colors.borderStrong, backgroundColor: on ? colors.accentSoft : colors.surface }, pressed && { opacity: 0.7 }]}>
            {on ? <CheckIcon size={14} color={colors.accentText} weight="bold" /> : null}
            <Text style={{ fontSize: 13, fontWeight: '600', color: on ? colors.accentText : colors.textMuted }}>{m.name}</Text>
          </Pressable>
        );
      })}
    </View>
  );
  const alternar = (l: string[], id: string) => (l.includes(id) ? l.filter(x => x !== id) : [...l, id]);

  const cartao = (e: Empresa) => (
    <Card key={e.id} style={e.status === 'aguardando' ? { borderColor: colors.warning } : undefined}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
        <View style={{ flex: 1 }}>
          <Text style={t.bodyStrong} numberOfLines={1}>{e.nome}</Text>
          <Text style={t.caption} numberOfLines={2}>
            Plano {nomePlano(e.plano_id)} · {e.contas_ativas} de {e.limite_contas} contas · desde {new Date(e.created_at).toLocaleDateString('pt-BR')}
          </Text>
        </View>
        <StatusPill label={ROTULO[e.status]} tone={TOM[e.status]} />
      </View>
      <Text style={t.caption}>
        Administrador{e.administradores.length === 1 ? '' : 'es'}: {e.administradores.map(a => (a.nome ? `${a.nome} (${a.email})` : a.email)).join(', ') || 'nenhum'}
        {e.documento ? `\nCNPJ ${e.documento}` : ''}{e.telefone ? `\nTelefone ${e.telefone}` : ''}
      </Text>
      <Text style={t.caption}>Módulos: {e.modulos.map(id => MODULES.find(m => m.id === id)?.name ?? id).join(', ')}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
        {e.status !== 'ativa' ? (
          <Button title={e.status === 'aguardando' ? 'Liberar empresa' : 'Reativar'} icon={CheckIcon} size="sm" disabled={salvando}
            onPress={() => confirmAction(e.status === 'aguardando' ? 'Liberar empresa?' : 'Reativar empresa?', `${e.nome} passa a usar o EasyAudit no plano ${nomePlano(e.plano_id)}. ${e.status === 'aguardando' ? 'Os administradores recebem um e-mail.' : ''}`, 'Liberar', () => void atualizar({ id: e.id, status: 'ativa' }, `${e.nome} liberada.`))} />
        ) : (
          <Button title="Suspender" variant="danger" size="sm" disabled={salvando}
            onPress={() => confirmAction('Suspender empresa?', `Ninguém da ${e.nome} consegue usar o sistema enquanto estiver suspensa. Os dados continuam guardados.`, 'Suspender', () => void atualizar({ id: e.id, status: 'suspensa' }, `${e.nome} suspensa.`))} />
        )}
        <Button title="Plano, limite e módulos" icon={PencilSimpleIcon} variant="secondary" size="sm"
          onPress={() => setEdEmp({ e, plano_id: e.plano_id, limite: String(e.limite_contas), modulos: [...e.modulos] })} />
      </View>
    </Card>
  );

  const grupos: { titulo: string; lista: Empresa[] }[] = [
    { titulo: 'Aguardando liberação', lista: (empresas ?? []).filter(e => e.status === 'aguardando') },
    { titulo: 'Ativas', lista: (empresas ?? []).filter(e => e.status === 'ativa') },
    { titulo: 'Suspensas', lista: (empresas ?? []).filter(e => e.status === 'suspensa') },
  ];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.lg, paddingVertical: space.md, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border }}>
        <BotaoVoltar label="Voltar" onPress={voltar} />
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 15.5, fontWeight: '800', color: colors.text }}>Empresas e planos</Text>
          <Text style={t.caption}>Clientes do EasyAudit, liberação e planos</Text>
        </View>
      </View>
      <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.md, width: '100%', maxWidth: pageMaxWidth(820), alignSelf: 'center', paddingBottom: 56 }}
        refreshControl={<RefreshControl refreshing={atualizando} onRefresh={() => { setAtualizando(true); void carregar().finally(() => setAtualizando(false)); }} />}>
        {!dono ? <EmptyState icon={LockSimpleIcon} title="Acesso restrito" text="Somente o dono do EasyAudit administra as empresas." />
          : erro ? <EmptyState icon={StorefrontIcon} title="Não foi possível carregar" text={erro} action={{ label: 'Tentar de novo', onPress: () => void carregar() }} />
          : !empresas ? <><Skeleton height={120} /><Skeleton height={120} /></>
          : <>
            <ChoiceChips value={aba} options={['Empresas', 'Planos']} onChange={v => setAba(v as typeof aba)} />
            {aba === 'Empresas' ? grupos.map(g => (g.lista.length || g.titulo === 'Aguardando liberação' ? (
              <View key={g.titulo} style={{ gap: space.md }}>
                <SectionHeader title={`${g.titulo} (${g.lista.length})`} />
                {g.lista.length ? g.lista.map(cartao) : <Text style={t.caption}>Nenhuma empresa esperando. Quem se cadastra pelo site aparece aqui, e você recebe um e-mail.</Text>}
              </View>
            ) : null)) : <>
              <Text style={t.caption}>Os planos aparecem no site para quem vai criar a empresa. Mudar um plano não muda as empresas que já estão nele (ajuste cada uma em Empresas).</Text>
              {planos.map(p => (
                <Card key={p.id}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
                    <View style={{ flex: 1 }}>
                      <Text style={t.bodyStrong}>{p.nome}</Text>
                      <Text style={t.caption}>{preco(p.preco_mensal)} · até {p.limite_contas} contas · {p.modulos.length} módulos</Text>
                    </View>
                    <StatusPill label={p.ativo ? 'No site' : 'Oculto'} tone={p.ativo ? 'success' : 'neutral'} />
                  </View>
                  <Text style={t.caption}>{p.descricao}</Text>
                  <Button title="Editar plano" icon={PencilSimpleIcon} variant="secondary" size="sm" style={{ alignSelf: 'flex-start' }}
                    onPress={() => setEdPlano({ p, nome: p.nome, descricao: p.descricao, preco: p.preco_mensal === null ? '' : String(p.preco_mensal).replace('.', ','), limite: String(p.limite_contas), modulos: [...p.modulos], ativo: p.ativo })} />
                </Card>
              ))}
            </>}
          </>}
      </ScrollView>

      {edEmp && (
        <Sheet title={edEmp.e.nome} onClose={() => !salvando && setEdEmp(null)}
          footer={<Button title={salvando ? 'Salvando…' : 'Salvar'} icon={CheckIcon} disabled={salvando} onPress={() => void (async () => {
            const limite = Math.floor(Number(edEmp.limite));
            if (!(limite >= 1)) { notify('Limite inválido', 'Informe quantas contas ativas a empresa pode ter.'); return; }
            if (!edEmp.modulos.length) { notify('Marque os módulos'); return; }
            const body: Record<string, unknown> = { id: edEmp.e.id };
            if (edEmp.plano_id !== edEmp.e.plano_id) body.plano_id = edEmp.plano_id;
            body.limite_contas = limite; body.modulos = edEmp.modulos;
            if (await atualizar(body, 'Empresa atualizada.')) setEdEmp(null);
          })()} />}>
          <Text style={t.label}>Plano</Text>
          <ChoiceChips value={nomePlano(edEmp.plano_id)} options={planos.map(p => p.nome)}
            onChange={v => { const p = planos.find(x => x.nome === v); if (p) setEdEmp({ ...edEmp, plano_id: p.id, limite: String(p.limite_contas), modulos: [...p.modulos] }); }} />
          <Text style={t.caption}>Trocar o plano traz o limite e os módulos dele; dá para ajustar abaixo só para esta empresa.</Text>
          <Field label="Limite de contas ativas" value={edEmp.limite} onChangeText={v => setEdEmp({ ...edEmp, limite: v.replace(/\D/g, '') })} keyboardType="number-pad" />
          <Text style={t.caption}>Hoje: {edEmp.e.contas_ativas} conta(s) ativa(s).</Text>
          <Text style={t.label}>Módulos da empresa</Text>
          {modChips(edEmp.modulos, id => setEdEmp({ ...edEmp, modulos: alternar(edEmp.modulos, id) }))}
        </Sheet>
      )}

      {edPlano && (
        <Sheet title={`Plano ${edPlano.p.nome}`} onClose={() => !salvando && setEdPlano(null)}
          footer={<Button title={salvando ? 'Salvando…' : 'Salvar plano'} icon={CheckIcon} disabled={salvando} onPress={() => void (async () => {
            const limite = Math.floor(Number(edPlano.limite));
            const precoTxt = edPlano.preco.trim().replace(/\./g, '').replace(',', '.');
            const valor = precoTxt === '' ? null : Number(precoTxt);
            if (!(limite >= 1)) { notify('Limite inválido'); return; }
            if (valor !== null && !(valor >= 0)) { notify('Preço inválido', 'Digite só o valor mensal (ex.: 490 ou 1.290,00), ou deixe vazio para "Sob consulta".'); return; }
            if (!edPlano.modulos.length) { notify('Marque os módulos'); return; }
            setSalvando(true);
            const r = await chamar({ acao: 'salvar_plano', id: edPlano.p.id, nome: edPlano.nome, descricao: edPlano.descricao, preco_mensal: valor, limite_contas: limite, modulos: edPlano.modulos, ativo: edPlano.ativo });
            setSalvando(false);
            if (!r.ok) { notify('Plano não salvo', r.erro); return; }
            setEdPlano(null); void carregar();
          })()} />}>
          <Field label="Nome" value={edPlano.nome} onChangeText={v => setEdPlano({ ...edPlano, nome: v })} maxLength={60} />
          <Field label="Descrição (aparece no site)" value={edPlano.descricao} onChangeText={v => setEdPlano({ ...edPlano, descricao: v })} maxLength={300} multiline />
          <Field label="Preço mensal (R$)" value={edPlano.preco} onChangeText={v => setEdPlano({ ...edPlano, preco: v })} keyboardType="decimal-pad" placeholder="Vazio = Sob consulta" />
          <Field label="Limite de contas" value={edPlano.limite} onChangeText={v => setEdPlano({ ...edPlano, limite: v.replace(/\D/g, '') })} keyboardType="number-pad" />
          <Text style={t.label}>Módulos do plano</Text>
          {modChips(edPlano.modulos, id => setEdPlano({ ...edPlano, modulos: alternar(edPlano.modulos, id) }))}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
            <Text style={[t.bodyStrong, { flex: 1 }]}>Mostrar no site</Text>
            <Switch value={edPlano.ativo} onValueChange={v => setEdPlano({ ...edPlano, ativo: v })} accessibilityLabel="Mostrar no site" />
          </View>
        </Sheet>
      )}
    </SafeAreaView>
  );
}
