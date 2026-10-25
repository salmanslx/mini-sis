-- SQL practice for the Mini SIS. Run the whole file, or paste one query at a time.
-- Each query shows a skill an interviewer is likely to ask about.

-- 1. SELECT + WHERE + ORDER BY: all Computing courses, biggest first
SELECT code, title, seats FROM courses WHERE department = 'Computing' ORDER BY seats DESC;

-- 2. INNER JOIN: which students are in CS101?
SELECT u.name, u.email
FROM enrollments e
JOIN users u   ON u.user_id = e.student_id
JOIN courses c ON c.course_id = e.course_id
WHERE c.code = 'CS101' AND e.status = 'enrolled';

-- 3. GROUP BY + COUNT: enrolled students per course (the registrar's report)
SELECT c.code, c.title, COUNT(e.enrollment_id) AS enrolled, c.seats
FROM courses c
LEFT JOIN enrollments e ON e.course_id = c.course_id AND e.status = 'enrolled'
GROUP BY c.course_id, c.code, c.title, c.seats
ORDER BY enrolled DESC;

-- 4. LEFT JOIN to find gaps: students with NO registrations (returns no rows with the seed data; insert a new student to see one)
SELECT u.name
FROM users u
LEFT JOIN enrollments e ON e.student_id = u.user_id
WHERE u.role = 'student' AND e.enrollment_id IS NULL;

-- 5. HAVING: courses that are at least 66% full
SELECT c.code, COUNT(*) AS enrolled, c.seats,
       ROUND(100.0 * COUNT(*) / c.seats) AS fill_percent
FROM courses c JOIN enrollments e ON e.course_id = c.course_id
WHERE e.status = 'enrolled'
GROUP BY c.course_id, c.code, c.seats
HAVING 100.0 * COUNT(*) / c.seats >= 66;

-- 6. Aggregation by department: seats vs enrolled
SELECT c.department, COUNT(DISTINCT c.course_id) AS courses, SUM(c.seats) AS total_seats,
       COUNT(e.enrollment_id) AS enrolled
FROM courses c LEFT JOIN enrollments e ON e.course_id = c.course_id AND e.status = 'enrolled'
GROUP BY c.department;

-- 7. Grade distribution
SELECT grade, COUNT(*) AS students FROM enrollments WHERE grade IS NOT NULL GROUP BY grade ORDER BY grade;

-- 8. Subquery: students enrolled in more than one course
SELECT name FROM users
WHERE user_id IN (SELECT student_id FROM enrollments WHERE status = 'enrolled' GROUP BY student_id HAVING COUNT(*) > 1);

-- 9. Window function: rank students by number of courses taken
SELECT u.name, COUNT(*) AS courses_taken,
       RANK() OVER (ORDER BY COUNT(*) DESC) AS rank_no
FROM enrollments e JOIN users u ON u.user_id = e.student_id
GROUP BY u.user_id, u.name;

-- 10. VIEW: a reusable "roster" that other systems (like an LMS) can read
CREATE VIEW course_roster AS
SELECT c.code AS course_code, u.name AS student_name, u.email AS student_email
FROM enrollments e
JOIN users u   ON u.user_id = e.student_id
JOIN courses c ON c.course_id = e.course_id
WHERE e.status = 'enrolled';
SELECT * FROM course_roster WHERE course_code = 'CS301';

-- 11. TRANSACTION: approve a drop request. Both changes succeed together or not at all.
BEGIN;
UPDATE drop_requests SET status = 'approved', decided_by = 1 WHERE request_id = 1 AND status = 'pending';
UPDATE enrollments   SET status = 'dropped' WHERE student_id = 3 AND course_id = 1;
COMMIT;
SELECT status FROM enrollments WHERE student_id = 3 AND course_id = 1;

-- 12. Seat check before registering (the SQL version of the atomic seat claim in the MERN app)
SELECT c.code,
       c.seats - COUNT(e.enrollment_id) AS seats_left
FROM courses c LEFT JOIN enrollments e ON e.course_id = c.course_id AND e.status = 'enrolled'
WHERE c.code = 'BA220'
GROUP BY c.course_id, c.code, c.seats;

-- ================= Advanced queries for the new features =================

-- 13. GPA per student (weighted by credits) using a JOIN to the grade scale
SELECT u.name,
       ROUND(SUM(gp.points * c.credits) * 1.0 / SUM(c.credits), 2) AS gpa,
       SUM(c.credits) AS credits_graded
FROM enrollments e
JOIN users u         ON u.user_id = e.student_id
JOIN courses c       ON c.course_id = e.course_id
JOIN grade_points gp ON gp.grade = e.grade
WHERE e.status = 'enrolled'
GROUP BY u.user_id, u.name
ORDER BY gpa DESC;

-- 14. Waitlist order: position of each waiting student (window function)
SELECT c.code, u.name,
       ROW_NUMBER() OVER (PARTITION BY e.course_id ORDER BY e.waitlisted_at) AS position
FROM enrollments e
JOIN users u   ON u.user_id = e.student_id
JOIN courses c ON c.course_id = e.course_id
WHERE e.status = 'waitlisted';

-- 15. Attendance rate per student in a course
SELECT u.name,
       SUM(a.present) AS classes_present,
       COUNT(*)       AS classes_held,
       ROUND(100.0 * SUM(a.present) / COUNT(*)) AS attendance_percent
FROM attendance a JOIN users u ON u.user_id = a.student_id
WHERE a.course_id = 1
GROUP BY u.user_id, u.name;

-- 16. Prerequisite check: which prerequisites has student 6 (Mariam) NOT passed for CS201?
SELECT pc.code AS missing_prerequisite
FROM course_prerequisites cp
JOIN courses pc ON pc.course_id = cp.prereq_id
WHERE cp.course_id = 2
  AND NOT EXISTS (
    SELECT 1 FROM enrollments e
    WHERE e.student_id = 6 AND e.course_id = cp.prereq_id AND e.grade IS NOT NULL AND e.grade <> 'F');

-- 17. Promote the first waitlisted student when a seat frees up (the SQL version of the waitlist promotion in the app)
BEGIN;
UPDATE enrollments SET status = 'enrolled', waitlisted_at = NULL
WHERE enrollment_id = (SELECT enrollment_id FROM enrollments WHERE course_id = 1 AND status = 'waitlisted' ORDER BY waitlisted_at LIMIT 1);
INSERT INTO audit_log (actor_id, action, detail) VALUES (1, 'waitlist.promote', 'CS101: first waitlisted student moved in');
COMMIT;
SELECT u.name, e.status FROM enrollments e JOIN users u ON u.user_id = e.student_id WHERE e.course_id = 1;

-- 18. Students at risk: attendance below 75%
SELECT u.name, c.code, ROUND(100.0 * SUM(a.present) / COUNT(*)) AS attendance_percent
FROM attendance a JOIN users u ON u.user_id = a.student_id JOIN courses c ON c.course_id = a.course_id
GROUP BY a.course_id, a.student_id, u.name, c.code
HAVING 100.0 * SUM(a.present) / COUNT(*) < 75;

-- ================= Admin CRUD: soft delete and safety rules =================

-- 19. Soft delete: archive a course and deactivate a user instead of deleting them (history is kept)
UPDATE courses SET archived = 1 WHERE code = 'BA220';
UPDATE users   SET active = 0   WHERE email = 'khalid@uni.test';
SELECT code, archived FROM courses WHERE code = 'BA220';

-- 20. The catalogue shows only active courses
SELECT code, title FROM courses WHERE archived = 0 ORDER BY code;

-- 21. Which courses are safe to hard-delete? Only those nobody has ever registered for.
SELECT c.code
FROM courses c
WHERE NOT EXISTS (SELECT 1 FROM enrollments e WHERE e.course_id = c.course_id);

-- 22. Safety rule: how many OTHER active administrators exist? (must not be 0 before deactivating an admin)
SELECT COUNT(*) AS other_active_admins
FROM users WHERE role = 'admin' AND active = 1 AND user_id <> 1;

-- 23. Seats can't go below the number registered: courses where a proposed new seat limit of 2 would be too low
SELECT c.code, COUNT(e.enrollment_id) AS registered
FROM courses c JOIN enrollments e ON e.course_id = c.course_id AND e.status = 'enrolled'
GROUP BY c.course_id, c.code
HAVING COUNT(e.enrollment_id) > 2;
