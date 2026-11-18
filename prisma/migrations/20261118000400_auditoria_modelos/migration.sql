-- Auditoria: vários checklists (modelos com requisitos e status próprios) e requisitos/status cadastrados pelo usuário.
--  * aud_modelos: { nome, requisitos: [{ texto, setor? }], status: [{ codigo, nome, cor, acao, fecha }] }.
--    O id 'padrao', se gravado, substitui o checklist padrão (53 requisitos e 6 status embutidos no app).
--  * aud_auditorias.modelo_id / status_lista: o modelo usado e a cópia dos status no momento da abertura
--    (mudar o modelo depois não altera auditorias já abertas).
CREATE TABLE IF NOT EXISTS public.aud_modelos (
  id text PRIMARY KEY,
  nome text NOT NULL DEFAULT '',
  requisitos jsonb NOT NULL DEFAULT '[]'::jsonb,
  status jsonb NOT NULL DEFAULT '[]'::jsonb,
  criado_por uuid DEFAULT auth.uid(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
CREATE INDEX IF NOT EXISTS aud_modelos_updated_idx ON public.aud_modelos (updated_at);
DROP TRIGGER IF EXISTS aud_modelos_touch ON public.aud_modelos;
CREATE TRIGGER aud_modelos_touch BEFORE INSERT OR UPDATE ON public.aud_modelos FOR EACH ROW EXECUTE FUNCTION private.touch_updated_at();

ALTER TABLE public.aud_modelos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Modulo auditoria le" ON public.aud_modelos;
DROP POLICY IF EXISTS "Modulo auditoria insere" ON public.aud_modelos;
DROP POLICY IF EXISTS "Modulo auditoria altera" ON public.aud_modelos;
CREATE POLICY "Modulo auditoria le" ON public.aud_modelos FOR SELECT TO authenticated USING ((SELECT private.tem_modulo('auditoria')));
CREATE POLICY "Modulo auditoria insere" ON public.aud_modelos FOR INSERT TO authenticated WITH CHECK ((SELECT private.tem_modulo('auditoria')));
CREATE POLICY "Modulo auditoria altera" ON public.aud_modelos FOR UPDATE TO authenticated USING ((SELECT private.tem_modulo('auditoria'))) WITH CHECK ((SELECT private.tem_modulo('auditoria')));

ALTER TABLE public.aud_auditorias ADD COLUMN IF NOT EXISTS modelo_id text;
ALTER TABLE public.aud_auditorias ADD COLUMN IF NOT EXISTS status_lista jsonb;
