-- Nome do inventário (25/11/2026): opcional, escolhido por quem abre; o código (INV-2026-005) continua sendo a
-- identificação. As versões antigas do app ignoram a coluna (padrão: sem nome).
ALTER TABLE public.ce_inventarios ADD COLUMN IF NOT EXISTS nome text NOT NULL DEFAULT '';
