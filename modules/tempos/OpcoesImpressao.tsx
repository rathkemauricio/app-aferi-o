import { useState } from 'react';
import { Text, View } from 'react-native';
import { FilePdfIcon } from '../../ui/icons';
import { Button, ChoiceChips, Sheet } from '../../ui/kit';
import { type OpcoesRelatorio, type OrdemAtividades, ROTULO_ORDEM } from './relatorio';
import { useLook } from './ui';

/** Última escolha (vale enquanto o app está aberto). */
let ultima: OpcoesRelatorio = { ordem: 'cronologica', linhaDoTempo: true };
const ORDENS: OrdemAtividades[] = ['cronologica', 'cadastro', 'tempo'];
const COM = 'Incluir a linha do tempo', SEM = 'Sem a linha do tempo';

/** Antes de gerar o PDF de Tempos e Movimentos: ordem das atividades e a linha do tempo das tarefas. */
export function OpcoesImpressao({ onClose, onGerar }: { onClose: () => void; onGerar: (o: OpcoesRelatorio) => void }) {
  const { s, t } = useLook();
  const [o, setO] = useState<OpcoesRelatorio>(ultima);
  return (
    <Sheet title="Relatório em PDF" onClose={onClose}
      footer={<Button title="Gerar PDF" icon={FilePdfIcon} onPress={() => { ultima = o; onClose(); onGerar(o); }} />}>
      <View style={s.group}>
        <Text style={t.label}>Ordem das atividades</Text>
        <ChoiceChips value={ROTULO_ORDEM[o.ordem]} options={ORDENS.map(x => ROTULO_ORDEM[x])} onChange={v => setO({ ...o, ordem: ORDENS.find(x => ROTULO_ORDEM[x] === v) ?? 'cronologica' })} />
        <Text style={t.caption}>
          {o.ordem === 'cronologica' ? 'Na sequência em que as tarefas foram executadas na unidade (pela primeira vez em que cada uma foi cronometrada).'
            : o.ordem === 'cadastro' ? 'Na ordem que você montou arrastando os blocos (Dimensionamento → Setores e atividades).'
              : 'As que mais consumiram tempo primeiro.'}
        </Text>
      </View>
      <View style={s.group}>
        <Text style={t.label}>Linha do tempo</Text>
        <ChoiceChips value={o.linhaDoTempo ? COM : SEM} options={[COM, SEM]} onChange={v => setO({ ...o, linhaDoTempo: v === COM })} />
        <Text style={t.caption}>Lista todas as tarefas cronometradas, coleta por coleta, na ordem em que aconteceram: início, fim, duração, atividade, atendimento/ciclo e funcionário.</Text>
      </View>
    </Sheet>
  );
}
