revoke all on public.user_roles, public.store_settings, public.products, public.product_variants,
  public.sales, public.sale_items, public.sale_payments, public.stock_movements from anon, authenticated;

grant select on public.user_roles to authenticated;
grant select, update on public.store_settings to authenticated;
grant select on public.products to authenticated;
grant select (id, product_id, sku, size, color, sale_price, stock, min_stock, active, created_at, updated_at)
  on public.product_variants to authenticated;
grant select on public.sales to authenticated;
grant select (id, sale_id, variant_id, product_name, sku, size, color, quantity, unit_price, line_total)
  on public.sale_items to authenticated;
grant select on public.sale_payments to authenticated;
grant select on public.stock_movements to authenticated;
