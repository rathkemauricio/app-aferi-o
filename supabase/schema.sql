-- Execute no SQL Editor do seu projeto Supabase.
create table if not exists public.service_records (
  id text primary key,
  branch text not null,
  service_date date not null,
  status text not null check (status in ('open', 'done')),
  payload jsonb not null,
  updated_at timestamptz not null default now()
);

create index if not exists service_records_branch_date_idx
  on public.service_records (branch, service_date desc);

alter table public.service_records enable row level security;

-- Registros visíveis e editáveis apenas por usuários autenticados no projeto.
create policy "Authenticated users can read service records"
  on public.service_records for select to authenticated using (true);
create policy "Authenticated users can create service records"
  on public.service_records for insert to authenticated with check (true);
create policy "Authenticated users can update service records"
  on public.service_records for update to authenticated using (true) with check (true);
create policy "Authenticated users can delete service records"
  on public.service_records for delete to authenticated using (true);

alter publication supabase_realtime add table public.service_records;
