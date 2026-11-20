# Tutoriais interativos

Tour guiado para apps React Native / Expo (Android, iOS e web): escurece a tela, abre um recorte animado sobre o
elemento explicado e mostra um cartão com o passo. A pasta é independente do app: copie `tutoriais/` para outro
projeto e use.

## O que faz

- **Destaque animado**: o recorte desliza com mola de um elemento para o outro, com cantos arredondados.
- **Passos de leitura e de toque**: no passo de leitura a pessoa lê e toca em Próximo, e o resto da tela fica
  bloqueado. No passo de toque (`acao: 'toque'`), ela toca no próprio elemento destacado, que funciona de verdade
  (ex.: abre um menu), e o tutorial segue sozinho. Um pulso em volta do destaque mostra onde tocar.
- **Rola sozinho até o elemento**: se o elemento explicado está fora da parte visível, o tutorial rola a área até
  ele (use `RolagemTutorial` no lugar de `ScrollView` nas telas com `<Alvo>`; na web, sem ela, usa `scrollIntoView`).
- **Cartão posicionado sozinho**: fica embaixo do elemento se couber, senão em cima, com uma seta apontando para
  ele. Sempre inteiro dentro da tela, mesmo com elementos grandes.
- **Passos opcionais**: se o alvo não está na tela (ex.: o menu lateral só existe no computador), o passo é pulado.
- **Navegação entre telas**: `antes` roda antes do passo (ex.: `router.navigate('/outra-tela')`), e o destaque
  espera o alvo aparecer.
- **Teclado e Android**: setas e Enter avançam, a seta para a esquerda volta e Esc sai. No Android, o botão voltar
  fecha o tutorial.
- **Lembra o que já foi visto**: pelo armazenamento que você passar (AsyncStorage, localStorage, banco...).
  `useTutorialAutomatico` abre um tutorial sozinho só na primeira vez.
- **Movimento reduzido**: com "reduzir movimento" ligado no aparelho, as animações viram esmaecimentos curtos.
- **Tema e textos configuráveis**: cores e rótulos dos botões (para outro idioma).

## Dependências

`react`, `react-native` (ou `react-native-web`) e `react-native-reanimated` (3 ou 4). Nada mais.

## Como usar

1. Envolva o app com o provider, **por fora** de qualquer transform ou zoom do app (o destaque mede a tela real):

```tsx
import AsyncStorage from '@react-native-async-storage/async-storage';
import { armazenamentoAsync, TutorialProvider, type Tutorial } from './tutoriais';

const TUTORIAIS: Tutorial[] = [
  {
    id: 'boas-vindas',
    titulo: 'Primeiros passos',
    passos: [
      { titulo: 'Bem-vindo!', texto: 'Um passeio rápido pelo app.' },            // sem alvo: cartão no centro
      { alvo: 'lista', titulo: 'Seus itens', texto: 'Tudo o que você cadastrou.' },
      { alvo: 'novo', acao: 'toque', titulo: 'Crie um item', texto: 'Toque no botão.' },
      { alvo: 'menu', opcional: true, titulo: 'Menu', texto: 'Só aparece no computador.' },
      { titulo: 'Pronto!' },
    ],
  },
];

export default function App() {
  return (
    <TutorialProvider tutoriais={TUTORIAIS} armazenamento={armazenamentoAsync(AsyncStorage)}>
      <Rotas />
    </TutorialProvider>
  );
}
```

2. Marque os elementos com `<Alvo>` (ele só envolve o filho numa View; use `style` para manter o layout) e troque
   o `ScrollView` das telas por `RolagemTutorial` (mesmas propriedades) para o tutorial poder rolar até o elemento:

```tsx
import { Alvo, RolagemTutorial } from './tutoriais';

<RolagemTutorial contentContainerStyle={{ padding: 16 }}>
  <Alvo id="novo"><Button title="Novo item" onPress={criar} /></Alvo>
  <Alvo id="lista"><Lista ... /></Alvo>
</RolagemTutorial>
```

3. Abra o tutorial:

```tsx
import { useTutorial, useTutorialAutomatico } from './tutoriais';

useTutorialAutomatico('boas-vindas');                 // sozinho, só na primeira vez
const { iniciar, jaVisto, esquecer } = useTutorial();
<Button title="Rever tutorial" onPress={() => iniciar('boas-vindas')} />
```

## API

| Item | O que é |
| --- | --- |
| `TutorialProvider` | `tutoriais`, `armazenamento?`, `chave?` (onde guardar os vistos), `tema?`, `rotulos?`, `aoConcluir?(id, concluido)` |
| `Alvo` | `id`, `style?`: marca um elemento destacável |
| `RolagemTutorial` | ScrollView (mesmas propriedades) que o tutorial rola até o elemento |
| `useTutorial()` | `iniciar(id)`, `parar()`, `jaVisto(id)`, `esquecer(id?)`, `emAndamento`, `tutoriais`, `carregado` |
| `useTutorialAutomatico(id, quando?, esperaMs?)` | abre o tutorial na primeira vez em que `quando` for verdadeiro |
| `armazenamentoAsync(storage)` | adaptador para qualquer objeto com `getItem`/`setItem` |
| `Passo` | `alvo?`, `titulo`, `texto?`, `acao?: 'ler' \| 'toque'`, `lado?: 'auto' \| 'cima' \| 'baixo'`, `folga?`, `raio?`, `opcional?`, `antes?`, `espera?` |
| `TemaTutorial` | `veu`, `cartao`, `borda`, `texto`, `textoSuave`, `destaque`, `sobreDestaque`, `pulso` |
| `RotulosTutorial` | `proximo`, `voltar`, `pular`, `concluir`, `toqueParaSeguir`, `progresso(atual, total)` |

## Arquivos

- `index.ts`: o que a pasta exporta.
- `tipos.ts`: tipos dos tutoriais, do tema, dos rótulos e do armazenamento.
- `contexto.tsx`: provider, estado do tutorial, registro dos alvos e hooks.
- `Alvo.tsx`: marcador dos elementos.
- `Rolagem.tsx`: `RolagemTutorial`, o ScrollView que o tutorial sabe rolar.
- `Camada.tsx`: véu com recorte, pulso, cartão, teclado e botão voltar.

## Dicas

- Elemento dentro de uma `FlatList`: marque um elemento fora da lista, ou envolva a tela em `RolagemTutorial`.
- Módulo que lembra a última tela aberta: faça o `antes` do primeiro passo voltá-lo à tela inicial (no EasyAudit,
  `lib/ganchosTutorial.ts`), senão o elemento do passo pode não existir na tela.
- Um passo de toque que abre uma janela (Sheet ou Modal): o próximo passo pode destacar um `<Alvo>` dentro da
  janela. Use `espera` para dar tempo da animação de abertura.
- No EasyAudit, os roteiros ficam em `lib/tutoriais.ts`, e a tela de rever fica em `app/(app)/tutoriais.tsx`.
