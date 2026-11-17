-- Coleta: classificação Pista × Conveniência de cada categoria, escolhida por quem monta as contagens.
-- O relatório de saldos traz todas as categorias; o app sugere a classe pelo nome e o usuário corrige.
-- A escolha vale para a rede inteira e para os próximos inventários (id = nome da categoria).
CREATE TABLE IF NOT EXISTS public.ce_classes (
  id text PRIMARY KEY,
  categoria text NOT NULL DEFAULT '',
  classe text NOT NULL CHECK (classe IN ('pista', 'conveniencia')),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
CREATE INDEX IF NOT EXISTS ce_classes_updated_idx ON public.ce_classes (updated_at);

DROP TRIGGER IF EXISTS ce_classes_touch ON public.ce_classes;
CREATE TRIGGER ce_classes_touch BEFORE INSERT OR UPDATE ON public.ce_classes FOR EACH ROW EXECUTE FUNCTION private.touch_updated_at();

ALTER TABLE public.ce_classes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Modulo coleta le" ON public.ce_classes;
DROP POLICY IF EXISTS "Modulo coleta insere" ON public.ce_classes;
DROP POLICY IF EXISTS "Modulo coleta altera" ON public.ce_classes;
CREATE POLICY "Modulo coleta le" ON public.ce_classes FOR SELECT TO authenticated USING ((SELECT private.tem_modulo('coleta')));
CREATE POLICY "Modulo coleta insere" ON public.ce_classes FOR INSERT TO authenticated WITH CHECK ((SELECT private.tem_modulo('coleta')));
CREATE POLICY "Modulo coleta altera" ON public.ce_classes FOR UPDATE TO authenticated USING ((SELECT private.tem_modulo('coleta'))) WITH CHECK ((SELECT private.tem_modulo('coleta')));
