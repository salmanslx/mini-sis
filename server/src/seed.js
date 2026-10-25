import 'dotenv/config';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { User, Course, Enrollment, DropRequest, Attendance, AuditLog } from './models.js';

await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/mini_sis');
await Promise.all([User, Course, Enrollment, DropRequest, Attendance, AuditLog].map((m) => m.deleteMany()));

const hash = await bcrypt.hash('password123', 10);
await User.create({ name: 'Registrar Admin', email: 'admin@uni.test', role: 'admin', department: 'Registrar', passwordHash: hash });
const prof = await User.create({ name: 'Dr. Amira Hassan', email: 'amira@uni.test', role: 'instructor', department: 'Computing', passwordHash: hash });
const students = await User.insertMany(['Omar', 'Layla', 'Yusuf', 'Mariam', 'Khalid'].map((n, i) => ({
  name: n, email: `${n.toLowerCase()}@uni.test`, role: 'student', department: i % 2 ? 'Business' : 'Computing', passwordHash: hash })));

const courses = await Course.insertMany([
  { code: 'CS101', title: 'Intro to Programming', department: 'Computing', seats: 3, instructor: prof._id },
  { code: 'CS201', title: 'Databases', department: 'Computing', seats: 30, instructor: prof._id },
  { code: 'CS301', title: 'Web Engineering', department: 'Computing', seats: 25, instructor: prof._id },
  { code: 'BA110', title: 'Principles of Management', department: 'Business', seats: 40, instructor: prof._id },
  { code: 'BA220', title: 'Business Analytics', department: 'Business', seats: 2, instructor: prof._id }
]);
// Prerequisites: CS201 needs CS101, CS301 needs CS201
await Course.updateOne({ _id: courses[1]._id }, { prerequisites: [courses[0]._id] });
await Course.updateOne({ _id: courses[2]._id }, { prerequisites: [courses[1]._id] });

// [course index, student index, grade]  (null = in progress, instructor can grade)
const rows = [
  [0, 0, 'A'], [0, 1, 'B'], [0, 2, 'A'],           // CS101 is full (3 of 3 seats)
  [1, 0, null], [1, 3, 'B'],
  [2, 0, null], [2, 4, 'B'],
  [3, 1, 'B'], [3, 3, 'A'],
  [4, 1, 'C'], [4, 2, null]                         // BA220 is full (2 of 2 seats)
];
for (const [c, s, grade] of rows) {
  await Enrollment.create({ student: students[s]._id, course: courses[c]._id, grade });
  await Course.updateOne({ _id: courses[c]._id }, { $inc: { enrolledCount: 1 } });
}
// Khalid is waiting for a seat in CS101. Approving Omar's drop request moves him in automatically.
await Enrollment.create({ student: students[4]._id, course: courses[0]._id, status: 'waitlisted', waitlistedAt: new Date() });
await DropRequest.create({ student: students[0]._id, course: courses[0]._id, reason: 'Schedule clash' });

// Attendance for CS101 on three past dates
const iso = (daysAgo) => new Date(Date.now() - daysAgo * 864e5).toISOString().slice(0, 10);
const present = [[true, true, true], [true, false, true], [false, true, true]];
for (const [i, flags] of present.entries()) {
  await Attendance.create({ course: courses[0]._id, date: iso(14 - i * 7), records: [0, 1, 2].map((k) => ({ student: students[k]._id, present: flags[k] })) });
}

console.log('Seeded. Logins (password: password123): admin@uni.test, amira@uni.test, omar@uni.test');
await mongoose.disconnect();
