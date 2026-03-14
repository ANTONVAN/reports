# Laboratorio Ramos - Reports Dashboard

Internal reporting dashboard for Laboratorio Ramos. Connects to the production SQL Server database and displays operational reports with filtering, sorting, search, and export capabilities. Protected by JWT authentication.

## Architecture

```
Cloudflare Pages (React frontend)
        ↓ HTTPS (JWT auth)
VPS - reports-api.laboratorioramos.com.mx (Express API)
        ↓ TCP :1433
SQL Server 172.176.243.203
```

## Features

- **Authentication** — JWT-based login with 24h token expiry, no database required
- **Date range filtering** — defaults to current month
- **Summary cards** — Sucursales, Estudios, Rutas, Maquiladores, and status counts (Enviado, Solicitado, Recibido, Cancelado)
- **Sortable data table** — click column headers to sort, sticky header turns blue on scroll
- **Global search** — search across all fields
- **Pagination** — 100 records per page with smooth scroll-to-top on page change
- **Export** — CSV, Excel (.xlsx), and PDF with colored status and date range in header
- **Responsive design** — table view on desktop, card layout on mobile
- **Page load animations** — staggered fade-in for header, cards, and table rows

## Project Structure

```
dashboard/
├── src/                    # React frontend
│   ├── App.jsx             # Main dashboard component
│   ├── App.css             # Dashboard styles
│   ├── Login.jsx           # Login page component
│   ├── Login.css           # Login styles
│   └── index.css           # Base styles
├── server/                 # Express backend (deployed on VPS)
│   ├── index.js            # API server with auth middleware
│   ├── reports.js          # Report query definitions
│   ├── package.json        # Backend dependencies
│   ├── .env                # Credentials (not in git)
│   └── nginx-reports-api.conf
├── .env.production         # Frontend production env vars
└── package.json            # Frontend dependencies
```

## Local Development

```bash
# Install dependencies
npm install

# Start the frontend dev server (connects to remote API via .env)
npm run dev

# Or start a local backend (requires server/.env with DB credentials)
npm run server
```

- Frontend: http://localhost:5173
- Backend API: http://localhost:3001

## Authentication

The backend uses JWT tokens. Credentials are configured in the server `.env`:

```
AUTH_USER=admin
AUTH_PASSWORD=LabRamos2026!
JWT_SECRET=your-secret-key
```

The token expires after 24 hours. The frontend auto-redirects to login on 401 responses.

## Adding a New Report

Only edit `server/reports.js`. Add a new entry:

```js
myReport: {
  params: ['startDate', 'endDate'],
  buildQuery(params, request) {
    request.input('startDate', sql.DateTime, new Date(params.startDate));
    request.input('endDate', sql.DateTime, new Date(params.endDate));
    return `SELECT ... FROM ... WHERE ...`;
  },
},
```

The API endpoint is automatically available at `GET /api/reports/myReport?startDate=...&endDate=...`.

Then build the frontend page to consume it.

## Deployment

### Frontend (Cloudflare Pages)

| Setting | Value |
|---------|-------|
| Build command | `npm install && npm run build` |
| Build output directory | `dist` |
| Environment variable | `VITE_API_URL=https://reports-api.laboratorioramos.com.mx` |

### Backend (VPS)

```bash
cd /var/www/reports-api
npm install
pm2 start index.js --name reports-api
pm2 save
pm2 startup
```

### CORS

Multiple origins are supported in the server `.env`, comma-separated:

```
CORS_ORIGIN=https://reports-ramos.pages.dev,https://reports.laboratorioramos.com.mx,http://localhost:5173
```

Use `CORS_ORIGIN=*` to allow all origins.

## API Endpoints

| Endpoint | Auth | Description |
|----------|------|-------------|
| `POST /api/auth/login` | No | Login with username/password, returns JWT |
| `GET /api/auth/verify` | Yes | Verify token validity |
| `GET /api/health` | No | Health check |
| `GET /api/reports` | Yes | List available reports |
| `GET /api/reports/:name?params` | Yes | Execute a report |
