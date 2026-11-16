-- Coleta: base fixa de códigos de barra por filial.
-- Cada filial importa uma vez a "Relação de Códigos de Barra por Categoria" do ERP (código interno → EANs).
-- A cada inventário só entra o relatório de saldos; os EANs vêm desta base, ligados pelo código interno.
-- A leitura do PDF (pesado: ~1.400 páginas) é feita no navegador; a gravação passa pela Edge Function coleta-erp.

CREATE TABLE IF NOT EXISTS public.ce_barras (
  filial_id text NOT NULL REFERENCES public.filiais (id) ON DELETE CASCADE,
  codigo text NOT NULL,
  nome text NOT NULL DEFAULT '',
  categoria text NOT NULL DEFAULT '',
  eans text[] NOT NULL DEFAULT '{}',
  PRIMARY KEY (filial_id, codigo)
);

-- Uma linha por filial com a situação da base (sincronizada para web e app). id = filial_id.
CREATE TABLE IF NOT EXISTS public.ce_bases (
  id text PRIMARY KEY REFERENCES public.filiais (id) ON DELETE CASCADE,
  arquivo text NOT NULL DEFAULT '',
  itens integer NOT NULL DEFAULT 0,
  eans integer NOT NULL DEFAULT 0,
  importado_em timestamptz,
  importado_por uuid DEFAULT auth.uid(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
CREATE INDEX IF NOT EXISTS ce_bases_updated_idx ON public.ce_bases (updated_at);

-- Horário do saldo informado no relatório do ERP (quando o PDF traz data/hora); erp_em continua sendo a hora da carga.
ALTER TABLE public.ce_inventarios ADD COLUMN IF NOT EXISTS saldo_em timestamptz;
-- Itens do saldo que não estão na base de códigos de barra (só podem ser lidos pelo código interno).
ALTER TABLE public.ce_inventarios ADD COLUMN IF NOT EXISTS sem_barras integer NOT NULL DEFAULT 0;

DROP TRIGGER IF EXISTS ce_bases_touch ON public.ce_bases;
CREATE TRIGGER ce_bases_touch BEFORE INSERT OR UPDATE ON public.ce_bases FOR EACH ROW EXECUTE FUNCTION private.touch_updated_at();

-- Leitura para quem tem o módulo; gravação só pela Edge Function (service role).
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['ce_barras', 'ce_bases'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS "Modulo coleta le" ON public.%I', t);
    EXECUTE format('CREATE POLICY "Modulo coleta le" ON public.%I FOR SELECT TO authenticated USING ((SELECT private.tem_modulo(''coleta'')))', t);
  END LOOP;
END $$;

-- ---------- PDF da relação enviado pelo app (Storage) ----------
-- No celular o PDF não é lido no aparelho: vai para este bucket e a Edge Function extrai o texto em lotes de páginas.
DO $$
BEGIN
  INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  VALUES ('coleta-arquivos', 'coleta-arquivos', false, 31457280, ARRAY['application/pdf'])
  ON CONFLICT (id) DO NOTHING;
EXCEPTION WHEN insufficient_privilege THEN
  RAISE WARNING 'Sem permissão para criar o bucket coleta-arquivos: crie no painel do Supabase (Storage), privado, limite 30 MB, só application/pdf.';
END $$;

DO $$
BEGIN
  DROP POLICY IF EXISTS "Coleta arquivos envia" ON storage.objects;
  DROP POLICY IF EXISTS "Coleta arquivos apaga" ON storage.objects;
  CREATE POLICY "Coleta arquivos envia" ON storage.objects FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'coleta-arquivos' AND (SELECT private.tem_modulo('coleta')));
  CREATE POLICY "Coleta arquivos apaga" ON storage.objects FOR DELETE TO authenticated
    USING (bucket_id = 'coleta-arquivos' AND (SELECT private.tem_modulo('coleta')));
EXCEPTION WHEN insufficient_privilege THEN
  RAISE WARNING 'Sem permissão para criar as políticas do Storage: crie no painel (bucket coleta-arquivos) INSERT e DELETE de authenticated com private.tem_modulo(''coleta'').';
END $$;
