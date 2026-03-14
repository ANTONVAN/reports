# Laboratorio Ramos - Reports Dashboard

Internal reporting dashboard for Laboratorio Ramos. Connects to the production SQL Server database and displays operational reports with filtering, sorting, search, and export capabilities.

## Architecture

```
Cloudflare Pages (React frontend)
        ↓ HTTPS
VPS - reports-api.laboratorioramos.com.mx (Express API)
        ↓ TCP :1433
SQL Server 172.176.243.203
```

## Features

- Date range filtering
- Summary cards (Sucursales, Estudios, Rutas, Maquiladores, status counts)
- Sortable data table with sticky header
- Global search across all fields
- Export to CSV, Excel (.xlsx), and PDF
- Responsive design
- Page load animations

## Project Structure

```
dashboard/
├── src/                    # React frontend
│   ├── App.jsx             # Main dashboard component
│   ├── App.css             # Dashboard styles
│   └── index.css           # Base styles
├── server/                 # Express backend (deployed on VPS)
│   ├── index.js            # API server
│   ├── reports.js          # Report query definitions
│   ├── package.json        # Backend dependencies
│   ├── .env                # Database credentials (not in git)
│   └── nginx-reports-api.conf
├── .env.production         # Frontend production env vars
└── package.json            # Frontend dependencies
```

## Local Development

```bash
# Install dependencies
npm install

# Start the backend API (requires .env in server/)
npm run server

# Start the frontend dev server
npm run dev
```

- Frontend: http://localhost:5173
- Backend API: http://localhost:3001

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
```

## API Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /api/health` | Health check |
| `GET /api/reports` | List available reports |
| `GET /api/reports/:name?params` | Execute a report |
