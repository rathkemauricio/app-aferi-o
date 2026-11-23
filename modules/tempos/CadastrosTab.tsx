import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { useAuth } from '../../lib/auth';
import { shareText } from '../../lib/share';
import { CheckIcon, DownloadSimpleIcon, ListBulletsIcon, PlusIcon, StorefrontIcon, TrashIcon, UploadSimpleIcon } from '../../ui/icons';
import { Button, Card, confirmAction, Field, IconButton, ListRow, notify, SectionHeader, Sheet, StatusPill } from '../../ui/kit';
import { FilialPicker, PageHead } from './ColetasTab';
import { aplicarImportacao, lerBackupEtm, type Previa, rotuloFilial } from './importEtm';
import { CICLOS_MINIMOS_PADRAO, ciclosMinimos, META_COLETAS_PADRAO, metaColetas, uid } from './model';
import { salvarParametros, salvarVeiculos, type TmData } from './store';
import { useLook } from './ui';


export function CadastrosTab({ data, onSetores }: { data: TmData; onSetores: () => void }) {
  const { s, t } = useLook();
  const router = useRouter();
  const { isAdmin } = useAuth();
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

  return <>
    <PageHead title="Cadastros" subtitle="Veículos, parâmetros e importação" />

    <Card style={s.listCard}>
      <ListRow icon={StorefrontIcon} tint="sky" title="Filiais" subtitle="Cadastro único, compartilhado com os outros módulos" onPress={() => router.push('/filiais')} />
    </Card>

    <Card style={s.listCard}>
      <ListRow icon={ListBulletsIcon} tint="indigo" title="Setores e atividades" subtitle="Cadastrar, editar e excluir: fica em Gestão → Dimensionamento (posto e centro de distribuição)" onPress={onSetores} />
    </Card>
    {!isAdmin && <Text style={t.caption}>Somente o administrador altera os cadastros e os parâmetros.</Text>}

    <SectionHeader title={`Tipos de veículo (${data.veiculos.filter(v => v.ativo !== false).length})`} />
    <Text style={t.caption}>Só para postos (atendimento na pista). O centro de distribuição não usa tipo de veículo.</Text>
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
