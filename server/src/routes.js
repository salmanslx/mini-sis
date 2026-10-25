import { Router } from 'express';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { User, Course, Enrollment, DropRequest, Attendance, AuditLog } from './models.js';
import { sign, auth, lmsKey } from './auth.js';

const r = Router();
const h = (fn) => (req, res, next) => fn(req, res, next).catch(next);
const fail = (res, code, error) => res.status(code).json({ error });
const isId = (id) => mongoose.isValidObjectId(id);

// Grade points used for GPA (4.0 scale)
const GRADES = { 'A+': 4, A: 4, 'A-': 3.7, 'B+': 3.3, B: 3, 'B-': 2.7, 'C+': 2.3, C: 2, 'C-': 1.7, D: 1, F: 0 };
const canTeach = (user, course) => user.role === 'admin' || String(course.instructor) === user.id;
// Audit trail: records who did what. Never blocks the main action.
const audit = (user, action, detail) => AuditLog.create({ actor: user.id, actorName: user.name, action, detail }).catch(() => {});

// Health check for the hosting platform (no login needed)
r.get('/health', (req, res) => res.json({ ok: true }));

// Reject malformed ids with a clean 400 instead of a server error
r.param('id', (req, res, next, id) => (isId(id) ? next() : fail(res, 400, 'Invalid id')));

// ---------- Auth ----------
r.post('/auth/register', h(async (req, res) => {
  const { name, email, password, department } = req.body;
  if (!name || !email || !password || password.length < 6) return fail(res, 400, 'Name, email and a 6+ character password are required');
  if (await User.findOne({ email: email.toLowerCase() })) return fail(res, 409, 'Email already registered');
  const user = await User.create({ name, email, department, role: 'student', passwordHash: await bcrypt.hash(password, 10) });
  res.status(201).json({ token: sign(user), user: { name: user.name, role: user.role } });
}));

r.post('/auth/login', h(async (req, res) => {
  const user = await User.findOne({ email: (req.body.email || '').toLowerCase() });
  if (!user || !(await bcrypt.compare(req.body.password || '', user.passwordHash))) return fail(res, 401, 'Invalid email or password');
  if (user.active === false) return fail(res, 403, 'This account has been deactivated. Contact the registrar.');
  res.json({ token: sign(user), user: { name: user.name, role: user.role } });
}));

// ---------- Helpers for course management ----------
// Fill free seats from the waitlist, oldest first. Returns the names of the students moved in.
async function promoteFromWaitlist(courseId) {
  const names = [];
  for (;;) {
    const claimed = await Course.findOneAndUpdate({ _id: courseId, $expr: { $lt: ['$enrolledCount', '$seats'] } }, { $inc: { enrolledCount: 1 } });
    if (!claimed) break; // no free seat
    const next = await Enrollment.findOneAndUpdate(
      { course: courseId, status: 'waitlisted' }, { status: 'enrolled', waitlistedAt: null },
      { sort: { waitlistedAt: 1 }, new: true }).populate('student', 'name');
    if (!next) { await Course.updateOne({ _id: courseId }, { $inc: { enrolledCount: -1 } }); break; } // nobody waiting: give the seat back
    names.push(next.student.name);
  }
  return names;
}

// Would these prerequisites make a loop (A needs B, B needs A)?
async function createsCycle(courseId, prereqIds) {
  const seen = new Set();
  const stack = prereqIds.map(String);
  while (stack.length) {
    const id = stack.pop();
    if (id === String(courseId)) return true;
    if (seen.has(id)) continue;
    seen.add(id);
    const c = await Course.findById(id).select('prerequisites').lean();
    if (c) stack.push(...c.prerequisites.map(String));
  }
  return false;
}

// ---------- Courses ----------
r.get('/courses', auth(), h(async (req, res) => {
  const showArchived = req.user.role === 'admin' && req.query.includeArchived === '1';
  const courses = await Course.find(showArchived ? {} : { archived: { $ne: true } })
    .populate('instructor', 'name').populate('prerequisites', 'code title').sort('code').lean();
  res.json(courses.map((c) => ({ ...c, seatsLeft: c.seats - c.enrolledCount })));
}));

r.post('/courses', auth('admin'), h(async (req, res) => {
  const { code, title, department, credits, seats, instructor, prerequisites = [] } = req.body;
  if (!code || !title || !department || !(seats > 0)) return fail(res, 400, 'Code, title, department and seats (1 or more) are required');
  if (instructor && !isId(instructor)) return fail(res, 400, 'Invalid instructor');
  if (!prerequisites.every(isId)) return fail(res, 400, 'Invalid prerequisite');
  try {
    const course = await Course.create({ code: code.trim().toUpperCase(), title, department, credits: credits || 3, seats, instructor: instructor || undefined, prerequisites });
    audit(req.user, 'course.create', `${course.code} ${course.title} (${course.seats} seats)`);
    res.status(201).json(course);
  } catch (e) {
    if (e.code === 11000) return fail(res, 409, 'A course with this code already exists');
    throw e;
  }
}));

// Edit a course. Seats can't drop below the number registered; raising seats lets waitlisted students in.
r.patch('/courses/:id', auth('admin'), h(async (req, res) => {
  const course = await Course.findById(req.params.id);
  if (!course) return fail(res, 404, 'Course not found');
  const b = req.body, set = {};
  for (const k of ['title', 'department']) {
    if (b[k] === undefined) continue;
    if (!String(b[k]).trim()) return fail(res, 400, `${k} cannot be empty`);
    set[k] = String(b[k]).trim();
  }
  if (b.credits !== undefined) { if (!(b.credits >= 1 && b.credits <= 6)) return fail(res, 400, 'Credits must be between 1 and 6'); set.credits = Number(b.credits); }
  if (b.seats !== undefined) { if (!(b.seats > 0)) return fail(res, 400, 'Seats must be 1 or more'); set.seats = Number(b.seats); }
  if (b.instructor !== undefined) { if (b.instructor && !isId(b.instructor)) return fail(res, 400, 'Invalid instructor'); set.instructor = b.instructor || null; }
  if (b.prerequisites !== undefined) {
    if (!Array.isArray(b.prerequisites) || !b.prerequisites.every(isId)) return fail(res, 400, 'Invalid prerequisite');
    if (b.prerequisites.map(String).includes(String(course._id))) return fail(res, 400, 'A course cannot be its own prerequisite');
    if (await createsCycle(course._id, b.prerequisites)) return fail(res, 409, 'These prerequisites would create a loop');
    set.prerequisites = b.prerequisites;
  }
  if (!Object.keys(set).length) return fail(res, 400, 'Nothing to update');

  const newSeats = set.seats ?? course.seats;
  const updated = await Course.findOneAndUpdate({ _id: course._id, enrolledCount: { $lte: newSeats } }, { $set: set }, { new: true });
  if (!updated) return fail(res, 409, `Seats cannot be lower than the ${course.enrolledCount} students already registered`);
  const promoted = set.seats > course.seats ? await promoteFromWaitlist(course._id) : [];
  audit(req.user, 'course.update', `${course.code}: ${Object.keys(set).join(', ')}${promoted.length ? ` (moved from waitlist: ${promoted.join(', ')})` : ''}`);
  res.json({ course: updated, promoted });
}));

// Archive (hide + close to new registrations) or restore. Nothing is deleted.
r.patch('/courses/:id/archive', auth('admin'), h(async (req, res) => {
  const archived = !!req.body.archived;
  const course = await Course.findByIdAndUpdate(req.params.id, { archived }, { new: true });
  if (!course) return fail(res, 404, 'Course not found');
  audit(req.user, archived ? 'course.archive' : 'course.restore', course.code);
  res.json(course);
}));

// Delete only a course that has never been used. Anything with history must be archived instead.
r.delete('/courses/:id', auth('admin'), h(async (req, res) => {
  const course = await Course.findById(req.params.id);
  if (!course) return fail(res, 404, 'Course not found');
  const used = await Enrollment.countDocuments({ course: course._id });
  if (used) return fail(res, 409, `${course.code} has registration history (${used} records). Archive it instead of deleting it.`);
  await Course.deleteOne({ _id: course._id });
  await Course.updateMany({ prerequisites: course._id }, { $pull: { prerequisites: course._id } });
  await DropRequest.deleteMany({ course: course._id });
  await Attendance.deleteMany({ course: course._id });
  audit(req.user, 'course.delete', `${course.code} ${course.title}`);
  res.json({ ok: true });
}));

// ---------- Users (admin) ----------
const ROLES = ['student', 'instructor', 'admin'];
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

r.get('/users', auth('admin'), h(async (req, res) => {
  const filter = {};
  if (req.query.role) filter.role = req.query.role;
  if (req.query.active === '1') filter.active = { $ne: false };
  res.json(await User.find(filter).select('name email role department active createdAt').sort('name').lean());
}));

r.post('/users', auth('admin'), h(async (req, res) => {
  const { name, email, password, role, department } = req.body;
  if (!name?.trim() || !EMAIL.test(email || '')) return fail(res, 400, 'A name and a valid email are required');
  if (!ROLES.includes(role)) return fail(res, 400, 'Role must be student, instructor or admin');
  if (!password || password.length < 8) return fail(res, 400, 'Password must be at least 8 characters');
  if (await User.findOne({ email: email.toLowerCase() })) return fail(res, 409, 'Email already registered');
  const user = await User.create({ name: name.trim(), email, role, department, passwordHash: await bcrypt.hash(password, 10) });
  audit(req.user, 'user.create', `${user.email} (${user.role})`);
  res.status(201).json({ _id: user._id, name: user.name, email: user.email, role: user.role });
}));

r.patch('/users/:id', auth('admin'), h(async (req, res) => {
  const target = await User.findById(req.params.id);
  if (!target) return fail(res, 404, 'User not found');
  const b = req.body, set = {};
  if (b.name !== undefined) { if (!String(b.name).trim()) return fail(res, 400, 'Name cannot be empty'); set.name = String(b.name).trim(); }
  if (b.department !== undefined) set.department = b.department;
  if (b.role !== undefined) { if (!ROLES.includes(b.role)) return fail(res, 400, 'Invalid role'); set.role = b.role; }
  if (b.active !== undefined) set.active = !!b.active;
  if (!Object.keys(set).length) return fail(res, 400, 'Nothing to update');

  const roleChanges = set.role && set.role !== target.role;
  const deactivating = set.active === false && target.active !== false;
  if (String(target._id) === req.user.id && (roleChanges || deactivating)) return fail(res, 409, 'You cannot change your own role or deactivate your own account');
  // Never lock everybody out
  if (target.role === 'admin' && target.active !== false && ((roleChanges && set.role !== 'admin') || deactivating)) {
    const others = await User.countDocuments({ role: 'admin', active: { $ne: false }, _id: { $ne: target._id } });
    if (!others) return fail(res, 409, 'There must be at least one active administrator');
  }
  // Instructors with live classes must be replaced first
  if (target.role === 'instructor' && ((roleChanges && set.role !== 'instructor') || deactivating) && await Course.exists({ instructor: target._id, archived: { $ne: true } })) {
    return fail(res, 409, 'This instructor teaches courses. Assign those courses to someone else first');
  }
  Object.assign(target, set);
  await target.save();
  const what = deactivating ? 'user.deactivate' : set.active === true ? 'user.reactivate' : 'user.update';
  audit(req.user, what, `${target.email}: ${Object.keys(set).join(', ')}`);
  res.json({ _id: target._id, name: target.name, role: target.role, active: target.active });
}));

r.post('/users/:id/password', auth('admin'), h(async (req, res) => {
  const { password } = req.body;
  if (!password || password.length < 8) return fail(res, 400, 'Password must be at least 8 characters');
  const user = await User.findByIdAndUpdate(req.params.id, { passwordHash: await bcrypt.hash(password, 10) });
  if (!user) return fail(res, 404, 'User not found');
  audit(req.user, 'user.password_reset', user.email);
  res.json({ ok: true });
}));

// ---------- Registration, prerequisites and waitlist ----------
r.post('/enrollments', auth('student'), h(async (req, res) => {
  const { courseId } = req.body;
  if (!isId(courseId)) return fail(res, 400, 'Invalid course');
  const course = await Course.findById(courseId).populate('prerequisites', 'code');
  if (!course) return fail(res, 404, 'Course not found');
  if (course.archived) return fail(res, 409, 'This course is closed for registration');
  const existing = await Enrollment.findOne({ student: req.user.id, course: courseId });
  if (existing?.status === 'enrolled') return fail(res, 409, 'Already registered for this course');
  if (existing?.status === 'waitlisted') return fail(res, 409, 'You are already on the waitlist');

  // Prerequisites: each one must be completed with a passing grade
  if (course.prerequisites.length) {
    const passed = await Enrollment.find({
      student: req.user.id, course: { $in: course.prerequisites.map((p) => p._id) }, grade: { $exists: true, $nin: [null, 'F'] }
    }).select('course');
    const have = new Set(passed.map((e) => String(e.course)));
    const missing = course.prerequisites.filter((p) => !have.has(String(p._id)));
    if (missing.length) return fail(res, 409, `Prerequisite not completed: ${missing.map((p) => p.code).join(', ')}`);
  }

  // Atomic seat claim: succeeds only if a seat is still free
  const claimed = await Course.findOneAndUpdate({ _id: courseId, $expr: { $lt: ['$enrolledCount', '$seats'] } }, { $inc: { enrolledCount: 1 } });
  if (claimed) {
    try {
      const enrollment = existing
        ? await Enrollment.findByIdAndUpdate(existing._id, { status: 'enrolled', grade: null, waitlistedAt: null }, { new: true })
        : await Enrollment.create({ student: req.user.id, course: courseId });
      audit(req.user, 'enrollment.register', course.code);
      return res.status(201).json({ status: 'enrolled', enrollment });
    } catch (e) {
      await Course.updateOne({ _id: courseId }, { $inc: { enrolledCount: -1 } }); // give the seat back
      if (e.code === 11000) return fail(res, 409, 'Already registered for this course');
      throw e;
    }
  }

  // Course is full: join the waitlist
  const now = new Date();
  const enrollment = existing
    ? await Enrollment.findByIdAndUpdate(existing._id, { status: 'waitlisted', waitlistedAt: now, grade: null }, { new: true })
    : await Enrollment.create({ student: req.user.id, course: courseId, status: 'waitlisted', waitlistedAt: now });
  const position = await Enrollment.countDocuments({ course: courseId, status: 'waitlisted', waitlistedAt: { $lte: now } });
  audit(req.user, 'enrollment.waitlist', `${course.code} (position ${position})`);
  res.status(202).json({ status: 'waitlisted', position, enrollment });
}));

r.get('/enrollments/me', auth('student'), h(async (req, res) => {
  const rows = await Enrollment.find({ student: req.user.id, status: { $in: ['enrolled', 'waitlisted'] } })
    .populate('course', 'code title credits').lean();
  const sheets = await Attendance.find({ course: { $in: rows.map((e) => e.course._id) } }).lean();
  res.json(await Promise.all(rows.map(async (e) => {
    const mine = sheets.filter((s) => String(s.course) === String(e.course._id));
    return {
      ...e,
      attendance: { held: mine.length, present: mine.filter((s) => s.records.some((x) => String(x.student) === req.user.id && x.present)).length },
      position: e.status === 'waitlisted'
        ? await Enrollment.countDocuments({ course: e.course._id, status: 'waitlisted', waitlistedAt: { $lte: e.waitlistedAt } }) : null
    };
  })));
}));

r.delete('/enrollments/:id', auth('student'), h(async (req, res) => {
  const e = await Enrollment.findOneAndUpdate({ _id: req.params.id, student: req.user.id, status: 'waitlisted' }, { status: 'dropped', waitlistedAt: null });
  if (!e) return fail(res, 404, 'Waitlist entry not found');
  audit(req.user, 'enrollment.leave_waitlist', String(e.course));
  res.json({ ok: true });
}));

// ---------- Grades (instructor of the course, or admin) ----------
r.patch('/enrollments/:id/grade', auth('instructor', 'admin'), h(async (req, res) => {
  const grade = req.body.grade || null;
  if (grade !== null && !Object.hasOwn(GRADES, grade)) return fail(res, 400, 'Invalid grade');
  const e = await Enrollment.findById(req.params.id).populate('course', 'code instructor').populate('student', 'name');
  if (!e || e.status !== 'enrolled') return fail(res, 404, 'Enrollment not found');
  if (!canTeach(req.user, e.course)) return fail(res, 403, 'You do not teach this course');
  e.grade = grade;
  await e.save();
  audit(req.user, 'grade.set', `${e.course.code} - ${e.student.name}: ${grade || 'cleared'}`);
  res.json({ _id: e._id, grade: e.grade });
}));

// ---------- Transcript and GPA ----------
r.get('/transcript', auth('student'), h(async (req, res) => {
  const rows = await Enrollment.find({ student: req.user.id, status: 'enrolled', grade: { $ne: null } }).populate('course', 'code title credits').lean();
  let points = 0, attempted = 0, earned = 0;
  for (const e of rows) {
    const p = GRADES[e.grade];
    if (p === undefined) continue;
    points += p * e.course.credits; attempted += e.course.credits;
    if (e.grade !== 'F') earned += e.course.credits;
  }
  res.json({
    gpa: attempted ? Math.round((points / attempted) * 100) / 100 : null,
    creditsAttempted: attempted, creditsEarned: earned,
    courses: rows.map((e) => ({ code: e.course.code, title: e.course.title, credits: e.course.credits, grade: e.grade, points: GRADES[e.grade] }))
  });
}));

// ---------- Drop-approval workflow (with waitlist promotion) ----------
r.post('/requests', auth('student'), h(async (req, res) => {
  const { courseId, reason } = req.body;
  if (!isId(courseId)) return fail(res, 400, 'Invalid course');
  const enrollment = await Enrollment.findOne({ student: req.user.id, course: courseId, status: 'enrolled' }).populate('course', 'code');
  if (!enrollment) return fail(res, 400, 'You are not registered for this course');
  if (await DropRequest.findOne({ student: req.user.id, course: courseId, status: 'pending' })) return fail(res, 409, 'A request is already pending');
  const request = await DropRequest.create({ student: req.user.id, course: courseId, reason });
  audit(req.user, 'drop.request', enrollment.course.code);
  res.status(201).json(request);
}));

r.get('/requests', auth('student', 'admin'), h(async (req, res) => {
  const filter = req.user.role === 'admin' ? {} : { student: req.user.id };
  if (req.query.status) filter.status = req.query.status;
  res.json(await DropRequest.find(filter).populate('student', 'name email').populate('course', 'code title').sort('-createdAt'));
}));

r.patch('/requests/:id', auth('admin'), h(async (req, res) => {
  const { decision } = req.body;
  if (!['approved', 'rejected'].includes(decision)) return fail(res, 400, "decision must be 'approved' or 'rejected'");
  const request = await DropRequest.findOneAndUpdate(
    { _id: req.params.id, status: 'pending' },
    { status: decision, decidedBy: req.user.id, decidedAt: new Date() }, { new: true })
    .populate('student', 'name').populate('course', 'code');
  if (!request) return fail(res, 404, 'Request not found or already decided');

  let promotedStudent = null;
  if (decision === 'approved') {
    await Enrollment.updateOne({ student: request.student._id, course: request.course._id }, { status: 'dropped' });
    // Free the seat, then give it to the first student on the waitlist (if any)
    await Course.updateOne({ _id: request.course._id }, { $inc: { enrolledCount: -1 } });
    const [first] = await promoteFromWaitlist(request.course._id);
    if (first) {
      promotedStudent = first;
      audit(req.user, 'waitlist.promote', `${request.course.code} - ${first} moved from waitlist`);
    }
  }
  audit(req.user, `drop.${decision}`, `${request.course.code} - ${request.student.name}`);
  res.json({ request, promotedStudent });
}));

// ---------- Teaching: classes, roster, attendance ----------
r.get('/teaching', auth('instructor', 'admin'), h(async (req, res) => {
  const filter = { archived: { $ne: true }, ...(req.user.role === 'admin' ? {} : { instructor: req.user.id }) };
  res.json(await Course.find(filter).select('code title department seats enrolledCount credits').sort('code'));
}));

const loadTaughtCourse = async (req, res) => {
  const course = await Course.findById(req.params.id).lean();
  if (!course) { fail(res, 404, 'Course not found'); return null; }
  if (!canTeach(req.user, course)) { fail(res, 403, 'You do not teach this course'); return null; }
  return course;
};

r.get('/courses/:id/roster', auth('instructor', 'admin'), h(async (req, res) => {
  const course = await loadTaughtCourse(req, res); if (!course) return;
  const rows = await Enrollment.find({ course: course._id, status: 'enrolled' }).populate('student', 'name email department').lean();
  const sheets = await Attendance.find({ course: course._id }).lean();
  res.json({
    course: { _id: course._id, code: course.code, title: course.title },
    held: sheets.length,
    waitlisted: await Enrollment.countDocuments({ course: course._id, status: 'waitlisted' }),
    students: rows.map((e) => ({
      enrollmentId: e._id, student: e.student, grade: e.grade,
      present: sheets.filter((s) => s.records.some((x) => String(x.student) === String(e.student._id) && x.present)).length
    }))
  });
}));

r.get('/courses/:id/attendance/:date', auth('instructor', 'admin'), h(async (req, res) => {
  const course = await loadTaughtCourse(req, res); if (!course) return;
  const sheet = await Attendance.findOne({ course: course._id, date: req.params.date }).lean();
  res.json({ records: sheet?.records || [] });
}));

r.post('/courses/:id/attendance', auth('instructor', 'admin'), h(async (req, res) => {
  const course = await loadTaughtCourse(req, res); if (!course) return;
  const { date, records = [] } = req.body;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) return fail(res, 400, 'Date must look like 2026-10-25');
  const enrolled = await Enrollment.find({ course: course._id, status: 'enrolled' }).select('student').lean();
  const ok = new Set(enrolled.map((e) => String(e.student)));
  const clean = records.filter((x) => ok.has(String(x.studentId))).map((x) => ({ student: x.studentId, present: !!x.present }));
  await Attendance.findOneAndUpdate({ course: course._id, date }, { records: clean }, { upsert: true });
  audit(req.user, 'attendance.save', `${course.code} on ${date} (${clean.filter((x) => x.present).length}/${clean.length} present)`);
  res.json({ ok: true, saved: clean.length });
}));

// ---------- Audit log ----------
r.get('/audit', auth('admin'), h(async (req, res) => {
  res.json(await AuditLog.find().sort('-createdAt').limit(100).lean());
}));

// ---------- Reports ----------
r.get('/reports/enrolment', auth('admin', 'instructor'), h(async (req, res) => {
  const perCourse = await Course.aggregate([
    { $project: { code: 1, title: 1, department: 1, seats: 1, enrolled: '$enrolledCount',
        fillPercent: { $round: [{ $multiply: [{ $divide: ['$enrolledCount', '$seats'] }, 100] }, 0] } } },
    { $sort: { code: 1 } }
  ]);
  const perDepartment = await Course.aggregate([
    { $group: { _id: '$department', courses: { $sum: 1 }, seats: { $sum: '$seats' }, enrolled: { $sum: '$enrolledCount' } } },
    { $sort: { _id: 1 } }
  ]);
  const grades = await Enrollment.aggregate([
    { $match: { status: 'enrolled', grade: { $ne: null } } }, { $group: { _id: '$grade', students: { $sum: 1 } } }, { $sort: { _id: 1 } }
  ]);
  res.json({ perCourse, perDepartment, grades });
}));

// ---------- LMS integration API (system-to-system, API key) ----------
r.get('/lms/courses/:code/roster', lmsKey, h(async (req, res) => {
  const course = await Course.findOne({ code: req.params.code.toUpperCase() }).lean();
  if (!course) return fail(res, 404, 'Course not found');
  const rows = await Enrollment.find({ course: course._id, status: 'enrolled' }).populate('student', 'name email department').lean();
  res.json({ course: course.code, title: course.title, students: rows.map((e) => e.student) });
}));

r.get('/lms/students/:email/courses', lmsKey, h(async (req, res) => {
  const student = await User.findOne({ email: req.params.email.toLowerCase(), role: 'student' }).lean();
  if (!student) return fail(res, 404, 'Student not found');
  const rows = await Enrollment.find({ student: student._id, status: 'enrolled' }).populate('course', 'code title credits').lean();
  res.json({ student: student.email, courses: rows.map((e) => e.course) });
}));

export default r;
