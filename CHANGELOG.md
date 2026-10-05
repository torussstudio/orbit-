# Changelog

## Unreleased: security, performance and polish pass (2026-10-02)

Findings, severities and reasoning are in [AUDIT.md](AUDIT.md). This change keeps every API path, request/response shape, permission rule (only tightened), DB meaning and desktop visual. Nothing has been committed or pushed. Pushing to `main` deploys automatically.

### Phase 2.1: Security

- **Search no longer leaks other teams' work (S1).** Members now only get projects they belong to and tasks assigned to them. Managers are unchanged. Same JSON shape. `server/routes/search.js`
- **`GET /api/dashboard/tasks` is manager-only (S2).** Only the manager dashboard uses it. `server/routes/dashboard.js`
- **Calendar `?members=` filter is manager-only (S3).** Members always get their own calendar, which is what the UI already requests. `server/controllers/calendarController.js`
- **`POST /api/calendar/notify-guest` is manager-only and validates its input (S4).** The UI never calls it. `server/routes/calendar.js`, `server/services/calendarService.js`
- **Security headers on the web app (S5, S26):** `X-Content-Type-Options`, `X-Frame-Options: SAMEORIGIN`, `Referrer-Policy`, `Permissions-Policy`, HSTS (same value helmet already sends on the API), `server_tokens off`. `docker/nginx.conf`, new `docker/security-headers.conf`, `Dockerfile`
- **Knowledge uploads (S7, S28).** The stored extension now comes from the allowed MIME type, never from the filename, so `evil.html` can't be served as a page. `project_id` must be an integer or UUID before it goes into the FTP path. Multer errors now return the intended 400 messages instead of a 500. `server/routes/knowledge.js`
- **Profile photo must be an image data URL (S8).** Remote URLs and SVG are rejected with a 400. The size limit equals the existing 2 MB body limit, so nothing that works today breaks. `server/services/authService.js`
- **Login timing (S12).** bcrypt now runs even for unknown emails, so response time no longer reveals which emails exist. Same message and status. `server/services/authService.js`
- **Comments are validated (S19).** Empty comments and comments over 10,000 characters return 400 (was a 500 or an unbounded insert). `server/controllers/taskController.js`
- **Logs no longer dump request bodies and stacks (S18)** on every task update. `server/controllers/taskController.js`
- **Service worker only opens Orbit URLs** from a notification click (S25). `client/public/sw.js`
- **Task-request delete accepts UUID ids** as well as integers (S29). `server/routes/taskRequests.js`
- **Dependencies (S9):** removed the unused `nodemailer` (high-severity CVEs), moved `cross-env` to devDependencies, upgraded `multer` 1.4.5 → 2.4.0 (fixes its DoS advisories, same API), and ran a non-breaking `npm audit fix` on server and client. `server/package*.json`, `client/package-lock.json`
- **Docker:** added `.dockerignore` (excludes `.git`, `node_modules`, `dist`, logs; `.env` not excluded yet, see D9) and a `HEALTHCHECK` (same `/health` probe the deploy workflow uses).

### Phase 2.2: Performance

- **New indexes** (additive, `IF NOT EXISTS`, created automatically at boot): `tasks(parent_task_id)`, `tasks(cluster_id)`, `tasks(stage, updated_at DESC)`, `clusters(project_id)`, `credential_clusters(project_id)`, `knowledge_folders(project_id)`, `knowledge_files(folder_id)`, `notifications(member_id) WHERE read = false`, `calendar_events(start_date)`, `task_requests(requested_by)`. `server/db/index.js`
- **`ensureColumn` for `tasks.time_taken` and `tasks.rework_count`.** These are used everywhere but were never created. No-op on prod. `server/db/index.js`
- **Parallel queries (`Promise.all`)** for task detail (4 queries), knowledge page (3), cluster detail (3) and project detail (2). `taskService.js`, `knowledge.js`, `clusterService.js`, `projectService.js`
- **Gzip for API JSON** (`gzip_proxied any`).
- **Browser caching:** hashed Vite assets cached for 1 year as `immutable`; `index.html` and `sw.js` are `no-cache`, so deploys show up on the next load. The old `/static/` block was CRA-era and never matched anything. `docker/nginx.conf`
- **GSAP moved out of the main bundle.** The main entry chunk went from 147.8 KB to 77.8 KB (51.9 KB to 24.2 KB gzipped). GSAP is now its own lazily loaded 70 KB chunk.
- **`AuthContext` value is memoised**, so the whole app no longer re-renders on every token refresh. `client/src/context/AuthContext.jsx`
- **Polling pauses in background tabs:** the three sidebar badge polls and the notification bell. All of them refresh as soon as the tab is visible again. The bell now fetches its list and count in parallel. `Layout.jsx`, `NotificationBell.jsx`

### Phase 2.3: Code quality

- **ErrorBoundary** (new `client/src/components/ui/ErrorBoundary.jsx`): one at the app root and one around the page outlet, reset on navigation. If an open tab asks for a page chunk that a deploy removed, it reloads once automatically (no loops) instead of showing a blank screen.
- **Removed dead code:** a duplicate push implementation and a second VAPID setup in `server/services/notificationService.js` (the live one is `server/utils/pushNotify.js`); unused `server/utils/cookies.js`; `client/src/utils/entranceAnimation.js` (replaced by `motion.js`).
- **Removed ~15 debug `console.log` calls** from `NotificationBell.jsx` and `AuthContext.jsx`. Errors and warnings are kept.
- `getInReviewTasks` errors go through the shared error handler (no raw DB message).
- **a11y:** the notification bell button has `aria-label` and `aria-expanded`.

### Phase 2.4: Responsiveness

Desktop (≥1024 px) is unchanged.

- **768–1023 px:** Account Settings and Cluster Detail now stack their fixed side column instead of squeezing the main column to ~150 px. `client/src/index.css`
- **Mobile Safari:** legacy `.modal` heights use `dvh` (with a `vh` fallback), so sheet buttons can't sit under the URL bar.
- **Touch targets of at least 40 px on mobile:** hamburger, mobile search, drawer close, search Cancel, notification bell, both modal close buttons. Date-picker arrows keep their look but get a 40 px hit area.
- **Short and landscape screens:** the date-picker panel scrolls instead of running off-screen.

### Phase 2.5: GSAP polish

- One shared helper, `client/src/utils/motion.js`:
  - It lazy-loads GSAP once the browser is idle.
  - It uses `gsap.matchMedia` to turn everything off under `prefers-reduced-motion`.
  - It only animates opacity and transform, for 0.28–0.6 s with `power2.out`.
  - It cleans up with `revert()`/`kill()`.
  - It **never hides content while GSAP is loading**: if the chunk isn't ready yet, the page just appears.
- **Route entrance fade-up** (existing behaviour), now capped to the first 8 elements.
- **Count-up on dashboard stat numbers.** The final value always lands exactly, and React still owns the text node.
- Deliberately **not** added:
  - Modal, dropdown and progress-bar animations, and button hover/press. These already have CSS transitions, and doubling them would fight the existing animations.
  - Any looping, scroll-linked or parallax motion.

### Phase 3: Verification

| Check | Result |
|---|---|
| `client`: `vite build` | ✅ builds, 0 errors |
| `server`: every route and service module loads; `node --check` | ✅ |
| Server HTTP smoke test: the real Express app with a stubbed DB, real JWTs, manager vs member | ✅ **26/26 pass** (S1 search scoping, S2/S3/S4 403s, comment/avatar validation, login 401 and timing, upload 400s, UUID ids, task detail 404) |
| Lint / unit tests | ⚠️ none exist in the repo (no tooling added, to avoid new deps) |
| `EXPLAIN` on new indexes | ⚠️ no DB access here. Run the SQL in "After deploy" below |
| Real-device responsive check | ⚠️ authenticated pages need the API. Login checked in headless Edge at 1440 px. Use the phone checklist below |

**npm audit, before → after**

| Package | Before | After | Remaining (why) |
|---|---|---|---|
| server | 6 (3 high, 2 moderate, 1 low) | 2 (1 high, 1 moderate) | `basic-ftp` (fix is a major bump; the vulnerable `Client.list()` is never called); `qs` (pinned by Express 4; affects `qs.stringify`, which isn't used) |
| client | 9 (3 high, 5 moderate, 1 low) | 2 moderate | `react-router` (fix is the v7 major. One advisory is SSR-only; the other needs user-controlled `<Link to>` values, which Orbit doesn't have) |

**Critical flows, checked by reading the code paths:**

- **Login:** same request and response; only the timing changed.
- **Project create/edit:** untouched. Milanote/Docs links are still validated as http(s) on the server.
- **Task create/edit, member stage change, time-taken modal:** `updateTask` is untouched.
- **Manager review (Done/Rework):** untouched.
- **Comments:** stricter 400s only. The UI already blocks empty input.
- **Notifications and push:** same endpoints. Polling pauses when the tab is hidden. Push setup is unchanged apart from the removed logs.
- **Task View** (`/dashboard/my-tasks`, untouched) and **Task Detail** (same payload, now fetched in parallel).

**No API contract changes.** The only behaviour changes are the stricter checks listed under Phase 2.1.

---

## Deploy (live server)

Downtime is one container recreate (~10–20 s), the same as every normal deploy. No manual SQL is required: indexes and columns are created at boot with `IF NOT EXISTS`.

1. **Review and commit on a branch** (not `main`, which auto-deploys):
   ```bash
   git checkout -b hardening-2026-10
   git add -A && git commit -m "Security, performance and responsive hardening"
   git push -u origin hardening-2026-10
   ```
2. **Optional, recommended: pre-create the indexes without locks** (psql into the `postgres` container). After this, the boot step is a no-op:
   ```sql
   CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tasks_parent_task_id ON tasks (parent_task_id);
   CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tasks_cluster_id ON tasks (cluster_id);
   CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tasks_stage_updated ON tasks (stage, updated_at DESC);
   CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_clusters_project_id ON clusters (project_id);
   CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_credential_clusters_project_id ON credential_clusters (project_id);
   CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_knowledge_folders_project_id ON knowledge_folders (project_id);
   CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_knowledge_files_folder_id ON knowledge_files (folder_id);
   CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_notifications_member_unread ON notifications (member_id) WHERE read = false;
   CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_calendar_events_start_date ON calendar_events (start_date);
   CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_task_requests_requested_by ON task_requests (requested_by);
   ```
   Run it with: `docker exec -it postgres psql -U <user> -d <db>`. Don't wrap these in `BEGIN`.
3. **Tag the current image for instant rollback** (on the VPS, in `/opt/toruss/projects/Orbit`):
   ```bash
   docker image ls | grep -i orbit          # note the orbit-app image name, e.g. orbit-orbit-app
   docker tag <that-image>:latest <that-image>:pre-hardening
   ```
4. **Deploy:** merge the branch into `main` (GitHub Actions builds, runs `up -d`, then health-checks). Or by hand on the VPS:
   ```bash
   git fetch origin && git reset --hard origin/main
   docker compose build orbit-app
   docker compose up -d orbit-app
   ```
5. **Verify:**
   ```bash
   docker exec orbit-app wget -qO- http://127.0.0.1:4000/health        # {"status":"ok",...}
   docker inspect --format '{{.State.Health.Status}}' orbit-app       # healthy (after ~40 s)
   curl -sI https://orbit.toruss.agency/ | grep -iE 'x-frame|x-content|cache-control'
   curl -sI https://orbit.toruss.agency/assets/<any index-*.js> | grep -i cache-control   # max-age=31536000, immutable
   docker logs --tail 50 orbit-app                                     # "Database schema ready", no errors
   ```
6. **After deploy:**
   - Check the indexes exist: `SELECT indexname FROM pg_indexes WHERE indexname LIKE 'idx_%' ORDER BY 1;`
   - Spot-check a plan: `EXPLAIN ANALYZE SELECT * FROM tasks WHERE parent_task_id = <some id>;` should show an Index/Bitmap scan on `idx_tasks_parent_task_id`.
   - Phone checklist: log in as a member, open Task View, change a stage (time-taken modal), open a task and comment, then open the bell. As a manager: Dashboard (count-up), In Review → Done/Rework, Account Settings on a tablet, open and close a modal.

## Rollback

- **Fastest (no rebuild):**
  ```bash
  docker tag <that-image>:pre-hardening <that-image>:latest
  docker compose up -d --no-build orbit-app
  ```
- **Through git:** `git revert <merge-commit> && git push` on `main` (CI redeploys the previous code).
- **Database:** nothing to undo. New indexes and columns are additive and harmless to the old code. If you want them gone: `DROP INDEX CONCURRENTLY IF EXISTS <name>;` for the names above. Leave `time_taken` and `rework_count` alone; prod already used them.
- **Browsers:** old cached `index.html` revalidates on the next load. If an old tab hits a removed chunk, the ErrorBoundary reloads it once.

## Needs your decision

D1–D12 are listed with trade-offs at the bottom of [AUDIT.md](AUDIT.md). The most important is **D1 (`trust proxy`)**: rate limiting is probably shared by all users today.
