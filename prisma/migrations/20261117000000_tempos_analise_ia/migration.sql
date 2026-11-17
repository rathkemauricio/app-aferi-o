-- Tempos e Movimentos: análises de dimensionamento feitas por IA (Gemini).
-- A Edge Function "analise-ia" monta o pedido, chama o Gemini e grava aqui o resultado, o resumo enviado
-- e quem pediu. O app só lê (quem tem o módulo Tempos e Movimentos).
CREATE TABLE IF NOT EXISTS public.tm_analises_ia (
  id text PRIMARY KEY,
  filial_id text NOT NULL REFERENCES public.filiais (id) ON DELETE CASCADE,
  perfil text NOT NULL DEFAULT 'posto_combustivel',
  modelo text NOT NULL DEFAULT '',
  resultado jsonb NOT NULL,
  dados jsonb NOT NULL,
  usuario uuid DEFAULT auth.uid(),
  usuario_nome text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
CREATE INDEX IF NOT EXISTS tm_analises_ia_filial_idx ON public.tm_analises_ia (filial_id, updated_at DESC);

DROP TRIGGER IF EXISTS tm_analises_ia_touch ON public.tm_analises_ia;
CREATE TRIGGER tm_analises_ia_touch BEFORE INSERT OR UPDATE ON public.tm_analises_ia FOR EACH ROW EXECUTE FUNCTION private.touch_updated_at();

ALTER TABLE public.tm_analises_ia ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Modulo tempos le analises" ON public.tm_analises_ia;
CREATE POLICY "Modulo tempos le analises" ON public.tm_analises_ia FOR SELECT TO authenticated USING ((SELECT private.tem_modulo('tempos')));
