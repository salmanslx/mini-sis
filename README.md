# Mini Student Information System (MERN)

A student information system inspired by how systems like Ellucian Banner work.
**Personal learning project.** It is not Banner and not a production system. It shows the same core ideas in a size one
developer can fully understand and explain.

**Stack:** MongoDB, Express, React (Vite), Node.js. A matching **SQL version** of the data model is in `/sql` (practice only).

## Features
**Students**
- Course catalogue with search, department filter, seat availability and prerequisites
- Register for courses. Prerequisites must be passed first. **Full courses have a waitlist**
- My courses: attendance per course, waitlist position, drop requests with a reason
- Transcript with **GPA (4.0 scale)**, credits earned and CSV download

**Instructors**
- Open a class: roster, **enter grades**, **take attendance** by date, CSV export

**Administrators**
- Approve or reject drop requests. Approving **moves the next waitlisted student in automatically**
- **Courses: create, edit, archive/restore, delete.** Seats can't go below the number registered; raising seats moves waitlisted students in; prerequisite loops are blocked; courses with history are archived, never hard-deleted
- **Users: create accounts, edit roles, reset passwords, deactivate/reactivate.** Users are never hard-deleted, so grades and transcripts survive. Safety rules: you can't deactivate yourself, the last administrator can't be removed, and an instructor with live classes can't be deactivated
- Reports (enrolment, departments, grades) with CSV export
- **Audit log**: who did what, and when

**Platform**
- Role-based access (JWT login, bcrypt passwords). Roles are enforced on the server, not only in the screens
- Atomic seat claim: two students cannot take the last seat together
- LMS integration API protected by an API key

## Run it (from the mini-sis folder)
Requirements: Node 18+ and MongoDB running locally (or a MongoDB Atlas URI in `server/.env`).
```
npm install
npm run seed
npm start
```
Then open http://localhost:5173. `npm start` starts the API and the web app together.
Windows alternative: double-click `seed.bat` once, then `start.bat`.

Demo logins (password `password123`): `omar@uni.test` (student), `amira@uni.test` (instructor), `admin@uni.test` (admin).
**Run `npm run seed` again after updating** so the new demo data (prerequisites, waitlist, attendance) is loaded. It resets the database.

## Try the main flows
1. **Waitlist:** log in as `omar`. CS101 is full and Khalid is waiting. Log in as `admin`, open Drop requests and approve Omar's request. Khalid is moved into CS101 automatically (see the Audit log).
2. **Prerequisite:** log in as `khalid` and try to register for CS201. It is blocked because CS101 is not passed.
3. **Grades and GPA:** log in as `amira`, open CS101, set a grade. Log in as that student and open Transcript.
4. **Admin CRUD:** as `admin`, open Courses and try to delete CS101 (blocked: it has history, archive it instead). Raise the seats of CS101 and watch the waitlisted student move in. Open Users and try to deactivate yourself (blocked).
5. **Attendance:** as `amira`, take attendance for today. Students see their attendance rate in My courses.

## API overview
| Method | Endpoint | Who |
|---|---|---|
| POST | `/api/auth/login`, `/api/auth/register` | public |
| GET / POST | `/api/courses` | any user / admin |
| PATCH / DELETE | `/api/courses/:id` (edit / delete unused course) | admin |
| PATCH | `/api/courses/:id/archive` | admin |
| GET / POST / PATCH | `/api/users`, `/api/users/:id` | admin |
| POST | `/api/users/:id/password` (reset) | admin |
| POST | `/api/enrollments` (register, or join the waitlist when full) | student |
| GET | `/api/enrollments/me` | student |
| DELETE | `/api/enrollments/:id` (leave waitlist) | student |
| PATCH | `/api/enrollments/:id/grade` | instructor of the course, admin |
| GET | `/api/transcript` | student |
| POST / GET / PATCH | `/api/requests` | student creates, admin decides |
| GET | `/api/teaching`, `/api/courses/:id/roster` | instructor, admin |
| GET / POST | `/api/courses/:id/attendance` | instructor of the course, admin |
| GET | `/api/audit` | admin |
| GET | `/api/reports/enrolment` | admin, instructor |
| GET | `/api/lms/courses/:code/roster`, `/api/lms/students/:email/courses` | LMS (header `x-api-key`) |

```
curl -H "x-api-key: lms-demo-key" http://localhost:5000/api/lms/courses/CS101/roster
```

## SQL practice (`/sql`)
`schema.sql`, `seed.sql` and `queries.sql` model the same data as relational tables (including prerequisites, waitlist,
attendance, grade points and audit log). `queries.sql` has 23 queries: joins, GROUP BY / HAVING, subqueries, window functions
(waitlist position), GPA calculation, a view, transactions, soft deletes and safety-rule checks. All of them have been run and tested on SQLite.
The running app uses MongoDB. The SQL files are separate practice.

### MongoDB to SQL cheat sheet
| MERN app | SQL equivalent |
|---|---|
| Collection / document | Table / row |
| `populate()` | `JOIN` |
| `aggregate` + `$group` | `GROUP BY` |
| Unique index | `UNIQUE` constraint |
| Atomic seat claim (`$inc` with a condition) | Transaction with a seat check |
| Waitlist promotion (`sort` + `findOneAndUpdate`) | `ORDER BY ... LIMIT 1` inside a transaction |
| Audit log collection | `audit_log` table |

## How to talk about it in an interview
> "I built a mini student information system to learn how university systems like Banner work. It has role-based access,
> course registration with atomic seat limits, prerequisites and a waitlist that promotes automatically, an instructor
> gradebook with attendance, GPA and transcripts, an approval workflow with an audit log, and an API-key protected
> integration endpoint that an LMS could use. I also modelled the same data in SQL to practise joins, window functions and transactions."

Say it is a personal project, never as work experience. Be ready to explain: why seat claims are atomic, how the waitlist is
ordered and promoted, how roles are enforced on the server, how GPA is calculated, and what you would add next
(email notifications, terms/semesters, PostgreSQL or Oracle backend, automated tests, deployment).
"# mini-sis" 
