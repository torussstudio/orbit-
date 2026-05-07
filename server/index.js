require('dotenv').config();

const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');

// Routes
const authRoutes = require('./routes/auth');
const memberRoutes = require('./routes/members');
const projectRoutes = require('./routes/projects');
const taskRoutes = require('./routes/tasks');
const clusterRoutes = require('./routes/clusters');
const credentialRoutes = require('./routes/credentials');
const knowledgeRoutes = require('./routes/knowledge');
const dashboardRoutes = require('./routes/dashboard');
const calendarRoutes = require('./routes/calendar');
const notificationRoutes = require('./routes/notifications');

const app = express();
app.set('trust proxy', 1);


// =========================
// 🔐 ENV CHECK (VERY IMPORTANT)
// =========================
if (!process.env.DATABASE_URL) {
  console.error("❌ DATABASE_URL is missing");
}

if (!process.env.JWT_SECRET) {
  console.error("❌ JWT_SECRET is missing");
}


// =========================
// 🌐 MIDDLEWARE
// =========================

// 🍪 Cookie parser — must come before routes so req.cookies is populated
app.use(cookieParser());

// CORS — origin: '*' is incompatible with credentials: true.
// CLIENT_ORIGIN must be set to your frontend URL (e.g. http://localhost:3000 or https://your-app.vercel.app)
const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:5173',
  'https://orbit.torusdxn.in',
];

if (
  process.env.CLIENT_ORIGIN &&
  !allowedOrigins.includes(process.env.CLIENT_ORIGIN)
) {
  allowedOrigins.push(process.env.CLIENT_ORIGIN);
}

app.use(
  cors({
    origin: function (origin, callback) {
      // Allow Postman / server-to-server requests
      if (!origin) return callback(null, true);

      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      return callback(new Error(`CORS blocked for origin: ${origin}`));
    },
    credentials: true,
  })
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));


// =========================
// 📡 ROUTES
// =========================
app.use('/api/auth', authRoutes);
app.use('/api/members', memberRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/clusters', clusterRoutes);
app.use('/api/credentials', credentialRoutes);
app.use('/api/knowledge', knowledgeRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/calendar', calendarRoutes);
app.use('/api/notifications', notificationRoutes);


// =========================
// 🧪 HEALTH CHECK
// =========================
app.get('/', (req, res) => {
  res.json({ message: 'Orbit Education API v1.0 🚀' });
});

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    database: process.env.DATABASE_URL ? 'connected' : 'missing',
    jwt: process.env.JWT_SECRET ? 'configured' : 'missing',
  });
});


// =========================
// 🧯 ERROR HANDLER
// =========================
app.use((err, req, res, next) => {
  console.error("🔥 GLOBAL ERROR:", err);

  // Handle CORS errors cleanly
  if (err.message?.includes('CORS')) {
    return res.status(403).json({
      error: 'CORS blocked',
      message: err.message,
    });
  }

  res.status(500).json({
    error: 'Server error',
    message:
      process.env.NODE_ENV === 'production'
        ? 'Internal server error'
        : err.message,
  });
});


// =========================
// 🟢 LOCAL SERVER (DEV ONLY)
// =========================
if (process.env.NODE_ENV !== 'production') {
  const PORT = process.env.PORT || 4000;

  app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
  });
}


// =========================
// ⚡ VERCEL EXPORT
// =========================
module.exports = app;
