import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import sql from 'mssql';
import reports from './reports.js';

const app = express();

app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
}));
app.use(express.json());

const dbConfig = {
  server: process.env.DB_SERVER,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  port: parseInt(process.env.DB_PORT || '1433'),
  options: {
    encrypt: false,
    trustServerCertificate: true,
  },
  connectionTimeout: 15000,
  requestTimeout: 30000,
};

let pool;

async function getPool() {
  if (!pool) {
    pool = await sql.connect(dbConfig);
  }
  return pool;
}

// Health check
app.get('/api/health', async (req, res) => {
  try {
    const db = await getPool();
    await db.request().query('SELECT 1');
    res.json({ status: 'ok' });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// List available reports
app.get('/api/reports', (req, res) => {
  res.json(Object.keys(reports));
});

// Dynamic report endpoint: GET /api/reports/:reportName?param1=...&param2=...
app.get('/api/reports/:reportName', async (req, res) => {
  try {
    const report = reports[req.params.reportName];
    if (!report) {
      return res.status(404).json({ error: `Report "${req.params.reportName}" not found` });
    }

    // Validate required params
    const missing = report.params.filter((p) => !req.query[p]);
    if (missing.length) {
      return res.status(400).json({ error: `Missing parameters: ${missing.join(', ')}` });
    }

    const db = await getPool();
    const request = db.request();
    const query = report.buildQuery(req.query, request);
    const result = await request.query(query);

    res.json(result.recordset);
  } catch (err) {
    console.error(`Report error [${req.params.reportName}]:`, err);
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`API server running on http://localhost:${PORT}`);
});
