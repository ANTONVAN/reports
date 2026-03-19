import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import sql from 'mssql';
import reports from './reports.js';

const app = express();

const allowedOrigins = (process.env.CORS_ORIGIN || '*').split(',').map(o => o.trim());

app.use(cors({
  origin: allowedOrigins.includes('*') ? '*' : (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
}));
app.use(express.json());

const JWT_SECRET = process.env.JWT_SECRET || 'change-me';

// Parse users from env (supports multiple hardcoded users with roles)
const AUTH_USERS = JSON.parse(process.env.AUTH_USERS || '[{"username":"admin","password":"admin","role":"admin"}]');

// Which reports each role can access
const ROLE_REPORTS = {
  admin: ['indicadores-daily', 'indicadores-monthly', 'medicos'],
  usuario: ['maquilas'],
};

// --- Auth ---

function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token required' });
  }

  try {
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// Login endpoint - no auth required
app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;

  const user = AUTH_USERS.find(u => u.username === username && u.password === password);
  if (user) {
    const token = jwt.sign({ username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '24h' });
    return res.json({ token, username: user.username, role: user.role, expiresIn: '24h' });
  }

  return res.status(401).json({ error: 'Invalid credentials' });
});

// Verify token endpoint
app.get('/api/auth/verify', authMiddleware, (req, res) => {
  res.json({ valid: true, username: req.user.username, role: req.user.role });
});

// --- Database ---

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

// --- Routes ---

// Health check (public)
app.get('/api/health', async (req, res) => {
  try {
    const db = await getPool();
    await db.request().query('SELECT 1');
    res.json({ status: 'ok' });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// All report routes require auth - filtered by role
app.get('/api/reports', authMiddleware, (req, res) => {
  const allowed = ROLE_REPORTS[req.user.role] || [];
  res.json(allowed.filter(r => reports[r]));
});

// Get filter options for a report
app.get('/api/reports/:reportName/meta', authMiddleware, async (req, res) => {
  const allowed = ROLE_REPORTS[req.user.role] || [];
  if (!allowed.includes(req.params.reportName)) {
    return res.status(403).json({ error: 'Access denied' });
  }
  const report = reports[req.params.reportName];
  if (!report) {
    return res.status(404).json({ error: `Report "${req.params.reportName}" not found` });
  }
  // Support async meta (for medicos comboboxes)
  if (typeof report.meta === 'function') {
    try {
      const db = await getPool();
      const meta = await report.meta(db);
      return res.json(meta);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }
  res.json(report.meta || {});
});

app.get('/api/reports/:reportName', authMiddleware, async (req, res) => {
  try {
    const allowed = ROLE_REPORTS[req.user.role] || [];
    if (!allowed.includes(req.params.reportName)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    const report = reports[req.params.reportName];
    if (!report) {
      return res.status(404).json({ error: `Report "${req.params.reportName}" not found` });
    }

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
