const test = require('node:test');
const assert = require('node:assert/strict');
const { appointmentSchema, statusSchema } = require('../src/controllers/appointmentController');

test('appointment records require a doctor and valid date', () => {
  const appointment = appointmentSchema.parse({
    doctorName: '  Dr. Avery Chen ',
    appointmentDate: '2027-01-20T10:30:00.000Z'
  });
  assert.equal(appointment.doctorName, 'Dr. Avery Chen');
  assert.equal(appointment.specialty, '');
  assert.equal(appointment.location, '');

  assert.throws(() => appointmentSchema.parse({
    doctorName: '',
    appointmentDate: 'not-a-date'
  }));
});

test('appointment status is restricted to supported values', () => {
  assert.equal(statusSchema.parse({ status: 'completed' }).status, 'completed');
  assert.throws(() => statusSchema.parse({ status: 'rescheduled' }));
});
