CREATE TABLE IF NOT EXISTS public.service_records (
  id text PRIMARY KEY,
  branch text NOT NULL,
  service_date date NOT NULL,
  status text NOT NULL CHECK (status IN ('open', 'done')),
  payload jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS service_records_branch_date_idx
  ON public.service_records (branch, service_date DESC);

ALTER TABLE public.service_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read service records" ON public.service_records;
CREATE POLICY "Authenticated users can read service records"
  ON public.service_records FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated users can create service records" ON public.service_records;
CREATE POLICY "Authenticated users can create service records"
  ON public.service_records FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users can update service records" ON public.service_records;
CREATE POLICY "Authenticated users can update service records"
  ON public.service_records FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users can delete service records" ON public.service_records;
CREATE POLICY "Authenticated users can delete service records"
  ON public.service_records FOR DELETE TO authenticated USING (true);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
     AND NOT EXISTS (
       SELECT 1 FROM pg_publication_tables
       WHERE pubname = 'supabase_realtime'
         AND schemaname = 'public'
         AND tablename = 'service_records'
     ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.service_records;
  END IF;
END
$$;
