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
   SERVER_PORT=3001
   VITE_PB_COLLECTION=contacts
   ```

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
