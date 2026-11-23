import { useState } from 'react';
import { Text, View } from 'react-native';
import { useAuth, useUsuarioLogado } from '../../lib/auth';
import { useIdentidade } from '../../lib/identidade';
import { esc, imprimirHtml } from '../../lib/util';
import { PrinterIcon, ResetIcon } from '../../ui/icons';
import { Button, Card, ChoiceChips, confirmAction, notify } from '../../ui/kit';
import { PageHead } from './ColetasTab';
import { ListaArrastavel } from './ListaArrastavel';
import { type Atividade, TIPOS_OPERACAO, type TipoOperacao } from './model';
import { salvarSequencia, sequenciaDe, tipoDe, type TmData } from './store';
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
li b{min-width:28px;text-align:right;color:#174b78;font-size:14px}.nota{font-size:10.5px;color:#66788a;margin-top:14px}
</style></head><body>
<div class="head"><div>${marca.logo ? `<img src="${marca.logo}" alt="${esc(marca.nome)}" style="max-height:44px;max-width:180px;object-fit:contain;display:block;margin-bottom:6px">` : ''}<div class="marca">${esc(marca.nome.toUpperCase())}</div><h1>Sequência das atividades</h1><div class="muted">${esc(tipoNome)} · ordem cronológica dos fatos</div></div>
<div style="text-align:right"><b>${lista.length} atividade(s)</b><div class="muted">${esc(agora.toLocaleDateString('pt-BR'))}</div></div></div>
<ol>${lista.map((a, i) => `<li><b>${i + 1}</b><span>${esc(a.nome)}</span></li>`).join('')}</ol>
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
  const recomecar = () => confirmAction('Recomeçar a sequência?', 'A lista volta para a ordem do cadastro das atividades.', 'Recomeçar', () => salvarSequencia(tipo, []));

  return <>
    <PageHead title="Sequência das atividades" subtitle="Ordem cronológica dos fatos, independente do setor · só informativa"
      action={<Button title="Imprimir" icon={PrinterIcon} variant="secondary" size="sm" disabled={!lista.length} onPress={imprimir} />} />
    <Card>
      <ChoiceChips value={nome} options={[TIPOS_OPERACAO.posto.nome, TIPOS_OPERACAO.cd.nome]} onChange={v => setTipo(v === TIPOS_OPERACAO.cd.nome ? 'cd' : 'posto')} />
      <Text style={t.caption}>
        {isAdmin ? 'Arraste os blocos pelo puxador (⋮⋮) até a ordem em que as tarefas acontecem. Cada soltura já fica gravada. ' : ''}
        Esta sequência serve para consulta e impressão: a coleta pode ser feita em qualquer ordem e o cronômetro não muda.
      </Text>
      {isAdmin && data.sequencias[tipo].length ? <Button title="Recomeçar pela ordem do cadastro" icon={ResetIcon} variant="ghost" size="sm" style={s.alignStart} onPress={recomecar} /> : null}
    </Card>
    {lista.length ? (
      <ListaArrastavel itens={lista} chave={chave} somenteLeitura={!isAdmin}
        onSoltar={ids => salvarSequencia(tipo, ids)}
        cores={{ fundo: colors.surface, borda: colors.border, ativo: colors.accent, icone: colors.textMuted }}
        render={(a, i) => (
          <View style={s.row}>
            <Text style={[t.bodyStrong, { width: 30, color: colors.accentText }]}>{i + 1}</Text>
            <Text style={[t.bodyStrong, s.flex]} numberOfLines={2}>{a.nome}</Text>
          </View>
        )} />
    ) : <Text style={t.caption}>Nenhuma atividade cadastrada para {nome.toLowerCase()}. Cadastre em Dimensionamento → Setores e atividades.</Text>}
  </>;
}
