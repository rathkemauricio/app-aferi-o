-- Contas de filial: cada filial pode ter um e-mail próprio. A conta desse e-mail fica presa à filial e só usa
-- o módulo Contagens (id 'coleta'), vendo apenas as contagens que a própria filial abriu.
-- As contagens abertas pela auditoria (administrador e usuários da empresa) não aparecem para a filial; a
-- auditoria vê todas (as dela e as das filiais). A base de códigos de barra continua da empresa: só a auditoria grava.

-- =====================================================================
-- 1. Filial: e-mail de acesso e modo de contagem (com leitor de código ou celular sem leitor)
-- =====================================================================
ALTER TABLE public.filiais ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE public.filiais ADD COLUMN IF NOT EXISTS contagem_leitor boolean NOT NULL DEFAULT true;

-- =====================================================================
-- 2. Conta de filial
-- =====================================================================
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS filial_id text REFERENCES public.filiais (id);
CREATE INDEX IF NOT EXISTS profiles_filial_idx ON public.profiles (filial_id) WHERE filial_id IS NOT NULL;

-- Filial da conta logada (null = conta da auditoria).
CREATE OR REPLACE FUNCTION private.minha_filial()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT p.filial_id FROM public.profiles p WHERE p.user_id = (SELECT auth.uid());
$$;
REVOKE ALL ON FUNCTION private.minha_filial() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.minha_filial() TO authenticated;

-- A conta não troca de empresa nem de filial sozinha (só o servidor, pelos convites).
CREATE OR REPLACE FUNCTION private.proteger_empresa_do_perfil()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF (NEW.empresa_id IS DISTINCT FROM OLD.empresa_id OR NEW.filial_id IS DISTINCT FROM OLD.filial_id) AND (SELECT auth.uid()) IS NOT NULL THEN
    RAISE EXCEPTION 'A empresa e a filial da conta só mudam por convite.' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

-- Contas de filial não ocupam vaga do plano (o limite vale para as contas da auditoria).
CREATE OR REPLACE FUNCTION private.limite_de_contas()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  limite integer;
  usadas integer;
BEGIN
  IF NOT NEW.ativo OR NEW.empresa_id IS NULL OR NEW.filial_id IS NOT NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.ativo AND OLD.filial_id IS NULL AND OLD.empresa_id IS NOT DISTINCT FROM NEW.empresa_id THEN RETURN NEW; END IF;
  SELECT e.limite_contas INTO limite FROM public.empresas e WHERE e.id = NEW.empresa_id;
  SELECT count(*) INTO usadas FROM public.profiles p
  WHERE p.empresa_id = NEW.empresa_id AND p.ativo AND p.filial_id IS NULL AND p.user_id <> NEW.user_id;
  IF usadas >= limite THEN
    RAISE EXCEPTION 'Limite de contas do plano atingido (% de %).', usadas, limite USING ERRCODE = 'P0001', HINT = 'limite_contas';
  END IF;
  RETURN NEW;
END;
$$;

-- =====================================================================
-- 3. Origem da contagem (inventário): auditoria ou filial
-- =====================================================================
ALTER TABLE public.ce_inventarios ADD COLUMN IF NOT EXISTS origem text NOT NULL DEFAULT 'auditoria';
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ce_inventarios_origem_check') THEN
    ALTER TABLE public.ce_inventarios ADD CONSTRAINT ce_inventarios_origem_check CHECK (origem IN ('auditoria', 'filial'));
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS ce_inventarios_filial_origem_idx ON public.ce_inventarios (filial_id, origem);

-- Quem abre define a origem (não o aparelho): conta de filial = 'filial'; as demais = 'auditoria'.
CREATE OR REPLACE FUNCTION private.origem_do_inventario()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN RETURN NEW; END IF; -- servidor (funções): mantém o que veio
  IF TG_OP = 'INSERT' THEN
    NEW.origem := CASE WHEN (SELECT private.minha_filial()) IS NULL THEN 'auditoria' ELSE 'filial' END;
  ELSE
    NEW.origem := OLD.origem;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS ce_inventarios_origem ON public.ce_inventarios;
CREATE TRIGGER ce_inventarios_origem BEFORE INSERT OR UPDATE ON public.ce_inventarios FOR EACH ROW EXECUTE FUNCTION private.origem_do_inventario();

-- =====================================================================
-- 4. O que a conta de filial vê e grava
-- =====================================================================
-- Inventários: só os da própria filial abertos por ela.
DROP POLICY IF EXISTS "Acesso da filial" ON public.ce_inventarios;
CREATE POLICY "Acesso da filial" ON public.ce_inventarios AS RESTRICTIVE FOR ALL TO authenticated
  USING ((SELECT private.minha_filial()) IS NULL OR (filial_id = (SELECT private.minha_filial()) AND origem = 'filial'))
  WITH CHECK ((SELECT private.minha_filial()) IS NULL OR filial_id = (SELECT private.minha_filial()));

-- Contagens, leituras e produtos: só os desses inventários.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['ce_contagens', 'ce_coletas', 'ce_produtos'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Acesso da filial" ON public.%I', t);
    EXECUTE format($p$CREATE POLICY "Acesso da filial" ON public.%I AS RESTRICTIVE FOR ALL TO authenticated
      USING ((SELECT private.minha_filial()) IS NULL OR inventario_id IN (
        SELECT i.id FROM public.ce_inventarios i WHERE i.filial_id = (SELECT private.minha_filial()) AND i.origem = 'filial'))
      WITH CHECK ((SELECT private.minha_filial()) IS NULL OR inventario_id IN (
        SELECT i.id FROM public.ce_inventarios i WHERE i.filial_id = (SELECT private.minha_filial()) AND i.origem = 'filial'))$p$, t);
  END LOOP;
END $$;

-- Base de códigos de barra e classes de categoria: a filial lê, só a auditoria grava.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['ce_bases', 'ce_barras', 'ce_classes'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Filial nao insere" ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS "Filial nao altera" ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS "Filial nao exclui" ON public.%I', t);
    EXECUTE format('CREATE POLICY "Filial nao insere" ON public.%I AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK ((SELECT private.minha_filial()) IS NULL)', t);
    EXECUTE format('CREATE POLICY "Filial nao altera" ON public.%I AS RESTRICTIVE FOR UPDATE TO authenticated USING ((SELECT private.minha_filial()) IS NULL)', t);
    EXECUTE format('CREATE POLICY "Filial nao exclui" ON public.%I AS RESTRICTIVE FOR DELETE TO authenticated USING ((SELECT private.minha_filial()) IS NULL)', t);
  END LOOP;
END $$;

-- Filiais: a conta de filial vê só a própria.
DROP POLICY IF EXISTS "Filial ve a propria" ON public.filiais;
CREATE POLICY "Filial ve a propria" ON public.filiais AS RESTRICTIVE FOR SELECT TO authenticated
  USING ((SELECT private.minha_filial()) IS NULL OR id = (SELECT private.minha_filial()));

-- Dados dos outros módulos: nada para a conta de filial (mesmo se alguém liberar outro módulo por engano).
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'agenda_eventos', 'aud_auditorias', 'aud_modelos', 'filial_docs', 'inv_categorias', 'inv_inventarios',
    'rm_atividades', 'rm_pontuacoes', 'rm_unidades', 'rm_visitas', 'service_records', 'tm_analises_ia', 'tm_atendimentos',
    'tm_coletas', 'tm_filiais_status', 'tm_plano', 'tq_medicoes', 'tq_tabelas', 'tq_tanques'
  ] LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('DROP POLICY IF EXISTS "Sem acesso da filial" ON public.%I', t);
      EXECUTE format('CREATE POLICY "Sem acesso da filial" ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING ((SELECT private.minha_filial()) IS NULL) WITH CHECK ((SELECT private.minha_filial()) IS NULL)', t);
    END IF;
  END LOOP;
END $$;

-- Módulo liberado: conta de filial só tem Contagens (vale para o app e para as funções do servidor).
CREATE OR REPLACE FUNCTION private.tem_modulo(modulo text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p JOIN public.empresas e ON e.id = p.empresa_id
    WHERE p.user_id = (SELECT auth.uid()) AND e.status = 'ativa' AND modulo = ANY (e.modulos)
      AND (p.filial_id IS NULL OR (p.ativo AND modulo = 'coleta'))
      AND ((SELECT private.is_nevoeiro_admin()) OR (p.ativo AND modulo = ANY (p.modulos)))
  );
$$;
