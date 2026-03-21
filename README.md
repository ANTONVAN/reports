# Laboratorio Ramos - Reports Dashboard

Internal reporting dashboard for Laboratorio Ramos. Connects to the production SQL Server database and displays operational reports with filtering, sorting, search, and export capabilities. Protected by JWT authentication with role-based access control.

## Architecture

```
Cloudflare Pages (React frontend)
        ↓ HTTPS (JWT auth)
VPS 3.14.164.196 - reports-api.laboratorioramos.com.mx (Express API)
        ↓ TCP :1433
SQL Server 172.176.243.203
```

## Features

- **Role-based authentication** — Two hardcoded users (admin/usuario) with JWT tokens, no database required
- **Collapsible sidebar** — Navigate between reports, collapses to icon-only mode
- **Dashboard view** — KPI cards and interactive charts (recharts) summarizing report data
- **Multiple reports** — Indicadores Diario, Indicadores Mensual, Médicos (admin); Maquilas (usuario)
- **Date range filtering** — Configurable per report with sensible defaults
- **Multi-select filters** — Ciudad, Maquilador, Médico, Especialidad dropdowns with search
- **Summary cards** — Contextual KPIs per report
- **Sortable data table** — Click column headers to sort, sticky header turns blue on scroll
- **Global search** — Search across all fields
- **Pagination** — 100 records per page with smooth scroll-to-top
- **Export** — Excel (.xlsx) and PDF for all reports; CSV for Maquilas
- **Responsive design** — Table view on desktop, card layout on mobile; sidebar slides in/out on mobile

## Users & Roles

| User | Password | Role | Reports |
|------|----------|------|---------|
| `admin` | `Your Password` | admin | Dashboard, Indicadores Diario, Indicadores Mensual, Médicos |
| `usuario` | `Your Password` | usuario | Dashboard, Maquilas |

Users are configured in `server/.env` as a JSON array (`AUTH_USERS`). No database is needed for authentication.

## Reports

### Indicadores Diario (admin)
Daily breakdown by sucursal: solicitudes count, pagos, costo toma. Includes TOTAL rows.
- **Filter:** FechaCreo (Fecha Inicio, Fecha Fin) — defaults to last 24h

### Indicadores Mensual (admin)
Monthly breakdown by sucursal: same metrics as daily, grouped by month.
- **Filter:** FechaCreo (Fecha Inicio, Fecha Fin) — defaults to last 30 days

### Médicos (admin)
Monthly breakdown by doctor: solicitudes, ingreso, ticket promedio. Ordered by total solicitudes.
- **Filters:** FechaCreo (current year default), MedicoId, EspecialidadId, CiudadId
- Médico and Especialidad dropdowns are loaded dynamically from the database

### Maquilas (usuario)
Detailed study-level report of outsourced lab work per patient.
- **Filters:** FechaCreo (current month default), Ciudad, Maquilador
- Date range uses 00:00:00 to 23:59:59

### Dashboard (both roles)
KPI cards and interactive charts summarizing data from the user's available reports.
- **Filter:** Date range — defaults to last 30 days
- **Admin:** Solicitudes trend, sucursal breakdown, top 10 médicos, pagos trend
- **Usuario:** Estudios by sucursal, estatus distribution pie chart

## Project Structure

```
dashboard/
├── src/                    # React frontend
│   ├── App.jsx             # Main app: sidebar, dashboard, all report views
│   ├── App.css             # All styles (sidebar, charts, tables, responsive)
│   ├── Login.jsx           # Login page component
│   ├── Login.css           # Login styles
│   └── index.css           # Base CSS variables
├── server/                 # Express backend (deployed on VPS)
│   ├── index.js            # API server, auth middleware, role-based access
│   ├── reports.js          # Report query definitions (SQL)
│   ├── package.json        # Backend dependencies
│   ├── .env                # Credentials & users (not in git)
│   └── nginx-reports-api.conf
├── .env                    # Frontend dev env (VITE_API_URL)
├── .env.production         # Frontend production env
└── package.json            # Frontend dependencies
```

## Local Development

```bash
# Install frontend dependencies
npm install

# Install backend dependencies
cd server && npm install && cd ..

# Start backend (requires server/.env with DB credentials)
cd server && node index.js

# Start frontend dev server (in another terminal)
npm run dev
```

Set `VITE_API_URL=http://localhost:3001` in `.env` to use the local backend.

- Frontend: http://localhost:5173
- Backend API: http://localhost:3001

## Authentication

The backend uses JWT tokens with role-based access. Users are configured in `server/.env`:

```
JWT_SECRET=your-secret-key
AUTH_USERS=[{"username":"admin","password":"...","role":"admin"},{"username":"usuario","password":"...","role":"usuario"}]
```

The JWT token includes `username` and `role`. Tokens expire after 24 hours. The frontend auto-redirects to login on 401 responses.

### Role-based access control

Each role has a whitelist of allowed reports defined in `server/index.js` (`ROLE_REPORTS`):

```js
const ROLE_REPORTS = {
  admin: ['indicadores-daily', 'indicadores-monthly', 'medicos'],
  usuario: ['maquilas'],
};
```

Report endpoints return 403 if the user's role doesn't have access.

## Adding a New Report

1. Add the query in `server/reports.js`:

```js
myReport: {
  params: ['startDate', 'endDate'],
  meta: {},  // or async meta(db) { ... } for dynamic filter options
  buildQuery(params, request) {
    request.input('startDate', sql.DateTime, new Date(params.startDate));
    request.input('endDate', sql.DateTime, new Date(params.endDate));
    return `SELECT ... FROM ... WHERE ...`;
  },
},
```

2. Add the report key to the appropriate role in `ROLE_REPORTS` in `server/index.js`.

3. Build the frontend view in `src/App.jsx`:
   - Add to `REPORT_CONFIG` with name and icon
   - Add to `allowedReports` array for the appropriate role
   - Add a case in `renderReport()` switch
   - Create the report component

## Deployment

### Frontend (Cloudflare Pages)

| Setting | Value |
|---------|-------|
| Build command | `npm install && npm run build` |
| Build output directory | `dist` |
| Environment variable | `VITE_API_URL=https://reports-api.laboratorioramos.com.mx` |

### Backend (VPS — 3.14.164.196)

```bash
# Files are at /var/www/reports-api/
# Managed by PM2
sudo pm2 restart reports-api
sudo pm2 logs reports-api
```

To deploy updated server files:

```bash
scp server/index.js server/reports.js server/.env ubuntu@3.14.164.196:/tmp/
ssh ubuntu@3.14.164.196 "sudo cp /tmp/index.js /tmp/reports.js /tmp/.env /var/www/reports-api/ && sudo pm2 restart reports-api"
```

### CORS

Multiple origins are supported in `server/.env`, comma-separated:

```
CORS_ORIGIN=https://reports-ramos.pages.dev,https://reports.laboratorioramos.com.mx,http://localhost:5173
```

Use `CORS_ORIGIN=*` to allow all origins.

## API Endpoints

| Endpoint | Auth | Description |
|----------|------|-------------|
| `POST /api/auth/login` | No | Login, returns JWT with role |
| `GET /api/auth/verify` | Yes | Verify token validity |
| `GET /api/health` | No | Health check (tests DB connection) |
| `GET /api/reports` | Yes | List reports allowed for user's role |
| `GET /api/reports/:name/meta` | Yes | Get filter options (cities, doctors, etc.) |
| `GET /api/reports/:name?params` | Yes | Execute a report query |

## Tech Stack

**Frontend:** React 19, Vite 8, @tanstack/react-table, recharts, lucide-react, xlsx, jsPDF
**Backend:** Express 5, mssql, jsonwebtoken, dotenv
**Hosting:** Cloudflare Pages (frontend), Ubuntu VPS with PM2 (backend)
