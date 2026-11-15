-- Módulo Agenda: eventos de cada usuário, sincronizados com o Google Agenda dele.
-- O app grava os eventos (local-first, tabela agenda_eventos). A Edge Function "google-agenda"
-- envia os pendentes ao Google e traz as mudanças feitas lá. Os tokens do Google ficam só no servidor.

CREATE TABLE IF NOT EXISTS public.agenda_eventos (
  id text PRIMARY KEY,
  titulo text NOT NULL DEFAULT '',
  descricao text NOT NULL DEFAULT '',
  local text NOT NULL DEFAULT '',
  data date NOT NULL,
  data_fim date,
  hora_inicio text CHECK (hora_inicio IS NULL OR hora_inicio ~ '^\d{2}:\d{2}$'),
  hora_fim text CHECK (hora_fim IS NULL OR hora_fim ~ '^\d{2}:\d{2}$'),
  filial_id text REFERENCES public.filiais (id),
  origem text NOT NULL DEFAULT 'app' CHECK (origem IN ('app', 'google')),
  google_id text,
  google_pendente boolean NOT NULL DEFAULT false,
  dono uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users (id) ON DELETE CASCADE,
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
CREATE INDEX IF NOT EXISTS agenda_eventos_dono_data_idx ON public.agenda_eventos (dono, data);
CREATE INDEX IF NOT EXISTS agenda_eventos_updated_idx ON public.agenda_eventos (updated_at);
CREATE INDEX IF NOT EXISTS agenda_eventos_pendente_idx ON public.agenda_eventos (dono) WHERE google_pendente;
CREATE UNIQUE INDEX IF NOT EXISTS agenda_eventos_google_idx ON public.agenda_eventos (dono, google_id) WHERE google_id IS NOT NULL;

DROP TRIGGER IF EXISTS agenda_eventos_touch ON public.agenda_eventos;
CREATE TRIGGER agenda_eventos_touch BEFORE INSERT OR UPDATE ON public.agenda_eventos FOR EACH ROW EXECUTE FUNCTION private.touch_updated_at();

-- Cada um vê e altera só a própria agenda, e só com o módulo liberado. Exclusão é lógica (deleted_at).
ALTER TABLE public.agenda_eventos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Agenda le" ON public.agenda_eventos;
DROP POLICY IF EXISTS "Agenda insere" ON public.agenda_eventos;
DROP POLICY IF EXISTS "Agenda altera" ON public.agenda_eventos;
CREATE POLICY "Agenda le" ON public.agenda_eventos FOR SELECT TO authenticated
  USING (dono = (SELECT auth.uid()) AND (SELECT private.tem_modulo('agenda')));
CREATE POLICY "Agenda insere" ON public.agenda_eventos FOR INSERT TO authenticated
  WITH CHECK (dono = (SELECT auth.uid()) AND (SELECT private.tem_modulo('agenda')));
CREATE POLICY "Agenda altera" ON public.agenda_eventos FOR UPDATE TO authenticated
  USING (dono = (SELECT auth.uid()) AND (SELECT private.tem_modulo('agenda')))
  WITH CHECK (dono = (SELECT auth.uid()) AND (SELECT private.tem_modulo('agenda')));
GRANT SELECT, INSERT, UPDATE ON public.agenda_eventos TO authenticated;

-- Conexão com o Google (um registro por usuário). Sem políticas: só a Edge Function (service role) lê e grava.
CREATE TABLE IF NOT EXISTS public.agenda_google (
  user_id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  email text NOT NULL DEFAULT '',
  refresh_token text NOT NULL,
  access_token text,
  expira_em timestamptz,
  calendario text NOT NULL DEFAULT 'primary',
  sync_token text,
  sincronizado_em timestamptz,
  criado_em timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.agenda_google ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.agenda_google FROM anon, authenticated;
