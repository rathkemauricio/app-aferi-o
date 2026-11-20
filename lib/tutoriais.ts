import { type Href, router } from 'expo-router';
import { reiniciarContagens } from './ganchosTutorial';
import type { Tutorial } from '../tutoriais';
import { CheckSquareOffsetIcon, type Icon, SquaresFourIcon, UserCircleIcon } from '../ui/icons';

// Roteiros do EasyAudit para o motor de tutoriais (pasta tutoriais/, independente do app).
// Cada passo destaca um <Alvo id="..."> marcado nas telas; passos "opcional" somem quando o alvo não está na tela
// (ex.: menu lateral só existe no computador; base de códigos só para a auditoria).

export type TutorialApp = Tutorial & {
  icone: Icon;
  /** Módulo exigido (podeAcessar). */
  modulo?: string;
  /** Só administrador. */
  soAdmin?: boolean;
};

const ir = (rota: string) => () => { router.navigate(rota as Href); };
const esperar = (ms: number) => new Promise(r => setTimeout(r, ms));
/** Abre Contagens na lista de inventários, mesmo que o módulo tenha ficado dentro de um inventário. */
const irContagens = async () => { router.navigate('/coleta' as Href); await esperar(500); reiniciarContagens(); };

export const TUTORIAIS: TutorialApp[] = [
  {
    id: 'primeiros-passos',
    titulo: 'Primeiros passos',
    descricao: 'Um passeio rápido pela tela inicial, pelos módulos e pela sua conta.',
    icone: SquaresFourIcon,
    passos: [
      { titulo: 'Bem-vindo ao EasyAudit', texto: 'Um passeio de 1 minuto pelo essencial. Use Próximo (ou as setas do teclado, no computador). Dá para pular quando quiser.', antes: ir('/') },
      { alvo: 'inicio-modulos', titulo: 'Seus módulos', texto: 'Cada cartão é um módulo liberado para a sua conta: auditorias, contagens, aferições e outros. Toque em um para abrir.' },
      { alvo: 'inicio-cadastros', opcional: true, titulo: 'Cadastros da rede', texto: 'Filiais, combustíveis e bandeiras ficam aqui e valem para todos os módulos.' },
      { alvo: 'menu-lateral', opcional: true, titulo: 'Menu lateral', texto: 'No computador, módulos, cadastros e configurações também ficam aqui. A aba destacada mostra onde você está.' },
      { alvo: 'menu-conta', opcional: true, titulo: 'Sua conta', texto: 'Nome, foto, e-mail, senha e o tamanho das letras ficam em Minha conta.' },
      { titulo: 'Pronto!', texto: 'Reveja este e os outros tutoriais quando quiser em Configurações → Tutoriais.' },
    ],
  },
  {
    id: 'contagens',
    titulo: 'Contagens',
    descricao: 'Como abrir um inventário, contar com ou sem leitor e conferir os itens.',
    icone: CheckSquareOffsetIcon,
    modulo: 'coleta',
    passos: [
      { titulo: 'Contagens de estoque', texto: 'Aqui ficam os inventários de cada filial: os saldos do sistema, até 3 contagens e o relatório das diferenças.', antes: irContagens, espera: 500 },
      { alvo: 'contagens-abas', titulo: 'Em aberto e encerrados', texto: 'Em aberto: as filiais com inventário em andamento. Encerrados: os finalizados, com o relatório e a opção de reabrir.' },
      { alvo: 'contagens-leitor', opcional: true, titulo: 'Como a filial conta', texto: 'Com leitor de código (coletor) ou pelo celular: lista dos itens, câmera ou digitando o código.' },
      { alvo: 'contagens-bases', opcional: true, titulo: 'Base de códigos de barra', texto: 'Importe uma vez a relação de códigos da rede: ela vale para todas as filiais e liga cada código ao item.' },
      { alvo: 'contagens-abrir', titulo: 'Abrir inventário', texto: 'Escolha a filial e carregue os saldos (PDF ou API do ERP). Depois crie as contagens por categoria.' },
      { titulo: 'Dentro da contagem', texto: 'Na lista de itens, filtre Pendentes, Incorretos e Corretos. No painel web, a própria lista é a coleta: digite a quantidade e toque em Somar (as partes se somam) e toque no cartão para ver as informações e o histórico. Com coletor ou câmera, use a aba Coleta. Ao finalizar, os divergentes vão para a próxima contagem.' },
    ],
  },
  {
    id: 'usuarios',
    titulo: 'Usuários e permissões',
    descricao: 'Criar contas de pessoas, filiais e empresas e escolher os módulos de cada uma.',
    icone: UserCircleIcon,
    soAdmin: true,
    passos: [
      { alvo: 'usuarios-criar', acao: 'toque', titulo: 'Criar conta', texto: 'Toque em Criar conta para ver as opções.', antes: ir('/usuarios'), espera: 600 },
      { alvo: 'usuarios-tipos', espera: 450, titulo: 'Pessoa, filial ou empresa', texto: 'Pessoa: auditor ou gerente, com os módulos que você marcar. Filial: entra só em Contagens da própria filial. Empresa: um cliente novo, já liberado (só para o dono do EasyAudit).' },
      { titulo: 'É só preencher', texto: 'A pessoa recebe o e-mail com o link para criar a senha, ou você define a senha na hora. Feche a janela quando terminar.' },
    ],
  },
];
