import { useState } from 'react';
import { Text, View } from 'react-native';
import { useAuth } from '../../lib/auth';
import { ArrowDownIcon, ArrowsDownUpIcon, ArrowUpIcon, PencilSimpleIcon, PlusIcon, TrashIcon } from '../../ui/icons';
import { Button, Card, ChoiceChips, confirmAction, Field, IconButton, notify, SectionHeader, Sheet, StatusPill } from '../../ui/kit';
import { type Atividade, CLASSES, num, TIPOS_OPERACAO, type TipoOperacao, TODOS_SETORES, uid } from './model';
import { coletasCol, salvarAtividades, salvarSetores, setoresDoTipo, tipoDe, type TmData } from './store';
import { useLook } from './ui';

/**
 * Gestão → Dimensionamento → Setores e atividades: um só lugar para cadastrar, editar e excluir os setores e as
 * atividades de cada tipo de operação (posto ou centro de distribuição). Pedido do usuário (23/11/2026).
 */
const TODOS = 'Todos os setores';
type EdicaoAtv = { id?: string; nome: string; setor: string; classe: string; ref: string; qualquerHora?: boolean };
const SIM_QH = 'A qualquer hora do dia', NAO_QH = 'Em momento definido';
type EdicaoSetor = { de?: string; nome: string };

export function SetoresAtividades({ data, onSequencia }: { data: TmData; onSequencia: () => void }) {
  const { s, t, colors } = useLook();
  const { isAdmin } = useAuth();
  const [tipo, setTipo] = useState<TipoOperacao>(() => (data.filiais.some(f => tipoDe(data, f.id) === 'cd') ? 'cd' : 'posto'));
  const [atv, setAtv] = useState<EdicaoAtv | null>(null);
  const [setor, setSetor] = useState<EdicaoSetor | null>(null);
  const setores = setoresDoTipo(data, tipo);
  const outros = setoresDoTipo(data, tipo === 'cd' ? 'posto' : 'cd');
  const unidades = data.filiais.filter(f => tipoDe(data, f.id) === tipo);
  const nUnidades = (tp: TipoOperacao) => data.filiais.filter(f => tipoDe(data, f.id) === tp).length;

  const ativas = (se: string) => data.atividades.filter(a => a.ativo !== false && (se === TODOS ? a.setor === TODOS_SETORES : a.setor === se));
  const atvEmUso = (id: string) => data.atendimentos.some(a => a.etapas.some(e => e.atividade_id === id)) || data.rascunhos.some(a => a.etapas.some(e => e.atividade_id === id));
  const coletasDoSetor = (se: string) => data.coletas.filter(c => c.setor === se && tipoDe(data, c.filial_id) === tipo);
  const nomeRepetido = (nome: string, exceto?: string) => [...setores, ...outros].some(x => x !== exceto && x.toLowerCase() === nome.toLowerCase());
  const so = (fn: () => void) => () => { if (!isAdmin) { notify('Somente o administrador', 'Peça ao administrador da rede para alterar setores e atividades.'); return; } fn(); };

  /* ---------- Setores ---------- */
  const salvarSetor = () => {
    if (!setor) return;
    const nome = setor.nome.trim();
    if (!nome) { notify('Informe o nome do setor'); return; }
    if (nomeRepetido(nome, setor.de)) { notify('Esse setor já existe', 'Use outro nome (os setores do posto e do CD não podem ter o mesmo nome).'); return; }
    if (!setor.de) { salvarSetores(tipo, [...setores, nome]); setSetor(null); return; }
    if (nome === setor.de) { setSetor(null); return; }
    const de = setor.de;
    // Renomear leva junto as atividades e as coletas já feitas nesse setor (o histórico continua agrupado).
    salvarSetores(tipo, setores.map(x => (x === de ? nome : x)));
    salvarAtividades(data.atividades.map(a => (a.setor === de ? { ...a, setor: nome } : a)));
    coletasDoSetor(de).forEach(c => coletasCol.put({ ...c, setor: nome }));
    setSetor(null);
  };
  const excluirSetor = (nome: string) => {
    const cs = coletasDoSetor(nome).length;
    if (cs) { notify('Setor com coletas', `${nome} tem ${cs} coleta(s). Para não perder o histórico, ele não pode ser excluído; renomeie se precisar.`); return; }
    if (setores.length <= 1) { notify('Mantenha ao menos um setor'); return; }
    const n = ativas(nome).length;
    confirmAction('Excluir o setor?', n ? `${nome} e as ${n} atividade(s) dele saem do catálogo.` : `${nome} sai do catálogo.`, 'Excluir', () => {
      salvarSetores(tipo, setores.filter(x => x !== nome));
      if (n) salvarAtividades(data.atividades.flatMap(a => (a.setor !== nome ? [a] : atvEmUso(a.id) ? [{ ...a, ativo: false }] : [])));
    });
  };

  /* ---------- Ordem (a mesma do cronômetro e do relatório "ordem do cadastro") ---------- */
  const moverSetor = (se: string, passo: -1 | 1) => {
    const i = setores.indexOf(se), j = i + passo;
    if (i < 0 || j < 0 || j >= setores.length) return;
    const lista = [...setores];
    [lista[i], lista[j]] = [lista[j], lista[i]];
    salvarSetores(tipo, lista);
  };

  /* ---------- Atividades ---------- */
  const salvarAtv = () => {
    if (!atv) return;
    const nome = atv.nome.trim();
    if (!nome) { notify('Informe o nome da atividade'); return; }
    const ref = Number(atv.ref.replace(',', '.'));
    const campos: Omit<Atividade, 'id' | 'ativo'> = { nome, setor: atv.setor === TODOS ? TODOS_SETORES : atv.setor, classe: atv.classe, ref: atv.ref.trim() && !Number.isNaN(ref) && ref > 0 ? ref : null, qualquerHora: !!atv.qualquerHora };
    salvarAtividades(atv.id ? data.atividades.map(a => (a.id === atv.id ? { ...a, ...campos } : a)) : [...data.atividades, { id: uid('atv'), ...campos, ativo: true }]);
    setAtv(null);
  };
  // Atividade já cronometrada só é desativada (o histórico continua com o nome); sem uso, sai de vez.
  const excluirAtv = (a: Atividade) => confirmAction('Excluir a atividade?', atvEmUso(a.id) ? `${a.nome} já tem registros: sai da lista de escolha, mas o histórico é mantido.` : a.nome, 'Excluir',
    () => salvarAtividades(atvEmUso(a.id) ? data.atividades.map(x => (x.id === a.id ? { ...x, ativo: false } : x)) : data.atividades.filter(x => x.id !== a.id)));

  const linhaAtv = (a: Atividade, i: number, lista: Atividade[]) => (
    <View key={a.id} style={[s.row, { paddingVertical: 10, paddingHorizontal: 12 }, i > 0 && s.divided]}>
      <Text style={[t.caption, { width: 22, textAlign: 'right' }]}>{i + 1}.</Text>
      <View style={s.flex}>
        <Text style={t.bodyStrong} numberOfLines={2}>{a.nome}</Text>
        <Text style={t.caption}>{a.classe} · {a.ref ? `referência ${num(a.ref)} min` : 'tempo pela cronometragem'}{a.qualquerHora ? ' · a qualquer hora do dia' : ''}</Text>
      </View>
      <IconButton icon={PencilSimpleIcon} label={`Editar ${a.nome}`} onPress={so(() => setAtv({ id: a.id, nome: a.nome, setor: a.setor === TODOS_SETORES ? TODOS : a.setor, classe: a.classe, ref: a.ref ? String(a.ref).replace('.', ',') : '', qualquerHora: !!a.qualquerHora }))} />
      <IconButton icon={TrashIcon} tone="danger" label={`Excluir ${a.nome}`} onPress={so(() => excluirAtv(a))} />
    </View>
  );

  return <>
    <Card>
      <Text style={t.section}>Setores e atividades</Text>
      <ChoiceChips value={TIPOS_OPERACAO[tipo].nome} options={[TIPOS_OPERACAO.posto.nome, TIPOS_OPERACAO.cd.nome]} onChange={v => setTipo(v === TIPOS_OPERACAO.cd.nome ? 'cd' : 'posto')} />
      <Text style={t.caption}>
        {unidades.length
          ? `Usado por ${unidades.length === 1 ? 'a unidade' : `${unidades.length} unidades`}: ${unidades.slice(0, 6).map(f => `${f.codigo} · ${f.nome}`).join(', ')}${unidades.length > 6 ? '…' : ''}.`
          : tipo === 'cd' ? 'Nenhuma unidade classificada como centro de distribuição. Classifique no cadastro da filial (campo bandeira).' : 'Nenhuma unidade de posto.'}
        {' '}O tipo vem do cadastro da unidade ({nUnidades('posto')} posto(s), {nUnidades('cd')} CD).
      </Text>
      <View style={[s.row, { flexWrap: 'wrap' }]}>
        <Button title="Lista de atividades (ordem e impressão)" icon={ArrowsDownUpIcon} variant="secondary" size="sm" onPress={onSequencia} />
        {isAdmin ? <Button title="Novo setor" icon={PlusIcon} size="sm" onPress={() => setSetor({ nome: '' })} /> : null}
      </View>
    </Card>

    {setores.map(se => {
      const lista = ativas(se);
      const cs = coletasDoSetor(se).length;
      return (
        <Card key={se} style={{ gap: 0, paddingHorizontal: 0, paddingVertical: 0, overflow: 'hidden' }}>
          <View style={[s.row, { padding: 12, backgroundColor: colors.campo }]}>
            <View style={s.flex}>
              <Text style={t.section}>{se}</Text>
              <Text style={t.caption}>{lista.length} atividade(s){cs ? ` · ${cs} coleta(s)` : ''}</Text>
            </View>
            {isAdmin ? <IconButton icon={ArrowUpIcon} label={`Subir o setor ${se}`} onPress={() => moverSetor(se, -1)} /> : null}
            {isAdmin ? <IconButton icon={ArrowDownIcon} label={`Descer o setor ${se}`} onPress={() => moverSetor(se, 1)} /> : null}
            {isAdmin ? <IconButton icon={PencilSimpleIcon} label={`Renomear ${se}`} onPress={() => setSetor({ de: se, nome: se })} /> : null}
            {isAdmin ? <IconButton icon={TrashIcon} tone="danger" label={`Excluir ${se}`} onPress={() => excluirSetor(se)} /> : null}
          </View>
          {lista.length ? lista.map((a, i) => linhaAtv(a, i, lista)) : <Text style={[t.caption, { padding: 12 }]}>Nenhuma atividade neste setor.</Text>}
          {isAdmin ? (
            <View style={[{ padding: 8 }, s.divided]}>
              <Button title="Nova atividade neste setor" icon={PlusIcon} variant="ghost" size="sm" style={s.alignStart} onPress={() => setAtv({ nome: '', setor: se, classe: CLASSES[0], ref: '' })} />
            </View>
          ) : null}
        </Card>
      );
    })}

    <SectionHeader title={`Valem para todos os setores (${ativas(TODOS).length})`} />
    <Card style={{ gap: 0, paddingHorizontal: 0, paddingVertical: 0, overflow: 'hidden' }}>
      {ativas(TODOS).length ? ativas(TODOS).map((a, i, l) => linhaAtv(a, i, l)) : <Text style={[t.caption, { padding: 12 }]}>Nenhuma.</Text>}
      <Text style={[t.caption, { padding: 12 }, s.divided]}>Ex.: Espera e Retrabalho, que entram no cálculo do tempo ocioso. Valem para posto e CD.</Text>
    </Card>
    {!isAdmin ? <Text style={t.caption}>Somente o administrador cadastra, edita e exclui setores e atividades.</Text> : null}

    {setor && (
      <Sheet title={setor.de ? 'Renomear setor' : `Novo setor (${TIPOS_OPERACAO[tipo].nome.toLowerCase()})`} onClose={() => setSetor(null)}
        footer={<View style={s.twoCol}><Button title="Cancelar" variant="secondary" style={s.flex} onPress={() => setSetor(null)} /><Button title="Salvar" icon={PencilSimpleIcon} style={s.flex} onPress={salvarSetor} /></View>}>
        <Field label="Nome do setor" value={setor.nome} onChangeText={v => setSetor({ ...setor, nome: v })} placeholder={tipo === 'cd' ? 'Ex.: Picking de cigarros' : 'Ex.: Troca de óleo'} />
        {setor.de && coletasDoSetor(setor.de).length ? <Text style={t.caption}>As {coletasDoSetor(setor.de).length} coleta(s) e as atividades deste setor passam para o nome novo.</Text> : null}
      </Sheet>
    )}

    {atv && (
      <Sheet title={atv.id ? 'Editar atividade' : 'Nova atividade'} onClose={() => setAtv(null)}
        footer={<View style={s.twoCol}><Button title="Cancelar" variant="secondary" style={s.flex} onPress={() => setAtv(null)} /><Button title="Salvar" icon={PencilSimpleIcon} style={s.flex} onPress={salvarAtv} /></View>}>
        <Field label="Nome" value={atv.nome} onChangeText={v => setAtv({ ...atv, nome: v })} placeholder={tipo === 'cd' ? 'Ex.: Separação de pedido' : 'Ex.: Verificação de calibragem'} />
        <View style={s.group}><Text style={t.label}>Setor</Text>
          <ChoiceChips value={atv.setor} options={[...(setores.includes(atv.setor) || atv.setor === TODOS ? [] : [atv.setor]), ...setores, TODOS]} onChange={v => setAtv({ ...atv, setor: v })} /></View>
        <View style={s.group}><Text style={t.label}>Classificação</Text><ChoiceChips value={atv.classe} options={[...CLASSES]} onChange={v => setAtv({ ...atv, classe: v })} /></View>
        <View style={s.group}><Text style={t.label}>Quando acontece</Text>
          <ChoiceChips value={atv.qualquerHora ? SIM_QH : NAO_QH} options={[NAO_QH, SIM_QH]} onChange={v => setAtv({ ...atv, qualquerHora: v === SIM_QH })} />
          <Text style={t.caption}>"A qualquer hora do dia": pode acontecer em qualquer momento (ex.: entrega, descarga de caminhão).</Text></View>
        <Field label="Tempo de referência (min)" helper="Opcional. Sem referência, o tempo vem da cronometragem." keyboardType="decimal-pad" value={atv.ref} onChangeText={v => setAtv({ ...atv, ref: v })} />
        {atv.id ? <StatusPill label={atvEmUso(atv.id) ? 'Já tem cronometragens' : 'Ainda sem cronometragem'} tone={atvEmUso(atv.id) ? 'accent' : 'neutral'} /> : null}
      </Sheet>
    )}
  </>;
}
