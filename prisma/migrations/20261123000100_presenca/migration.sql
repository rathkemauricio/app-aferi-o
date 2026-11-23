-- Quem está online (23/11/2026).
--
-- 1. Presença: cada conta logada avisa a cada ~30 s em que tela está e o que está coletando (qualquer módulo:
--    contagem, aferição, medição de tanques, auditoria, cronometragem…). Uma linha por conta (sem histórico).
--    Lê: o administrador da rede (só as contas da rede dele) e o dono da plataforma (todas as redes).
--    Grava: só pela função marcar_presenca (a conta grava a própria linha, na própria rede).
-- 2. Visita do dono da plataforma: o dono entra numa rede "como auditor" para acompanhar o trabalho.
--    profiles.visitando = rede visitada (gravado só pelo servidor, função empresas). Enquanto visita,
--    private.minha_empresa() devolve a rede visitada e TODA gravação é barrada (visita só leitura): regras
--    restritivas de inserir/alterar/apagar em todas as tabelas com empresa_id e nos arquivos (Storage).

-- 2 (antes, porque minha_empresa é usada pela presença) ----------------------------------------------------
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS visitando uuid; -- sem chave estrangeira: uma 2ª ligação profiles→empresas quebraria o "empresas(...)" das versões antigas do app

-- Dono da plataforma visitando outra rede agora.
CREATE OR REPLACE FUNCTION private.em_visita()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id = (SELECT auth.uid()) AND p.visitando IS NOT NULL)
     AND (SELECT private.dono_plataforma());
$$;
REVOKE ALL ON FUNCTION private.em_visita() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.em_visita() TO authenticated;

-- Empresa em uso: a visitada (dono em visita) ou a da conta. Só empresa ATIVA.
CREATE OR REPLACE FUNCTION private.minha_empresa()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT e.id FROM public.profiles p
    JOIN public.empresas e ON e.id = CASE WHEN p.visitando IS NOT NULL AND (SELECT private.dono_plataforma()) THEN p.visitando ELSE p.empresa_id END
  WHERE p.user_id = (SELECT auth.uid()) AND e.status = 'ativa';
$$;

-- Módulos pela empresa em uso (a visitada, na visita do dono).
CREATE OR REPLACE FUNCTION private.tem_modulo(modulo text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p JOIN public.empresas e ON e.id = (SELECT private.minha_empresa())
    WHERE p.user_id = (SELECT auth.uid()) AND modulo = ANY (e.modulos)
      AND (p.filial_id IS NULL OR (p.ativo AND modulo = 'coleta'))
      AND ((SELECT private.is_nevoeiro_admin()) OR (p.ativo AND modulo = ANY (p.modulos)))
  );
$$;

-- Visita só leitura: barra gravação em todas as tabelas da rede.
DO $$
DECLARE t text;
BEGIN
  FOR t IN
    SELECT c.table_name FROM information_schema.columns c JOIN information_schema.tables x USING (table_schema, table_name)
    WHERE c.table_schema = 'public' AND c.column_name = 'empresa_id' AND x.table_type = 'BASE TABLE'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Visita so leitura (inserir)" ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS "Visita so leitura (alterar)" ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS "Visita so leitura (apagar)" ON public.%I', t);
    EXECUTE format('CREATE POLICY "Visita so leitura (inserir)" ON public.%I AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (NOT (SELECT private.em_visita()))', t);
    EXECUTE format('CREATE POLICY "Visita so leitura (alterar)" ON public.%I AS RESTRICTIVE FOR UPDATE TO authenticated USING (NOT (SELECT private.em_visita()))', t);
    EXECUTE format('CREATE POLICY "Visita so leitura (apagar)" ON public.%I AS RESTRICTIVE FOR DELETE TO authenticated USING (NOT (SELECT private.em_visita()))', t);
  END LOOP;
END $$;
DROP POLICY IF EXISTS "Visita so leitura (inserir)" ON storage.objects;
DROP POLICY IF EXISTS "Visita so leitura (alterar)" ON storage.objects;
DROP POLICY IF EXISTS "Visita so leitura (apagar)" ON storage.objects;
CREATE POLICY "Visita so leitura (inserir)" ON storage.objects AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (NOT (SELECT private.em_visita()));
CREATE POLICY "Visita so leitura (alterar)" ON storage.objects AS RESTRICTIVE FOR UPDATE TO authenticated USING (NOT (SELECT private.em_visita()));
CREATE POLICY "Visita so leitura (apagar)" ON storage.objects AS RESTRICTIVE FOR DELETE TO authenticated USING (NOT (SELECT private.em_visita()));

-- 1 ---------------------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.presenca (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  empresa_id uuid REFERENCES public.empresas(id) ON DELETE CASCADE,
  filial_id text,
  nome text NOT NULL DEFAULT '',
  email text NOT NULL DEFAULT '',
  papel text NOT NULL DEFAULT 'usuario',
  -- Rota aberta (ex.: /coleta) e o que está coletando agora (módulo, título, filial, andamento, link para acompanhar).
  tela text NOT NULL DEFAULT '',
  atividade jsonb,
  plataforma text NOT NULL DEFAULT '',
  -- Rede que o dono está visitando (só aparece para o dono).
  visitando uuid,
  desde timestamptz NOT NULL DEFAULT now(),
  visto_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS presenca_empresa_visto ON public.presenca (empresa_id, visto_em DESC);
ALTER TABLE public.presenca ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.presenca FROM anon, authenticated;
GRANT SELECT ON public.presenca TO authenticated;
DROP POLICY IF EXISTS "Presenca: admin da rede e dono" ON public.presenca;
CREATE POLICY "Presenca: admin da rede e dono" ON public.presenca FOR SELECT TO authenticated USING (
  user_id = (SELECT auth.uid())
  OR (SELECT private.dono_plataforma())
  OR (
    empresa_id = (SELECT private.minha_empresa()) AND (SELECT private.minha_filial()) IS NULL
    AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id = (SELECT auth.uid()) AND p.ativo AND p.papel = 'admin')
  )
);

-- A conta avisa que está online (e o que está fazendo). Sempre na própria rede (nunca na visitada).
CREATE OR REPLACE FUNCTION public.marcar_presenca(p_tela text, p_atividade jsonb, p_plataforma text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  uid uuid := (SELECT auth.uid());
  pr public.profiles%ROWTYPE;
  ativ jsonb := CASE WHEN jsonb_typeof(p_atividade) = 'object' AND octet_length(p_atividade::text) <= 6000 THEN p_atividade END;
BEGIN
  IF uid IS NULL THEN RETURN; END IF;
  SELECT * INTO pr FROM public.profiles WHERE user_id = uid;
  IF NOT FOUND OR NOT pr.ativo THEN RETURN; END IF;
  INSERT INTO public.presenca AS x (user_id, empresa_id, filial_id, nome, email, papel, tela, atividade, plataforma, visitando, desde, visto_em)
  VALUES (uid, pr.empresa_id, pr.filial_id, coalesce(pr.nome, ''), coalesce(pr.email, ''), pr.papel, left(coalesce(p_tela, ''), 200), ativ,
          left(coalesce(p_plataforma, ''), 40), CASE WHEN (SELECT private.dono_plataforma()) THEN pr.visitando END, now(), now())
  ON CONFLICT (user_id) DO UPDATE SET
    empresa_id = excluded.empresa_id, filial_id = excluded.filial_id, nome = excluded.nome, email = excluded.email, papel = excluded.papel,
    tela = excluded.tela, atividade = excluded.atividade, plataforma = excluded.plataforma, visitando = excluded.visitando,
    -- Nova sessão quando ficou mais de 5 min sem avisar.
    desde = CASE WHEN x.visto_em < now() - interval '5 minutes' THEN now() ELSE x.desde END,
    visto_em = now();
END;
$$;
-- Saiu da conta: some da lista na hora.
CREATE OR REPLACE FUNCTION public.sair_presenca()
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  UPDATE public.presenca SET visto_em = now() - interval '10 minutes', atividade = NULL, tela = '' WHERE user_id = (SELECT auth.uid());
$$;
REVOKE ALL ON FUNCTION public.marcar_presenca(text, jsonb, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.sair_presenca() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.marcar_presenca(text, jsonb, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sair_presenca() TO authenticated;
