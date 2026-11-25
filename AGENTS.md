<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.

## What Lovable manages

Rules outside this block are the project's own. Change the pieces below in
Lovable, not by hand. With the [Lovable MCP](https://mcp.lovable.dev)
connected, `send_message` asks Lovable to do it; otherwise ask the user to
use the editor.

- **Database.** Do not add or edit `supabase/migrations/` or `drizzle/`.
  Ask Lovable to change the schema.
- **Generated files.** Do not edit a file whose header says it is automatically
  generated.
- **AI gateway.** Keep model calls on Lovable's gateway, and keep
  `LOVABLE_API_KEY` out of browser code.
- **Connectors.** Lovable provides native connectors. `list_connectors` shows
  which are enabled; `add_connector` only returns the dashboard link. When a
  connector is enabled, calls go through the connector gateway and need
  `LOVABLE_API_KEY`. When Lovable does not provide one, users can bring their
  own key and store it in Secrets.
- **Secrets.** Lovable manages them. Do not put secret values in the repo.
<!-- LOVABLE:END -->

## Project rules

- All writes to products, variants, stock, sales and user roles go through `security definer` RPCs in the database (save_product, register_stock_movement, create_sale, cancel_sale, set_store_user_role); the app role only has SELECT on those tables. Why: keeps stock, sale and audit trail consistent and race-safe in one transaction.
- Cost columns (`product_variants.cost_price`, `sale_items.unit_cost`) are excluded from the app role's column grants; admins read costs only via RPCs (get_variant_costs, get_sale_details, report_*). Why: sellers must never see costs/profit, even through the Data API.
- New public tables get default ALL grants for anon/authenticated on this backend: always REVOKE first, then GRANT exactly what is needed. Why: column-level grants are ineffective while table-level grants exist.
- `can_manage_catalog()` in SQL and `Me.canManageCatalog` in `src/lib/session.ts` define who manages products/stock; change both together. Why: single switch for that permission.
- Sale idempotency uses a client-generated `client_token` (unique) per cart. Why: prevents duplicate sales from repeated clicks/retries.
- Dates/periods are interpreted in America/Sao_Paulo both in SQL reports and in `src/lib/format.ts`. Why: day/month totals must match the store's local calendar.
- Money math in the UI uses the cent-based helpers in `src/lib/calc.ts` (covered by `calc.test.ts`). Why: avoids floating-point errors in totals and payments.
- Protected pages live under `src/routes/_authenticated/` (client-only gate); `/` redirects to `/dashboard`.
