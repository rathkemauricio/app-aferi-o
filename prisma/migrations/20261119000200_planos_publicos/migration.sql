-- Planos visíveis para visitantes (site, sem login): a regra de leitura chama private.dono_plataforma(),
-- que para visitante sempre devolve falso, mas precisa poder ser executada.
GRANT EXECUTE ON FUNCTION private.dono_plataforma() TO anon;
