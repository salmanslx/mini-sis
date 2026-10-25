import mongoose from 'mongoose';
const { Schema, model } = mongoose;
const ref = (name) => ({ type: Schema.Types.ObjectId, ref: name });

export const User = model('User', new Schema({
  name: String,
  email: { type: String, unique: true, lowercase: true },
  passwordHash: String,
  role: { type: String, enum: ['student', 'instructor', 'admin'], default: 'student' },
  department: String,
  active: { type: Boolean, default: true } // deactivated users cannot log in, but their records stay
}, { timestamps: true }));

export const Course = model('Course', new Schema({
  code: { type: String, unique: true },
  title: String,
  department: String,
  credits: { type: Number, default: 3 },
  seats: Number,
  enrolledCount: { type: Number, default: 0 }, // kept in sync so seat limits can be enforced atomically
  instructor: ref('User'),
  prerequisites: [ref('Course')],
  archived: { type: Boolean, default: false } // archived courses are hidden and closed to new registrations
}));

const enrollmentSchema = new Schema({
  student: ref('User'),
  course: ref('Course'),
  status: { type: String, enum: ['enrolled', 'waitlisted', 'dropped'], default: 'enrolled' },
  waitlistedAt: { type: Date, default: null }, // waitlist order
  grade: { type: String, default: null }
}, { timestamps: true });
enrollmentSchema.index({ student: 1, course: 1 }, { unique: true });
export const Enrollment = model('Enrollment', enrollmentSchema);

export const DropRequest = model('DropRequest', new Schema({
  student: ref('User'),
  course: ref('Course'),
  reason: String,
  status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
  decidedBy: ref('User'),
  decidedAt: Date
}, { timestamps: true }));

const attendanceSchema = new Schema({
  course: ref('Course'),
  date: String, // YYYY-MM-DD
  records: [{ _id: false, student: ref('User'), present: Boolean }]
});
attendanceSchema.index({ course: 1, date: 1 }, { unique: true });
export const Attendance = model('Attendance', attendanceSchema);

export const AuditLog = model('AuditLog', new Schema({
  actor: ref('User'),
  actorName: String,
  action: String,
  detail: String
}, { timestamps: true }));
