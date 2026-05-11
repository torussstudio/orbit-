const router = require("express").Router();
const db = require("../db");
const { auth, managerOnly } = require("../middleware/auth");

const MANAGER_STAGES = ["Done"];

router.get("/project/:projectId", auth, async (req, res) => {
  const { rows } = await db.query(
    `SELECT t.*, m.name as assignee_name, c.name as cluster_name FROM tasks t
     LEFT JOIN members m ON t.assignee_id=m.id
     LEFT JOIN clusters c ON t.cluster_id=c.id
     WHERE t.project_id=$1 AND t.parent_task_id IS NULL ORDER BY t.created_at DESC`,
    [req.params.projectId],
  );
  res.json(rows);
});

router.get("/:id", auth, async (req, res) => {
  const { rows } = await db.query(
    `SELECT t.*, m.name as assignee_name FROM tasks t LEFT JOIN members m ON t.assignee_id=m.id WHERE t.id=$1`,
    [req.params.id],
  );
  if (!rows[0]) return res.status(404).json({ error: "Not found" });
  const comments = await db.query(
    `SELECT tc.*, m.name as author_name FROM task_comments tc
     JOIN members m ON tc.author_id=m.id WHERE tc.task_id=$1 ORDER BY tc.created_at`,
    [req.params.id],
  );
  // Activity includes both own activity and sub-task activity (labelled [Sub Task])
  const activity = await db.query(
    `SELECT ta.*, m.name as actor_name, 'own' as source FROM task_activity ta
     LEFT JOIN members m ON ta.actor_id=m.id WHERE ta.task_id=$1
     UNION ALL
     SELECT ta.*, m.name as actor_name, 'subtask' as source FROM task_activity ta
     LEFT JOIN members m ON ta.actor_id=m.id
     WHERE ta.task_id IN (SELECT id FROM tasks WHERE parent_task_id=$1)
     ORDER BY created_at DESC LIMIT 30`,
    [req.params.id],
  );
  const subtasks = await db.query(
    `SELECT t.*, m.name as assignee_name FROM tasks t LEFT JOIN members m ON t.assignee_id=m.id WHERE t.parent_task_id=$1 ORDER BY t.created_at`,
    [req.params.id],
  );
  res.json({
    ...rows[0],
    comments: comments.rows,
    activity: activity.rows,
    subtasks: subtasks.rows,
  });
});

router.post("/", auth, async (req, res) => {
  // Only managers can create main tasks; members can create subtasks
  if (req.user.role === 'member' && !req.body.parent_task_id) {
    return res.status(403).json({ error: 'Only managers can create main tasks' });
  }
  const {
    project_id,
    cluster_id,
    parent_task_id,
    title,
    description,
    assignee_id,
    priority,
    stage,
    due_date,
  } = req.body;
  const { rows } = await db.query(
    `INSERT INTO tasks(project_id,cluster_id,parent_task_id,title,description,assignee_id,priority,stage,due_date,created_by)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
    [
      project_id,
      cluster_id || null,
      parent_task_id || null,
      title,
      description,
      assignee_id || null,
      priority || "medium",
      stage || "Todo",
      due_date || null,
      req.user.id,
    ],
  );
   const actionLabel = parent_task_id ? "[Sub Task] Created sub task" : "Created task";
  await db.query(
    `INSERT INTO task_activity(task_id,actor_id,action) VALUES($1,$2,$3)`,
    [rows[0].id, req.user.id, actionLabel],
  );

  // If a new subtask is added to a Done parent task, reset parent back to In Progress
  if (parent_task_id) {
    const { rows: parentRows } = await db.query(
      `SELECT stage FROM tasks WHERE id = $1`,
      [parent_task_id]
    );
    if (parentRows[0]?.stage === 'Done') {
      await db.query(
        `UPDATE tasks SET stage = 'In Progress', updated_at = NOW() WHERE id = $1`,
        [parent_task_id]
      );
      await db.query(
        `INSERT INTO task_activity(task_id,actor_id,action,meta) VALUES($1,$2,$3,$4)`,
        [parent_task_id, req.user.id, 'Stage changed', JSON.stringify({ from: 'Done', to: 'In Progress' })]
      );
    }
  }

  res.status(201).json(rows[0]);
});

router.put("/:id", auth, async (req, res) => {
  const {
    title,
    description,
    assignee_id,
    priority,
    stage,
    due_date,
    cluster_id,
  } = req.body;
  const task = await db.query("SELECT * FROM tasks WHERE id=$1", [
    req.params.id,
  ]);
  if (!task.rows[0]) return res.status(404).json({ error: "Not found" });

  const isSubTask = Boolean(task.rows[0].parent_task_id);

  if (req.user.role === "member") {
    if (MANAGER_STAGES.includes(stage))
      return res
        .status(403)
        .json({ error: "Manager approval required for this stage" });
   const isRework = stage === 'Rework';
    const actualStage = isRework ? 'Todo' : stage;
    const incomingTime = req.body.time_taken ? parseInt(req.body.time_taken) : 0;
    const existingTime = task.rows[0].time_taken || 0;
    const time_taken = isRework ? existingTime || null : (incomingTime > 0 ? existingTime + incomingTime : (existingTime > 0 ? existingTime : null));
    const { rows } = await db.query(
      "UPDATE tasks SET stage=$1,updated_at=NOW(),time_taken=$2,rework_count=rework_count+$3,due_date=COALESCE($4,due_date) WHERE id=$5 RETURNING *",
      [actualStage, time_taken, isRework ? 1 : 0, req.body.new_due_date || null, req.params.id],
    );
    await db.query(
      `INSERT INTO task_activity(task_id,actor_id,action,meta) VALUES($1,$2,$3,$4)`,
      [
        req.params.id,
        req.user.id,
        isSubTask ? "[Sub Task] Stage changed" : "Stage changed",
        JSON.stringify({ from: task.rows[0].stage, to: stage }),
      ],
    );

    if (task.rows[0].parent_task_id) {
      const { rows: siblings } = await db.query(
        `SELECT stage FROM tasks WHERE parent_task_id = $1`,
        [task.rows[0].parent_task_id]
      );
      const allDone = siblings.every(s => s.stage === 'Done');
      const { rows: parentRows } = await db.query(
        `SELECT stage FROM tasks WHERE id = $1`,
        [task.rows[0].parent_task_id]
      );
      if (allDone && parentRows[0]?.stage !== 'Done') {
        await db.query(
          `UPDATE tasks SET stage = 'Done', updated_at = NOW() WHERE id = $1`,
          [task.rows[0].parent_task_id]
        );
      } else if (!allDone && parentRows[0]?.stage === 'Done') {
        await db.query(
          `UPDATE tasks SET stage = 'In Progress', updated_at = NOW() WHERE id = $1`,
          [task.rows[0].parent_task_id]
        );
      }
    }
    return res.json(rows[0]);
  }

  const isRework = stage === 'Rework';
  const actualStage = isRework ? 'Todo' : stage;
  const incomingTime = req.body.time_taken ? parseInt(req.body.time_taken) : 0;
  const existingTime = task.rows[0].time_taken || 0;
  const time_taken = isRework ? existingTime || null : (incomingTime > 0 ? existingTime + incomingTime : (existingTime > 0 ? existingTime : null));
  const finalDueDate = isRework ? (req.body.new_due_date || due_date || null) : (due_date || null);
  const { rows } = await db.query(
    `UPDATE tasks SET title=$1,description=$2,assignee_id=$3,priority=$4,stage=$5,due_date=$6,cluster_id=$7,updated_at=NOW(),time_taken=$8,rework_count=rework_count+$9
     WHERE id=$10 RETURNING *`,
    [title, description, assignee_id || null, priority, actualStage, finalDueDate, cluster_id || null, time_taken, isRework ? 1 : 0, req.params.id],
  );
  if (task.rows[0].stage !== stage) {
    await db.query(
      `INSERT INTO task_activity(task_id,actor_id,action,meta) VALUES($1,$2,$3,$4)`,
      [
        req.params.id,
        req.user.id,
        isSubTask ? "[Sub Task] Stage changed" : "Stage changed",
        JSON.stringify({ from: task.rows[0].stage, to: stage }),
      ],
    );
  }
// AFTER
  // Auto-complete parent task if all subtasks are Done
   if (task.rows[0].parent_task_id) {
    const { rows: siblings } = await db.query(
      `SELECT stage FROM tasks WHERE parent_task_id = $1`,
      [task.rows[0].parent_task_id]
    );
    const allDone = siblings.every(s => s.stage === 'Done');
    const hasRework = siblings.some(s => s.stage === 'Rework');
    const { rows: parentRows } = await db.query(
      `SELECT stage FROM tasks WHERE id = $1`,
      [task.rows[0].parent_task_id]
    );
    if (allDone && parentRows[0]?.stage !== 'Done') {
      await db.query(
        `UPDATE tasks SET stage = 'Done', updated_at = NOW() WHERE id = $1`,
        [task.rows[0].parent_task_id]
      );
    } else if (!allDone && parentRows[0]?.stage === 'Done') {
      await db.query(
        `UPDATE tasks SET stage = 'In Progress', updated_at = NOW() WHERE id = $1`,
        [task.rows[0].parent_task_id]
      );
    }
  }
  res.json(rows[0]);
});

router.delete("/:id", auth, managerOnly, async (req, res) => {
  const { rows: taskRows } = await db.query("SELECT * FROM tasks WHERE id=$1", [req.params.id]);
  const parentId = taskRows[0]?.parent_task_id || null;

  await db.query("DELETE FROM tasks WHERE id=$1", [req.params.id]);

  if (parentId) {
    const { rows: siblings } = await db.query(
      `SELECT stage FROM tasks WHERE parent_task_id = $1`,
      [parentId]
    );
    const { rows: parentRows } = await db.query(
      `SELECT stage FROM tasks WHERE id = $1`,
      [parentId]
    );

    if (siblings.length === 0) {
      await db.query(
        `UPDATE tasks SET stage = 'Todo', updated_at = NOW() WHERE id = $1`,
        [parentId]
      );
    } else {
      const allDone = siblings.every(s => s.stage === 'Done');
      if (allDone && parentRows[0]?.stage !== 'Done') {
        await db.query(
          `UPDATE tasks SET stage = 'Done', updated_at = NOW() WHERE id = $1`,
          [parentId]
        );
      } else if (!allDone && parentRows[0]?.stage === 'Done') {
        await db.query(
          `UPDATE tasks SET stage = 'In Progress', updated_at = NOW() WHERE id = $1`,
          [parentId]
        );
      }
    }
  }

  res.json({ success: true });
});

router.post("/:id/comments", auth, async (req, res) => {
  const { content } = req.body;
  const { rows } = await db.query(
    `INSERT INTO task_comments(task_id,author_id,content) VALUES($1,$2,$3)
     RETURNING *, (SELECT name FROM members WHERE id=$2) as author_name`,
    [req.params.id, req.user.id, content],
  );
  res.status(201).json(rows[0]);
});

router.get("/in-review/all", auth, async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT 
        t.id, t.title, t.stage, t.time_taken, t.rework_count, t.updated_at,
        t.parent_task_id,
        pt.title as parent_task_title,
        p.id as project_id, p.name as project_name,
        m.name as assignee_name
       FROM tasks t
       LEFT JOIN tasks pt ON t.parent_task_id = pt.id
       LEFT JOIN projects p ON t.project_id = p.id
       LEFT JOIN members m ON t.assignee_id = m.id
       WHERE t.stage = 'In Review' AND t.parent_task_id IS NOT NULL
       ORDER BY t.updated_at DESC`
    );
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
