-- Medição de Tanques: os tanques da filial (número e combustível) vêm do croqui. Quem tem o módulo Tanques
-- passa a poder LER o croqui das filiais (só leitura; alterar continua sendo do módulo Croqui).
DROP POLICY IF EXISTS "Modulo tanques le croqui" ON public.filial_docs;
CREATE POLICY "Modulo tanques le croqui" ON public.filial_docs FOR SELECT TO authenticated
  USING (tipo = 'croqui' AND (SELECT private.tem_modulo('tanques')));
