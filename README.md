# Nevoeiro Atendimentos (Expo)

Aplicativo móvel para registrar um atendimento por filial e data. O cronômetro de cada etapa usa horários reais, então continua contando corretamente se o app for minimizado ou fechado enquanto a etapa está ativa. Os dados ficam em cache no aparelho e sincronizam com Supabase quando conectado.

## Executar no celular

1. Crie um projeto no [Supabase](https://supabase.com/) e execute [`supabase/schema.sql`](supabase/schema.sql) no SQL Editor do projeto.
2. Em **Authentication → Settings → Password security**, defina mínimo de 8 caracteres e exija números, letras minúsculas e maiúsculas. Essas regras também são verificadas na tela de login. O Supabase aplica as regras do lado do servidor.
3. Em **Authentication → Users**, crie ou convide os usuários que terão acesso ao app. O app exige login; o schema permite que os usuários autenticados do projeto compartilhem os registros desta filial. Não habilite cadastro público sem rever as políticas RLS.
4. Copie `.env.example` para `.env` e preencha `EXPO_PUBLIC_SUPABASE_URL` e `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` no painel Supabase. Nunca coloque uma `service_role` key no app.
5. Instale Node.js 22.13 ou mais recente e o app **Expo Go** no celular.
6. No terminal, nesta pasta, execute `npm install`.
7. Execute `npx expo start` e leia o QR code com o Expo Go. O computador e o celular precisam estar na mesma rede.

Para gerar um instalador Android/iOS de distribuição, configure uma conta Expo e EAS Build conforme o [guia oficial de builds](https://docs.expo.dev/build/setup/). O Expo Go serve para desenvolvimento e prévia.

## Fluxo implementado

- Informe o nome da filial e a data (formato `AAAA-MM-DD`) para abrir um atendimento. É possível registrar vários atendimentos na mesma filial e data.
- Cronometre abordagem, abastecimento e pagamento; limpeza do para-brisa, calibragem dos pneus e verificação de água e óleo são opcionais.
- Finalize cada etapa para gravar seu tempo e liberar a próxima.
- Consulte registros abertos ou concluídos na aba Histórico. Um registro aberto da mesma filial e data é retomado para evitar criar dois ao mesmo tempo.

Os registros são sincronizados entre os aparelhos autenticados e atualizados via Supabase Realtime. Quando a conexão cai, as alterações ficam no cache local e são enviadas quando o app volta a sincronizar. Faça backup do projeto Supabase conforme a política de operação da empresa.

Supabase Auth valida as credenciais, guarda somente hashes bcrypt das senhas e emite os JWTs de sessão; o SDK renova e envia esses tokens nas chamadas ao banco. O app guarda os tokens de sessão no armazenamento seguro do aparelho, e não salva a senha digitada. [Detalhes sobre política e hashing de senhas](https://supabase.com/docs/guides/auth/password-security) e [sessões JWT](https://supabase.com/docs/guides/auth/sessions).
