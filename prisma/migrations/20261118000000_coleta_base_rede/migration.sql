-- Coleta: uma base de códigos de barra para a rede inteira e códigos de barra cadastrados durante a coleta.
--  * ce_barras / ce_bases com filial_id = 'rede': a base da rede, que vale para todas as filiais. A base própria
--    de uma filial (opcional) se soma a ela. Por isso as chaves deixam de apontar obrigatoriamente para filiais.
--  * ce_inventarios.eans_extra: { "<código de barras>": "<código interno>" } ligados no coletor quando o código
--    lido não estava cadastrado; sincroniza com todos os aparelhos do inventário. A Edge Function também grava
--    o código em ce_produtos e na base em uso, para valer nos próximos inventários.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT conrelid::regclass AS tabela, conname FROM pg_constraint
    WHERE contype = 'f' AND confrelid = 'public.filiais'::regclass
      AND conrelid IN ('public.ce_barras'::regclass, 'public.ce_bases'::regclass)
  LOOP
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', r.tabela, r.conname);
  END LOOP;
END $$;

ALTER TABLE public.ce_inventarios ADD COLUMN IF NOT EXISTS eans_extra jsonb NOT NULL DEFAULT '{}'::jsonb;
