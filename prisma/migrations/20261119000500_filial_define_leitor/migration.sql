-- A própria filial define se conta com leitor de código (coletor) ou com o celular sem leitor.
-- A conta de filial não grava no cadastro de filiais; esta função muda só esse campo e só da filial dela.
CREATE OR REPLACE FUNCTION public.definir_leitor_da_filial(leitor boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  f text := (SELECT private.minha_filial());
BEGIN
  IF f IS NULL THEN
    RAISE EXCEPTION 'Só a conta da filial define o leitor da filial.' USING ERRCODE = '42501';
  END IF;
  IF NOT (SELECT private.tem_modulo('coleta')) THEN
    RAISE EXCEPTION 'O módulo Contagens não está liberado para esta conta.' USING ERRCODE = '42501';
  END IF;
  UPDATE public.filiais SET contagem_leitor = leitor WHERE id = f AND empresa_id = (SELECT private.minha_empresa());
END;
$$;
REVOKE ALL ON FUNCTION public.definir_leitor_da_filial(boolean) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.definir_leitor_da_filial(boolean) TO authenticated;
