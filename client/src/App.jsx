import { useEffect, useState } from 'react';
import Login from './Login.jsx';
import { Mark } from './ui.jsx';
import { Catalogue, MyCourses, MyRequests, Transcript } from './student.jsx';
import { Classes, DropRequests, Reports, Manage, Users, Audit } from './staff.jsx';

// key, menu label, page title, page subtitle, component
const PAGES = {
  catalogue: ['Course catalogue', 'Course catalogue', 'Search courses, check seats and prerequisites, and register. Full courses have a waitlist.', Catalogue],
  mycourses: ['My courses', 'My courses', 'Your registered courses, attendance and waitlist positions.', MyCourses],
  requests: ['My requests', 'My requests', 'Track the drop requests you have sent.', MyRequests],
  transcript: ['Transcript', 'Transcript', 'Your grades, credits and GPA.', Transcript],
  classes: ['My classes', 'Classes', 'Open a class to enter grades and take attendance.', Classes],
  allclasses: ['All classes', 'All classes', 'Open any class to review grades and attendance.', Classes],
  dropreqs: ['Drop requests', 'Drop requests', 'Approve or reject requests. Approving moves the next waitlisted student in.', DropRequests],
  reports: ['Reports', 'Reports', 'Enrolment, seat usage and grades across the university.', Reports],
  manage: ['Manage courses', 'Courses', 'Create, edit, archive or delete courses. Courses with history are archived, never lost.', Manage],
  users: ['Users', 'Users', 'Create accounts, change roles, reset passwords and deactivate users.', Users],
  audit: ['Audit log', 'Audit log', 'A record of who did what, and when.', Audit]
};
const NAV = {
  student: ['catalogue', 'mycourses', 'requests', 'transcript'],
  instructor: ['classes', 'reports'],
  admin: ['dropreqs', 'allclasses', 'reports', 'manage', 'users', 'audit']
};

export default function App() {
  const [session, setSession] = useState(() => JSON.parse(localStorage.getItem('sis') || 'null'));
  const [tab, setTab] = useState('');
  const [toast, setToast] = useState(null);
  const user = session?.user;
  const role = user?.role;
  const say = (text, kind = 'ok') => setToast({ text, kind });

  useEffect(() => { if (role) setTab((t) => (NAV[role].includes(t) ? t : NAV[role][0])); }, [role]);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 4500); return () => clearTimeout(t); }, [toast]);

  const login = (s) => { localStorage.setItem('sis', JSON.stringify(s)); setSession(s); };
  const logout = () => { localStorage.removeItem('sis'); setSession(null); setTab(''); };
  if (!session) return <Login onLogin={login} />;

  const [, , sub, Page] = PAGES[tab] || [];
  const title = PAGES[tab]?.[0] || '';

  return (
    <div className="shell">
      <aside className="side">
        <div className="mark"><Mark /> Mini SIS</div>
        <nav className="nav" aria-label="Main">
          {NAV[role].map((k) => <button key={k} className={k === tab ? 'on' : ''} aria-current={k === tab ? 'page' : undefined} onClick={() => setTab(k)}>{PAGES[k][1]}</button>)}
        </nav>
        <div className="me"><b>{user.name}</b><small>{role}</small><button onClick={logout}>Sign out</button></div>
      </aside>
      <main className="main">
        <div className="page-head"><h2>{title}</h2><p>{sub}</p></div>
        {Page && <Page key={tab} token={session.token} say={say} role={role} user={user} />}
      </main>
      {toast && <div className={'toast' + (toast.kind === 'err' ? ' err' : '')} role="status">{toast.text}</div>}
    </div>
  );
}
