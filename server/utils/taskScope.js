/*
 * Which tasks count as work.
 *
 * In Orbit the real unit of work is a "leaf" task:
 *   - a sub task, or
 *   - a task with no sub tasks (created with "Enable subtasks" off).
 * A main task that has sub tasks is only a container: its stage and due date
 * are derived from its sub tasks (taskService.recomputeParentStage /
 * recomputeParentDueDate). Counting it as well as its sub tasks counts the
 * same work twice, so every count, progress number, workload and time list
 * uses this rule. (Same rule as the project progress in projectService.)
 *
 * Usage: `... WHERE ${LEAF_TASK}` when the tasks alias is `t`,
 * or `${leafTask("x")}` for another alias.
 */
function leafTask(alias = "t") {
  return `NOT EXISTS (SELECT 1 FROM tasks leaf_child WHERE leaf_child.parent_task_id = ${alias}.id)`;
}

/*
 * The task's project is not in the trash. Trashed projects can still be
 * restored, so their tasks stay in the database, but they are not live work
 * and must not count in workloads, task counts or lists.
 */
function inLiveProject(alias = "t") {
  return `EXISTS (SELECT 1 FROM projects live_p WHERE live_p.id = ${alias}.project_id AND live_p.trashed_at IS NULL)`;
}

module.exports = {
  leafTask,
  LEAF_TASK: leafTask("t"),
  inLiveProject,
  IN_LIVE_PROJECT: inLiveProject("t"),
};
