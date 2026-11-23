-- Análise com IA em segundo plano: o pedido volta na hora (sem estourar o tempo limite do servidor) e o app acompanha
-- a situação. Falhas ficam gravadas com a mensagem, para o usuário ver o motivo e para diagnóstico.
ALTER TABLE public.tm_analises_ia ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pronta';
ALTER TABLE public.tm_analises_ia ADD COLUMN IF NOT EXISTS erro text;
ALTER TABLE public.tm_analises_ia ALTER COLUMN resultado DROP NOT NULL;
ALTER TABLE public.tm_analises_ia ALTER COLUMN modelo DROP NOT NULL;
