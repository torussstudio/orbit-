const calendarService = require("../services/calendarService");

function parseMemberEmails(rawMembers) {
  if (!rawMembers) return [];

  return [...new Set(
    String(rawMembers)
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  )];
}

class CalendarController {
  async getCalendarData(req, res, next) {
    try {
      const memberEmailList = parseMemberEmails(req.query.members);
      const isManager = req.user.role === "manager";
      const userId = req.user.id;
      
      const data = await calendarService.getCalendarData(userId, isManager, memberEmailList);
      res.json(data);
    } catch (e) {
      next(e);
    }
  }

  async createEvent(req, res, next) {
    try {
      const event = await calendarService.createEvent(req.body, req.user.id);
      res.status(201).json(event);
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  }

  async updateEvent(req, res, next) {
    try {
      const event = await calendarService.updateEvent(req.params.id, req.body);
      res.json(event);
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  }

  async deleteEvent(req, res, next) {
    try {
      const result = await calendarService.deleteEvent(req.params.id);
      res.json(result);
    } catch (e) {
      next(e);
    }
  }

  async getEventsByMember(req, res, next) {
    try {
      const events = await calendarService.getEventsByMember(req.params.memberId);
      res.json(events);
    } catch (e) {
      next(e);
    }
  }

  async searchMembers(req, res, next) {
    try {
      const members = await calendarService.searchMembers(req.query.email);
      res.json(members);
    } catch (e) {
      next(e);
    }
  }

  async notifyGuest(req, res, next) {
    try {
      const result = await calendarService.notifyGuest(req.body);
      res.json(result);
    } catch (e) {
      next(e);
    }
  }
}

module.exports = new CalendarController();
