# Orbit Project - Complete Setup Guide

## 📋 Prerequisites

Before you begin, ensure you have the following installed:
- Node.js (v14+)
- npm (v6+)
- PostgreSQL (v12+)
- Git

## 🗄️ Database Setup

### 1. Create PostgreSQL Database

```bash
# Connect to PostgreSQL
psql -U postgres

# Create database
CREATE DATABASE orbit_db;

# Create user (optional but recommended)
CREATE USER orbit_user WITH PASSWORD 'your_secure_password';
ALTER ROLE orbit_user WITH CREATEDB;
GRANT ALL PRIVILEGES ON DATABASE orbit_db TO orbit_user;

# Connect to the new database
\c orbit_db
```

### 2. Database Configuration

Connection string format:
```
postgresql://username:password@localhost:5432/orbit_db
```

## 🚀 Server Setup

### 1. Install Dependencies

```bash
cd server
npm install
```

### 2. Create Environment File

```bash
# Copy example to .env
cp ../.env.example .env

# Edit .env with your values
nano .env
```

**Required environment variables:**
```env
DATABASE_URL=postgresql://user:password@localhost:5432/orbit_db
JWT_SECRET=your_super_secret_jwt_key_min_32_chars_recommended
NODE_ENV=development
PORT=4000
```

### 3. Initialize Database

The database schema will automatically initialize on first run. The schema includes:
- members
- projects
- project_members
- tasks
- task_comments
- task_activity
- clusters
- cluster_reviews
- credential_clusters
- credentials
- knowledge_folders
- knowledge_files
- knowledge_notes
- calendar_events (NEW)
- calendar_attendees (NEW)

### 4. Start Server

```bash
# Development mode (with hot reload via nodemon)
npm run dev

# Production mode
npm start
```

Server will run on `http://localhost:4000`

### 5. Test Server Health

```bash
curl http://localhost:4000/health
```

Expected response:
```json
{
  "status": "ok",
  "database": "connected",
  "jwt": "configured"
}
```

## 💻 Client Setup

### 1. Install Dependencies

```bash
cd client
npm install
```

### 2. Create Environment File

```bash
# Create .env.local file (React-specific)
touch .env.local

# Add API URL
echo "REACT_APP_API_URL=http://localhost:4000/api" >> .env.local
```

### 3. Start Development Server

```bash
npm start
```

Client will run on `http://localhost:3000` and automatically open in your browser

## 🎯 Verify Installation

### 1. Check Server
```bash
# Terminal 1: In server directory
npm run dev

# Output should show:
# 🚀 Server running on http://localhost:4000
# Database schema ready
```

### 2. Check Client
```bash
# Terminal 2: In client directory
npm start

# Output should show:
# Compiled successfully!
# You can now view orbit-client in the browser at http://localhost:3000
```

### 3. Login Test
- Navigate to http://localhost:3000
- Should see login page
- Credentials (if seed data exists): check your database

### 4. Create Test Account

Connect to PostgreSQL and create a test user:

```sql
-- Generate UUID function
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Insert test manager
INSERT INTO members (name, email, password_hash, role, skills, active, birthday)
VALUES (
  'Test Manager',
  'manager@test.com',
  '$2a$10$kGjyFQk2SzZ2.Tn9XzJYJeJ7oZJvEVfM8Zn0i0VkZXZ9LZ5X5nUKe', -- hashed 'password'
  'manager',
  ARRAY['Project Management', 'Planning'],
  true,
  '1990-01-15'::date
);

-- Insert test developer
INSERT INTO members (name, email, password_hash, role, skills, active, birthday)
VALUES (
  'Test Developer',
  'dev@test.com',
  '$2a$10$kGjyFQk2SzZ2.Tn9XzJYJeJ7oZJvEVfM8Zn0i0VkZXZ9LZ5X5nUKe', -- hashed 'password'
  'developer',
  ARRAY['React', 'Node.js', 'PostgreSQL'],
  true,
  '1995-06-20'::date
);
```

Test credentials:
- Email: `manager@test.com` or `dev@test.com`
- Password: `password`

## 🔐 Security Setup

### 1. JWT Secret
Generate a secure JWT secret:

```bash
# Linux/Mac
openssl rand -base64 32

# Windows PowerShell
[Convert]::ToBase64String((1..32 | ForEach-Object {Get-Random -Maximum 256}))
```

Update `JWT_SECRET` in `.env` with the generated value

### 2. CORS Configuration
Currently allows all origins. For production, update in `server/index.js`:

```javascript
app.use(cors({
  origin: 'https://yourdomain.com',
  credentials: true,
}));
```

### 3. Database Connection
Use SSL in production:

```env
DATABASE_URL=postgresql://user:password@host:5432/orbit_db?sslmode=require
```

## 📦 Build for Production

### Server Build
```bash
cd server
npm install --production
NODE_ENV=production node index.js
```

### Client Build
```bash
cd client
npm run build
```

Production build will be in `client/build/` directory

## 🐛 Troubleshooting

### Issue: Database Connection Failed

**Solution:**
```bash
# Check PostgreSQL is running
psql --version

# Test connection
psql -U username -h localhost -d orbit_db

# Check .env file has correct DATABASE_URL
cat .env | grep DATABASE_URL
```

### Issue: Port Already in Use

**Solution:**
```bash
# Find process using port 4000
lsof -i :4000

# Kill process (replace PID)
kill -9 <PID>

# Or use different port
PORT=5000 npm run dev
```

### Issue: CORS Errors

**Solution:**
- Check `REACT_APP_API_URL` matches server origin
- Verify CORS settings in `server/index.js`
- Clear browser cache and cookies

### Issue: Member Search Not Working

**Solution:**
```bash
# Verify calendar_events table exists
psql -U username -d orbit_db
\dt calendar_events
\dt calendar_attendees

# If missing, run schema initialization again
# Delete .env and create new to trigger fresh init, OR manually run SQL
```

### Issue: Calendar Not Loading

**Solution:**
1. Check server is running: `curl http://localhost:4000/health`
2. Check browser console for errors
3. Verify database has data: `SELECT COUNT(*) FROM members;`
4. Check API call in Network tab of DevTools

## 📊 Default Ports

| Service | Port | URL |
|---------|------|-----|
| API Server | 4000 | http://localhost:4000 |
| Client Dev | 3000 | http://localhost:3000 |
| PostgreSQL | 5432 | localhost:5432 |
| API Base | - | http://localhost:4000/api |

## 🔄 Development Workflow

### Terminal Setup (Recommended)

**Terminal 1: Server**
```bash
cd server
npm run dev
```

**Terminal 2: Client**
```bash
cd client
npm start
```

**Terminal 3: Database (optional)**
```bash
# Monitor database
psql -U username -d orbit_db

# Useful commands:
\dt              # List tables
\l               # List databases
SELECT COUNT(*) FROM tasks;
```

## 📝 API Documentation

See `REFACTORING_SUMMARY.md` for complete API documentation

### Quick API Reference

**Calendar Endpoints:**
- `GET /api/calendar` - Get all calendar data
- `POST /api/calendar` - Create event
- `PUT /api/calendar/:id` - Update event
- `DELETE /api/calendar/:id` - Delete event
- `GET /api/calendar/search-members?email=query` - Search members

**Other Main Endpoints:**
- `POST /api/auth/login` - Login
- `GET /api/members` - List members
- `GET /api/projects` - List projects
- `GET /api/tasks/project/:projectId` - Project tasks
- `GET /api/dashboard` - Dashboard data

## 🚀 Performance Tips

1. Use browser DevTools to monitor performance
2. Check React profiler for unnecessary re-renders
3. Monitor network tab for slow API calls
4. Use PostgreSQL EXPLAIN for query optimization

## 📞 Support

For issues or questions:
1. Check this setup guide
2. Review `REFACTORING_SUMMARY.md` for known issues
3. Check console output for error messages
4. Review code comments in relevant files

## ✅ Verification Checklist

- [ ] PostgreSQL is running
- [ ] Database `orbit_db` created
- [ ] `.env` file configured with correct DATABASE_URL and JWT_SECRET
- [ ] Server running on port 4000
- [ ] Client running on port 3000
- [ ] Can login with test account
- [ ] Calendar loads without errors
- [ ] Can create events
- [ ] Member search works
- [ ] Can filter events by member

**All items checked? You're ready to go! 🎉**
