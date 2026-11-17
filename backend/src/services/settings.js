const WorkspaceSettings = require('../models/WorkspaceSettings');
const { getDefaultAlertDays } = require('./scope');

async function getAlertDays(workspaceId) {
  const settings = await WorkspaceSettings.findOne({ workspaceId }).select('alertDays').lean();
  return settings?.alertDays || getDefaultAlertDays();
}

async function getWorkspaceSettings(workspaceId) {
  const settings = await WorkspaceSettings.findOne({ workspaceId }).lean();
  return {
    alertDays: settings?.alertDays || getDefaultAlertDays(),
    aiDataSharingEnabled: settings?.aiDataSharingEnabled === true
  };
}

async function saveAlertDays(workspaceId, alertDays) {
  return WorkspaceSettings.findOneAndUpdate(
    { workspaceId },
    { $set: { alertDays } },
    { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
  );
}

async function saveAiDataSharing(workspaceId, aiDataSharingEnabled) {
  return WorkspaceSettings.findOneAndUpdate(
    { workspaceId },
    { $set: { aiDataSharingEnabled } },
    { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
  );
}

module.exports = { getAlertDays, getWorkspaceSettings, saveAiDataSharing, saveAlertDays };
