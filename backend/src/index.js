import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import watchlistRouter from './routes/watchlist.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Check candidate paths to support both root CWD and backend CWD
const candidatePaths = [
  path.resolve(__dirname, '../../frontend/dist'),
  path.resolve(process.cwd(), 'frontend/dist'),
  path.resolve(process.cwd(), '../frontend/dist'),
];
const frontendDist = candidatePaths.find(p => fs.existsSync(p)) || candidatePaths[0];

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// API Routes
app.use('/watchlist', watchlistRouter);

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// API Directory
app.get('/api', (req, res) => {
  res.json({
    name: 'Smart Market Watchlist API',
    status: 'running',
    endpoints: [
      'GET /watchlist',
      'POST /watchlist',
      'DELETE /watchlist/:symbol',
      'POST /watchlist/viewed',
      'GET /api/health',
    ],
  });
});

// Serve static frontend build if it exists (e.g. production/cloud deploy)
if (fs.existsSync(frontendDist)) {
  app.use(express.static(frontendDist));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/watchlist') || req.path.startsWith('/api')) {
      return next();
    }
    res.sendFile(path.join(frontendDist, 'index.html'));
  });
} else {
  // Fallback if frontend isn't built
  app.get('/', (req, res) => {
    res.json({
      name: 'Smart Market Watchlist API',
      status: 'running',
      note: 'Frontend build not found. Run npm run build in frontend/ or access API at /watchlist',
    });
  });
}

const server = app.listen(PORT, () => {
  console.log(`====================================================`);
  console.log(`  SMART MARKET WATCHLIST SERVER RUNNING             `);
  console.log(`====================================================`);
  console.log(`  Port:        ${PORT}`);
  console.log(`  Healthcheck: http://localhost:${PORT}/api/health`);
  console.log(`  Watchlist:   http://localhost:${PORT}/watchlist`);
  if (fs.existsSync(frontendDist)) {
    console.log(`  Frontend:    Serving static build from ${frontendDist}`);
  }
  console.log(`====================================================\n`);

  // In unified deployments (e.g. Render/Railway), auto-run price provider in background
  if (process.env.AUTO_RUN_PROVIDER === 'true') {
    import('./services/priceProvider.js').then(({ startLivePriceProvider }) => {
      console.log('[Server] AUTO_RUN_PROVIDER=true: Starting background price provider...');
      startLivePriceProvider({ intervalMs: 30000 });
    }).catch(err => {
      console.error('[Server] Failed to auto-start price provider:', err);
    });
  }
});

export default app;
