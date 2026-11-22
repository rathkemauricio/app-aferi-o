-- Auditoria de segurança (22/11/2026).
--
-- 1. _prisma_migrations estava sem RLS e com permissão total para anon/authenticated pela API: fechada.
-- 2. Visitante sem login (anon) perde as permissões nas tabelas (só lê os planos, usados no site). As regras por linha
--    já bloqueavam, mas fica uma camada a mais. TRUNCATE/TRIGGER/REFERENCES saem também de authenticated.
-- 3. Arquivos (Storage) passam a ser da rede: antes bastava ter o módulo para ler/apagar arquivo de qualquer rede.
--    - auditoria-fotos: a 1ª pasta é o id da auditoria (fotos e relatórios) → a auditoria tem de ser da rede.
--    - riscos-evidencias: a 1ª pasta é o id da unidade do Mapa de Risco (ou rmu-<filial>) → da rede.
--    - coleta-arquivos: barras/<empresa>/… e arqueacao/<empresa>/… → a 2ª pasta é o id da empresa.
--    Envio de arquivo novo: a pasta não pode pertencer a outra rede (a auditoria/unidade pode ainda não ter chegado
--    ao servidor quando a foto é enviada). Quem enviou sempre vê e apaga o próprio arquivo.
-- 4. Contador de uso (limites contra abuso nas funções públicas e no envio de e-mails): só o servidor usa.

-- 1 ---------------------------------------------------------------------------------------------------------
ALTER TABLE public._prisma_migrations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._prisma_migrations FROM anon, authenticated;

-- 2 ---------------------------------------------------------------------------------------------------------
DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind IN ('r', 'v', 'm') LOOP
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
    EXECUTE format('REVOKE TRUNCATE, TRIGGER, REFERENCES ON public.%I FROM authenticated', t);
  END LOOP;
END $$;
GRANT SELECT ON public.planos TO anon;
-- Tabelas criadas daqui em diante não ganham permissão para visitante sem login.
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon;

-- 3 ---------------------------------------------------------------------------------------------------------
-- Pasta (1ª parte do caminho) é de uma auditoria / unidade da minha rede, ou de outra rede.
CREATE OR REPLACE FUNCTION private.pasta_auditoria(pasta text, da_minha boolean)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.aud_auditorias a
    WHERE a.id = pasta AND (CASE WHEN da_minha THEN a.empresa_id = private.minha_empresa() ELSE a.empresa_id IS DISTINCT FROM private.minha_empresa() END)
  );
$$;
CREATE OR REPLACE FUNCTION private.pasta_unidade(pasta text, da_minha boolean)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.rm_unidades u
    WHERE u.id = pasta AND (CASE WHEN da_minha THEN u.empresa_id = private.minha_empresa() ELSE u.empresa_id IS DISTINCT FROM private.minha_empresa() END)
  ) OR EXISTS (
    SELECT 1 FROM public.filiais f
    WHERE 'rmu-' || f.id = pasta AND (CASE WHEN da_minha THEN f.empresa_id = private.minha_empresa() ELSE f.empresa_id IS DISTINCT FROM private.minha_empresa() END)
  );
$$;
REVOKE ALL ON FUNCTION private.pasta_auditoria(text, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.pasta_unidade(text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.pasta_auditoria(text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION private.pasta_unidade(text, boolean) TO authenticated;

DROP POLICY IF EXISTS "Auditoria fotos le" ON storage.objects;
DROP POLICY IF EXISTS "Auditoria fotos envia" ON storage.objects;
DROP POLICY IF EXISTS "Auditoria fotos apaga" ON storage.objects;
CREATE POLICY "Auditoria fotos le" ON storage.objects FOR SELECT TO authenticated USING (
  bucket_id = 'auditoria-fotos' AND (SELECT private.tem_modulo('auditoria'))
  AND (owner = (SELECT auth.uid()) OR private.pasta_auditoria((storage.foldername(name))[1], true)));
CREATE POLICY "Auditoria fotos envia" ON storage.objects FOR INSERT TO authenticated WITH CHECK (
  bucket_id = 'auditoria-fotos' AND (SELECT private.tem_modulo('auditoria'))
  AND NOT private.pasta_auditoria((storage.foldername(name))[1], false));
CREATE POLICY "Auditoria fotos apaga" ON storage.objects FOR DELETE TO authenticated USING (
  bucket_id = 'auditoria-fotos' AND (SELECT private.tem_modulo('auditoria'))
  AND (owner = (SELECT auth.uid()) OR private.pasta_auditoria((storage.foldername(name))[1], true)));

DROP POLICY IF EXISTS "Riscos evidencias le" ON storage.objects;
DROP POLICY IF EXISTS "Riscos evidencias envia" ON storage.objects;
DROP POLICY IF EXISTS "Riscos evidencias apaga" ON storage.objects;
CREATE POLICY "Riscos evidencias le" ON storage.objects FOR SELECT TO authenticated USING (
  bucket_id = 'riscos-evidencias' AND (SELECT private.tem_modulo('riscos'))
  AND (owner = (SELECT auth.uid()) OR private.pasta_unidade((storage.foldername(name))[1], true)));
CREATE POLICY "Riscos evidencias envia" ON storage.objects FOR INSERT TO authenticated WITH CHECK (
  bucket_id = 'riscos-evidencias' AND (SELECT private.tem_modulo('riscos'))
  AND NOT private.pasta_unidade((storage.foldername(name))[1], false));
CREATE POLICY "Riscos evidencias apaga" ON storage.objects FOR DELETE TO authenticated USING (
  bucket_id = 'riscos-evidencias' AND (SELECT private.tem_modulo('riscos'))
  AND (owner = (SELECT auth.uid()) OR private.pasta_unidade((storage.foldername(name))[1], true)));

DROP POLICY IF EXISTS "Coleta arquivos envia" ON storage.objects;
DROP POLICY IF EXISTS "Coleta arquivos apaga" ON storage.objects;
DROP POLICY IF EXISTS "Tanques arqueacao envia" ON storage.objects;
DROP POLICY IF EXISTS "Tanques arqueacao apaga" ON storage.objects;
CREATE POLICY "Coleta arquivos envia" ON storage.objects FOR INSERT TO authenticated WITH CHECK (
  bucket_id = 'coleta-arquivos' AND (storage.foldername(name))[1] = 'barras' AND (SELECT private.tem_modulo('coleta'))
  AND (storage.foldername(name))[2] = (SELECT private.minha_empresa())::text);
CREATE POLICY "Coleta arquivos apaga" ON storage.objects FOR DELETE TO authenticated USING (
  bucket_id = 'coleta-arquivos' AND (storage.foldername(name))[1] = 'barras' AND (SELECT private.tem_modulo('coleta'))
  AND (storage.foldername(name))[2] = (SELECT private.minha_empresa())::text);
CREATE POLICY "Tanques arqueacao envia" ON storage.objects FOR INSERT TO authenticated WITH CHECK (
  bucket_id = 'coleta-arquivos' AND (storage.foldername(name))[1] = 'arqueacao' AND (SELECT private.tem_modulo('tanques'))
  AND (storage.foldername(name))[2] = (SELECT private.minha_empresa())::text);
CREATE POLICY "Tanques arqueacao apaga" ON storage.objects FOR DELETE TO authenticated USING (
  bucket_id = 'coleta-arquivos' AND (storage.foldername(name))[1] = 'arqueacao' AND (SELECT private.tem_modulo('tanques'))
  AND (storage.foldername(name))[2] = (SELECT private.minha_empresa())::text);

-- 4 ---------------------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.limites_uso (
  chave text NOT NULL,
  janela timestamptz NOT NULL,
  contagem integer NOT NULL DEFAULT 0,
  PRIMARY KEY (chave, janela)
);
ALTER TABLE public.limites_uso ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.limites_uso FROM anon, authenticated;

/** Soma `inc` ao uso da chave na janela atual (de `minutos`) e devolve o total da janela. Só o servidor chama. */
CREATE OR REPLACE FUNCTION public.contar_uso(p_chave text, p_minutos integer, p_inc integer DEFAULT 1)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  j timestamptz := to_timestamp(floor(extract(epoch FROM now()) / (p_minutos * 60)) * (p_minutos * 60));
  total integer;
BEGIN
  INSERT INTO public.limites_uso AS l (chave, janela, contagem) VALUES (p_chave, j, p_inc)
  ON CONFLICT (chave, janela) DO UPDATE SET contagem = l.contagem + p_inc
  RETURNING contagem INTO total;
  DELETE FROM public.limites_uso WHERE janela < now() - interval '2 days';
  RETURN total;
END;
$$;
REVOKE ALL ON FUNCTION public.contar_uso(text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.contar_uso(text, integer, integer) TO service_role;
