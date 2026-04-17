require('dotenv').config();

const express = require('express');
const cors = require('cors');

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

const app = express();


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
app.use(
  cors({
    origin: '*', // can restrict later
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

  res.status(500).json({
    error: 'Server error',
    message: err.message,
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
