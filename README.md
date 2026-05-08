# Contact Book

A web app for browsing, editing, and exporting contacts stored in a PocketBase database. Built with React, TypeScript, Tailwind CSS, Leaflet, and an Express API server.

> [!NOTE]
> This product is very AI-agent coded. Much of the implementation, documentation, and iteration has been produced with coding agents under human direction and review.

## Features

- **Browse contacts** with sortable columns, search, and pagination
- **CRUD** for contacts, addresses, and group tags
- **Map view** with Leaflet + OpenStreetMap (addresses geocoded via Nominatim on save)
- **Group Tags** — contacts grouped by tag with collapsible accordion UI
- **Export** to CSV or JSON
- **Theming** — Light, Dracula, and Cherry Blossom (with animated falling pixel petals)

## Architecture Summary

Contact Book uses a React frontend, an Express API server, PocketBase for contact data, Radicale for CardDAV address books, and Mapbox for geocoding.

The browser **never talks directly** to PocketBase, Radicale, or Mapbox. Every user action is a REST call to the Express server, which keeps service credentials server-side and coordinates contact edits, address geocoding, CardDAV linking, and exports.

If `CONTACT_BOOK_AUTH_USERNAME` and `CONTACT_BOOK_AUTH_PASSWORD` are configured, every `/api/*` endpoint except the login endpoint requires the bearer token issued by `POST /api/auth/login`.

For local setup, project structure, and contribution workflow, see [CONTRIBUTING.md](CONTRIBUTING.md).

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
