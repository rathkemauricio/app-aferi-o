import { useRouter } from 'expo-router';
import { type ReactNode, useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import {
  ArrowLeftIcon, CalendarBlankIcon, CheckIcon, FlagCheckeredIcon, ListBulletsIcon, MagnifyingGlassIcon, PencilSimpleIcon, PlayIcon, PlusIcon,
  QueueIcon, StopIcon, StorefrontIcon, TimerIcon, TrashIcon, XIcon,
} from '../../ui/icons';
import { Button, Card, ChoiceChips, confirmAction, EmptyState, Field, IconButton, ListRow, notify, SectionHeader, Sheet, StatusPill } from '../../ui/kit';
import {
  type Atendimento, type Atividade, type Coleta, DEMANDAS, dataBR, duracaoAtendimento, duracaoEtapa, etapaAberta, etapaPausada, fmtCrono, fmtDur, hoje,
  horaBR, pausaSeg, SEQUENCIA_PISTA, SETORES, TURNOS,
} from './model';
import { ops } from './ops';
import type { ColetasView, TmData } from './store';
import { ActivityPicker, useLook, useNow } from './ui';

type Nav = { push: (v: ColetasView) => void; pop: () => void };

const atividadesDaColeta = (d: TmData, c: Coleta) => d.atividades.filter(a => a.ativo !== false && (a.setor === c.setor || a.setor === ''));
const nomeAtv = (d: TmData, id: string) => d.atividades.find(a => a.id === id)?.nome ?? 'Atividade removida';
const resumoEtapas = (d: TmData, a: Atendimento) => a.etapas.map(e => nomeAtv(d, e.atividade_id)).join(' › ') || 'Sem etapas';
const nomeVeiculo = (d: TmData, id?: string) => (id ? d.veiculos.find(v => v.id === id)?.nome ?? '' : '');
const nomeFilial = (d: TmData, id: string) => { const f = d.filiais.find(x => x.id === id); return f ? `${f.codigo} · ${f.nome}` : 'Filial removida'; };

/* =====================================================================
   Lista: Filial → Data → Coletas
   ===================================================================== */
export function ColetasHome({ data, nav, filialId, setFilialId }: { data: TmData; nav: Nav; filialId: string; setFilialId: (id: string) => void }) {
  const { s } = useLook();
  const router = useRouter();
  const [form, setForm] = useState<ColetaForm | null>(null);
  const [escolher, setEscolher] = useState(false);
  const filial = data.filiais.find(f => f.id === filialId) ?? null;

  const porData = useMemo(() => {
    const m = new Map<string, Coleta[]>();
    data.coletas.filter(c => c.filial_id === filial?.id).forEach(c => m.set(c.data, [...(m.get(c.data) ?? []), c]));
    return [...m.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [data.coletas, filial?.id]);

  if (!data.filiais.length) {
    return <>
      <PageHead title="Coletas" subtitle="Filial, data, coletas e atendimentos" />
      <EmptyState icon={StorefrontIcon} title="Nenhuma filial cadastrada" text="As coletas pertencem a uma filial do cadastro único." action={{ label: 'Abrir cadastro de filiais', onPress: () => router.push('/filiais') }} />
    </>;
  }

  return <>
    <PageHead title="Coletas" subtitle={filial ? `${filial.codigo} · ${filial.nome}` : 'Escolha a filial'}
      action={filial ? <Button title="Nova coleta" icon={PlusIcon} size="sm" onPress={() => setForm(novaColetaForm())} /> : undefined} />
    <Button title={filial ? 'Trocar filial' : 'Escolher filial'} icon={StorefrontIcon} variant="secondary" size="sm" style={{ alignSelf: 'flex-start' }} onPress={() => setEscolher(true)} />

    {!filial ? (
      <EmptyState icon={StorefrontIcon} title="Escolha a filial" text="Cada coleta pertence a uma filial e a uma data." action={{ label: 'Escolher filial', onPress: () => setEscolher(true) }} />
    ) : porData.length ? porData.map(([dia, cs]) => (
      <View key={dia} style={s.group}>
        <SectionHeader title={rotuloDia(dia)} />
        <Card style={s.listCard}>
          {cs.map((c, i) => {
            const aberto = data.rascunhos.some(a => a.coleta_id === c.id);
            const feitos = data.atendimentos.filter(a => a.coleta_id === c.id).length;
            return (
              <ListRow key={c.id} style={i > 0 && s.divided} icon={QueueIcon} tint="indigo"
                title={c.funcao ? `${c.setor} · ${c.funcao}` : c.setor}
                subtitle={`${c.turno}, ${c.demanda.toLowerCase()} · ${feitos} registro(s)${c.auditor ? ` · ${c.auditor}` : ''}`}
                right={aberto ? <StatusPill label="Em andamento" tone="accent" /> : undefined}
                onPress={() => nav.push({ name: 'coleta', coletaId: c.id })} />
            );
          })}
        </Card>
      </View>
    )) : (
      <EmptyState icon={CalendarBlankIcon} title="Nenhuma coleta nesta filial" text="Abra uma coleta para registrar atendimentos e atividades com cronômetro."
        action={{ label: 'Nova coleta', icon: PlusIcon, onPress: () => setForm(novaColetaForm()) }} />
    )}

    {escolher && <FilialPicker data={data} atual={filialId} onClose={() => setEscolher(false)} onPick={id => { setFilialId(id); setEscolher(false); }} />}

    {form && filial && (
      <ColetaSheet title="Nova coleta" form={form} setForm={setForm} onClose={() => setForm(null)}
        onSave={() => {
          if (!/^\d{4}-\d{2}-\d{2}$/.test(form.data)) { notify('Data inválida', 'Use o formato AAAA-MM-DD.'); return; }
          const id = ops.criarColeta({ filial_id: filial.id, ...form });
          setForm(null);
          nav.push({ name: 'coleta', coletaId: id });
        }} />
    )}
  </>;
}

/* =====================================================================
   Coleta: atendimentos e atividades individuais
   ===================================================================== */
export function ColetaScreen({ data, nav, coletaId }: { data: TmData; nav: Nav; coletaId: string }) {
  const { s, t } = useLook();
  const [form, setForm] = useState<ColetaForm | null>(null);
  const c = data.coletas.find(x => x.id === coletaId);
  const abertos = data.rascunhos.filter(a => a.coleta_id === coletaId);
  const now = useNow(abertos.length > 0);
  if (!c) return <Missing onBack={nav.pop} />;

  const feitos = data.atendimentos.filter(a => a.coleta_id === coletaId).sort((x, y) => (y.inicio ?? '').localeCompare(x.inicio ?? ''));
  const completos = [...feitos].reverse().filter(a => a.tipo === 'completo');
  const ultimoFuncionario = [...abertos, ...feitos].find(a => a.funcionario)?.funcionario ?? '';

  const iniciar = (tipo: Atendimento['tipo']) => {
    const id = ops.iniciar(coletaId, tipo, ultimoFuncionario);
    nav.push({ name: 'atendimento', coletaId, atendimentoId: id });
  };

  return <>
    <Button title="Coletas" icon={ArrowLeftIcon} variant="ghost" size="sm" style={s.alignStart} onPress={nav.pop} />
    <PageHead title={nomeFilial(data, c.filial_id)} subtitle={`${dataBR(c.data)} · ${c.setor}`}
      action={<IconButton icon={PencilSimpleIcon} label="Editar coleta" onPress={() => setForm({ data: c.data, setor: c.setor, funcao: c.funcao, turno: c.turno, demanda: c.demanda, auditor: c.auditor })} />} />
    <View style={[s.row, { flexWrap: 'wrap' }]}>
      <StatusPill label={c.turno} />
      <StatusPill label={c.demanda} />
      {c.funcao ? <StatusPill label={c.funcao} /> : null}
      {c.auditor ? <StatusPill label={`Auditor: ${c.auditor}`} /> : null}
    </View>

    {abertos.map(a => (
      <Card key={a.id} style={s.running}>
        <View style={s.row}>
          <View style={s.liveDot} />
          <Text style={[t.bodyStrong, s.flex]}>{a.tipo === 'completo' ? 'Atendimento em andamento' : 'Atividade individual em andamento'}</Text>
          <Text style={s.clockSmall}>{fmtCrono(duracaoAtendimento(a, now))}</Text>
        </View>
        <Text style={t.caption}>{[nomeVeiculo(data, a.veiculo), resumoEtapas(data, a)].filter(Boolean).join(' · ')}</Text>
        <Button title="Continuar" icon={PlayIcon} onPress={() => nav.push({ name: 'atendimento', coletaId, atendimentoId: a.id })} />
      </Card>
    ))}

    <View style={s.twoCol}>
      <Button title="Atendimento completo" icon={PlayIcon} style={s.flex} onPress={() => iniciar('completo')} />
      <Button title="Atividade individual" icon={TimerIcon} variant="secondary" style={s.flex} onPress={() => iniciar('isolada')} />
    </View>

    <SectionHeader title={`Registros (${feitos.length})`} />
    {feitos.length ? (
      <Card style={s.listCard}>
        {feitos.map((a, i) => (
          <ListRow key={a.id} style={i > 0 && s.divided}
            icon={a.tipo === 'completo' ? ListBulletsIcon : TimerIcon} tint={a.tipo === 'completo' ? 'indigo' : 'slate'}
            title={a.tipo === 'completo' ? `Atendimento ${completos.indexOf(a) + 1}` : nomeAtv(data, a.etapas[0]?.atividade_id ?? '')}
            subtitle={`${a.inicio ? horaBR(a.inicio).slice(0, 5) : 'Importado'} · ${a.tipo === 'completo' ? resumoEtapas(data, a) : 'Atividade individual'}${nomeVeiculo(data, a.veiculo) ? ` · ${nomeVeiculo(data, a.veiculo)}` : ''}${a.funcionario ? ` · ${a.funcionario}` : ''}`}
            right={<Text style={s.clockSmall}>{fmtDur(a.duracao_s)}</Text>}
            onPress={() => nav.push({ name: 'atendimento', coletaId, atendimentoId: a.id })} />
        ))}
      </Card>
    ) : <EmptyState icon={TimerIcon} title="Nenhum registro finalizado" text="Atendimento completo cronometra as etapas de um cliente; atividade individual cronometra uma tarefa avulsa." />}

    <Button title="Excluir coleta" icon={TrashIcon} variant="danger" size="sm"
      onPress={() => confirmAction('Excluir coleta?', `Os ${feitos.length + abertos.length} registro(s) desta coleta também serão excluídos.`, 'Excluir', () => { ops.excluirColeta(c, data.atendimentos); nav.pop(); })} />

    {form && (
      <ColetaSheet title="Editar coleta" form={form} setForm={setForm} onClose={() => setForm(null)}
        onSave={() => {
          if (!/^\d{4}-\d{2}-\d{2}$/.test(form.data)) { notify('Data inválida', 'Use o formato AAAA-MM-DD.'); return; }
          ops.editarColeta({ ...c, ...form }); setForm(null);
        }} />
    )}
  </>;
}

/* =====================================================================
   Atendimento: cronômetro por etapa
   ===================================================================== */
export function AtendimentoScreen({ data, nav, coletaId, atendimentoId }: { data: TmData; nav: Nav; coletaId: string; atendimentoId: string }) {
  const { s, t, colors } = useLook();
  const c = data.coletas.find(x => x.id === coletaId);
  const rascunho = data.rascunhos.find(x => x.id === atendimentoId) ?? null;
  const a = rascunho ?? data.atendimentos.find(x => x.id === atendimentoId) ?? null;
  const aberta = a ? etapaAberta(a) : null;
  const pausada = aberta ? etapaPausada(aberta) : false;
  const now = useNow(!!aberta && !pausada);
  const [verTodas, setVerTodas] = useState(false);
  if (!c || !a) return <Missing onBack={nav.pop} />;

  const emAndamento = !!rascunho;
  const lista = atividadesDaColeta(data, c);
  const sequencia = a.tipo === 'completo' && c.setor === SETORES[0]
    ? SEQUENCIA_PISTA.map(n => lista.find(x => x.nome === n)).filter((x): x is Atividade => !!x)
    : [];
  const outras = lista.filter(x => !sequencia.includes(x));
  const atalhos = outras.filter(x => x.classe === 'Espera' || x.classe === 'Retrabalho');
  const restantes = outras.filter(x => !atalhos.includes(x));
  const feitas = a.etapas.map(e => e.atividade_id);
  const ultimaSeq = Math.max(-1, ...a.etapas.map(e => sequencia.findIndex(x => x.id === e.atividade_id)));
  const proxima = sequencia[ultimaSeq + 1]?.id;
  const completos = data.atendimentos.filter(x => x.coleta_id === coletaId && x.tipo === 'completo').sort((x, y) => (x.inicio ?? '').localeCompare(y.inicio ?? ''));
  const n = emAndamento ? completos.length + 1 : completos.findIndex(x => x.id === a.id) + 1;

  const pick = (x: Atividade) => ops.iniciarEtapa(a.id, x.id);
  const descartar = () => confirmAction(emAndamento ? 'Descartar atendimento?' : 'Excluir registro?', 'As etapas cronometradas serão apagadas.', emAndamento ? 'Descartar' : 'Excluir',
    () => { if (emAndamento) ops.descartar(a.id); else ops.excluirFinalizado(a.id); nav.pop(); });
  const editar = (patch: Partial<Pick<Atendimento, 'funcionario' | 'obs' | 'volume' | 'deslocamentos' | 'veiculo'>>) => (emAndamento ? ops.editarRascunho(a.id, patch) : ops.editarFinalizado(a, patch));
  const numero = (v: string) => { const x = Number(v.replace(',', '.')); return v.trim() === '' || Number.isNaN(x) ? null : x; };

  return <>
    <Button title="Voltar à coleta" icon={ArrowLeftIcon} variant="ghost" size="sm" style={s.alignStart} onPress={nav.pop} />
    <PageHead title={a.tipo === 'completo' ? `Atendimento ${n}` : 'Atividade individual'} subtitle={a.inicio ? `Início ${horaBR(a.inicio)}` : 'Registro importado'}
      action={<StatusPill label={emAndamento ? (pausada ? 'Pausado' : 'Em andamento') : 'Finalizado'} tone={emAndamento ? (pausada ? 'warning' : 'accent') : 'success'} icon={emAndamento ? undefined : CheckIcon} />} />

    <Card>
      <Text style={t.label}>Tipo de veículo</Text>
      {(() => {
        const ativos = data.veiculos.filter(v => v.ativo !== false);
        const atual = data.veiculos.find(v => v.id === a.veiculo);
        const opcoes = atual && atual.ativo === false ? [...ativos, atual] : ativos;
        return <ChoiceChips value={atual?.nome ?? ''} options={opcoes.map(v => v.nome)} onChange={nome => { const v = opcoes.find(x => x.nome === nome); editar({ veiculo: v && v.id !== a.veiculo ? v.id : '' }); }} />;
      })()}
    </Card>

    <Card>
      <Text style={t.caption}>Tempo total{a.tipo === 'completo' ? ' (soma das etapas, sem pausas)' : ''}</Text>
      <Text style={s.clock}>{fmtCrono(duracaoAtendimento(a, now))}</Text>
    </Card>

    {aberta && (
      <Card style={s.running}>
        <View style={s.row}>
          <View style={[s.liveDot, pausada && { backgroundColor: colors.warning }]} />
          <Text style={[t.section, s.flex]} numberOfLines={2}>{nomeAtv(data, aberta.atividade_id)}</Text>
        </View>
        <Text style={t.caption}>Iniciada às {horaBR(aberta.inicio)}{aberta.pausas.length ? ` · pausas ${fmtDur(pausaSeg(aberta, now))}` : ''}</Text>
        <Text style={[s.clock, { color: pausada ? colors.warning : colors.accentText }]}>{fmtCrono(duracaoEtapa(aberta, now))}</Text>
        <View style={s.twoCol}>
          <Button title={pausada ? 'Retomar' : 'Pausar'} icon={pausada ? PlayIcon : TimerIcon} variant="secondary" style={s.flex} onPress={() => (pausada ? ops.retomar(a.id) : ops.pausar(a.id))} />
          <Button title={a.tipo === 'isolada' ? 'Finalizar' : 'Finalizar etapa'} icon={StopIcon} style={s.flex} onPress={() => ops.finalizarEtapa(a.id)} />
        </View>
      </Card>
    )}

    {emAndamento && (a.tipo === 'completo' || !a.etapas.length) && <>
      <SectionHeader title={aberta ? 'Trocar para outra atividade' : a.etapas.length ? 'Adicionar outra atividade' : 'Primeira atividade'} />
      {aberta ? <Text style={t.caption}>Tocar em uma atividade encerra a etapa atual e já inicia a próxima.</Text> : null}
      {sequencia.length ? <>
        <Text style={t.label}>Sequência do atendimento (as intermediárias são opcionais)</Text>
        <ActivityPicker atividades={sequencia} onPick={pick} destaque={aberta ? undefined : proxima} feitas={feitas} />
        {atalhos.length ? <><Text style={t.label}>Pausas e correções</Text><ActivityPicker atividades={atalhos} onPick={pick} feitas={feitas} /></> : null}
        {verTodas ? <><Text style={t.label}>Outras atividades do setor</Text><ActivityPicker atividades={restantes} onPick={pick} feitas={feitas} /></> : null}
        {restantes.length ? <Button title={verTodas ? 'Ocultar outras atividades' : `Mostrar outras atividades (${restantes.length})`} variant="ghost" size="sm" style={s.alignStart} onPress={() => setVerTodas(v => !v)} /> : null}
      </> : <ActivityPicker atividades={lista} onPick={pick} feitas={feitas} />}
    </>}

    {a.etapas.length > 0 && <>
      <SectionHeader title={`Etapas (${a.etapas.length})`} />
      <Card style={s.listCard}>
        {a.etapas.map((e, i) => (
          <View key={`${e.ordem}-${e.atividade_id}`} style={[s.row, { padding: 12 }, i > 0 && s.divided]}>
            <View style={s.stepNum}><Text style={s.stepNumText}>{e.ordem}</Text></View>
            <View style={s.flex}>
              <Text style={t.bodyStrong} numberOfLines={1}>{nomeAtv(data, e.atividade_id)}</Text>
              <Text style={[t.caption, s.mono]}>
                {e.inicio ? `${horaBR(e.inicio)} até ${e.fim ? horaBR(e.fim) : 'agora'}` : 'Sem horário (importado)'}
                {e.pausas.length ? ` · pausas ${fmtDur(pausaSeg(e, now))}` : ''}
              </Text>
            </View>
            <Text style={s.clockSmall}>{fmtCrono(duracaoEtapa(e, now))}</Text>
            {e.fim ? <IconButton icon={XIcon} tone="danger" label="Remover etapa"
              onPress={() => confirmAction('Remover etapa?', nomeAtv(data, e.atividade_id), 'Remover', () => (emAndamento ? ops.removerEtapaRascunho(a.id, e.ordem) : ops.removerEtapaFinalizado(a, e.ordem)))} /> : null}
          </View>
        ))}
      </Card>
    </>}

    <Card>
      <Field label="Funcionário observado" value={a.funcionario} placeholder="Opcional" onChangeText={v => editar({ funcionario: v })} />
      <View style={s.twoCol}>
        <Field estavel label="Volume (litros ou itens)" style={s.flex} keyboardType="decimal-pad" placeholder="Opcional" value={a.volume === null ? '' : String(a.volume).replace('.', ',')} onChangeText={v => editar({ volume: numero(v) })} />
        <Field estavel label="Deslocamentos" style={s.flex} keyboardType="numeric" placeholder="Qtd." value={a.deslocamentos === null ? '' : String(a.deslocamentos)} onChangeText={v => editar({ deslocamentos: numero(v) })} />
      </View>
      <Field label="Observações" multiline value={a.obs} placeholder="Ocorrências, dificuldades, espera do cliente" onChangeText={v => editar({ obs: v })} />
    </Card>

    {emAndamento ? (
      <View style={s.group}>
        {a.tipo === 'completo' && <Button title="Finalizar atendimento" icon={FlagCheckeredIcon} disabled={!a.etapas.length} onPress={() => ops.finalizar(a.id)} />}
        <Text style={t.caption}>O atendimento fica salvo neste aparelho enquanto está em andamento e é enviado ao servidor ao finalizar.</Text>
        <Button title="Descartar" icon={TrashIcon} variant="ghost" size="sm" style={s.alignStart} onPress={descartar} />
      </View>
    ) : (
      <Button title="Excluir registro" icon={TrashIcon} variant="danger" size="sm" onPress={descartar} />
    )}
  </>;
}

/* ---------- Peças auxiliares ---------- */
type ColetaForm = { data: string; setor: string; funcao: string; turno: string; demanda: string; auditor: string };
const novaColetaForm = (): ColetaForm => ({ data: hoje(), setor: SETORES[0], funcao: '', turno: TURNOS[0], demanda: DEMANDAS[1], auditor: '' });

function ColetaSheet({ title, form, setForm, onClose, onSave }: { title: string; form: ColetaForm; setForm: (f: ColetaForm) => void; onClose: () => void; onSave: () => void }) {
  const { s, t } = useLook();
  const set = (k: keyof ColetaForm) => (v: string) => setForm({ ...form, [k]: v });
  return (
    <Sheet title={title} onClose={onClose}
      footer={<View style={s.twoCol}><Button title="Cancelar" variant="secondary" style={s.flex} onPress={onClose} /><Button title="Salvar" icon={CheckIcon} style={s.flex} onPress={onSave} /></View>}>
      <Field label="Data" icon={CalendarBlankIcon} helper="Formato AAAA-MM-DD" value={form.data} onChangeText={set('data')} />
      <View style={s.group}><Text style={t.label}>Setor</Text><ChoiceChips value={form.setor} options={[...SETORES]} onChange={set('setor')} /></View>
      <Field label="Função observada" value={form.funcao} onChangeText={set('funcao')} placeholder="Frentista, caixa, gerente" />
      <View style={s.group}><Text style={t.label}>Turno</Text><ChoiceChips value={form.turno} options={[...TURNOS]} onChange={set('turno')} /></View>
      <View style={s.group}><Text style={t.label}>Condição de demanda</Text><ChoiceChips value={form.demanda} options={[...DEMANDAS]} onChange={set('demanda')} /></View>
      <Field label="Auditor" value={form.auditor} onChangeText={set('auditor')} placeholder="Nome de quem está cronometrando" />
    </Sheet>
  );
}

export function FilialPicker({ data, atual, onClose, onPick, incluirTodas = false }: { data: TmData; atual: string; onClose: () => void; onPick: (id: string) => void; incluirTodas?: boolean }) {
  const { s, t } = useLook();
  const [busca, setBusca] = useState('');
  const lista = data.filiais.filter(f => `${f.codigo} ${f.nome}`.toLowerCase().includes(busca.toLowerCase()));
  return (
    <Sheet title="Escolha a filial" onClose={onClose}>
      <Field icon={MagnifyingGlassIcon} value={busca} onChangeText={setBusca} placeholder="Código ou nome" />
      <Card style={s.listCard}>
        {incluirTodas && <ListRow icon={StorefrontIcon} tint="slate" title="Todas as filiais" right={!atual ? <StatusPill label="Atual" tone="accent" /> : undefined} onPress={() => onPick('')} />}
        {lista.map((f, i) => (
          <ListRow key={f.id} style={(i > 0 || incluirTodas) && s.divided} icon={StorefrontIcon} tint="sky" title={`${f.codigo} · ${f.nome}`} subtitle={[f.cidade, f.uf].filter(Boolean).join(', ')}
            right={f.id === atual ? <StatusPill label="Atual" tone="accent" /> : undefined} onPress={() => onPick(f.id)} />
        ))}
        {!lista.length && <Text style={[t.caption, { padding: 12 }]}>Nenhuma filial encontrada.</Text>}
      </Card>
    </Sheet>
  );
}

export function PageHead({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  const { s, t } = useLook();
  return (
    <View style={s.pageHead}>
      <View style={s.flex}>
        <Text style={t.title} numberOfLines={1}>{title}</Text>
        {subtitle ? <Text style={t.caption} numberOfLines={1}>{subtitle}</Text> : null}
      </View>
      {action}
    </View>
  );
}

function Missing({ onBack }: { onBack: () => void }) {
  return <EmptyState icon={QueueIcon} title="Registro não encontrado" text="Ele pode ter sido excluído em outro aparelho." action={{ label: 'Voltar', onPress: onBack }} />;
}

function rotuloDia(dia: string) {
  if (dia === hoje()) return `Hoje, ${dataBR(dia)}`;
  const d = new Date(`${dia}T12:00:00`);
  const semana = Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('pt-BR', { weekday: 'long' });
  return semana ? `${dataBR(dia)}, ${semana}` : dataBR(dia);
}
