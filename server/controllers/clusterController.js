const clusterService = require("../services/clusterService");

async function getClustersByProject(req, res, next) {
  try { res.json(await clusterService.getClustersByProject(req.params.projectId)); } catch (err) { next(err); }
}

async function getClusterById(req, res, next) {
  try {
    const cluster = await clusterService.getClusterById(req.params.id);
    if (!cluster) return res.status(404).json({ error: "Not found" });
    res.json(cluster);
  } catch (err) { next(err); }
}

async function createCluster(req, res, next) {
  try { res.status(201).json(await clusterService.createCluster({ ...req.body, userId: req.user.id })); } catch (err) { next(err); }
}

async function updateCluster(req, res, next) {
  try { res.json(await clusterService.updateCluster(req.params.id, req.body)); } catch (err) { next(err); }
}

async function submitClusterForReview(req, res, next) {
  try { res.json(await clusterService.submitClusterForReview(req.params.id)); } catch (err) { next(err); }
}

async function reviewCluster(req, res, next) {
  try { res.json(await clusterService.reviewCluster(req.params.id, { ...req.body, reviewerId: req.user.id })); } catch (err) { next(err); }
}

async function completeCluster(req, res, next) {
  try { res.json(await clusterService.completeCluster(req.params.id)); } catch (err) { next(err); }
}

async function deleteCluster(req, res, next) {
  try { await clusterService.deleteCluster(req.params.id); res.json({ success: true }); } catch (err) { next(err); }
}

module.exports = { getClustersByProject, getClusterById, createCluster, updateCluster, submitClusterForReview, reviewCluster, completeCluster, deleteCluster };
