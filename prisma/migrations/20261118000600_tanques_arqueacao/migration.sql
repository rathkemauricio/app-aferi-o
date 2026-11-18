-- Medição de Tanques: tabelas de arqueação (altura na régua em cm → litros).
-- Cada tabela é de uma filial; `tanques` guarda os números dos tanques da filial que a usam (um tanque, uma tabela).
-- `pontos` = [[cm, litros], ...] em ordem de altura. O app interpola (linha reta) entre dois centímetros.
CREATE TABLE IF NOT EXISTS public.tq_tabelas (
  id text PRIMARY KEY,
  filial_id text NOT NULL REFERENCES public.filiais (id),
  nome text NOT NULL DEFAULT '',
  tanques jsonb NOT NULL DEFAULT '[]'::jsonb,
  capacidade numeric,
  diametro_cm numeric,
  comprimento_m numeric,
  pontos jsonb NOT NULL DEFAULT '[]'::jsonb,
  arquivo text NOT NULL DEFAULT '',
  criado_por uuid DEFAULT auth.uid(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
CREATE INDEX IF NOT EXISTS tq_tabelas_filial_idx ON public.tq_tabelas (filial_id);
CREATE INDEX IF NOT EXISTS tq_tabelas_updated_idx ON public.tq_tabelas (updated_at);
DROP TRIGGER IF EXISTS tq_tabelas_touch ON public.tq_tabelas;
CREATE TRIGGER tq_tabelas_touch BEFORE INSERT OR UPDATE ON public.tq_tabelas FOR EACH ROW EXECUTE FUNCTION private.touch_updated_at();

ALTER TABLE public.tq_tabelas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Modulo tanques le" ON public.tq_tabelas;
DROP POLICY IF EXISTS "Modulo tanques insere" ON public.tq_tabelas;
DROP POLICY IF EXISTS "Modulo tanques altera" ON public.tq_tabelas;
CREATE POLICY "Modulo tanques le" ON public.tq_tabelas FOR SELECT TO authenticated USING ((SELECT private.tem_modulo('tanques')));
CREATE POLICY "Modulo tanques insere" ON public.tq_tabelas FOR INSERT TO authenticated WITH CHECK ((SELECT private.tem_modulo('tanques')));
CREATE POLICY "Modulo tanques altera" ON public.tq_tabelas FOR UPDATE TO authenticated USING ((SELECT private.tem_modulo('tanques'))) WITH CHECK ((SELECT private.tem_modulo('tanques')));

-- No celular o PDF da tabela é lido pelo servidor (mesmo bucket da Coleta, pasta arqueacao/).
DO $$
BEGIN
  DROP POLICY IF EXISTS "Tanques arqueacao envia" ON storage.objects;
  DROP POLICY IF EXISTS "Tanques arqueacao apaga" ON storage.objects;
  CREATE POLICY "Tanques arqueacao envia" ON storage.objects FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'coleta-arquivos' AND (storage.foldername(name))[1] = 'arqueacao' AND (SELECT private.tem_modulo('tanques')));
  CREATE POLICY "Tanques arqueacao apaga" ON storage.objects FOR DELETE TO authenticated
    USING (bucket_id = 'coleta-arquivos' AND (storage.foldername(name))[1] = 'arqueacao' AND (SELECT private.tem_modulo('tanques')));
EXCEPTION WHEN insufficient_privilege THEN
  RAISE WARNING 'Sem permissão para criar as políticas do Storage: crie no painel (bucket coleta-arquivos, pasta arqueacao) INSERT e DELETE de authenticated com private.tem_modulo(''tanques'').';
END $$;
