-- Contagem cega (23/11/2026): quem conta (não administrador) não vê o saldo do Petros até a contagem terminar;
-- concluída, não pode ser reaberta. As versões antigas do app ignoram a coluna (padrão: contagem aberta).
ALTER TABLE public.ce_contagens ADD COLUMN IF NOT EXISTS cega boolean NOT NULL DEFAULT false;
