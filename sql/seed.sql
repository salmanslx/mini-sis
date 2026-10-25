INSERT INTO users (user_id, name, email, role, department) VALUES
 (1,'Registrar Admin','admin@uni.test','admin','Registrar'),
 (2,'Dr. Amira Hassan','amira@uni.test','instructor','Computing'),
 (3,'Omar','omar@uni.test','student','Computing'),
 (4,'Layla','layla@uni.test','student','Business'),
 (5,'Yusuf','yusuf@uni.test','student','Computing'),
 (6,'Mariam','mariam@uni.test','student','Business'),
 (7,'Khalid','khalid@uni.test','student','Computing');

INSERT INTO courses (course_id, code, title, department, seats, instructor_id) VALUES
 (1,'CS101','Intro to Programming','Computing',3,2),
 (2,'CS201','Databases','Computing',30,2),
 (3,'CS301','Web Engineering','Computing',25,2),
 (4,'BA110','Principles of Management','Business',40,2),
 (5,'BA220','Business Analytics','Business',2,2);

INSERT INTO enrollments (student_id, course_id, grade) VALUES
 (3,1,'A'),(4,1,'B'),(5,1,'A'),(3,2,'C'),(6,2,'B'),(3,3,'A'),
 (7,3,'B'),(4,4,'B'),(6,4,'A'),(4,5,'C'),(5,5,'B');

INSERT INTO drop_requests (student_id, course_id, reason) VALUES (3,1,'Schedule clash');

-- Khalid waits for a seat in CS101 (it is full)
INSERT INTO enrollments (student_id, course_id, status, waitlisted_at) VALUES (7,1,'waitlisted','2026-10-25 09:00:00');

INSERT INTO course_prerequisites VALUES (2,1),(3,2);   -- CS201 needs CS101; CS301 needs CS201

INSERT INTO grade_points VALUES ('A+',4.0),('A',4.0),('A-',3.7),('B+',3.3),('B',3.0),('B-',2.7),('C+',2.3),('C',2.0),('C-',1.7),('D',1.0),('F',0.0);

INSERT INTO attendance VALUES
 (1,3,'2026-10-04',1),(1,4,'2026-10-04',1),(1,5,'2026-10-04',1),
 (1,3,'2026-10-11',1),(1,4,'2026-10-11',0),(1,5,'2026-10-11',1),
 (1,3,'2026-10-18',0),(1,4,'2026-10-18',1),(1,5,'2026-10-18',1);
