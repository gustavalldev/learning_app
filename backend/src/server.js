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

class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const materialTypes = new Set(['text', 'link', 'file', 'video']);
const questionTypes = new Set(['single', 'multiple', 'text']);
const userRoles = new Set(['student', 'teacher', 'admin']);

function fail(status, message) {
  throw new ApiError(status, message);
}

function readString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function parsePositiveInt(value, label) {
  const numberValue = Number(value);
  if (!Number.isInteger(numberValue) || numberValue <= 0) {
    fail(400, `${label}: ожидается положительное целое число`);
  }
  return numberValue;
}

function parseBoundedInt(value, label, defaultValue, min, max) {
  if (value === undefined || value === null || value === '') {
    return defaultValue;
  }

  const numberValue = Number(value);
  if (!Number.isInteger(numberValue) || numberValue < min || numberValue > max) {
    fail(400, `${label}: ожидается целое число от ${min} до ${max}`);
  }
  return numberValue;
}

function parseRequiredBoundedInt(value, label, min, max) {
  if (value === undefined || value === null || value === '') {
    fail(400, `${label}: поле обязательно`);
  }
  return parseBoundedInt(value, label, 0, min, max);
}

function requireText(value, label, maxLength = 1000) {
  const text = readString(value);
  if (!text) {
    fail(400, `${label}: поле обязательно`);
  }
  if (text.length > maxLength) {
    fail(400, `${label}: максимум ${maxLength} символов`);
  }
  return text;
}

function optionalText(value, maxLength = 3000) {
  const text = readString(value);
  if (text.length > maxLength) {
    fail(400, `Текстовое поле: максимум ${maxLength} символов`);
  }
  return text;
}

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object || {}, key);
}

function parseOptionalDate(value, label) {
  const text = readString(value);
  if (!text) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!match) {
    fail(400, `${label}: используйте формат ГГГГ-ММ-ДД`);
  }

  const [, year, month, day] = match.map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    fail(400, `${label}: некорректная дата`);
  }
  return text;
}

function normalizeCoursePayload(body, user) {
  const payload = {
    title: requireText(body?.title, 'Название дисциплины', 150),
    code: requireText(body?.code, 'Код дисциплины', 30),
    description: optionalText(body?.description)
  };

  if (user.role === 'admin') {
    payload.teacherUserId = parsePositiveInt(body?.teacherUserId, 'Преподаватель');
  } else {
    payload.teacherUserId = user.id;
  }

  return payload;
}

function normalizeMaterialPayload(body) {
  const type = readString(body?.type) || 'text';
  if (!materialTypes.has(type)) {
    fail(400, 'Тип материала должен быть text, link, file или video');
  }

  return {
    courseId: parsePositiveInt(body?.courseId, 'Дисциплина'),
    title: requireText(body?.title, 'Название материала', 180),
    type,
    content: requireText(body?.content, 'Содержание материала', 5000)
  };
}

function normalizeGroupPayload(body) {
  return {
    name: requireText(body?.name, 'Название группы', 50),
    speciality: optionalText(body?.speciality, 150),
    studyYear: parseBoundedInt(body?.studyYear, 'Курс', null, 1, 6)
  };
}

function normalizeUserPayload(body) {
  const role = readString(body?.role) || 'student';
  if (!userRoles.has(role)) {
    fail(400, 'Роль должна быть student, teacher или admin');
  }

  const payload = {
    fullName: requireText(body?.fullName, 'ФИО', 150),
    email: requireText(body?.email, 'Email', 100).toLowerCase(),
    password: requireText(body?.password, 'Пароль', 200),
    role,
    groupId: null,
    department: ''
  };

  if (payload.password.length < 6) {
    fail(400, 'Пароль должен быть не короче 6 символов');
  }

  if (role === 'student') {
    payload.groupId = parsePositiveInt(body?.groupId, 'Группа');
  }

  if (role === 'teacher') {
    payload.department = requireText(body?.department, 'Кафедра', 120);
  }

  return payload;
}

function normalizeUserUpdatePayload(body, role) {
  const payload = {};

  if (hasOwn(body, 'fullName')) {
    payload.fullName = requireText(body?.fullName, 'ФИО', 150);
  }
  if (hasOwn(body, 'email')) {
    payload.email = requireText(body?.email, 'Email', 100).toLowerCase();
  }
  if (hasOwn(body, 'isActive')) {
    if (typeof body.isActive !== 'boolean') {
      fail(400, 'Статус активности должен быть boolean');
    }
    payload.isActive = body.isActive;
  }
  if (role === 'student' && hasOwn(body, 'groupId')) {
    payload.groupId = parsePositiveInt(body?.groupId, 'Группа');
  }
  if (role === 'teacher' && hasOwn(body, 'department')) {
    payload.department = requireText(body?.department, 'Кафедра', 120);
  }

  return payload;
}

function normalizeCourseUpdatePayload(body, user) {
  const payload = {};

  if (hasOwn(body, 'title')) {
    payload.title = requireText(body?.title, 'Название дисциплины', 150);
  }
  if (hasOwn(body, 'code')) {
    payload.code = requireText(body?.code, 'Код дисциплины', 30);
  }
  if (hasOwn(body, 'description')) {
    payload.description = optionalText(body?.description);
  }
  if (user.role === 'admin' && hasOwn(body, 'teacherUserId')) {
    payload.teacherUserId = parsePositiveInt(body?.teacherUserId, 'Преподаватель');
  }

  return payload;
}

function normalizeAssignmentPayload(body) {
  const questions = Array.isArray(body?.questions) ? body.questions : [];
  if (questions.length === 0) {
    fail(400, 'Добавьте хотя бы один вопрос');
  }

  return {
    courseId: parsePositiveInt(body?.courseId, 'Дисциплина'),
    title: requireText(body?.title, 'Название задания', 180),
    description: optionalText(body?.description),
    dueDate: parseOptionalDate(body?.dueDate, 'Срок выполнения'),
    maxScore: parseBoundedInt(body?.maxScore, 'Максимальный балл', 10, 1, 100),
    questions: questions.map((question, questionIndex) => {
      const type = readString(question?.type) || 'text';
      if (!questionTypes.has(type)) {
        fail(400, `Вопрос ${questionIndex + 1}: неизвестный тип вопроса`);
      }

      const normalizedQuestion = {
        text: requireText(question?.text, `Вопрос ${questionIndex + 1}`, 1000),
        type,
        options: []
      };

      if (type === 'text') {
        return normalizedQuestion;
      }

      const rawOptions = Array.isArray(question?.options) ? question.options : [];
      if (rawOptions.length < 2) {
        fail(400, `Вопрос ${questionIndex + 1}: добавьте минимум два варианта ответа`);
      }

      normalizedQuestion.options = rawOptions.map((option, optionIndex) => ({
        text: requireText(option?.text, `Вариант ${optionIndex + 1} вопроса ${questionIndex + 1}`, 500),
        correct: Boolean(option?.correct)
      }));

      const correctCount = normalizedQuestion.options.filter((option) => option.correct).length;
      if (correctCount === 0) {
        fail(400, `Вопрос ${questionIndex + 1}: отметьте правильный вариант`);
      }
      if (type === 'single' && correctCount !== 1) {
        fail(400, `Вопрос ${questionIndex + 1}: для одиночного выбора нужен ровно один правильный вариант`);
      }

      return normalizedQuestion;
    })
  };
}

function normalizeSubmissionPayload(body) {
  const answers = Array.isArray(body?.answers) ? body.answers : [];
  const seenQuestionIds = new Set();

  return {
    assignmentId: parsePositiveInt(body?.assignmentId, 'Задание'),
    answers: answers.map((answer, index) => {
      const questionId = parsePositiveInt(answer?.questionId, `Ответ ${index + 1}`);
      if (seenQuestionIds.has(questionId)) {
        fail(400, `Ответ ${index + 1}: вопрос указан повторно`);
      }
      seenQuestionIds.add(questionId);

      const optionIds = [];
      if (answer?.optionId !== undefined && answer.optionId !== null && answer.optionId !== '') {
        optionIds.push(parsePositiveInt(answer.optionId, `Вариант ответа ${index + 1}`));
      }
      if (Array.isArray(answer?.optionIds)) {
        for (const optionId of answer.optionIds) {
          optionIds.push(parsePositiveInt(optionId, `Вариант ответа ${index + 1}`));
        }
      }

      return {
        questionId,
        optionIds: [...new Set(optionIds)],
        textAnswer: optionalText(answer?.textAnswer, 3000)
      };
    })
  };
}

function setsEqual(left, right) {
  if (left.size !== right.size) return false;
  for (const value of left) {
    if (!right.has(value)) return false;
  }
  return true;
}

function toPublicUser(row) {
  return {
    id: Number(row.id),
    fullName: row.full_name,
    email: row.email,
    role: row.role,
    groupId: row.group_id ? Number(row.group_id) : undefined,
    group: row.group_name || undefined,
    department: row.department || undefined
  };
}

function formatUserSummary(row) {
  return {
    ...toPublicUser(row),
    isActive: row.is_active,
    createdAt: row.created_at.toISOString().slice(0, 10)
  };
}

function formatGroup(row) {
  return {
    id: Number(row.id),
    name: row.name,
    speciality: row.speciality || '',
    studyYear: row.study_year === null ? null : Number(row.study_year),
    studentCount: Number(row.student_count || 0)
  };
}

function createToken(user) {
  return jwt.sign({ sub: user.id, role: user.role }, jwtSecret, { expiresIn: '8h' });
}

async function loadUserById(id) {
  const result = await query(
    `SELECT u.id, u.full_name, u.email, u.password_hash, u.role,
            s.id AS student_id, s.group_id, COALESCE(g.name, s.group_name) AS group_name,
            t.id AS teacher_id, t.department
       FROM users u
       LEFT JOIN students s ON s.user_id = u.id
       LEFT JOIN student_groups g ON g.id = s.group_id
       LEFT JOIN teachers t ON t.user_id = u.id
      WHERE u.id = $1 AND u.is_active = TRUE`,
    [id]
  );
  return result.rows[0] || null;
}

const authenticate = asyncHandler(async (req, res, next) => {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) {
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

function formatAssignment(row, questions = [], includeCorrectAnswers = false) {
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
      options: (question.options || []).map((option) => ({
        id: Number(option.id),
        text: option.text,
        ...(includeCorrectAnswers ? { correct: Boolean(option.correct) } : {})
      }))
    })),
    status: row.status,
    score: row.score === null ? null : Number(row.score),
    comment: row.comment
  };
}

function formatSubmission(row, answers = []) {
  return {
    id: Number(row.id),
    assignmentId: Number(row.assignment_id),
    studentId: Number(row.student_id),
    studentFullName: row.full_name,
    group: row.group_name,
    score: row.score === null ? null : Number(row.score),
    status: row.status,
    comment: row.teacher_comment,
    submittedAt: row.submitted_at.toISOString(),
    answers: answers.map((answer) => ({
      questionId: Number(answer.question_id),
      questionText: answer.question_text,
      questionType: answer.question_type,
      optionText: answer.option_text,
      textAnswer: answer.text_answer,
      isCorrect: answer.is_correct
    }))
  };
}

function formatMaterial(row) {
  return {
    id: Number(row.id),
    courseId: Number(row.course_id),
    title: row.title,
    type: row.material_type,
    content: row.content,
    createdAt: row.created_at.toISOString().slice(0, 10)
  };
}

function formatRosterItem(row) {
  return {
    id: Number(row.id),
    userId: Number(row.user_id),
    fullName: row.full_name,
    email: row.email,
    groupId: row.group_id === null ? null : Number(row.group_id),
    group: row.group_name || 'Группа не указана'
  };
}

function formatJournalResult(row) {
  return {
    submissionId: Number(row.id),
    assignmentId: Number(row.assignment_id),
    studentId: Number(row.student_id),
    score: row.score === null ? null : Number(row.score),
    status: row.status,
    comment: row.teacher_comment,
    submittedAt: row.submitted_at ? row.submitted_at.toISOString() : null
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

async function findManagedCourse(courseId, user) {
  const result = await query(
    `SELECT c.id, c.title, c.code, c.description, c.teacher_id, t.user_id AS teacher_user_id
       FROM courses c
       LEFT JOIN teachers t ON t.id = c.teacher_id
      WHERE c.id = $1
        AND (
          $2 = 'admin'
          OR ($2 = 'teacher' AND t.user_id = $3)
        )
      LIMIT 1`,
    [courseId, user.role, user.id]
  );
  return result.rows[0] || null;
}

async function findTeacherByUserId(userId) {
  const result = await query('SELECT id, user_id FROM teachers WHERE user_id = $1', [userId]);
  return result.rows[0] || null;
}

async function getUserSummaryById(userId) {
  const result = await query(
    `SELECT u.id, u.full_name, u.email, u.role, u.is_active, u.created_at,
            s.group_id, COALESCE(g.name, s.group_name) AS group_name, t.department
       FROM users u
       LEFT JOIN students s ON s.user_id = u.id
       LEFT JOIN student_groups g ON g.id = s.group_id
       LEFT JOIN teachers t ON t.user_id = u.id
      WHERE u.id = $1`,
    [userId]
  );
  return result.rows[0] ? formatUserSummary(result.rows[0]) : null;
}

async function getCourseRoster(courseId) {
  const result = await query(
    `SELECT s.id, s.user_id, u.full_name, u.email, s.group_id, COALESCE(g.name, s.group_name) AS group_name
       FROM course_students cs
       JOIN students s ON s.id = cs.student_id
       JOIN users u ON u.id = s.user_id
       LEFT JOIN student_groups g ON g.id = s.group_id
      WHERE cs.course_id = $1
      ORDER BY group_name, u.full_name`,
    [courseId]
  );

  return result.rows.map(formatRosterItem);
}

async function findManagedMaterial(materialId, user) {
  const result = await query(
    `SELECT m.id, m.course_id, m.title, m.material_type, m.content, m.created_at,
            t.user_id AS teacher_user_id
       FROM materials m
       JOIN courses c ON c.id = m.course_id
       LEFT JOIN teachers t ON t.id = c.teacher_id
      WHERE m.id = $1
        AND (
          $2 = 'admin'
          OR ($2 = 'teacher' AND t.user_id = $3)
        )
      LIMIT 1`,
    [materialId, user.role, user.id]
  );
  return result.rows[0] || null;
}

async function findManagedAssignment(assignmentId, user) {
  const result = await query(
    `SELECT a.id, a.course_id, a.title, a.description, a.max_score,
            to_char(a.due_date, 'YYYY-MM-DD') AS due_date,
            t.user_id AS teacher_user_id
       FROM assignments a
       JOIN courses c ON c.id = a.course_id
       LEFT JOIN teachers t ON t.id = c.teacher_id
      WHERE a.id = $1
        AND (
          $2 = 'admin'
          OR ($2 = 'teacher' AND t.user_id = $3)
        )
      LIMIT 1`,
    [assignmentId, user.role, user.id]
  );
  return result.rows[0] || null;
}

async function insertAssignmentQuestions(client, assignmentId, questions) {
  for (const [index, question] of questions.entries()) {
    const questionResult = await client.query(
      `INSERT INTO questions (assignment_id, question_text, question_type, position)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [assignmentId, question.text, question.type || 'text', index + 1]
    );

    for (const option of question.options || []) {
      await client.query(
        `INSERT INTO answer_options (question_id, option_text, is_correct)
         VALUES ($1, $2, $3)`,
        [questionResult.rows[0].id, option.text, Boolean(option.correct)]
      );
    }
  }
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
              json_agg(json_build_object('id', ao.id, 'text', ao.option_text, 'correct', ao.is_correct) ORDER BY ao.id)
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

  return formatAssignment(assignment, questionsResult.rows, user.role !== 'student');
}

app.get('/api/health', asyncHandler(async (_req, res) => {
  await query('SELECT 1');
  res.json({ ok: true, database: 'connected' });
}));

app.post('/api/auth/login', asyncHandler(async (req, res) => {
  const email = requireText(req.body?.email, 'Email', 100).toLowerCase();
  const password = requireText(req.body?.password, 'Пароль', 200);
  const result = await query(
    `SELECT u.id, u.full_name, u.email, u.password_hash, u.role,
            s.id AS student_id, s.group_id, COALESCE(g.name, s.group_name) AS group_name,
            t.id AS teacher_id, t.department
       FROM users u
       LEFT JOIN students s ON s.user_id = u.id
       LEFT JOIN student_groups g ON g.id = s.group_id
       LEFT JOIN teachers t ON t.user_id = u.id
      WHERE u.email = $1 AND u.is_active = TRUE`,
    [email]
  );

  const user = result.rows[0];
  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
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
            s.group_id, COALESCE(g.name, s.group_name) AS group_name, t.department
       FROM users u
       LEFT JOIN students s ON s.user_id = u.id
       LEFT JOIN student_groups g ON g.id = s.group_id
       LEFT JOIN teachers t ON t.user_id = u.id
      ORDER BY u.role, u.full_name`
  );

  res.json(result.rows.map(formatUserSummary));
}));

app.post('/api/users', authenticate, requireRole('admin'), asyncHandler(async (req, res) => {
  const payload = normalizeUserPayload(req.body);
  const passwordHash = await bcrypt.hash(payload.password, 10);

  const createdUser = await withTransaction(async (client) => {
    const userResult = await client.query(
      `INSERT INTO users (full_name, email, password_hash, role)
       VALUES ($1, $2, $3, $4)
       RETURNING id, full_name, email, role, is_active, created_at`,
      [payload.fullName, payload.email, passwordHash, payload.role]
    );
    const user = userResult.rows[0];

    if (payload.role === 'student') {
      const groupResult = await client.query(
        'SELECT id, name FROM student_groups WHERE id = $1',
        [payload.groupId]
      );
      const group = groupResult.rows[0];
      if (!group) {
        fail(400, 'Группа не найдена');
      }

      await client.query(
        `INSERT INTO students (user_id, group_id, group_name)
         VALUES ($1, $2, $3)`,
        [user.id, group.id, group.name]
      );
    }

    if (payload.role === 'teacher') {
      await client.query(
        `INSERT INTO teachers (user_id, department)
         VALUES ($1, $2)`,
        [user.id, payload.department]
      );
    }

    return user;
  });

  const result = await query(
    `SELECT u.id, u.full_name, u.email, u.role, u.is_active, u.created_at,
            s.group_id, COALESCE(g.name, s.group_name) AS group_name, t.department
       FROM users u
       LEFT JOIN students s ON s.user_id = u.id
       LEFT JOIN student_groups g ON g.id = s.group_id
       LEFT JOIN teachers t ON t.user_id = u.id
      WHERE u.id = $1`,
    [createdUser.id]
  );

  res.status(201).json(formatUserSummary(result.rows[0]));
}));

app.patch('/api/users/:id', authenticate, requireRole('admin'), asyncHandler(async (req, res) => {
  const userId = parsePositiveInt(req.params.id, 'Пользователь');
  const currentResult = await query(
    `SELECT u.id, u.full_name, u.email, u.role, u.is_active,
            s.group_id, t.department
       FROM users u
       LEFT JOIN students s ON s.user_id = u.id
       LEFT JOIN teachers t ON t.user_id = u.id
      WHERE u.id = $1`,
    [userId]
  );
  const current = currentResult.rows[0];
  if (!current) {
    return res.status(404).json({ message: 'Пользователь не найден' });
  }

  const payload = normalizeUserUpdatePayload(req.body, current.role);
  if (payload.isActive === false && userId === Number(req.user.id)) {
    fail(400, 'Нельзя заблокировать текущую учетную запись администратора');
  }

  await withTransaction(async (client) => {
    await client.query(
      `UPDATE users
          SET full_name = $1,
              email = $2,
              is_active = $3
        WHERE id = $4`,
      [
        payload.fullName ?? current.full_name,
        payload.email ?? current.email,
        payload.isActive ?? current.is_active,
        userId
      ]
    );

    if (current.role === 'student' && payload.groupId) {
      const groupResult = await client.query('SELECT id, name FROM student_groups WHERE id = $1', [payload.groupId]);
      const group = groupResult.rows[0];
      if (!group) {
        fail(400, 'Группа не найдена');
      }
      await client.query(
        `UPDATE students
            SET group_id = $1,
                group_name = $2
          WHERE user_id = $3`,
        [group.id, group.name, userId]
      );
    }

    if (current.role === 'teacher' && payload.department) {
      await client.query('UPDATE teachers SET department = $1 WHERE user_id = $2', [payload.department, userId]);
    }
  });

  res.json(await getUserSummaryById(userId));
}));

app.get('/api/groups', authenticate, requireRole('admin'), asyncHandler(async (_req, res) => {
  const result = await query(
    `SELECT g.id, g.name, g.speciality, g.study_year, COUNT(s.id)::int AS student_count
       FROM student_groups g
       LEFT JOIN students s ON s.group_id = g.id
      GROUP BY g.id
      ORDER BY g.name`
  );

  res.json(result.rows.map(formatGroup));
}));

app.post('/api/groups', authenticate, requireRole('admin'), asyncHandler(async (req, res) => {
  const payload = normalizeGroupPayload(req.body);
  const result = await query(
    `INSERT INTO student_groups (name, speciality, study_year)
     VALUES ($1, $2, $3)
     RETURNING id, name, speciality, study_year, 0::int AS student_count`,
    [payload.name, payload.speciality, payload.studyYear]
  );

  res.status(201).json(formatGroup(result.rows[0]));
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
  const payload = normalizeCoursePayload(req.body, req.user);
  const teacher = await findTeacherByUserId(payload.teacherUserId);
  if (!teacher) {
    return res.status(400).json({ message: 'Преподаватель не найден' });
  }

  const result = await query(
    `INSERT INTO courses (title, code, description, teacher_id)
     VALUES ($1, $2, $3, $4)
     RETURNING id, title, code, description`,
    [payload.title, payload.code, payload.description, teacher.id]
  );

  res.status(201).json(formatCourse({ ...result.rows[0], teacher_user_id: teacher.user_id, progress: 0 }));
}));

app.patch('/api/courses/:id', authenticate, requireRole('teacher', 'admin'), asyncHandler(async (req, res) => {
  const courseId = parsePositiveInt(req.params.id, 'Дисциплина');
  const course = await findManagedCourse(courseId, req.user);
  if (!course) {
    return res.status(404).json({ message: 'Дисциплина не найдена' });
  }

  const payload = normalizeCourseUpdatePayload(req.body, req.user);
  let teacherId = course.teacher_id;
  let teacherUserId = course.teacher_user_id;
  if (payload.teacherUserId) {
    const teacher = await findTeacherByUserId(payload.teacherUserId);
    if (!teacher) {
      return res.status(400).json({ message: 'Преподаватель не найден' });
    }
    teacherId = teacher.id;
    teacherUserId = teacher.user_id;
  }

  const result = await query(
    `UPDATE courses
        SET title = $1,
            code = $2,
            description = $3,
            teacher_id = $4
      WHERE id = $5
      RETURNING id, title, code, description`,
    [
      payload.title ?? course.title,
      payload.code ?? course.code,
      payload.description ?? course.description,
      teacherId,
      course.id
    ]
  );

  res.json(formatCourse({ ...result.rows[0], teacher_user_id: teacherUserId, progress: 0 }));
}));

app.get('/api/courses/:id/roster', authenticate, requireRole('teacher', 'admin'), asyncHandler(async (req, res) => {
  const courseId = parsePositiveInt(req.params.id, 'Дисциплина');
  const course = await findManagedCourse(courseId, req.user);
  if (!course) {
    return res.status(404).json({ message: 'Дисциплина не найдена' });
  }

  res.json(await getCourseRoster(course.id));
}));

app.post('/api/courses/:id/groups', authenticate, requireRole('admin'), asyncHandler(async (req, res) => {
  const courseId = parsePositiveInt(req.params.id, 'Дисциплина');
  const groupId = parsePositiveInt(req.body?.groupId, 'Группа');

  const result = await withTransaction(async (client) => {
    const courseResult = await client.query('SELECT id FROM courses WHERE id = $1', [courseId]);
    if (!courseResult.rows[0]) {
      fail(404, 'Дисциплина не найдена');
    }

    const groupResult = await client.query('SELECT id, name FROM student_groups WHERE id = $1', [groupId]);
    if (!groupResult.rows[0]) {
      fail(404, 'Группа не найдена');
    }

    const insertResult = await client.query(
      `INSERT INTO course_students (course_id, student_id)
       SELECT $1, s.id
         FROM students s
        WHERE s.group_id = $2
       ON CONFLICT DO NOTHING
       RETURNING student_id`,
      [courseId, groupId]
    );

    return {
      courseId,
      groupId,
      groupName: groupResult.rows[0].name,
      enrolledCount: insertResult.rowCount
    };
  });

  res.status(201).json(result);
}));

app.delete('/api/courses/:id/groups/:groupId', authenticate, requireRole('admin'), asyncHandler(async (req, res) => {
  const courseId = parsePositiveInt(req.params.id, 'Дисциплина');
  const groupId = parsePositiveInt(req.params.groupId, 'Группа');

  const result = await withTransaction(async (client) => {
    const courseResult = await client.query('SELECT id FROM courses WHERE id = $1', [courseId]);
    if (!courseResult.rows[0]) {
      fail(404, 'Дисциплина не найдена');
    }

    const groupResult = await client.query('SELECT id, name FROM student_groups WHERE id = $1', [groupId]);
    if (!groupResult.rows[0]) {
      fail(404, 'Группа не найдена');
    }

    const deleteResult = await client.query(
      `DELETE FROM course_students cs
       USING students s
       WHERE cs.student_id = s.id
         AND cs.course_id = $1
         AND s.group_id = $2
       RETURNING cs.student_id`,
      [courseId, groupId]
    );

    return {
      courseId,
      groupId,
      groupName: groupResult.rows[0].name,
      removedCount: deleteResult.rowCount
    };
  });

  res.json(result);
}));

app.get('/api/courses/:id/journal', authenticate, requireRole('teacher', 'admin'), asyncHandler(async (req, res) => {
  const courseId = parsePositiveInt(req.params.id, 'Дисциплина');
  const course = await findManagedCourse(courseId, req.user);
  if (!course) {
    return res.status(404).json({ message: 'Дисциплина не найдена' });
  }

  const [assignmentsResult, students, resultsResult] = await Promise.all([
    query(
      `SELECT id, title, max_score, to_char(due_date, 'YYYY-MM-DD') AS due_date
         FROM assignments
        WHERE course_id = $1
        ORDER BY due_date, id`,
      [course.id]
    ),
    getCourseRoster(course.id),
    query(
      `SELECT s.id, s.assignment_id, s.student_id, s.score, s.status, s.teacher_comment, s.submitted_at
         FROM submissions s
         JOIN assignments a ON a.id = s.assignment_id
        WHERE a.course_id = $1
        ORDER BY s.submitted_at DESC, s.id DESC`,
      [course.id]
    )
  ]);

  res.json({
    course: formatCourse({ ...course, progress: 0 }),
    assignments: assignmentsResult.rows.map((assignment) => ({
      id: Number(assignment.id),
      title: assignment.title,
      dueDate: assignment.due_date,
      maxScore: Number(assignment.max_score)
    })),
    students,
    results: resultsResult.rows.map(formatJournalResult)
  });
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
    ...formatMaterial(row)
  })));
}));

app.post('/api/materials', authenticate, requireRole('teacher', 'admin'), asyncHandler(async (req, res) => {
  const payload = normalizeMaterialPayload(req.body);
  const course = await findAvailableCourse(payload.courseId, req.user);
  if (!course) {
    return res.status(403).json({ message: 'Нет доступа к дисциплине' });
  }

  const result = await query(
    `INSERT INTO materials (course_id, title, material_type, content)
     VALUES ($1, $2, $3, $4)
     RETURNING id, course_id, title, material_type, content, created_at`,
    [course.id, payload.title, payload.type, payload.content]
  );

  res.status(201).json(formatMaterial(result.rows[0]));
}));

app.patch('/api/materials/:id', authenticate, requireRole('teacher', 'admin'), asyncHandler(async (req, res) => {
  const materialId = parsePositiveInt(req.params.id, 'Материал');
  const current = await findManagedMaterial(materialId, req.user);
  if (!current) {
    return res.status(404).json({ message: 'Материал не найден' });
  }

  const payload = normalizeMaterialPayload({
    courseId: hasOwn(req.body, 'courseId') ? req.body.courseId : current.course_id,
    title: hasOwn(req.body, 'title') ? req.body.title : current.title,
    type: hasOwn(req.body, 'type') ? req.body.type : current.material_type,
    content: hasOwn(req.body, 'content') ? req.body.content : current.content
  });

  const course = await findManagedCourse(payload.courseId, req.user);
  if (!course) {
    return res.status(403).json({ message: 'Нет доступа к дисциплине' });
  }

  const result = await query(
    `UPDATE materials
        SET course_id = $1,
            title = $2,
            material_type = $3,
            content = $4
      WHERE id = $5
      RETURNING id, course_id, title, material_type, content, created_at`,
    [course.id, payload.title, payload.type, payload.content, current.id]
  );

  res.json(formatMaterial(result.rows[0]));
}));

app.delete('/api/materials/:id', authenticate, requireRole('teacher', 'admin'), asyncHandler(async (req, res) => {
  const materialId = parsePositiveInt(req.params.id, 'Материал');
  const current = await findManagedMaterial(materialId, req.user);
  if (!current) {
    return res.status(404).json({ message: 'Материал не найден' });
  }

  await query('DELETE FROM materials WHERE id = $1', [current.id]);
  res.json({ ok: true, id: Number(current.id) });
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

app.get('/api/assignments/:id/submissions', authenticate, requireRole('teacher', 'admin'), asyncHandler(async (req, res) => {
  const assignment = await getAssignmentWithQuestions(Number(req.params.id), req.user);
  if (!assignment) {
    return res.status(404).json({ message: 'Задание не найдено' });
  }

  const submissionsResult = await query(
    `SELECT s.id, s.assignment_id, s.student_id, s.score, s.status, s.teacher_comment,
            s.submitted_at, u.full_name, st.group_name
       FROM submissions s
       JOIN students st ON st.id = s.student_id
       JOIN users u ON u.id = st.user_id
      WHERE s.assignment_id = $1
      ORDER BY s.submitted_at DESC, s.id DESC`,
    [assignment.id]
  );

  const answersResult = await query(
    `SELECT sa.submission_id, sa.question_id, q.question_text, q.question_type,
            ao.option_text, sa.text_answer, sa.is_correct
       FROM submission_answers sa
       JOIN questions q ON q.id = sa.question_id
       LEFT JOIN answer_options ao ON ao.id = sa.answer_option_id
       JOIN submissions s ON s.id = sa.submission_id
      WHERE s.assignment_id = $1
      ORDER BY sa.submission_id, q.position, q.id, ao.id`,
    [assignment.id]
  );

  const answersBySubmission = new Map();
  for (const answer of answersResult.rows) {
    const submissionId = Number(answer.submission_id);
    if (!answersBySubmission.has(submissionId)) {
      answersBySubmission.set(submissionId, []);
    }
    answersBySubmission.get(submissionId).push(answer);
  }

  res.json(submissionsResult.rows.map((submission) => (
    formatSubmission(submission, answersBySubmission.get(Number(submission.id)) || [])
  )));
}));

app.post('/api/assignments', authenticate, requireRole('teacher'), asyncHandler(async (req, res) => {
  const payload = normalizeAssignmentPayload(req.body);
  const course = await findAvailableCourse(payload.courseId, req.user);
  if (!course) {
    return res.status(403).json({ message: 'Нет доступа к дисциплине' });
  }

  const assignmentId = await withTransaction(async (client) => {
    const assignmentResult = await client.query(
      `INSERT INTO assignments (course_id, title, description, due_date, max_score)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [course.id, payload.title, payload.description, payload.dueDate, payload.maxScore]
    );

    await insertAssignmentQuestions(client, assignmentResult.rows[0].id, payload.questions);

    return assignmentResult.rows[0].id;
  });

  res.status(201).json(await getAssignmentWithQuestions(assignmentId, req.user));
}));

app.patch('/api/assignments/:id', authenticate, requireRole('teacher', 'admin'), asyncHandler(async (req, res) => {
  const assignmentId = parsePositiveInt(req.params.id, 'Задание');
  const current = await findManagedAssignment(assignmentId, req.user);
  if (!current) {
    return res.status(404).json({ message: 'Задание не найдено' });
  }

  const nextTitle = hasOwn(req.body, 'title') ? requireText(req.body?.title, 'Название задания', 180) : current.title;
  const nextDescription = hasOwn(req.body, 'description') ? optionalText(req.body?.description) : current.description;
  const nextDueDate = hasOwn(req.body, 'dueDate') ? parseOptionalDate(req.body?.dueDate, 'Срок выполнения') : current.due_date;
  const nextMaxScore = hasOwn(req.body, 'maxScore') ? parseBoundedInt(req.body?.maxScore, 'Максимальный балл', current.max_score, 1, 100) : Number(current.max_score);
  const shouldReplaceQuestions = hasOwn(req.body, 'questions');
  const nextQuestions = shouldReplaceQuestions
    ? normalizeAssignmentPayload({
        courseId: current.course_id,
        title: nextTitle,
        description: nextDescription,
        dueDate: nextDueDate,
        maxScore: nextMaxScore,
        questions: req.body.questions
      }).questions
    : null;

  const assignment = await withTransaction(async (client) => {
    const submissionsResult = await client.query(
      'SELECT COUNT(*)::int AS count FROM submissions WHERE assignment_id = $1',
      [current.id]
    );
    const submissionsCount = Number(submissionsResult.rows[0].count);
    if (shouldReplaceQuestions && submissionsCount > 0) {
      fail(409, 'Нельзя менять вопросы задания, по которому уже есть ответы студентов');
    }

    await client.query(
      `UPDATE assignments
          SET title = $1,
              description = $2,
              due_date = $3,
              max_score = $4
        WHERE id = $5`,
      [nextTitle, nextDescription, nextDueDate, nextMaxScore, current.id]
    );

    if (nextQuestions) {
      await client.query('DELETE FROM questions WHERE assignment_id = $1', [current.id]);
      await insertAssignmentQuestions(client, current.id, nextQuestions);
    }

    return current.id;
  });

  res.json(await getAssignmentWithQuestions(assignment, req.user));
}));

app.delete('/api/assignments/:id', authenticate, requireRole('teacher', 'admin'), asyncHandler(async (req, res) => {
  const assignmentId = parsePositiveInt(req.params.id, 'Задание');
  const current = await findManagedAssignment(assignmentId, req.user);
  if (!current) {
    return res.status(404).json({ message: 'Задание не найдено' });
  }

  const submissionsResult = await query(
    'SELECT COUNT(*)::int AS count FROM submissions WHERE assignment_id = $1',
    [current.id]
  );
  if (Number(submissionsResult.rows[0].count) > 0) {
    fail(409, 'Нельзя удалить задание, по которому уже есть ответы студентов');
  }

  await query('DELETE FROM assignments WHERE id = $1', [current.id]);
  res.json({ ok: true, id: Number(current.id) });
}));

app.post('/api/submissions', authenticate, requireRole('student'), asyncHandler(async (req, res) => {
  const payload = normalizeSubmissionPayload(req.body);
  const assignment = await getAssignmentWithQuestions(payload.assignmentId, req.user);
  if (!assignment) {
    return res.status(404).json({ message: 'Задание не найдено' });
  }

  const submitted = await withTransaction(async (client) => {
    const questionsResult = await client.query(
      `SELECT q.id AS question_id, q.question_type, ao.id AS option_id, ao.is_correct
         FROM questions q
         LEFT JOIN answer_options ao ON ao.question_id = q.id
        WHERE q.assignment_id = $1
        ORDER BY q.position, q.id, ao.id`,
      [assignment.id]
    );

    const questions = new Map();
    for (const row of questionsResult.rows) {
      const questionId = Number(row.question_id);
      if (!questions.has(questionId)) {
        questions.set(questionId, {
          id: questionId,
          type: row.question_type,
          optionIds: new Set(),
          correctOptionIds: new Set()
        });
      }

      if (row.option_id) {
        const optionId = Number(row.option_id);
        questions.get(questionId).optionIds.add(optionId);
        if (row.is_correct) {
          questions.get(questionId).correctOptionIds.add(optionId);
        }
      }
    }

    const answersByQuestion = new Map(payload.answers.map((answer) => [answer.questionId, answer]));
    const unknownQuestionId = [...answersByQuestion.keys()].find((questionId) => !questions.has(questionId));
    if (unknownQuestionId) {
      fail(400, `Вопрос ${unknownQuestionId} не относится к заданию`);
    }

    for (const question of questions.values()) {
      const answer = answersByQuestion.get(question.id);
      if (!answer) {
        fail(400, `Ответьте на вопрос ${question.id}`);
      }

      if (question.type === 'text' && !answer.textAnswer) {
        fail(400, `Введите текстовый ответ на вопрос ${question.id}`);
      }

      if (question.type !== 'text' && answer.optionIds.length === 0) {
        fail(400, `Выберите вариант ответа на вопрос ${question.id}`);
      }
    }

    let score = 0;
    let hasManualReview = false;
    const questionCount = questions.size || 1;

    for (const question of questions.values()) {
      const answer = answersByQuestion.get(question.id);
      if (question.type === 'text') {
        hasManualReview = true;
        continue;
      }

      const selectedOptionIds = new Set(answer?.optionIds || []);
      const invalidOptionId = [...selectedOptionIds].find((optionId) => !question.optionIds.has(optionId));
      if (invalidOptionId) {
        fail(400, `Вариант ответа ${invalidOptionId} не относится к вопросу ${question.id}`);
      }

      if (setsEqual(selectedOptionIds, question.correctOptionIds)) {
        score += assignment.maxScore / questionCount;
      }
    }

    const roundedScore = Math.min(Math.round(score), assignment.maxScore);
    const status = hasManualReview ? 'submitted' : 'checked';
    const teacherComment = hasManualReview
      ? 'Ответы сохранены. Текстовые вопросы ожидают проверки преподавателем.'
      : 'Ответы проверены системой.';

    const submissionResult = await client.query(
      `INSERT INTO submissions (assignment_id, student_id, score, status, teacher_comment)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (assignment_id, student_id)
       DO UPDATE SET score = EXCLUDED.score,
                     status = EXCLUDED.status,
                     teacher_comment = EXCLUDED.teacher_comment,
                     submitted_at = NOW()
       RETURNING id, assignment_id, student_id, score, status, teacher_comment`,
      [assignment.id, req.user.student_id, roundedScore, status, teacherComment]
    );

    const submission = submissionResult.rows[0];
    await client.query('DELETE FROM submission_answers WHERE submission_id = $1', [submission.id]);

    for (const answer of payload.answers) {
      const question = questions.get(answer.questionId);
      if (question.type === 'text') {
        await client.query(
          `INSERT INTO submission_answers (submission_id, question_id, answer_option_id, text_answer, is_correct)
           VALUES ($1, $2, NULL, $3, NULL)`,
          [submission.id, answer.questionId, answer.textAnswer || null]
        );
        continue;
      }

      const selectedOptionIds = answer.optionIds.length > 0 ? answer.optionIds : [null];
      const isFullyCorrect = setsEqual(new Set(answer.optionIds), question.correctOptionIds);
      for (const optionId of selectedOptionIds) {
        await client.query(
          `INSERT INTO submission_answers (submission_id, question_id, answer_option_id, text_answer, is_correct)
           VALUES ($1, $2, $3, NULL, $4)`,
          [submission.id, answer.questionId, optionId, isFullyCorrect]
        );
      }
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

app.patch('/api/submissions/:id/grade', authenticate, requireRole('teacher', 'admin'), asyncHandler(async (req, res) => {
  const submissionId = parsePositiveInt(req.params.id, 'Ответ');
  const submissionResult = await query(
    `SELECT s.id, s.assignment_id, s.student_id, a.max_score
       FROM submissions s
       JOIN assignments a ON a.id = s.assignment_id
       JOIN courses c ON c.id = a.course_id
       LEFT JOIN teachers t ON t.id = c.teacher_id
      WHERE s.id = $1
        AND (
          $2 = 'admin'
          OR ($2 = 'teacher' AND t.user_id = $3)
        )
      LIMIT 1`,
    [submissionId, req.user.role, req.user.id]
  );

  const submission = submissionResult.rows[0];
  if (!submission) {
    return res.status(404).json({ message: 'Ответ не найден' });
  }

  const score = parseRequiredBoundedInt(req.body?.score, 'Балл', 0, Number(submission.max_score));
  const comment = optionalText(req.body?.comment, 1000) || 'Проверено преподавателем.';
  const result = await query(
    `UPDATE submissions
        SET score = $1,
            status = 'checked',
            teacher_comment = $2
      WHERE id = $3
      RETURNING id, assignment_id, student_id, score, status, teacher_comment, submitted_at`,
    [score, comment, submission.id]
  );

  res.json(formatSubmission({
    ...result.rows[0],
    full_name: '',
    group_name: ''
  }));
}));

app.get('/api/admin/summary', authenticate, requireRole('admin'), asyncHandler(async (_req, res) => {
  const result = await query(
    `SELECT
      (SELECT COUNT(*)::int FROM users) AS users,
      (SELECT COUNT(*)::int FROM student_groups) AS groups,
      (SELECT COUNT(*)::int FROM courses) AS courses,
      (SELECT COUNT(*)::int FROM materials) AS materials,
      (SELECT COUNT(*)::int FROM assignments) AS assignments,
      (SELECT COUNT(*)::int FROM submissions) AS submissions`
  );

  res.json(result.rows[0]);
}));

app.use((error, _req, res, _next) => {
  if (error instanceof ApiError) {
    return res.status(error.status).json({ message: error.message });
  }

  if (error.code === '23505') {
    const duplicateMessages = {
      users_email_key: 'Пользователь с таким email уже существует',
      student_groups_name_key: 'Группа с таким названием уже существует',
      courses_code_key: 'Дисциплина с таким кодом уже существует'
    };
    return res.status(409).json({ message: duplicateMessages[error.constraint] || 'Запись с такими данными уже существует' });
  }

  if (error.code === '23503') {
    return res.status(400).json({ message: 'Связанная запись не найдена' });
  }

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
