-- Auditoria: relatório final guardado no Storage.
-- Ao concluir, o app gera o relatório com as fotos embutidas, guarda o arquivo na pasta da auditoria
-- e apaga as fotos originais. A coluna "relatorios" guarda o histórico (caminho e data de cada versão).

ALTER TABLE public.aud_auditorias ADD COLUMN IF NOT EXISTS relatorios jsonb NOT NULL DEFAULT '[]'::jsonb;

-- O bucket passa a aceitar o relatório (HTML com as fotos embutidas, que pode passar de 5 MB).
DO $$
BEGIN
  UPDATE storage.buckets
     SET file_size_limit = 52428800,
         allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'text/html']
   WHERE id = 'auditoria-fotos';
EXCEPTION WHEN insufficient_privilege THEN
  RAISE WARNING 'Sem permissão para alterar o bucket auditoria-fotos: no painel (Storage), aumente o limite para 50 MB e inclua o tipo text/html.';
END $$;
