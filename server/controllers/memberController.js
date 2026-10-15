const memberService = require("../services/memberService");
const invitationService = require("../services/memberInvitationService");

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

async function createInvitation(req, res, next) {
  try { res.status(201).json(await invitationService.createInvitation(req.body || {}, req.user.id)); } catch (err) { next(err); }
}

async function getInvitation(req, res, next) {
  try { res.json(await invitationService.getInvitation(req.params.token)); } catch (err) { next(err); }
}

async function acceptInvitation(req, res, next) {
  try { res.json(await invitationService.acceptInvitation(req.params.token)); } catch (err) { next(err); }
}

async function listPendingInvitations(req, res, next) {
  try { res.json(await invitationService.listPendingInvitations()); } catch (err) { next(err); }
}

async function decideInvitation(req, res, next) {
  try {
    const decision = req.body?.decision;
    if (!['approve', 'reject'].includes(decision)) return res.status(400).json({ error: 'Choose approve or reject.' });
    res.json(await invitationService.decideInvitation(req.params.id, req.user.id, decision));
  } catch (err) { next(err); }
}

async function completeOnboarding(req, res, next) {
  try { res.json(await invitationService.completeOnboarding(req.user.id)); } catch (err) { next(err); }
}

module.exports = { getAllMembers, getMemberSuggestions, createMember, updateMember, deactivateMember, activateMember, deleteMember, createInvitation, getInvitation, acceptInvitation, listPendingInvitations, decideInvitation, completeOnboarding };
