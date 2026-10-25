-- Same data model as the MERN app, written as relational tables.
-- Runs on SQLite, MySQL and PostgreSQL with tiny changes; Oracle notes are in README.md.
PRAGMA foreign_keys = ON;

CREATE TABLE users (
  user_id     INTEGER PRIMARY KEY,
  name        TEXT NOT NULL,
  email       TEXT NOT NULL UNIQUE,
  role        TEXT NOT NULL CHECK (role IN ('student','instructor','admin')),
  department  TEXT,
  active      INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1))   -- 0 = deactivated: cannot log in, records are kept
);

CREATE TABLE courses (
  course_id     INTEGER PRIMARY KEY,
  code          TEXT NOT NULL UNIQUE,
  title         TEXT NOT NULL,
  department    TEXT NOT NULL,
  credits       INTEGER NOT NULL DEFAULT 3,
  seats         INTEGER NOT NULL CHECK (seats > 0),
  instructor_id INTEGER REFERENCES users(user_id),
  archived      INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0,1))  -- 1 = hidden and closed to registration
);

CREATE TABLE enrollments (
  enrollment_id INTEGER PRIMARY KEY,
  student_id    INTEGER NOT NULL REFERENCES users(user_id),
  course_id     INTEGER NOT NULL REFERENCES courses(course_id),
  status        TEXT NOT NULL DEFAULT 'enrolled' CHECK (status IN ('enrolled','waitlisted','dropped')),
  waitlisted_at TEXT,                    -- waitlist order
  grade         TEXT,
  UNIQUE (student_id, course_id)          -- a student can't register twice for the same course
);

CREATE TABLE drop_requests (
  request_id  INTEGER PRIMARY KEY,
  student_id  INTEGER NOT NULL REFERENCES users(user_id),
  course_id   INTEGER NOT NULL REFERENCES courses(course_id),
  reason      TEXT,
  status      TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  decided_by  INTEGER REFERENCES users(user_id)
);

-- Which courses must be passed before another course (CS201 needs CS101)
CREATE TABLE course_prerequisites (
  course_id INTEGER NOT NULL REFERENCES courses(course_id),
  prereq_id INTEGER NOT NULL REFERENCES courses(course_id),
  PRIMARY KEY (course_id, prereq_id)
);

-- One row per student per class session
CREATE TABLE attendance (
  course_id  INTEGER NOT NULL REFERENCES courses(course_id),
  student_id INTEGER NOT NULL REFERENCES users(user_id),
  class_date TEXT NOT NULL,
  present    INTEGER NOT NULL CHECK (present IN (0,1)),
  PRIMARY KEY (course_id, student_id, class_date)
);

-- Grade scale used for GPA (4.0)
CREATE TABLE grade_points (grade TEXT PRIMARY KEY, points REAL NOT NULL);

-- Who did what, and when
CREATE TABLE audit_log (
  log_id     INTEGER PRIMARY KEY,
  actor_id   INTEGER REFERENCES users(user_id),
  action     TEXT NOT NULL,
  detail     TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_enroll_course  ON enrollments(course_id);   -- speeds up "who is in this course?"
CREATE INDEX idx_enroll_student ON enrollments(student_id);  -- speeds up "what is this student taking?"
