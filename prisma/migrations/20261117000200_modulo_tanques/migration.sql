-- Módulo Medição de Tanques: conferência do estoque de combustível por tanque em cada filial.
-- Uma medição = filial + data/hora + uma linha por tanque (jsonb), como a planilha de conferência:
--   total = litros (estoque medido) + venda;  resultado = informada + recebimento − total  (negativo = falta).
-- Quem mediu: responsavel (auth.uid() do servidor) e responsavel_nome (para exibir).
CREATE TABLE IF NOT EXISTS public.tq_medicoes (
  id text PRIMARY KEY,
  filial_id text NOT NULL REFERENCES public.filiais (id),
  data date NOT NULL,
  medido_em timestamptz,
  status text NOT NULL DEFAULT 'rascunho' CHECK (status IN ('rascunho', 'finalizada')),
  tanques jsonb NOT NULL DEFAULT '[]'::jsonb,
  obs text NOT NULL DEFAULT '',
  responsavel uuid DEFAULT auth.uid(),
  responsavel_nome text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
CREATE INDEX IF NOT EXISTS tq_medicoes_filial_idx ON public.tq_medicoes (filial_id, data DESC);
CREATE INDEX IF NOT EXISTS tq_medicoes_updated_idx ON public.tq_medicoes (updated_at);

DROP TRIGGER IF EXISTS tq_medicoes_touch ON public.tq_medicoes;
CREATE TRIGGER tq_medicoes_touch BEFORE INSERT OR UPDATE ON public.tq_medicoes FOR EACH ROW EXECUTE FUNCTION private.touch_updated_at();

ALTER TABLE public.tq_medicoes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Modulo tanques le" ON public.tq_medicoes;
DROP POLICY IF EXISTS "Modulo tanques insere" ON public.tq_medicoes;
DROP POLICY IF EXISTS "Modulo tanques altera" ON public.tq_medicoes;
CREATE POLICY "Modulo tanques le" ON public.tq_medicoes FOR SELECT TO authenticated USING ((SELECT private.tem_modulo('tanques')));
CREATE POLICY "Modulo tanques insere" ON public.tq_medicoes FOR INSERT TO authenticated WITH CHECK ((SELECT private.tem_modulo('tanques')));
CREATE POLICY "Modulo tanques altera" ON public.tq_medicoes FOR UPDATE TO authenticated USING ((SELECT private.tem_modulo('tanques'))) WITH CHECK ((SELECT private.tem_modulo('tanques')));
