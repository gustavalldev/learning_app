import express from 'express';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { pool, query, withTransaction } from './db.js';

const app = express();
const port = process.env.PORT || 4000;
const jwtSecret = process.env.JWT_SECRET || 'dev-secret-change-in-production';

app.use(cors());
app.use(express.json());

function asyncHandler(handler) {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

function toPublicUser(row) {
  return {
    id: Number(row.id),
    fullName: row.full_name,
    email: row.email,
    role: row.role,
    group: row.group_name || undefined,
    department: row.department || undefined
  };
}

function createToken(user) {
  return jwt.sign({ sub: user.id, role: user.role }, jwtSecret, { expiresIn: '8h' });
}

async function loadUserById(id) {
  const result = await query(
    `SELECT u.id, u.full_name, u.email, u.password_hash, u.role,
            s.id AS student_id, s.group_name,
            t.id AS teacher_id, t.department
       FROM users u
       LEFT JOIN students s ON s.user_id = u.id
       LEFT JOIN teachers t ON t.user_id = u.id
      WHERE u.id = $1 AND u.is_active = TRUE`,
    [id]
  );
  return result.rows[0] || null;
}

const authenticate = asyncHandler(async (req, res, next) => {
  const header = req.headers.authorization || '';
  const [, token] = header.split(' ');
  if (!token) {
    return res.status(401).json({ message: 'Требуется авторизация' });
  }

  try {
    const payload = jwt.verify(token, jwtSecret);
    const user = await loadUserById(Number(payload.sub));
    if (!user) {
      return res.status(401).json({ message: 'Пользователь не найден' });
    }
    req.user = user;
    next();
  } catch {
    res.status(401).json({ message: 'Недействительный токен' });
  }
});

function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ message: 'Недостаточно прав' });
    }
    next();
  };
}

function formatCourse(row) {
  return {
    id: Number(row.id),
    title: row.title,
    code: row.code,
    description: row.description || '',
    teacherId: row.teacher_user_id ? Number(row.teacher_user_id) : null,
    progress: Number(row.progress || 0)
  };
}

function formatAssignment(row, questions = []) {
  return {
    id: Number(row.id),
    courseId: Number(row.course_id),
    title: row.title,
    description: row.description || '',
    dueDate: row.due_date || null,
    maxScore: Number(row.max_score),
    questions: questions.map((question) => ({
      id: Number(question.id),
      text: question.question_text,
      type: question.question_type,
      options: (question.options || []).map((option) => ({ id: Number(option.id), text: option.text }))
    })),
    status: row.status,
    score: row.score === null ? null : Number(row.score),
    comment: row.comment
  };
}

async function findAvailableCourse(courseId, user) {
  const result = await query(
    `SELECT c.id, c.title, c.code, c.description, c.teacher_id, t.user_id AS teacher_user_id
       FROM courses c
       LEFT JOIN teachers t ON t.id = c.teacher_id
       LEFT JOIN course_students cs ON cs.course_id = c.id
      WHERE c.id = $1
        AND (
          $2 = 'admin'
          OR ($2 = 'teacher' AND t.user_id = $3)
          OR ($2 = 'student' AND cs.student_id = $4)
        )
      LIMIT 1`,
    [courseId, user.role, user.id, user.student_id || null]
  );
  return result.rows[0] || null;
}

async function getAssignmentWithQuestions(assignmentId, user) {
  const assignmentResult = await query(
    `SELECT a.id, a.course_id, a.title, a.description, a.max_score,
            to_char(a.due_date, 'YYYY-MM-DD') AS due_date,
            COALESCE(s.status, 'not_started') AS status,
            s.score,
            s.teacher_comment AS comment
       FROM assignments a
       JOIN courses c ON c.id = a.course_id
       LEFT JOIN teachers t ON t.id = c.teacher_id
       LEFT JOIN course_students cs ON cs.course_id = c.id
       LEFT JOIN submissions s ON s.assignment_id = a.id AND s.student_id = $4
      WHERE a.id = $1
        AND (
          $2 = 'admin'
          OR ($2 = 'teacher' AND t.user_id = $3)
          OR ($2 = 'student' AND cs.student_id = $4)
        )
      LIMIT 1`,
    [assignmentId, user.role, user.id, user.student_id || null]
  );

  const assignment = assignmentResult.rows[0];
  if (!assignment) return null;

  const questionsResult = await query(
    `SELECT q.id, q.question_text, q.question_type, q.position,
            COALESCE(
              json_agg(json_build_object('id', ao.id, 'text', ao.option_text) ORDER BY ao.id)
              FILTER (WHERE ao.id IS NOT NULL),
              '[]'
            ) AS options
       FROM questions q
       LEFT JOIN answer_options ao ON ao.question_id = q.id
      WHERE q.assignment_id = $1
      GROUP BY q.id
      ORDER BY q.position, q.id`,
    [assignment.id]
  );

  return formatAssignment(assignment, questionsResult.rows);
}

app.get('/api/health', asyncHandler(async (_req, res) => {
  await query('SELECT 1');
  res.json({ ok: true, database: 'connected' });
}));

app.post('/api/auth/login', asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  const result = await query(
    `SELECT u.id, u.full_name, u.email, u.password_hash, u.role,
            s.id AS student_id, s.group_name,
            t.id AS teacher_id, t.department
       FROM users u
       LEFT JOIN students s ON s.user_id = u.id
       LEFT JOIN teachers t ON t.user_id = u.id
      WHERE u.email = $1 AND u.is_active = TRUE`,
    [email]
  );

  const user = result.rows[0];
  if (!user || !(await bcrypt.compare(password || '', user.password_hash))) {
    return res.status(401).json({ message: 'Неверный email или пароль' });
  }

  res.json({ token: createToken(user), user: toPublicUser(user) });
}));

app.get('/api/auth/me', authenticate, (req, res) => {
  res.json(toPublicUser(req.user));
});

app.get('/api/users', authenticate, requireRole('admin'), asyncHandler(async (_req, res) => {
  const result = await query(
    `SELECT u.id, u.full_name, u.email, u.role, u.is_active, u.created_at,
            s.group_name, t.department
       FROM users u
       LEFT JOIN students s ON s.user_id = u.id
       LEFT JOIN teachers t ON t.user_id = u.id
      ORDER BY u.role, u.full_name`
  );

  res.json(result.rows.map((row) => ({
    ...toPublicUser(row),
    isActive: row.is_active,
    createdAt: row.created_at.toISOString().slice(0, 10)
  })));
}));

app.get('/api/courses', authenticate, asyncHandler(async (req, res) => {
  const result = await query(
    `SELECT c.id, c.title, c.code, c.description, t.user_id AS teacher_user_id,
            CASE
              WHEN $1 = 'student' THEN
                COALESCE(
                  ROUND(
                    100.0 * COUNT(s.id) FILTER (WHERE s.status = 'checked')
                    / NULLIF(COUNT(a.id), 0)
                  ),
                  0
                )
              ELSE 0
            END AS progress
       FROM courses c
       LEFT JOIN teachers t ON t.id = c.teacher_id
       LEFT JOIN course_students cs ON cs.course_id = c.id
       LEFT JOIN assignments a ON a.course_id = c.id
       LEFT JOIN submissions s ON s.assignment_id = a.id AND s.student_id = $3
      WHERE $1 = 'admin'
         OR ($1 = 'teacher' AND t.user_id = $2)
         OR ($1 = 'student' AND cs.student_id = $3)
      GROUP BY c.id, t.user_id
      ORDER BY c.title`,
    [req.user.role, req.user.id, req.user.student_id || null]
  );

  res.json(result.rows.map(formatCourse));
}));

app.post('/api/courses', authenticate, requireRole('teacher', 'admin'), asyncHandler(async (req, res) => {
  const teacherUserId = req.user.role === 'teacher' ? req.user.id : Number(req.body.teacherUserId);
  const teacherResult = await query('SELECT id, user_id FROM teachers WHERE user_id = $1', [teacherUserId]);
  const teacher = teacherResult.rows[0];
  if (!teacher) {
    return res.status(400).json({ message: 'Преподаватель не найден' });
  }

  const result = await query(
    `INSERT INTO courses (title, code, description, teacher_id)
     VALUES ($1, $2, $3, $4)
     RETURNING id, title, code, description`,
    [req.body.title, req.body.code, req.body.description || '', teacher.id]
  );

  res.status(201).json(formatCourse({ ...result.rows[0], teacher_user_id: teacher.user_id, progress: 0 }));
}));

app.get('/api/courses/:id/materials', authenticate, asyncHandler(async (req, res) => {
  const course = await findAvailableCourse(Number(req.params.id), req.user);
  if (!course) {
    return res.status(404).json({ message: 'Дисциплина не найдена' });
  }

  const result = await query(
    `SELECT id, course_id, title, material_type, content, created_at
       FROM materials
      WHERE course_id = $1
      ORDER BY created_at DESC, id DESC`,
    [course.id]
  );

  res.json(result.rows.map((row) => ({
    id: Number(row.id),
    courseId: Number(row.course_id),
    title: row.title,
    type: row.material_type,
    content: row.content,
    createdAt: row.created_at.toISOString().slice(0, 10)
  })));
}));

app.post('/api/materials', authenticate, requireRole('teacher'), asyncHandler(async (req, res) => {
  const course = await findAvailableCourse(Number(req.body.courseId), req.user);
  if (!course) {
    return res.status(403).json({ message: 'Нет доступа к дисциплине' });
  }

  const result = await query(
    `INSERT INTO materials (course_id, title, material_type, content)
     VALUES ($1, $2, $3, $4)
     RETURNING id, course_id, title, material_type, content, created_at`,
    [course.id, req.body.title, req.body.type || 'text', req.body.content || '']
  );

  const material = result.rows[0];
  res.status(201).json({
    id: Number(material.id),
    courseId: Number(material.course_id),
    title: material.title,
    type: material.material_type,
    content: material.content,
    createdAt: material.created_at.toISOString().slice(0, 10)
  });
}));

app.get('/api/courses/:id/assignments', authenticate, asyncHandler(async (req, res) => {
  const course = await findAvailableCourse(Number(req.params.id), req.user);
  if (!course) {
    return res.status(404).json({ message: 'Дисциплина не найдена' });
  }

  const result = await query(
    `SELECT id
       FROM assignments
      WHERE course_id = $1
      ORDER BY due_date, id`,
    [course.id]
  );

  const assignments = await Promise.all(result.rows.map((row) => getAssignmentWithQuestions(row.id, req.user)));
  res.json(assignments.filter(Boolean));
}));

app.get('/api/assignments/:id', authenticate, asyncHandler(async (req, res) => {
  const assignment = await getAssignmentWithQuestions(Number(req.params.id), req.user);
  if (!assignment) {
    return res.status(404).json({ message: 'Задание не найдено' });
  }
  res.json(assignment);
}));

app.post('/api/assignments', authenticate, requireRole('teacher'), asyncHandler(async (req, res) => {
  const course = await findAvailableCourse(Number(req.body.courseId), req.user);
  if (!course) {
    return res.status(403).json({ message: 'Нет доступа к дисциплине' });
  }

  const assignmentId = await withTransaction(async (client) => {
    const assignmentResult = await client.query(
      `INSERT INTO assignments (course_id, title, description, due_date, max_score)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [course.id, req.body.title, req.body.description || '', req.body.dueDate || null, Number(req.body.maxScore || 10)]
    );

    for (const [index, question] of (req.body.questions || []).entries()) {
      const questionResult = await client.query(
        `INSERT INTO questions (assignment_id, question_text, question_type, position)
         VALUES ($1, $2, $3, $4)
         RETURNING id`,
        [assignmentResult.rows[0].id, question.text, question.type || 'text', index + 1]
      );

      for (const option of question.options || []) {
        await client.query(
          `INSERT INTO answer_options (question_id, option_text, is_correct)
           VALUES ($1, $2, $3)`,
          [questionResult.rows[0].id, option.text, Boolean(option.correct)]
        );
      }
    }

    return assignmentResult.rows[0].id;
  });

  res.status(201).json(await getAssignmentWithQuestions(assignmentId, req.user));
}));

app.post('/api/submissions', authenticate, requireRole('student'), asyncHandler(async (req, res) => {
  const assignment = await getAssignmentWithQuestions(Number(req.body.assignmentId), req.user);
  if (!assignment) {
    return res.status(404).json({ message: 'Задание не найдено' });
  }

  const submitted = await withTransaction(async (client) => {
    const correctOptionsResult = await client.query(
      `SELECT ao.id
         FROM answer_options ao
         JOIN questions q ON q.id = ao.question_id
        WHERE q.assignment_id = $1 AND ao.is_correct = TRUE`,
      [assignment.id]
    );

    const correctOptionIds = new Set(correctOptionsResult.rows.map((row) => Number(row.id)));
    const questionCount = assignment.questions.length || 1;
    let score = 0;

    for (const answer of req.body.answers || []) {
      if (answer.optionId && correctOptionIds.has(Number(answer.optionId))) {
        score += Math.round(assignment.maxScore / questionCount);
      }
    }

    const submissionResult = await client.query(
      `INSERT INTO submissions (assignment_id, student_id, score, status, teacher_comment)
       VALUES ($1, $2, $3, 'checked', 'Ответы сохранены системой.')
       ON CONFLICT (assignment_id, student_id)
       DO UPDATE SET score = EXCLUDED.score,
                     status = EXCLUDED.status,
                     teacher_comment = EXCLUDED.teacher_comment,
                     submitted_at = NOW()
       RETURNING id, assignment_id, student_id, score, status, teacher_comment`,
      [assignment.id, req.user.student_id, Math.min(score, assignment.maxScore)]
    );

    const submission = submissionResult.rows[0];
    await client.query('DELETE FROM submission_answers WHERE submission_id = $1', [submission.id]);

    for (const answer of req.body.answers || []) {
      const isCorrect = answer.optionId ? correctOptionIds.has(Number(answer.optionId)) : null;
      await client.query(
        `INSERT INTO submission_answers (submission_id, question_id, answer_option_id, text_answer, is_correct)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          submission.id,
          Number(answer.questionId),
          answer.optionId ? Number(answer.optionId) : null,
          answer.textAnswer || null,
          isCorrect
        ]
      );
    }

    return {
      id: Number(submission.id),
      assignmentId: Number(submission.assignment_id),
      studentId: Number(submission.student_id),
      score: Number(submission.score),
      status: submission.status,
      comment: submission.teacher_comment
    };
  });

  res.status(201).json(submitted);
}));

app.get('/api/submissions/me', authenticate, requireRole('student'), asyncHandler(async (req, res) => {
  const result = await query(
    `SELECT id, assignment_id, student_id, score, status, teacher_comment
       FROM submissions
      WHERE student_id = $1
      ORDER BY submitted_at DESC`,
    [req.user.student_id]
  );

  res.json(result.rows.map((row) => ({
    id: Number(row.id),
    assignmentId: Number(row.assignment_id),
    studentId: Number(row.student_id),
    score: Number(row.score),
    status: row.status,
    comment: row.teacher_comment
  })));
}));

app.get('/api/admin/summary', authenticate, requireRole('admin'), asyncHandler(async (_req, res) => {
  const result = await query(
    `SELECT
      (SELECT COUNT(*)::int FROM users) AS users,
      (SELECT COUNT(*)::int FROM courses) AS courses,
      (SELECT COUNT(*)::int FROM materials) AS materials,
      (SELECT COUNT(*)::int FROM assignments) AS assignments,
      (SELECT COUNT(*)::int FROM submissions) AS submissions`
  );

  res.json(result.rows[0]);
}));

app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(500).json({ message: 'Внутренняя ошибка сервера' });
});

const server = app.listen(port, () => {
  console.log(`Learning API is running on http://localhost:${port}`);
});

process.on('SIGTERM', async () => {
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
});
