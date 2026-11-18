-- Medição de Tanques: cadastro dos tanques de cada filial (número e combustível).
-- A nova medição vem com estes tanques prontos (antes do croqui e da última medição).
-- A tabela de arqueação de cada tanque continua em tq_tabelas.tanques (números dos tanques que a usam).
CREATE TABLE IF NOT EXISTS public.tq_tanques (
  id text PRIMARY KEY,
  filial_id text NOT NULL REFERENCES public.filiais (id),
  numero text NOT NULL DEFAULT '',
  combustivel text NOT NULL DEFAULT '',
  criado_por uuid DEFAULT auth.uid(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
CREATE INDEX IF NOT EXISTS tq_tanques_filial_idx ON public.tq_tanques (filial_id);
CREATE INDEX IF NOT EXISTS tq_tanques_updated_idx ON public.tq_tanques (updated_at);
DROP TRIGGER IF EXISTS tq_tanques_touch ON public.tq_tanques;
CREATE TRIGGER tq_tanques_touch BEFORE INSERT OR UPDATE ON public.tq_tanques FOR EACH ROW EXECUTE FUNCTION private.touch_updated_at();

ALTER TABLE public.tq_tanques ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Modulo tanques le" ON public.tq_tanques;
DROP POLICY IF EXISTS "Modulo tanques insere" ON public.tq_tanques;
DROP POLICY IF EXISTS "Modulo tanques altera" ON public.tq_tanques;
CREATE POLICY "Modulo tanques le" ON public.tq_tanques FOR SELECT TO authenticated USING ((SELECT private.tem_modulo('tanques')));
CREATE POLICY "Modulo tanques insere" ON public.tq_tanques FOR INSERT TO authenticated WITH CHECK ((SELECT private.tem_modulo('tanques')));
CREATE POLICY "Modulo tanques altera" ON public.tq_tanques FOR UPDATE TO authenticated USING ((SELECT private.tem_modulo('tanques'))) WITH CHECK ((SELECT private.tem_modulo('tanques')));
