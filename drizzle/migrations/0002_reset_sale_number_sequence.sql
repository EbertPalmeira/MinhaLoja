do $$
begin
  if not exists (select 1 from public.sales) then
    alter table public.sales alter column number restart with 1;
  end if;
end $$;