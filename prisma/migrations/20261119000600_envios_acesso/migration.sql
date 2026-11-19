-- Controle dos e-mails de acesso (recuperar senha, confirmar cadastro) enviados pela função "acesso":
-- o mesmo e-mail não recebe outro link do mesmo tipo em menos de 1 minuto. Só o servidor lê e grava.
CREATE TABLE IF NOT EXISTS public.envios_acesso (
  email text NOT NULL,
  tipo text NOT NULL,
  enviado_em timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (email, tipo)
);
ALTER TABLE public.envios_acesso ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.envios_acesso FROM anon, authenticated;
