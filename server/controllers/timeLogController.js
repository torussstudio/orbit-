const timeLogService = require("../services/timeLogService");

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// ?from=YYYY-MM-DD&to=YYYY-MM-DD (IST work dates, both optional)
function readRange(req) {
  const pick = (value) => {
    if (typeof value !== "string" || !DATE_RE.test(value)) return null;
    const d = new Date(`${value}T00:00:00Z`);
    return Number.isNaN(d.getTime()) ? null : value;
  };

  let from = pick(req.query.from);
  let to = pick(req.query.to);

  if (from && to && from > to) [from, to] = [to, from];

  return { from, to };
}

function handle(fn, status = 200) {
  return async (req, res, next) => {
    try {
      res.status(status).json(await fn(req));
    } catch (error) {
      if (error.status) {
        return res.status(error.status).json({ error: error.message });
      }
      next(error);
    }
  };
}

module.exports = {
  // Member
  getMyOptions: handle((req) => timeLogService.getMemberOptions(req.user.id)),
  createEntry: handle((req) => timeLogService.createEntry(req.user.id, req.body), 201),

  // Manager
  getProjects: handle((req) => timeLogService.getProjects(readRange(req))),
  getUnloggedDoneTasks: handle((req) => timeLogService.getUnloggedDoneTasks(readRange(req))),
  addUnloggedTaskEntry: handle((req) => timeLogService.addUnloggedTaskEntry(req.params.taskId, req.body), 201),
  getProjectDetail: handle((req) =>
    timeLogService.getProjectDetail(req.params.id, readRange(req)),
  ),
  getMembers: handle((req) => timeLogService.getMembers(readRange(req))),
  getMemberDetail: handle((req) =>
    timeLogService.getMemberDetail(req.params.id, readRange(req)),
  ),
  updateEntry: handle((req) => timeLogService.updateEntry(req.params.id, req.body)),
  deleteEntry: handle((req) => timeLogService.deleteEntry(req.params.id)),
};
