const dashboardService = require("../services/dashboardService");

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

async function getTasksList(req, res, next) {
  try {
    const tasks = await dashboardService.getTasksList(req.query.stage);
    res.json({ tasks });
  } catch (err) { next(err); }
}

async function getMyTasks(req, res, next) {
  try {
    const tasks = await dashboardService.getMyTasks(req.user.id);
    res.json({ tasks });
  } catch (err) { next(err); }
}

module.exports = { getDashboard, getMemberTasks, getTasksList, getMyTasks };
