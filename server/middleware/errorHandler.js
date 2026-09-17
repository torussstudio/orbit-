const { isProd } = require("../config/env");

function notFoundHandler(req, res) {
  res.status(404).json({ error: "Not found" });
}

function errorHandler(err, req, res, next) {
  if (res.headersSent) {
    return next(err);
  }

  if (err.message?.includes("CORS")) {
    return res.status(403).json({ error: "CORS blocked" });
  }

  if (err.type === "entity.too.large") {
    return res.status(413).json({ error: "Request body too large" });
  }

  console.error("[error]", err.message);

  res.status(err.status || 500).json({
    error: err.expose ? err.message : "Server error",
    message: isProd ? "Internal server error" : err.message,
  });
}

module.exports = { notFoundHandler, errorHandler };
