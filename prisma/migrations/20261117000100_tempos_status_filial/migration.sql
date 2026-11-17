-- Tempos e Movimentos: situação das coletas de cada filial (em coleta × finalizada).
-- Fluxo: filial → coletas → finalizar coletas (registra quem e quando) → análise e dimensionamento da filial.
-- id = filial_id. Reabrir = finalizado_em nulo.
CREATE TABLE IF NOT EXISTS public.tm_filiais_status (
  id text PRIMARY KEY REFERENCES public.filiais (id) ON DELETE CASCADE,
  finalizado_em timestamptz,
  finalizado_por uuid,
  finalizado_por_nome text NOT NULL DEFAULT '',
  resumo jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
CREATE INDEX IF NOT EXISTS tm_filiais_status_updated_idx ON public.tm_filiais_status (updated_at);

-- Quem finalizou vem da sessão (não do aparelho): grava auth.uid() sempre que a finalização muda.
CREATE OR REPLACE FUNCTION private.tm_status_quem() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'INSERT' OR NEW.finalizado_em IS DISTINCT FROM OLD.finalizado_em THEN
    NEW.finalizado_por := CASE WHEN NEW.finalizado_em IS NULL THEN NULL ELSE auth.uid() END;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS tm_filiais_status_quem ON public.tm_filiais_status;
CREATE TRIGGER tm_filiais_status_quem BEFORE INSERT OR UPDATE ON public.tm_filiais_status FOR EACH ROW EXECUTE FUNCTION private.tm_status_quem();
DROP TRIGGER IF EXISTS tm_filiais_status_touch ON public.tm_filiais_status;
CREATE TRIGGER tm_filiais_status_touch BEFORE INSERT OR UPDATE ON public.tm_filiais_status FOR EACH ROW EXECUTE FUNCTION private.touch_updated_at();

ALTER TABLE public.tm_filiais_status ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Modulo tempos le status" ON public.tm_filiais_status;
DROP POLICY IF EXISTS "Modulo tempos insere status" ON public.tm_filiais_status;
DROP POLICY IF EXISTS "Modulo tempos altera status" ON public.tm_filiais_status;
CREATE POLICY "Modulo tempos le status" ON public.tm_filiais_status FOR SELECT TO authenticated USING ((SELECT private.tem_modulo('tempos')));
CREATE POLICY "Modulo tempos insere status" ON public.tm_filiais_status FOR INSERT TO authenticated WITH CHECK ((SELECT private.tem_modulo('tempos')));
CREATE POLICY "Modulo tempos altera status" ON public.tm_filiais_status FOR UPDATE TO authenticated USING ((SELECT private.tem_modulo('tempos'))) WITH CHECK ((SELECT private.tem_modulo('tempos')));
