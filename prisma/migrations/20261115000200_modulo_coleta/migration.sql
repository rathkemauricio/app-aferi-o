-- Módulo Coleta (Contagem de Estoque): inventário por filial com até 3 contagens por grupo de categorias.
-- Produtos e saldos vêm do ERP (Petros/Adaptive: por enquanto arquivo exportado; depois API) e ficam congelados
-- no inventário (ce_produtos). As leituras do coletor são somadas por item, rodada e aparelho (ce_coletas):
-- cada aparelho só grava as próprias linhas, então vários coletores contam juntos sem conflito.

CREATE TABLE IF NOT EXISTS public.ce_inventarios (
  id text PRIMARY KEY,
  codigo text NOT NULL,
  filial_id text NOT NULL REFERENCES public.filiais (id),
  tipo text NOT NULL DEFAULT 'completo' CHECK (tipo IN ('completo', 'parcial')),
  status text NOT NULL DEFAULT 'aberto' CHECK (status IN ('carregando', 'aberto', 'encerrado')),
  fonte text NOT NULL DEFAULT 'arquivo' CHECK (fonte IN ('arquivo', 'petros')),
  arquivo text NOT NULL DEFAULT '',
  itens_total integer NOT NULL DEFAULT 0,
  erp_em timestamptz,
  encerrado_em timestamptz,
  enviado_erp_em timestamptz,
  criado_por uuid DEFAULT auth.uid(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
CREATE INDEX IF NOT EXISTS ce_inventarios_updated_idx ON public.ce_inventarios (updated_at);

CREATE TABLE IF NOT EXISTS public.ce_produtos (
  inventario_id text NOT NULL REFERENCES public.ce_inventarios (id) ON DELETE CASCADE,
  codigo text NOT NULL,
  eans text[] NOT NULL DEFAULT '{}',
  nome text NOT NULL DEFAULT '',
  categoria text NOT NULL DEFAULT '',
  classe text NOT NULL DEFAULT 'conveniencia' CHECK (classe IN ('pista', 'conveniencia')),
  saldo numeric NOT NULL DEFAULT 0,
  custo numeric,
  PRIMARY KEY (inventario_id, codigo)
);

CREATE TABLE IF NOT EXISTS public.ce_contagens (
  id text PRIMARY KEY,
  inventario_id text NOT NULL REFERENCES public.ce_inventarios (id) ON DELETE CASCADE,
  nome text NOT NULL DEFAULT '',
  classe text NOT NULL DEFAULT 'completa' CHECK (classe IN ('completa', 'pista', 'conveniencia', 'mista')),
  categorias text[] NOT NULL DEFAULT '{}',
  rodadas jsonb NOT NULL DEFAULT '["andamento","aguardando","aguardando"]'::jsonb,
  criado_por uuid DEFAULT auth.uid(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
CREATE INDEX IF NOT EXISTS ce_contagens_inv_idx ON public.ce_contagens (inventario_id);
CREATE INDEX IF NOT EXISTS ce_contagens_updated_idx ON public.ce_contagens (updated_at);

CREATE TABLE IF NOT EXISTS public.ce_coletas (
  id text PRIMARY KEY, -- contagem:rodada:codigo:aparelho
  inventario_id text NOT NULL REFERENCES public.ce_inventarios (id) ON DELETE CASCADE,
  contagem_id text NOT NULL REFERENCES public.ce_contagens (id) ON DELETE CASCADE,
  rodada smallint NOT NULL CHECK (rodada BETWEEN 1 AND 3),
  codigo text NOT NULL,
  qtd numeric NOT NULL DEFAULT 0,
  hist jsonb NOT NULL DEFAULT '[]'::jsonb,
  dispositivo text NOT NULL DEFAULT '',
  usuario uuid DEFAULT auth.uid(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
CREATE INDEX IF NOT EXISTS ce_coletas_inv_updated_idx ON public.ce_coletas (inventario_id, updated_at);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['ce_inventarios', 'ce_contagens', 'ce_coletas'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', t || '_touch', t);
    EXECUTE format('CREATE TRIGGER %I BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION private.touch_updated_at()', t || '_touch', t);
  END LOOP;
  FOREACH t IN ARRAY ARRAY['ce_inventarios', 'ce_contagens', 'ce_coletas', 'ce_produtos'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS "Modulo coleta le" ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS "Modulo coleta insere" ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS "Modulo coleta altera" ON public.%I', t);
    EXECUTE format('CREATE POLICY "Modulo coleta le" ON public.%I FOR SELECT TO authenticated USING ((SELECT private.tem_modulo(''coleta'')))', t);
    EXECUTE format('CREATE POLICY "Modulo coleta insere" ON public.%I FOR INSERT TO authenticated WITH CHECK ((SELECT private.tem_modulo(''coleta'')))', t);
    EXECUTE format('CREATE POLICY "Modulo coleta altera" ON public.%I FOR UPDATE TO authenticated USING ((SELECT private.tem_modulo(''coleta''))) WITH CHECK ((SELECT private.tem_modulo(''coleta'')))', t);
  END LOOP;
END $$;
