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
const AUTH_USER = process.env.AUTH_USER || 'admin';
const AUTH_PASSWORD = process.env.AUTH_PASSWORD || 'admin';

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

  if (username === AUTH_USER && password === AUTH_PASSWORD) {
    const token = jwt.sign({ username }, JWT_SECRET, { expiresIn: '24h' });
    return res.json({ token, username, expiresIn: '24h' });
  }

  return res.status(401).json({ error: 'Invalid credentials' });
});

// Verify token endpoint
app.get('/api/auth/verify', authMiddleware, (req, res) => {
  res.json({ valid: true, username: req.user.username });
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

// All report routes require auth
app.get('/api/reports', authMiddleware, (req, res) => {
  res.json(Object.keys(reports));
});

app.get('/api/reports/:reportName', authMiddleware, async (req, res) => {
  try {
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
