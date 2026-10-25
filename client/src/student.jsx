import { useState } from 'react';
import { api } from './api.js';
import { useLoad, SeatStrip, Pill, CourseCell, Table, Summary, Loading, Dialog, downloadCsv } from './ui.jsx';

// ---------- Course catalogue (students register here; admins see it read-only) ----------
export function Catalogue({ token, say, role }) {
  const courses = useLoad('/courses', token);
  const mine = useLoad(role === 'student' ? '/enrollments/me' : null, token);
  const [q, setQ] = useState('');
  const [dept, setDept] = useState('All');
  if (!courses.data) return <Loading q={courses} />;

  const status = {};
  (mine.data || []).forEach((e) => { status[e.course._id] = e.status; });
  const depts = ['All', ...new Set(courses.data.map((c) => c.department))];
  const text = q.trim().toLowerCase();
  const rows = courses.data.filter((c) => (dept === 'All' || c.department === dept) &&
    (!text || [c.code, c.title, c.instructor?.name].some((v) => (v || '').toLowerCase().includes(text))));

  const register = async (c) => {
    try {
      const r = await api('/enrollments', { method: 'POST', token, body: { courseId: c._id } });
      say(r.status === 'waitlisted' ? `${c.code} is full. You are number ${r.position} on the waitlist.` : `Registered for ${c.code}`);
      courses.reload(); mine.reload();
    } catch (x) { say(x.message, 'err'); }
  };

  return <>
    <Summary items={[[courses.data.length, 'courses'], [courses.data.reduce((a, c) => a + Math.max(c.seatsLeft, 0), 0), 'seats open'], [courses.data.filter((c) => c.seatsLeft <= 0).length, 'courses full']]} />
    <div className="toolbar">
      <input aria-label="Search courses" placeholder="Search by code, title or instructor" value={q} onChange={(e) => setQ(e.target.value)} />
      <select aria-label="Department" value={dept} onChange={(e) => setDept(e.target.value)}>{depts.map((d) => <option key={d}>{d}</option>)}</select>
    </div>
    <Table empty={['No matching courses', 'Try a different search or department.']} rows={rows} cols={[
      { h: 'Course', v: (c) => <CourseCell code={c.code} title={c.title} note={c.prerequisites?.length ? 'Requires ' + c.prerequisites.map((p) => p.code).join(', ') : null} /> },
      { h: 'Department', v: (c) => c.department },
      { h: 'Credits', v: (c) => c.credits },
      { h: 'Instructor', v: (c) => c.instructor?.name || '-' },
      { h: 'Availability', v: (c) => <SeatStrip enrolled={c.enrolledCount} seats={c.seats} /> },
      { h: '', act: true, v: (c) => {
        if (role !== 'student') return null;
        if (status[c._id] === 'enrolled') return <Pill status="enrolled">Registered</Pill>;
        if (status[c._id] === 'waitlisted') return <Pill status="waitlisted">On waitlist</Pill>;
        return c.seatsLeft <= 0
          ? <button className="btn quiet small" onClick={() => register(c)}>Join waitlist</button>
          : <button className="btn small" onClick={() => register(c)}>Register</button>;
      } }]} />
  </>;
}

// ---------- My courses: registered, waitlisted, attendance ----------
export function MyCourses({ token, say }) {
  const { data, reload } = useLoad('/enrollments/me', token);
  const [dropFor, setDropFor] = useState(null);
  const [reason, setReason] = useState('');
  if (!data) return <Loading q={{}} />;
  const reg = data.filter((e) => e.status === 'enrolled');
  const wait = data.filter((e) => e.status === 'waitlisted');

  const act = async (fn, ok) => { try { await fn(); say(ok); reload(); } catch (x) { say(x.message, 'err'); } };
  const rate = (a) => (a.held ? `${Math.round((a.present / a.held) * 100)}%  (${a.present}/${a.held} classes)` : 'No classes yet');

  return <>
    <Summary items={[[reg.length, 'courses registered'], [reg.reduce((a, e) => a + e.course.credits, 0), 'credits'], [wait.length, 'on waitlist']]} />
    <Table empty={['No courses yet', 'Open the course catalogue and register for a course.']} rows={reg} cols={[
      { h: 'Course', v: (e) => <CourseCell code={e.course.code} title={e.course.title} /> },
      { h: 'Credits', v: (e) => e.course.credits },
      { h: 'Attendance', v: (e) => rate(e.attendance) },
      { h: 'Grade', v: (e) => e.grade || '-' },
      { h: '', act: true, v: (e) => <button className="btn quiet small" onClick={() => { setReason(''); setDropFor(e); }}>Request drop</button> }]} />

    {wait.length > 0 && <>
      <h3 className="section-title">Waitlist</h3>
      <Table rows={wait} cols={[
        { h: 'Course', v: (e) => <CourseCell code={e.course.code} title={e.course.title} /> },
        { h: 'Your position', v: (e) => <Pill status="waitlisted">#{e.position}</Pill> },
        { h: '', act: true, v: (e) => <button className="btn quiet small" onClick={() => act(() => api('/enrollments/' + e._id, { method: 'DELETE', token }), 'Removed from waitlist')}>Leave waitlist</button> }]} />
    </>}

    {dropFor && (
      <Dialog title={`Request to drop ${dropFor.course.code}`} onClose={() => setDropFor(null)}>
        <p>An administrator will review your request. You stay registered until it is approved.</p>
        <div className="field"><label htmlFor="why">Reason</label><textarea id="why" rows="3" autoFocus value={reason} onChange={(e) => setReason(e.target.value)} /></div>
        <div className="row">
          <button className="btn quiet" onClick={() => setDropFor(null)}>Cancel</button>
          <button className="btn" onClick={() => { const c = dropFor; setDropFor(null); act(() => api('/requests', { method: 'POST', token, body: { courseId: c.course._id, reason } }), 'Drop request sent'); }}>Send request</button>
        </div>
      </Dialog>
    )}
  </>;
}

// ---------- My requests ----------
export function MyRequests({ token }) {
  const q = useLoad('/requests', token);
  if (!q.data) return <Loading q={q} />;
  const count = (s) => q.data.filter((x) => x.status === s).length;
  return <>
    <Summary items={[[count('pending'), 'pending'], [count('approved'), 'approved'], [count('rejected'), 'rejected']]} />
    <Table empty={['No requests', 'Request a drop from My courses.']} rows={q.data} cols={[
      { h: 'Course', v: (x) => <CourseCell code={x.course?.code} title={x.course?.title} /> },
      { h: 'Reason', v: (x) => x.reason || '-' },
      { h: 'Status', v: (x) => <Pill status={x.status} /> }]} />
  </>;
}

// ---------- Transcript with GPA ----------
export function Transcript({ token, user }) {
  const q = useLoad('/transcript', token);
  if (!q.data) return <Loading q={q} />;
  const t = q.data;
  const exportCsv = () => downloadCsv('transcript.csv', [['Student', user.name], [], ['Code', 'Title', 'Credits', 'Grade'],
    ...t.courses.map((c) => [c.code, c.title, c.credits, c.grade]), [], ['GPA', t.gpa ?? ''], ['Credits earned', t.creditsEarned]]);
  return <>
    <Summary items={[[t.gpa ?? '-', 'GPA (4.0 scale)'], [t.creditsEarned, 'credits earned'], [t.creditsAttempted, 'credits graded']]} />
    <div className="toolbar"><button className="btn quiet small" onClick={exportCsv} disabled={!t.courses.length}>Download CSV</button></div>
    <Table empty={['No grades yet', 'Your grades will appear here once instructors enter them.']} rows={t.courses} cols={[
      { h: 'Course', v: (c) => <CourseCell code={c.code} title={c.title} /> },
      { h: 'Credits', v: (c) => c.credits }, { h: 'Grade', v: (c) => <b>{c.grade}</b> }, { h: 'Points', v: (c) => c.points }]} />
  </>;
}
