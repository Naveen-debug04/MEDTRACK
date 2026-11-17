function getWorkspaceId(req) {
  if (!req || !req.workspaceId) throw new Error('Authenticated workspace is required');
  return req.workspaceId;
}

function getDefaultAlertDays() {
  const configured = Number(process.env.EXPIRY_ALERT_DAYS);
  return [7, 15, 30].includes(configured) ? configured : 30;
}

module.exports = { getDefaultAlertDays, getWorkspaceId };
