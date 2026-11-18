-- Aferições: quem tem o módulo pode excluir uma aferição do histórico (antes, só o administrador).
DROP POLICY IF EXISTS "Modulo afericoes exclui" ON public.service_records;
CREATE POLICY "Modulo afericoes exclui" ON public.service_records FOR DELETE TO authenticated
  USING ((SELECT private.tem_modulo('afericoes')));
