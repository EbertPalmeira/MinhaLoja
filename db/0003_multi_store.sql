-- =====================================================================
-- 0003 — Multi-loja
-- Lojas, membros (admin/vendedor), isolamento por RLS, RPCs com validação
-- de loja, catálogo público por slug e imagens por loja.
--
-- Rode inteira, em uma única transação (o SQL editor do Supabase já faz isso).
-- Dados existentes são migrados para uma loja padrão; veja a seção 2.
-- =====================================================================

-- ===================== 1. LOJAS E MEMBROS =====================
create or replace function public.slugify(_t text)
returns text language sql immutable set search_path = '' as $$
  select trim(both '-' from left(
    regexp_replace(
      translate(lower(coalesce(_t, '')), 'áàâãäéèêëíìîïóòôõöúùûüç', 'aaaaaeeeeiiiiooooouuuuc'),
      '[^a-z0-9]+', '-', 'g'),
    40))
$$;

create table public.stores (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 80),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) between 3 and 40),
  -- contador de vendas por loja (numeração "Venda nº" própria de cada loja)
  last_sale_number bigint not null default 0,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.store_members (
  store_id uuid not null references public.stores(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null,
  created_at timestamptz not null default now(),
  primary key (store_id, user_id)
);
create index store_members_user_idx on public.store_members(user_id);

-- ===================== 2. MIGRAÇÃO DOS DADOS EXISTENTES =====================
-- Se já existe algum dado (produtos, vendas, movimentações ou usuários com papel),
-- cria a "loja padrão" com o nome atual das configurações e leva a equipe junto.
do $$
declare
  v_store uuid;
  v_name text;
  v_slug text;
begin
  if exists (select 1 from public.products)
     or exists (select 1 from public.sales)
     or exists (select 1 from public.stock_movements)
     or exists (select 1 from public.user_roles) then
    select store_name into v_name from public.store_settings where id = 1;
    v_name := coalesce(nullif(trim(v_name), ''), 'Minha Loja');
    v_slug := public.slugify(v_name);
    if length(v_slug) < 3 then v_slug := 'loja'; end if;

    insert into public.stores (name, slug, last_sale_number)
    values (v_name, v_slug, coalesce((select max(number) from public.sales), 0))
    returning id into v_store;

    insert into public.store_members (store_id, user_id, role)
    select v_store, r.user_id,
           (case when bool_or(r.role = 'admin') then 'admin' else 'vendedor' end)::public.app_role
    from public.user_roles r
    group by r.user_id;
  end if;
end $$;

-- ===================== 3. LIMPEZA DO MODELO ANTIGO =====================
-- Remove TODAS as políticas antigas das tabelas do app (serão recriadas por loja).
do $$
declare r record;
begin
  for r in
    select policyname, tablename from pg_policies
    where schemaname = 'public'
      and tablename in ('user_roles','store_settings','products','product_variants',
                        'sales','sale_items','sale_payments','stock_movements')
  loop
    execute format('drop policy %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

drop trigger if exists on_auth_user_created_role on auth.users;
drop function if exists public.handle_new_user_role();

drop function if exists public.list_store_users();
drop function if exists public.set_store_user_role(uuid, text);
drop function if exists public.get_variant_costs();
drop function if exists public.save_product(uuid, text, text, text, boolean, jsonb);
drop function if exists public.delete_product(uuid);
drop function if exists public.register_stock_movement(uuid, text, integer, text);
drop function if exists public.create_sale(uuid, jsonb, numeric, jsonb);
drop function if exists public.cancel_sale(uuid, text);
drop function if exists public.get_sale_details(uuid);
drop function if exists public.dashboard_summary();
drop function if exists public.report_sales(date, date);
drop function if exists public.report_profit(date, date);
drop function if exists public.report_stock();
drop function if exists public.can_manage_catalog(uuid);
drop function if exists public.has_role(uuid, public.app_role);
drop function if exists public.is_staff(uuid);

-- Papéis antigos já foram copiados para store_members: a tabela fica trancada
-- (sem grants e sem políticas) e pode ser apagada depois de você validar a migração.
alter table public.user_roles rename to user_roles_legacy;
revoke all on public.user_roles_legacy from anon, authenticated;

-- ===================== 4. store_id EM TODAS AS TABELAS =====================
alter table public.products          add column store_id uuid, add column if not exists image_url text;
alter table public.product_variants  add column store_id uuid;
alter table public.sales             add column store_id uuid;
alter table public.sale_items        add column store_id uuid;
alter table public.sale_payments     add column store_id uuid;
alter table public.stock_movements   add column store_id uuid;
alter table public.store_settings    add column store_id uuid;

update public.products p set store_id = (select s.id from public.stores s order by s.created_at limit 1);
update public.sales    s set store_id = (select t.id from public.stores t order by t.created_at limit 1);
update public.store_settings set store_id = (select s.id from public.stores s order by s.created_at limit 1);
update public.product_variants v set store_id = p.store_id from public.products p where p.id = v.product_id;
update public.sale_items       i set store_id = s.store_id from public.sales s    where s.id = i.sale_id;
update public.sale_payments    y set store_id = s.store_id from public.sales s    where s.id = y.sale_id;
update public.stock_movements  m set store_id = v.store_id from public.product_variants v where v.id = m.variant_id;

-- Sem nenhuma loja (banco novo): a linha única de configurações não pertence a ninguém.
delete from public.store_settings where store_id is null;

alter table public.products         alter column store_id set not null;
alter table public.product_variants alter column store_id set not null;
alter table public.sales            alter column store_id set not null;
alter table public.sale_items       alter column store_id set not null;
alter table public.sale_payments    alter column store_id set not null;
alter table public.stock_movements  alter column store_id set not null;
alter table public.store_settings   alter column store_id set not null;

-- store_settings: uma linha por loja (a chave deixa de ser o id fixo 1)
alter table public.store_settings drop column id cascade;
alter table public.store_settings
  add primary key (store_id),
  add constraint store_settings_store_fkey foreign key (store_id) references public.stores(id) on delete cascade;

-- Unicidade passa a valer dentro de cada loja
alter table public.products drop constraint products_code_key;
alter table public.product_variants drop constraint product_variants_sku_key;
alter table public.sales drop constraint sales_client_token_key;
alter table public.sales drop constraint sales_number_key;
alter table public.sales alter column number drop identity;

alter table public.products
  add constraint products_store_fkey foreign key (store_id) references public.stores(id) on delete cascade,
  add constraint products_store_code_key unique (store_id, code),
  add constraint products_id_store_key unique (id, store_id);
alter table public.sales
  add constraint sales_store_fkey foreign key (store_id) references public.stores(id) on delete cascade,
  add constraint sales_store_number_key unique (store_id, number),
  add constraint sales_store_token_key unique (store_id, client_token),
  add constraint sales_id_store_key unique (id, store_id);
alter table public.product_variants
  add constraint product_variants_store_sku_key unique (store_id, sku),
  add constraint product_variants_id_store_key unique (id, store_id);

-- Chaves estrangeiras compostas: um filho nunca aponta para pai de OUTRA loja.
alter table public.product_variants drop constraint product_variants_product_id_fkey;
alter table public.product_variants
  add constraint product_variants_product_fkey foreign key (product_id, store_id)
  references public.products(id, store_id) on delete cascade;

alter table public.sale_items drop constraint sale_items_sale_id_fkey;
alter table public.sale_items drop constraint sale_items_variant_id_fkey;
alter table public.sale_items
  add constraint sale_items_sale_fkey foreign key (sale_id, store_id)
    references public.sales(id, store_id) on delete cascade,
  add constraint sale_items_variant_fkey foreign key (variant_id, store_id)
    references public.product_variants(id, store_id);

alter table public.sale_payments drop constraint sale_payments_sale_id_fkey;
alter table public.sale_payments
  add constraint sale_payments_sale_fkey foreign key (sale_id, store_id)
  references public.sales(id, store_id) on delete cascade;

alter table public.stock_movements drop constraint stock_movements_variant_id_fkey;
alter table public.stock_movements drop constraint stock_movements_sale_id_fkey;
alter table public.stock_movements
  add constraint stock_movements_variant_fkey foreign key (variant_id, store_id)
    references public.product_variants(id, store_id) on delete cascade,
  add constraint stock_movements_sale_fkey foreign key (sale_id, store_id)
    references public.sales(id, store_id);

drop index if exists public.sales_created_at_idx;
drop index if exists public.stock_movements_created_idx;
create index sales_store_created_idx on public.sales(store_id, created_at desc);
create index stock_movements_store_created_idx on public.stock_movements(store_id, created_at desc);
create index products_store_idx on public.products(store_id);
create index product_variants_store_idx on public.product_variants(store_id);
create index sale_items_store_idx on public.sale_items(store_id);
create index sale_payments_store_idx on public.sale_payments(store_id);

-- ===================== 5. FUNÇÕES AUXILIARES =====================
create or replace function public.is_store_member(_store_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.store_members m
    where m.store_id = _store_id and m.user_id = auth.uid()
  )
$$;

create or replace function public.is_store_admin(_store_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.store_members m
    where m.store_id = _store_id and m.user_id = auth.uid() and m.role = 'admin'
  )
$$;

-- Quem gerencia produtos e estoque (hoje: administradores da loja).
create or replace function public.can_manage_catalog(_store_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_store_admin(_store_id)
$$;

create or replace function public.try_uuid(_t text)
returns uuid language plpgsql immutable set search_path = '' as $$
begin
  return _t::uuid;
exception when others then
  return null;
end $$;

create or replace function public.log_initial_stock()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.stock > 0 then
    insert into public.stock_movements (store_id, variant_id, movement_type, quantity, stock_after, reason, created_by)
    values (new.store_id, new.id, 'entrada', new.stock, new.stock, 'Estoque inicial', auth.uid());
  end if;
  return new;
end $$;

-- ===================== 6. RLS: ISOLAMENTO POR LOJA =====================
alter table public.stores        enable row level security;
alter table public.store_members enable row level security;

create policy "Membro vê a própria loja" on public.stores
  for select to authenticated using (public.is_store_member(id));
create policy "Vê apenas a própria participação" on public.store_members
  for select to authenticated using (user_id = (select auth.uid()));
create policy "Membros veem configurações" on public.store_settings
  for select to authenticated using (public.is_store_member(store_id));
create policy "Membros veem produtos" on public.products
  for select to authenticated using (public.is_store_member(store_id));
create policy "Membros veem variações" on public.product_variants
  for select to authenticated using (public.is_store_member(store_id));
create policy "Membros veem vendas" on public.sales
  for select to authenticated using (public.is_store_member(store_id));
create policy "Membros veem itens vendidos" on public.sale_items
  for select to authenticated using (public.is_store_member(store_id));
create policy "Membros veem pagamentos" on public.sale_payments
  for select to authenticated using (public.is_store_member(store_id));
create policy "Membros veem movimentações" on public.stock_movements
  for select to authenticated using (public.is_store_member(store_id));
-- Não há políticas de INSERT/UPDATE/DELETE: toda escrita passa pelas RPCs abaixo.

-- ===================== 7. GRANTS (nenhum acesso para anon) =====================
revoke all on public.stores, public.store_members, public.store_settings, public.products,
  public.product_variants, public.sales, public.sale_items, public.sale_payments,
  public.stock_movements from public, anon, authenticated;

grant select (id, name, slug, created_at) on public.stores to authenticated;   -- sem last_sale_number/created_by
grant select on public.store_members to authenticated;
grant select on public.store_settings to authenticated;
grant select on public.products to authenticated;
-- cost_price / unit_cost continuam FORA dos grants: só admins leem custos, via RPC.
grant select (id, store_id, product_id, sku, size, color, sale_price, stock, min_stock, active, created_at, updated_at)
  on public.product_variants to authenticated;
grant select on public.sales to authenticated;
grant select (id, store_id, sale_id, variant_id, product_name, sku, size, color, quantity, unit_price, line_total)
  on public.sale_items to authenticated;
grant select on public.sale_payments to authenticated;
grant select on public.stock_movements to authenticated;

grant all on public.stores, public.store_members to service_role;

-- ===================== 7b. LOJAS E EQUIPE (RPCs) =====================
create or replace function public.create_store(p_name text, p_slug text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_name text := trim(coalesce(p_name, ''));
  v_slug text;
  v_id uuid;
begin
  if v_uid is null or coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    raise exception 'Acesso não autorizado';
  end if;
  if length(v_name) < 1 or length(v_name) > 80 then
    raise exception 'Informe o nome da loja (até 80 caracteres)';
  end if;
  if (select count(*) from public.stores where created_by = v_uid) >= 5 then
    raise exception 'Limite de 5 lojas criadas por usuário atingido';
  end if;
  v_slug := coalesce(nullif(public.slugify(p_slug), ''), public.slugify(v_name));
  if length(v_slug) < 3 then
    raise exception 'Endereço da loja inválido: use ao menos 3 letras ou números';
  end if;

  insert into public.stores (name, slug, created_by) values (v_name, v_slug, v_uid) returning id into v_id;
  insert into public.store_members (store_id, user_id, role) values (v_id, v_uid, 'admin');
  insert into public.store_settings (store_id, store_name) values (v_id, v_name);
  return v_id;
exception when unique_violation then
  raise exception 'Este endereço de loja já está em uso. Escolha outro.';
end $$;

create or replace function public.update_store_settings(
  p_store_id uuid, p_store_name text, p_phone text, p_address text,
  p_logo_url text, p_default_min_stock integer, p_slug text default null
) returns void language plpgsql security definer set search_path = '' as $$
declare
  v_name text := trim(coalesce(p_store_name, ''));
  v_logo text := nullif(trim(coalesce(p_logo_url, '')), '');
  v_slug text := nullif(public.slugify(p_slug), '');
begin
  if not public.is_store_admin(p_store_id) then
    raise exception 'Apenas administradores podem alterar as configurações';
  end if;
  if length(v_name) < 1 or length(v_name) > 80 then raise exception 'Informe o nome da loja'; end if;
  if v_logo is not null and (v_logo !~* '^https://\S+$' or length(v_logo) > 500) then
    raise exception 'O logotipo deve ser um link que começa com https://';
  end if;
  if p_default_min_stock is null or p_default_min_stock < 0 then
    raise exception 'Estoque mínimo padrão inválido';
  end if;
  if p_slug is not null and (v_slug is null or length(v_slug) < 3) then
    raise exception 'Endereço da loja inválido: use ao menos 3 letras ou números';
  end if;

  update public.store_settings set
    store_name = v_name, phone = nullif(trim(coalesce(p_phone, '')), ''),
    address = nullif(trim(coalesce(p_address, '')), ''), logo_url = v_logo,
    default_min_stock = p_default_min_stock
  where store_id = p_store_id;
  update public.stores set name = v_name, slug = coalesce(v_slug, slug) where id = p_store_id;
exception when unique_violation then
  raise exception 'Este endereço de loja já está em uso. Escolha outro.';
end $$;

create or replace function public.list_store_users(p_store_id uuid)
returns table (user_id uuid, email text, created_at timestamptz, role text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_store_admin(p_store_id) then
    raise exception 'Apenas administradores podem ver a equipe';
  end if;
  return query
    select m.user_id, u.email::text, m.created_at, m.role::text
    from public.store_members m join auth.users u on u.id = m.user_id
    where m.store_id = p_store_id
    order by m.created_at;
end $$;

create or replace function public.add_store_user(p_store_id uuid, p_email text, p_role text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_user uuid;
begin
  if not public.is_store_admin(p_store_id) then
    raise exception 'Apenas administradores podem adicionar pessoas à equipe';
  end if;
  if p_role not in ('admin', 'vendedor') then raise exception 'Permissão inválida'; end if;
  select u.id into v_user from auth.users u where lower(u.email) = lower(trim(coalesce(p_email, '')));
  if v_user is null then
    raise exception 'Não há conta com este e-mail. Peça para a pessoa criar a conta e tente de novo.';
  end if;
  if exists (select 1 from public.store_members m where m.store_id = p_store_id and m.user_id = v_user) then
    raise exception 'Esta pessoa já faz parte da equipe';
  end if;
  insert into public.store_members (store_id, user_id, role) values (p_store_id, v_user, p_role::public.app_role);
end $$;

create or replace function public.set_store_user_role(p_store_id uuid, p_user_id uuid, p_role text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_old public.app_role;
begin
  if not public.is_store_admin(p_store_id) then
    raise exception 'Apenas administradores podem alterar permissões';
  end if;
  if p_role not in ('admin', 'vendedor', 'nenhum') then raise exception 'Permissão inválida'; end if;
  if p_user_id = auth.uid() then
    raise exception 'Você não pode alterar o seu próprio acesso';
  end if;
  select m.role into v_old from public.store_members m
    where m.store_id = p_store_id and m.user_id = p_user_id for update;
  if not found then raise exception 'Pessoa não encontrada nesta loja'; end if;
  if p_role = 'nenhum' then
    delete from public.store_members where store_id = p_store_id and user_id = p_user_id;
  else
    update public.store_members set role = p_role::public.app_role
      where store_id = p_store_id and user_id = p_user_id;
  end if;
  if not exists (select 1 from public.store_members m where m.store_id = p_store_id and m.role = 'admin') then
    raise exception 'A loja precisa de ao menos um administrador';
  end if;
end $$;

-- ===================== 8. CATÁLOGO / PRODUTOS =====================
create or replace function public.get_variant_costs(p_store_id uuid)
returns table (variant_id uuid, cost_price numeric)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_store_admin(p_store_id) then
    raise exception 'Apenas administradores podem ver custos';
  end if;
  return query select v.id, v.cost_price from public.product_variants v where v.store_id = p_store_id;
end $$;

create or replace function public.save_product(
  p_store_id uuid, p_product_id uuid, p_name text, p_code text, p_category text,
  p_active boolean, p_variants jsonb, p_image_url text default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_pid uuid := p_product_id;
  v_el jsonb;
  v_code text := nullif(trim(coalesce(p_code, '')), '');
  v_image text := nullif(trim(coalesce(p_image_url, '')), '');
  v_current_image text;
begin
  if not public.can_manage_catalog(p_store_id) then
    raise exception 'Sem permissão para cadastrar produtos';
  end if;
  if p_name is null or length(trim(p_name)) = 0 then raise exception 'Informe o nome do produto'; end if;
  if p_variants is null or jsonb_typeof(p_variants) <> 'array' or jsonb_array_length(p_variants) = 0 then
    raise exception 'Cadastre ao menos um tamanho/cor';
  end if;

  if v_pid is not null then
    select p.image_url into v_current_image from public.products p where p.id = v_pid and p.store_id = p_store_id;
    if not found then raise exception 'Produto não encontrado'; end if;
  end if;
  -- A imagem precisa estar na pasta DESTA loja no bucket (ou ser a que o produto já tinha).
  if v_image is not null and v_image is distinct from v_current_image then
    if v_image !~ ('/storage/v1/object/public/product-images/' || p_store_id::text || '/[A-Za-z0-9._/-]+$')
       or position('..' in v_image) > 0 then
      raise exception 'Imagem inválida: envie a imagem pelo sistema';
    end if;
  end if;

  begin
    if v_pid is null then
      insert into public.products (store_id, name, code, category, active, image_url)
      values (p_store_id, trim(p_name), v_code, coalesce(nullif(trim(p_category), ''), 'Geral'),
              coalesce(p_active, true), v_image)
      returning id into v_pid;
    else
      update public.products
        set name = trim(p_name), code = v_code,
            category = coalesce(nullif(trim(p_category), ''), 'Geral'),
            active = coalesce(p_active, true), image_url = v_image
        where id = v_pid and store_id = p_store_id;
    end if;

    for v_el in select * from jsonb_array_elements(p_variants) loop
      if coalesce((v_el->>'sale_price')::numeric, 0) < 0 or coalesce((v_el->>'cost_price')::numeric, 0) < 0 then
        raise exception 'Preços não podem ser negativos';
      end if;
      if nullif(v_el->>'id', '') is not null then
        update public.product_variants set
          sku = trim(v_el->>'sku'),
          size = coalesce(nullif(trim(v_el->>'size'), ''), 'Único'),
          color = coalesce(trim(v_el->>'color'), ''),
          cost_price = coalesce((v_el->>'cost_price')::numeric, cost_price),
          sale_price = coalesce((v_el->>'sale_price')::numeric, 0),
          min_stock = greatest(coalesce((v_el->>'min_stock')::int, 0), 0),
          active = coalesce((v_el->>'active')::boolean, true)
        where id = (v_el->>'id')::uuid and product_id = v_pid and store_id = p_store_id;
        if not found then raise exception 'Variação não encontrada'; end if;
      else
        if coalesce((v_el->>'stock')::int, 0) < 0 then raise exception 'Estoque inicial não pode ser negativo'; end if;
        insert into public.product_variants (store_id, product_id, sku, size, color, cost_price, sale_price, stock, min_stock, active)
        values (
          p_store_id, v_pid, trim(v_el->>'sku'),
          coalesce(nullif(trim(v_el->>'size'), ''), 'Único'),
          coalesce(trim(v_el->>'color'), ''),
          coalesce((v_el->>'cost_price')::numeric, 0),
          coalesce((v_el->>'sale_price')::numeric, 0),
          coalesce((v_el->>'stock')::int, 0),
          greatest(coalesce((v_el->>'min_stock')::int, 0), 0),
          coalesce((v_el->>'active')::boolean, true)
        );
      end if;
    end loop;
  exception
    when unique_violation then
      raise exception 'Código/SKU já usado por outro produto, ou tamanho e cor repetidos';
    when check_violation then
      raise exception 'Verifique os dados: SKU obrigatório e valores não podem ser negativos';
  end;
  return v_pid;
end $$;

create or replace function public.delete_product(p_store_id uuid, p_product_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.can_manage_catalog(p_store_id) then
    raise exception 'Sem permissão para excluir produtos';
  end if;
  if exists (
    select 1 from public.sale_items i join public.product_variants v on v.id = i.variant_id and v.store_id = i.store_id
    where v.product_id = p_product_id and v.store_id = p_store_id
  ) then
    raise exception 'Este produto já tem vendas registradas. Desative-o em vez de excluir.';
  end if;
  delete from public.products where id = p_product_id and store_id = p_store_id;
end $$;

-- ===================== 9. ESTOQUE =====================
create or replace function public.register_stock_movement(
  p_store_id uuid, p_variant_id uuid, p_type text, p_quantity integer, p_reason text
) returns integer language plpgsql security definer set search_path = '' as $$
declare
  v_stock integer;
  v_delta integer;
  v_new integer;
begin
  if not public.can_manage_catalog(p_store_id) then
    raise exception 'Sem permissão para movimentar o estoque';
  end if;
  if p_type not in ('entrada', 'saida', 'ajuste') then raise exception 'Tipo de movimentação inválido'; end if;
  if p_reason is null or length(trim(p_reason)) < 3 then raise exception 'Informe o motivo da movimentação'; end if;
  if p_quantity is null or p_quantity < 0 or (p_type <> 'ajuste' and p_quantity = 0) then
    raise exception 'Quantidade inválida';
  end if;

  select v.stock into v_stock from public.product_variants v
    where v.id = p_variant_id and v.store_id = p_store_id for update;
  if not found then raise exception 'Produto não encontrado'; end if;

  v_delta := case p_type when 'entrada' then p_quantity when 'saida' then -p_quantity else p_quantity - v_stock end;
  v_new := v_stock + v_delta;
  if v_new < 0 then raise exception 'Saída maior que o estoque disponível (% unidades)', v_stock; end if;
  if v_delta = 0 then raise exception 'A quantidade informada é igual ao estoque atual'; end if;

  update public.product_variants set stock = v_new where id = p_variant_id and store_id = p_store_id;
  insert into public.stock_movements (store_id, variant_id, movement_type, quantity, stock_after, reason, created_by)
  values (p_store_id, p_variant_id, p_type, v_delta, v_new, trim(p_reason), auth.uid());
  return v_new;
end $$;

-- ===================== 10. VENDAS =====================
create or replace function public.create_sale(
  p_store_id uuid, p_client_token uuid, p_items jsonb, p_discount numeric, p_payments jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_item record;
  v_var record;
  v_pay record;
  v_subtotal numeric(12,2) := 0;
  v_discount numeric(12,2) := round(coalesce(p_discount, 0), 2);
  v_total numeric(12,2);
  v_pay_sum numeric(12,2) := 0;
  v_pay_count integer := 0;
  v_count integer := 0;
  v_sale_id uuid;
  v_number bigint;
  v_new_stock integer;
begin
  if v_uid is null or not public.is_store_member(p_store_id) then
    raise exception 'Acesso não autorizado';
  end if;
  if p_client_token is null then raise exception 'Identificador da venda ausente'; end if;

  -- Serializa as vendas da loja: numeração sem buracos e idempotência sem corrida.
  perform 1 from public.stores s where s.id = p_store_id for update;

  select s.id, s.number into v_sale_id, v_number
    from public.sales s where s.store_id = p_store_id and s.client_token = p_client_token;
  if v_sale_id is not null then
    return jsonb_build_object('sale_id', v_sale_id, 'sale_number', v_number, 'duplicate', true);
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Adicione ao menos um produto à venda';
  end if;

  for v_item in
    select (e->>'variant_id')::uuid as variant_id, sum((e->>'quantity')::int)::int as quantity
    from jsonb_array_elements(p_items) e group by 1 order by 1
  loop
    if v_item.quantity is null or v_item.quantity <= 0 then raise exception 'Quantidade inválida'; end if;
    select v.id, v.stock, v.sale_price, v.active, v.size, v.color, p.name, p.active as product_active
      into v_var
      from public.product_variants v join public.products p on p.id = v.product_id and p.store_id = v.store_id
      where v.id = v_item.variant_id and v.store_id = p_store_id
      for update of v;
    if not found then raise exception 'Produto não encontrado'; end if;
    if not v_var.active or not v_var.product_active then
      raise exception 'O produto % está inativo', v_var.name;
    end if;
    if v_var.stock < v_item.quantity then
      raise exception 'Estoque insuficiente para % (% / %): disponível %', v_var.name, v_var.size, v_var.color, v_var.stock;
    end if;
    v_subtotal := v_subtotal + v_var.sale_price * v_item.quantity;
    v_count := v_count + v_item.quantity;
  end loop;

  if v_discount < 0 then raise exception 'Desconto inválido'; end if;
  if v_discount > v_subtotal then raise exception 'O desconto não pode ser maior que o subtotal'; end if;
  v_total := v_subtotal - v_discount;

  if p_payments is null or jsonb_typeof(p_payments) <> 'array' then
    raise exception 'Informe a forma de pagamento';
  end if;
  for v_pay in
    select e->>'method' as method, round((e->>'amount')::numeric, 2) as amount
    from jsonb_array_elements(p_payments) e
  loop
    if v_pay.method is null or v_pay.method not in ('dinheiro', 'pix', 'debito', 'credito', 'outros') then
      raise exception 'Forma de pagamento inválida';
    end if;
    if v_pay.amount is null or v_pay.amount <= 0 then raise exception 'Valor de pagamento inválido'; end if;
    v_pay_sum := v_pay_sum + v_pay.amount;
    v_pay_count := v_pay_count + 1;
  end loop;
  if v_total > 0 and v_pay_count = 0 then raise exception 'Informe a forma de pagamento'; end if;
  if v_pay_sum <> v_total then
    raise exception 'A soma dos pagamentos (R$ %) deve ser igual ao total da venda (R$ %)', v_pay_sum, v_total;
  end if;

  update public.stores set last_sale_number = last_sale_number + 1
    where id = p_store_id returning last_sale_number into v_number;

  insert into public.sales (store_id, number, client_token, subtotal, discount, total, items_count, created_by)
  values (p_store_id, v_number, p_client_token, v_subtotal, v_discount, v_total, v_count, v_uid)
  returning id into v_sale_id;

  for v_item in
    select (e->>'variant_id')::uuid as variant_id, sum((e->>'quantity')::int)::int as quantity
    from jsonb_array_elements(p_items) e group by 1 order by 1
  loop
    insert into public.sale_items (store_id, sale_id, variant_id, product_name, sku, size, color, quantity, unit_price, unit_cost, line_total)
    select p_store_id, v_sale_id, v.id, p.name, v.sku, v.size, v.color, v_item.quantity, v.sale_price, v.cost_price, v.sale_price * v_item.quantity
    from public.product_variants v join public.products p on p.id = v.product_id and p.store_id = v.store_id
    where v.id = v_item.variant_id and v.store_id = p_store_id;

    update public.product_variants set stock = stock - v_item.quantity
      where id = v_item.variant_id and store_id = p_store_id
      returning stock into v_new_stock;

    insert into public.stock_movements (store_id, variant_id, movement_type, quantity, stock_after, reason, sale_id, created_by)
    values (p_store_id, v_item.variant_id, 'venda', -v_item.quantity, v_new_stock, 'Venda nº ' || v_number, v_sale_id, v_uid);
  end loop;

  insert into public.sale_payments (store_id, sale_id, method, amount)
  select p_store_id, v_sale_id, e->>'method', round((e->>'amount')::numeric, 2)
  from jsonb_array_elements(p_payments) e;

  return jsonb_build_object('sale_id', v_sale_id, 'sale_number', v_number, 'total', v_total, 'duplicate', false);
end $$;

create or replace function public.cancel_sale(p_store_id uuid, p_sale_id uuid, p_reason text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_sale record;
  v_item record;
  v_new_stock integer;
begin
  if not public.is_store_admin(p_store_id) then
    raise exception 'Apenas administradores podem cancelar vendas';
  end if;
  if p_reason is null or length(trim(p_reason)) < 3 then
    raise exception 'Informe a justificativa do cancelamento';
  end if;

  select * into v_sale from public.sales s where s.id = p_sale_id and s.store_id = p_store_id for update;
  if not found then raise exception 'Venda não encontrada'; end if;
  if v_sale.status <> 'concluida' then raise exception 'Esta venda já foi cancelada'; end if;

  for v_item in
    select i.variant_id, sum(i.quantity)::int as quantity
    from public.sale_items i where i.sale_id = p_sale_id and i.store_id = p_store_id group by 1 order by 1
  loop
    update public.product_variants set stock = stock + v_item.quantity
      where id = v_item.variant_id and store_id = p_store_id
      returning stock into v_new_stock;
    insert into public.stock_movements (store_id, variant_id, movement_type, quantity, stock_after, reason, sale_id, created_by)
    values (p_store_id, v_item.variant_id, 'cancelamento', v_item.quantity, v_new_stock,
            'Cancelamento da venda nº ' || v_sale.number || ': ' || trim(p_reason), p_sale_id, v_uid);
  end loop;

  update public.sales
    set status = 'cancelada', canceled_at = now(), canceled_by = v_uid, cancel_reason = trim(p_reason)
    where id = p_sale_id and store_id = p_store_id;

  return jsonb_build_object('sale_id', p_sale_id, 'sale_number', v_sale.number);
end $$;

create or replace function public.get_sale_details(p_store_id uuid, p_sale_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_admin boolean;
  v_cost numeric(12,2);
  v jsonb;
begin
  if not public.is_store_member(p_store_id) then raise exception 'Acesso não autorizado'; end if;
  v_admin := public.is_store_admin(p_store_id);
  select coalesce(sum(i.quantity * i.unit_cost), 0) into v_cost
    from public.sale_items i where i.sale_id = p_sale_id and i.store_id = p_store_id;
  select jsonb_build_object(
    'id', s.id, 'number', s.number, 'status', s.status, 'created_at', s.created_at,
    'subtotal', s.subtotal, 'discount', s.discount, 'total', s.total, 'items_count', s.items_count,
    'canceled_at', s.canceled_at, 'cancel_reason', s.cancel_reason,
    'seller_email', (select u.email from auth.users u where u.id = s.created_by),
    'canceled_by_email', (select u.email from auth.users u where u.id = s.canceled_by),
    'total_cost', case when v_admin then v_cost end,
    'gross_profit', case when v_admin then s.total - v_cost end,
    'items', (select coalesce(jsonb_agg(jsonb_build_object(
        'product_name', i.product_name, 'sku', i.sku, 'size', i.size, 'color', i.color,
        'quantity', i.quantity, 'unit_price', i.unit_price, 'line_total', i.line_total,
        'unit_cost', case when v_admin then i.unit_cost end) order by i.product_name, i.size), '[]'::jsonb)
      from public.sale_items i where i.sale_id = s.id and i.store_id = s.store_id),
    'payments', (select coalesce(jsonb_agg(jsonb_build_object('method', p.method, 'amount', p.amount)), '[]'::jsonb)
      from public.sale_payments p where p.sale_id = s.id and p.store_id = s.store_id)
  ) into v
  from public.sales s where s.id = p_sale_id and s.store_id = p_store_id;
  if v is null then raise exception 'Venda não encontrada'; end if;
  return v;
end $$;

-- ===================== 11. DASHBOARD E RELATÓRIOS =====================
create or replace function public.dashboard_summary(p_store_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_admin boolean;
  v_today timestamptz := date_trunc('day', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo';
  v_month timestamptz := date_trunc('month', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo';
  v_rev_month numeric(12,2);
  v_cost_month numeric(12,2);
begin
  if not public.is_store_member(p_store_id) then raise exception 'Acesso não autorizado'; end if;
  v_admin := public.is_store_admin(p_store_id);
  select coalesce(sum(s.total), 0) into v_rev_month
    from public.sales s where s.store_id = p_store_id and s.status = 'concluida' and s.created_at >= v_month;
  select coalesce(sum(i.quantity * i.unit_cost), 0) into v_cost_month
    from public.sale_items i join public.sales s on s.id = i.sale_id and s.store_id = i.store_id
    where s.store_id = p_store_id and s.status = 'concluida' and s.created_at >= v_month;
  return jsonb_build_object(
    'revenue_today', (select coalesce(sum(s.total), 0) from public.sales s where s.store_id = p_store_id and s.status = 'concluida' and s.created_at >= v_today),
    'sales_today', (select count(*) from public.sales s where s.store_id = p_store_id and s.status = 'concluida' and s.created_at >= v_today),
    'revenue_month', v_rev_month,
    'sales_month', (select count(*) from public.sales s where s.store_id = p_store_id and s.status = 'concluida' and s.created_at >= v_month),
    'gross_profit_month', case when v_admin then v_rev_month - v_cost_month end,
    'products_count', (select count(*) from public.products p where p.store_id = p_store_id and p.active),
    'total_pieces', (select coalesce(sum(v.stock), 0) from public.product_variants v
                     join public.products p on p.id = v.product_id and p.store_id = v.store_id
                     where v.store_id = p_store_id and v.active and p.active),
    'low_stock_count', (select count(*) from public.product_variants v
                        join public.products p on p.id = v.product_id and p.store_id = v.store_id
                        where v.store_id = p_store_id and v.active and p.active and v.stock <= v.min_stock),
    'low_stock', (select coalesce(jsonb_agg(x), '[]'::jsonb) from (
        select p.name, v.sku, v.size, v.color, v.stock, v.min_stock
        from public.product_variants v join public.products p on p.id = v.product_id and p.store_id = v.store_id
        where v.store_id = p_store_id and v.active and p.active and v.stock <= v.min_stock
        order by v.stock, p.name limit 10) x)
  );
end $$;

create or replace function public.report_sales(p_store_id uuid, p_start date, p_end date)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_from timestamptz := p_start::timestamp at time zone 'America/Sao_Paulo';
  v_to timestamptz := (p_end + 1)::timestamp at time zone 'America/Sao_Paulo';
  v_count integer;
  v_revenue numeric(12,2);
begin
  if not public.is_store_member(p_store_id) then raise exception 'Acesso não autorizado'; end if;
  if p_start is null or p_end is null or p_end < p_start then raise exception 'Período inválido'; end if;
  select count(*), coalesce(sum(s.total), 0) into v_count, v_revenue
    from public.sales s where s.store_id = p_store_id and s.status = 'concluida' and s.created_at >= v_from and s.created_at < v_to;
  return jsonb_build_object(
    'sales_count', v_count,
    'revenue', v_revenue,
    'gross_total', (select coalesce(sum(s.subtotal), 0) from public.sales s where s.store_id = p_store_id and s.status = 'concluida' and s.created_at >= v_from and s.created_at < v_to),
    'discount_total', (select coalesce(sum(s.discount), 0) from public.sales s where s.store_id = p_store_id and s.status = 'concluida' and s.created_at >= v_from and s.created_at < v_to),
    'avg_ticket', case when v_count > 0 then round(v_revenue / v_count, 2) else 0 end,
    'items_sold', (select coalesce(sum(s.items_count), 0) from public.sales s where s.store_id = p_store_id and s.status = 'concluida' and s.created_at >= v_from and s.created_at < v_to),
    'canceled_count', (select count(*) from public.sales s where s.store_id = p_store_id and s.status = 'cancelada' and s.created_at >= v_from and s.created_at < v_to),
    'canceled_total', (select coalesce(sum(s.total), 0) from public.sales s where s.store_id = p_store_id and s.status = 'cancelada' and s.created_at >= v_from and s.created_at < v_to),
    'by_payment', (select coalesce(jsonb_agg(x order by x.amount desc), '[]'::jsonb) from (
        select p.method, sum(p.amount) as amount, count(distinct p.sale_id) as sales
        from public.sale_payments p join public.sales s on s.id = p.sale_id and s.store_id = p.store_id
        where s.store_id = p_store_id and s.status = 'concluida' and s.created_at >= v_from and s.created_at < v_to
        group by p.method) x),
    'sales', (select coalesce(jsonb_agg(x order by x.created_at), '[]'::jsonb) from (
        select s.number, s.created_at, s.items_count, s.subtotal, s.discount, s.total, s.status,
          (select string_agg(distinct p.method, ',') from public.sale_payments p where p.sale_id = s.id and p.store_id = s.store_id) as methods
        from public.sales s where s.store_id = p_store_id and s.created_at >= v_from and s.created_at < v_to) x)
  );
end $$;

create or replace function public.report_profit(p_store_id uuid, p_start date, p_end date)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_from timestamptz := p_start::timestamp at time zone 'America/Sao_Paulo';
  v_to timestamptz := (p_end + 1)::timestamp at time zone 'America/Sao_Paulo';
  v_revenue numeric(12,2);
  v_gross numeric(12,2);
  v_discount numeric(12,2);
  v_cost numeric(12,2);
begin
  if not public.is_store_admin(p_store_id) then raise exception 'Apenas administradores podem ver lucros'; end if;
  if p_start is null or p_end is null or p_end < p_start then raise exception 'Período inválido'; end if;
  select coalesce(sum(s.total), 0), coalesce(sum(s.subtotal), 0), coalesce(sum(s.discount), 0)
    into v_revenue, v_gross, v_discount
    from public.sales s where s.store_id = p_store_id and s.status = 'concluida' and s.created_at >= v_from and s.created_at < v_to;
  select coalesce(sum(i.quantity * i.unit_cost), 0) into v_cost
    from public.sale_items i join public.sales s on s.id = i.sale_id and s.store_id = i.store_id
    where s.store_id = p_store_id and s.status = 'concluida' and s.created_at >= v_from and s.created_at < v_to;
  return jsonb_build_object(
    'gross_sales', v_gross,
    'discount_total', v_discount,
    'revenue', v_revenue,
    'cost', v_cost,
    'gross_profit', v_revenue - v_cost,
    'margin', case when v_revenue > 0 then round((v_revenue - v_cost) / v_revenue * 100, 2) else 0 end,
    'canceled_count', (select count(*) from public.sales s where s.store_id = p_store_id and s.status = 'cancelada' and s.created_at >= v_from and s.created_at < v_to),
    'canceled_total', (select coalesce(sum(s.total), 0) from public.sales s where s.store_id = p_store_id and s.status = 'cancelada' and s.created_at >= v_from and s.created_at < v_to),
    'products', (select coalesce(jsonb_agg(x order by x.profit desc), '[]'::jsonb) from (
        select i.product_name, i.size, i.color, sum(i.quantity) as quantity,
          sum(i.line_total) as revenue, sum(i.quantity * i.unit_cost) as cost,
          sum(i.line_total) - sum(i.quantity * i.unit_cost) as profit
        from public.sale_items i join public.sales s on s.id = i.sale_id and s.store_id = i.store_id
        where s.store_id = p_store_id and s.status = 'concluida' and s.created_at >= v_from and s.created_at < v_to
        group by i.product_name, i.size, i.color) x)
  );
end $$;

create or replace function public.report_stock(p_store_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_admin boolean;
begin
  if not public.is_store_member(p_store_id) then raise exception 'Acesso não autorizado'; end if;
  v_admin := public.is_store_admin(p_store_id);
  return jsonb_build_object(
    'total_pieces', (select coalesce(sum(v.stock), 0) from public.product_variants v join public.products p on p.id = v.product_id and p.store_id = v.store_id where v.store_id = p_store_id and v.active and p.active),
    'total_cost_value', case when v_admin then (select coalesce(sum(v.stock * v.cost_price), 0) from public.product_variants v join public.products p on p.id = v.product_id and p.store_id = v.store_id where v.store_id = p_store_id and v.active and p.active) end,
    'total_sale_value', (select coalesce(sum(v.stock * v.sale_price), 0) from public.product_variants v join public.products p on p.id = v.product_id and p.store_id = v.store_id where v.store_id = p_store_id and v.active and p.active),
    'low_count', (select count(*) from public.product_variants v join public.products p on p.id = v.product_id and p.store_id = v.store_id where v.store_id = p_store_id and v.active and p.active and v.stock <= v.min_stock and v.stock > 0),
    'zero_count', (select count(*) from public.product_variants v join public.products p on p.id = v.product_id and p.store_id = v.store_id where v.store_id = p_store_id and v.active and p.active and v.stock = 0),
    'rows', (select coalesce(jsonb_agg(x order by x.name, x.size, x.color), '[]'::jsonb) from (
        select p.name, p.category, v.sku, v.size, v.color, v.stock, v.min_stock, v.sale_price,
          case when v_admin then v.cost_price end as cost_price,
          case when v_admin then v.stock * v.cost_price end as cost_value
        from public.product_variants v join public.products p on p.id = v.product_id and p.store_id = v.store_id
        where v.store_id = p_store_id and v.active and p.active) x)
  );
end $$;

-- ===================== 12. CATÁLOGO PÚBLICO (por slug) =====================
-- Única porta de entrada para visitantes anônimos. Expõe somente o necessário:
-- sem custos, SKUs, códigos internos, quantidades de estoque ou ids de variação.
create or replace function public.get_public_catalog(p_slug text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'store', jsonb_build_object(
      'name', cfg.store_name, 'slug', s.slug, 'phone', cfg.phone,
      'address', cfg.address, 'logo_url', cfg.logo_url),
    'products', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id, 'name', p.name, 'category', p.category, 'image_url', p.image_url,
        'variants', (
          select jsonb_agg(jsonb_build_object(
            'size', v.size, 'color', v.color, 'sale_price', v.sale_price, 'in_stock', v.stock > 0)
            order by v.size, v.color)
          from public.product_variants v
          where v.product_id = p.id and v.store_id = p.store_id and v.active)
      ) order by p.name)
      from public.products p
      where p.store_id = s.id and p.active
        and exists (select 1 from public.product_variants v
                    where v.product_id = p.id and v.store_id = p.store_id and v.active)
    ), '[]'::jsonb))
  from public.stores s
  join public.store_settings cfg on cfg.store_id = s.id
  where s.slug = lower(trim(coalesce(p_slug, '')))
$$;

-- ===================== 13. IMAGENS POR LOJA (Storage) =====================
-- Caminho: product-images/<store_id>/<product_id>/<arquivo>.webp
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('product-images', 'product-images', true, 2097152, array['image/webp', 'image/jpeg', 'image/png'])
on conflict (id) do update
  set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

do $$
declare r record;
begin
  for r in
    select policyname from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and (coalesce(qual, '') like '%product-images%' or coalesce(with_check, '') like '%product-images%')
  loop
    execute format('drop policy %I on storage.objects', r.policyname);
  end loop;
end $$;

create policy "Admin envia imagens da própria loja" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'product-images'
    and public.is_store_admin(public.try_uuid((storage.foldername(name))[1])));
create policy "Admin altera imagens da própria loja" on storage.objects
  for update to authenticated
  using (bucket_id = 'product-images'
    and public.is_store_admin(public.try_uuid((storage.foldername(name))[1])))
  with check (bucket_id = 'product-images'
    and public.is_store_admin(public.try_uuid((storage.foldername(name))[1])));
create policy "Admin apaga imagens da própria loja" on storage.objects
  for delete to authenticated
  using (bucket_id = 'product-images'
    and public.is_store_admin(public.try_uuid((storage.foldername(name))[1])));
create policy "Membros listam imagens da própria loja" on storage.objects
  for select to authenticated
  using (bucket_id = 'product-images'
    and public.is_store_member(public.try_uuid((storage.foldername(name))[1])));
-- Leitura pública: o bucket é público (URL direta), mas anônimos não conseguem LISTAR objetos.

-- ===================== 14. EXECUTE DAS FUNÇÕES =====================
revoke all on function
  public.slugify(text), public.is_store_member(uuid), public.is_store_admin(uuid),
  public.can_manage_catalog(uuid), public.try_uuid(text), public.log_initial_stock(),
  public.create_store(text, text),
  public.update_store_settings(uuid, text, text, text, text, integer, text),
  public.list_store_users(uuid), public.add_store_user(uuid, text, text),
  public.set_store_user_role(uuid, uuid, text), public.get_variant_costs(uuid),
  public.save_product(uuid, uuid, text, text, text, boolean, jsonb, text),
  public.delete_product(uuid, uuid), public.register_stock_movement(uuid, uuid, text, integer, text),
  public.create_sale(uuid, uuid, jsonb, numeric, jsonb), public.cancel_sale(uuid, uuid, text),
  public.get_sale_details(uuid, uuid), public.dashboard_summary(uuid),
  public.report_sales(uuid, date, date), public.report_profit(uuid, date, date),
  public.report_stock(uuid), public.get_public_catalog(text)
from public, anon;
revoke all on function public.log_initial_stock() from authenticated;

grant execute on function
  public.is_store_member(uuid), public.is_store_admin(uuid), public.can_manage_catalog(uuid),
  public.try_uuid(text),
  public.create_store(text, text),
  public.update_store_settings(uuid, text, text, text, text, integer, text),
  public.list_store_users(uuid), public.add_store_user(uuid, text, text),
  public.set_store_user_role(uuid, uuid, text), public.get_variant_costs(uuid),
  public.save_product(uuid, uuid, text, text, text, boolean, jsonb, text),
  public.delete_product(uuid, uuid), public.register_stock_movement(uuid, uuid, text, integer, text),
  public.create_sale(uuid, uuid, jsonb, numeric, jsonb), public.cancel_sale(uuid, uuid, text),
  public.get_sale_details(uuid, uuid), public.dashboard_summary(uuid),
  public.report_sales(uuid, date, date), public.report_profit(uuid, date, date),
  public.report_stock(uuid)
to authenticated;

-- O catálogo público é a única função liberada para anônimos.
grant execute on function public.get_public_catalog(text) to anon, authenticated;
