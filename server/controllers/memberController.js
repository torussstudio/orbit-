const memberService = require("../services/memberService");

async function getAllMembers(req, res, next) {
  try { res.json(await memberService.getAllMembers()); } catch (err) { next(err); }
}

async function getMemberSuggestions(req, res, next) {
  try { res.json(await memberService.getMemberSuggestions(req.query.search)); } catch (err) { next(err); }
}

async function createMember(req, res, next) {
  try { res.status(201).json(await memberService.createMember(req.body)); } catch (err) { next(err); }
}

async function updateMember(req, res, next) {
  try { res.json(await memberService.updateMember(req.params.id, req.body)); } catch (err) { next(err); }
}

async function deactivateMember(req, res, next) {
  try { await memberService.deactivateMember(req.params.id); res.json({ success: true }); } catch (err) { next(err); }
}

async function activateMember(req, res, next) {
  try { await memberService.activateMember(req.params.id); res.json({ success: true }); } catch (err) { next(err); }
}

async function deleteMember(req, res, next) {
  try { await memberService.deleteMember(req.params.id); res.json({ success: true }); } catch (err) { next(err); }
}

module.exports = { getAllMembers, getMemberSuggestions, createMember, updateMember, deactivateMember, activateMember, deleteMember };
