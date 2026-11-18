-- Multiempresa: o EasyAudit passa a atender várias empresas (clientes), cada uma com os próprios dados,
-- o próprio administrador e um limite de contas e de módulos dado pelo plano.
--
-- Como funciona:
-- - public.planos: catálogo de planos (limite de contas e módulos); o site mostra os ativos.
-- - public.empresas: cada cliente, com plano, limite de contas, módulos e situação (aguardando, ativa, suspensa).
-- - profiles.empresa_id: a empresa de cada conta (uma conta pertence a uma empresa).
-- - Toda tabela de dados ganha empresa_id (preenchido sozinho pela conta que grava) e uma regra RESTRITIVA
--   "só a própria empresa", que vale JUNTO com as regras por módulo que já existem (nenhuma delas é trocada).
-- - Os dados que já existem ficam com a empresa Rede Nevoeiro.
-- Nada existente é apagado.

-- =====================================================================
-- 1. Planos e empresas
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.planos (
  id text PRIMARY KEY,
  nome text NOT NULL,
  descricao text NOT NULL DEFAULT '',
  preco_mensal numeric,                 -- nulo = sob consulta
  limite_contas integer NOT NULL CHECK (limite_contas > 0),
  modulos text[] NOT NULL DEFAULT '{}',
  ordem integer NOT NULL DEFAULT 0,
  ativo boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);
DROP TRIGGER IF EXISTS planos_touch ON public.planos;
CREATE TRIGGER planos_touch BEFORE INSERT OR UPDATE ON public.planos FOR EACH ROW EXECUTE FUNCTION private.touch_updated_at();

INSERT INTO public.planos (id, nome, descricao, preco_mensal, limite_contas, modulos, ordem) VALUES
  ('essencial', 'Essencial', 'Aferições, medição de tanques, croqui e agenda para equipes pequenas.', NULL, 10,
    ARRAY['afericoes', 'tanques', 'croqui', 'agenda'], 1),
  ('profissional', 'Profissional', 'Tudo do Essencial, mais auditorias, mapa de risco e inventários.', NULL, 30,
    ARRAY['afericoes', 'tanques', 'croqui', 'agenda', 'auditoria', 'riscos', 'inventarios'], 2),
  ('empresarial', 'Empresarial', 'Todos os módulos, inclusive Tempos e Movimentos e Coleta, para redes grandes.', NULL, 100,
    ARRAY['afericoes', 'tanques', 'croqui', 'agenda', 'auditoria', 'riscos', 'inventarios', 'tempos', 'coleta'], 3)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.empresas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  documento text NOT NULL DEFAULT '',   -- CNPJ
  telefone text NOT NULL DEFAULT '',
  plano_id text NOT NULL REFERENCES public.planos (id),
  limite_contas integer NOT NULL CHECK (limite_contas > 0),
  modulos text[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'aguardando' CHECK (status IN ('aguardando', 'ativa', 'suspensa')),
  criado_por uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
DROP TRIGGER IF EXISTS empresas_touch ON public.empresas;
CREATE TRIGGER empresas_touch BEFORE INSERT OR UPDATE ON public.empresas FOR EACH ROW EXECUTE FUNCTION private.touch_updated_at();

-- Primeira empresa: a Rede Nevoeiro, com todos os módulos (os dados atuais são dela).
INSERT INTO public.empresas (id, nome, plano_id, limite_contas, modulos, status)
VALUES ('0e7e0e10-0000-4000-8000-000000000001', 'Rede Nevoeiro', 'empresarial',
  GREATEST(100, (SELECT count(*)::int + 10 FROM public.profiles)),
  ARRAY['afericoes', 'tanques', 'croqui', 'agenda', 'auditoria', 'riscos', 'inventarios', 'tempos', 'coleta'], 'ativa')
ON CONFLICT (id) DO NOTHING;

-- =====================================================================
-- 2. Conta → empresa
-- =====================================================================
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS empresa_id uuid REFERENCES public.empresas (id);
UPDATE public.profiles SET empresa_id = '0e7e0e10-0000-4000-8000-000000000001' WHERE empresa_id IS NULL;
CREATE INDEX IF NOT EXISTS profiles_empresa_idx ON public.profiles (empresa_id);

-- Empresa da conta logada, só se a empresa estiver ativa (empresa aguardando ou suspensa não vê nenhum dado).
CREATE OR REPLACE FUNCTION private.minha_empresa()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT p.empresa_id FROM public.profiles p JOIN public.empresas e ON e.id = p.empresa_id
  WHERE p.user_id = (SELECT auth.uid()) AND e.status = 'ativa';
$$;
REVOKE ALL ON FUNCTION private.minha_empresa() FROM PUBLIC, anon, authenticated, service_role;
-- service_role também: inserção do servidor sem empresa_id cai no NOT NULL (erro claro), não em "permissão negada".
GRANT EXECUTE ON FUNCTION private.minha_empresa() TO authenticated, service_role;

-- Dono da plataforma EasyAudit (vê e administra todas as empresas pelo painel do dono).
CREATE OR REPLACE FUNCTION private.dono_plataforma()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM auth.users u
    WHERE u.id = (SELECT auth.uid()) AND lower(u.email) = 'mauriciotestesdev@gmail.com' AND u.email_confirmed_at IS NOT NULL
  );
$$;
REVOKE ALL ON FUNCTION private.dono_plataforma() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.dono_plataforma() TO authenticated;

-- Módulo liberado = o plano da empresa tem o módulo E a conta tem o módulo (administrador da empresa: todos os do plano).
CREATE OR REPLACE FUNCTION private.tem_modulo(modulo text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p JOIN public.empresas e ON e.id = p.empresa_id
    WHERE p.user_id = (SELECT auth.uid()) AND e.status = 'ativa' AND modulo = ANY (e.modulos)
      AND ((SELECT private.is_nevoeiro_admin()) OR (p.ativo AND modulo = ANY (p.modulos)))
  );
$$;

-- A conta não troca de empresa sozinha (só o servidor, pelos convites e pelo painel do dono).
CREATE OR REPLACE FUNCTION private.proteger_empresa_do_perfil()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.empresa_id IS DISTINCT FROM OLD.empresa_id AND (SELECT auth.uid()) IS NOT NULL THEN
    RAISE EXCEPTION 'A empresa da conta só muda por convite.' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS profiles_protege_empresa ON public.profiles;
CREATE TRIGGER profiles_protege_empresa BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION private.proteger_empresa_do_perfil();

-- Limite de contas do plano: contas ativas da empresa não passam do limite (vale também para o servidor).
CREATE OR REPLACE FUNCTION private.limite_de_contas()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  limite integer;
  usadas integer;
BEGIN
  IF NOT NEW.ativo OR NEW.empresa_id IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.ativo AND OLD.empresa_id IS NOT DISTINCT FROM NEW.empresa_id THEN RETURN NEW; END IF;
  SELECT e.limite_contas INTO limite FROM public.empresas e WHERE e.id = NEW.empresa_id;
  SELECT count(*) INTO usadas FROM public.profiles p WHERE p.empresa_id = NEW.empresa_id AND p.ativo AND p.user_id <> NEW.user_id;
  IF usadas >= limite THEN
    RAISE EXCEPTION 'Limite de contas do plano atingido (% de %).', usadas, limite USING ERRCODE = 'P0001', HINT = 'limite_contas';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS profiles_limite_contas ON public.profiles;
CREATE TRIGGER profiles_limite_contas BEFORE INSERT OR UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION private.limite_de_contas();

-- Perfis: cada conta vê a si mesma e (administrador) as contas da própria empresa.
DROP POLICY IF EXISTS "Perfis da empresa" ON public.profiles;
CREATE POLICY "Perfis da empresa" ON public.profiles AS RESTRICTIVE FOR ALL TO authenticated
  USING (user_id = (SELECT auth.uid()) OR empresa_id = (SELECT private.minha_empresa()))
  WITH CHECK (user_id = (SELECT auth.uid()) OR empresa_id = (SELECT private.minha_empresa()));

-- =====================================================================
-- 3. Empresas e planos: quem lê
-- =====================================================================
ALTER TABLE public.empresas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Empresa le a propria" ON public.empresas;
CREATE POLICY "Empresa le a propria" ON public.empresas FOR SELECT TO authenticated
  USING (id = (SELECT p.empresa_id FROM public.profiles p WHERE p.user_id = (SELECT auth.uid())) OR (SELECT private.dono_plataforma()));

ALTER TABLE public.planos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Planos publicos" ON public.planos;
CREATE POLICY "Planos publicos" ON public.planos FOR SELECT TO anon, authenticated USING (ativo OR (SELECT private.dono_plataforma()));
GRANT SELECT ON public.planos TO anon, authenticated;
GRANT SELECT ON public.empresas TO authenticated;
-- Gravação de empresas e planos: só pelo servidor (cadastro da empresa, convites e painel do dono).

-- =====================================================================
-- 4. Dados de cada empresa
-- =====================================================================
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'agenda_eventos', 'app_config', 'aud_auditorias', 'aud_modelos', 'ce_barras', 'ce_bases', 'ce_classes', 'ce_coletas',
    'ce_contagens', 'ce_inventarios', 'ce_produtos', 'filiais', 'filial_docs', 'inv_categorias', 'inv_inventarios',
    'rm_atividades', 'rm_pontuacoes', 'rm_unidades', 'rm_visitas', 'service_records', 'tm_analises_ia', 'tm_atendimentos',
    'tm_coletas', 'tm_filiais_status', 'tm_plano', 'tq_medicoes', 'tq_tabelas', 'tq_tanques'
  ] LOOP
    -- Valor fixo na criação da coluna: as linhas atuais ficam com a Rede Nevoeiro sem reescrever a tabela
    -- (e sem mexer em updated_at, então os aparelhos não baixam tudo de novo).
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS empresa_id uuid NOT NULL DEFAULT %L REFERENCES public.empresas (id)', t, '0e7e0e10-0000-4000-8000-000000000001');
    -- Daqui em diante, a empresa de quem grava.
    EXECUTE format('ALTER TABLE public.%I ALTER COLUMN empresa_id SET DEFAULT private.minha_empresa()', t);
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I (empresa_id)', t || '_empresa_idx', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS "Empresa isolada" ON public.%I', t);
    EXECUTE format('CREATE POLICY "Empresa isolada" ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING (empresa_id = (SELECT private.minha_empresa())) WITH CHECK (empresa_id = (SELECT private.minha_empresa()))', t);
  END LOOP;
END $$;

-- Chaves que eram únicas no sistema todo passam a ser únicas por empresa
-- (configurações com nome fixo, base de códigos de barra "da rede" e código da filial).
ALTER TABLE public.app_config DROP CONSTRAINT IF EXISTS app_config_pkey;
ALTER TABLE public.app_config ADD PRIMARY KEY (empresa_id, id);
ALTER TABLE public.ce_bases DROP CONSTRAINT IF EXISTS ce_bases_pkey;
ALTER TABLE public.ce_bases ADD PRIMARY KEY (empresa_id, id);
ALTER TABLE public.ce_barras DROP CONSTRAINT IF EXISTS ce_barras_pkey;
ALTER TABLE public.ce_barras ADD PRIMARY KEY (empresa_id, filial_id, codigo);
DROP INDEX IF EXISTS public.filiais_codigo_ativo_idx;
CREATE UNIQUE INDEX IF NOT EXISTS filiais_codigo_ativo_idx ON public.filiais (empresa_id, lower(codigo)) WHERE deleted_at IS NULL;

-- =====================================================================
-- 5. Conferência (se algo não ficou como esperado, a migração inteira é desfeita)
-- =====================================================================
DO $$
DECLARE faltando text;
BEGIN
  SELECT string_agg(c.relname, ', ') INTO faltando
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind = 'r'
    AND c.relname = ANY (ARRAY['agenda_eventos', 'app_config', 'filiais', 'service_records', 'tq_tanques', 'ce_barras'])
    AND NOT EXISTS (SELECT 1 FROM pg_policies p WHERE p.schemaname = 'public' AND p.tablename = c.relname AND p.policyname = 'Empresa isolada' AND p.permissive = 'RESTRICTIVE');
  IF faltando IS NOT NULL THEN RAISE EXCEPTION 'Regra de empresa ausente em: %', faltando; END IF;
  IF EXISTS (SELECT 1 FROM public.profiles WHERE empresa_id IS NULL) THEN RAISE EXCEPTION 'Há perfis sem empresa.'; END IF;
END $$;
