-- Módulos por rede, unificados com os cadastros de filiais e de usuários.
--
-- 1. Checklists da Auditoria: o id do checklist passa a ser único dentro da empresa (antes era no sistema todo, e o
--    checklist "padrao" gravado por uma rede impediria as outras de gravar o delas).
-- 2. Mapa de Risco: a unidade é a filial do cadastro, dividida opcionalmente em áreas (ex.: Pista, Loja).
-- 3. Quem fez: atividades do Mapa de Risco e inventários lançados no app guardam a conta e o nome de quem registrou.
-- Nada existente é apagado.

ALTER TABLE public.aud_modelos DROP CONSTRAINT IF EXISTS aud_modelos_pkey;
ALTER TABLE public.aud_modelos ADD PRIMARY KEY (empresa_id, id);

ALTER TABLE public.rm_unidades ADD COLUMN IF NOT EXISTS area text NOT NULL DEFAULT '';

ALTER TABLE public.rm_atividades ADD COLUMN IF NOT EXISTS criado_por uuid DEFAULT auth.uid() REFERENCES auth.users (id) ON DELETE SET NULL;
ALTER TABLE public.rm_atividades ADD COLUMN IF NOT EXISTS criado_por_nome text NOT NULL DEFAULT '';

ALTER TABLE public.inv_inventarios ADD COLUMN IF NOT EXISTS criado_por uuid DEFAULT auth.uid() REFERENCES auth.users (id) ON DELETE SET NULL;
ALTER TABLE public.inv_inventarios ADD COLUMN IF NOT EXISTS criado_por_nome text NOT NULL DEFAULT '';
