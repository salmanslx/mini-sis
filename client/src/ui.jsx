import { useEffect, useState, useCallback } from 'react';
import { api } from './api.js';

export const Mark = () => (
  <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden="true">
    <rect width="28" height="28" rx="7" fill="#fff" />
    <rect x="6" y="7" width="16" height="3" rx="1.5" fill="#0f3d3e" />
    <rect x="6" y="12.5" width="11" height="3" rx="1.5" fill="#0f3d3e" />
    <rect x="6" y="18" width="14" height="3" rx="1.5" fill="#1a5658" />
  </svg>
);

// Loads data from the API and lets a page reload it after an action. Pass null to skip loading.
export function useLoad(path, token) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const reload = useCallback(async () => {
    if (!path) return;
    try { setData(await api(path, { token })); setErr(''); } catch (x) { setErr(x.message); }
  }, [path, token]);
  useEffect(() => { setData(null); reload(); }, [reload]);
  return { data, err, reload };
}

export function SeatStrip({ enrolled, seats }) {
  const n = Math.min(seats, 30);
  const filled = Math.round((enrolled / seats) * n);
  const left = seats - enrolled;
  return (
    <div className="seats-cell">
      <div className={'seats' + (left <= 0 ? ' full' : '')} role="img" aria-label={`${enrolled} of ${seats} seats taken`}>
        {Array.from({ length: n }, (_, i) => <i key={i} className={i < filled ? 'on' : ''} />)}
      </div>
      <small className={left <= 0 ? 'full' : ''}>{left <= 0 ? 'Full' : `${left} of ${seats} seats left`}</small>
    </div>
  );
}

export const Pill = ({ status, children }) => <span className={'pill ' + status}>{children || status}</span>;
export const CourseCell = ({ code, title, note }) => <><b>{code}</b><span className="title">{title}</span>{note && <span className="title note">{note}</span>}</>;

export function Table({ cols, rows, empty = ['Nothing here yet', ''] }) {
  if (!rows.length) return <div className="panel"><div className="empty"><b>{empty[0]}</b>{empty[1]}</div></div>;
  return (
    <div className="panel"><table>
      <thead><tr>{cols.map((c) => <th key={c.h || 'a'}>{c.h}</th>)}</tr></thead>
      <tbody>{rows.map((r, i) => <tr key={r._id || r.enrollmentId || i}>{cols.map((c) => <td key={c.h || 'a'} className={c.act ? 'act' : ''}>{c.v(r)}</td>)}</tr>)}</tbody>
    </table></div>
  );
}

export const Summary = ({ items }) => (
  <div className="summary">{items.map(([v, l]) => <div key={l}><b>{v}</b><span>{l}</span></div>)}</div>
);

export const Loading = ({ q }) => (q.err ? <p className="error">{q.err}</p> : <p className="empty">Loading…</p>);

export function Dialog({ title, onClose, children }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="overlay" onClick={onClose}>
      <div className="dialog" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <h3>{title}</h3>
        {children}
      </div>
    </div>
  );
}

// Ask before anything destructive. `danger` makes the confirm button red.
export function ConfirmDialog({ title, message, confirmLabel = 'Confirm', danger, onConfirm, onClose }) {
  return (
    <Dialog title={title} onClose={onClose}>
      <p>{message}</p>
      <div className="row">
        <button className="btn quiet" onClick={onClose}>Cancel</button>
        <button className={'btn' + (danger ? ' danger' : '')} onClick={() => { onClose(); onConfirm(); }}>{confirmLabel}</button>
      </div>
    </Dialog>
  );
}

// Download a table as a CSV file (opens in Excel). Cells starting with = + - @ are neutralised so Excel can't run them as formulas.
export function downloadCsv(name, rows) {
  const cell = (v) => { let s = String(v ?? ''); if (/^[=+\-@]/.test(s)) s = "'" + s; return '"' + s.replace(/"/g, '""') + '"'; };
  const blob = new Blob(['\ufeff' + rows.map((r) => r.map(cell).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name; a.click();
  URL.revokeObjectURL(a.href);
}
