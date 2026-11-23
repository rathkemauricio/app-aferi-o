import { useState } from 'react';
import { Platform, Pressable, Text, TextInput, View } from 'react-native';
import { useAuth, useUsuarioLogado } from '../../lib/auth';
import { useIdentidade } from '../../lib/identidade';
import { esc, imprimirHtml } from '../../lib/util';
import { CheckIcon, ClockIcon, PencilSimpleIcon, PrinterIcon, ResetIcon, XIcon } from '../../ui/icons';
import { Button, Card, ChoiceChips, confirmAction, IconButton, notify } from '../../ui/kit';
import { PageHead } from './ColetasTab';
import { ListaArrastavel } from './ListaArrastavel';
import { type Atividade, TIPOS_OPERACAO, type TipoOperacao } from './model';
import { salvarAtividades, salvarSequencia, sequenciaDe, tipoDe, type TmData } from './store';
import { useLook } from './ui';

/**
 * Gestão → Sequência das atividades: todas as atividades numa lista só (sem separar por setor), na ordem
 * cronológica dos fatos, montada arrastando os blocos. Só informativa: a coleta continua livre (qualquer ordem)
 * e o cronômetro não muda. Uma sequência para posto e outra para centro de distribuição.
 */
const chave = (a: Atividade) => a.id;

function sequenciaHtml(lista: Atividade[], tipoNome: string, marca: { nome: string; logo: string | null }, quem: string) {
  const agora = new Date();
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Sequência das atividades · ${esc(tipoNome)}</title>
<style>
@page{size:A4;margin:14mm}body{font:12.5px/1.45 Arial,Helvetica,sans-serif;color:#182536;margin:0}
.head{border-bottom:4px solid #f4c542;padding-bottom:12px;display:flex;justify-content:space-between;align-items:flex-end;gap:12px}
.marca{font-weight:900;color:#174b78;letter-spacing:1px;font-size:12px}h1{margin:4px 0;font-size:22px}.muted{color:#66788a}
ol{margin:18px 0 0;padding:0;list-style:none;counter-reset:n}li{display:flex;gap:12px;align-items:center;padding:8px 10px;border-bottom:1px solid #edf0f4;break-inside:avoid}
.qh{margin-left:auto;font-size:11px;font-weight:700;color:#9a5b00;background:#fdf1d8;border-radius:999px;padding:2px 8px;white-space:nowrap}
li b{min-width:28px;text-align:right;color:#174b78;font-size:14px}.nota{font-size:10.5px;color:#66788a;margin-top:14px}
</style></head><body>
<div class="head"><div>${marca.logo ? `<img src="${marca.logo}" alt="${esc(marca.nome)}" style="max-height:44px;max-width:180px;object-fit:contain;display:block;margin-bottom:6px">` : ''}<div class="marca">${esc(marca.nome.toUpperCase())}</div><h1>Sequência das atividades</h1><div class="muted">${esc(tipoNome)} · ordem cronológica dos fatos</div></div>
<div style="text-align:right"><b>${lista.length} atividade(s)</b><div class="muted">${esc(agora.toLocaleDateString('pt-BR'))}</div></div></div>
<ol>${lista.map((a, i) => `<li><b>${i + 1}</b><span>${esc(a.nome)}</span>${a.qualquerHora ? '<span class="qh">⏱ a qualquer hora do dia</span>' : ''}</li>`).join('')}</ol>
${lista.some(a => a.qualquerHora) ? '<p class="nota">⏱ A qualquer hora do dia: atividade que pode acontecer em qualquer momento (ex.: entrega, descarga de caminhão); a posição na lista é só uma referência.</p>' : ''}
<p class="nota">Sequência informativa, montada na ordem em que os fatos e as tarefas acontecem. A coleta de tempos pode ser feita em qualquer ordem. Gerado por ${esc(quem || 'EasyAudit')} em ${esc(agora.toLocaleDateString('pt-BR'))} às ${esc(agora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }))}.</p>
</body></html>`;
}

export function SequenciaAtividades({ data }: { data: TmData }) {
  const { s, t, colors } = useLook();
  const { isAdmin } = useAuth();
  const marca = useIdentidade();
  const usuario = useUsuarioLogado();
  const [tipo, setTipo] = useState<TipoOperacao>(() => (data.filiais.some(f => tipoDe(data, f.id) === 'cd') ? 'cd' : 'posto'));
  const lista = sequenciaDe(data, tipo);
  const nome = TIPOS_OPERACAO[tipo].nome;
  const imprimir = () => void imprimirHtml(sequenciaHtml(lista, nome, marca, usuario), `Sequência das atividades ${nome}`)
    .catch(e => notify('Não deu para imprimir', e instanceof Error ? e.message : 'Tente de novo.'));
  /** Nome em edição direto no bloco (vale para a atividade em todo o módulo: cronômetro, relatórios e histórico). */
  const [editando, setEditando] = useState<{ id: string; nome: string } | null>(null);
  const salvarNome = () => {
    if (!editando) return;
    const nomeNovo = editando.nome.trim().replace(/\s+/g, ' ');
    const atual = data.atividades.find(a => a.id === editando.id);
    if (!atual) { setEditando(null); return; }
    if (!nomeNovo) { notify('Informe o nome da atividade'); return; }
    if (nomeNovo === atual.nome) { setEditando(null); return; }
    if (lista.some(a => a.id !== atual.id && a.nome.toLowerCase() === nomeNovo.toLowerCase())) { notify('Já existe uma atividade com esse nome', 'Use outro nome para não confundir nos relatórios.'); return; }
    salvarAtividades(data.atividades.map(a => (a.id === atual.id ? { ...a, nome: nomeNovo } : a)));
    setEditando(null);
  };
  /** Liga/desliga "pode acontecer a qualquer momento do dia" (vale para a atividade em todo o módulo). */
  const alternarQualquerHora = (a: Atividade) => salvarAtividades(data.atividades.map(x => (x.id === a.id ? { ...x, qualquerHora: !x.qualquerHora } : x)));
  const recomecar = () => confirmAction('Recomeçar a sequência?', 'A lista volta para a ordem do cadastro das atividades.', 'Recomeçar', () => salvarSequencia(tipo, []));

  return <>
    <PageHead title="Atividades" subtitle="Todas as atividades numa lista só, na ordem que você quiser · só informativa" />
    <Card>
      <ChoiceChips value={nome} options={[TIPOS_OPERACAO.posto.nome, TIPOS_OPERACAO.cd.nome]} onChange={v => setTipo(v === TIPOS_OPERACAO.cd.nome ? 'cd' : 'posto')} />
      <Text style={t.caption}>
        {isAdmin ? 'Arraste os blocos pelo puxador (⋮⋮) até a ordem em que as tarefas acontecem; o lápis edita o nome; o relógio marca as que podem acontecer a qualquer hora do dia (ex.: entrega, descarga de caminhão). Cada mudança já fica gravada. ' : ''}
        Esta sequência serve para consulta e impressão: a coleta pode ser feita em qualquer ordem e o cronômetro não muda.
      </Text>
      <Button title="Imprimir a lista" icon={PrinterIcon} disabled={!lista.length} onPress={imprimir} />
      {isAdmin && data.sequencias[tipo].length ? <Button title="Recomeçar pela ordem do cadastro" icon={ResetIcon} variant="ghost" size="sm" style={s.alignStart} onPress={recomecar} /> : null}
    </Card>
    {lista.length ? (
      <ListaArrastavel itens={lista} chave={chave} somenteLeitura={!isAdmin}
        onSoltar={ids => salvarSequencia(tipo, ids)}
        cores={{ fundo: colors.surface, borda: colors.border, ativo: colors.accent, icone: colors.textMuted }}
        render={(a, i) => (
          <View style={s.row}>
            <Text style={[t.bodyStrong, { width: 30, color: colors.accentText }]}>{i + 1}</Text>
            {editando?.id === a.id ? <>
              <TextInput value={editando.nome} onChangeText={v => setEditando({ id: a.id, nome: v })} autoFocus selectTextOnFocus
                onSubmitEditing={salvarNome} returnKeyType="done" accessibilityLabel={`Novo nome de ${a.nome}`}
                style={[{ flex: 1, height: 38, borderWidth: 1, borderColor: colors.accent, borderRadius: 8, paddingHorizontal: 10, color: colors.text, backgroundColor: colors.campo, fontSize: 15 },
                  Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null]} />
              <IconButton icon={CheckIcon} label="Salvar o nome" onPress={salvarNome} />
              <IconButton icon={XIcon} label="Cancelar" onPress={() => setEditando(null)} />
            </> : <>
              <View style={s.flex}>
                <Text style={t.bodyStrong} numberOfLines={a.qualquerHora ? 1 : 2}>{a.nome}</Text>
                {a.qualquerHora ? <Text style={[t.caption, { color: colors.warning }]} numberOfLines={1}>A qualquer hora do dia</Text> : null}
              </View>
              {/* Relógio: pode acontecer a qualquer momento do dia (entrega, descarga…). Aceso = marcado. */}
              <Pressable accessibilityRole="switch" accessibilityState={{ checked: !!a.qualquerHora, disabled: !isAdmin }} disabled={!isAdmin}
                accessibilityLabel={`${a.nome}: pode acontecer a qualquer hora do dia`} hitSlop={6} onPress={() => alternarQualquerHora(a)}
                style={({ pressed }) => [{ width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', borderWidth: 1,
                  borderColor: a.qualquerHora ? colors.warning : colors.border, backgroundColor: a.qualquerHora ? colors.warningSoft : 'transparent' }, pressed && { opacity: 0.6 }]}>
                <ClockIcon size={18} color={a.qualquerHora ? colors.warning : colors.textFaint} weight={a.qualquerHora ? 'fill' : 'regular'} />
              </Pressable>
              {isAdmin ? <IconButton icon={PencilSimpleIcon} label={`Editar o nome de ${a.nome}`} onPress={() => setEditando({ id: a.id, nome: a.nome })} /> : null}
            </>}
          </View>
        )} />
    ) : <Text style={t.caption}>Nenhuma atividade cadastrada para {nome.toLowerCase()}. Cadastre em Gestão → Dimensionamento → Setores e atividades.</Text>}
    {lista.length > 8 ? <Button title="Imprimir a lista" icon={PrinterIcon} variant="secondary" onPress={imprimir} /> : null}
  </>;
}
