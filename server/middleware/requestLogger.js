function requestLogger(req, res, next) {
  const startedAt = Date.now();

  res.on("finish", () => {
    process.stdout.write(
      `${JSON.stringify({
        event: "http_request",
        method: req.method,
        path: req.originalUrl,
        status: res.statusCode,
        durationMs: Date.now() - startedAt,
      })}\n`,
    );
  });

  next();
}

module.exports = { requestLogger };