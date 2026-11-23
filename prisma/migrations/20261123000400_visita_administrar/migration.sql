-- Visita do dono em dois modos (pedido de 23/11/2026: "quero poder mudar, alterar as redes e ver os dados de outras redes"):
--   só ver      → profiles.visita_edita = false: tudo barrado pelas políticas "Visita so leitura" (como antes);
--   administrar → profiles.visita_edita = true : o dono grava na rede visitada como administrador dela.
-- Os dois campos só são gravados pelo servidor (função empresas, ação visitar). Toda alteração continua no registro
-- de ações (auditoria_log) em nome do dono, com a rede visitada.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS visita_edita boolean NOT NULL DEFAULT false;

-- Agora significa "visita SÓ PARA VER" (é o que as políticas restritivas consultam).
CREATE OR REPLACE FUNCTION private.em_visita()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id = (SELECT auth.uid()) AND p.visitando IS NOT NULL AND NOT p.visita_edita)
     AND (SELECT private.dono_plataforma());
$$;

CREATE OR REPLACE FUNCTION private.proteger_visitando()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  IF current_user IN ('authenticated', 'anon') THEN
    IF TG_OP = 'INSERT' THEN NEW.visitando := NULL; NEW.visita_edita := false;
    ELSE NEW.visitando := OLD.visitando; NEW.visita_edita := OLD.visita_edita; END IF;
  END IF;
  RETURN NEW;
END;
$$;
