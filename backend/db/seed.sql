TRUNCATE TABLE
  submission_answers,
  submissions,
  answer_options,
  questions,
  assignments,
  materials,
  course_students,
  courses,
  teachers,
  students,
  users
RESTART IDENTITY CASCADE;

INSERT INTO users (id, full_name, email, password_hash, role) VALUES
  (1, 'Сабина Ахметова', 'student@example.com', '$2a$10$xJ/sOX7W5rbOXOYhneRKp.jjumBEIZI64mFbpNk3VrXmw6Okz/gXa', 'student'),
  (2, 'Анна Сергеевна Орлова', 'teacher@example.com', '$2a$10$xJ/sOX7W5rbOXOYhneRKp.jjumBEIZI64mFbpNk3VrXmw6Okz/gXa', 'teacher'),
  (3, 'Администратор системы', 'admin@example.com', '$2a$10$xJ/sOX7W5rbOXOYhneRKp.jjumBEIZI64mFbpNk3VrXmw6Okz/gXa', 'admin');

INSERT INTO students (id, user_id, group_name) VALUES
  (1, 1, 'ИВТ-41');

INSERT INTO teachers (id, user_id, department) VALUES
  (1, 2, 'АСОИУ');

INSERT INTO courses (id, title, code, description, teacher_id) VALUES
  (1, 'Базы данных', 'DB-401', 'Проектирование реляционных моделей, SQL-запросы и нормализация данных.', 1),
  (2, 'Мобильная разработка', 'MOB-302', 'React Native, клиент-серверное взаимодействие и проектирование интерфейсов.', 1);

INSERT INTO course_students (course_id, student_id) VALUES
  (1, 1),
  (2, 1);

INSERT INTO materials (id, course_id, title, material_type, content, created_at) VALUES
  (1, 1, 'Лекция 1. Реляционная модель', 'text', 'Основные понятия: таблица, кортеж, атрибут, первичный и внешний ключ.', '2026-04-14 10:00:00'),
  (2, 1, 'Методические указания по SQL', 'link', 'https://www.postgresql.org/docs/', '2026-04-18 10:00:00'),
  (3, 2, 'Компонентный подход React Native', 'text', 'Экран строится из переиспользуемых компонентов, состояния и навигации.', '2026-04-21 10:00:00');

INSERT INTO assignments (id, course_id, title, description, due_date, max_score) VALUES
  (1, 1, 'Тест по нормальным формам', 'Выберите корректные утверждения о нормализации данных.', '2026-05-20', 10),
  (2, 2, 'Практическое задание: экран дисциплины', 'Опишите структуру экрана дисциплины и основные пользовательские действия.', '2026-05-25', 15);

INSERT INTO questions (id, assignment_id, question_text, question_type, position) VALUES
  (1, 1, 'Что устраняет первая нормальная форма?', 'single', 1),
  (2, 1, 'Кратко опишите назначение внешнего ключа.', 'text', 2),
  (3, 2, 'Какие разделы должны быть в карточке дисциплины?', 'text', 1);

INSERT INTO answer_options (id, question_id, option_text, is_correct) VALUES
  (1, 1, 'Повторяющиеся группы и неатомарные значения', TRUE),
  (2, 1, 'Все функциональные зависимости', FALSE),
  (3, 1, 'Необходимость первичного ключа', FALSE);

INSERT INTO submissions (id, assignment_id, student_id, score, status, teacher_comment, submitted_at) VALUES
  (1, 1, 1, 8, 'checked', 'Хороший результат, уточнить определение 2НФ.', '2026-05-01 12:00:00');

INSERT INTO submission_answers (submission_id, question_id, answer_option_id, text_answer, is_correct) VALUES
  (1, 1, 1, NULL, TRUE),
  (1, 2, NULL, 'Внешний ключ используется для связи таблиц и контроля ссылочной целостности.', NULL);

SELECT setval('users_id_seq', (SELECT MAX(id) FROM users));
SELECT setval('students_id_seq', (SELECT MAX(id) FROM students));
SELECT setval('teachers_id_seq', (SELECT MAX(id) FROM teachers));
SELECT setval('courses_id_seq', (SELECT MAX(id) FROM courses));
SELECT setval('materials_id_seq', (SELECT MAX(id) FROM materials));
SELECT setval('assignments_id_seq', (SELECT MAX(id) FROM assignments));
SELECT setval('questions_id_seq', (SELECT MAX(id) FROM questions));
SELECT setval('answer_options_id_seq', (SELECT MAX(id) FROM answer_options));
SELECT setval('submissions_id_seq', (SELECT MAX(id) FROM submissions));
SELECT setval('submission_answers_id_seq', (SELECT MAX(id) FROM submission_answers));
