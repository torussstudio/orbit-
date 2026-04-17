const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

const initDB = async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS members (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name VARCHAR(255) NOT NULL,
      email VARCHAR(255) UNIQUE NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      role VARCHAR(20) NOT NULL CHECK (role IN ('manager', 'developer')),
      birthday DATE,
      skills TEXT[],
      active BOOLEAN DEFAULT true,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS projects (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name VARCHAR(255) NOT NULL,
      client_name VARCHAR(255),
      description TEXT,
      status VARCHAR(30) DEFAULT 'active' CHECK (status IN ('active', 'on_hold', 'completed', 'archived')),
      start_date DATE,
      end_date DATE,
      custom_stages JSONB DEFAULT '["Todo","In Progress","In Review","Done","Deployed"]',
      created_by UUID REFERENCES members(id),
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS project_members (
      project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
      member_id UUID REFERENCES members(id) ON DELETE CASCADE,
      PRIMARY KEY (project_id, member_id)
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
      cluster_id UUID REFERENCES clusters(id) ON DELETE CASCADE,
      title VARCHAR(500) NOT NULL,
      description TEXT,
      assignee_id UUID REFERENCES members(id),
      priority VARCHAR(20) DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'critical')),
      stage VARCHAR(100) DEFAULT 'Todo',
      due_date DATE,
      created_by UUID REFERENCES members(id),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS task_comments (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
      author_id UUID REFERENCES members(id),
      content TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS task_activity (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
      actor_id UUID REFERENCES members(id),
      action VARCHAR(255),
      meta JSONB,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS clusters (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
      name VARCHAR(255) NOT NULL,
      description TEXT,
      status VARCHAR(30) DEFAULT 'draft' CHECK (status IN ('draft','in_review','approved','needs_rework','completed')),
      rework_count INTEGER DEFAULT 0,
      target_date DATE,
      created_by UUID REFERENCES members(id),
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS cluster_reviews (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      cluster_id UUID REFERENCES clusters(id) ON DELETE CASCADE,
      reviewer_id UUID REFERENCES members(id),
      decision VARCHAR(20) CHECK (decision IN ('approved','needs_rework')),
      notes TEXT,
      rework_task_ids UUID[],
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS credential_clusters (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
      name VARCHAR(255) NOT NULL,
      visibility VARCHAR(10) DEFAULT 'private' CHECK (visibility IN ('private','public')),
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS credentials (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      cluster_id UUID REFERENCES credential_clusters(id) ON DELETE CASCADE,
      label VARCHAR(255) NOT NULL,
      value TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS knowledge_folders (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
      parent_id UUID REFERENCES knowledge_folders(id),
      name VARCHAR(255) NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS knowledge_files (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      folder_id UUID REFERENCES knowledge_folders(id) ON DELETE CASCADE,
      project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
      name VARCHAR(500) NOT NULL,
      file_url TEXT NOT NULL,
      file_size INTEGER,
      mime_type VARCHAR(100),
      uploaded_by UUID REFERENCES members(id),
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS knowledge_notes (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      folder_id UUID REFERENCES knowledge_folders(id) ON DELETE CASCADE,
      project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
      title VARCHAR(500) NOT NULL,
      content TEXT,
      created_by UUID REFERENCES members(id),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS calendar_events (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      title VARCHAR(500) NOT NULL,
      description TEXT,
      start_date TIMESTAMPTZ NOT NULL,
      end_date TIMESTAMPTZ NOT NULL,
      type VARCHAR(50) DEFAULT 'event' CHECK (type IN ('event', 'task', 'deadline', 'birthday')),
      created_by UUID REFERENCES members(id),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS calendar_attendees (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      event_id UUID REFERENCES calendar_events(id) ON DELETE CASCADE,
      member_id UUID REFERENCES members(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(event_id, member_id)
    );
  `);
  console.log('Database schema ready');
};

initDB().catch(console.error);

module.exports = pool;
