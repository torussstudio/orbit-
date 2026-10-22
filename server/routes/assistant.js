const router = require("express").Router();
const { auth } = require("../middleware/auth");
const assistant = require("../services/ai/assistantService");

/*
 * Orbit AI assistant: questions, writing help, and changes that need the
 * person's Confirm (see services/ai/assistantActions.js).
 * Every route is for the signed-in user only; the tools behind chat apply
 * the same project / task access rules as the rest of the app.
 */

const handle = (fn) => async (req, res, next) => {
  try {
    await fn(req, res);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    next(err);
  }
};

router.get("/history", auth, handle(async (req, res) => res.json(await assistant.history(req.user))));
router.delete("/history", auth, handle(async (req, res) => res.json(await assistant.clear(req.user))));
router.post("/chat", auth, handle(async (req, res) => res.json(await assistant.chat(req.user, req.body?.message))));

/*
 * Same as /chat, streamed (Server-Sent Events over this POST response):
 *   { type: 'status', text }   a lookup is running ("Checking your tasks")
 *   { type: 'delta', text }    the next piece of the answer
 *   { type: 'done', user_message, reply, usage }
 *   { type: 'error', error, status }
 * Closing the request (Stop button) stops the model.
 */
router.post("/chat/stream", auth, async (req, res) => {
  res.status(200);
  res.set({
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    // Tells nginx not to buffer this response.
    "X-Accel-Buffering": "no",
  });
  res.flushHeaders();
  req.socket.setNoDelay(true);

  const controller = new AbortController();
  let closed = false;
  res.on("close", () => {
    closed = true;
    controller.abort();
  });
  const send = (event) => {
    if (!closed) res.write(`data: ${JSON.stringify(event)}\n\n`);
  };
  // Keeps proxies from closing a quiet connection while tools run.
  const ping = setInterval(() => { if (!closed) res.write(": ping\n\n"); }, 15000);

  try {
    const out = await assistant.chat(req.user, req.body?.message, { emit: send, signal: controller.signal });
    send({ type: "done", ...out });
  } catch (err) {
    if (!err?.status || err.status >= 500) console.error("[ai] stream failed:", err?.message);
    send({
      type: "error",
      status: err?.status || 500,
      error: err?.status && err.status < 500 ? err.message : err?.status ? err.message : "Orbit AI could not answer. Try again.",
    });
  } finally {
    clearInterval(ping);
    if (!closed) res.end();
  }
});
router.get("/briefing", auth, handle(async (req, res) => res.json(await assistant.briefing(req.user))));
router.get("/usage", auth, handle(async (req, res) => res.json(await assistant.usage(req.user))));

// Phase 2: run or drop a change the assistant prepared. Only the person it
// was prepared for can confirm it, once, within 30 minutes.
router.post("/actions/:id/confirm", auth, handle(async (req, res) => res.json(await assistant.confirmAction(req.user, req.params.id))));
router.post("/actions/:id/cancel", auth, handle(async (req, res) => res.json(await assistant.cancelAction(req.user, req.params.id))));

module.exports = router;
