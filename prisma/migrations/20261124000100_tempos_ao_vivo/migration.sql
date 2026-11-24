-- Tempos e Movimentos ao vivo (24/11/2026).
--
-- O aparelho que cronometra manda na presença (atividade.dados.cronometros) os cronômetros abertos: coleta, atividade
-- atual, início da etapa e pausa. Esta função entrega só essa parte, das contas online da rede em uso, para as telas de
-- coleta mostrarem quem está cronometrando o quê com o relógio correndo.
-- Qualquer conta com o módulo Tempos lê (a tabela presenca continua só para o administrador e o dono): sem e-mail,
-- sem tela, só o nome de quem cronometra e os cronômetros. O dono em visita vê a rede visitada (minha_empresa).
CREATE OR REPLACE FUNCTION public.tempos_ao_vivo()
RETURNS TABLE (user_id uuid, nome text, cronometros jsonb, visto_em timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT p.user_id, p.nome, p.atividade -> 'dados' -> 'cronometros', p.visto_em
  FROM public.presenca p
  WHERE (SELECT private.tem_modulo('tempos'))
    AND p.empresa_id = (SELECT private.minha_empresa())
    AND p.visto_em > now() - interval '2 minutes'
    AND p.atividade ->> 'modulo' = 'tempos'
    AND jsonb_typeof(p.atividade -> 'dados' -> 'cronometros') = 'array';
$$;
REVOKE ALL ON FUNCTION public.tempos_ao_vivo() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tempos_ao_vivo() TO authenticated;
