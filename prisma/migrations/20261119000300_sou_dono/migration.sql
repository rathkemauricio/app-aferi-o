-- O app pergunta se a conta logada é o dono da plataforma (mostra o painel "Empresas e planos").
-- Só devolve verdadeiro/falso; os dados do painel vêm da função "empresas", que confere de novo.
CREATE OR REPLACE FUNCTION public.sou_dono()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT private.dono_plataforma();
$$;
REVOKE ALL ON FUNCTION public.sou_dono() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sou_dono() TO authenticated;
