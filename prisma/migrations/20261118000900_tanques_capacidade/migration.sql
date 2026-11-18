-- Medição de Tanques: capacidade nominal de cada tanque (do documento da filial). Bi/tripartido: cada
-- compartimento é um tanque com número próprio (ex.: tanques 3, 4 e 5 de um tripartido); "combustiveis" fica sem uso.
ALTER TABLE public.tq_tanques ADD COLUMN IF NOT EXISTS capacidade numeric;
