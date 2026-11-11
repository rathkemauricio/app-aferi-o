-- Tempos e Movimentos: tipo de veículo atendido (id do catálogo app_config 'tm.veiculos'; vazio = não informado).
ALTER TABLE public.tm_atendimentos ADD COLUMN IF NOT EXISTS veiculo text NOT NULL DEFAULT '';
