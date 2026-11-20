-- Rastreabilidade: tudo o que cada conta faz no sistema fica registrado (quem, quando, onde, o que mudou).
-- Só o dono da plataforma lê o registro. Os auditores veem apenas quem abriu o inventário e quem criou cada
-- contagem (colunas criado_por_nome/criado_em nas próprias tabelas).

-- =====================================================================
-- 1. Registro
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.auditoria_log (
  id bigserial PRIMARY KEY,
  criado_em timestamptz NOT NULL DEFAULT now(),
  empresa_id uuid,
  user_id uuid,
  usuario_nome text,
  usuario_email text,
  tabela text NOT NULL,           -- tabela alterada, ou 'funcao:<nome>' para ações feitas pelo servidor
  registro_id text,
  acao text NOT NULL,             -- criou, alterou, excluiu, restaurou, apagou ou a ação da função
  alvo text,                      -- identificação legível (código, nome, título)
  filial text,                    -- "01 · Unidade Centro"
  mudancas jsonb,                 -- { campo: { de, para } } (alterações) ou detalhes da ação
  origem text NOT NULL DEFAULT 'app' -- app (a própria conta) ou servidor (funções)
);
CREATE INDEX IF NOT EXISTS auditoria_log_data_idx ON public.auditoria_log (criado_em DESC);
CREATE INDEX IF NOT EXISTS auditoria_log_empresa_idx ON public.auditoria_log (empresa_id, criado_em DESC);
CREATE INDEX IF NOT EXISTS auditoria_log_usuario_idx ON public.auditoria_log (user_id, criado_em DESC);
ALTER TABLE public.auditoria_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.auditoria_log FROM anon, authenticated;
GRANT SELECT ON public.auditoria_log TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.auditoria_log_id_seq TO service_role;
DROP POLICY IF EXISTS "So o dono le" ON public.auditoria_log;
CREATE POLICY "So o dono le" ON public.auditoria_log FOR SELECT TO authenticated USING ((SELECT private.dono_plataforma()));

-- =====================================================================
-- 2. Gatilho genérico (depois de cada inserção, alteração e exclusão)
-- =====================================================================
CREATE OR REPLACE FUNCTION private.registrar_auditoria()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  novo jsonb := CASE WHEN TG_OP <> 'DELETE' THEN to_jsonb(NEW) END;
  velho jsonb := CASE WHEN TG_OP <> 'INSERT' THEN to_jsonb(OLD) END;
  base jsonb := coalesce(to_jsonb(NEW), to_jsonb(OLD));
  uid uuid := (SELECT auth.uid());
  acao text;
  mud jsonb := '{}'::jsonb;
  k text;
  fil text;
  fil_rotulo text;
  nome text;
  email text;
  emp uuid;
  -- Valores grandes (fotos, desenhos, listas) não vão inteiros para o registro.
  curto jsonb;
BEGIN
  IF TG_OP = 'INSERT' THEN
    acao := 'criou';
  ELSIF TG_OP = 'DELETE' THEN
    acao := 'apagou';
  ELSE
    IF (velho->>'deleted_at') IS NULL AND (novo->>'deleted_at') IS NOT NULL THEN acao := 'excluiu';
    ELSIF (velho->>'deleted_at') IS NOT NULL AND (novo->>'deleted_at') IS NULL THEN acao := 'restaurou';
    ELSE acao := 'alterou';
    END IF;
    FOR k IN SELECT jsonb_object_keys(novo) LOOP
      CONTINUE WHEN k IN ('updated_at', 'empresa_id', 'deleted_at');
      IF (novo->k) IS DISTINCT FROM (velho->k) THEN
        mud := mud || jsonb_build_object(k, jsonb_build_object(
          'de', CASE WHEN k = 'avatar' THEN to_jsonb('(foto)'::text) WHEN length(coalesce((velho->k)::text, '')) > 240 THEN to_jsonb('(conteúdo longo)'::text) ELSE velho->k END,
          'para', CASE WHEN k = 'avatar' THEN to_jsonb('(foto)'::text) WHEN length(coalesce((novo->k)::text, '')) > 240 THEN to_jsonb('(conteúdo longo)'::text) ELSE novo->k END));
      END IF;
    END LOOP;
    -- Regravação sem mudança (sincronização reenviando o mesmo dado): não registra.
    IF acao = 'alterou' AND mud = '{}'::jsonb THEN RETURN NULL; END IF;
  END IF;

  emp := coalesce(nullif(base->>'empresa_id', '')::uuid, CASE WHEN TG_TABLE_NAME = 'empresas' THEN (base->>'id')::uuid END);
  fil := coalesce(base->>'filial_id', CASE WHEN TG_TABLE_NAME = 'filiais' THEN base->>'id' END);
  IF fil IS NOT NULL THEN SELECT f.codigo || ' · ' || f.nome INTO fil_rotulo FROM public.filiais f WHERE f.id = fil; END IF;
  IF uid IS NOT NULL THEN SELECT p.nome, p.email INTO nome, email FROM public.profiles p WHERE p.user_id = uid; END IF;

  INSERT INTO public.auditoria_log (empresa_id, user_id, usuario_nome, usuario_email, tabela, registro_id, acao, alvo, filial, mudancas, origem)
  VALUES (
    emp, uid, nome, email, TG_TABLE_NAME,
    coalesce(base->>'id', base->>'user_id'),
    acao,
    left(coalesce(base->>'codigo', base->>'nome', base->>'titulo', base->>'email', base->>'numero', base->>'tipo'), 160),
    coalesce(fil_rotulo, fil),
    CASE WHEN mud = '{}'::jsonb THEN NULL ELSE mud END,
    CASE WHEN uid IS NULL THEN 'servidor' ELSE 'app' END
  );
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION private.registrar_auditoria() FROM PUBLIC, anon, authenticated;

-- Tabelas acompanhadas: todos os dados das empresas, contas e filiais. Ficam de fora as cópias em massa
-- (produtos carregados do ERP e a base de códigos de barra), que são registradas como uma ação só pelo servidor.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'agenda_eventos', 'app_config', 'aud_auditorias', 'aud_modelos', 'ce_bases', 'ce_classes', 'ce_coletas',
    'ce_contagens', 'ce_inventarios', 'filiais', 'filial_docs', 'inv_categorias', 'inv_inventarios',
    'rm_atividades', 'rm_pontuacoes', 'rm_unidades', 'rm_visitas', 'service_records', 'tm_analises_ia', 'tm_atendimentos',
    'tm_coletas', 'tm_filiais_status', 'tm_plano', 'tq_medicoes', 'tq_tabelas', 'tq_tanques', 'profiles', 'empresas', 'planos'
  ] LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', t || '_auditoria', t);
      EXECUTE format('CREATE TRIGGER %I AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION private.registrar_auditoria()', t || '_auditoria', t);
    END IF;
  END LOOP;
END $$;

-- =====================================================================
-- 3. Quem abriu o inventário e quem criou a contagem (visível para os auditores)
-- =====================================================================
ALTER TABLE public.ce_inventarios ADD COLUMN IF NOT EXISTS criado_por_nome text;
ALTER TABLE public.ce_inventarios ADD COLUMN IF NOT EXISTS criado_em timestamptz;
ALTER TABLE public.ce_contagens ADD COLUMN IF NOT EXISTS criado_por_nome text;
ALTER TABLE public.ce_contagens ADD COLUMN IF NOT EXISTS criado_em timestamptz;

CREATE OR REPLACE FUNCTION private.marcar_criador()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE uid uuid := (SELECT auth.uid());
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF uid IS NOT NULL THEN
      NEW.criado_por := uid;
      SELECT coalesce(nullif(p.nome, ''), p.email) INTO NEW.criado_por_nome FROM public.profiles p WHERE p.user_id = uid;
    END IF;
    NEW.criado_em := coalesce(NEW.criado_em, now());
  ELSE
    -- Quem abriu não muda depois.
    NEW.criado_por := OLD.criado_por;
    NEW.criado_por_nome := OLD.criado_por_nome;
    NEW.criado_em := OLD.criado_em;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.marcar_criador() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS ce_inventarios_criador ON public.ce_inventarios;
CREATE TRIGGER ce_inventarios_criador BEFORE INSERT OR UPDATE ON public.ce_inventarios FOR EACH ROW EXECUTE FUNCTION private.marcar_criador();
DROP TRIGGER IF EXISTS ce_contagens_criador ON public.ce_contagens;
CREATE TRIGGER ce_contagens_criador BEFORE INSERT OR UPDATE ON public.ce_contagens FOR EACH ROW EXECUTE FUNCTION private.marcar_criador();

-- Inventários e contagens que já existiam: nome de quem abriu (data desconhecida fica em branco).
-- Sem mexer em updated_at (os aparelhos não baixam tudo de novo) e sem disparar o registro.
ALTER TABLE public.ce_inventarios DISABLE TRIGGER ce_inventarios_auditoria;
ALTER TABLE public.ce_contagens DISABLE TRIGGER ce_contagens_auditoria;
ALTER TABLE public.ce_inventarios DISABLE TRIGGER ce_inventarios_touch;
ALTER TABLE public.ce_contagens DISABLE TRIGGER ce_contagens_touch;
ALTER TABLE public.ce_inventarios DISABLE TRIGGER ce_inventarios_criador;
ALTER TABLE public.ce_contagens DISABLE TRIGGER ce_contagens_criador;
UPDATE public.ce_inventarios i SET criado_por_nome = coalesce(nullif(p.nome, ''), p.email) FROM public.profiles p WHERE p.user_id = i.criado_por AND i.criado_por_nome IS NULL;
UPDATE public.ce_contagens c SET criado_por_nome = coalesce(nullif(p.nome, ''), p.email) FROM public.profiles p WHERE p.user_id = c.criado_por AND c.criado_por_nome IS NULL;
ALTER TABLE public.ce_inventarios ENABLE TRIGGER ce_inventarios_auditoria;
ALTER TABLE public.ce_contagens ENABLE TRIGGER ce_contagens_auditoria;
ALTER TABLE public.ce_inventarios ENABLE TRIGGER ce_inventarios_touch;
ALTER TABLE public.ce_contagens ENABLE TRIGGER ce_contagens_touch;
ALTER TABLE public.ce_inventarios ENABLE TRIGGER ce_inventarios_criador;
ALTER TABLE public.ce_contagens ENABLE TRIGGER ce_contagens_criador;
