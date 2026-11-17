require('dotenv').config();
const mongoose = require('mongoose');
const { connectDatabase } = require('../src/config/db');
const Appointment = require('../src/models/Appointment');
const User = require('../src/models/User');

function daysFromNow(days, hour, minute) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  date.setHours(hour, minute, 0, 0);
  return date;
}

async function seedAppointments() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Sample appointments are only for development');
  }
  const email = String(process.env.SEED_EMAIL || '').trim().toLowerCase();
  if (!email) throw new Error('Set SEED_EMAIL to the registered account that should receive sample appointments');

  await connectDatabase();
  const user = await User.findOne({ email }).select('workspaceId').lean();
  if (!user) throw new Error(`No MedTrack account found for SEED_EMAIL ${email}`);

  const samples = [
    {
      sampleKey: 'demo-appointment-1',
      doctorName: 'Dr. Avery Chen',
      specialty: 'Primary care',
      appointmentDate: daysFromNow(2, 10, 30),
      location: 'Community Health Center'
    },
    {
      sampleKey: 'demo-appointment-2',
      doctorName: 'Dr. Morgan Patel',
      specialty: 'Dental care',
      appointmentDate: daysFromNow(8, 14, 0),
      location: 'Riverside Dental Clinic'
    },
    {
      sampleKey: 'demo-appointment-3',
      doctorName: 'Dr. Jordan Lee',
      specialty: 'Eye care',
      appointmentDate: daysFromNow(15, 9, 15),
      location: 'Northside Vision Center'
    }
  ];

  await Promise.all(samples.map(({ sampleKey, ...appointment }) =>
    Appointment.updateOne(
      { workspaceId: user.workspaceId, sampleKey },
      { $setOnInsert: { ...appointment, workspaceId: user.workspaceId, sampleKey, isSample: true, status: 'scheduled' } },
      { upsert: true }
    )
  ));
  console.log('Sample appointments are ready in the selected account workspace.');
}

seedAppointments()
  .catch((error) => {
    console.error('Unable to seed sample appointments:', error.message);
    process.exitCode = 1;
  })
  .finally(async () => mongoose.disconnect());
