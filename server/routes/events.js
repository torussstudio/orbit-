const router = require("express").Router();
const { auth } = require("../middleware/auth");
const eventBus = require("../services/eventBus");

/*
 * GET /api/events/stream
 *
 * Live updates over Server-Sent Events. Same login as every other route:
 * the access token goes in the Authorization header, never in the URL.
 *
 * Feature off (LIVE_EVENTS_ENABLED is not "true"): answers 204 and the
 * client falls back to polling.
 *
 * `auth` runs one short query and gives its connection straight back to the
 * pool, so no database connection is held while the stream is open. It also
 * rejects members who are inactive or no longer exist.
 *
 * The stream is closed by the server when the access token it was opened
 * with expires ("stream.expired"), or as soon as the member's access
 * changes ("stream.revoked", see eventBus.closeUser).
 */
router.get(
  "/stream",
  (req, res, next) => {
    if (!eventBus.isEnabled()) {
      return res.status(204).end();
    }

    return next();
  },
  auth,
  (req, res) => {
    const userId = req.user.id;

    res.status(200);
    res.set({
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      // Tells nginx not to buffer this response.
      "X-Accel-Buffering": "no",
    });
    res.flushHeaders();

    // This connection is meant to stay open.
    req.socket.setTimeout(0);
    req.socket.setNoDelay(true);
    req.socket.setKeepAlive(true);

    // If the connection drops, the browser side waits 5 s before retrying.
    res.write("retry: 5000\n\n");

    // Registers the connection, starts its 25 s heartbeat, and sets it to
    // close when this access token expires (exp of the verified token).
    const cleanup = eventBus.addConnection(userId, res, {
      tokenExp: req.user.tokenExp,
    });

    req.on("close", cleanup);
    req.on("error", cleanup);
    res.on("close", cleanup);
    res.on("error", cleanup);
  },
);

module.exports = router;
