-- Correção de 20261123000200: dentro de SECURITY DEFINER o current_user é o dono da função (nunca 'authenticated'),
-- então a trava não agia. Como gatilho comum (invoker), current_user é quem gravou.
ALTER FUNCTION private.proteger_visitando() SECURITY INVOKER;
