const router = require("express").Router();
const { auth, managerOnly, requireSelfOrRole } = require("../middleware/auth");
const calendarController = require("../controllers/calendarController");

// GET all calendar data with optional member filtering
router.get("/", auth, calendarController.getCalendarData);

// POST create event
router.post("/", auth, managerOnly, calendarController.createEvent);

// PUT update event
router.put("/:id", auth, managerOnly, calendarController.updateEvent);

// DELETE event
router.delete("/:id", auth, managerOnly, calendarController.deleteEvent);

// GET events filtered by member
router.get("/member/:memberId", auth, requireSelfOrRole("memberId", "manager"), calendarController.getEventsByMember);

// Search members by email
router.get("/search-members", auth, calendarController.searchMembers);

// Send notification to event guest
router.post("/notify-guest", auth, calendarController.notifyGuest);

module.exports = router;
