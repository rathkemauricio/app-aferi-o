import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { useAuth } from '../../lib/auth';
import { shareText } from '../../lib/share';
import { CheckIcon, DownloadSimpleIcon, PencilSimpleIcon, PlusIcon, StorefrontIcon, TrashIcon, UploadSimpleIcon } from '../../ui/icons';
import { Button, Card, ChoiceChips, confirmAction, Field, IconButton, ListRow, notify, SectionHeader, Sheet, StatusPill } from '../../ui/kit';
import { FilialPicker, PageHead } from './ColetasTab';
import { aplicarImportacao, lerBackupEtm, type Previa, rotuloFilial } from './importEtm';
import { CICLOS_MINIMOS_PADRAO, CLASSES, ciclosMinimos, META_COLETAS_PADRAO, metaColetas, num, TIPOS_OPERACAO, type TipoOperacao, TODOS_SETORES, uid } from './model';
import { salvarAtividades, salvarParametros, salvarSetoresCd, salvarVeiculos, setoresDoTipo, type TmData } from './store';
import { useLook } from './ui';

const GERAL = 'Todos os setores';

export function CadastrosTab({ data }: { data: TmData }) {
  const { s, t } = useLook();
  const router = useRouter();
  const { isAdmin } = useAuth();
  /** Atividade nova (sem id) ou em edição (com id). */
  const [nova, setNova] = useState<{ id?: string; nome: string; setor: string; classe: string; ref: string } | null>(null);
  /** Catálogo do posto ou do centro de distribuição (CD). */
  const [tipoVer, setTipoVer] = useState<TipoOperacao>('posto');
  const setoresVer = setoresDoTipo(data, tipoVer);
  const [setorVer, setSetorVer] = useState<string>(setoresVer[0] ?? GERAL);
  const trocarTipo = (tp: TipoOperacao) => { setTipoVer(tp); setSetorVer(setoresDoTipo(data, tp)[0] ?? GERAL); };
  const [setoresAbertos, setSetoresAbertos] = useState(false);
  const [novoSetor, setNovoSetor] = useState('');
  const [renomear, setRenomear] = useState<{ de: string; para: string } | null>(null);
  const setorEmUso = (nome: string) => data.coletas.some(c => c.setor === nome);
  const atividadesDoSetor = (nome: string) => data.atividades.filter(a => a.setor === nome && a.ativo !== false).length;
  const nomeExiste = (nome: string) => [...data.setoresCd, ...setoresDoTipo(data, 'posto')].some(x => x.toLowerCase() === nome.toLowerCase());
  const addSetor = () => {
    const nome = novoSetor.trim();
    if (!nome) return;
    if (nomeExiste(nome)) { notify('Esse setor já existe'); return; }
    salvarSetoresCd([...data.setoresCd, nome]);
    setNovoSetor('');
  };
  const removerSetor = (nome: string) => {
    if (setorEmUso(nome)) { notify('Setor em uso', `${nome} já tem coletas e continua no histórico. Para não usar mais, desative as atividades dele.`); return; }
    const n = atividadesDoSetor(nome);
    confirmAction('Apagar o setor?', n ? `${nome} tem ${n} atividade(s); elas também saem do catálogo.` : nome, 'Apagar', () => {
      salvarSetoresCd(data.setoresCd.filter(x => x !== nome));
      if (n) salvarAtividades(data.atividades.map(a => (a.setor === nome ? { ...a, ativo: false } : a)));
      if (setorVer === nome) setSetorVer(GERAL);
    });
  };
  const salvarRenomear = () => {
    if (!renomear) return;
    const para = renomear.para.trim();
    if (!para || para === renomear.de) { setRenomear(null); return; }
    if (setorEmUso(renomear.de)) { notify('Setor em uso', `${renomear.de} já tem coletas com esse nome. Crie um setor novo em vez de renomear.`); return; }
    if (nomeExiste(para)) { notify('Esse setor já existe'); return; }
    salvarSetoresCd(data.setoresCd.map(x => (x === renomear.de ? para : x)));
    salvarAtividades(data.atividades.map(a => (a.setor === renomear.de ? { ...a, setor: para } : a)));
    if (setorVer === renomear.de) setSetorVer(para);
    setRenomear(null);
  };
  const [novoVeiculo, setNovoVeiculo] = useState('');
  const veiculoEmUso = (id: string) => data.atendimentos.some(a => a.veiculo === id) || data.rascunhos.some(a => a.veiculo === id);
  const addVeiculo = () => {
    const nome = novoVeiculo.trim();
    if (!nome) return;
    if (data.veiculos.some(v => v.nome.toLowerCase() === nome.toLowerCase() && v.ativo !== false)) { notify('Esse tipo de veículo já existe'); return; }
    salvarVeiculos([...data.veiculos, { id: uid('vei'), nome, ativo: true }]);
    setNovoVeiculo('');
  };
  // Tipo já usado é desativado (mantém o nome no histórico); sem uso, é removido.
  const removerVeiculo = (id: string) => salvarVeiculos(veiculoEmUso(id) ? data.veiculos.map(v => (v.id === id ? { ...v, ativo: false } : v)) : data.veiculos.filter(v => v.id !== id));
  const reativarVeiculo = (id: string) => salvarVeiculos(data.veiculos.map(v => (v.id === id ? { ...v, ativo: true } : v)));
  const [colar, setColar] = useState<string | null>(null);
  const [previa, setPrevia] = useState<Previa | null>(null);
  const [mapear, setMapear] = useState<string | null>(null);

  const emUso = (id: string) => data.atendimentos.some(a => a.etapas.some(e => e.atividade_id === id)) || data.rascunhos.some(a => a.etapas.some(e => e.atividade_id === id));
  const atividades = data.atividades.filter(a => a.ativo !== false && (setorVer === GERAL ? a.setor === TODOS_SETORES : a.setor === setorVer));

  const salvarAtv = () => {
    if (!nova?.nome.trim()) { notify('Informe o nome da atividade'); return; }
    const ref = Number(nova.ref.replace(',', '.'));
    const campos = { nome: nova.nome.trim(), setor: nova.setor === GERAL ? TODOS_SETORES : nova.setor, classe: nova.classe, ref: nova.ref.trim() && !Number.isNaN(ref) ? ref : null };
    salvarAtividades(nova.id ? data.atividades.map(a => (a.id === nova.id ? { ...a, ...campos } : a)) : [...data.atividades, { id: uid('atv'), ...campos, ativo: true }]);
    setNova(null);
  };
  // Atividade já usada é apenas desativada, para o histórico continuar com o nome.
  const remover = (id: string) => salvarAtividades(emUso(id) ? data.atividades.map(a => (a.id === id ? { ...a, ativo: false } : a)) : data.atividades.filter(a => a.id !== id));

  return <>
    <PageHead title="Cadastros" subtitle="Catálogo de atividades, parâmetros e importação" />

    <Card style={s.listCard}>
      <ListRow icon={StorefrontIcon} tint="sky" title="Filiais" subtitle="Cadastro único, compartilhado com os outros módulos" onPress={() => router.push('/filiais')} />
    </Card>

    <SectionHeader title={`Atividades (${data.atividades.filter(a => a.ativo !== false).length})`} action={isAdmin ? 'Nova atividade' : undefined} onPress={() => setNova({ nome: '', setor: setorVer, classe: CLASSES[0], ref: '' })} />
    <ChoiceChips value={TIPOS_OPERACAO[tipoVer].nome} options={[TIPOS_OPERACAO.posto.nome, TIPOS_OPERACAO.cd.nome]} onChange={v => trocarTipo(v === TIPOS_OPERACAO.cd.nome ? 'cd' : 'posto')} />
    <ChoiceChips value={setorVer} options={[...setoresVer, GERAL]} onChange={setSetorVer} />
    {tipoVer === 'cd' ? <Text style={t.caption}>As unidades classificadas como "Centro de distribuição" no cadastro (campo bandeira) usam estes setores e atividades.</Text> : null}
    {tipoVer === 'cd' && isAdmin ? <Button title="Setores do CD" icon={PencilSimpleIcon} variant="secondary" size="sm" style={s.alignStart} onPress={() => setSetoresAbertos(true)} /> : null}
    <Card style={s.listCard}>
      {atividades.length ? atividades.map((a, i) => (
        <View key={a.id} style={[s.row, { padding: 12 }, i > 0 && s.divided]}>
          <View style={s.flex}>
            <Text style={t.bodyStrong} numberOfLines={1}>{a.nome}</Text>
            <Text style={t.caption}>{a.ref ? `Referência ${num(a.ref)} min` : 'Sem referência'}</Text>
          </View>
          <StatusPill label={a.classe} />
          {isAdmin ? <IconButton icon={PencilSimpleIcon} label={`Editar ${a.nome}`} onPress={() => setNova({ id: a.id, nome: a.nome, setor: a.setor === TODOS_SETORES ? GERAL : a.setor, classe: a.classe, ref: a.ref ? String(a.ref).replace('.', ',') : '' })} /> : null}
          {isAdmin ? <IconButton icon={TrashIcon} tone="danger" label={`Excluir ${a.nome}`} onPress={() => confirmAction('Remover atividade?', emUso(a.id) ? `${a.nome} já tem registros; ela sai da lista de escolha, mas o histórico é mantido.` : a.nome, 'Remover', () => remover(a.id))} /> : null}
        </View>
      )) : <Text style={[t.caption, { padding: 12 }]}>Nenhuma atividade neste grupo.</Text>}
    </Card>
    {!isAdmin && <Text style={t.caption}>Somente o administrador altera o catálogo e os parâmetros.</Text>}

    <SectionHeader title={`Tipos de veículo (${data.veiculos.filter(v => v.ativo !== false).length})`} />
    <Card style={s.listCard}>
      {data.veiculos.map((v, i) => (
        <View key={v.id} style={[s.row, { padding: 12 }, i > 0 && s.divided]}>
          <Text style={[t.bodyStrong, s.flex, v.ativo === false && { opacity: 0.5 }]} numberOfLines={1}>{v.nome}</Text>
          {v.ativo === false ? <StatusPill label="Desativado" /> : null}
          {isAdmin ? (v.ativo === false
            ? <Button title="Ativar" variant="ghost" size="sm" onPress={() => reativarVeiculo(v.id)} />
            : <IconButton icon={TrashIcon} tone="danger" label={`Remover ${v.nome}`} onPress={() => confirmAction('Remover tipo de veículo?', veiculoEmUso(v.id) ? `${v.nome} já foi usado; ele sai da lista de escolha, mas o histórico é mantido.` : v.nome, 'Remover', () => removerVeiculo(v.id))} />) : null}
        </View>
      ))}
      {isAdmin ? (
        <View style={[s.row, { padding: 8 }, s.divided]}>
          <Field style={s.flex} value={novoVeiculo} onChangeText={setNovoVeiculo} placeholder="Novo tipo (ex.: Guincho)" onSubmitEditing={addVeiculo} />
          <Button title="Adicionar" icon={PlusIcon} size="sm" disabled={!novoVeiculo.trim()} onPress={addVeiculo} />
        </View>
      ) : null}
    </Card>

    <SectionHeader title="Parâmetros do tempo padrão" />
    <Card>
      <View style={s.twoCol}>
        <Field label="Fator de ritmo" style={s.flex} keyboardType="decimal-pad" editable={isAdmin} defaultValue={String(data.parametros.ritmo).replace('.', ',')}
          onEndEditing={e => { const v = Number(e.nativeEvent.text.replace(',', '.')); salvarParametros({ ...data.parametros, ritmo: v > 0 ? v : 1 }); }} />
        <Field label="Tolerância (%)" style={s.flex} keyboardType="decimal-pad" editable={isAdmin} defaultValue={String(data.parametros.tol).replace('.', ',')}
          onEndEditing={e => { const v = Number(e.nativeEvent.text.replace(',', '.')); salvarParametros({ ...data.parametros, tol: v >= 0 ? v : 0 }); }} />
      </View>
      <Text style={t.label}>Meta padrão de coletas (para finalizar a filial)</Text>
      <View style={s.twoCol}>
        <Field label="Coletas por filial" style={s.flex} keyboardType="numeric" editable={isAdmin} defaultValue={String(metaColetas(data.parametros))}
          onEndEditing={e => { const v = Math.round(Number(e.nativeEvent.text.replace(',', '.'))); salvarParametros({ ...data.parametros, metaColetas: v > 0 ? v : META_COLETAS_PADRAO }); }} />
        <Field label="Ciclos mínimos por atividade" style={s.flex} keyboardType="numeric" editable={isAdmin} defaultValue={String(ciclosMinimos(data.parametros))}
          onEndEditing={e => { const v = Math.round(Number(e.nativeEvent.text.replace(',', '.'))); salvarParametros({ ...data.parametros, ciclosMinimos: v > 0 ? v : CICLOS_MINIMOS_PADRAO }); }} />
      </View>
      <Text style={t.caption}>Exige justificativa técnica e avaliador capacitado (seção 7 da metodologia).</Text>
    </Card>

    <SectionHeader title="Dados" />
    <Card style={s.listCard}>
      <ListRow icon={DownloadSimpleIcon} tint="slate" title="Importar do HTML antigo" subtitle="Backup JSON exportado pelo ETM Tempos e Movimentos (Cadastros → Exportar JSON)" onPress={() => setColar('')} />
      <ListRow style={s.divided} icon={UploadSimpleIcon} tint="slate" title="Exportar dados do módulo" subtitle="Coletas, atendimentos, plano e catálogo em JSON"
        onPress={() => void shareText('tempos_e_movimentos_backup.json', JSON.stringify({ coletas: data.coletas, atendimentos: data.atendimentos, plano: data.plano, atividades: data.atividades, parametros: data.parametros }, null, 2), 'application/json')} />
    </Card>

    {nova && (
      <Sheet title={nova.id ? 'Editar atividade' : 'Nova atividade'} onClose={() => setNova(null)}
        footer={<View style={s.twoCol}><Button title="Cancelar" variant="secondary" style={s.flex} onPress={() => setNova(null)} /><Button title="Salvar" icon={CheckIcon} style={s.flex} onPress={salvarAtv} /></View>}>
        <Field label="Nome" value={nova.nome} onChangeText={v => setNova({ ...nova, nome: v })} placeholder={tipoVer === 'cd' ? 'Separação de pedido' : 'Verificação de calibragem'} />
        <View style={s.group}><Text style={t.label}>Setor</Text><ChoiceChips value={nova.setor} options={[...(setoresVer.includes(nova.setor) || nova.setor === GERAL ? [] : [nova.setor]), ...setoresVer, GERAL]} onChange={v => setNova({ ...nova, setor: v })} /></View>
        <View style={s.group}><Text style={t.label}>Classificação</Text><ChoiceChips value={nova.classe} options={[...CLASSES]} onChange={v => setNova({ ...nova, classe: v })} /></View>
        <Field label="Referência atual (min)" helper="Opcional. Comparada com a média observada no painel." keyboardType="decimal-pad" value={nova.ref} onChangeText={v => setNova({ ...nova, ref: v })} />
      </Sheet>
    )}

    {setoresAbertos && (
      <Sheet title="Setores do CD" onClose={() => { setSetoresAbertos(false); setRenomear(null); }}>
        <Text style={t.caption}>Cada coleta do CD é feita num setor; cada atividade do catálogo fica num setor (ou em todos).</Text>
        {data.setoresCd.map(nome => (
          <View key={nome} style={[s.row, { paddingVertical: 6 }]}>
            {renomear?.de === nome ? <>
              <Field style={s.flex} value={renomear.para} onChangeText={v => setRenomear({ de: nome, para: v })} />
              <IconButton icon={CheckIcon} label="Salvar nome" onPress={salvarRenomear} />
            </> : <>
              <View style={s.flex}>
                <Text style={t.bodyStrong}>{nome}</Text>
                <Text style={t.caption}>{atividadesDoSetor(nome)} atividade(s){setorEmUso(nome) ? ' · com coletas' : ''}</Text>
              </View>
              <IconButton icon={PencilSimpleIcon} label={`Renomear ${nome}`} onPress={() => setRenomear({ de: nome, para: nome })} />
              <IconButton icon={TrashIcon} tone="danger" label={`Apagar ${nome}`} onPress={() => removerSetor(nome)} />
            </>}
          </View>
        ))}
        <View style={s.row}>
          <Field style={s.flex} label="Novo setor" value={novoSetor} onChangeText={setNovoSetor} placeholder="Ex.: Picking de cigarros" />
          <Button title="Adicionar" icon={PlusIcon} size="sm" disabled={!novoSetor.trim()} onPress={addSetor} />
        </View>
      </Sheet>
    )}

    {colar !== null && (
      <Sheet title="Importar do HTML antigo" onClose={() => { setColar(null); setPrevia(null); }}
        footer={!previa
          ? <Button title="Ler arquivo" disabled={!colar.trim()} onPress={() => { try { setPrevia(lerBackupEtm(colar, data)); } catch { notify('Arquivo inválido', 'Cole o conteúdo do etm_backup.json exportado pelo HTML.'); } }} />
          : <Button title="Importar" icon={CheckIcon} onPress={() => {
              const r = aplicarImportacao(previa, data, isAdmin);
              setColar(null); setPrevia(null);
              notify('Importação concluída', `${r.atendimentos} registro(s) em ${r.coletas} coleta(s), ${r.planos} item(ns) do plano e ${r.dims} dimensionamento(s).${r.ignorados ? ` ${r.ignorados} registro(s) ignorado(s) por falta de filial ou atividade correspondente.` : ''}`);
            }} />}>
        {!previa ? <>
          <Text style={t.caption}>No HTML antigo, abra Cadastros → Exportar JSON e cole aqui o conteúdo do arquivo etm_backup.json. Importar o mesmo arquivo de novo não duplica registros.</Text>
          <Field multiline value={colar} onChangeText={setColar} placeholder="Cole o JSON aqui" style={{ minHeight: 160 }} />
        </> : <>
          <Text style={t.caption}>{previa.registros} registro(s) para importar{previa.exemplos ? ` (${previa.exemplos} de exemplo serão ignorados)` : ''}. Confira a filial correspondente a cada filial antiga:</Text>
          <Card style={s.listCard}>
            {previa.antigo.filiais.map((fa, i) => (
              <ListRow key={fa.id} style={i > 0 && s.divided} icon={StorefrontIcon} tint={previa.mapaFiliais[fa.id] ? 'sky' : 'amber'} title={fa.nome}
                subtitle={`→ ${rotuloFilial(data.filiais.find(f => f.id === previa.mapaFiliais[fa.id]))}`} onPress={() => setMapear(fa.id)} />
            ))}
          </Card>
          {previa.atividadesNovas.length ? <Text style={t.caption}>{previa.atividadesNovas.length} atividade(s) que não existem no catálogo {isAdmin ? 'serão adicionadas' : 'serão ignoradas (só o administrador altera o catálogo)'}: {previa.atividadesNovas.map(a => a.nome).join(', ')}.</Text> : null}
        </>}
      </Sheet>
    )}
    {mapear && previa && (
      <FilialPicker data={data} atual={previa.mapaFiliais[mapear]} onClose={() => setMapear(null)}
        onPick={id => { setPrevia({ ...previa, mapaFiliais: { ...previa.mapaFiliais, [mapear]: id } }); setMapear(null); }} />
    )}
  </>;
}
