-- Medição de Tanques: tipo do tanque (simples, bipartido, tripartido), combustível de cada compartimento
-- e marca/modelo (como no PDF da tabela). Cada compartimento é medido à parte (3A, 3B …) e tem sua tabela.
ALTER TABLE public.tq_tanques ADD COLUMN IF NOT EXISTS tipo text NOT NULL DEFAULT 'simples';
ALTER TABLE public.tq_tanques ADD COLUMN IF NOT EXISTS combustiveis jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.tq_tanques ADD COLUMN IF NOT EXISTS modelo text NOT NULL DEFAULT '';
