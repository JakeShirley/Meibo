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
Browser → Vite (dev proxy) → Express (port 3001) → PocketBase
                                  ↓
                          Nominatim (geocoding)
```

- **`client/`** — React frontend (Vite + Tailwind CSS v4)
- **`server/`** — Express API server that proxies PocketBase and handles geocoding
- **`scripts/`** — One-off migration and backfill scripts

The Express server keeps PocketBase admin credentials server-side and auto-geocodes addresses on save.

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
   VITE_PB_COLLECTION=contacts
   ```

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
│   ├── hooks/               # React hooks (useContacts, useCollection, useTheme)
│   ├── lib/                 # PocketBase client, geocode helper, export utils
│   ├── types/               # TypeScript types
│   ├── index.css            # Tailwind + theme variables
│   ├── main.tsx             # App entrypoint
│   └── App.tsx              # Root component with tab navigation
├── server/                  # Express API server
│   ├── config.ts            # Environment config
│   ├── index.ts             # Server entrypoint
│   ├── routes/              # API route handlers
│   │   ├── auth.ts          # Admin auth (credentials server-side)
│   │   ├── geocode.ts       # Nominatim geocoding endpoint
│   │   └── addresses.ts     # Address CRUD with auto-geocoding
│   ├── services/
│   │   └── geocode.ts       # Nominatim client with throttle + retry
│   └── middleware/
│       └── pbProxy.ts       # PocketBase reverse proxy
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
| `group_tags` | Tags for grouping contacts (e.g., family sides) |

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
| `CLIENT_DIST` | `./dist` | Override path to the built client (rarely needed) |
