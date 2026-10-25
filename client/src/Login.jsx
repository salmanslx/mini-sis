import { useState } from 'react';
import { api } from './api.js';
import { Mark } from './ui.jsx';

const DEMO = [['Student', 'omar@uni.test'], ['Instructor', 'amira@uni.test'], ['Administrator', 'admin@uni.test']];

export default function Login({ onLogin }) {
  const [mode, setMode] = useState('login');
  const [f, setF] = useState({ name: '', email: '', password: '', department: '' });
  const [err, setErr] = useState('');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const submit = async (e) => {
    e.preventDefault(); setErr('');
    try { onLogin(await api(mode === 'login' ? '/auth/login' : '/auth/register', { method: 'POST', body: f })); }
    catch (x) { setErr(x.message); }
  };
  return (
    <div className="auth">
      <section className="auth-brand">
        <div className="mark"><Mark /> Mini SIS</div>
        <div>
          <h1>Registration, approvals and reports in one place.</h1>
          <p>Students register and join waitlists, instructors grade and take attendance, and administrators approve changes with a full audit trail.</p>
        </div>
        <div className="demo">
          <small>Demo accounts (select one to fill the form)</small>
          {DEMO.map(([label, email]) => (
            <button type="button" key={email} onClick={() => { setMode('login'); setF({ ...f, email, password: 'password123' }); }}>
              {label} <span>{email}</span>
            </button>
          ))}
        </div>
      </section>
      <section className="auth-form">
        <form onSubmit={submit}>
          <h2>{mode === 'login' ? 'Sign in' : 'Create a student account'}</h2>
          <p className="sub">{mode === 'login' ? 'Use your university email.' : 'Staff accounts are created by the registrar.'}</p>
          {mode === 'register' && <>
            <div className="field"><label htmlFor="name">Full name</label><input id="name" value={f.name} onChange={set('name')} /></div>
            <div className="field"><label htmlFor="dept">Department</label><input id="dept" value={f.department} onChange={set('department')} /></div>
          </>}
          <div className="field"><label htmlFor="email">Email</label><input id="email" type="email" value={f.email} onChange={set('email')} /></div>
          <div className="field"><label htmlFor="pw">Password</label><input id="pw" type="password" value={f.password} onChange={set('password')} /></div>
          {err && <p className="error" role="alert">{err}</p>}
          <button className="btn">{mode === 'login' ? 'Sign in' : 'Create account'}</button>
          <button type="button" className="linkbtn" onClick={() => { setErr(''); setMode(mode === 'login' ? 'register' : 'login'); }}>
            {mode === 'login' ? 'New student? Create an account' : 'Already registered? Sign in'}
          </button>
        </form>
      </section>
    </div>
  );
}
