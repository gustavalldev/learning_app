import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import {
  createAssignment,
  createMaterial,
  getAdminSummary,
  getAssignments,
  getCourses,
  getMaterials,
  getUsers,
  login,
  submitAssignment
} from './api';
import type { Assignment, Course, Material, Question, User, UserSummary } from './types';

type Screen = 'home' | 'course' | 'assignment' | 'teacher' | 'admin';
type IconName = React.ComponentProps<typeof Ionicons>['name'];

const palette = {
  bg: '#f6f7f4',
  surface: '#fffefb',
  surfaceMuted: '#edf2ec',
  ink: '#17211d',
  muted: '#66726d',
  faint: '#87938e',
  line: '#dfe5df',
  accent: '#2f6f5e',
  accentDark: '#234f44',
  accentSoft: '#e3f0e9',
  warningBg: '#fff6df',
  warningText: '#8a5d08',
  successBg: '#e6f4eb',
  successText: '#245f44'
};

const demoAccounts = [
  { label: 'Студент', email: 'student@example.com' },
  { label: 'Преподаватель', email: 'teacher@example.com' },
  { label: 'Админ', email: 'admin@example.com' }
];

export default function App() {
  const [token, setToken] = useState('');
  const [user, setUser] = useState<User | null>(null);
  const [email, setEmail] = useState('student@example.com');
  const [password, setPassword] = useState('password');
  const [screen, setScreen] = useState<Screen>('home');
  const [courses, setCourses] = useState<Course[]>([]);
  const [selectedCourse, setSelectedCourse] = useState<Course | null>(null);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [selectedAssignment, setSelectedAssignment] = useState<Assignment | null>(null);
  const [answers, setAnswers] = useState<Record<number, string | number>>({});
  const [loading, setLoading] = useState(false);
  const [adminSummary, setAdminSummary] = useState<Record<string, number> | null>(null);
  const [adminUsers, setAdminUsers] = useState<UserSummary[]>([]);

  const nearestAssignments = useMemo(
    () => assignments.filter((item) => item.status !== 'checked').slice(0, 3),
    [assignments]
  );

  async function handleLogin() {
    setLoading(true);
    try {
      const result = await login(email.trim(), password);
      setToken(result.token);
      setUser(result.user);
      setScreen(result.user.role === 'admin' ? 'admin' : 'home');
    } catch (error) {
      Alert.alert('Ошибка входа', error instanceof Error ? error.message : 'Не удалось войти');
    } finally {
      setLoading(false);
    }
  }

  async function loadCourses(authToken = token) {
    if (!authToken) return;
    setLoading(true);
    try {
      setCourses(await getCourses(authToken));
    } catch (error) {
      Alert.alert('Ошибка', error instanceof Error ? error.message : 'Не удалось загрузить дисциплины');
    } finally {
      setLoading(false);
    }
  }

  async function openCourse(course: Course) {
    setSelectedCourse(course);
    setScreen('course');
    setLoading(true);
    try {
      const [nextMaterials, nextAssignments] = await Promise.all([
        getMaterials(token, course.id),
        getAssignments(token, course.id)
      ]);
      setMaterials(nextMaterials);
      setAssignments(nextAssignments);
    } catch (error) {
      Alert.alert('Ошибка', error instanceof Error ? error.message : 'Не удалось открыть дисциплину');
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmitAssignment() {
    if (!selectedAssignment) return;
    const payload = selectedAssignment.questions.map((question) => ({
      questionId: question.id,
      optionId: typeof answers[question.id] === 'number' ? answers[question.id] : undefined,
      textAnswer: typeof answers[question.id] === 'string' ? answers[question.id] : undefined
    }));
    setLoading(true);
    try {
      const submission = await submitAssignment(token, selectedAssignment.id, payload);
      Alert.alert('Ответ отправлен', `Результат: ${submission.score} баллов`);
      if (selectedCourse) await openCourse(selectedCourse);
      setScreen('course');
    } catch (error) {
      Alert.alert('Ошибка', error instanceof Error ? error.message : 'Не удалось отправить ответы');
    } finally {
      setLoading(false);
    }
  }

  async function loadAdminSummary() {
    setLoading(true);
    try {
      const [summary, users, allCourses] = await Promise.all([
        getAdminSummary(token),
        getUsers(token),
        getCourses(token)
      ]);
      setAdminSummary(summary);
      setAdminUsers(users);
      setCourses(allCourses);
    } catch (error) {
      Alert.alert('Ошибка', error instanceof Error ? error.message : 'Не удалось загрузить сводку');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (token && user?.role !== 'admin') {
      loadCourses(token);
    }
    if (token && user?.role === 'admin') {
      loadAdminSummary();
    }
  }, [token, user?.role]);

  function logout() {
    setToken('');
    setUser(null);
    setCourses([]);
    setMaterials([]);
    setAssignments([]);
    setSelectedCourse(null);
    setSelectedAssignment(null);
    setAdminSummary(null);
    setAdminUsers([]);
    setScreen('home');
  }

  async function handleCreateMaterial(payload: { courseId: number; title: string; type: string; content: string }) {
    setLoading(true);
    try {
      await createMaterial(token, payload);
      Alert.alert('Материал создан', 'Новый учебный материал сохранен в базе данных');
      const course = courses.find((item) => item.id === payload.courseId);
      if (course) await openCourse(course);
      setScreen('teacher');
    } catch (error) {
      Alert.alert('Ошибка', error instanceof Error ? error.message : 'Не удалось создать материал');
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateAssignment(payload: {
    courseId: number;
    title: string;
    description: string;
    dueDate: string;
    maxScore: number;
    questions: unknown[];
  }) {
    setLoading(true);
    try {
      await createAssignment(token, payload);
      Alert.alert('Задание создано', 'Интерактивное задание сохранено в базе данных');
      const course = courses.find((item) => item.id === payload.courseId);
      if (course) await openCourse(course);
      setScreen('teacher');
    } catch (error) {
      Alert.alert('Ошибка', error instanceof Error ? error.message : 'Не удалось создать задание');
    } finally {
      setLoading(false);
    }
  }

  if (!user) {
    return (
      <SafeAreaProvider>
        <SafeAreaView style={styles.safe}>
          <StatusBar style="dark" />
          <View style={styles.loginWrap}>
            <View style={styles.loginIntro}>
              <View style={styles.brandMark}>
                <Ionicons name="school" size={30} color={palette.surface} />
              </View>
              <View style={styles.loginRule} />
            </View>
            <Text style={styles.title}>Учебные материалы</Text>
            <Text style={styles.subtitle}>Единый доступ к дисциплинам, заданиям и результатам</Text>
            <View style={styles.form}>
              <Text style={styles.label}>Email</Text>
              <TextInput autoCapitalize="none" value={email} onChangeText={setEmail} style={styles.input} />
              <Text style={styles.label}>Пароль</Text>
              <TextInput secureTextEntry value={password} onChangeText={setPassword} style={styles.input} />
              <Pressable style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]} onPress={handleLogin} disabled={loading}>
                <Text style={styles.primaryButtonText}>{loading ? 'Проверяем данные' : 'Войти'}</Text>
              </Pressable>
            </View>
            <View style={styles.demoRow}>
              {demoAccounts.map((account) => (
                <Pressable
                  key={account.email}
                  style={({ pressed }) => [styles.demoChip, email === account.email && styles.demoChipActive, pressed && styles.pressed]}
                  onPress={() => setEmail(account.email)}
                >
                  <Text style={styles.demoChipText}>{account.label}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        </SafeAreaView>
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.safe}>
        <StatusBar style="dark" />
        <Header user={user} screen={screen} onBack={() => setScreen('home')} onLogout={logout} />
        {loading && <LoadingStrip />}
        <ScrollView contentContainerStyle={styles.content}>
          {screen === 'home' && (
            <>
              <View style={styles.heroPanel}>
                <Text style={styles.kicker}>{user.role === 'student' ? user.group : user.department || 'Система'}</Text>
                <Text style={styles.heroTitle}>Здравствуйте, {user.fullName.split(' ')[0]}</Text>
                <Text style={styles.heroText}>
                  {user.role === 'teacher'
                    ? 'Управляйте материалами, заданиями и результатами студентов.'
                    : 'Продолжайте работу с материалами и интерактивными заданиями.'}
                </Text>
              </View>

              {user.role === 'teacher' && (
                <Pressable style={({ pressed }) => [styles.teacherPanelButton, pressed && styles.pressed]} onPress={() => setScreen('teacher')}>
                  <Ionicons name="create-outline" size={20} color={palette.accent} />
                  <Text style={styles.teacherPanelText}>Открыть панель преподавателя</Text>
                </Pressable>
              )}

              <SectionTitle title="Дисциплины" />
              {courses.map((course) => (
                <CourseCard key={course.id} course={course} onPress={() => openCourse(course)} />
              ))}
              {courses.length === 0 && !loading && (
                <EmptyState icon="library-outline" title="Дисциплины не назначены" text="После назначения курсов они появятся на этом экране." />
              )}

              {user.role === 'student' && (
                <>
                  <SectionTitle title="Ближайшие задания" />
                  {nearestAssignments.length > 0 ? (
                    nearestAssignments.map((assignment) => (
                      <AssignmentRow
                        key={assignment.id}
                        assignment={assignment}
                        onPress={() => {
                          setSelectedAssignment(assignment);
                          setScreen('assignment');
                        }}
                      />
                    ))
                  ) : (
                    <EmptyState icon="checkmark-done-outline" title="Нет срочных заданий" text="Новые задания появятся здесь после публикации преподавателем." />
                  )}
                </>
              )}
            </>
          )}

          {screen === 'course' && selectedCourse && (
            <>
              <Text style={styles.pageTitle}>{selectedCourse.title}</Text>
              <Text style={styles.pageText}>{selectedCourse.description}</Text>
              <SectionTitle title="Материалы" />
              {materials.map((material) => (
                <MaterialCard key={material.id} material={material} />
              ))}
              {materials.length === 0 && !loading && (
                <EmptyState icon="document-text-outline" title="Материалов пока нет" text="Преподаватель может добавить текст, ссылку или файл." />
              )}
              <SectionTitle title="Задания" />
              {assignments.map((assignment) => (
                <AssignmentRow
                  key={assignment.id}
                  assignment={assignment}
                  onPress={() => {
                    setSelectedAssignment(assignment);
                    setAnswers({});
                    setScreen('assignment');
                  }}
                />
              ))}
              {assignments.length === 0 && !loading && (
                <EmptyState icon="help-circle-outline" title="Заданий пока нет" text="Интерактивные задания появятся после публикации." />
              )}
            </>
          )}

          {screen === 'assignment' && selectedAssignment && (
            <AssignmentScreen
              assignment={selectedAssignment}
              answers={answers}
              setAnswers={setAnswers}
              onSubmit={handleSubmitAssignment}
              readonly={user.role !== 'student'}
            />
          )}

          {screen === 'teacher' && (
            <TeacherPanel
              courses={courses}
              assignments={assignments}
              onOpenCourse={openCourse}
              onCreateMaterial={handleCreateMaterial}
              onCreateAssignment={handleCreateAssignment}
            />
          )}

          {screen === 'admin' && (
            <AdminPanel summary={adminSummary} users={adminUsers} courses={courses} />
          )}
        </ScrollView>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

function Header({ user, screen, onBack, onLogout }: { user: User; screen: Screen; onBack: () => void; onLogout: () => void }) {
  return (
    <View style={styles.header}>
      {screen !== 'home' && user.role !== 'admin' ? (
        <Pressable style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]} onPress={onBack}>
          <Ionicons name="chevron-back" size={22} color={palette.ink} />
        </Pressable>
      ) : (
        <View style={styles.smallMark}>
          <Ionicons name="book" size={18} color={palette.accent} />
        </View>
      )}
      <View style={styles.headerTextWrap}>
        <Text style={styles.headerTitle}>Учебная среда</Text>
        <Text style={styles.headerSubtitle}>{roleLabel(user.role)}</Text>
      </View>
      <Pressable style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]} onPress={onLogout}>
        <Ionicons name="log-out-outline" size={21} color={palette.ink} />
      </Pressable>
    </View>
  );
}

function SectionTitle({ title }: { title: string }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionLine} />
    </View>
  );
}

function LoadingStrip() {
  return (
    <View style={styles.loadingStrip}>
      <View style={styles.loadingDot} />
      <View style={styles.loadingTextBar} />
      <View style={styles.loadingShortBar} />
    </View>
  );
}

function EmptyState({ icon, title, text }: { icon: IconName; title: string; text: string }) {
  return (
    <View style={styles.emptyState}>
      <View style={styles.emptyIcon}>
        <Ionicons name={icon} size={22} color={palette.accent} />
      </View>
      <View style={styles.flex}>
        <Text style={styles.emptyTitle}>{title}</Text>
        <Text style={styles.emptyText}>{text}</Text>
      </View>
    </View>
  );
}

function CourseCard({ course, onPress }: { course: Course; onPress: () => void }) {
  return (
    <Pressable style={({ pressed }) => [styles.card, styles.courseCard, pressed && styles.pressed]} onPress={onPress}>
      <View style={styles.cardTop}>
        <View>
          <Text style={styles.courseCode}>{course.code}</Text>
          <Text style={styles.cardTitle}>{course.title}</Text>
        </View>
        <View style={styles.chevronCircle}>
          <Ionicons name="chevron-forward" size={18} color={palette.accent} />
        </View>
      </View>
      <Text style={styles.cardText}>{course.description}</Text>
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${course.progress}%` }]} />
      </View>
      <Text style={styles.progressText}>Освоено {course.progress}%</Text>
    </Pressable>
  );
}

function MaterialCard({ material }: { material: Material }) {
  return (
    <View style={styles.softRow}>
      <View style={styles.row}>
        <View style={styles.roleIcon}>
          <Ionicons name={material.type === 'link' ? 'link' : 'document-text-outline'} size={20} color={palette.accent} />
        </View>
        <View style={styles.flex}>
          <Text style={styles.cardTitle}>{material.title}</Text>
          <Text style={styles.cardText}>{material.content}</Text>
          <Text style={styles.muted}>{material.createdAt}</Text>
        </View>
      </View>
    </View>
  );
}

function AssignmentRow({ assignment, onPress }: { assignment: Assignment; onPress: () => void }) {
  return (
    <Pressable style={({ pressed }) => [styles.assignmentRow, pressed && styles.pressed]} onPress={onPress}>
      <View style={styles.flex}>
        <Text style={styles.cardTitle}>{assignment.title}</Text>
        <Text style={styles.cardText}>{assignment.description}</Text>
        <Text style={styles.muted}>Срок: {assignment.dueDate}</Text>
      </View>
      <View style={[styles.statusBadge, assignment.status === 'checked' && styles.statusDone]}>
        <Text style={[styles.statusText, assignment.status === 'checked' && styles.statusDoneText]}>
          {assignment.status === 'checked' ? `${assignment.score}/${assignment.maxScore}` : 'К сдаче'}
        </Text>
      </View>
    </Pressable>
  );
}

function AssignmentScreen({
  assignment,
  answers,
  setAnswers,
  onSubmit,
  readonly
}: {
  assignment: Assignment;
  answers: Record<number, string | number>;
  setAnswers: React.Dispatch<React.SetStateAction<Record<number, string | number>>>;
  onSubmit: () => void;
  readonly: boolean;
}) {
  return (
    <>
      <Text style={styles.pageTitle}>{assignment.title}</Text>
      <Text style={styles.pageText}>{assignment.description}</Text>
      {assignment.questions.map((question, index) => (
        <QuestionBlock
          key={question.id}
          question={question}
          index={index}
          value={answers[question.id]}
          onChange={(value) => setAnswers((current) => ({ ...current, [question.id]: value }))}
          readonly={readonly}
        />
      ))}
      {assignment.comment && (
        <View style={styles.resultBox}>
          <Text style={styles.resultTitle}>Результат: {assignment.score} баллов</Text>
          <Text style={styles.cardText}>{assignment.comment}</Text>
        </View>
      )}
      {!readonly && (
        <Pressable style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]} onPress={onSubmit}>
          <Text style={styles.primaryButtonText}>Отправить ответы</Text>
        </Pressable>
      )}
    </>
  );
}

function QuestionBlock({
  question,
  index,
  value,
  onChange,
  readonly
}: {
  question: Question;
  index: number;
  value: string | number | undefined;
  onChange: (value: string | number) => void;
  readonly: boolean;
}) {
  return (
    <View style={styles.card}>
      <Text style={styles.questionTitle}>{index + 1}. {question.text}</Text>
      {question.type === 'single' ? (
        question.options.map((option) => (
          <Pressable
            key={option.id}
            style={({ pressed }) => [styles.optionRow, value === option.id && styles.optionSelected, pressed && styles.pressed]}
            onPress={() => !readonly && onChange(option.id)}
          >
            <Ionicons name={value === option.id ? 'radio-button-on' : 'radio-button-off'} size={20} color={palette.accent} />
            <Text style={styles.optionText}>{option.text}</Text>
          </Pressable>
        ))
      ) : (
        <TextInput
          editable={!readonly}
          multiline
          value={typeof value === 'string' ? value : ''}
          onChangeText={onChange}
          style={[styles.input, styles.textArea]}
          placeholder="Введите ответ"
        />
      )}
    </View>
  );
}

function TeacherPanel({
  courses,
  assignments,
  onOpenCourse,
  onCreateMaterial,
  onCreateAssignment
}: {
  courses: Course[];
  assignments: Assignment[];
  onOpenCourse: (course: Course) => void;
  onCreateMaterial: (payload: { courseId: number; title: string; type: string; content: string }) => Promise<void>;
  onCreateAssignment: (payload: {
    courseId: number;
    title: string;
    description: string;
    dueDate: string;
    maxScore: number;
    questions: unknown[];
  }) => Promise<void>;
}) {
  const firstCourseId = courses[0]?.id || 0;
  const [courseId, setCourseId] = useState(firstCourseId);
  const [materialTitle, setMaterialTitle] = useState('Новый учебный материал');
  const [materialContent, setMaterialContent] = useState('Краткое содержание материала для самостоятельной работы.');
  const [assignmentTitle, setAssignmentTitle] = useState('Контрольный вопрос');
  const [assignmentDescription, setAssignmentDescription] = useState('Ответьте на вопрос по материалам дисциплины.');
  const [assignmentDueDate, setAssignmentDueDate] = useState('2026-05-30');
  const [questionText, setQuestionText] = useState('Какой компонент отвечает за хранение данных приложения?');
  const [optionA, setOptionA] = useState('PostgreSQL');
  const [optionB, setOptionB] = useState('React Native');

  useEffect(() => {
    if (!courseId && firstCourseId) setCourseId(firstCourseId);
  }, [courseId, firstCourseId]);

  const selectedCourse = courses.find((course) => course.id === courseId);

  async function submitMaterial() {
    if (!selectedCourse || !materialTitle.trim()) {
      Alert.alert('Проверьте форму', 'Выберите дисциплину и заполните название материала');
      return;
    }
    await onCreateMaterial({
      courseId: selectedCourse.id,
      title: materialTitle.trim(),
      type: 'text',
      content: materialContent.trim()
    });
  }

  async function submitAssignment() {
    if (!selectedCourse || !assignmentTitle.trim() || !questionText.trim()) {
      Alert.alert('Проверьте форму', 'Выберите дисциплину, название и вопрос задания');
      return;
    }
    await onCreateAssignment({
      courseId: selectedCourse.id,
      title: assignmentTitle.trim(),
      description: assignmentDescription.trim(),
      dueDate: assignmentDueDate.trim(),
      maxScore: 10,
      questions: [
        {
          text: questionText.trim(),
          type: 'single',
          options: [
            { text: optionA.trim(), correct: true },
            { text: optionB.trim(), correct: false }
          ]
        }
      ]
    });
  }

  return (
    <>
      <Text style={styles.pageTitle}>Панель преподавателя</Text>
      <Text style={styles.pageText}>Управление дисциплинами, материалами и интерактивными заданиями.</Text>
      <View style={styles.metricGrid}>
        <Metric label="Дисциплины" value={courses.length} />
        <Metric label="Задания" value={assignments.length} />
      </View>

      <SectionTitle title="Быстрые действия" />
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Дисциплина для публикации</Text>
        <View style={styles.segmentRow}>
          {courses.map((course) => (
            <Pressable
              key={course.id}
              style={({ pressed }) => [styles.segmentButton, course.id === courseId && styles.segmentButtonActive, pressed && styles.pressed]}
              onPress={() => setCourseId(course.id)}
            >
              <Text style={[styles.segmentText, course.id === courseId && styles.segmentTextActive]}>{course.code}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      <View style={styles.card}>
        <View style={styles.rowHeader}>
          <Ionicons name="document-text-outline" size={21} color={palette.accent} />
          <Text style={styles.cardTitle}>Добавить материал</Text>
        </View>
        <Text style={styles.label}>Название материала</Text>
        <TextInput value={materialTitle} onChangeText={setMaterialTitle} style={styles.input} />
        <Text style={styles.label}>Содержание</Text>
        <TextInput
          value={materialContent}
          onChangeText={setMaterialContent}
          multiline
          style={[styles.input, styles.textArea, styles.formGap]}
        />
        <Pressable style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]} onPress={submitMaterial}>
          <Ionicons name="add" size={18} color={palette.accent} />
          <Text style={styles.secondaryButtonText}>Сохранить материал</Text>
        </Pressable>
      </View>

      <View style={styles.card}>
        <View style={styles.rowHeader}>
          <Ionicons name="help-circle-outline" size={21} color={palette.accent} />
          <Text style={styles.cardTitle}>Создать тестовое задание</Text>
        </View>
        <Text style={styles.label}>Название</Text>
        <TextInput value={assignmentTitle} onChangeText={setAssignmentTitle} style={styles.input} />
        <Text style={styles.label}>Описание</Text>
        <TextInput value={assignmentDescription} onChangeText={setAssignmentDescription} style={styles.input} />
        <Text style={styles.label}>Срок выполнения</Text>
        <TextInput value={assignmentDueDate} onChangeText={setAssignmentDueDate} style={styles.input} />
        <Text style={styles.helperText}>Формат даты: ГГГГ-ММ-ДД</Text>
        <Text style={styles.label}>Вопрос</Text>
        <TextInput value={questionText} onChangeText={setQuestionText} style={styles.input} />
        <Text style={styles.label}>Правильный вариант</Text>
        <TextInput value={optionA} onChangeText={setOptionA} style={styles.input} />
        <Text style={styles.label}>Неверный вариант</Text>
        <TextInput value={optionB} onChangeText={setOptionB} style={styles.input} />
        <Pressable style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]} onPress={submitAssignment}>
          <Text style={styles.primaryButtonText}>Опубликовать задание</Text>
        </Pressable>
      </View>

      <SectionTitle title="Мои дисциплины" />
      {courses.map((course) => (
        <CourseCard key={course.id} course={course} onPress={() => onOpenCourse(course)} />
      ))}
    </>
  );
}

function AdminPanel({
  summary,
  users,
  courses
}: {
  summary: Record<string, number> | null;
  users: UserSummary[];
  courses: Course[];
}) {
  return (
    <>
      <Text style={styles.pageTitle}>Панель администратора</Text>
      <Text style={styles.pageText}>Контроль пользователей, дисциплин и структуры данных системы.</Text>
      <View style={styles.metricGrid}>
        {Object.entries(summary || {}).map(([key, value]) => (
          <Metric key={key} label={adminLabel(key)} value={value} />
        ))}
      </View>

      <SectionTitle title="Пользователи" />
      {users.map((item) => (
        <View key={item.id} style={styles.listRow}>
          <View style={styles.roleIcon}>
            <Ionicons name={roleIcon(item.role)} size={18} color={palette.accent} />
          </View>
          <View style={styles.flex}>
            <Text style={styles.cardTitle}>{item.fullName}</Text>
            <Text style={styles.cardText}>{item.email}</Text>
            <Text style={styles.muted}>
              {roleLabel(item.role)}
              {item.group ? ` · ${item.group}` : ''}
              {item.department ? ` · ${item.department}` : ''}
            </Text>
          </View>
          <View style={[styles.statusBadge, item.isActive && styles.statusDone]}>
            <Text style={[styles.statusText, item.isActive && styles.statusDoneText]}>
              {item.isActive ? 'Активен' : 'Блок'}
            </Text>
          </View>
        </View>
      ))}
      {users.length === 0 && (
        <EmptyState icon="people-outline" title="Пользователи не загружены" text="Проверьте подключение к серверу и повторите вход." />
      )}

      <SectionTitle title="Дисциплины" />
      {courses.map((course) => (
        <View key={course.id} style={styles.listRow}>
          <View style={styles.roleIcon}>
            <Ionicons name="library-outline" size={18} color={palette.accent} />
          </View>
          <View style={styles.flex}>
            <Text style={styles.cardTitle}>{course.title}</Text>
            <Text style={styles.cardText}>{course.description}</Text>
            <Text style={styles.muted}>{course.code}</Text>
          </View>
        </View>
      ))}
      {courses.length === 0 && (
        <EmptyState icon="library-outline" title="Дисциплины не созданы" text="После создания курсов они появятся в этом списке." />
      )}
    </>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

function roleLabel(role: User['role']) {
  return role === 'student' ? 'Студент' : role === 'teacher' ? 'Преподаватель' : 'Администратор';
}

function roleIcon(role: User['role']) {
  return role === 'student' ? 'person-outline' : role === 'teacher' ? 'school-outline' : 'settings-outline';
}

function adminLabel(key: string) {
  const labels: Record<string, string> = {
    users: 'Пользователи',
    courses: 'Дисциплины',
    materials: 'Материалы',
    assignments: 'Задания',
    submissions: 'Ответы'
  };
  return labels[key] || key;
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: palette.bg
  },
  pressed: {
    opacity: 0.84,
    transform: [{ scale: 0.985 }]
  },
  loginWrap: {
    flex: 1,
    justifyContent: 'center',
    padding: 24
  },
  loginIntro: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginBottom: 20
  },
  loginRule: {
    flex: 1,
    height: 1,
    backgroundColor: palette.line
  },
  brandMark: {
    width: 58,
    height: 58,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.accent
  },
  title: {
    fontSize: 30,
    lineHeight: 35,
    fontWeight: '800',
    color: palette.ink
  },
  subtitle: {
    color: palette.muted,
    fontSize: 16,
    lineHeight: 22,
    marginTop: 8,
    marginBottom: 28
  },
  form: {
    gap: 8
  },
  label: {
    fontSize: 13,
    fontWeight: '700',
    color: palette.ink,
    marginTop: 8
  },
  helperText: {
    color: palette.faint,
    fontSize: 12,
    lineHeight: 16,
    marginTop: 6
  },
  formGap: {
    marginTop: 10
  },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: palette.line,
    borderRadius: 8,
    paddingHorizontal: 14,
    backgroundColor: palette.surface,
    color: palette.ink,
    fontSize: 16
  },
  textArea: {
    minHeight: 104,
    paddingTop: 12,
    textAlignVertical: 'top'
  },
  primaryButton: {
    minHeight: 50,
    borderRadius: 8,
    backgroundColor: palette.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16
  },
  primaryButtonText: {
    color: palette.surface,
    fontSize: 16,
    fontWeight: '800'
  },
  secondaryButton: {
    minHeight: 46,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#b7d1c4',
    backgroundColor: palette.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    marginTop: 14
  },
  secondaryButtonText: {
    color: palette.accentDark,
    fontSize: 15,
    fontWeight: '800'
  },
  demoRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 18
  },
  demoChip: {
    borderWidth: 1,
    borderColor: palette.line,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    backgroundColor: palette.surface
  },
  demoChipActive: {
    borderColor: palette.accent,
    backgroundColor: palette.accentSoft
  },
  demoChipText: {
    color: palette.ink,
    fontWeight: '700'
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: palette.line,
    backgroundColor: palette.surface
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.surfaceMuted
  },
  smallMark: {
    width: 40,
    height: 40,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.accentSoft
  },
  headerTextWrap: {
    flex: 1,
    marginLeft: 12
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: palette.ink
  },
  headerSubtitle: {
    fontSize: 12,
    color: palette.muted,
    marginTop: 2
  },
  loadingStrip: {
    position: 'absolute',
    top: 76,
    left: 18,
    right: 18,
    zIndex: 10,
    minHeight: 42,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: palette.surface,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12
  },
  loadingDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: palette.accent
  },
  loadingTextBar: {
    flex: 1,
    height: 8,
    borderRadius: 8,
    backgroundColor: palette.surfaceMuted
  },
  loadingShortBar: {
    width: 54,
    height: 8,
    borderRadius: 8,
    backgroundColor: palette.accentSoft
  },
  content: {
    padding: 18,
    paddingBottom: 40
  },
  heroPanel: {
    borderRadius: 8,
    padding: 20,
    backgroundColor: '#1c2b26',
    borderWidth: 1,
    borderColor: '#2f473e',
    marginBottom: 18
  },
  kicker: {
    color: '#9ed1bb',
    fontSize: 13,
    fontWeight: '800',
    marginBottom: 8
  },
  heroTitle: {
    color: palette.surface,
    fontSize: 25,
    lineHeight: 31,
    fontWeight: '800'
  },
  heroText: {
    color: '#d7e5de',
    fontSize: 15,
    lineHeight: 21,
    marginTop: 8
  },
  teacherPanelButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 14,
    borderRadius: 8,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: '#c8dccf',
    marginBottom: 16
  },
  teacherPanelText: {
    color: palette.accentDark,
    fontWeight: '800'
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 12,
    marginBottom: 10
  },
  sectionTitle: {
    fontSize: 18,
    lineHeight: 23,
    fontWeight: '800',
    color: palette.ink
  },
  sectionLine: {
    flex: 1,
    height: 1,
    backgroundColor: palette.line
  },
  card: {
    borderRadius: 8,
    backgroundColor: palette.surface,
    padding: 16,
    borderWidth: 1,
    borderColor: palette.line,
    marginBottom: 12,
    shadowColor: '#20332c',
    shadowOpacity: 0.05,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 1
  },
  courseCard: {
    borderLeftWidth: 4,
    borderLeftColor: palette.accent
  },
  softRow: {
    borderRadius: 8,
    backgroundColor: palette.surface,
    padding: 14,
    borderWidth: 1,
    borderColor: palette.line,
    marginBottom: 10
  },
  cardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12
  },
  chevronCircle: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.accentSoft
  },
  courseCode: {
    color: palette.accent,
    fontSize: 12,
    fontWeight: '800',
    marginBottom: 4
  },
  cardTitle: {
    color: palette.ink,
    fontSize: 16,
    lineHeight: 21,
    fontWeight: '800'
  },
  cardText: {
    color: palette.muted,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 6
  },
  progressTrack: {
    height: 8,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: palette.surfaceMuted,
    marginTop: 14
  },
  progressFill: {
    height: '100%',
    backgroundColor: palette.accent
  },
  progressText: {
    color: palette.muted,
    fontSize: 12,
    fontWeight: '700',
    marginTop: 8
  },
  pageTitle: {
    color: palette.ink,
    fontSize: 25,
    lineHeight: 31,
    fontWeight: '800',
    marginBottom: 8
  },
  pageText: {
    color: palette.muted,
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 14
  },
  row: {
    flexDirection: 'row',
    gap: 12
  },
  rowHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12
  },
  flex: {
    flex: 1
  },
  segmentRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12
  },
  segmentButton: {
    minHeight: 38,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: palette.line,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.surface
  },
  segmentButtonActive: {
    borderColor: palette.accent,
    backgroundColor: palette.accentSoft
  },
  segmentText: {
    color: palette.muted,
    fontSize: 13,
    fontWeight: '800'
  },
  segmentTextActive: {
    color: palette.accentDark
  },
  muted: {
    color: palette.faint,
    fontSize: 12,
    marginTop: 8
  },
  assignmentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 8,
    backgroundColor: palette.surface,
    padding: 16,
    borderWidth: 1,
    borderColor: palette.line,
    marginBottom: 12
  },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 8,
    backgroundColor: palette.surface,
    padding: 14,
    borderWidth: 1,
    borderColor: palette.line,
    marginBottom: 10
  },
  roleIcon: {
    width: 38,
    height: 38,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.accentSoft
  },
  statusBadge: {
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: palette.warningBg
  },
  statusDone: {
    backgroundColor: palette.successBg
  },
  statusText: {
    color: palette.warningText,
    fontSize: 12,
    fontWeight: '800'
  },
  statusDoneText: {
    color: palette.successText
  },
  resultBox: {
    borderRadius: 8,
    padding: 16,
    backgroundColor: palette.successBg,
    marginBottom: 12
  },
  resultTitle: {
    color: palette.successText,
    fontSize: 16,
    fontWeight: '800'
  },
  questionTitle: {
    color: palette.ink,
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '800',
    marginBottom: 12
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 46,
    borderRadius: 8,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: palette.line,
    marginBottom: 8
  },
  optionSelected: {
    borderColor: palette.accent,
    backgroundColor: palette.accentSoft
  },
  optionText: {
    flex: 1,
    color: palette.ink,
    fontSize: 14,
    lineHeight: 20
  },
  metricGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 10,
    marginBottom: 12
  },
  metric: {
    width: '47%',
    borderRadius: 8,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.line,
    padding: 16
  },
  metricValue: {
    fontSize: 27,
    fontWeight: '800',
    color: palette.accent
  },
  metricLabel: {
    color: palette.muted,
    fontSize: 13,
    fontWeight: '700',
    marginTop: 6
  },
  emptyState: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: palette.surface,
    padding: 16,
    marginBottom: 12
  },
  emptyIcon: {
    width: 42,
    height: 42,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.accentSoft
  },
  emptyTitle: {
    color: palette.ink,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '800'
  },
  emptyText: {
    color: palette.muted,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 3
  }
});
