const { z } = require('zod');
const { asyncHandler } = require('../utils/http');
const { getWorkspaceSettings, saveAiDataSharing, saveAlertDays } = require('../services/settings');

const getSettings = asyncHandler(async (req, res) => {
  res.json(await getWorkspaceSettings(req.workspaceId));
});

const updateSettings = asyncHandler(async (req, res) => {
  const data = z.object({
    alertDays: z.coerce.number().int().refine((value) => [7, 15, 30].includes(value), 'Choose 7, 15, or 30 days').optional(),
    aiDataSharingEnabled: z.boolean().optional()
  }).strict().refine((value) => Object.keys(value).length > 0, 'Provide at least one setting to update').parse(req.body);
  const updates = {};
  if (data.alertDays !== undefined) {
    const settings = await saveAlertDays(req.workspaceId, data.alertDays);
    updates.alertDays = settings.alertDays;
  }
  if (data.aiDataSharingEnabled !== undefined) {
    const settings = await saveAiDataSharing(req.workspaceId, data.aiDataSharingEnabled);
    updates.aiDataSharingEnabled = settings.aiDataSharingEnabled;
  }
  res.json({ ...(await getWorkspaceSettings(req.workspaceId)), ...updates });
});

module.exports = { getSettings, updateSettings };
