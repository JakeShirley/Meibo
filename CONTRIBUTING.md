# Contributing

Thanks for helping improve Meibo. This guide covers local development setup, project layout, and the commands used while working on the app.

## Prerequisites

- [Node.js](https://nodejs.org/) v20+
- A running [PocketBase](https://pocketbase.io/) instance with the contact collections
- A [Mapbox](https://www.mapbox.com/) access token for geocoding
- Optional: a running [Radicale](https://radicale.org/) instance for CardDAV integration work

## Local Setup

1. Install dependencies:

   ```sh
   npm install
   ```

2. Copy `.env.example` to `.env` and fill in your values:

   ```sh
   cp .env.example .env
   ```

   ```env
   POCKETBASE_URL=http://127.0.0.1:8090
   PB_ADMIN_EMAIL=admin@example.com
   PB_ADMIN_PASSWORD=your-password
   MAPBOX_ACCESS_TOKEN=pk.your_token_here
   SERVER_PORT=3001
   MEIBO_AUTH_USERNAME=
   MEIBO_AUTH_PASSWORD=
   RADICALE_URL=http://127.0.0.1:5232
   RADICALE_USER=
   RADICALE_PASSWORD=
   VITE_PB_COLLECTION=contacts
   ```

   To require sign-in to the app and API, set both `MEIBO_AUTH_USERNAME` and `MEIBO_AUTH_PASSWORD`. Leave both blank to run without app-level auth. The server fails fast if only one of them is set.

3. Create a Mapbox token for geocoding:

   - Create a free account at [mapbox.com](https://www.mapbox.com/)
   - Go to [Account > Access Tokens](https://account.mapbox.com/access-tokens/)
   - Copy your default public token, which starts with `pk.`
   - Paste it as `MAPBOX_ACCESS_TOKEN` in `.env`

## Development

Start both the Express API server and Vite dev server:

```sh
# Terminal 1: API server
npm run dev:server

# Terminal 2: Vite frontend
npm run dev
```

Or start both together:

```sh
npm run dev:all
```

Then open <http://localhost:5173> in your browser.

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start Vite dev server |
| `npm run dev:server` | Start Express API server with hot reload |
| `npm run dev:all` | Start both concurrently |
| `npm run build` | Type-check and production build |
| `npm run preview` | Preview the production client build |
| `npm run server` | Start Express in production mode |
| `npm run semantic-release` | Run semantic-release |

## Architecture

```
+---------+        +--------------------------------------+
|         |  HTTP  |          Express (port 3001)          |
| Browser |<------>|                                      |
| (React) |        |  /api/contacts    -> PocketBase      |
|         |        |  /api/addresses   -> PocketBase      |
+---------+        |  /api/tags        -> PocketBase      |
           |  /api/schema/*    -> PocketBase      |
           |  /api/auth/login  -> PocketBase      |
           |  /api/carddav/*   -> Radicale        |
           |  /api/geocode     -> Mapbox          |
           |  /api/contacts/:id/link  -> PB + Radicale
           |  /api/contacts/:id/merge -> PB + Radicale
           +--------------------------------------+
              |            |            |
              v            v            v
         PocketBase    Radicale      Mapbox
         (contacts,    (CardDAV      (geocoding)
          addresses,   address
          tags)        books)
```

The browser never talks directly to PocketBase, Radicale, or Mapbox. Every user action is a single REST call to the Express server, which orchestrates the backing services internally:

- Editing a linked contact: `PATCH /api/contacts/:id` updates PocketBase, then auto-syncs the linked CardDAV vCard on Radicale
- Merging and linking: `POST /api/contacts/:id/merge` fetches both PocketBase and CardDAV data, applies field selections, writes to both, and saves the link
- Creating an address: `POST /api/addresses` geocodes via Mapbox, injects latitude and longitude, then creates the record in PocketBase

The Express server keeps PocketBase admin credentials and Radicale auth server-side, auto-geocodes addresses on save, and auto-syncs linked contacts to CardDAV on edit.

## API Surface

| Resource | Endpoints | Description |
|---|---|---|
| Auth | `POST /api/auth/login` | Optional app login, returns a bearer token when configured |
| Schema | `GET /api/schema/{contacts,addresses,tags}` | Normalized field definitions with pre-resolved relation options |
| Contacts | `GET/POST /api/contacts`, `GET/PATCH/DELETE /api/contacts/:id` | CRUD with enriched responses, link status, and inline photos |
| Contact Linking | `POST /api/contacts/:id/link`, `POST .../link/create`, `DELETE .../link`, `POST .../merge` | Single-call link, create and link, unlink, merge and link |
| Contact Utilities | `GET /api/contacts/map`, `GET /api/contacts/export` | Map pin data and server-side CSV/JSON export |
| Addresses | `GET/POST /api/addresses`, `GET/PATCH/DELETE /api/addresses/:id` | CRUD with auto-geocoding on create/update |
| Address Utilities | `POST /api/addresses/:id/rehydrate`, `GET /api/addresses/export` | Re-geocode and export |
| Tags | `GET/POST /api/tags`, `PATCH/DELETE /api/tags/:id`, `GET /api/tags/export` | Group tag CRUD and export |
| CardDAV | `GET /api/carddav/address-books`, `GET /api/carddav/contacts` | Read-only CardDAV browsing |
| Geocode | `GET /api/geocode?q=` | Forward geocode via Mapbox |

## Project Structure

```
meibo/
|-- client/                  # React frontend
|   |-- components/          # UI components
|   |-- hooks/               # React hooks
|   |-- lib/
|   |   |-- api.ts           # Typed fetch-based API client
|   |   |-- geocode.ts       # Client-side geocode helper
|   |   `-- export.ts        # CSV/JSON export utilities
|   |-- types/               # TypeScript types
|   |-- index.css            # Tailwind and theme variables
|   |-- main.tsx             # App entrypoint
|   `-- App.tsx              # Root component with tab navigation
|-- server/                  # Express API server
|   |-- config.ts            # Environment config
|   |-- index.ts             # Server entrypoint and route registration
|   |-- middleware/          # App auth and PocketBase proxy middleware
|   |-- routes/              # API route handlers
|   `-- services/            # PocketBase, contacts, CardDAV, geocode, and link services
|-- data/
|   `-- carddav-links.json   # PocketBase ID to CardDAV href mapping
|-- scripts/                 # Migration and import scripts
|-- .env.example
|-- index.html
|-- package.json
|-- tsconfig.json            # Client TypeScript config
|-- tsconfig.server.json     # Server TypeScript config
`-- vite.config.ts
```

## PocketBase Collections

| Collection | Description |
|---|---|
| `contacts` | People with name, email, phone, birthday, group tag, and current address |
| `contact_addresses` | Addresses with street, city, state, country, zip, latitude, longitude |
| `group_tags` | Tags for grouping contacts |

## Themes

Switch themes from the dropdown in the header:

- Light: clean white, gray, and blue
- Dracula: dark background with purple accents
- Cherry Blossom: soft pink with animated falling pixel petals and pixel-art trees

To add a new theme, add a `[data-theme="name"]` block in `client/index.css` and an entry in `client/components/ThemeToggle.tsx`.

## Migration and Import Scripts

```sh
# Import missing birthdays and phone numbers from a VCF file
node scripts/import-vcf-extras.mjs path/to/contacts.vcf --dry-run
```