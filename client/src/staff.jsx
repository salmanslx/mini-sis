import { useEffect, useState } from 'react';
import { api } from './api.js';
import { useLoad, SeatStrip, Pill, CourseCell, Table, Summary, Loading, Dialog, ConfirmDialog, downloadCsv } from './ui.jsx';

const GRADE_LIST = ['A+', 'A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-', 'D', 'F'];
const today = () => new Date().toISOString().slice(0, 10);

// ---------- Classes: list, then roster + grades + attendance ----------
export function Classes({ token, say, role }) {
  const q = useLoad('/teaching', token);
  const [open, setOpen] = useState(null);
  if (open) return <ClassView course={open} token={token} say={say} onBack={() => setOpen(null)} />;
  if (!q.data) return <Loading q={q} />;
  return <>
    <Summary items={[[q.data.length, role === 'admin' ? 'courses' : 'classes you teach'], [q.data.reduce((a, c) => a + c.enrolledCount, 0), 'students enrolled']]} />
    <Table empty={['No classes assigned', 'An administrator can assign you to a course.']} rows={q.data} cols={[
      { h: 'Course', v: (c) => <CourseCell code={c.code} title={c.title} /> },
      { h: 'Department', v: (c) => c.department },
      { h: 'Enrolment', v: (c) => <SeatStrip enrolled={c.enrolledCount} seats={c.seats} /> },
      { h: '', act: true, v: (c) => <button className="btn small" onClick={() => setOpen(c)}>Open class</button> }]} />
  </>;
}

function ClassView({ course, token, say, onBack }) {
  const roster = useLoad(`/courses/${course._id}/roster`, token);
  const [date, setDate] = useState(today());
  const [marks, setMarks] = useState({});
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!roster.data) return;
    api(`/courses/${course._id}/attendance/${date}`, { token }).then((a) => {
      const m = {};
      roster.data.students.forEach((s) => { const rec = a.records.find((x) => x.student === s.student._id); m[s.student._id] = rec ? rec.present : true; });
      setMarks(m); setSaved(a.records.length > 0);
    }).catch(() => {});
  }, [roster.data, date]);

  if (!roster.data) return <Loading q={roster} />;
  const { students, held, waitlisted } = roster.data;

  const setGrade = async (s, grade) => {
    try { await api(`/enrollments/${s.enrollmentId}/grade`, { method: 'PATCH', token, body: { grade } }); say(`Grade saved for ${s.student.name}`); roster.reload(); }
    catch (x) { say(x.message, 'err'); }
  };
  const saveAttendance = async () => {
    try {
      await api(`/courses/${course._id}/attendance`, { method: 'POST', token, body: { date, records: Object.entries(marks).map(([studentId, present]) => ({ studentId, present })) } });
      say(`Attendance saved for ${date}`); setSaved(true); roster.reload();
    } catch (x) { say(x.message, 'err'); }
  };
  const rate = (s) => (held ? Math.round((s.present / held) * 100) + '%' : '-');
  const exportCsv = () => downloadCsv(`${course.code}-roster.csv`, [['Name', 'Email', 'Department', 'Grade', 'Attendance'],
    ...students.map((s) => [s.student.name, s.student.email, s.student.department, s.grade || '', rate(s)])]);

  return <>
    <button className="linkbtn back" onClick={onBack}>← All classes</button>
    <h3 className="section-title" style={{ marginTop: 8 }}>{course.code} · {course.title}</h3>
    <Summary items={[[students.length, 'students'], [held, 'classes held'], [waitlisted, 'on waitlist']]} />

    <div className="toolbar"><h4>Roster and grades</h4><button className="btn quiet small" onClick={exportCsv}>Download CSV</button></div>
    <Table empty={['No students yet', 'Students appear here once they register.']} rows={students} cols={[
      { h: 'Student', v: (s) => <><b>{s.student.name}</b><span className="title">{s.student.email}</span></> },
      { h: 'Attendance', v: (s) => rate(s) },
      { h: 'Grade', v: (s) => (
        <select aria-label={`Grade for ${s.student.name}`} value={s.grade || ''} onChange={(e) => setGrade(s, e.target.value)}>
          <option value="">Not graded</option>{GRADE_LIST.map((g) => <option key={g}>{g}</option>)}
        </select>) }]} />

    <div className="toolbar" style={{ marginTop: 32 }}>
      <h4>Take attendance</h4>
      <input type="date" aria-label="Class date" value={date} max={today()} onChange={(e) => setDate(e.target.value)} />
      {saved && <Pill status="approved">Saved for this date</Pill>}
    </div>
    <div className="panel attend">
      {students.length === 0 && <div className="empty">No students to mark.</div>}
      {students.map((s) => (
        <label key={s.enrollmentId}>
          <input type="checkbox" checked={!!marks[s.student._id]} onChange={(e) => setMarks({ ...marks, [s.student._id]: e.target.checked })} />
          <span>{s.student.name}</span><small>{marks[s.student._id] ? 'Present' : 'Absent'}</small>
        </label>
      ))}
    </div>
    {students.length > 0 && <div className="toolbar"><button className="btn" onClick={saveAttendance}>Save attendance</button></div>}
  </>;
}

// ---------- Drop requests (admin) ----------
export function DropRequests({ token, say }) {
  const q = useLoad('/requests', token);
  if (!q.data) return <Loading q={q} />;
  const count = (s) => q.data.filter((x) => x.status === s).length;
  const decide = async (x, decision) => {
    try {
      const r = await api('/requests/' + x._id, { method: 'PATCH', token, body: { decision } });
      say(decision === 'approved'
        ? (r.promotedStudent ? `Approved. ${r.promotedStudent} was moved from the waitlist into the course.` : 'Request approved')
        : 'Request rejected');
      q.reload();
    } catch (e) { say(e.message, 'err'); }
  };
  return <>
    <Summary items={[[count('pending'), 'pending'], [count('approved'), 'approved'], [count('rejected'), 'rejected']]} />
    <Table empty={['No requests', 'New drop requests will appear here.']} rows={q.data} cols={[
      { h: 'Student', v: (x) => <><b>{x.student?.name}</b><span className="title">{x.student?.email}</span></> },
      { h: 'Course', v: (x) => <CourseCell code={x.course?.code} title={x.course?.title} /> },
      { h: 'Reason', v: (x) => x.reason || '-' },
      { h: 'Status', v: (x) => <Pill status={x.status} /> },
      { h: '', act: true, v: (x) => x.status === 'pending' && <>
        <button className="btn small" onClick={() => decide(x, 'approved')}>Approve</button>{' '}
        <button className="btn quiet small" onClick={() => decide(x, 'rejected')}>Reject</button></> }]} />
  </>;
}

// ---------- Reports ----------
export function Reports({ token }) {
  const q = useLoad('/reports/enrolment', token);
  if (!q.data) return <Loading q={q} />;
  const { perCourse, perDepartment, grades } = q.data;
  const seats = perCourse.reduce((a, c) => a + c.seats, 0), en = perCourse.reduce((a, c) => a + c.enrolled, 0);
  return <>
    <Summary items={[[en, 'students enrolled'], [seats, 'total seats'], [seats ? Math.round((en / seats) * 100) + '%' : '0%', 'of seats filled']]} />
    <div className="toolbar"><h4>Enrolment by course</h4>
      <button className="btn quiet small" onClick={() => downloadCsv('enrolment-report.csv', [['Code', 'Title', 'Department', 'Enrolled', 'Seats', 'Fill %'], ...perCourse.map((c) => [c.code, c.title, c.department, c.enrolled, c.seats, c.fillPercent])])}>Download CSV</button></div>
    <Table rows={perCourse} cols={[
      { h: 'Course', v: (c) => <CourseCell code={c.code} title={c.title} /> },
      { h: 'Enrolled', v: (c) => `${c.enrolled} of ${c.seats}` },
      { h: 'Seats filled', v: (c) => <div className="fill"><div><i style={{ width: c.fillPercent + '%' }} /></div><span>{c.fillPercent}%</span></div> }]} />
    <h3 className="section-title">By department</h3>
    <Table rows={perDepartment} cols={[{ h: 'Department', v: (x) => x._id }, { h: 'Courses', v: (x) => x.courses }, { h: 'Seats', v: (x) => x.seats }, { h: 'Enrolled', v: (x) => x.enrolled }]} />
    <h3 className="section-title">Grade distribution</h3>
    <Table empty={['No grades yet', 'Grades appear once instructors enter them.']} rows={grades} cols={[{ h: 'Grade', v: (g) => g._id }, { h: 'Students', v: (g) => g.students }]} />
  </>;
}

// ---------- Manage courses (admin): create, edit, archive, delete ----------
function CourseDialog({ token, say, edit, courses, staff, onClose, onSaved }) {
  const [f, setF] = useState(edit ? {
    code: edit.code, title: edit.title, department: edit.department, credits: edit.credits, seats: edit.seats,
    instructor: edit.instructor?._id || '', prerequisites: (edit.prerequisites || []).map((p) => p._id)
  } : { code: '', title: '', department: '', credits: 3, seats: 30, instructor: '', prerequisites: [] });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const toggle = (id) => setF({ ...f, prerequisites: f.prerequisites.includes(id) ? f.prerequisites.filter((x) => x !== id) : [...f.prerequisites, id] });

  const submit = async (e) => {
    e.preventDefault();
    const body = { title: f.title, department: f.department, credits: Number(f.credits), seats: Number(f.seats), instructor: f.instructor || null, prerequisites: f.prerequisites };
    try {
      if (edit) {
        const r = await api('/courses/' + edit._id, { method: 'PATCH', token, body });
        say(r.promoted.length ? `${edit.code} updated. Moved from the waitlist: ${r.promoted.join(', ')}` : `${edit.code} updated`);
      } else {
        await api('/courses', { method: 'POST', token, body: { ...body, code: f.code, instructor: f.instructor || undefined } });
        say(`Course ${f.code.toUpperCase()} created`);
      }
      onSaved(); onClose();
    } catch (x) { say(x.message, 'err'); }
  };

  return (
    <Dialog title={edit ? `Edit ${edit.code}` : 'Add a course'} onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <div className="form-grid">
          <div className="field"><label htmlFor="c-code">Code</label><input id="c-code" required disabled={!!edit} placeholder="CS401" value={f.code} onChange={set('code')} /></div>
          <div className="field wide"><label htmlFor="c-title">Title</label><input id="c-title" required value={f.title} onChange={set('title')} /></div>
          <div className="field"><label htmlFor="c-dept">Department</label><input id="c-dept" required value={f.department} onChange={set('department')} /></div>
          <div className="field"><label htmlFor="c-cr">Credits</label><input id="c-cr" type="number" min="1" max="6" value={f.credits} onChange={set('credits')} /></div>
          <div className="field"><label htmlFor="c-seats">Seats</label><input id="c-seats" type="number" min={edit ? edit.enrolledCount || 1 : 1} value={f.seats} onChange={set('seats')} /></div>
          <div className="field"><label htmlFor="c-inst">Instructor</label>
            <select id="c-inst" value={f.instructor} onChange={set('instructor')}><option value="">Not assigned</option>
              {(staff || []).map((s) => <option key={s._id} value={s._id}>{s.name}</option>)}</select></div>
        </div>
        {edit && <small className="hint">{edit.enrolledCount} students registered. Seats cannot go below that. Raising seats moves waitlisted students in.</small>}
        <div className="field"><label>Prerequisites (students must pass these first)</label>
          <div className="checks">{courses.filter((c) => !edit || c._id !== edit._id).map((c) => (
            <label key={c._id}><input type="checkbox" checked={f.prerequisites.includes(c._id)} onChange={() => toggle(c._id)} /> {c.code}</label>))}
            {courses.length <= (edit ? 1 : 0) && <small>No other courses yet.</small>}</div></div>
        <div className="row"><button type="button" className="btn quiet" onClick={onClose}>Cancel</button><button className="btn">{edit ? 'Save changes' : 'Create course'}</button></div>
      </form>
    </Dialog>
  );
}

export function Manage({ token, say }) {
  const courses = useLoad('/courses?includeArchived=1', token);
  const staff = useLoad('/users?role=instructor&active=1', token);
  const [dialog, setDialog] = useState(null); // { edit?: course } for add or edit
  const [confirm, setConfirm] = useState(null);
  const [q, setQ] = useState('');
  if (!courses.data) return <Loading q={courses} />;

  const run = async (fn, ok) => { try { await fn(); say(ok); courses.reload(); } catch (x) { say(x.message, 'err'); } };
  const text = q.trim().toLowerCase();
  const rows = courses.data.filter((c) => !text || [c.code, c.title, c.department].some((v) => (v || '').toLowerCase().includes(text)));
  const active = courses.data.filter((c) => !c.archived);

  return <>
    <Summary items={[[active.length, 'active courses'], [courses.data.length - active.length, 'archived'], [active.reduce((a, c) => a + c.enrolledCount, 0), 'students enrolled']]} />
    <div className="toolbar">
      <input aria-label="Search courses" placeholder="Search courses" value={q} onChange={(e) => setQ(e.target.value)} />
      <button className="btn" onClick={() => setDialog({})}>Add course</button>
    </div>
    <Table empty={['No courses', 'Add the first course.']} rows={rows} cols={[
      { h: 'Course', v: (c) => <CourseCell code={c.code} title={c.title} note={c.prerequisites?.length ? 'Requires ' + c.prerequisites.map((p) => p.code).join(', ') : null} /> },
      { h: 'Instructor', v: (c) => c.instructor?.name || '-' },
      { h: 'Seats', v: (c) => <SeatStrip enrolled={c.enrolledCount} seats={c.seats} /> },
      { h: 'Status', v: (c) => (c.archived ? <Pill status="archived">Archived</Pill> : <Pill status="active">Active</Pill>) },
      { h: '', act: true, v: (c) => <div className="actions">
        <button className="btn quiet small" onClick={() => setDialog({ edit: c })}>Edit</button>
        <button className="btn quiet small" onClick={() => c.archived
          ? run(() => api(`/courses/${c._id}/archive`, { method: 'PATCH', token, body: { archived: false } }), `${c.code} restored`)
          : setConfirm({ course: c, kind: 'archive' })}>{c.archived ? 'Restore' : 'Archive'}</button>
        <button className="btn quiet small danger-text" onClick={() => setConfirm({ course: c, kind: 'delete' })}>Delete</button>
      </div> }]} />

    {dialog && <CourseDialog token={token} say={say} edit={dialog.edit} courses={courses.data} staff={staff.data} onClose={() => setDialog(null)} onSaved={courses.reload} />}
    {confirm?.kind === 'archive' && (
      <ConfirmDialog title={`Archive ${confirm.course.code}?`} confirmLabel="Archive"
        message="The course is hidden from the catalogue and closed to new registrations. Registered students, grades and history are kept. You can restore it any time."
        onClose={() => setConfirm(null)} onConfirm={() => run(() => api(`/courses/${confirm.course._id}/archive`, { method: 'PATCH', token, body: { archived: true } }), `${confirm.course.code} archived`)} />)}
    {confirm?.kind === 'delete' && (
      <ConfirmDialog danger title={`Delete ${confirm.course.code}?`} confirmLabel="Delete course"
        message="This permanently removes the course. It only works for a course nobody has ever registered for. If it has history, archive it instead."
        onClose={() => setConfirm(null)} onConfirm={() => run(() => api('/courses/' + confirm.course._id, { method: 'DELETE', token }), `${confirm.course.code} deleted`)} />)}
  </>;
}

// ---------- Users (admin): create, edit, reset password, deactivate ----------
const ROLE_LABEL = { student: 'Student', instructor: 'Instructor', admin: 'Administrator' };

function UserDialog({ token, say, edit, onClose, onSaved }) {
  const [f, setF] = useState(edit ? { name: edit.name, email: edit.email, role: edit.role, department: edit.department || '', password: '' }
    : { name: '', email: '', role: 'instructor', department: '', password: '' });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const submit = async (e) => {
    e.preventDefault();
    try {
      if (edit) await api('/users/' + edit._id, { method: 'PATCH', token, body: { name: f.name, role: f.role, department: f.department } });
      else await api('/users', { method: 'POST', token, body: f });
      say(edit ? `${f.name} updated` : `Account created for ${f.name}`); onSaved(); onClose();
    } catch (x) { say(x.message, 'err'); }
  };
  return (
    <Dialog title={edit ? 'Edit user' : 'Add a user'} onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <div className="field"><label htmlFor="u-name">Full name</label><input id="u-name" required value={f.name} onChange={set('name')} /></div>
        <div className="field"><label htmlFor="u-email">Email</label><input id="u-email" type="email" required disabled={!!edit} value={f.email} onChange={set('email')} /></div>
        {!edit && <div className="field"><label htmlFor="u-pw">Temporary password (8+ characters)</label><input id="u-pw" type="password" required minLength="8" value={f.password} onChange={set('password')} /></div>}
        <div className="form-grid">
          <div className="field"><label htmlFor="u-role">Role</label>
            <select id="u-role" value={f.role} onChange={set('role')}>{Object.entries(ROLE_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
          <div className="field"><label htmlFor="u-dept">Department</label><input id="u-dept" value={f.department} onChange={set('department')} /></div>
        </div>
        <div className="row"><button type="button" className="btn quiet" onClick={onClose}>Cancel</button><button className="btn">{edit ? 'Save changes' : 'Create account'}</button></div>
      </form>
    </Dialog>
  );
}

function PasswordDialog({ token, say, user, onClose }) {
  const [pw, setPw] = useState('');
  const submit = async (e) => {
    e.preventDefault();
    try { await api(`/users/${user._id}/password`, { method: 'POST', token, body: { password: pw } }); say(`Password reset for ${user.name}`); onClose(); }
    catch (x) { say(x.message, 'err'); }
  };
  return (
    <Dialog title={`Reset password for ${user.name}`} onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <div className="field"><label htmlFor="n-pw">New password (8+ characters)</label><input id="n-pw" type="password" autoFocus required minLength="8" value={pw} onChange={(e) => setPw(e.target.value)} /></div>
        <div className="row"><button type="button" className="btn quiet" onClick={onClose}>Cancel</button><button className="btn">Reset password</button></div>
      </form>
    </Dialog>
  );
}

export function Users({ token, say }) {
  const users = useLoad('/users', token);
  const [dialog, setDialog] = useState(null);
  const [pwFor, setPwFor] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [role, setRole] = useState('all');
  const [q, setQ] = useState('');
  if (!users.data) return <Loading q={users} />;

  const text = q.trim().toLowerCase();
  const rows = users.data.filter((u) => (role === 'all' || u.role === role) && (!text || [u.name, u.email, u.department].some((v) => (v || '').toLowerCase().includes(text))));
  const count = (r) => users.data.filter((u) => u.role === r && u.active !== false).length;
  const setActive = async (u, active) => {
    try { await api('/users/' + u._id, { method: 'PATCH', token, body: { active } }); say(active ? `${u.name} reactivated` : `${u.name} deactivated`); users.reload(); }
    catch (x) { say(x.message, 'err'); }
  };

  return <>
    <Summary items={[[count('student'), 'students'], [count('instructor'), 'instructors'], [count('admin'), 'administrators']]} />
    <div className="toolbar">
      <input aria-label="Search users" placeholder="Search by name, email or department" value={q} onChange={(e) => setQ(e.target.value)} />
      <select aria-label="Role" value={role} onChange={(e) => setRole(e.target.value)}>
        <option value="all">All roles</option>{Object.entries(ROLE_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
      <button className="btn" onClick={() => setDialog({})}>Add user</button>
    </div>
    <Table empty={['No matching users', 'Try a different search or role.']} rows={rows} cols={[
      { h: 'User', v: (u) => <><b>{u.name}</b><span className="title">{u.email}</span></> },
      { h: 'Role', v: (u) => <Pill status="role">{ROLE_LABEL[u.role]}</Pill> },
      { h: 'Department', v: (u) => u.department || '-' },
      { h: 'Status', v: (u) => (u.active === false ? <Pill status="inactive">Deactivated</Pill> : <Pill status="active">Active</Pill>) },
      { h: '', act: true, v: (u) => <div className="actions">
        <button className="btn quiet small" onClick={() => setDialog({ edit: u })}>Edit</button>
        <button className="btn quiet small" onClick={() => setPwFor(u)}>Reset password</button>
        {u.active === false
          ? <button className="btn quiet small" onClick={() => setActive(u, true)}>Reactivate</button>
          : <button className="btn quiet small danger-text" onClick={() => setConfirm(u)}>Deactivate</button>}
      </div> }]} />

    {dialog && <UserDialog token={token} say={say} edit={dialog.edit} onClose={() => setDialog(null)} onSaved={users.reload} />}
    {pwFor && <PasswordDialog token={token} say={say} user={pwFor} onClose={() => setPwFor(null)} />}
    {confirm && (
      <ConfirmDialog danger title={`Deactivate ${confirm.name}?`} confirmLabel="Deactivate"
        message="They will be signed out and will not be able to log in. Their grades, registrations and history are kept, and you can reactivate the account any time."
        onClose={() => setConfirm(null)} onConfirm={() => setActive(confirm, false)} />)}
  </>;
}

// ---------- Audit log (admin) ----------
export function Audit({ token }) {
  const q = useLoad('/audit', token);
  if (!q.data) return <Loading q={q} />;
  return <>
    <Summary items={[[q.data.length, 'recent events']]} />
    <Table empty={['No activity yet', 'Actions such as registrations, approvals and grades are recorded here.']} rows={q.data} cols={[
      { h: 'When', v: (a) => new Date(a.createdAt).toLocaleString() },
      { h: 'Who', v: (a) => a.actorName },
      { h: 'Action', v: (a) => <code>{a.action}</code> },
      { h: 'Detail', v: (a) => a.detail }]} />
  </>;
}
