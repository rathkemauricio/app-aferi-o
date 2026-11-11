-- Módulos liberados por conta. O administrador escolhe quais módulos cada conta usa (projeto piloto).
-- Administradores acessam todos os módulos. Contas novas começam sem nenhum módulo.

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS modulos text[] NOT NULL DEFAULT '{}';

-- Conta liberada com acesso ao módulo informado (ou administrador).
CREATE OR REPLACE FUNCTION private.tem_modulo(modulo text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT (SELECT private.is_nevoeiro_admin()) OR EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = (SELECT auth.uid()) AND p.ativo AND modulo = ANY (p.modulos)
  );
$$;
REVOKE ALL ON FUNCTION private.tem_modulo(text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.tem_modulo(text) TO authenticated;

-- Documento da filial pertence a um módulo: equipamentos (Aferições), croqui (Croqui), dimensionamento (Tempos).
CREATE OR REPLACE FUNCTION private.pode_doc(tipo text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT CASE tipo
    WHEN 'equipamentos' THEN (SELECT private.tem_modulo('afericoes'))
    WHEN 'croqui' THEN (SELECT private.tem_modulo('croqui'))
    WHEN 'dimensionamento' THEN (SELECT private.tem_modulo('tempos'))
    ELSE (SELECT private.is_nevoeiro_admin())
  END;
$$;
REVOKE ALL ON FUNCTION private.pode_doc(text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.pode_doc(text) TO authenticated;

-- ---------- Aferições (service_records) ----------
DROP POLICY IF EXISTS "Usuarios liberados leem aferições" ON public.service_records;
DROP POLICY IF EXISTS "Usuarios liberados inserem aferições" ON public.service_records;
DROP POLICY IF EXISTS "Usuarios liberados alteram aferições" ON public.service_records;
CREATE POLICY "Modulo afericoes le" ON public.service_records FOR SELECT TO authenticated USING ((SELECT private.tem_modulo('afericoes')));
CREATE POLICY "Modulo afericoes insere" ON public.service_records FOR INSERT TO authenticated WITH CHECK ((SELECT private.tem_modulo('afericoes')));
CREATE POLICY "Modulo afericoes altera" ON public.service_records FOR UPDATE TO authenticated USING ((SELECT private.tem_modulo('afericoes'))) WITH CHECK ((SELECT private.tem_modulo('afericoes')));

-- ---------- Tempos e Movimentos ----------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['tm_coletas', 'tm_atendimentos', 'tm_plano'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Usuarios liberados leem" ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS "Usuarios liberados inserem" ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS "Usuarios liberados alteram" ON public.%I', t);
    EXECUTE format('CREATE POLICY "Modulo tempos le" ON public.%I FOR SELECT TO authenticated USING ((SELECT private.tem_modulo(''tempos'')))', t);
    EXECUTE format('CREATE POLICY "Modulo tempos insere" ON public.%I FOR INSERT TO authenticated WITH CHECK ((SELECT private.tem_modulo(''tempos'')))', t);
    EXECUTE format('CREATE POLICY "Modulo tempos altera" ON public.%I FOR UPDATE TO authenticated USING ((SELECT private.tem_modulo(''tempos''))) WITH CHECK ((SELECT private.tem_modulo(''tempos'')))', t);
  END LOOP;
END
$$;

-- ---------- Documentos da filial: cada tipo segue o seu módulo ----------
DROP POLICY IF EXISTS "Usuarios liberados leem" ON public.filial_docs;
DROP POLICY IF EXISTS "Usuarios liberados inserem" ON public.filial_docs;
DROP POLICY IF EXISTS "Usuarios liberados alteram" ON public.filial_docs;
CREATE POLICY "Modulo do documento le" ON public.filial_docs FOR SELECT TO authenticated USING ((SELECT private.pode_doc(tipo)));
CREATE POLICY "Modulo do documento insere" ON public.filial_docs FOR INSERT TO authenticated WITH CHECK ((SELECT private.pode_doc(tipo)));
CREATE POLICY "Modulo do documento altera" ON public.filial_docs FOR UPDATE TO authenticated USING ((SELECT private.pode_doc(tipo))) WITH CHECK ((SELECT private.pode_doc(tipo)));

-- Filiais e configurações continuam legíveis por qualquer conta liberada (cadastro compartilhado).

-- =====================================================================
-- Perfil da própria conta: nome e foto (miniatura JPEG em data URL, ~10 KB)
-- =====================================================================
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS avatar text;
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_avatar_tamanho;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_avatar_tamanho CHECK (avatar IS NULL OR length(avatar) <= 60000);

-- Cada conta altera apenas o próprio nome e foto. Papel, liberação e módulos continuam só com o administrador.
CREATE OR REPLACE FUNCTION public.atualizar_meu_perfil(p_nome text, p_avatar text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'sem sessão'; END IF;
  UPDATE public.profiles
     SET nome = left(coalesce(p_nome, ''), 80), avatar = p_avatar
   WHERE user_id = auth.uid();
END;
$$;
REVOKE ALL ON FUNCTION public.atualizar_meu_perfil(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.atualizar_meu_perfil(text, text) TO authenticated;

-- Troca de e-mail confirmada no Supabase Auth reflete no perfil.
CREATE OR REPLACE FUNCTION private.sincronizar_email()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  UPDATE public.profiles SET email = coalesce(NEW.email, '') WHERE user_id = NEW.id;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS on_auth_user_email_nevoeiro ON auth.users;
CREATE TRIGGER on_auth_user_email_nevoeiro
  AFTER UPDATE OF email ON auth.users FOR EACH ROW
  WHEN (OLD.email IS DISTINCT FROM NEW.email)
  EXECUTE FUNCTION private.sincronizar_email();
