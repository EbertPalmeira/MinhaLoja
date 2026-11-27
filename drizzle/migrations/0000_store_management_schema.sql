-- ===================== ROLES =====================
create type public.app_role as enum ('admin', 'vendedor');

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);
grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;

create or replace function public.is_staff(_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id)
$$;

-- Who may manage products and stock (currently: admins only)
create or replace function public.can_manage_catalog(_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_role(_user_id, 'admin')
$$;

create policy "Ver o próprio papel; admin vê todos" on public.user_roles
for select to authenticated
using (user_id = auth.uid() or public.has_role(auth.uid(), 'admin'));

create or replace function public.handle_new_user_role()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform pg_advisory_xact_lock(hashtext('store_first_admin'));
  if not exists (select 1 from public.user_roles where role = 'admin') then
    insert into public.user_roles (user_id, role) values (new.id, 'admin');
  end if;
  return new;
end; $$;

create trigger on_auth_user_created_role
after insert on auth.users
for each row execute function public.handle_new_user_role();

create or replace function public.list_store_users()
returns table (user_id uuid, email text, created_at timestamptz, role text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.has_role(auth.uid(), 'admin') then
    raise exception 'Apenas administradores podem ver os usuários';
  end if;
  return query
    select u.id, u.email::text, u.created_at,
      coalesce((select r.role::text from public.user_roles r where r.user_id = u.id
                order by case r.role when 'admin' then 0 else 1 end limit 1), 'nenhum')
    from auth.users u
    order by u.created_at;
end; $$;

create or replace function public.set_store_user_role(p_user_id uuid, p_role text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.has_role(auth.uid(), 'admin') then
    raise exception 'Apenas administradores podem alterar permissões';
  end if;
  if p_role not in ('admin', 'vendedor', 'nenhum') then
    raise exception 'Permissão inválida';
  end if;
  if p_user_id = auth.uid() and p_role <> 'admin' then
    raise exception 'Você não pode remover seu próprio acesso de administrador';
  end if;
  delete from public.user_roles where user_id = p_user_id;
  if p_role <> 'nenhum' then
    insert into public.user_roles (user_id, role) values (p_user_id, p_role::public.app_role);
  end if;
end; $$;

-- ===================== SHARED =====================
create or replace function public.touch_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  return new;
end; $$;

-- ===================== SETTINGS =====================
create table public.store_settings (
  id smallint primary key default 1 check (id = 1),
  store_name text not null default 'Minha Loja' check (length(trim(store_name)) > 0),
  phone text,
  address text,
  logo_url text,
  default_min_stock integer not null default 2 check (default_min_stock >= 0),
  updated_at timestamptz not null default now()
);
grant select, update on public.store_settings to authenticated;
grant all on public.store_settings to service_role;
alter table public.store_settings enable row level security;
create policy "Equipe vê configurações" on public.store_settings
for select to authenticated using (public.is_staff(auth.uid()));
create policy "Admin edita configurações" on public.store_settings
for update to authenticated
using (public.has_role(auth.uid(), 'admin'))
with check (public.has_role(auth.uid(), 'admin'));
create trigger store_settings_touch before update on public.store_settings
for each row execute function public.touch_updated_at();
insert into public.store_settings (id) values (1);

-- ===================== PRODUCTS =====================
create table public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  code text unique,
  category text not null default 'Geral',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select on public.products to authenticated;
grant all on public.products to service_role;
alter table public.products enable row level security;
create policy "Equipe vê produtos" on public.products
for select to authenticated using (public.is_staff(auth.uid()));
create trigger products_touch before update on public.products
for each row execute function public.touch_updated_at();

create table public.product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  sku text not null unique check (length(trim(sku)) > 0),
  size text not null default 'Único',
  color text not null default '',
  cost_price numeric(12,2) not null default 0 check (cost_price >= 0),
  sale_price numeric(12,2) not null default 0 check (sale_price >= 0),
  stock integer not null default 0 check (stock >= 0),
  min_stock integer not null default 0 check (min_stock >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (product_id, size, color)
);
create index product_variants_product_idx on public.product_variants(product_id);
-- cost_price is intentionally NOT readable by the app role; admins read it through get_variant_costs()
grant select (id, product_id, sku, size, color, sale_price, stock, min_stock, active, created_at, updated_at)
  on public.product_variants to authenticated;
grant all on public.product_variants to service_role;
alter table public.product_variants enable row level security;
create policy "Equipe vê variações" on public.product_variants
for select to authenticated using (public.is_staff(auth.uid()));

-- ===================== SALES =====================
create table public.sales (
  id uuid primary key default gen_random_uuid(),
  number bigint generated always as identity unique,
  client_token uuid not null unique,
  status text not null default 'concluida' check (status in ('concluida', 'cancelada')),
  subtotal numeric(12,2) not null check (subtotal >= 0),
  discount numeric(12,2) not null default 0 check (discount >= 0),
  total numeric(12,2) not null check (total >= 0),
  items_count integer not null check (items_count > 0),
  created_by uuid not null,
  created_at timestamptz not null default now(),
  canceled_at timestamptz,
  canceled_by uuid,
  cancel_reason text
);
create index sales_created_at_idx on public.sales(created_at desc);
grant select on public.sales to authenticated;
grant all on public.sales to service_role;
alter table public.sales enable row level security;
create policy "Equipe vê vendas" on public.sales
for select to authenticated using (public.is_staff(auth.uid()));

create table public.sale_items (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales(id) on delete cascade,
  variant_id uuid not null references public.product_variants(id) on delete restrict,
  product_name text not null,
  sku text not null,
  size text not null,
  color text not null,
  quantity integer not null check (quantity > 0),
  unit_price numeric(12,2) not null check (unit_price >= 0),
  unit_cost numeric(12,2) not null check (unit_cost >= 0),
  line_total numeric(12,2) not null check (line_total >= 0)
);
create index sale_items_sale_idx on public.sale_items(sale_id);
create index sale_items_variant_idx on public.sale_items(variant_id);
-- unit_cost is intentionally NOT readable by the app role
grant select (id, sale_id, variant_id, product_name, sku, size, color, quantity, unit_price, line_total)
  on public.sale_items to authenticated;
grant all on public.sale_items to service_role;
alter table public.sale_items enable row level security;
create policy "Equipe vê itens vendidos" on public.sale_items
for select to authenticated using (public.is_staff(auth.uid()));

create table public.sale_payments (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales(id) on delete cascade,
  method text not null check (method in ('dinheiro', 'pix', 'debito', 'credito', 'outros')),
  amount numeric(12,2) not null check (amount > 0)
);
create index sale_payments_sale_idx on public.sale_payments(sale_id);
grant select on public.sale_payments to authenticated;
grant all on public.sale_payments to service_role;
alter table public.sale_payments enable row level security;
create policy "Equipe vê pagamentos" on public.sale_payments
for select to authenticated using (public.is_staff(auth.uid()));

-- ===================== STOCK MOVEMENTS =====================
create table public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  variant_id uuid not null references public.product_variants(id) on delete cascade,
  movement_type text not null check (movement_type in ('entrada', 'saida', 'ajuste', 'venda', 'cancelamento')),
  quantity integer not null,
  stock_after integer not null,
  reason text not null,
  sale_id uuid references public.sales(id) on delete set null,
  created_by uuid,
  created_at timestamptz not null default now()
);
create index stock_movements_variant_idx on public.stock_movements(variant_id);
create index stock_movements_created_idx on public.stock_movements(created_at desc);
grant select on public.stock_movements to authenticated;
grant all on public.stock_movements to service_role;
alter table public.stock_movements enable row level security;
create policy "Equipe vê movimentações" on public.stock_movements
for select to authenticated using (public.is_staff(auth.uid()));

create or replace function public.log_initial_stock()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.stock > 0 then
    insert into public.stock_movements (variant_id, movement_type, quantity, stock_after, reason, created_by)
    values (new.id, 'entrada', new.stock, new.stock, 'Estoque inicial', auth.uid());
  end if;
  return new;
end; $$;
create trigger product_variants_initial_stock after insert on public.product_variants
for each row execute function public.log_initial_stock();
create trigger product_variants_touch before update on public.product_variants
for each row execute function public.touch_updated_at();

-- ===================== CATALOG RPCs =====================
create or replace function public.get_variant_costs()
returns table (variant_id uuid, cost_price numeric)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.has_role(auth.uid(), 'admin') then
    raise exception 'Apenas administradores podem ver custos';
  end if;
  return query select v.id, v.cost_price from public.product_variants v;
end; $$;

create or replace function public.save_product(
  p_product_id uuid, p_name text, p_code text, p_category text, p_active boolean, p_variants jsonb
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_pid uuid := p_product_id;
  v_el jsonb;
  v_code text := nullif(trim(coalesce(p_code, '')), '');
begin
  if not public.can_manage_catalog(auth.uid()) then
    raise exception 'Sem permissão para cadastrar produtos';
  end if;
  if p_name is null or length(trim(p_name)) = 0 then
    raise exception 'Informe o nome do produto';
  end if;
  if p_variants is null or jsonb_typeof(p_variants) <> 'array' or jsonb_array_length(p_variants) = 0 then
    raise exception 'Cadastre ao menos um tamanho/cor';
  end if;

  begin
    if v_pid is null then
      insert into public.products (name, code, category, active)
      values (trim(p_name), v_code, coalesce(nullif(trim(p_category), ''), 'Geral'), coalesce(p_active, true))
      returning id into v_pid;
    else
      update public.products
        set name = trim(p_name), code = v_code,
            category = coalesce(nullif(trim(p_category), ''), 'Geral'),
            active = coalesce(p_active, true)
        where id = v_pid;
      if not found then raise exception 'Produto não encontrado'; end if;
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
        where id = (v_el->>'id')::uuid and product_id = v_pid;
        if not found then raise exception 'Variação não encontrada'; end if;
      else
        if coalesce((v_el->>'stock')::int, 0) < 0 then
          raise exception 'Estoque inicial não pode ser negativo';
        end if;
        insert into public.product_variants (product_id, sku, size, color, cost_price, sale_price, stock, min_stock, active)
        values (
          v_pid, trim(v_el->>'sku'),
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
end; $$;

create or replace function public.delete_product(p_product_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.can_manage_catalog(auth.uid()) then
    raise exception 'Sem permissão para excluir produtos';
  end if;
  if exists (
    select 1 from public.sale_items i join public.product_variants v on v.id = i.variant_id
    where v.product_id = p_product_id
  ) then
    raise exception 'Este produto já tem vendas registradas. Desative-o em vez de excluir.';
  end if;
  delete from public.products where id = p_product_id;
end; $$;

-- ===================== STOCK RPC =====================
create or replace function public.register_stock_movement(
  p_variant_id uuid, p_type text, p_quantity integer, p_reason text
) returns integer language plpgsql security definer set search_path = public as $$
declare
  v_stock integer;
  v_delta integer;
  v_new integer;
begin
  if not public.can_manage_catalog(auth.uid()) then
    raise exception 'Sem permissão para movimentar o estoque';
  end if;
  if p_type not in ('entrada', 'saida', 'ajuste') then
    raise exception 'Tipo de movimentação inválido';
  end if;
  if p_reason is null or length(trim(p_reason)) < 3 then
    raise exception 'Informe o motivo da movimentação';
  end if;
  if p_quantity is null or p_quantity < 0 or (p_type <> 'ajuste' and p_quantity = 0) then
    raise exception 'Quantidade inválida';
  end if;

  select stock into v_stock from public.product_variants where id = p_variant_id for update;
  if not found then raise exception 'Produto não encontrado'; end if;

  v_delta := case p_type when 'entrada' then p_quantity when 'saida' then -p_quantity else p_quantity - v_stock end;
  v_new := v_stock + v_delta;
  if v_new < 0 then
    raise exception 'Saída maior que o estoque disponível (% unidades)', v_stock;
  end if;
  if v_delta = 0 then
    raise exception 'A quantidade informada é igual ao estoque atual';
  end if;

  update public.product_variants set stock = v_new where id = p_variant_id;
  insert into public.stock_movements (variant_id, movement_type, quantity, stock_after, reason, created_by)
  values (p_variant_id, p_type, v_delta, v_new, trim(p_reason), auth.uid());
  return v_new;
end; $$;

-- ===================== SALES RPCs =====================
create or replace function public.create_sale(
  p_client_token uuid, p_items jsonb, p_discount numeric, p_payments jsonb
) returns jsonb language plpgsql security definer set search_path = public as $$
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
  if v_uid is null or not public.is_staff(v_uid) then
    raise exception 'Acesso não autorizado';
  end if;
  if p_client_token is null then
    raise exception 'Identificador da venda ausente';
  end if;

  select id, number into v_sale_id, v_number from public.sales where client_token = p_client_token;
  if v_sale_id is not null then
    return jsonb_build_object('sale_id', v_sale_id, 'sale_number', v_number, 'duplicate', true);
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Adicione ao menos um produto à venda';
  end if;

  -- Lock rows in a stable order and validate stock
  for v_item in
    select (e->>'variant_id')::uuid as variant_id, sum((e->>'quantity')::int)::int as quantity
    from jsonb_array_elements(p_items) e group by 1 order by 1
  loop
    if v_item.quantity is null or v_item.quantity <= 0 then
      raise exception 'Quantidade inválida';
    end if;
    select v.id, v.stock, v.sale_price, v.active, v.size, v.color, p.name, p.active as product_active
      into v_var
      from public.product_variants v join public.products p on p.id = v.product_id
      where v.id = v_item.variant_id
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
    if v_pay.amount is null or v_pay.amount <= 0 then
      raise exception 'Valor de pagamento inválido';
    end if;
    v_pay_sum := v_pay_sum + v_pay.amount;
    v_pay_count := v_pay_count + 1;
  end loop;
  if v_total > 0 and v_pay_count = 0 then
    raise exception 'Informe a forma de pagamento';
  end if;
  if v_pay_sum <> v_total then
    raise exception 'A soma dos pagamentos (R$ %) deve ser igual ao total da venda (R$ %)', v_pay_sum, v_total;
  end if;

  insert into public.sales (client_token, subtotal, discount, total, items_count, created_by)
  values (p_client_token, v_subtotal, v_discount, v_total, v_count, v_uid)
  on conflict (client_token) do nothing
  returning id, number into v_sale_id, v_number;

  if v_sale_id is null then
    select id, number into v_sale_id, v_number from public.sales where client_token = p_client_token;
    return jsonb_build_object('sale_id', v_sale_id, 'sale_number', v_number, 'duplicate', true);
  end if;

  for v_item in
    select (e->>'variant_id')::uuid as variant_id, sum((e->>'quantity')::int)::int as quantity
    from jsonb_array_elements(p_items) e group by 1 order by 1
  loop
    insert into public.sale_items (sale_id, variant_id, product_name, sku, size, color, quantity, unit_price, unit_cost, line_total)
    select v_sale_id, v.id, p.name, v.sku, v.size, v.color, v_item.quantity, v.sale_price, v.cost_price, v.sale_price * v_item.quantity
    from public.product_variants v join public.products p on p.id = v.product_id
    where v.id = v_item.variant_id;

    update public.product_variants set stock = stock - v_item.quantity
      where id = v_item.variant_id
      returning stock into v_new_stock;

    insert into public.stock_movements (variant_id, movement_type, quantity, stock_after, reason, sale_id, created_by)
    values (v_item.variant_id, 'venda', -v_item.quantity, v_new_stock, 'Venda nº ' || v_number, v_sale_id, v_uid);
  end loop;

  insert into public.sale_payments (sale_id, method, amount)
  select v_sale_id, e->>'method', round((e->>'amount')::numeric, 2)
  from jsonb_array_elements(p_payments) e;

  return jsonb_build_object('sale_id', v_sale_id, 'sale_number', v_number, 'total', v_total, 'duplicate', false);
end; $$;

create or replace function public.cancel_sale(p_sale_id uuid, p_reason text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_sale record;
  v_item record;
  v_new_stock integer;
begin
  if not public.has_role(v_uid, 'admin') then
    raise exception 'Apenas administradores podem cancelar vendas';
  end if;
  if p_reason is null or length(trim(p_reason)) < 3 then
    raise exception 'Informe a justificativa do cancelamento';
  end if;

  select * into v_sale from public.sales where id = p_sale_id for update;
  if not found then raise exception 'Venda não encontrada'; end if;
  if v_sale.status <> 'concluida' then
    raise exception 'Esta venda já foi cancelada';
  end if;

  for v_item in
    select variant_id, sum(quantity)::int as quantity
    from public.sale_items where sale_id = p_sale_id group by 1 order by 1
  loop
    update public.product_variants set stock = stock + v_item.quantity
      where id = v_item.variant_id
      returning stock into v_new_stock;
    insert into public.stock_movements (variant_id, movement_type, quantity, stock_after, reason, sale_id, created_by)
    values (v_item.variant_id, 'cancelamento', v_item.quantity, v_new_stock,
            'Cancelamento da venda nº ' || v_sale.number || ': ' || trim(p_reason), p_sale_id, v_uid);
  end loop;

  update public.sales
    set status = 'cancelada', canceled_at = now(), canceled_by = v_uid, cancel_reason = trim(p_reason)
    where id = p_sale_id;

  return jsonb_build_object('sale_id', p_sale_id, 'sale_number', v_sale.number);
end; $$;

create or replace function public.get_sale_details(p_sale_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_admin boolean := public.has_role(auth.uid(), 'admin');
  v_cost numeric(12,2);
  v jsonb;
begin
  if not public.is_staff(auth.uid()) then raise exception 'Acesso não autorizado'; end if;
  select coalesce(sum(quantity * unit_cost), 0) into v_cost from public.sale_items where sale_id = p_sale_id;
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
      from public.sale_items i where i.sale_id = s.id),
    'payments', (select coalesce(jsonb_agg(jsonb_build_object('method', p.method, 'amount', p.amount)), '[]'::jsonb)
      from public.sale_payments p where p.sale_id = s.id)
  ) into v
  from public.sales s where s.id = p_sale_id;
  if v is null then raise exception 'Venda não encontrada'; end if;
  return v;
end; $$;

-- ===================== DASHBOARD & REPORTS =====================
create or replace function public.dashboard_summary()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_admin boolean := public.has_role(auth.uid(), 'admin');
  v_today timestamptz := date_trunc('day', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo';
  v_month timestamptz := date_trunc('month', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo';
  v_rev_month numeric(12,2);
  v_cost_month numeric(12,2);
begin
  if not public.is_staff(auth.uid()) then raise exception 'Acesso não autorizado'; end if;
  select coalesce(sum(total), 0) into v_rev_month from public.sales where status = 'concluida' and created_at >= v_month;
  select coalesce(sum(i.quantity * i.unit_cost), 0) into v_cost_month
    from public.sale_items i join public.sales s on s.id = i.sale_id
    where s.status = 'concluida' and s.created_at >= v_month;
  return jsonb_build_object(
    'revenue_today', (select coalesce(sum(total), 0) from public.sales where status = 'concluida' and created_at >= v_today),
    'sales_today', (select count(*) from public.sales where status = 'concluida' and created_at >= v_today),
    'revenue_month', v_rev_month,
    'sales_month', (select count(*) from public.sales where status = 'concluida' and created_at >= v_month),
    'gross_profit_month', case when v_admin then v_rev_month - v_cost_month end,
    'products_count', (select count(*) from public.products where active),
    'total_pieces', (select coalesce(sum(v.stock), 0) from public.product_variants v
                     join public.products p on p.id = v.product_id where v.active and p.active),
    'low_stock_count', (select count(*) from public.product_variants v
                        join public.products p on p.id = v.product_id
                        where v.active and p.active and v.stock <= v.min_stock),
    'low_stock', (select coalesce(jsonb_agg(x), '[]'::jsonb) from (
        select p.name, v.sku, v.size, v.color, v.stock, v.min_stock
        from public.product_variants v join public.products p on p.id = v.product_id
        where v.active and p.active and v.stock <= v.min_stock
        order by v.stock, p.name limit 10) x)
  );
end; $$;

create or replace function public.report_sales(p_start date, p_end date)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_from timestamptz := p_start::timestamp at time zone 'America/Sao_Paulo';
  v_to timestamptz := (p_end + 1)::timestamp at time zone 'America/Sao_Paulo';
  v_count integer;
  v_revenue numeric(12,2);
begin
  if not public.is_staff(auth.uid()) then raise exception 'Acesso não autorizado'; end if;
  if p_start is null or p_end is null or p_end < p_start then raise exception 'Período inválido'; end if;
  select count(*), coalesce(sum(total), 0) into v_count, v_revenue
    from public.sales where status = 'concluida' and created_at >= v_from and created_at < v_to;
  return jsonb_build_object(
    'sales_count', v_count,
    'revenue', v_revenue,
    'gross_total', (select coalesce(sum(subtotal), 0) from public.sales where status = 'concluida' and created_at >= v_from and created_at < v_to),
    'discount_total', (select coalesce(sum(discount), 0) from public.sales where status = 'concluida' and created_at >= v_from and created_at < v_to),
    'avg_ticket', case when v_count > 0 then round(v_revenue / v_count, 2) else 0 end,
    'items_sold', (select coalesce(sum(items_count), 0) from public.sales where status = 'concluida' and created_at >= v_from and created_at < v_to),
    'canceled_count', (select count(*) from public.sales where status = 'cancelada' and created_at >= v_from and created_at < v_to),
    'canceled_total', (select coalesce(sum(total), 0) from public.sales where status = 'cancelada' and created_at >= v_from and created_at < v_to),
    'by_payment', (select coalesce(jsonb_agg(x order by x.amount desc), '[]'::jsonb) from (
        select p.method, sum(p.amount) as amount, count(distinct p.sale_id) as sales
        from public.sale_payments p join public.sales s on s.id = p.sale_id
        where s.status = 'concluida' and s.created_at >= v_from and s.created_at < v_to
        group by p.method) x),
    'sales', (select coalesce(jsonb_agg(x order by x.created_at), '[]'::jsonb) from (
        select s.number, s.created_at, s.items_count, s.subtotal, s.discount, s.total, s.status,
          (select string_agg(distinct p.method, ',') from public.sale_payments p where p.sale_id = s.id) as methods
        from public.sales s where s.created_at >= v_from and s.created_at < v_to) x)
  );
end; $$;

create or replace function public.report_profit(p_start date, p_end date)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_from timestamptz := p_start::timestamp at time zone 'America/Sao_Paulo';
  v_to timestamptz := (p_end + 1)::timestamp at time zone 'America/Sao_Paulo';
  v_revenue numeric(12,2);
  v_gross numeric(12,2);
  v_discount numeric(12,2);
  v_cost numeric(12,2);
begin
  if not public.has_role(auth.uid(), 'admin') then raise exception 'Apenas administradores podem ver lucros'; end if;
  if p_start is null or p_end is null or p_end < p_start then raise exception 'Período inválido'; end if;
  select coalesce(sum(total), 0), coalesce(sum(subtotal), 0), coalesce(sum(discount), 0)
    into v_revenue, v_gross, v_discount
    from public.sales where status = 'concluida' and created_at >= v_from and created_at < v_to;
  select coalesce(sum(i.quantity * i.unit_cost), 0) into v_cost
    from public.sale_items i join public.sales s on s.id = i.sale_id
    where s.status = 'concluida' and s.created_at >= v_from and s.created_at < v_to;
  return jsonb_build_object(
    'gross_sales', v_gross,
    'discount_total', v_discount,
    'revenue', v_revenue,
    'cost', v_cost,
    'gross_profit', v_revenue - v_cost,
    'margin', case when v_revenue > 0 then round((v_revenue - v_cost) / v_revenue * 100, 2) else 0 end,
    'canceled_count', (select count(*) from public.sales where status = 'cancelada' and created_at >= v_from and created_at < v_to),
    'canceled_total', (select coalesce(sum(total), 0) from public.sales where status = 'cancelada' and created_at >= v_from and created_at < v_to),
    'products', (select coalesce(jsonb_agg(x order by x.profit desc), '[]'::jsonb) from (
        select i.product_name, i.size, i.color, sum(i.quantity) as quantity,
          sum(i.line_total) as revenue, sum(i.quantity * i.unit_cost) as cost,
          sum(i.line_total) - sum(i.quantity * i.unit_cost) as profit
        from public.sale_items i join public.sales s on s.id = i.sale_id
        where s.status = 'concluida' and s.created_at >= v_from and s.created_at < v_to
        group by i.product_name, i.size, i.color) x)
  );
end; $$;

create or replace function public.report_stock()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_admin boolean := public.has_role(auth.uid(), 'admin');
begin
  if not public.is_staff(auth.uid()) then raise exception 'Acesso não autorizado'; end if;
  return jsonb_build_object(
    'total_pieces', (select coalesce(sum(v.stock), 0) from public.product_variants v join public.products p on p.id = v.product_id where v.active and p.active),
    'total_cost_value', case when v_admin then (select coalesce(sum(v.stock * v.cost_price), 0) from public.product_variants v join public.products p on p.id = v.product_id where v.active and p.active) end,
    'total_sale_value', (select coalesce(sum(v.stock * v.sale_price), 0) from public.product_variants v join public.products p on p.id = v.product_id where v.active and p.active),
    'low_count', (select count(*) from public.product_variants v join public.products p on p.id = v.product_id where v.active and p.active and v.stock <= v.min_stock and v.stock > 0),
    'zero_count', (select count(*) from public.product_variants v join public.products p on p.id = v.product_id where v.active and p.active and v.stock = 0),
    'rows', (select coalesce(jsonb_agg(x order by x.name, x.size, x.color), '[]'::jsonb) from (
        select p.name, p.category, v.sku, v.size, v.color, v.stock, v.min_stock, v.sale_price,
          case when v_admin then v.cost_price end as cost_price,
          case when v_admin then v.stock * v.cost_price end as cost_value
        from public.product_variants v join public.products p on p.id = v.product_id
        where v.active and p.active) x)
  );
end; $$;

-- ===================== FUNCTION EXECUTE GRANTS =====================
revoke all on function public.list_store_users() from public, anon;
revoke all on function public.set_store_user_role(uuid, text) from public, anon;
revoke all on function public.get_variant_costs() from public, anon;
revoke all on function public.save_product(uuid, text, text, text, boolean, jsonb) from public, anon;
revoke all on function public.delete_product(uuid) from public, anon;
revoke all on function public.register_stock_movement(uuid, text, integer, text) from public, anon;
revoke all on function public.create_sale(uuid, jsonb, numeric, jsonb) from public, anon;
revoke all on function public.cancel_sale(uuid, text) from public, anon;
revoke all on function public.get_sale_details(uuid) from public, anon;
revoke all on function public.dashboard_summary() from public, anon;
revoke all on function public.report_sales(date, date) from public, anon;
revoke all on function public.report_profit(date, date) from public, anon;
revoke all on function public.report_stock() from public, anon;
revoke all on function public.handle_new_user_role() from public, anon, authenticated;
revoke all on function public.log_initial_stock() from public, anon, authenticated;

grant execute on function public.list_store_users() to authenticated;
grant execute on function public.set_store_user_role(uuid, text) to authenticated;
grant execute on function public.get_variant_costs() to authenticated;
grant execute on function public.save_product(uuid, text, text, text, boolean, jsonb) to authenticated;
grant execute on function public.delete_product(uuid) to authenticated;
grant execute on function public.register_stock_movement(uuid, text, integer, text) to authenticated;
grant execute on function public.create_sale(uuid, jsonb, numeric, jsonb) to authenticated;
grant execute on function public.cancel_sale(uuid, text) to authenticated;
grant execute on function public.get_sale_details(uuid) to authenticated;
grant execute on function public.dashboard_summary() to authenticated;
grant execute on function public.report_sales(date, date) to authenticated;
grant execute on function public.report_profit(date, date) to authenticated;
grant execute on function public.report_stock() to authenticated;
