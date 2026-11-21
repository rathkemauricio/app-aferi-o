-- Coleta: intervalos de pausa de cada contagem ([{ de, ate, por }]), para mostrar quanto tempo ficou pausada.
ALTER TABLE public.ce_contagens ADD COLUMN IF NOT EXISTS pausas jsonb NOT NULL DEFAULT '[]'::jsonb;
