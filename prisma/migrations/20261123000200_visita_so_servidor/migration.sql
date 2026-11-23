-- profiles.visitando (visita do dono, 20261123000100_presenca) só pode ser gravado pelo servidor (função empresas).
-- A regra "Admin altera perfis" deixa o administrador alterar perfis da rede; sem esta trava ele poderia preencher
-- o campo (sem efeito, porque minha_empresa só o considera para o dono, mas o campo não é dele).
CREATE OR REPLACE FUNCTION private.proteger_visitando()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF current_user IN ('authenticated', 'anon') THEN
    IF TG_OP = 'INSERT' THEN NEW.visitando := NULL; ELSE NEW.visitando := OLD.visitando; END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.proteger_visitando() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS profiles_proteger_visitando ON public.profiles;
CREATE TRIGGER profiles_proteger_visitando BEFORE INSERT OR UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION private.proteger_visitando();
