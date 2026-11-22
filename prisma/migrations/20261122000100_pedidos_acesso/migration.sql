-- Pedidos de acesso a uma rede: a conta sem empresa escolhe uma rede que já usa o EasyAudit e pede para entrar.
-- O pedido NÃO liga a conta à empresa: profiles.empresa_id só muda quando o administrador da rede aprova
-- (pela função "usuarios"), então quem pede não vê nenhum dado da rede antes disso.
--
-- Leitura: a própria conta vê os pedidos dela; o administrador ativo vê os pedidos da própria empresa.
-- Gravação (pedir, cancelar, aprovar, recusar): só o servidor (funções "empresas" e "usuarios").

CREATE TABLE IF NOT EXISTS public.pedidos_acesso (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  email text NOT NULL DEFAULT '',
  nome text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'aceito', 'recusado', 'cancelado')),
  created_at timestamptz NOT NULL DEFAULT now(),
  decidido_em timestamptz,
  decidido_por uuid REFERENCES auth.users (id) ON DELETE SET NULL
);
-- Um pedido aberto por conta (pedir outra rede cancela o anterior).
CREATE UNIQUE INDEX IF NOT EXISTS pedidos_acesso_um_pendente ON public.pedidos_acesso (user_id) WHERE status = 'pendente';
CREATE INDEX IF NOT EXISTS pedidos_acesso_empresa_idx ON public.pedidos_acesso (empresa_id, status);

ALTER TABLE public.pedidos_acesso ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Pedido proprio ou da empresa" ON public.pedidos_acesso;
CREATE POLICY "Pedido proprio ou da empresa" ON public.pedidos_acesso FOR SELECT TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    OR (empresa_id = (SELECT private.minha_empresa()) AND (SELECT private.is_nevoeiro_admin()))
  );
REVOKE ALL ON public.pedidos_acesso FROM anon, authenticated;
GRANT SELECT ON public.pedidos_acesso TO authenticated;
