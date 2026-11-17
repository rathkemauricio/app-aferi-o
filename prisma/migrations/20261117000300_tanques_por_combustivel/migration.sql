-- Medição de Tanques: a venda (e o recebimento) é unificada por combustível — com mais de um tanque do mesmo
-- combustível não dá para atribuir a venda a cada tanque. A conferência passa a ser por combustível:
--   total = Σ litros dos tanques + venda;  resultado = Σ informada + recebimento − total.
-- combustiveis = [{ combustivel, venda, recebimento }]. Medições antigas (venda/recebimento por tanque) são somadas no app.
ALTER TABLE public.tq_medicoes ADD COLUMN IF NOT EXISTS combustiveis jsonb NOT NULL DEFAULT '[]'::jsonb;
