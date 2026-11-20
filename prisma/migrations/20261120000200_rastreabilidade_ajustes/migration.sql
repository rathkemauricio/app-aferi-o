-- Ajustes da rastreabilidade:
-- 1) nome de quem fez: usa o e-mail quando a conta não tem nome;
-- 2) ações feitas pelas funções do servidor (chave de serviço) são atribuídas a quem pediu, pelo cabeçalho
--    x-ator (só vale para a chave de serviço; contas comuns não conseguem se passar por outra);
-- 3) leituras de quantidade (campo "hist") não entram no antes/depois;
-- 4) registro de eventos que não são alteração de tabela (entrou no sistema, exportou PDF...).

CREATE OR REPLACE FUNCTION private.registrar_auditoria()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  novo jsonb := CASE WHEN TG_OP <> 'DELETE' THEN to_jsonb(NEW) END;
  velho jsonb := CASE WHEN TG_OP <> 'INSERT' THEN to_jsonb(OLD) END;
  base jsonb := coalesce(to_jsonb(NEW), to_jsonb(OLD));
  uid uuid := (SELECT auth.uid());
  papel text := coalesce(current_setting('request.jwt.claims', true)::json->>'role', '');
  ator text;
  acao text;
  mud jsonb := '{}'::jsonb;
  k text;
  fil text;
  fil_rotulo text;
  nome text;
  email text;
  emp uuid;
BEGIN
  -- Chave de serviço (funções do servidor): quem pediu vem no cabeçalho x-ator.
  IF uid IS NULL AND papel = 'service_role' THEN
    ator := nullif(current_setting('request.headers', true)::json->>'x-ator', '');
    IF ator ~* '^[0-9a-f-]{36}$' THEN uid := ator::uuid; END IF;
  END IF;

  IF TG_OP = 'INSERT' THEN
    acao := 'criou';
  ELSIF TG_OP = 'DELETE' THEN
    acao := 'apagou';
  ELSE
    IF (velho->>'deleted_at') IS NULL AND (novo->>'deleted_at') IS NOT NULL THEN acao := 'excluiu';
    ELSIF (velho->>'deleted_at') IS NOT NULL AND (novo->>'deleted_at') IS NULL THEN acao := 'restaurou';
    ELSE acao := 'alterou';
    END IF;
    FOR k IN SELECT jsonb_object_keys(novo) LOOP
      CONTINUE WHEN k IN ('updated_at', 'empresa_id', 'deleted_at', 'hist');
      IF (novo->k) IS DISTINCT FROM (velho->k) THEN
        mud := mud || jsonb_build_object(k, jsonb_build_object(
          'de', CASE WHEN k = 'avatar' THEN to_jsonb('(foto)'::text) WHEN length(coalesce((velho->k)::text, '')) > 240 THEN to_jsonb('(conteúdo longo)'::text) ELSE velho->k END,
          'para', CASE WHEN k = 'avatar' THEN to_jsonb('(foto)'::text) WHEN length(coalesce((novo->k)::text, '')) > 240 THEN to_jsonb('(conteúdo longo)'::text) ELSE novo->k END));
      END IF;
    END LOOP;
    IF acao = 'alterou' AND mud = '{}'::jsonb THEN RETURN NULL; END IF;
  END IF;

  emp := coalesce(nullif(base->>'empresa_id', '')::uuid, CASE WHEN TG_TABLE_NAME = 'empresas' THEN (base->>'id')::uuid END);
  fil := coalesce(base->>'filial_id', CASE WHEN TG_TABLE_NAME = 'filiais' THEN base->>'id' END);
  IF fil IS NOT NULL THEN SELECT f.codigo || ' · ' || f.nome INTO fil_rotulo FROM public.filiais f WHERE f.id = fil; END IF;
  IF uid IS NOT NULL THEN SELECT coalesce(nullif(p.nome, ''), p.email), p.email INTO nome, email FROM public.profiles p WHERE p.user_id = uid; END IF;

  INSERT INTO public.auditoria_log (empresa_id, user_id, usuario_nome, usuario_email, tabela, registro_id, acao, alvo, filial, mudancas, origem)
  VALUES (
    emp, uid, nome, email, TG_TABLE_NAME,
    coalesce(base->>'id', base->>'user_id'),
    acao,
    left(coalesce(base->>'codigo', base->>'nome', base->>'titulo', base->>'email', base->>'numero', base->>'tipo'), 160),
    coalesce(fil_rotulo, fil),
    CASE WHEN mud = '{}'::jsonb THEN NULL ELSE mud END,
    CASE WHEN auth.uid() IS NULL THEN 'servidor' ELSE 'app' END
  );
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION private.registrar_auditoria() FROM PUBLIC, anon, authenticated;

-- Evento do app (não altera tabela): só os tipos conhecidos, sempre em nome de quem está logado.
CREATE OR REPLACE FUNCTION public.registrar_evento(acao text, alvo text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  uid uuid := (SELECT auth.uid());
  nome text;
  email text;
  emp uuid;
  fil text;
BEGIN
  IF uid IS NULL OR acao NOT IN ('entrou', 'exportou PDF', 'exportou arquivo') THEN RETURN; END IF;
  SELECT coalesce(nullif(p.nome, ''), p.email), p.email, p.empresa_id INTO nome, email, emp FROM public.profiles p WHERE p.user_id = uid;
  SELECT f.codigo || ' · ' || f.nome INTO fil FROM public.profiles p JOIN public.filiais f ON f.id = p.filial_id WHERE p.user_id = uid;
  INSERT INTO public.auditoria_log (empresa_id, user_id, usuario_nome, usuario_email, tabela, acao, alvo, filial, origem)
  VALUES (emp, uid, nome, email, 'evento', acao, left(alvo, 160), fil, 'app');
END;
$$;
REVOKE ALL ON FUNCTION public.registrar_evento(text, text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.registrar_evento(text, text) TO authenticated;

-- Quem abriu continua com o e-mail quando a conta não tem nome.
CREATE OR REPLACE FUNCTION private.marcar_criador()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE uid uuid := (SELECT auth.uid());
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF uid IS NOT NULL THEN
      NEW.criado_por := uid;
      SELECT coalesce(nullif(p.nome, ''), p.email) INTO NEW.criado_por_nome FROM public.profiles p WHERE p.user_id = uid;
    END IF;
    NEW.criado_em := coalesce(NEW.criado_em, now());
  ELSE
    NEW.criado_por := OLD.criado_por;
    NEW.criado_por_nome := OLD.criado_por_nome;
    NEW.criado_em := OLD.criado_em;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.marcar_criador() FROM PUBLIC, anon, authenticated;
