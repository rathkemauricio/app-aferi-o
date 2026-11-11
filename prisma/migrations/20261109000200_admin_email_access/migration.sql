CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA private TO authenticated;

CREATE OR REPLACE FUNCTION private.is_nevoeiro_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM auth.users AS u
    WHERE u.id = (SELECT auth.uid())
      AND lower(u.email) = 'mauriciotestesdev@gmail.com'
      AND u.email_confirmed_at IS NOT NULL
  );
$$;

REVOKE ALL ON FUNCTION private.is_nevoeiro_admin() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.is_nevoeiro_admin() TO authenticated;

DROP POLICY IF EXISTS "Authenticated users can read service records" ON public.service_records;
DROP POLICY IF EXISTS "Authenticated users can create service records" ON public.service_records;
DROP POLICY IF EXISTS "Authenticated users can update service records" ON public.service_records;
DROP POLICY IF EXISTS "Authenticated users can delete service records" ON public.service_records;

CREATE POLICY "Nevoeiro admin can read service records"
  ON public.service_records FOR SELECT TO authenticated
  USING ((SELECT private.is_nevoeiro_admin()));
CREATE POLICY "Nevoeiro admin can create service records"
  ON public.service_records FOR INSERT TO authenticated
  WITH CHECK ((SELECT private.is_nevoeiro_admin()));
CREATE POLICY "Nevoeiro admin can update service records"
  ON public.service_records FOR UPDATE TO authenticated
  USING ((SELECT private.is_nevoeiro_admin()))
  WITH CHECK ((SELECT private.is_nevoeiro_admin()));
CREATE POLICY "Nevoeiro admin can delete service records"
  ON public.service_records FOR DELETE TO authenticated
  USING ((SELECT private.is_nevoeiro_admin()));
