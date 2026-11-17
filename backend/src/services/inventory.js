function dayStart(value = new Date()) {
  const date = new Date(value);
  date.setUTCHours(0, 0, 0, 0);
  return date;
}

function batchStatus(batch, now = new Date(), configuredAlertDays) {
  const today = dayStart(now);
  const expiry = dayStart(batch.expiryDate);
  if (expiry < today) return 'expired';
  const alertDays = configuredAlertDays || Number(process.env.EXPIRY_ALERT_DAYS) || 30;
  const cutoff = new Date(today);
  cutoff.setUTCDate(cutoff.getUTCDate() + alertDays);
  if (expiry <= cutoff) return 'expiring';
  if (batch.quantity <= batch.lowStockThreshold) return 'low_stock';
  return 'healthy';
}

module.exports = { batchStatus, dayStart };
