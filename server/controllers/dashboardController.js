const dashboardService = require("../services/dashboardService");
const { setTotalHeader } = require("../utils/listLimit");

async function getDashboard(req, res, next) {
  try {
    const data = await dashboardService.getDashboardData(req.user);
    res.json(data);
  } catch (err) { next(err); }
}

async function getMemberTasks(req, res, next) {
  try {
    const tasks = await dashboardService.getMemberTasks(req.params.id);
    res.json({ tasks });
  } catch (err) { next(err); }
}

// GitHub-style daily activity for one member (self, or any member for managers).
async function getActivityHeatmap(req, res, next) {
  try {
    res.json(await dashboardService.getActivityHeatmap(req.params.id));
  } catch (err) { next(err); }
}

// Member dashboard "Time logged" (self, or any member for managers).
async function getTimeSummary(req, res, next) {
  try {
    res.json(await dashboardService.getTimeSummary(req.params.id));
  } catch (err) { next(err); }
}

async function getTasksList(req, res, next) {
  try {
    const tasks = await dashboardService.getTasksList(req.query.stage);
    res.json({ tasks });
  } catch (err) { next(err); }
}

async function getMyTasks(req, res, next) {
  try {
    const { rows: tasks, total } = await dashboardService.getMyTasks(req.user.id);
    setTotalHeader(res, total);
    res.json({ tasks });
  } catch (err) { next(err); }
}

// Admin Members page: task progress for every active member.
async function getTeamProgress(req, res, next) {
  try {
    res.json(await dashboardService.getTeamProgress());
  } catch (err) { next(err); }
}

module.exports = { getDashboard, getMemberTasks, getTasksList, getMyTasks, getTeamProgress, getActivityHeatmap, getTimeSummary };
