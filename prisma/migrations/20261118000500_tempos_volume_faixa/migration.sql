-- Tempos e Movimentos: volume do atendimento por faixa (≥ ou ≤ um valor em litros: 10, 20, 30 …).
-- `volume` guarda o valor da faixa; `volume_faixa` guarda o sinal ('≥' ou '≤'; vazio = volume exato, registros antigos).
ALTER TABLE public.tm_atendimentos ADD COLUMN IF NOT EXISTS volume_faixa text NOT NULL DEFAULT '';
