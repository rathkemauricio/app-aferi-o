-- Coleta: contagem pausada (não recebe leituras até ser retomada).
ALTER TABLE public.ce_contagens ADD COLUMN IF NOT EXISTS pausada boolean NOT NULL DEFAULT false;
