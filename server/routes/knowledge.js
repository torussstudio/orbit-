const router = require("express").Router();
const multer = require("multer");
const ftp = require("basic-ftp");
const path = require("path");
const { Readable } = require("stream");
const db = require("../db");
const { auth, managerOnly } = require("../middleware/auth");

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
});

async function uploadToFTP(buffer, remotePath) {
  const client = new ftp.Client();
  try {
    await client.access({
      host: process.env.FTP_HOST,
      user: process.env.FTP_USER,
      password: process.env.FTP_PASS,
      secure: false,
    });
    await client.ensureDir(path.dirname(remotePath));
    const stream = Readable.from(buffer);
    await client.uploadFrom(stream, remotePath);
  } finally {
    client.close();
  }
}

router.get("/project/:projectId", auth, async (req, res) => {
  const folders = await db.query(
    "SELECT * FROM knowledge_folders WHERE project_id=$1 ORDER BY created_at",
    [req.params.projectId],
  );
  const files = await db.query(
    `SELECT kf.*, m.name as uploaded_by_name FROM knowledge_files kf
     LEFT JOIN members m ON kf.uploaded_by=m.id WHERE kf.project_id=$1 ORDER BY kf.created_at`,
    [req.params.projectId],
  );
  const notes = await db.query(
    `SELECT kn.*, m.name as created_by_name FROM knowledge_notes kn
     LEFT JOIN members m ON kn.created_by=m.id WHERE kn.project_id=$1 ORDER BY kn.created_at`,
    [req.params.projectId],
  );
  res.json({ folders: folders.rows, files: files.rows, notes: notes.rows });
});

router.post("/folders", auth, managerOnly, async (req, res) => {
  const { project_id, name, parent_id } = req.body;
  const { rows } = await db.query(
    "INSERT INTO knowledge_folders(project_id,name,parent_id) VALUES($1,$2,$3) RETURNING *",
    [project_id, name, parent_id || null],
  );
  res.status(201).json(rows[0]);
});

router.delete("/folders/:id", auth, managerOnly, async (req, res) => {
  await db.query("DELETE FROM knowledge_folders WHERE id=$1", [req.params.id]);
  res.json({ success: true });
});

router.post("/files/upload", auth, upload.single("file"), async (req, res) => {
  const { folder_id, project_id } = req.body;
  const file = req.file;
  if (!file) return res.status(400).json({ error: "No file" });

  const ext = path.extname(file.originalname);
  const filename = `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`;
  const remotePath = `/public_html/orbit-files/${project_id}/${filename}`;
  const fileUrl = `${process.env.FTP_BASE_URL}/orbit-files/${project_id}/${filename}`;

  try {
    await uploadToFTP(file.buffer, remotePath);
    const { rows } = await db.query(
      `INSERT INTO knowledge_files(folder_id,project_id,name,file_url,file_size,mime_type,uploaded_by)
       VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [
        folder_id || null,
        project_id,
        file.originalname,
        fileUrl,
        file.size,
        file.mimetype,
        req.user.id,
      ],
    );
    res.status(201).json(rows[0]);
  } catch (e) {
    res.status(500).json({ error: "Upload failed: " + e.message });
  }
});

router.delete("/files/:id", auth, managerOnly, async (req, res) => {
  await db.query("DELETE FROM knowledge_files WHERE id=$1", [req.params.id]);
  res.json({ success: true });
});

router.post("/notes", auth, managerOnly, async (req, res) => {
  const { folder_id, project_id, title, content } = req.body;
  const { rows } = await db.query(
    "INSERT INTO knowledge_notes(folder_id,project_id,title,content,created_by) VALUES($1,$2,$3,$4,$5) RETURNING *",
    [folder_id || null, project_id, title, content, req.user.id],
  );
  res.status(201).json(rows[0]);
});

router.put("/notes/:id", auth, managerOnly, async (req, res) => {
  const { title, content } = req.body;
  const { rows } = await db.query(
    "UPDATE knowledge_notes SET title=$1,content=$2,updated_at=NOW() WHERE id=$3 RETURNING *",
    [title, content, req.params.id],
  );
  res.json(rows[0]);
});

router.delete("/notes/:id", auth, managerOnly, async (req, res) => {
  await db.query("DELETE FROM knowledge_notes WHERE id=$1", [req.params.id]);
  res.json({ success: true });
});

module.exports = router;
