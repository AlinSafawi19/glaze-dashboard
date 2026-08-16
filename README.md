# Glaze Dashboard

Admin dashboard and content API for the Glaze store. It owns the catalogue, the
orders and the customer accounts, and serves them to the storefront over a
key-guarded `/api/v1`.

It replaces a generic CMS backing (a `fields` definition plus an untyped
`values` blob per entry) with real Postgres tables. The public API still emits
the old CMS's exact JSON shape — Canopy field names like `"Cover img 1"`,
numbers as strings — so the storefront cutover is an env-var change and rolling
back is the same change in reverse.

## Stack

Next.js 16 (App Router, server actions) · React 19 · TypeScript · Tailwind 4 ·
Prisma 6 / PostgreSQL 16 · `jose` sessions · Zod validation · Resend email.

## Getting started

Requires Node 20+ and Docker.

```bash
npm install
cp .env.example .env      # then fill in SESSION_SECRET — see below
npm run db:up             # Postgres 16 in Docker, host port 5435
npm run db:deploy         # apply migrations
npm run db:seed           # catalogue, owner account, storefront API key
npm run dev               # http://localhost:3002
```

`SESSION_SECRET` signs the dashboard session cookie and must be at least 32
characters:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

The seed prints the owner password and the storefront API key **once** if you
left `SEED_OWNER_PASSWORD` and `SEED_API_KEY` blank — copy them out of that
output. Set them in `.env` instead if you want stable values across resets.
Seeding upserts by slug, so re-running it is safe.

### Environment

Every variable is documented inline in [.env.example](.env.example). The ones
without defaults:

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Postgres connection. Matches `docker-compose.yml` as shipped. |
| `SESSION_SECRET` | Signs the dashboard session cookie. Required, 32+ chars. |
| `STOREFRONT_ORIGINS` | Comma-separated origins allowed to call `/api/v1` from a browser. |
| `RESEND_API_KEY` | Leave blank to skip order emails; the in-dashboard notification still fires. |

### Scripts

| | |
| --- | --- |
| `npm run dev` / `build` / `start` | Next.js, port 3002 |
| `npm run lint` / `typecheck` | ESLint · `tsc --noEmit` |
| `npm run db:up` / `db:down` | Start / stop the Postgres container |
| `npm run db:migrate` / `db:deploy` | New migration (dev) · apply existing (deploy) |
| `npm run db:seed` / `db:reset` | Seed · drop, re-migrate and re-seed |
| `npm run db:studio` | Prisma Studio |

The Compose volume is named `glaze_pg_data` and only reads the `POSTGRES_*`
values while it is empty. Changing the database user or name means recreating
it (`docker compose down -v`), not just editing the file.

## What's in the dashboard

Signed-in staff manage products, brands, categories, collections, skin types,
ticker items and utility pages, plus orders and customer accounts. Records are
archived rather than deleted, so nothing that an order references disappears.

- **Overview** — revenue chart, best sellers, recent orders.
- **Orders** — five statuses (Pending, Confirmed, Shipped, Delivered,
  Cancelled), with line items priced as they were at checkout.
- **Customers** — accounts, saved carts and wishlists, order history.
- **Settings** — staff, sessions and storefront API keys.
- **CSV** — every collection exports at `/api/export/<resource>`; add
  `?sample=1` for a one-row column template. Import runs the same columns back.
  Staff session required, not an API key.

## Public API

Base path `/api/v1/glaze`, bearer API key on every request:

```bash
curl -H "Authorization: Bearer $GLAZE_API_KEY" \
  "http://localhost:3002/api/v1/glaze/products?page=1&limit=20"
```

| Route | |
| --- | --- |
| `GET /api/v1/glaze` | Schema discovery — collections, fields, entry counts. |
| `GET /api/v1/glaze/{collection}` | `products`, `brands`, `categories`, `collections`, `skin-types`, `ticker`, `utility-pages`. Paginated, `limit` capped at 100. |
| `POST /api/v1/glaze/orders` | Checkout. Notifies the dashboard and emails the owner. |
| `POST /api/v1/glaze/account/{action}` | `register`, `login`, `logout`, `profile`, `cart`, `wishlist`. |
| `GET /api/v1/glaze/account/{action}` | `me`, `orders`, `cart`, `wishlist`. |

Archived rows are never exposed. Orders are write-only over this API — they
carry addresses and phone numbers, so a storefront key cannot read them back.

Two credentials do two different jobs on the account routes: the bearer key says
*this is the Glaze storefront*, and `X-Customer-Token` says *and this is the
shopper it is acting for*. A leaked key alone cannot reach anyone's account. The
storefront calls these from its own server and keeps the customer token in an
httpOnly cookie.

## Notes on the data model

Full commentary lives in [prisma/schema.prisma](prisma/schema.prisma). The
decisions worth knowing up front:

- **Staff and shoppers are separate.** `User`/`Session` is dashboard staff,
  `Customer`/`CustomerSession` is storefront shoppers. They never share a login,
  a session table or a password policy.
- **Orders are snapshots.** Each line stores the slug, title and unit price as
  bought, so editing a product later never rewrites history. A deleted product
  nulls the link instead of cascading.
- **"Best seller" is earned, not set.** It's derived from order volume at read
  time; only "New in" and "Limited" are flags staff tick.
- **Money is `Decimal(10,2)`**, never a float.
- Passwords are bcrypt-hashed; session tokens and API keys are stored only as
  hashes, alongside a short prefix for display.
