-- Plataforma de módulos: usuários com papel, cadastro único de filiais, Tempos e Movimentos e Croqui.
-- Esta migração só ACRESCENTA estruturas e COPIA dados. Nada existente é apagado.

-- =====================================================================
-- 1. Funções utilitárias
-- =====================================================================
CREATE OR REPLACE FUNCTION private.touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  NEW.updated_at := now();   -- horário do servidor: base da sincronização incremental
  RETURN NEW;
END;
$$;

-- =====================================================================
-- 2. Perfis e papéis (administrador / usuário)
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.profiles (
  user_id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  email text NOT NULL,
  nome text NOT NULL DEFAULT '',
  papel text NOT NULL DEFAULT 'usuario' CHECK (papel IN ('admin', 'usuario')),
  ativo boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Administrador inicial: mantém a regra anterior pelo e-mail confirmado.
CREATE OR REPLACE FUNCTION private.is_nevoeiro_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = (SELECT auth.uid()) AND p.ativo AND p.papel = 'admin'
  ) OR EXISTS (
    SELECT 1 FROM auth.users u
    WHERE u.id = (SELECT auth.uid())
      AND lower(u.email) = 'mauriciotestesdev@gmail.com'
      AND u.email_confirmed_at IS NOT NULL
  );
$$;

-- Qualquer usuário liberado (ativo) pelo administrador.
CREATE OR REPLACE FUNCTION private.tem_acesso()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT (SELECT private.is_nevoeiro_admin()) OR EXISTS (
    SELECT 1 FROM public.profiles p WHERE p.user_id = (SELECT auth.uid()) AND p.ativo
  );
$$;

REVOKE ALL ON FUNCTION private.tem_acesso() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.tem_acesso() TO authenticated;
REVOKE ALL ON FUNCTION private.is_nevoeiro_admin() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.is_nevoeiro_admin() TO authenticated;

-- Toda conta nova ganha um perfil inativo, que o administrador libera.
CREATE OR REPLACE FUNCTION private.criar_perfil()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  INSERT INTO public.profiles (user_id, email, papel, ativo)
  VALUES (
    NEW.id, coalesce(NEW.email, ''),
    CASE WHEN lower(NEW.email) = 'mauriciotestesdev@gmail.com' THEN 'admin' ELSE 'usuario' END,
    lower(NEW.email) = 'mauriciotestesdev@gmail.com'
  )
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_nevoeiro ON auth.users;
CREATE TRIGGER on_auth_user_created_nevoeiro
  AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION private.criar_perfil();

-- Perfis para as contas que já existem.
INSERT INTO public.profiles (user_id, email, papel, ativo)
SELECT u.id, coalesce(u.email, ''),
       CASE WHEN lower(u.email) = 'mauriciotestesdev@gmail.com' THEN 'admin' ELSE 'usuario' END,
       lower(u.email) = 'mauriciotestesdev@gmail.com'
FROM auth.users u
ON CONFLICT (user_id) DO NOTHING;

DROP TRIGGER IF EXISTS profiles_touch ON public.profiles;
CREATE TRIGGER profiles_touch BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION private.touch_updated_at();

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Perfil próprio ou admin lê" ON public.profiles;
CREATE POLICY "Perfil próprio ou admin lê" ON public.profiles FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()) OR (SELECT private.is_nevoeiro_admin()));
DROP POLICY IF EXISTS "Admin altera perfis" ON public.profiles;
CREATE POLICY "Admin altera perfis" ON public.profiles FOR UPDATE TO authenticated
  USING ((SELECT private.is_nevoeiro_admin())) WITH CHECK ((SELECT private.is_nevoeiro_admin()));

-- =====================================================================
-- 3. Cadastro único de filiais
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.filiais (
  id text PRIMARY KEY,
  codigo text NOT NULL,
  nome text NOT NULL,
  cidade text NOT NULL DEFAULT '',
  uf text NOT NULL DEFAULT 'RS',
  bandeira text NOT NULL DEFAULT 'branca',
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS filiais_codigo_ativo_idx ON public.filiais (lower(codigo)) WHERE deleted_at IS NULL;

-- Documentos que pertencem a uma filial: equipamentos (bombas e bicos), croqui, dimensionamento.
CREATE TABLE IF NOT EXISTS public.filial_docs (
  id text PRIMARY KEY,                      -- '<filial_id>:<tipo>'
  filial_id text NOT NULL REFERENCES public.filiais (id),
  tipo text NOT NULL CHECK (tipo IN ('equipamentos', 'croqui', 'dimensionamento')),
  payload jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  UNIQUE (filial_id, tipo)
);

-- =====================================================================
-- 4. Tempos e Movimentos
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.tm_coletas (
  id text PRIMARY KEY,
  filial_id text NOT NULL REFERENCES public.filiais (id),
  data date NOT NULL,
  setor text NOT NULL,
  funcao text NOT NULL DEFAULT '',
  turno text NOT NULL DEFAULT '',
  demanda text NOT NULL DEFAULT '',
  auditor text NOT NULL DEFAULT '',
  criado_por uuid DEFAULT auth.uid(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
CREATE INDEX IF NOT EXISTS tm_coletas_filial_data_idx ON public.tm_coletas (filial_id, data);

-- Um atendimento (completo ou atividade individual) com as etapas em JSON:
-- etapas = [{ordem, atividade_id, inicio, fim, duracao_s, pausas: [[inicio, fim], ...]}]
CREATE TABLE IF NOT EXISTS public.tm_atendimentos (
  id text PRIMARY KEY,
  coleta_id text NOT NULL REFERENCES public.tm_coletas (id),
  tipo text NOT NULL CHECK (tipo IN ('completo', 'isolada')),
  funcionario text NOT NULL DEFAULT '',
  inicio timestamptz,
  fim timestamptz,
  duracao_s numeric(10, 1) NOT NULL DEFAULT 0,
  etapas jsonb NOT NULL DEFAULT '[]'::jsonb,
  volume numeric,
  deslocamentos integer,
  obs text NOT NULL DEFAULT '',
  origem text NOT NULL DEFAULT 'app' CHECK (origem IN ('app', 'importado')),
  criado_por uuid DEFAULT auth.uid(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
CREATE INDEX IF NOT EXISTS tm_atendimentos_coleta_idx ON public.tm_atendimentos (coleta_id);

CREATE TABLE IF NOT EXISTS public.tm_plano (
  id text PRIMARY KEY,
  filial_id text REFERENCES public.filiais (id),
  problema text NOT NULL,
  causa text NOT NULL DEFAULT '',
  acao text NOT NULL DEFAULT '',
  responsavel text NOT NULL DEFAULT '',
  prazo date,
  indicador text NOT NULL DEFAULT '',
  beneficio_h numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'Aberto' CHECK (status IN ('Aberto', 'Em andamento', 'Concluído')),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

-- Configurações globais em JSON (catálogo de atividades, parâmetros do tempo padrão).
CREATE TABLE IF NOT EXISTS public.app_config (
  id text PRIMARY KEY,
  valor jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

-- =====================================================================
-- 5. updated_at sempre pelo relógio do servidor
-- =====================================================================
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['filiais', 'filial_docs', 'tm_coletas', 'tm_atendimentos', 'tm_plano', 'app_config', 'service_records'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', t || '_touch', t);
    EXECUTE format('CREATE TRIGGER %I BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION private.touch_updated_at()', t || '_touch', t);
  END LOOP;
END
$$;

-- Leitura incremental (updated_at > último visto) nas tabelas que crescem.
CREATE INDEX IF NOT EXISTS tm_atendimentos_updated_idx ON public.tm_atendimentos (updated_at);
CREATE INDEX IF NOT EXISTS service_records_updated_idx ON public.service_records (updated_at);

-- =====================================================================
-- 6. Regras de acesso (RLS)
--    Leitura: usuários liberados. Escrita de cadastros mestres: administrador.
--    Escrita de coletas, atendimentos, documentos da filial e aferições: usuários liberados.
-- =====================================================================
ALTER TABLE public.filiais ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.filial_docs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tm_coletas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tm_atendimentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tm_plano ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_config ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t text;
BEGIN
  -- Todas: leitura para usuários liberados.
  FOREACH t IN ARRAY ARRAY['filiais', 'filial_docs', 'tm_coletas', 'tm_atendimentos', 'tm_plano', 'app_config'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Usuarios liberados leem" ON public.%I', t);
    EXECUTE format('CREATE POLICY "Usuarios liberados leem" ON public.%I FOR SELECT TO authenticated USING ((SELECT private.tem_acesso()))', t);
  END LOOP;
  -- Cadastros mestres: escrita só do administrador.
  FOREACH t IN ARRAY ARRAY['filiais', 'app_config'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Admin escreve" ON public.%I', t);
    EXECUTE format('CREATE POLICY "Admin escreve" ON public.%I FOR ALL TO authenticated USING ((SELECT private.is_nevoeiro_admin())) WITH CHECK ((SELECT private.is_nevoeiro_admin()))', t);
  END LOOP;
  -- Dados operacionais: escrita de usuários liberados (exclusão é lógica, via deleted_at).
  FOREACH t IN ARRAY ARRAY['filial_docs', 'tm_coletas', 'tm_atendimentos', 'tm_plano'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Usuarios liberados inserem" ON public.%I', t);
    EXECUTE format('CREATE POLICY "Usuarios liberados inserem" ON public.%I FOR INSERT TO authenticated WITH CHECK ((SELECT private.tem_acesso()))', t);
    EXECUTE format('DROP POLICY IF EXISTS "Usuarios liberados alteram" ON public.%I', t);
    EXECUTE format('CREATE POLICY "Usuarios liberados alteram" ON public.%I FOR UPDATE TO authenticated USING ((SELECT private.tem_acesso())) WITH CHECK ((SELECT private.tem_acesso()))', t);
  END LOOP;
END
$$;

-- Aferições: passa de "só o administrador" para "usuários liberados".
DROP POLICY IF EXISTS "Nevoeiro admin can read service records" ON public.service_records;
DROP POLICY IF EXISTS "Nevoeiro admin can create service records" ON public.service_records;
DROP POLICY IF EXISTS "Nevoeiro admin can update service records" ON public.service_records;
DROP POLICY IF EXISTS "Nevoeiro admin can delete service records" ON public.service_records;
CREATE POLICY "Usuarios liberados leem aferições" ON public.service_records FOR SELECT TO authenticated USING ((SELECT private.tem_acesso()));
CREATE POLICY "Usuarios liberados inserem aferições" ON public.service_records FOR INSERT TO authenticated WITH CHECK ((SELECT private.tem_acesso()));
CREATE POLICY "Usuarios liberados alteram aferições" ON public.service_records FOR UPDATE TO authenticated USING ((SELECT private.tem_acesso())) WITH CHECK ((SELECT private.tem_acesso()));
CREATE POLICY "Admin exclui aferições" ON public.service_records FOR DELETE TO authenticated USING ((SELECT private.is_nevoeiro_admin()));

-- =====================================================================
-- 7. Cópia dos dados existentes (sem apagar a origem)
-- =====================================================================
-- Filiais do Aferições -> cadastro único, mantendo o mesmo ID.
INSERT INTO public.filiais (id, codigo, nome, cidade, uf)
SELECT r.payload->'value'->>'id',
       coalesce(r.payload->'value'->>'code', ''),
       coalesce(r.payload->'value'->>'name', ''),
       coalesce(r.payload->'value'->>'city', ''),
       coalesce(nullif(r.payload->'value'->>'state', ''), 'RS')
FROM public.service_records r
WHERE r.payload->>'kind' = 'branch' AND r.payload->'value'->>'id' IS NOT NULL
ON CONFLICT (id) DO NOTHING;

-- Bombas e bicos -> documento "equipamentos" da filial.
INSERT INTO public.filial_docs (id, filial_id, tipo, payload)
SELECT (r.payload->'value'->>'id') || ':equipamentos',
       r.payload->'value'->>'id',
       'equipamentos',
       jsonb_build_object('pumps', coalesce(r.payload->'value'->'pumps', '[]'::jsonb))
FROM public.service_records r
WHERE r.payload->>'kind' = 'branch' AND r.payload->'value'->>'id' IS NOT NULL
ON CONFLICT (id) DO NOTHING;
