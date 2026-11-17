const test = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const app = require('../src/app');
const { invitationRegistrationSchema, registrationSchema } = require('../src/controllers/authController');
const { requireOwner } = require('../src/middleware/requireAuth');
const { hashPassword, verifyPassword } = require('../src/utils/passwords');

test('registration normalizes email and requires an organization for pharmacies and clinics', () => {
  const household = registrationSchema.parse({
    fullName: '  Riley Example ',
    email: 'RILEY@example.com ',
    password: 'strong-password',
    role: 'household'
  });
  assert.equal(household.email, 'riley@example.com');
  assert.equal(household.fullName, 'Riley Example');

  assert.throws(() => registrationSchema.parse({
    fullName: 'Riley Example',
    email: 'riley@example.com',
    password: 'strong-password',
    role: 'clinic'
  }));
});

test('passwords are salted and verified without storing plaintext', async () => {
  const firstHash = await hashPassword('strong-password');
  const secondHash = await hashPassword('strong-password');
  assert.notEqual(firstHash, secondHash);
  assert.equal(firstHash.includes('strong-password'), false);
  assert.equal(await verifyPassword('strong-password', firstHash), true);
  assert.equal(await verifyPassword('incorrect-password', firstHash), false);
});

test('invitation registration requires the workspace email and a private invite code', () => {
  const registration = invitationRegistrationSchema.parse({
    fullName: 'Staff User',
    email: 'STAFF@example.com',
    password: 'strong-password',
    inviteCode: 'a'.repeat(43)
  });
  assert.equal(registration.email, 'staff@example.com');
  assert.throws(() => invitationRegistrationSchema.parse({
    ...registration,
    role: 'clinic'
  }));
});

test('only workspace owners can manage members and settings', async () => {
  const invoke = (membershipRole) => new Promise((resolve) => {
    requireOwner({ user: { membershipRole } }, {}, (error) => resolve(error || null));
  });

  assert.equal(await invoke('owner'), null);
  assert.equal((await invoke('staff')).status, 403);
});

test('health is public while inventory APIs require a session', async () => {
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    const health = await fetch(`${baseUrl}/api/health`);
    assert.equal(health.status, 200);

    for (const path of ['/api/medicines', '/api/appointments']) {
      const inventory = await fetch(`${baseUrl}${path}`);
      assert.equal(inventory.status, 401);
    }
  } finally {
    server.close();
    await once(server, 'close');
  }
});
