-- Módulo Auditoria: checklist de auditoria operacional por filial (Sistema de Gestão Integrada).
-- Cada auditoria guarda os requisitos avaliados (status, observação, plano de ação e caminhos das fotos) em JSONB.
-- As fotos ficam no Storage (bucket privado "auditoria-fotos"), na pasta da auditoria.

CREATE TABLE IF NOT EXISTS public.aud_auditorias (
  id text PRIMARY KEY,
  filial_id text NOT NULL REFERENCES public.filiais (id),
  data date NOT NULL,
  auditores text NOT NULL DEFAULT '',
  escopo text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'rascunho' CHECK (status IN ('rascunho', 'concluida')),
  itens jsonb NOT NULL DEFAULT '[]'::jsonb,
  criado_por uuid DEFAULT auth.uid(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
CREATE INDEX IF NOT EXISTS aud_auditorias_filial_data_idx ON public.aud_auditorias (filial_id, data DESC);
CREATE INDEX IF NOT EXISTS aud_auditorias_updated_idx ON public.aud_auditorias (updated_at);

-- updated_at sempre pelo relógio do servidor (base da sincronização incremental).
DROP TRIGGER IF EXISTS aud_auditorias_touch ON public.aud_auditorias;
CREATE TRIGGER aud_auditorias_touch BEFORE INSERT OR UPDATE ON public.aud_auditorias FOR EACH ROW EXECUTE FUNCTION private.touch_updated_at();

-- Acesso pelo módulo 'auditoria' (administrador acessa tudo). Exclusão é lógica (deleted_at), por UPDATE.
ALTER TABLE public.aud_auditorias ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Modulo auditoria le" ON public.aud_auditorias;
DROP POLICY IF EXISTS "Modulo auditoria insere" ON public.aud_auditorias;
DROP POLICY IF EXISTS "Modulo auditoria altera" ON public.aud_auditorias;
CREATE POLICY "Modulo auditoria le" ON public.aud_auditorias FOR SELECT TO authenticated USING ((SELECT private.tem_modulo('auditoria')));
CREATE POLICY "Modulo auditoria insere" ON public.aud_auditorias FOR INSERT TO authenticated WITH CHECK ((SELECT private.tem_modulo('auditoria')));
CREATE POLICY "Modulo auditoria altera" ON public.aud_auditorias FOR UPDATE TO authenticated USING ((SELECT private.tem_modulo('auditoria'))) WITH CHECK ((SELECT private.tem_modulo('auditoria')));

-- ---------- Fotos (Storage) ----------
-- Em alguns projetos o papel da migração não pode mexer no Storage. Nesse caso a migração só avisa,
-- e o bucket/políticas são criados no painel (instruções no README, seção Auditoria).
DO $$
BEGIN
  INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  VALUES ('auditoria-fotos', 'auditoria-fotos', false, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp'])
  ON CONFLICT (id) DO NOTHING;
EXCEPTION WHEN insufficient_privilege THEN
  RAISE WARNING 'Sem permissão para criar o bucket auditoria-fotos: crie no painel do Supabase (Storage), privado, limite 5 MB.';
END $$;

DO $$
BEGIN
  DROP POLICY IF EXISTS "Auditoria fotos le" ON storage.objects;
  DROP POLICY IF EXISTS "Auditoria fotos envia" ON storage.objects;
  DROP POLICY IF EXISTS "Auditoria fotos apaga" ON storage.objects;
  CREATE POLICY "Auditoria fotos le" ON storage.objects FOR SELECT TO authenticated
    USING (bucket_id = 'auditoria-fotos' AND (SELECT private.tem_modulo('auditoria')));
  CREATE POLICY "Auditoria fotos envia" ON storage.objects FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'auditoria-fotos' AND (SELECT private.tem_modulo('auditoria')));
  CREATE POLICY "Auditoria fotos apaga" ON storage.objects FOR DELETE TO authenticated
    USING (bucket_id = 'auditoria-fotos' AND (SELECT private.tem_modulo('auditoria')));
EXCEPTION WHEN insufficient_privilege THEN
  RAISE WARNING 'Sem permissão para criar as políticas do Storage: crie no painel (Storage -> Policies, bucket auditoria-fotos) para SELECT, INSERT e DELETE de authenticated com a condição private.tem_modulo(''auditoria'').';
END $$;
