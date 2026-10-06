const timeLogService = require("../services/timeLogService");

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// ?from=YYYY-MM-DD&to=YYYY-MM-DD (IST calendar days, both optional)
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

function handle(fn) {
  return async (req, res, next) => {
    try {
      res.json(await fn(req));
    } catch (error) {
      if (error.status) {
        return res.status(error.status).json({ error: error.message });
      }
      next(error);
    }
  };
}

module.exports = {
  getProjects: handle((req) => timeLogService.getProjects(readRange(req))),
  getProjectDetail: handle((req) =>
    timeLogService.getProjectDetail(req.params.id, readRange(req)),
  ),
  getMembers: handle((req) => timeLogService.getMembers(readRange(req))),
  getMemberDetail: handle((req) =>
    timeLogService.getMemberDetail(req.params.id, readRange(req)),
  ),
};