const { z } = require('zod');
const Batch = require('../models/Batch');
const Medicine = require('../models/Medicine');
const { batchStatus, dayStart } = require('../services/inventory');
const { asyncHandler, httpError } = require('../utils/http');
const { getWorkspaceId } = require('../services/scope');
const { getWorkspaceSettings } = require('../services/settings');

const querySchema = z.object({ query: z.string().trim().min(2).max(500) }).strict();
const restrictedTopics = /\b(diagnos(?:e|is|ing)|dos(?:e|age|ing)|treat(?:ment|ing)?|prescri(?:be|ption)|recommend(?:ation)?|should i take|how much (?:to take|should)|side effects?|cure|symptoms?|medical advice|dispens(?:e|ing)|indications?|contraindications?|interactions?|what .{0,80} used for|what .{0,80} treat)\b/i;

function localAnswer(query, medicines, batches, alertDays) {
  const lowered = query.toLowerCase();
  const today = dayStart();
  const expiring = batches.filter((batch) => batchStatus(batch, today, alertDays) === 'expiring');
  const expired = batches.filter((batch) => batchStatus(batch, today, alertDays) === 'expired');
  const available = batches.filter((batch) => batchStatus(batch, today, alertDays) !== 'expired');
  const total = available.reduce((sum, batch) => sum + batch.quantity, 0);
  const stockByMedicine = new Map();
  for (const batch of available) {
    const key = String(batch.medicineId?._id);
    const current = stockByMedicine.get(key) || { name: batch.medicineId?.name || 'Medicine', quantity: 0, threshold: 0, activeBatches: 0 };
    current.quantity += batch.quantity;
    current.threshold += batch.lowStockThreshold;
    current.activeBatches += 1;
    stockByMedicine.set(key, current);
  }
  const low = [...stockByMedicine.values()].filter((item) =>
    item.activeBatches > 0 && item.quantity <= item.threshold
  );
  const matching = medicines.filter((medicine) => lowered.includes(medicine.name.toLowerCase()));
  if (matching.length) {
    return matching.map((medicine) => {
      const related = batches.filter((batch) => String(batch.medicineId?._id) === String(medicine._id));
      const units = related.reduce((sum, batch) => sum + (batchStatus(batch, today, alertDays) === 'expired' ? 0 : batch.quantity), 0);
      const soon = related.filter((batch) => batchStatus(batch, today, alertDays) === 'expiring').length;
      return `${medicine.name}: ${units} available unit${units === 1 ? '' : 's'} across ${related.length} batch${related.length === 1 ? '' : 'es'}; ${soon} expiring soon.`;
    }).join('\n');
  }
  if (/low stock|running low|reorder/.test(lowered)) {
    return low.length ? `Low-stock products (${low.length}): ${low.map((item) => `${item.name} (${item.quantity} available)`).join(', ')}.` : 'No products are currently below their configured stock thresholds.';
  }
  if (/expir|soon|near date/.test(lowered)) {
    return expiring.length ? `${expiring.length} batch${expiring.length === 1 ? '' : 'es'} expiring within your ${alertDays}-day alert window: ${expiring.map((batch) => `${batch.medicineId?.name || 'Medicine'} (${new Date(batch.expiryDate).toISOString().slice(0, 10)})`).join(', ')}.` : `No batches are due to expire within your ${alertDays}-day alert window.`;
  }
  if (/expired/.test(lowered)) {
    return expired.length ? `${expired.length} expired batch${expired.length === 1 ? '' : 'es'} contain ${expired.reduce((sum, batch) => sum + batch.quantity, 0)} recorded units. Expired stock is excluded from available stock.` : 'There are no expired batches in the inventory.';
  }
  return `Inventory summary: ${medicines.length} products, ${total} available units, ${low.length} low-stock products, ${expiring.length} batches expiring soon, and ${expired.length} expired batches.`;
}

async function providerAnswer(query, inventory, alertDays) {
  const baseUrl = (process.env.AI_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, '');
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${process.env.AI_API_KEY}`,
      'content-type': 'application/json'
    },
    signal: AbortSignal.timeout(15000),
    body: JSON.stringify({
      model: process.env.AI_MODEL || 'gpt-4o-mini',
      temperature: 0.1,
      messages: [
        {
          role: 'system',
          content: 'You are MedTrack, an inventory-only assistant. Answer only about the supplied inventory (product names, categories, batch numbers, recorded quantities, stock thresholds, and expiry dates). Never provide medical information, diagnoses, medicine recommendations, dosage, treatment, or dispensing decisions. Do not infer facts not present in the data. If a question is outside inventory management, politely say you can only help with inventory.'
        },
        { role: 'user', content: `Expiry alert window: ${alertDays} days.\nInventory data: ${JSON.stringify(inventory)}\nQuestion: ${query}` }
      ]
    })
  });
  if (!response.ok) throw httpError(502, 'The configured AI provider could not answer right now');
  const data = await response.json();
  const answer = data.choices?.[0]?.message?.content;
  if (typeof answer !== 'string' || !answer.trim()) throw httpError(502, 'The configured AI provider returned an empty answer');
  if (restrictedTopics.test(answer) || /\b(take \d|dos(?:e|age)|side effects?|symptoms?|diagnos|treat(?:ment|ing)?|prescri(?:be|ption)|dispens(?:e|ing))\b/i.test(answer)) {
    return 'I can only help with inventory information such as stock levels, batches, and expiry dates.';
  }
  return answer.trim().slice(0, 3000);
}

function shouldUseAiProvider(apiKey, sharingEnabled) {
  return Boolean(apiKey && sharingEnabled === true);
}

const ask = asyncHandler(async (req, res) => {
  const { query } = querySchema.parse(req.body);
  if (restrictedTopics.test(query)) {
    return res.json({ answer: 'I can only help with inventory information such as stock levels, batches, and expiry dates.' });
  }
  const [medicines, batches, settings] = await Promise.all([
    Medicine.find({ workspaceId: getWorkspaceId(req) }).select('name category').lean(),
    Batch.find({ workspaceId: getWorkspaceId(req) }).populate('medicineId', 'name category').lean(),
    getWorkspaceSettings(getWorkspaceId(req))
  ]);
  const aiEnabled = shouldUseAiProvider(process.env.AI_API_KEY, settings.aiDataSharingEnabled);
  let answer;
  if (aiEnabled) {
    const inventory = {
      products: medicines.map((medicine) => ({ name: medicine.name, category: medicine.category })),
      batches: batches.map((batch) => ({
        medicine: batch.medicineId?.name || 'Medicine',
        category: batch.medicineId?.category || 'Other',
        batchNumber: batch.batchNumber,
        expiryDate: new Date(batch.expiryDate).toISOString().slice(0, 10),
        quantity: batch.quantity,
        lowStockThreshold: batch.lowStockThreshold
      }))
    };
    answer = await providerAnswer(query, inventory, settings.alertDays);
  } else {
    answer = localAnswer(query, medicines, batches, settings.alertDays);
  }
  res.json({ answer, mode: aiEnabled ? 'ai' : 'local' });
});

module.exports = { ask, localAnswer, shouldUseAiProvider };
