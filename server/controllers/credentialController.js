const credentialService = require("../services/credentialService");

async function getCredentials(req, res, next) {
  try { res.json(await credentialService.getCredentialsByProject(req.params.projectId, req.user.role)); } catch (err) { next(err); }
}

async function createCluster(req, res, next) {
  try { res.status(201).json(await credentialService.createCredentialCluster(req.body)); } catch (err) { next(err); }
}

async function updateCluster(req, res, next) {
  try { res.json(await credentialService.updateCredentialCluster(req.params.id, req.body)); } catch (err) { next(err); }
}

async function deleteCluster(req, res, next) {
  try { await credentialService.deleteCredentialCluster(req.params.id); res.json({ success: true }); } catch (err) { next(err); }
}

async function createEntry(req, res, next) {
  try { res.status(201).json(await credentialService.createCredentialEntry(req.body)); } catch (err) { next(err); }
}

async function updateEntry(req, res, next) {
  try { res.json(await credentialService.updateCredentialEntry(req.params.id, req.body)); } catch (err) { next(err); }
}

async function deleteEntry(req, res, next) {
  try { await credentialService.deleteCredentialEntry(req.params.id); res.json({ success: true }); } catch (err) { next(err); }
}

module.exports = { getCredentials, createCluster, updateCluster, deleteCluster, createEntry, updateEntry, deleteEntry };
