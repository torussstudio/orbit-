const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const helmet = require("helmet");

const {
  config,
  validateEnv,
} = require("./config/env");

const {
  errorHandler,
  notFoundHandler,
} = require("./middleware/errorHandler");

const {
  apiLimiter,
  streamLimiter,
} = require("./middleware/rateLimit");

const {
  requestLogger,
} = require("./middleware/requestLogger");

const authRoutes =
  require("./routes/auth");

const memberRoutes =
  require("./routes/members");

const projectRoutes =
  require("./routes/projects");

const taskRoutes =
  require("./routes/tasks");

const clusterRoutes =
  require("./routes/clusters");

const credentialRoutes =
  require("./routes/credentials");

const knowledgeRoutes =
  require("./routes/knowledge");

const dashboardRoutes =
  require("./routes/dashboard");

const calendarRoutes =
  require("./routes/calendar");

const notificationRoutes =
  require("./routes/notifications");

const eventRoutes =
  require("./routes/events");

const timeLogRoutes =
  require("./routes/timeLog");

const preferenceRoutes =
  require("./routes/preferences");

const app = express();

/*
 * Required when running behind Nginx,
 * Cloudflare, load balancer, etc.
 */
app.set("trust proxy", 1);

app.use(requestLogger);

/*
 * Validate environment early.
 */
for (const warning of validateEnv()) {
  console.error(
    `[env] ${warning}`,
  );
}

app.use(
  helmet({
    contentSecurityPolicy:
      config.isProd
        ? undefined
        : false,

    crossOriginEmbedderPolicy:
      false,

    crossOriginResourcePolicy: {
      policy: "cross-origin",
    },
  }),
);

/*
 * Cookie parser MUST come before routes.
 */
app.use(cookieParser());

/*
 * CORS
 */
app.use(
  cors({
    origin(origin, callback) {
      /*
       * Allow requests without an Origin header.
       */
      if (!origin) {
        return callback(null, true);
      }

      if (
        config.clientOrigins.includes(
          origin,
        )
      ) {
        return callback(
          null,
          true,
        );
      }

      return callback(
        new Error(
          `CORS blocked for origin: ${origin}`,
        ),
      );
    },

    credentials: true,

    methods: [
      "GET",
      "POST",
      "PUT",
      "PATCH",
      "DELETE",
      "OPTIONS",
    ],

    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "X-Orbit-Client",
    ],

    /*
     * Lets a cross-origin client read the real list total
     * sent by capped list endpoints.
     */
    exposedHeaders: [
      "X-Total-Count",
    ],
  }),
);

app.use(
  express.json({
    limit: "2mb",
  }),
);

app.use(
  express.urlencoded({
    extended: true,
    limit: "2mb",
  }),
);

/*
 * Live events stream (SSE). OFF unless
 * LIVE_EVENTS_ENABLED=true (answers 204).
 *
 * Mounted before the general API limiter:
 * the stream is one long-lived request with
 * its own limit, so reconnects never use up
 * the normal API budget.
 *
 * There is no compression middleware in this
 * app, so nothing buffers the stream here.
 */
app.use(
  "/api/events",
  streamLimiter,
  eventRoutes,
);

app.use(
  "/api",
  apiLimiter,
);

/*
 * Routes
 */
app.use(
  "/api/auth",
  authRoutes,
);

app.use(
  "/api/members",
  memberRoutes,
);

app.use(
  "/api/projects",
  projectRoutes,
);

app.use(
  "/api/tasks",
  taskRoutes,
);

app.use(
  "/api/clusters",
  clusterRoutes,
);

app.use(
  "/api/credentials",
  credentialRoutes,
);

app.use(
  "/api/knowledge",
  knowledgeRoutes,
);

app.use(
  "/api/dashboard",
  dashboardRoutes,
);

app.use(
  "/api/calendar",
  calendarRoutes,
);

app.use(
  "/api/notifications",
  notificationRoutes,
);

app.use(
  "/api/search",
  require("./routes/search"),
);

app.use(
  '/api/task-requests',
   require('./routes/taskRequests')
);

/*
 * Time Log (managers only): time spent on
 * completed tasks, per project and per member.
 */
app.use(
  "/api/time-log",
  timeLogRoutes,
);

/*
 * Per-user preferences (theme). Any logged-in user,
 * only ever their own row.
 */
app.use(
  "/api/preferences",
  preferenceRoutes,
);

/*
 * Health
 */
app.get("/", (req, res) => {
  res.json({
    message:
      "Orbit Education API v1.0",
  });
});

app.get(
  "/health",
  async (req, res) => {
    let dbOk = false;

    if (config.databaseUrl) {
      try {
        const db = require("./db");

        await db.query(
          "SELECT 1",
        );

        dbOk = true;
      } catch (_) {
        dbOk = false;
      }
    }

    res.json({
      status: dbOk
        ? "ok"
        : "degraded",

      uptime:
        process.uptime(),
    });
  },
);

/*
 * Error handling
 */
app.use(
  notFoundHandler,
);

app.use(
  errorHandler,
);

/*
 * Background jobs
 */
const {
  scheduleDailyReminders,
} = require("./utils/dailyReminder");

scheduleDailyReminders();

/*
 * Deadline reminders are OFF unless
 * DEADLINE_REMINDERS_ENABLED=true.
 */
const {
  scheduleDeadlineReminders,
} = require("./utils/deadlineReminder");

scheduleDeadlineReminders();

/*
 * Local development server.
 */
if (
  !config.isVercel &&
  config.nodeEnv !== "production"
) {
  const PORT =
    config.port;

  const server =
    app.listen(
      PORT,
      () => {
        console.log(
          `Server running on http://localhost:${PORT}`,
        );
      },
    );

  const db =
    require("./db");

  const shutdown =
    async (signal) => {
      console.log(
        `[server] ${signal} received, shutting down…`,
      );

      server.close(
        async () => {
          try {
            await db.end();
          } catch (err) {
            console.error(
              "[db] Pool close error:",
              err.message,
            );
          }

          process.exit(0);
        },
      );
    };

  process.on(
    "SIGINT",
    () => shutdown("SIGINT"),
  );

  process.on(
    "SIGTERM",
    () => shutdown("SIGTERM"),
  );
}

module.exports = app;