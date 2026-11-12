const overdueReasonService = require("../services/overdueReasonService");

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
  getMine: handle((req) => overdueReasonService.getMine(req.user)),
  saveReason: handle((req) =>
    overdueReasonService.saveReason(req.user, req.params.taskId, req.body),
  ),
  getOverdue: handle(() => overdueReasonService.getOverdue()),
  decide: handle((req) =>
    overdueReasonService.decide(req.user, req.params.id, req.body),
  ),
  ask: handle((req) => overdueReasonService.askReasons(req.user, req.body?.items)),
};
