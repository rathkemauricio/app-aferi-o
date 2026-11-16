-- Coleta: preço de venda junto com o custo.
-- Ao abrir o inventário entram dois PDFs do mesmo relatório do Petros (Conferência de Estoque): um com o custo
-- unitário e outro com o preço de venda. Os dois são ligados pelo código interno.
ALTER TABLE public.ce_produtos ADD COLUMN IF NOT EXISTS preco_venda numeric;
ALTER TABLE public.ce_inventarios ADD COLUMN IF NOT EXISTS arquivo_venda text NOT NULL DEFAULT '';
