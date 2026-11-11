# Postora (Expo)

Plataforma de módulos para gestão de postos de combustível, para celular (Android/iOS) e navegador. Depois do login, a central mostra os módulos liberados para a conta:

- **Aferições**: inspeção de bombas e bicos por filial, com histórico, CSV e relatório em PDF.
- **Tempos e Movimentos**: coletas por filial e data, com atendimentos completos (etapas cronometradas, pausas, etapas opcionais) e atividades individuais; painel, histórico, dimensionamento da equipe, plano de ação e cadastros.
- **Croqui**: desenho do terreno de cada filial (bombas e combustíveis por bico, ilhas, cobertura, loja, tanques, vias, serviços), com visualização, edição e impressão.

O **cadastro de filiais é único** (Central → Cadastros → Filiais) e todos os módulos usam o mesmo registro.

## Estrutura

| Pasta | Conteúdo |
|---|---|
| `app/` | Rotas (Expo Router): casca com login (`_layout.tsx`), central (`index.tsx`), `filiais/`, `usuarios.tsx` e uma rota por módulo |
| `modules/` | Código de cada módulo e o catálogo (`registry.ts`) exibido na central |
| `lib/` | Sessão e papéis (`auth.tsx`), sincronização local-first (`sync.ts`), dados compartilhados (`data.ts`) |
| `ui/` | Tema, componentes e ícones compartilhados |
| `prisma/` | Esquema e migrações do banco (Supabase/PostgreSQL) |

Para integrar um módulo: crie `modules/<id>/`, a rota `app/<id>/index.tsx` e registre em `modules/registry.ts`.

## Dados e sincronização

- Tudo é gravado **primeiro no aparelho** e funciona sem internet. As alterações entram numa fila e são enviadas quando há conexão (só os registros alterados).
- A leitura é **incremental**: o app busca apenas o que mudou desde a última sincronização (`updated_at`, definido pelo servidor). Exclusões são lógicas (`deleted_at`).
- **Cronômetros nunca são gravados continuamente no servidor.** O atendimento em andamento fica no aparelho (sobrevive ao fechamento do app) e vai ao servidor uma única vez, ao finalizar.
- Cada módulo guarda onde o usuário estava (aba, coleta, atendimento) e reabre no mesmo lugar.

Tabelas: `profiles`, `filiais`, `filial_docs` (equipamentos, croqui e dimensionamento em JSONB, um documento por filial), `tm_coletas`, `tm_atendimentos` (etapas em JSONB), `tm_plano`, `app_config` e `service_records` (aferições).

## Login, contas e permissões

- Rotas: `/login` (entrar, criar conta, esqueci a senha), `/redefinir-senha` (link do e-mail e alteração de senha), `/aguardando` (conta ainda não aprovada) e a área logada `(app)`.
- Toda conta criada no login nasce **bloqueada e sem módulos**. O administrador aprova em Minha conta → Usuários e permissões, escolhendo os módulos de cada conta. Administradores acessam todos os módulos.
- As permissões valem também no banco (RLS por módulo): sem o módulo liberado, a conta não lê nem grava os dados dele.
- Em Minha conta (foto no topo da central): foto de perfil, nome, troca de e-mail (com confirmação), troca de senha, tema e sair.
- No painel do Supabase, em Authentication → URL Configuration → Redirect URLs, cadastre os endereços usados nos links de e-mail: `postora://**` (app instalado), `exp://**` (Expo Go) e a URL do site/`http://localhost:8081/**` (web).

## Executar

1. Copie `.env.example` para `.env` e preencha `EXPO_PUBLIC_SUPABASE_URL` e `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. Nunca coloque a chave `service_role` no app. `DATABASE_URL` e `DIRECT_URL` são usadas só pelo Prisma (migrações) e não vão para o app.
2. `npm install`
3. Aplique as migrações: `npm run db:migrate` (ver `prisma/README.md`).
4. `npx expo start` e abra no Expo Go, ou `npx expo start --web`.

Sem as variáveis do Supabase, o app roda em modo local (somente neste aparelho, sem login).

## Importar dados antigos

- **ETM em HTML**: no HTML, Cadastros → Exportar JSON; no app, Tempos e Movimentos → Gestão → Cadastros → Importar do HTML antigo. As filiais são associadas pelo nome (é possível corrigir antes de importar). Importar o mesmo arquivo de novo não duplica.
- **Croqui em HTML**: no navegador onde o HTML foi usado, console → `copy(localStorage.getItem('croqui-postos'))`; no app, Croqui → Editar → Importar do HTML antigo.
