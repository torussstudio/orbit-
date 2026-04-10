# ⬡ Orbit — Agency OS

Internal project & team management platform for web development agencies.

---

## Stack & Hosting (100% Free)

| Layer | Tech | Host |
|---|---|---|
| Frontend | React | Vercel — free |
| Backend API | Node.js + Express | Vercel Serverless — free |
| Database | PostgreSQL | Supabase — free |
| File Storage | FTP uploads | Your Hostinger — already paid |

---

## Project Structure

```
orbit/
├── client/    ← React frontend  → Deploy as Vercel Project #1
└── server/    ← Express API     → Deploy as Vercel Project #2
```

Both are separate Vercel projects deployed from the **same GitHub repo**.

---

## 🚀 Setup Guide

### Step 1 — Supabase (Database)

1. Go to https://supabase.com → Create a new project
2. Once created: **Settings → Database → Connection String → URI**
3. Copy it — looks like:
   `postgresql://postgres:[password]@db.[ref].supabase.co:5432/postgres`

---

### Step 2 — GitHub

Push the whole `orbit/` folder to a new GitHub repo:

```bash
cd orbit
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/yourname/orbit.git
git push -u origin main
```

---

### Step 3 — Deploy Backend → Vercel

1. Go to https://vercel.com → **Add New Project**
2. Import your GitHub repo
3. Set **Root Directory** to `server`
4. Framework Preset: **Other**
5. Add these **Environment Variables**:

| Key | Value |
|---|---|
| `DATABASE_URL` | your Supabase connection string |
| `JWT_SECRET` | any long random string (e.g. `my-orbit-secret-2026`) |
| `CLIENT_URL` | `https://your-orbit-client.vercel.app` *(update after frontend deploy)* |
| `FTP_HOST` | `ftp.yourdomain.com` |
| `FTP_USER` | your Hostinger FTP username |
| `FTP_PASS` | your Hostinger FTP password |
| `FTP_BASE_URL` | `https://yourdomain.com` |

6. Click **Deploy**
7. Your API URL: `https://orbit-server-xxx.vercel.app`

---

### Step 4 — Deploy Frontend → Vercel

1. Go to Vercel → **Add New Project** again
2. Import the same GitHub repo
3. Set **Root Directory** to `client`
4. Framework Preset: **Create React App**
5. Add environment variable:

| Key | Value |
|---|---|
| `REACT_APP_API_URL` | `https://orbit-server-xxx.vercel.app/api` |

6. Click **Deploy**
7. Your app URL: `https://orbit-client-xxx.vercel.app`

---

### Step 5 — Update CORS on Backend

Go back to your **server** Vercel project → Settings → Environment Variables.
Update `CLIENT_URL` to your actual frontend URL (from Step 4).
Then go to **Deployments → Redeploy**.

---

### Step 6 — Create Your Manager Account

The database schema is created automatically when the API first receives a request.

Visit your API health check to trigger it:
```
https://orbit-server-xxx.vercel.app/health
```

Then create your first manager by running this **once locally**:

```bash
cd server
npm install
cp .env.example .env   # fill in your DATABASE_URL
node -e "
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');
require('dotenv').config();
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
bcrypt.hash('yourpassword', 10).then(hash => {
  return pool.query(
    'INSERT INTO members(name,email,password_hash,role) VALUES(\$1,\$2,\$3,\$4)',
    ['Your Name', 'you@agency.com', hash, 'manager']
  );
}).then(() => { console.log('Manager created!'); process.exit(0); });
"
```

Or use **Supabase SQL Editor** directly:
```sql
-- First get a bcrypt hash from: https://bcrypt.online (cost factor 10)
INSERT INTO members (name, email, password_hash, role)
VALUES ('Your Name', 'you@agency.com', '$2a$10$...paste_hash_here...', 'manager');
```

---

## 💻 Local Development

```bash
# Terminal 1 — Backend
cd server
npm install
cp .env.example .env    # fill in values
npm run dev             # runs on http://localhost:4000

# Terminal 2 — Frontend
cd client
npm install
# create client/.env with:
# REACT_APP_API_URL=http://localhost:4000/api
npm start               # runs on http://localhost:3000
```

---

## 🔐 Roles

| Action | Manager | Developer |
|---|---|---|
| Create projects, tasks, clusters | ✅ | ❌ |
| Move tasks (Todo → In Review) | ✅ | ✅ own tasks |
| Approve tasks (Done / Deployed) | ✅ | ❌ |
| Review clusters, trigger rework | ✅ | ❌ |
| View private credentials | ✅ | ❌ |
| View public credentials | ✅ | ✅ (masked) |
| Upload files to knowledge area | ✅ | ✅ |
| Add task comments | ✅ | ✅ |
| Manage members | ✅ | ❌ |

---

## 📁 File Storage (Hostinger)

Files upload via FTP and are served at:
```
https://yourdomain.com/orbit-files/{project_id}/{filename}
```

Hostinger FTP credentials: **hPanel → Files → FTP Accounts**

---

## ⚡ How Vercel Serverless Works

Your Express app is wrapped by Vercel and runs as a single serverless function.
- Cold starts are ~200-500ms (very fast, unlike Render)
- No sleeping — Vercel serverless is always on
- Free tier: 100GB bandwidth, 1M function invocations/month
- More than enough for a 3-person internal tool

---

## Troubleshooting

**CORS errors** → Make sure `CLIENT_URL` env var on the server project matches your frontend URL exactly (no trailing slash).

**DB not connecting** → Check `DATABASE_URL` includes `?sslmode=require` or that `ssl: { rejectUnauthorized: false }` is set (already done in `db/index.js`).

**FTP upload fails** → Verify FTP credentials in Hostinger hPanel. Make sure passive mode is enabled (it is by default).
