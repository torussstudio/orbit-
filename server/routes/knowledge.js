const router = require("express").Router();
const multer = require("multer");
const ftp = require("basic-ftp");
const path = require("path");
const { Readable } = require("stream");
const db = require("../db");
const { auth, managerOnly } = require("../middleware/auth");
const { requireProjectAccess } = require("../middleware/projectAccess");
const crypto = require("crypto");

/*
 * ============================================================
 * FILE UPLOAD CONFIG
 * ============================================================
 */

const upload = multer({
  storage: multer.memoryStorage(),

  limits: {
    fileSize: 20 * 1024 * 1024, // 20 MB
  },

  fileFilter: (req, file, callback) => {
    const allowed = new Set([
      "application/pdf",
      "image/jpeg",
      "image/png",
      "text/plain",
      "text/markdown",
      "application/zip",
    ]);

    if (!allowed.has(file.mimetype)) {
      return callback(
        new Error("Unsupported file type"),
      );
    }

    callback(null, true);
  },
});

/*
 * ============================================================
 * FTP UPLOAD
 * ============================================================
 */

async function uploadToFTP(buffer, remotePath) {
  const client = new ftp.Client();

  try {
    await client.access({
      host: process.env.FTP_HOST,
      user: process.env.FTP_USER,
      password: process.env.FTP_PASS,

      /*
       * Keep this unchanged for now.
       * Change only after confirming the FTP server
       * supports FTPS.
       */
      secure: false,
    });

    await client.ensureDir(
      path.dirname(remotePath),
    );

    const stream = Readable.from(buffer);

    await client.uploadFrom(
      stream,
      remotePath,
    );
  } finally {
    client.close();
  }
}

/*
 * ============================================================
 * VALIDATION HELPERS
 * ============================================================
 */

function isValidId(value) {
  return (
    typeof value === "string" &&
    value.trim().length > 0
  );
}

function isValidString(value, maxLength) {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    value.length <= maxLength
  );
}

/*
 * ============================================================
 * GET PROJECT KNOWLEDGE
 * ============================================================
 */

router.get(
  "/project/:projectId",
  auth,
  requireProjectAccess("projectId"),
  async (req, res, next) => {
    try {
      const { projectId } = req.params;

      const folders = await db.query(
        `
          SELECT *
          FROM knowledge_folders
          WHERE project_id = $1
          ORDER BY created_at
        `,
        [projectId],
      );

      const files = await db.query(
        `
          SELECT
            kf.*,
            m.name AS uploaded_by_name
          FROM knowledge_files kf
          LEFT JOIN members m
            ON kf.uploaded_by = m.id
          WHERE kf.project_id = $1
          ORDER BY kf.created_at
        `,
        [projectId],
      );

      const notes = await db.query(
        `
          SELECT
            kn.*,
            m.name AS created_by_name
          FROM knowledge_notes kn
          LEFT JOIN members m
            ON kn.created_by = m.id
          WHERE kn.project_id = $1
          ORDER BY kn.created_at
        `,
        [projectId],
      );

      res.json({
        folders: folders.rows,
        files: files.rows,
        notes: notes.rows,
      });
    } catch (err) {
      next(err);
    }
  },
);

/*
 * ============================================================
 * CREATE FOLDER
 * ============================================================
 */

router.post(
  "/folders",
  auth,
  managerOnly,
  async (req, res, next) => {
    try {
      const {
        project_id,
        name,
        parent_id,
      } = req.body;

      if (!isValidId(project_id)) {
        return res.status(400).json({
          error: "project_id is required",
        });
      }

      if (!isValidString(name, 255)) {
        return res.status(400).json({
          error: "Folder name is required and must be 255 characters or less",
        });
      }

      /*
       * If a parent folder is provided,
       * make sure it belongs to the same project.
       */
      if (parent_id) {
        const { rows: parentRows } =
          await db.query(
            `
              SELECT id
              FROM knowledge_folders
              WHERE id = $1
                AND project_id = $2
              LIMIT 1
            `,
            [parent_id, project_id],
          );

        if (!parentRows[0]) {
          return res.status(400).json({
            error: "Invalid parent folder for this project",
          });
        }
      }

      const { rows } = await db.query(
        `
          INSERT INTO knowledge_folders(
            project_id,
            name,
            parent_id
          )
          VALUES($1, $2, $3)
          RETURNING *
        `,
        [
          project_id,
          name.trim(),
          parent_id || null,
        ],
      );

      res.status(201).json(rows[0]);
    } catch (err) {
      next(err);
    }
  },
);

/*
 * ============================================================
 * DELETE FOLDER
 * ============================================================
 */

router.delete(
  "/folders/:id",
  auth,
  managerOnly,
  async (req, res, next) => {
    try {
      const { id } = req.params;

      if (!isValidId(id)) {
        return res.status(400).json({
          error: "Invalid folder id",
        });
      }

      await db.query(
        `
          DELETE FROM knowledge_folders
          WHERE id = $1
        `,
        [id],
      );

      res.json({
        success: true,
      });
    } catch (err) {
      next(err);
    }
  },
);

/*
 * ============================================================
 * UPLOAD FILE
 * ============================================================
 */

router.post(
  "/files/upload",
  auth,
  upload.single("file"),
  requireProjectAccess("project_id"),
  async (req, res, next) => {
    try {
      const {
        folder_id,
        project_id,
      } = req.body;

      const file = req.file;

      if (!isValidId(project_id)) {
        return res.status(400).json({
          error: "project_id is required",
        });
      }

      if (!file) {
        return res.status(400).json({
          error: "No file",
        });
      }

      /*
       * IMPORTANT:
       * If folder_id is supplied, verify that the folder
       * belongs to the same project.
       */
      if (folder_id) {
        const { rows: folderRows } =
          await db.query(
            `
              SELECT id
              FROM knowledge_folders
              WHERE id = $1
                AND project_id = $2
              LIMIT 1
            `,
            [
              folder_id,
              project_id,
            ],
          );

        if (!folderRows[0]) {
          return res.status(400).json({
            error: "Invalid folder for this project",
          });
        }
      }

      /*
       * Never use the original filename as the stored filename.
       * UUID prevents filename collisions and path manipulation.
       */
      const ext = path
        .extname(file.originalname)
        .toLowerCase();

      const filename =
        `${crypto.randomUUID()}${ext}`;

      const remotePath =
        `/public_html/orbit-files/${project_id}/${filename}`;

      const fileUrl =
        `${process.env.FTP_BASE_URL}/orbit-files/${project_id}/${filename}`;

      await uploadToFTP(
        file.buffer,
        remotePath,
      );

      const { rows } =
        await db.query(
          `
            INSERT INTO knowledge_files(
              folder_id,
              project_id,
              name,
              file_url,
              file_size,
              mime_type,
              uploaded_by
            )
            VALUES(
              $1,
              $2,
              $3,
              $4,
              $5,
              $6,
              $7
            )
            RETURNING *
          `,
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

      res.status(201).json(
        rows[0],
      );
    } catch (err) {
      /*
       * Multer/file validation errors
       */
      if (
        err instanceof multer.MulterError
      ) {
        if (
          err.code === "LIMIT_FILE_SIZE"
        ) {
          return res.status(400).json({
            error:
              "File size must not exceed 20 MB",
          });
        }

        return res.status(400).json({
          error: err.message,
        });
      }

      /*
       * Unsupported MIME type
       */
      if (
        err.message ===
        "Unsupported file type"
      ) {
        return res.status(400).json({
          error: err.message,
        });
      }

      /*
       * Preserve existing upload behavior
       * without exposing internal FTP/database
       * errors to the client.
       */
      console.error(
        "[knowledge] File upload failed:",
        err,
      );

      return res.status(500).json({
        error: "Upload failed",
      });
    }
  },
);

/*
 * ============================================================
 * DELETE FILE
 * ============================================================
 */

router.delete(
  "/files/:id",
  auth,
  managerOnly,
  async (req, res, next) => {
    try {
      const { id } = req.params;

      if (!isValidId(id)) {
        return res.status(400).json({
          error: "Invalid file id",
        });
      }

      await db.query(
        `
          DELETE FROM knowledge_files
          WHERE id = $1
        `,
        [id],
      );

      res.json({
        success: true,
      });
    } catch (err) {
      next(err);
    }
  },
);

/*
 * ============================================================
 * CREATE NOTE
 * ============================================================
 */

router.post(
  "/notes",
  auth,
  managerOnly,
  async (req, res, next) => {
    try {
      const {
        folder_id,
        project_id,
        title,
        content,
      } = req.body;

      if (!isValidId(project_id)) {
        return res.status(400).json({
          error: "project_id is required",
        });
      }

      if (!isValidString(title, 255)) {
        return res.status(400).json({
          error:
            "Title is required and must be 255 characters or less",
        });
      }

      if (
        typeof content !== "string" ||
        content.length > 500000
      ) {
        return res.status(400).json({
          error:
            "Content must be a string of 500000 characters or less",
        });
      }

      /*
       * If folder_id exists, make sure the folder
       * belongs to the same project.
       */
      if (folder_id) {
        const { rows: folderRows } =
          await db.query(
            `
              SELECT id
              FROM knowledge_folders
              WHERE id = $1
                AND project_id = $2
              LIMIT 1
            `,
            [
              folder_id,
              project_id,
            ],
          );

        if (!folderRows[0]) {
          return res.status(400).json({
            error:
              "Invalid folder for this project",
          });
        }
      }

      const { rows } =
        await db.query(
          `
            INSERT INTO knowledge_notes(
              folder_id,
              project_id,
              title,
              content,
              created_by
            )
            VALUES(
              $1,
              $2,
              $3,
              $4,
              $5
            )
            RETURNING *
          `,
          [
            folder_id || null,
            project_id,
            title.trim(),
            content,
            req.user.id,
          ],
        );

      res.status(201).json(
        rows[0],
      );
    } catch (err) {
      next(err);
    }
  },
);

/*
 * ============================================================
 * UPDATE NOTE
 * ============================================================
 */

router.put(
  "/notes/:id",
  auth,
  managerOnly,
  async (req, res, next) => {
    try {
      const { id } = req.params;
      const {
        title,
        content,
      } = req.body;

      if (!isValidId(id)) {
        return res.status(400).json({
          error: "Invalid note id",
        });
      }

      if (!isValidString(title, 255)) {
        return res.status(400).json({
          error:
            "Title is required and must be 255 characters or less",
        });
      }

      if (
        typeof content !== "string" ||
        content.length > 500000
      ) {
        return res.status(400).json({
          error:
            "Content must be a string of 500000 characters or less",
        });
      }

      const { rows } =
        await db.query(
          `
            UPDATE knowledge_notes
            SET
              title = $1,
              content = $2,
              updated_at = NOW()
            WHERE id = $3
            RETURNING *
          `,
          [
            title.trim(),
            content,
            id,
          ],
        );

      if (!rows[0]) {
        return res.status(404).json({
          error: "Note not found",
        });
      }

      res.json(
        rows[0],
      );
    } catch (err) {
      next(err);
    }
  },
);

/*
 * ============================================================
 * DELETE NOTE
 * ============================================================
 */

router.delete(
  "/notes/:id",
  auth,
  managerOnly,
  async (req, res, next) => {
    try {
      const { id } = req.params;

      if (!isValidId(id)) {
        return res.status(400).json({
          error: "Invalid note id",
        });
      }

      await db.query(
        `
          DELETE FROM knowledge_notes
          WHERE id = $1
        `,
        [id],
      );

      res.json({
        success: true,
      });
    } catch (err) {
      next(err);
    }
  },
);

module.exports = router;