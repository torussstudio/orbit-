const { config } = require("../config/env");

function requireClientHeader(req, res, next) {
  const clientHeader = req.get("X-Orbit-Client");

  if (clientHeader !== "1") {
    return res.status(403).json({
      error: "INVALID_CLIENT_REQUEST",
    });
  }

  const origin = req.get("origin");

  /*
   * Browser requests normally include Origin on
   * cross-origin POST requests.
   *
   * If Origin exists, it must be explicitly trusted.
   */
  if (origin) {
    if (!config.clientOrigins.includes(origin)) {
      return res.status(403).json({
        error: "INVALID_ORIGIN",
      });
    }
  }

  next();
}

module.exports = {
  requireClientHeader,
};