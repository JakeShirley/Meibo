# Contact Book

A web app for browsing, editing, and exporting contacts stored in a PocketBase database. Built with React, TypeScript, Tailwind CSS, Leaflet, and an Express API server.

## Features

- **Browse contacts** with sortable columns, search, and pagination
- **CRUD** for contacts, addresses, and group tags
- **Map view** with Leaflet + OpenStreetMap (addresses geocoded via Nominatim on save)
- **Group Tags** — contacts grouped by tag with collapsible accordion UI
- **Export** to CSV or JSON
- **Theming** — Light, Dracula, and Cherry Blossom (with animated falling pixel petals)

## Architecture

```
┌─────────┐        ┌──────────────────────────────────────┐
│         │  HTTP   │          Express (port 3001)          │
│ Browser │◄──────►│                                      │
│  (React)│        │  /api/contacts    ──► PocketBase     │
│         │        │  /api/addresses   ──► PocketBase     │
└─────────┘        │  /api/tags        ──► PocketBase     │
                   │  /api/schema/*    ──► PocketBase     │
                   │  /api/auth/login  ──► PocketBase     │
                   │  /api/carddav/*   ──► Radicale       │
                   │  /api/geocode     ──► Mapbox         │
                   │  /api/contacts/:id/link ──► PB + Radicale
                   │  /api/contacts/:id/merge──► PB + Radicale
                   └──────────────────────────────────────┘
                          │            │            │
                   ┌──────┘     ┌──────┘     ┌──────┘
                   ▼            ▼            ▼
              PocketBase    Radicale      Mapbox
              (contacts,    (CardDAV      (geocoding)
               addresses,   address
               tags)        books)
```

The browser **never talks directly** to PocketBase, Radicale, or Mapbox. Every user action is a single REST call to the Express server, which orchestrates the backing services internally:

- **Editing a linked contact** → `PATCH /api/contacts/:id` → Express updates PocketBase, then auto-syncs the linked CardDAV vCard on Radicale
- **Merging & linking** → `POST /api/contacts/:id/merge` → Express fetches both PB and CardDAV data, applies field selections, writes to both, and saves the link
- **Creating an address** → `POST /api/addresses` → Express geocodes via Mapbox, injects lat/lon, then creates the record in PocketBase

### API Surface

| Resource | Endpoints | Description |
|---|---|---|
| **Auth** | `POST /api/auth/login` | Optional app login, returns a bearer token when configured |
| **Schema** | `GET /api/schema/{contacts,addresses,tags}` | Normalized field definitions with pre-resolved relation options |
| **Contacts** | `GET/POST /api/contacts`, `GET/PATCH/DELETE /api/contacts/:id` | CRUD with enriched responses (link status, photos inline) |
| **Contact Linking** | `POST /api/contacts/:id/link`, `POST .../link/create`, `DELETE .../link`, `POST .../merge` | Single-call link, create+link, unlink, merge+link |
| **Contact Utilities** | `GET /api/contacts/map`, `GET /api/contacts/export` | Map pin data, server-side CSV/JSON export |
| **Addresses** | `GET/POST /api/addresses`, `GET/PATCH/DELETE /api/addresses/:id` | CRUD with auto-geocoding on create/update |
| **Address Utilities** | `POST /api/addresses/:id/rehydrate`, `GET /api/addresses/export` | Re-geocode, export |
| **Tags** | `GET/POST /api/tags`, `PATCH/DELETE /api/tags/:id`, `GET /api/tags/export` | Group tag CRUD + export |
| **CardDAV** | `GET /api/carddav/address-books`, `GET /api/carddav/contacts` | Read-only CardDAV browsing |
| **Geocode** | `GET /api/geocode?q=` | Forward geocode via Mapbox |

- **`client/`** — React frontend (Vite + Tailwind CSS v4). Uses a typed fetch-based API client (`client/lib/api.ts`) — no PocketBase SDK
- **`server/`** — Express API server that owns all PocketBase, Radicale, and Mapbox interactions
- **`scripts/`** — One-off migration and backfill scripts

The Express server keeps PocketBase admin credentials and Radicale auth server-side, auto-geocodes addresses on save, and auto-syncs linked contacts to CardDAV on edit.

If `CONTACT_BOOK_AUTH_USERNAME` and `CONTACT_BOOK_AUTH_PASSWORD` are configured, every `/api/*` endpoint except the login endpoint requires the bearer token issued by `POST /api/auth/login`.

## Prerequisites

- [Node.js](https://nodejs.org/) v20+
- A running [PocketBase](https://pocketbase.io/) instance with the contact collections

## Setup

1. **Install dependencies**

   ```sh
   npm install
   ```

2. **Configure environment**

   Copy `.env.example` to `.env` and fill in your values:

   ```sh
   cp .env.example .env
   ```

   ```env
   POCKETBASE_URL=http://127.0.0.1:8090
   PB_ADMIN_EMAIL=admin@example.com
   PB_ADMIN_PASSWORD=your-password
   MAPBOX_ACCESS_TOKEN=pk.your_token_here
   SERVER_PORT=3001
   CONTACT_BOOK_AUTH_USERNAME=
   CONTACT_BOOK_AUTH_PASSWORD=
   VITE_PB_COLLECTION=contacts
   ```

   To require sign-in to the app and API, set both `CONTACT_BOOK_AUTH_USERNAME` and `CONTACT_BOOK_AUTH_PASSWORD`. Leave both blank to run without app-level auth. The server fails fast if only one of them is set.

3. **Mapbox setup** (for geocoding)

   - Create a free account at [mapbox.com](https://www.mapbox.com/)
   - Go to [Account → Access Tokens](https://account.mapbox.com/access-tokens/)
   - Copy your **Default public token** (starts with `pk.`) — no special scopes needed
   - Paste it as `MAPBOX_ACCESS_TOKEN` in `.env`
   - Free tier includes 100K geocoding requests/month

## Development

Start both the Express API server and Vite dev server:

```sh
# Terminal 1 — API server
npm run dev:server

# Terminal 2 — Vite frontend
npm run dev
```

Or if you have `concurrently` installed:

```sh
npm run dev:all
```

Then open `http://localhost:5173` in your browser.

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start Vite dev server |
| `npm run dev:server` | Start Express API server with hot reload |
| `npm run dev:all` | Start both concurrently |
| `npm run build` | Type-check + production build |
| `npm run server` | Start Express in production mode |

### Migration / Backfill Scripts

```sh
# Backfill geocode data for existing addresses
node scripts/backfill-geocode.mjs
```

## Project Structure

```
contact_book/
├── client/                  # React frontend
│   ├── components/          # UI components
│   ├── hooks/               # React hooks (useContacts, useCollection, useLinks, useCardDav, useTheme)
│   ├── lib/
│   │   ├── api.ts           # Typed fetch-based API client (replaces PocketBase SDK)
│   │   ├── geocode.ts       # Client-side geocode helper
│   │   └── export.ts        # CSV/JSON export utilities
│   ├── types/               # TypeScript types
│   ├── index.css            # Tailwind + theme variables
│   ├── main.tsx             # App entrypoint
│   └── App.tsx              # Root component with tab navigation
├── server/                  # Express API server
│   ├── config.ts            # Environment config
│   ├── index.ts             # Server entrypoint + route registration
│   ├── routes/
│   │   ├── auth.ts          # Admin auth (credentials server-side)
│   │   ├── contacts.ts      # Contacts CRUD + link/merge/export/map
│   │   ├── addresses.ts     # Address CRUD with auto-geocoding + rehydrate
│   │   ├── tags.ts          # Group tag CRUD + export
│   │   ├── schema.ts        # Normalized schema endpoints
│   │   ├── carddav.ts       # CardDAV address book & contact browsing
│   │   └── geocode.ts       # Mapbox geocoding endpoint
│   └── services/
│       ├── pb.ts            # PocketBase client (server-managed auth + generic CRUD)
│       ├── contacts.ts      # Contact business logic (auto-sync, linking, merge)
│       ├── carddav.ts       # Radicale CardDAV client (PROPFIND, REPORT, PUT, vCard parsing)
│       ├── geocode.ts       # Mapbox geocoding client
│       └── links.ts         # PB↔CardDAV link map (file-based)
├── data/
│   └── carddav-links.json   # PocketBase ID → CardDAV href mapping
├── scripts/                 # Migration & backfill scripts
├── .env.example
├── index.html
├── package.json
├── tsconfig.json            # Client TypeScript config
├── tsconfig.server.json     # Server TypeScript config
└── vite.config.ts
```

## PocketBase Collections

| Collection | Description |
|---|---|
| `contacts` | People with name, email, phone, birthday, group tag, and current address |
| `contact_addresses` | Addresses with street, city, state, country, zip, latitude, longitude |
| `group_tags` | Tags for grouping contacts |

## Themes

Switch themes from the dropdown in the header:

- **Light** — clean white/gray/blue
- **Dracula** — dark background with purple accents
- **Cherry Blossom** — soft pink with animated falling pixel petals and pixel-art trees

To add a new theme, add a `[data-theme="name"]` block in `client/index.css` and an entry in `client/components/ThemeToggle.tsx`.

## Docker

A multi-stage [Dockerfile](Dockerfile) builds the Vite client and runs the Express server (which also serves the built static files on the same port).

### Pull the prebuilt image

Images are published to **GitHub Container Registry** by [.github/workflows/docker-publish.yml](.github/workflows/docker-publish.yml) on every push to `main` and on version tags (`v*.*.*`). They are built for `linux/amd64` and `linux/arm64`.

```sh
docker pull ghcr.io/jakeshirley/contactbook:latest
```

Tags published:

- `latest` — most recent `main` build
- `main` — same as latest
- `vX.Y.Z`, `vX.Y` — when you push a `v*.*.*` tag
- `sha-<short>` — every commit

### Build locally

```sh
docker build -t contact_book .
docker run --rm -p 3001:3001 \
  -e POCKETBASE_URL=http://host.docker.internal:8090 \
  -e PB_ADMIN_EMAIL=admin@example.com \
  -e PB_ADMIN_PASSWORD=your-password \
  -e MAPBOX_ACCESS_TOKEN=pk.your_token \
   -e CONTACT_BOOK_AUTH_USERNAME=contacts \
   -e CONTACT_BOOK_AUTH_PASSWORD=change-me \
  contact_book
```

Then open <http://localhost:3001>.

### Docker Compose (with PocketBase)

[docker-compose.yml](docker-compose.yml) brings up the app together with a PocketBase instance and a persistent `pb_data` volume.

```sh
cp .env.example .env   # set PB_ADMIN_EMAIL, PB_ADMIN_PASSWORD, MAPBOX_ACCESS_TOKEN
docker compose up -d
```

- App: <http://localhost:3001>
- PocketBase admin: <http://localhost:8090/_/>

On first run, open the PocketBase admin URL to create the admin account that matches `PB_ADMIN_EMAIL` / `PB_ADMIN_PASSWORD`, then create the `contacts`, `contact_addresses`, and `group_tags` collections (see [PocketBase Collections](#pocketbase-collections) above).

To use the published image instead of building locally, edit `docker-compose.yml` and replace `build: .` with `image: ghcr.io/jakeshirley/contactbook:latest`.

### Environment variables

| Variable | Default | Description |
|---|---|---|
| `SERVER_PORT` | `3001` | Port the Express server listens on |
| `POCKETBASE_URL` | `http://127.0.0.1:8090` | PocketBase URL (use `http://pocketbase:8090` in Compose) |
| `PB_ADMIN_EMAIL` | — | PocketBase admin email |
| `PB_ADMIN_PASSWORD` | — | PocketBase admin password |
| `MAPBOX_ACCESS_TOKEN` | — | Mapbox public token for geocoding |
| `CONTACT_BOOK_AUTH_USERNAME` | — | Optional app login username; requires `CONTACT_BOOK_AUTH_PASSWORD` when set |
| `CONTACT_BOOK_AUTH_PASSWORD` | — | Optional app login password; requires `CONTACT_BOOK_AUTH_USERNAME` when set |
| `CLIENT_DIST` | `./dist` | Override path to the built client (rarely needed) |
