import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Linking,
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
  assignGroupToCourse,
  createAssignment,
  createCourse,
  createGroup,
  createMaterial,
  createUser,
  deleteAssignment,
  deleteMaterial,
  getAdminSummary,
  getAssignmentSubmissions,
  getAssignments,
  getCourseJournal,
  getCourseRoster,
  getCourses,
  getGroups,
  getMaterials,
  getUsers,
  gradeSubmission,
  login,
  removeGroupFromCourse,
  submitAssignment,
  updateAssignment,
  updateCourse,
  updateMaterial,
  updateUser
} from './api';
import type {
  AnswerValue,
  Assignment,
  Course,
  CourseJournal,
  CourseRosterItem,
  Material,
  Question,
  Role,
  StudentGroup,
  SubmissionReview,
  User,
  UserSummary
} from './types';

type Screen = 'home' | 'course' | 'material' | 'assignment' | 'teacher' | 'admin' | 'journal';
type IconName = React.ComponentProps<typeof Ionicons>['name'];
type AdminWindow = 'main' | 'students';
type AdminForm = 'group' | 'student' | 'staff' | 'course';
type StudentGroupFilter = 'all' | number;
type DraftQuestion = {
  id: string;
  text: string;
  type: Question['type'];
  options: { id: string; text: string; correct: boolean }[];
};

function createDraftQuestion(type: Question['type'] = 'single'): DraftQuestion {
  const id = `${Date.now()}-${Math.random()}`;
  return {
    id,
    text: type === 'text' ? 'Опишите решение задачи своими словами.' : 'Выберите правильный ответ.',
    type,
    options: type === 'text'
      ? []
      : [
          { id: `${id}-1`, text: 'Вариант 1', correct: true },
          { id: `${id}-2`, text: 'Вариант 2', correct: false }
        ]
  };
}

function buildNextCourseCode(courses: Course[]) {
  const existingCodes = new Set(courses.map((course) => course.code.toUpperCase()));
  let index = courses.length + 1;
  let code = `NEW-${String(index).padStart(3, '0')}`;
  while (existingCodes.has(code)) {
    index += 1;
    code = `NEW-${String(index).padStart(3, '0')}`;
  }
  return code;
}

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
  const [selectedMaterial, setSelectedMaterial] = useState<Material | null>(null);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [selectedAssignment, setSelectedAssignment] = useState<Assignment | null>(null);
  const [assignmentSubmissions, setAssignmentSubmissions] = useState<SubmissionReview[]>([]);
  const [answers, setAnswers] = useState<Record<number, AnswerValue>>({});
  const [loading, setLoading] = useState(false);
  const [adminSummary, setAdminSummary] = useState<Record<string, number> | null>(null);
  const [adminUsers, setAdminUsers] = useState<UserSummary[]>([]);
  const [adminGroups, setAdminGroups] = useState<StudentGroup[]>([]);
  const [courseRoster, setCourseRoster] = useState<CourseRosterItem[]>([]);
  const [courseRosterCourseId, setCourseRosterCourseId] = useState<number | null>(null);
  const [courseJournal, setCourseJournal] = useState<CourseJournal | null>(null);

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
    setSelectedMaterial(null);
    setAssignmentSubmissions([]);
    setCourseJournal(null);
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

  function openMaterial(material: Material) {
    setSelectedMaterial(material);
    setScreen('material');
  }

  async function openAssignment(assignment: Assignment) {
    setSelectedAssignment(assignment);
    setAnswers({});
    setAssignmentSubmissions([]);
    setScreen('assignment');

    if (user?.role === 'student') return;

    setLoading(true);
    try {
      setAssignmentSubmissions(await getAssignmentSubmissions(token, assignment.id));
    } catch (error) {
      Alert.alert('Ошибка', error instanceof Error ? error.message : 'Не удалось загрузить ответы студентов');
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmitAssignment() {
    if (!selectedAssignment) return;
    for (const [index, question] of selectedAssignment.questions.entries()) {
      const answer = answers[question.id];
      const questionNumber = index + 1;
      if (question.type === 'text' && (typeof answer !== 'string' || !answer.trim())) {
        Alert.alert('Проверьте ответы', `Введите ответ на вопрос ${questionNumber}`);
        return;
      }
      if (question.type === 'single' && typeof answer !== 'number') {
        Alert.alert('Проверьте ответы', `Выберите один вариант в вопросе ${questionNumber}`);
        return;
      }
      if (question.type === 'multiple' && (!Array.isArray(answer) || answer.length === 0)) {
        Alert.alert('Проверьте ответы', `Выберите хотя бы один вариант в вопросе ${questionNumber}`);
        return;
      }
    }
    const payload = selectedAssignment.questions.map((question) => ({
      questionId: question.id,
      optionId: typeof answers[question.id] === 'number' ? answers[question.id] : undefined,
      optionIds: Array.isArray(answers[question.id]) ? answers[question.id] : undefined,
      textAnswer: typeof answers[question.id] === 'string' ? answers[question.id] : undefined
    }));
    setLoading(true);
    try {
      const submission = await submitAssignment(token, selectedAssignment.id, payload);
      Alert.alert(
        'Ответ отправлен',
        submission.status === 'submitted' ? 'Ответы сохранены и ожидают проверки' : `Результат: ${submission.score} баллов`
      );
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
      const [summary, users, groups, allCourses] = await Promise.all([
        getAdminSummary(token),
        getUsers(token),
        getGroups(token),
        getCourses(token)
      ]);
      setAdminSummary(summary);
      setAdminUsers(users);
      setAdminGroups(groups);
      setCourses(allCourses);
    } catch (error) {
      Alert.alert('Ошибка', error instanceof Error ? error.message : 'Не удалось загрузить сводку');
    } finally {
      setLoading(false);
    }
  }

  async function loadCourseRoster(courseId: number) {
    setLoading(true);
    try {
      setCourseRoster(await getCourseRoster(token, courseId));
      setCourseRosterCourseId(courseId);
    } catch (error) {
      Alert.alert('Ошибка', error instanceof Error ? error.message : 'Не удалось загрузить состав дисциплины');
    } finally {
      setLoading(false);
    }
  }

  async function handleAssignGroupToCourse(courseId: number, groupId: number) {
    if (!courseId || !groupId) {
      Alert.alert('Проверьте форму', 'Выберите дисциплину и группу');
      return;
    }

    setLoading(true);
    try {
      const result = await assignGroupToCourse(token, courseId, groupId);
      setCourseRoster(await getCourseRoster(token, courseId));
      setCourseRosterCourseId(courseId);
      Alert.alert('Группа назначена', `Добавлено студентов: ${result.enrolledCount}`);
    } catch (error) {
      Alert.alert('Ошибка', error instanceof Error ? error.message : 'Не удалось назначить группу');
    } finally {
      setLoading(false);
    }
  }

  async function handleRemoveGroupFromCourse(courseId: number, groupId: number) {
    if (!courseId || !groupId) {
      Alert.alert('Проверьте форму', 'Выберите дисциплину и группу');
      return;
    }

    setLoading(true);
    try {
      const result = await removeGroupFromCourse(token, courseId, groupId);
      setCourseRoster(await getCourseRoster(token, courseId));
      setCourseRosterCourseId(courseId);
      Alert.alert('Группа снята', `Удалено назначений: ${result.removedCount}`);
    } catch (error) {
      Alert.alert('Ошибка', error instanceof Error ? error.message : 'Не удалось снять группу');
    } finally {
      setLoading(false);
    }
  }

  async function openJournal(course: Course) {
    setSelectedCourse(course);
    setSelectedMaterial(null);
    setSelectedAssignment(null);
    setAssignmentSubmissions([]);
    setScreen('journal');
    setLoading(true);
    try {
      const [journal, nextMaterials, nextAssignments] = await Promise.all([
        getCourseJournal(token, course.id),
        getMaterials(token, course.id),
        getAssignments(token, course.id)
      ]);
      setCourseJournal(journal);
      setMaterials(nextMaterials);
      setAssignments(nextAssignments);
    } catch (error) {
      Alert.alert('Ошибка', error instanceof Error ? error.message : 'Не удалось загрузить журнал');
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
    setSelectedMaterial(null);
    setSelectedAssignment(null);
    setAssignmentSubmissions([]);
    setAdminSummary(null);
    setAdminUsers([]);
    setAdminGroups([]);
    setCourseRoster([]);
    setCourseRosterCourseId(null);
    setCourseJournal(null);
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

  async function handleUpdateMaterial(materialId: number, payload: { courseId: number; title: string; type: string; content: string }) {
    setLoading(true);
    try {
      const updated = await updateMaterial(token, materialId, payload);
      setSelectedMaterial(updated);
      const course = courses.find((item) => item.id === updated.courseId);
      if (course) {
        const [nextMaterials, nextAssignments] = await Promise.all([
          getMaterials(token, course.id),
          getAssignments(token, course.id)
        ]);
        setMaterials(nextMaterials);
        setAssignments(nextAssignments);
      }
      Alert.alert('Материал обновлен', 'Изменения сохранены');
    } catch (error) {
      Alert.alert('Ошибка', error instanceof Error ? error.message : 'Не удалось обновить материал');
    } finally {
      setLoading(false);
    }
  }

  async function handleDeleteMaterial(materialId: number) {
    setLoading(true);
    try {
      await deleteMaterial(token, materialId);
      Alert.alert('Материал удален', 'Запись удалена из дисциплины');
      if (selectedCourse) await openCourse(selectedCourse);
      setScreen('course');
    } catch (error) {
      Alert.alert('Ошибка', error instanceof Error ? error.message : 'Не удалось удалить материал');
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

  async function handleUpdateAssignment(assignmentId: number, payload: {
    title: string;
    description: string;
    dueDate: string;
    maxScore: number;
    questions?: unknown[];
  }) {
    setLoading(true);
    try {
      const updated = await updateAssignment(token, assignmentId, payload);
      setSelectedAssignment(updated);
      if (selectedCourse) {
        const [nextAssignments, nextJournal] = await Promise.all([
          getAssignments(token, selectedCourse.id),
          user?.role === 'student' ? Promise.resolve(null) : getCourseJournal(token, selectedCourse.id)
        ]);
        setAssignments(nextAssignments);
        if (nextJournal) setCourseJournal(nextJournal);
      }
      Alert.alert('Задание обновлено', 'Изменения сохранены');
    } catch (error) {
      Alert.alert('Ошибка', error instanceof Error ? error.message : 'Не удалось обновить задание');
    } finally {
      setLoading(false);
    }
  }

  async function handleDeleteAssignment(assignmentId: number) {
    setLoading(true);
    try {
      await deleteAssignment(token, assignmentId);
      Alert.alert('Задание удалено', 'Задание удалено из дисциплины');
      if (selectedCourse) await openCourse(selectedCourse);
      setScreen('course');
    } catch (error) {
      Alert.alert('Ошибка', error instanceof Error ? error.message : 'Не удалось удалить задание');
    } finally {
      setLoading(false);
    }
  }

  async function handleGradeSubmission(submissionId: number, score: number, comment: string) {
    if (!selectedAssignment) return;
    setLoading(true);
    try {
      await gradeSubmission(token, submissionId, score, comment);
      setAssignmentSubmissions(await getAssignmentSubmissions(token, selectedAssignment.id));
      if (selectedCourse && courseJournal) {
        setCourseJournal(await getCourseJournal(token, selectedCourse.id));
      }
      Alert.alert('Ответ проверен', 'Оценка сохранена в базе данных');
    } catch (error) {
      Alert.alert('Ошибка', error instanceof Error ? error.message : 'Не удалось сохранить оценку');
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateGroup(payload: { name: string; speciality: string; studyYear: number | null }) {
    setLoading(true);
    try {
      await createGroup(token, payload);
      await loadAdminSummary();
      Alert.alert('Группа создана', 'Новая учебная группа добавлена в справочник');
      return true;
    } catch (error) {
      Alert.alert('Ошибка', error instanceof Error ? error.message : 'Не удалось создать группу');
      return false;
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateUser(payload: {
    fullName: string;
    email: string;
    password: string;
    role: Role;
    groupId?: number;
    department?: string;
  }) {
    setLoading(true);
    try {
      await createUser(token, payload);
      await loadAdminSummary();
      Alert.alert('Пользователь создан', 'Учетная запись добавлена в систему');
      return true;
    } catch (error) {
      Alert.alert('Ошибка', error instanceof Error ? error.message : 'Не удалось создать пользователя');
      return false;
    } finally {
      setLoading(false);
    }
  }

  async function handleUpdateUser(userId: number, payload: {
    fullName: string;
    email: string;
    isActive: boolean;
    groupId?: number;
    department?: string;
  }) {
    setLoading(true);
    try {
      await updateUser(token, userId, payload);
      await loadAdminSummary();
      Alert.alert('Пользователь обновлен', 'Изменения учетной записи сохранены');
    } catch (error) {
      Alert.alert('Ошибка', error instanceof Error ? error.message : 'Не удалось обновить пользователя');
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateCourse(payload: {
    title: string;
    code: string;
    description: string;
    teacherUserId: number;
  }) {
    setLoading(true);
    try {
      await createCourse(token, payload);
      await loadAdminSummary();
      Alert.alert('Дисциплина создана', 'Новая дисциплина добавлена в систему');
      return true;
    } catch (error) {
      Alert.alert('Ошибка', error instanceof Error ? error.message : 'Не удалось создать дисциплину');
      return false;
    } finally {
      setLoading(false);
    }
  }

  async function handleUpdateCourse(courseId: number, payload: {
    title: string;
    code: string;
    description: string;
    teacherUserId?: number;
  }) {
    setLoading(true);
    try {
      await updateCourse(token, courseId, payload);
      await loadAdminSummary();
      Alert.alert('Дисциплина обновлена', 'Изменения дисциплины сохранены');
    } catch (error) {
      Alert.alert('Ошибка', error instanceof Error ? error.message : 'Не удалось обновить дисциплину');
    } finally {
      setLoading(false);
    }
  }

  function handleBack() {
    if ((screen === 'material' || screen === 'assignment') && selectedCourse) {
      setScreen('course');
      return;
    }
    if (screen === 'journal' && selectedCourse) {
      setScreen('course');
      return;
    }
    setScreen('home');
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
        <Header user={user} screen={screen} onBack={handleBack} onLogout={logout} />
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
                        onPress={() => openAssignment(assignment)}
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
              {user.role !== 'student' && (
                <Pressable style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]} onPress={() => openJournal(selectedCourse)}>
                  <Ionicons name="stats-chart-outline" size={18} color={palette.accent} />
                  <Text style={styles.secondaryButtonText}>Открыть журнал дисциплины</Text>
                </Pressable>
              )}
              <SectionTitle title="Материалы" />
              {materials.map((material) => (
                <MaterialCard key={material.id} material={material} onPress={() => openMaterial(material)} />
              ))}
              {materials.length === 0 && !loading && (
                <EmptyState icon="document-text-outline" title="Материалов пока нет" text="Преподаватель может добавить текст, ссылку или файл." />
              )}
              <SectionTitle title="Задания" />
              {assignments.map((assignment) => (
                <AssignmentRow
                  key={assignment.id}
                  assignment={assignment}
                  reviewMode={user.role !== 'student'}
                  onPress={() => openAssignment(assignment)}
                />
              ))}
              {assignments.length === 0 && !loading && (
                <EmptyState icon="help-circle-outline" title="Заданий пока нет" text="Интерактивные задания появятся после публикации." />
              )}
            </>
          )}

          {screen === 'material' && selectedMaterial && (
            <MaterialScreen
              material={selectedMaterial}
              canManage={user.role !== 'student'}
              onUpdateMaterial={handleUpdateMaterial}
              onDeleteMaterial={handleDeleteMaterial}
            />
          )}

          {screen === 'assignment' && selectedAssignment && (
            <AssignmentScreen
              assignment={selectedAssignment}
              answers={answers}
              setAnswers={setAnswers}
              submissions={assignmentSubmissions}
              onSubmit={handleSubmitAssignment}
              onGradeSubmission={handleGradeSubmission}
              onUpdateAssignment={handleUpdateAssignment}
              onDeleteAssignment={handleDeleteAssignment}
              readonly={user.role !== 'student'}
            />
          )}

          {screen === 'journal' && courseJournal && (
            <JournalScreen
              journal={courseJournal}
              assignments={assignments}
              onOpenAssignment={openAssignment}
            />
          )}

          {screen === 'teacher' && (
            <TeacherPanel
              courses={courses}
              assignments={assignments}
              onOpenCourse={openCourse}
              onOpenJournal={openJournal}
              onCreateMaterial={handleCreateMaterial}
              onCreateAssignment={handleCreateAssignment}
            />
          )}

          {screen === 'admin' && (
            <AdminPanel
              summary={adminSummary}
              users={adminUsers}
              groups={adminGroups}
              courses={courses}
              roster={courseRoster}
              rosterCourseId={courseRosterCourseId}
              onLoadCourseRoster={loadCourseRoster}
              onAssignGroupToCourse={handleAssignGroupToCourse}
              onRemoveGroupFromCourse={handleRemoveGroupFromCourse}
              onCreateGroup={handleCreateGroup}
              onCreateUser={handleCreateUser}
              onUpdateUser={handleUpdateUser}
              onCreateCourse={handleCreateCourse}
              onUpdateCourse={handleUpdateCourse}
            />
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

function MaterialCard({ material, onPress }: { material: Material; onPress: () => void }) {
  return (
    <Pressable style={({ pressed }) => [styles.softRow, pressed && styles.pressed]} onPress={onPress}>
      <View style={styles.row}>
        <View style={styles.roleIcon}>
          <Ionicons name={materialIcon(material.type)} size={20} color={palette.accent} />
        </View>
        <View style={styles.flex}>
          <Text style={styles.courseCode}>{materialTypeLabel(material.type)}</Text>
          <Text style={styles.cardTitle}>{material.title}</Text>
          <Text style={styles.cardText} numberOfLines={3}>{material.content}</Text>
          <Text style={styles.muted}>{material.createdAt}</Text>
        </View>
        <View style={styles.chevronCircle}>
          <Ionicons name="chevron-forward" size={18} color={palette.accent} />
        </View>
      </View>
    </Pressable>
  );
}

function MaterialScreen({
  material,
  canManage,
  onUpdateMaterial,
  onDeleteMaterial
}: {
  material: Material;
  canManage: boolean;
  onUpdateMaterial: (materialId: number, payload: { courseId: number; title: string; type: string; content: string }) => Promise<void>;
  onDeleteMaterial: (materialId: number) => Promise<void>;
}) {
  const canOpenExternal = material.type === 'link' || material.type === 'video';
  const [title, setTitle] = useState(material.title);
  const [type, setType] = useState<Material['type']>(material.type);
  const [content, setContent] = useState(material.content);

  useEffect(() => {
    setTitle(material.title);
    setType(material.type);
    setContent(material.content);
  }, [material]);

  async function openExternal() {
    try {
      const supported = await Linking.canOpenURL(material.content);
      if (!supported) {
        Alert.alert('Не удалось открыть', 'Ссылка недоступна на этом устройстве');
        return;
      }
      await Linking.openURL(material.content);
    } catch {
      Alert.alert('Не удалось открыть', 'Проверьте ссылку или подключение к интернету');
    }
  }

  async function submitUpdate() {
    if (!title.trim() || !content.trim()) {
      Alert.alert('Проверьте форму', 'Заполните название и содержание материала');
      return;
    }

    await onUpdateMaterial(material.id, {
      courseId: material.courseId,
      title: title.trim(),
      type,
      content: content.trim()
    });
  }

  return (
    <>
      <View style={styles.materialHeader}>
        <View style={styles.roleIcon}>
          <Ionicons name={materialIcon(material.type)} size={21} color={palette.accent} />
        </View>
        <View style={styles.flex}>
          <Text style={styles.courseCode}>{materialTypeLabel(material.type)}</Text>
          <Text style={styles.pageTitle}>{material.title}</Text>
          <Text style={styles.muted}>{material.createdAt}</Text>
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.materialBody}>{material.content}</Text>
        {canOpenExternal && (
          <Pressable style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]} onPress={openExternal}>
            <Text style={styles.primaryButtonText}>
              {material.type === 'video' ? 'Открыть видео' : 'Открыть ссылку'}
            </Text>
          </Pressable>
        )}
        {material.type === 'file' && (
          <View style={styles.resultBox}>
            <Text style={styles.resultTitle}>Учебное вложение</Text>
            <Text style={styles.cardText}>В прототипе файл представлен описанием. Для защиты это показывает сценарий хранения и просмотра файловых материалов.</Text>
          </View>
        )}
      </View>

      {canManage && (
        <View style={styles.card}>
          <View style={styles.rowHeader}>
            <Ionicons name="create-outline" size={21} color={palette.accent} />
            <Text style={styles.cardTitle}>Редактировать материал</Text>
          </View>
          <Text style={styles.label}>Тип материала</Text>
          <View style={styles.segmentRow}>
            {(['text', 'link', 'file', 'video'] as Material['type'][]).map((item) => (
              <Pressable
                key={item}
                style={({ pressed }) => [styles.segmentButton, type === item && styles.segmentButtonActive, pressed && styles.pressed]}
                onPress={() => setType(item)}
              >
                <Text style={[styles.segmentText, type === item && styles.segmentTextActive]}>{materialTypeLabel(item)}</Text>
              </Pressable>
            ))}
          </View>
          <Text style={styles.label}>Название</Text>
          <TextInput value={title} onChangeText={setTitle} style={styles.input} />
          <Text style={styles.label}>Содержание</Text>
          <TextInput value={content} onChangeText={setContent} multiline style={[styles.input, styles.textArea]} />
          <Pressable style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]} onPress={submitUpdate}>
            <Text style={styles.primaryButtonText}>Сохранить изменения</Text>
          </Pressable>
          <Pressable style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]} onPress={() => onDeleteMaterial(material.id)}>
            <Ionicons name="trash-outline" size={18} color={palette.accent} />
            <Text style={styles.secondaryButtonText}>Удалить материал</Text>
          </Pressable>
        </View>
      )}
    </>
  );
}

function JournalScreen({
  journal,
  assignments,
  onOpenAssignment
}: {
  journal: CourseJournal;
  assignments: Assignment[];
  onOpenAssignment: (assignment: Assignment) => void;
}) {
  const [groupFilter, setGroupFilter] = useState('all');
  const resultsByKey = useMemo(() => {
    const map = new Map<string, CourseJournal['results'][number]>();
    for (const result of journal.results) {
      map.set(`${result.assignmentId}:${result.studentId}`, result);
    }
    return map;
  }, [journal.results]);

  const assignmentsById = useMemo(() => {
    const map = new Map<number, Assignment>();
    for (const assignment of assignments) {
      map.set(assignment.id, assignment);
    }
    return map;
  }, [assignments]);

  const groupNames = useMemo(() => {
    return [...new Set(journal.students.map((student) => student.group || 'Группа не указана'))];
  }, [journal.students]);

  const filteredStudents = useMemo(() => (
    groupFilter === 'all'
      ? journal.students
      : journal.students.filter((student) => (student.group || 'Группа не указана') === groupFilter)
  ), [groupFilter, journal.students]);

  const studentsByGroup = useMemo(() => {
    const map = new Map<string, CourseRosterItem[]>();
    for (const student of filteredStudents) {
      const groupName = student.group || 'Группа не указана';
      map.set(groupName, [...(map.get(groupName) || []), student]);
    }
    return [...map.entries()];
  }, [filteredStudents]);

  const journalMetrics = useMemo(() => {
    const studentIds = new Set(filteredStudents.map((student) => student.id));
    let submitted = 0;
    let checked = 0;
    let percentSum = 0;
    for (const result of journal.results) {
      if (!studentIds.has(result.studentId)) continue;
      submitted += 1;
      if (result.status === 'checked') {
        const assignment = journal.assignments.find((item) => item.id === result.assignmentId);
        checked += 1;
        percentSum += assignment?.maxScore ? Math.round(((result.score || 0) / assignment.maxScore) * 100) : 0;
      }
    }
    return {
      submitted,
      checked,
      average: checked > 0 ? Math.round(percentSum / checked) : 0
    };
  }, [filteredStudents, journal.assignments, journal.results]);

  function openReview(assignmentId: number) {
    const assignment = assignmentsById.get(assignmentId);
    if (assignment) {
      onOpenAssignment(assignment);
    }
  }

  return (
    <>
      <Text style={styles.pageTitle}>Журнал дисциплины</Text>
      <Text style={styles.pageText}>{journal.course.title}: {filteredStudents.length} студентов, {journal.assignments.length} заданий</Text>
      <View style={styles.metricGrid}>
        <Metric label="Ответы" value={journalMetrics.submitted} />
        <Metric label="Проверено" value={journalMetrics.checked} />
        <Metric label="Средний %" value={journalMetrics.average} />
      </View>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Фильтр по группе</Text>
        <View style={styles.segmentRow}>
          <Pressable
            style={({ pressed }) => [styles.segmentButton, groupFilter === 'all' && styles.segmentButtonActive, pressed && styles.pressed]}
            onPress={() => setGroupFilter('all')}
          >
            <Text style={[styles.segmentText, groupFilter === 'all' && styles.segmentTextActive]}>Все</Text>
          </Pressable>
          {groupNames.map((groupName) => (
            <Pressable
              key={groupName}
              style={({ pressed }) => [styles.segmentButton, groupFilter === groupName && styles.segmentButtonActive, pressed && styles.pressed]}
              onPress={() => setGroupFilter(groupName)}
            >
              <Text style={[styles.segmentText, groupFilter === groupName && styles.segmentTextActive]}>{groupName}</Text>
            </Pressable>
          ))}
        </View>
      </View>
      {studentsByGroup.map(([groupName, students]) => (
        <View key={groupName}>
          <SectionTitle title={groupName} />
          {students.map((student) => {
            const checkedResults = journal.assignments
              .map((assignment) => {
                const result = resultsByKey.get(`${assignment.id}:${student.id}`);
                return result?.status === 'checked' && assignment.maxScore
                  ? Math.round(((result.score || 0) / assignment.maxScore) * 100)
                  : null;
              })
              .filter((value): value is number => value !== null);
            const average = checkedResults.length > 0
              ? Math.round(checkedResults.reduce((sum, value) => sum + value, 0) / checkedResults.length)
              : 0;

            return (
              <View key={student.id} style={styles.card}>
                <View style={styles.cardTop}>
                  <View style={styles.flex}>
                    <Text style={styles.cardTitle}>{student.fullName}</Text>
                    <Text style={styles.muted}>{student.email}</Text>
                  </View>
                  <View style={styles.statusBadge}>
                    <Text style={styles.statusText}>{average ? `${average}%` : groupName}</Text>
                  </View>
                </View>
                {journal.assignments.map((assignment) => {
                  const result = resultsByKey.get(`${assignment.id}:${student.id}`);
                  const checked = result?.status === 'checked';
                  return (
                    <View key={assignment.id} style={styles.answerLine}>
                      <View style={styles.cardTop}>
                        <View style={styles.flex}>
                          <Text style={styles.answerQuestion}>{assignment.title}</Text>
                          <Text style={styles.muted}>Срок: {assignment.dueDate || 'не указан'}</Text>
                        </View>
                        <View style={[styles.statusBadge, checked ? styles.statusDone : result ? styles.statusPending : undefined]}>
                          <Text style={[styles.statusText, checked ? styles.statusDoneText : result ? styles.statusPendingText : undefined]}>
                            {journalStatusLabel(result, assignment.maxScore)}
                          </Text>
                        </View>
                      </View>
                      {result?.comment && (
                        <Text style={styles.cardText}>{result.comment}</Text>
                      )}
                      {result && (
                        <Pressable style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]} onPress={() => openReview(assignment.id)}>
                          <Ionicons name="create-outline" size={18} color={palette.accent} />
                          <Text style={styles.secondaryButtonText}>Открыть проверку</Text>
                        </Pressable>
                      )}
                    </View>
                  );
                })}
              </View>
            );
          })}
        </View>
      ))}
      {filteredStudents.length === 0 && (
        <EmptyState icon="people-outline" title="Студентов пока нет" text="Администратор может назначить группу на дисциплину." />
      )}
    </>
  );
}

function AssignmentRow({ assignment, onPress, reviewMode = false }: { assignment: Assignment; onPress: () => void; reviewMode?: boolean }) {
  const isChecked = assignment.status === 'checked';
  const isSubmitted = assignment.status === 'submitted';

  return (
    <Pressable style={({ pressed }) => [styles.assignmentRow, pressed && styles.pressed]} onPress={onPress}>
      <View style={styles.flex}>
        <Text style={styles.cardTitle}>{assignment.title}</Text>
        <Text style={styles.cardText}>{assignment.description}</Text>
        <Text style={styles.muted}>Срок: {assignment.dueDate}</Text>
      </View>
      <View style={[styles.statusBadge, isChecked && styles.statusDone, (isSubmitted || reviewMode) && styles.statusPending]}>
        <Text style={[styles.statusText, isChecked && styles.statusDoneText, (isSubmitted || reviewMode) && styles.statusPendingText]}>
          {reviewMode ? 'Проверка' : isChecked ? `${assignment.score}/${assignment.maxScore}` : isSubmitted ? 'На проверке' : 'К сдаче'}
        </Text>
      </View>
    </Pressable>
  );
}

function AssignmentScreen({
  assignment,
  answers,
  setAnswers,
  submissions,
  onSubmit,
  onGradeSubmission,
  onUpdateAssignment,
  onDeleteAssignment,
  readonly
}: {
  assignment: Assignment;
  answers: Record<number, AnswerValue>;
  setAnswers: React.Dispatch<React.SetStateAction<Record<number, AnswerValue>>>;
  submissions: SubmissionReview[];
  onSubmit: () => void;
  onGradeSubmission: (submissionId: number, score: number, comment: string) => void;
  onUpdateAssignment: (assignmentId: number, payload: { title: string; description: string; dueDate: string; maxScore: number }) => Promise<void>;
  onDeleteAssignment: (assignmentId: number) => Promise<void>;
  readonly: boolean;
}) {
  const answeredCount = useMemo(() => assignment.questions.reduce((count, question) => {
    const value = answers[question.id];
    if (question.type === 'text') return count + (typeof value === 'string' && value.trim() ? 1 : 0);
    if (question.type === 'single') return count + (typeof value === 'number' ? 1 : 0);
    return count + (Array.isArray(value) && value.length > 0 ? 1 : 0);
  }, 0), [answers, assignment.questions]);

  return (
    <>
      <Text style={styles.pageTitle}>{assignment.title}</Text>
      <Text style={styles.pageText}>{assignment.description}</Text>
      <View style={styles.card}>
        <View style={styles.cardTop}>
          <View>
            <Text style={styles.courseCode}>ТЕСТОВОЕ ЗАДАНИЕ</Text>
            <Text style={styles.cardTitle}>Вопросов: {assignment.questions.length}</Text>
          </View>
          <View style={[styles.statusBadge, assignment.status === 'checked' && styles.statusDone, assignment.status === 'submitted' && styles.statusPending]}>
            <Text style={[styles.statusText, assignment.status === 'checked' && styles.statusDoneText, assignment.status === 'submitted' && styles.statusPendingText]}>
              {assignmentStatusLabel(assignment)}
            </Text>
          </View>
        </View>
        <View style={styles.questionMetaRow}>
          <View style={styles.miniBadge}>
            <Text style={styles.miniBadgeText}>Максимум {assignment.maxScore}</Text>
          </View>
          <View style={styles.miniBadge}>
            <Text style={styles.miniBadgeText}>Срок {assignment.dueDate || 'не указан'}</Text>
          </View>
          {!readonly && (
            <View style={[styles.miniBadge, answeredCount === assignment.questions.length && styles.miniBadgeSuccess]}>
              <Text style={[styles.miniBadgeText, answeredCount === assignment.questions.length && styles.miniBadgeSuccessText]}>
                Заполнено {answeredCount}/{assignment.questions.length}
              </Text>
            </View>
          )}
        </View>
      </View>
      {readonly ? (
        <AssignmentReviewOverview assignment={assignment} />
      ) : (
        assignment.questions.map((question, index) => (
          <QuestionBlock
            key={question.id}
            question={question}
            index={index}
            value={answers[question.id]}
            onChange={(value) => setAnswers((current) => ({ ...current, [question.id]: value }))}
            readonly={readonly}
          />
        ))
      )}
      {assignment.status === 'submitted' && (
        <View style={styles.resultBox}>
          <Text style={styles.resultTitle}>Ответ отправлен на проверку</Text>
          <Text style={styles.cardText}>{assignment.comment || 'Преподаватель проверит текстовые ответы.'}</Text>
        </View>
      )}
      {assignment.status === 'checked' && assignment.comment && (
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
      {readonly && (
        <AssignmentManagementPanel
          assignment={assignment}
          onUpdateAssignment={onUpdateAssignment}
          onDeleteAssignment={onDeleteAssignment}
        />
      )}
      {readonly && (
        <SubmissionReviewList assignment={assignment} submissions={submissions} onGradeSubmission={onGradeSubmission} />
      )}
    </>
  );
}

function AssignmentManagementPanel({
  assignment,
  onUpdateAssignment,
  onDeleteAssignment
}: {
  assignment: Assignment;
  onUpdateAssignment: (assignmentId: number, payload: { title: string; description: string; dueDate: string; maxScore: number }) => Promise<void>;
  onDeleteAssignment: (assignmentId: number) => Promise<void>;
}) {
  const [title, setTitle] = useState(assignment.title);
  const [description, setDescription] = useState(assignment.description);
  const [dueDate, setDueDate] = useState(assignment.dueDate || '');
  const [maxScore, setMaxScore] = useState(String(assignment.maxScore));

  useEffect(() => {
    setTitle(assignment.title);
    setDescription(assignment.description);
    setDueDate(assignment.dueDate || '');
    setMaxScore(String(assignment.maxScore));
  }, [assignment]);

  async function submitUpdate() {
    const parsedMaxScore = Number(maxScore);
    if (!title.trim()) {
      Alert.alert('Проверьте форму', 'Введите название задания');
      return;
    }
    if (dueDate.trim() && !/^\d{4}-\d{2}-\d{2}$/.test(dueDate.trim())) {
      Alert.alert('Проверьте форму', 'Срок выполнения должен быть в формате ГГГГ-ММ-ДД');
      return;
    }
    if (!Number.isInteger(parsedMaxScore) || parsedMaxScore < 1 || parsedMaxScore > 100) {
      Alert.alert('Проверьте форму', 'Максимальный балл должен быть от 1 до 100');
      return;
    }

    await onUpdateAssignment(assignment.id, {
      title: title.trim(),
      description: description.trim(),
      dueDate: dueDate.trim(),
      maxScore: parsedMaxScore
    });
  }

  return (
    <View style={styles.card}>
      <View style={styles.rowHeader}>
        <Ionicons name="settings-outline" size={21} color={palette.accent} />
        <Text style={styles.cardTitle}>Управление заданием</Text>
      </View>
      <Text style={styles.label}>Название</Text>
      <TextInput value={title} onChangeText={setTitle} style={styles.input} />
      <Text style={styles.label}>Описание</Text>
      <TextInput value={description} onChangeText={setDescription} style={styles.input} />
      <Text style={styles.label}>Срок выполнения</Text>
      <TextInput value={dueDate} onChangeText={setDueDate} style={styles.input} />
      <Text style={styles.label}>Максимальный балл</Text>
      <TextInput value={maxScore} onChangeText={setMaxScore} keyboardType="number-pad" style={styles.input} />
      <Pressable style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]} onPress={submitUpdate}>
        <Text style={styles.primaryButtonText}>Сохранить задание</Text>
      </Pressable>
      <Pressable style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]} onPress={() => onDeleteAssignment(assignment.id)}>
        <Ionicons name="trash-outline" size={18} color={palette.accent} />
        <Text style={styles.secondaryButtonText}>Удалить задание</Text>
      </Pressable>
      <Text style={styles.helperText}>Вопросы можно менять только у заданий без отправленных ответов. Это защищает историю журнала.</Text>
    </View>
  );
}

function AssignmentReviewOverview({ assignment }: { assignment: Assignment }) {
  return (
    <View style={styles.card}>
      <View style={styles.rowHeader}>
        <Ionicons name="clipboard-outline" size={21} color={palette.accent} />
        <Text style={styles.cardTitle}>Состав задания</Text>
      </View>
      <Text style={styles.cardText}>Максимальный балл: {assignment.maxScore}</Text>
      {assignment.questions.map((question, index) => (
        <View key={question.id} style={styles.answerLine}>
          <Text style={styles.answerQuestion}>{index + 1}. {question.text}</Text>
          <View style={styles.questionMetaRow}>
            <View style={styles.miniBadge}>
              <Text style={styles.miniBadgeText}>{questionTypeLabel(question.type)}</Text>
            </View>
            {question.type !== 'text' && (
              <View style={styles.miniBadge}>
                <Text style={styles.miniBadgeText}>Вариантов: {question.options.length}</Text>
              </View>
            )}
          </View>
          {question.options.map((option) => (
            <View key={option.id} style={styles.answerOptionRow}>
              <Ionicons
                name={option.correct ? 'checkmark-circle' : 'ellipse-outline'}
                size={18}
                color={option.correct ? palette.successText : palette.faint}
              />
              <Text style={styles.optionText}>{option.text}</Text>
              {option.correct && (
                <View style={[styles.miniBadge, styles.miniBadgeSuccess]}>
                  <Text style={[styles.miniBadgeText, styles.miniBadgeSuccessText]}>Верный</Text>
                </View>
              )}
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

function SubmissionReviewList({
  assignment,
  submissions,
  onGradeSubmission
}: {
  assignment: Assignment;
  submissions: SubmissionReview[];
  onGradeSubmission: (submissionId: number, score: number, comment: string) => void;
}) {
  return (
    <>
      <SectionTitle title="Ответы студентов" />
      {submissions.map((submission) => (
        <SubmissionReviewCard
          key={submission.id}
          assignment={assignment}
          submission={submission}
          onGradeSubmission={onGradeSubmission}
        />
      ))}
      {submissions.length === 0 && (
        <EmptyState icon="file-tray-outline" title="Ответов пока нет" text="После отправки студентами ответы появятся на этом экране." />
      )}
    </>
  );
}

function SubmissionReviewCard({
  assignment,
  submission,
  onGradeSubmission
}: {
  assignment: Assignment;
  submission: SubmissionReview;
  onGradeSubmission: (submissionId: number, score: number, comment: string) => void;
}) {
  const [scoreText, setScoreText] = useState(submission.score === null ? '' : String(submission.score));
  const [commentText, setCommentText] = useState(submission.comment || '');
  const answerGroups = useMemo(() => {
    const groups = new Map<number, {
      questionId: number;
      questionText: string;
      questionType: Question['type'];
      answers: SubmissionReview['answers'];
    }>();
    for (const answer of submission.answers) {
      if (!groups.has(answer.questionId)) {
        groups.set(answer.questionId, {
          questionId: answer.questionId,
          questionText: answer.questionText,
          questionType: answer.questionType,
          answers: []
        });
      }
      groups.get(answer.questionId)?.answers.push(answer);
    }
    return [...groups.values()];
  }, [submission.answers]);

  function submitGrade() {
    const score = Number(scoreText);
    if (!Number.isInteger(score) || score < 0 || score > assignment.maxScore) {
      Alert.alert('Проверьте оценку', `Введите целое число от 0 до ${assignment.maxScore}`);
      return;
    }

    onGradeSubmission(submission.id, score, commentText.trim() || 'Проверено преподавателем.');
  }

  return (
    <View style={styles.card}>
      <View style={styles.cardTop}>
        <View style={styles.flex}>
          <Text style={styles.cardTitle}>{submission.studentFullName}</Text>
          <Text style={styles.muted}>{submission.group || 'Группа не указана'}</Text>
        </View>
        <View style={[styles.statusBadge, submission.status === 'checked' ? styles.statusDone : styles.statusPending]}>
          <Text style={[styles.statusText, submission.status === 'checked' ? styles.statusDoneText : styles.statusPendingText]}>
            {submission.status === 'checked' ? `${submission.score}/${assignment.maxScore}` : 'На проверке'}
          </Text>
        </View>
      </View>
      {answerGroups.map((group) => (
        <View key={`${submission.id}-${group.questionId}`} style={styles.answerLine}>
          <View style={styles.cardTop}>
            <View style={styles.flex}>
              <Text style={styles.answerQuestion}>{group.questionText}</Text>
              <Text style={styles.muted}>{questionTypeLabel(group.questionType)}</Text>
            </View>
            <View style={[styles.miniBadge, answerGroupIsCorrect(group.answers) ? styles.miniBadgeSuccess : styles.miniBadgeWarning]}>
              <Text style={[styles.miniBadgeText, answerGroupIsCorrect(group.answers) ? styles.miniBadgeSuccessText : styles.miniBadgeWarningText]}>
                {answerGroupStatusLabel(group)}
              </Text>
            </View>
          </View>
          {group.answers.map((answer, index) => (
            <View key={`${submission.id}-${group.questionId}-${index}`} style={styles.answerOptionRow}>
              <Ionicons
                name={answerIcon(answer)}
                size={18}
                color={answer.isCorrect === true ? palette.successText : answer.isCorrect === false ? palette.warningText : palette.faint}
              />
              <Text style={styles.optionText}>{answer.textAnswer || answer.optionText || 'Ответ не указан'}</Text>
            </View>
          ))}
        </View>
      ))}
      <View style={styles.gradeRow}>
        <View style={styles.gradeInputWrap}>
          <Text style={styles.label}>Балл</Text>
          <TextInput
            value={scoreText}
            onChangeText={setScoreText}
            keyboardType="number-pad"
            style={styles.input}
            placeholder={`0-${assignment.maxScore}`}
          />
        </View>
        <View style={styles.gradeMaxBox}>
          <Text style={styles.metricLabel}>Максимум</Text>
          <Text style={styles.metricValue}>{assignment.maxScore}</Text>
        </View>
      </View>
      <Text style={styles.label}>Комментарий</Text>
      <TextInput
        value={commentText}
        onChangeText={setCommentText}
        multiline
        style={[styles.input, styles.commentInput]}
        placeholder="Например: хорошо раскрыта тема, нужно уточнить определение"
      />
      <Pressable style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]} onPress={submitGrade}>
        <Text style={styles.primaryButtonText}>Сохранить оценку</Text>
      </Pressable>
    </View>
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
  value: AnswerValue | undefined;
  onChange: (value: AnswerValue) => void;
  readonly: boolean;
}) {
  const selectedOptionIds = Array.isArray(value) ? value : [];

  function toggleOption(optionId: number) {
    if (readonly) return;
    if (question.type === 'multiple') {
      onChange(
        selectedOptionIds.includes(optionId)
          ? selectedOptionIds.filter((currentId) => currentId !== optionId)
          : [...selectedOptionIds, optionId]
      );
      return;
    }
    onChange(optionId);
  }

  return (
    <View style={styles.card}>
      <Text style={styles.questionTitle}>{index + 1}. {question.text}</Text>
      <View style={styles.questionMetaRow}>
        <View style={styles.miniBadge}>
          <Text style={styles.miniBadgeText}>{questionTypeLabel(question.type)}</Text>
        </View>
        {question.type !== 'text' && (
          <View style={styles.miniBadge}>
            <Text style={styles.miniBadgeText}>
              {question.type === 'multiple' ? 'Можно выбрать несколько' : 'Выберите один вариант'}
            </Text>
          </View>
        )}
      </View>
      {question.type === 'single' || question.type === 'multiple' ? (
        question.options.map((option) => (
          <Pressable
            key={option.id}
            style={({ pressed }) => [
              styles.optionRow,
              (value === option.id || selectedOptionIds.includes(option.id)) && styles.optionSelected,
              pressed && styles.pressed
            ]}
            onPress={() => toggleOption(option.id)}
          >
            <Ionicons
              name={
                question.type === 'multiple'
                  ? selectedOptionIds.includes(option.id) ? 'checkbox' : 'square-outline'
                  : value === option.id ? 'radio-button-on' : 'radio-button-off'
              }
              size={20}
              color={palette.accent}
            />
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
  onOpenJournal,
  onCreateMaterial,
  onCreateAssignment
}: {
  courses: Course[];
  assignments: Assignment[];
  onOpenCourse: (course: Course) => void;
  onOpenJournal: (course: Course) => void;
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
  const [assignmentMaxScore, setAssignmentMaxScore] = useState('10');
  const [draftQuestions, setDraftQuestions] = useState<DraftQuestion[]>([
    {
      ...createDraftQuestion('single'),
      text: 'Какой компонент отвечает за хранение данных приложения?',
      options: [
        { id: 'default-1', text: 'PostgreSQL', correct: true },
        { id: 'default-2', text: 'React Native', correct: false }
      ]
    }
  ]);

  useEffect(() => {
    if (!courseId && firstCourseId) setCourseId(firstCourseId);
  }, [courseId, firstCourseId]);

  const selectedCourse = courses.find((course) => course.id === courseId);

  function updateQuestion(questionId: string, patch: Partial<DraftQuestion>) {
    setDraftQuestions((current) => current.map((question) => (
      question.id === questionId ? { ...question, ...patch } : question
    )));
  }

  function changeQuestionType(questionId: string, type: Question['type']) {
    setDraftQuestions((current) => current.map((question) => {
      if (question.id !== questionId) return question;
      if (type === 'text') {
        return { ...question, type, options: [] };
      }

      const fallbackOptions = createDraftQuestion(type).options;
      const sourceOptions = question.options.length > 0 ? question.options : fallbackOptions;
      const firstCorrectIndex = Math.max(sourceOptions.findIndex((option) => option.correct), 0);
      return {
        ...question,
        type,
        options: sourceOptions.map((option, index) => ({
          ...option,
          correct: type === 'single' ? index === firstCorrectIndex : option.correct
        }))
      };
    }));
  }

  function updateOption(questionId: string, optionId: string, text: string) {
    setDraftQuestions((current) => current.map((question) => (
      question.id === questionId
        ? {
            ...question,
            options: question.options.map((option) => (
              option.id === optionId ? { ...option, text } : option
            ))
          }
        : question
    )));
  }

  function toggleCorrectOption(questionId: string, optionId: string) {
    setDraftQuestions((current) => current.map((question) => {
      if (question.id !== questionId) return question;
      return {
        ...question,
        options: question.options.map((option) => ({
          ...option,
          correct: question.type === 'single' ? option.id === optionId : option.id === optionId ? !option.correct : option.correct
        }))
      };
    }));
  }

  function addOption(questionId: string) {
    setDraftQuestions((current) => current.map((question) => (
      question.id === questionId
        ? {
            ...question,
            options: [
              ...question.options,
              { id: `${question.id}-${Date.now()}`, text: `Вариант ${question.options.length + 1}`, correct: false }
            ]
          }
        : question
    )));
  }

  function removeOption(questionId: string, optionId: string) {
    setDraftQuestions((current) => current.map((question) => {
      if (question.id !== questionId || question.options.length <= 2) return question;
      const nextOptions = question.options.filter((option) => option.id !== optionId);
      if (nextOptions.some((option) => option.correct)) {
        return { ...question, options: nextOptions };
      }
      return {
        ...question,
        options: nextOptions.map((option, index) => ({ ...option, correct: index === 0 }))
      };
    }));
  }

  function addQuestion(type: Question['type'] = 'single') {
    setDraftQuestions((current) => [...current, createDraftQuestion(type)]);
  }

  function removeQuestion(questionId: string) {
    setDraftQuestions((current) => current.length > 1 ? current.filter((question) => question.id !== questionId) : current);
  }

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
    const maxScore = Number(assignmentMaxScore);
    if (!selectedCourse || !assignmentTitle.trim()) {
      Alert.alert('Проверьте форму', 'Выберите дисциплину и заполните название задания');
      return;
    }
    if (assignmentDueDate.trim() && !/^\d{4}-\d{2}-\d{2}$/.test(assignmentDueDate.trim())) {
      Alert.alert('Проверьте форму', 'Срок выполнения должен быть в формате ГГГГ-ММ-ДД');
      return;
    }
    if (!Number.isInteger(maxScore) || maxScore < 1 || maxScore > 100) {
      Alert.alert('Проверьте форму', 'Максимальный балл должен быть целым числом от 1 до 100');
      return;
    }

    for (const [index, question] of draftQuestions.entries()) {
      if (!question.text.trim()) {
        Alert.alert('Проверьте форму', `Заполните текст вопроса ${index + 1}`);
        return;
      }

      if (question.type === 'text') continue;

      const filledOptions = question.options.filter((option) => option.text.trim());
      if (filledOptions.length < 2 || filledOptions.length !== question.options.length) {
        Alert.alert('Проверьте форму', `В вопросе ${index + 1} должно быть минимум два заполненных варианта`);
        return;
      }

      const correctCount = question.options.filter((option) => option.correct).length;
      if (correctCount === 0) {
        Alert.alert('Проверьте форму', `В вопросе ${index + 1} отметьте правильный вариант`);
        return;
      }
      if (question.type === 'single' && correctCount !== 1) {
        Alert.alert('Проверьте форму', `В вопросе ${index + 1} для одиночного выбора нужен ровно один правильный вариант`);
        return;
      }
    }

    await onCreateAssignment({
      courseId: selectedCourse.id,
      title: assignmentTitle.trim(),
      description: assignmentDescription.trim(),
      dueDate: assignmentDueDate.trim(),
      maxScore,
      questions: draftQuestions.map((question) => ({
        text: question.text.trim(),
        type: question.type,
        options: question.type === 'text'
          ? []
          : question.options.map((option) => ({ text: option.text.trim(), correct: option.correct }))
      }))
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
        <Text style={styles.label}>Максимальный балл</Text>
        <TextInput value={assignmentMaxScore} onChangeText={setAssignmentMaxScore} keyboardType="number-pad" style={styles.input} />
        {draftQuestions.map((question, index) => (
          <View key={question.id} style={styles.answerLine}>
            <View style={styles.cardTop}>
              <Text style={styles.questionTitle}>Вопрос {index + 1}</Text>
              {draftQuestions.length > 1 && (
                <Pressable style={({ pressed }) => [styles.iconButtonSmall, pressed && styles.pressed]} onPress={() => removeQuestion(question.id)}>
                  <Ionicons name="trash-outline" size={18} color={palette.muted} />
                </Pressable>
              )}
            </View>
            <View style={styles.segmentRow}>
              {(['single', 'multiple', 'text'] as Question['type'][]).map((type) => (
                <Pressable
                  key={type}
                  style={({ pressed }) => [styles.segmentButton, question.type === type && styles.segmentButtonActive, pressed && styles.pressed]}
                  onPress={() => changeQuestionType(question.id, type)}
                >
                  <Text style={[styles.segmentText, question.type === type && styles.segmentTextActive]}>{questionTypeLabel(type)}</Text>
                </Pressable>
              ))}
            </View>
            <Text style={styles.label}>Текст вопроса</Text>
            <TextInput
              value={question.text}
              onChangeText={(text) => updateQuestion(question.id, { text })}
              multiline
              style={[styles.input, styles.textArea]}
            />
            {question.type !== 'text' && (
              <>
                <Text style={styles.label}>Варианты ответа</Text>
                {question.options.map((option) => (
                  <View key={option.id} style={styles.optionEditorRow}>
                    <Pressable style={({ pressed }) => [styles.iconButtonSmall, pressed && styles.pressed]} onPress={() => toggleCorrectOption(question.id, option.id)}>
                      <Ionicons
                        name={question.type === 'multiple' ? option.correct ? 'checkbox' : 'square-outline' : option.correct ? 'radio-button-on' : 'radio-button-off'}
                        size={20}
                        color={palette.accent}
                      />
                    </Pressable>
                    <TextInput
                      value={option.text}
                      onChangeText={(text) => updateOption(question.id, option.id, text)}
                      style={[styles.input, styles.flex]}
                    />
                    <Pressable style={({ pressed }) => [styles.iconButtonSmall, pressed && styles.pressed]} onPress={() => removeOption(question.id, option.id)}>
                      <Ionicons name="remove" size={19} color={palette.muted} />
                    </Pressable>
                  </View>
                ))}
                <Pressable style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]} onPress={() => addOption(question.id)}>
                  <Ionicons name="add" size={18} color={palette.accent} />
                  <Text style={styles.secondaryButtonText}>Добавить вариант</Text>
                </Pressable>
              </>
            )}
          </View>
        ))}
        <Pressable style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]} onPress={() => addQuestion()}>
          <Ionicons name="add-circle-outline" size={18} color={palette.accent} />
          <Text style={styles.secondaryButtonText}>Добавить вопрос</Text>
        </Pressable>
        <Pressable style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]} onPress={submitAssignment}>
          <Text style={styles.primaryButtonText}>Опубликовать задание</Text>
        </Pressable>
      </View>

      <SectionTitle title="Мои дисциплины" />
      {courses.map((course) => (
        <View key={course.id}>
          <CourseCard course={course} onPress={() => onOpenCourse(course)} />
          <Pressable style={({ pressed }) => [styles.secondaryButton, styles.formGap, pressed && styles.pressed]} onPress={() => onOpenJournal(course)}>
            <Ionicons name="stats-chart-outline" size={18} color={palette.accent} />
            <Text style={styles.secondaryButtonText}>Журнал: {course.code}</Text>
          </Pressable>
        </View>
      ))}
    </>
  );
}

function AdminPanel({
  summary,
  users,
  groups,
  courses,
  roster,
  rosterCourseId: loadedRosterCourseId,
  onLoadCourseRoster,
  onAssignGroupToCourse,
  onRemoveGroupFromCourse,
  onCreateGroup,
  onCreateUser,
  onUpdateUser,
  onCreateCourse,
  onUpdateCourse
}: {
  summary: Record<string, number> | null;
  users: UserSummary[];
  groups: StudentGroup[];
  courses: Course[];
  roster: CourseRosterItem[];
  rosterCourseId: number | null;
  onLoadCourseRoster: (courseId: number) => Promise<void>;
  onAssignGroupToCourse: (courseId: number, groupId: number) => Promise<void>;
  onRemoveGroupFromCourse: (courseId: number, groupId: number) => Promise<void>;
  onCreateGroup: (payload: { name: string; speciality: string; studyYear: number | null }) => Promise<boolean>;
  onCreateUser: (payload: {
    fullName: string;
    email: string;
    password: string;
    role: Role;
    groupId?: number;
    department?: string;
  }) => Promise<boolean>;
  onUpdateUser: (userId: number, payload: {
    fullName: string;
    email: string;
    isActive: boolean;
    groupId?: number;
    department?: string;
  }) => Promise<void>;
  onCreateCourse: (payload: {
    title: string;
    code: string;
    description: string;
    teacherUserId: number;
  }) => Promise<boolean>;
  onUpdateCourse: (courseId: number, payload: {
    title: string;
    code: string;
    description: string;
    teacherUserId?: number;
  }) => Promise<void>;
}) {
  const [groupName, setGroupName] = useState('ИВТ-43');
  const [speciality, setSpeciality] = useState('Информатика и вычислительная техника');
  const [studyYear, setStudyYear] = useState('4');
  const [newUserRole, setNewUserRole] = useState<Role>('student');
  const [fullName, setFullName] = useState('Новый студент');
  const [newEmail, setNewEmail] = useState('new.student@example.com');
  const [newPassword, setNewPassword] = useState('password');
  const [department, setDepartment] = useState('АСОИУ');
  const [groupId, setGroupId] = useState(groups[0]?.id || 0);
  const [adminWindow, setAdminWindow] = useState<AdminWindow>('main');
  const [openAdminForm, setOpenAdminForm] = useState<AdminForm | null>(null);
  const [studentGroupFilter, setStudentGroupFilter] = useState<StudentGroupFilter>('all');
  const [rosterCourseId, setRosterCourseId] = useState(courses[0]?.id || 0);
  const [rosterGroupId, setRosterGroupId] = useState(groups[0]?.id || 0);
  const teacherUsers = useMemo(() => users.filter((item) => item.role === 'teacher'), [users]);
  const studentUsers = useMemo(() => users.filter((item) => item.role === 'student'), [users]);
  const staffUsers = useMemo(() => users.filter((item) => item.role !== 'student'), [users]);
  const suggestedCourseCode = useMemo(() => buildNextCourseCode(courses), [courses]);
  const [courseTitle, setCourseTitle] = useState('Новая дисциплина');
  const [courseCode, setCourseCode] = useState('');
  const [courseDescription, setCourseDescription] = useState('Описание дисциплины и ожидаемых результатов обучения.');
  const [courseTeacherUserId, setCourseTeacherUserId] = useState(teacherUsers[0]?.id || 0);
  const visibleRoster = loadedRosterCourseId === rosterCourseId ? roster : [];
  const studentsByGroup = useMemo(() => groups.map((group) => {
    const groupStudents = studentUsers
      .filter((student) => student.groupId === group.id)
      .sort((left, right) => left.fullName.localeCompare(right.fullName));
    return {
      group,
      students: groupStudents,
      count: groupStudents.length
    };
  }), [groups, studentUsers]);
  const selectedStudentGroup = typeof studentGroupFilter === 'number'
    ? groups.find((group) => group.id === studentGroupFilter) || null
    : null;
  const visibleStudentGroups = useMemo(() => (
    studentGroupFilter === 'all'
      ? studentsByGroup
      : studentsByGroup.filter(({ group }) => group.id === studentGroupFilter)
  ), [studentGroupFilter, studentsByGroup]);
  const ungroupedStudents = useMemo(() => (
    studentUsers
      .filter((student) => !student.groupId)
      .sort((left, right) => left.fullName.localeCompare(right.fullName))
  ), [studentUsers]);
  const visibleStudentCount = studentGroupFilter === 'all'
    ? studentUsers.length
    : visibleStudentGroups.reduce((sum, { count }) => sum + count, 0);
  const studentFormGroup = groups.find((group) => group.id === groupId) || null;

  useEffect(() => {
    if (!groupId && groups[0]?.id) {
      setGroupId(groups[0].id);
    }
  }, [groupId, groups]);

  useEffect(() => {
    if (!rosterCourseId && courses[0]?.id) {
      setRosterCourseId(courses[0].id);
    }
    if (!rosterGroupId && groups[0]?.id) {
      setRosterGroupId(groups[0].id);
    }
    if (!courseTeacherUserId && teacherUsers[0]?.id) {
      setCourseTeacherUserId(teacherUsers[0].id);
    }
  }, [courses, groups, rosterCourseId, rosterGroupId, courseTeacherUserId, teacherUsers]);

  useEffect(() => {
    if (studentGroupFilter !== 'all' && !groups.some((group) => group.id === studentGroupFilter)) {
      setStudentGroupFilter('all');
    }
  }, [groups, studentGroupFilter]);

  useEffect(() => {
    if (!courseCode.trim()) {
      setCourseCode(suggestedCourseCode);
    }
  }, [courseCode, suggestedCourseCode]);

  async function submitGroup() {
    if (!groupName.trim()) {
      Alert.alert('Проверьте форму', 'Введите название группы');
      return;
    }

    const parsedYear = studyYear.trim() ? Number(studyYear) : null;
    if (parsedYear !== null && (!Number.isInteger(parsedYear) || parsedYear < 1 || parsedYear > 6)) {
      Alert.alert('Проверьте форму', 'Курс должен быть числом от 1 до 6');
      return;
    }

    const created = await onCreateGroup({
      name: groupName.trim(),
      speciality: speciality.trim(),
      studyYear: parsedYear
    });
    if (!created) return;
    setGroupName('');
  }

  async function submitUser() {
    if (!fullName.trim() || !newEmail.trim() || !newPassword.trim()) {
      Alert.alert('Проверьте форму', 'Заполните ФИО, email и пароль');
      return;
    }
    if (newUserRole === 'student' && !groupId) {
      Alert.alert('Проверьте форму', 'Для студента нужно выбрать группу');
      return;
    }
    if (newUserRole === 'teacher' && !department.trim()) {
      Alert.alert('Проверьте форму', 'Для преподавателя нужно указать кафедру');
      return;
    }

    const created = await onCreateUser({
      fullName: fullName.trim(),
      email: newEmail.trim(),
      password: newPassword,
      role: newUserRole,
      groupId: newUserRole === 'student' ? groupId : undefined,
      department: newUserRole === 'teacher' ? department.trim() : undefined
    });
    if (!created) return;

    setFullName('');
    setNewEmail('');
    setNewPassword('password');
  }

  async function submitCourse() {
    if (!courseTitle.trim() || !courseCode.trim()) {
      Alert.alert('Проверьте форму', 'Заполните название и код дисциплины');
      return;
    }
    if (!courseTeacherUserId) {
      Alert.alert('Проверьте форму', 'Выберите преподавателя дисциплины');
      return;
    }

    const created = await onCreateCourse({
      title: courseTitle.trim(),
      code: courseCode.trim(),
      description: courseDescription.trim(),
      teacherUserId: courseTeacherUserId
    });
    if (!created) return;

    setCourseTitle('');
    setCourseCode('');
    setCourseDescription('');
  }

  async function showRoster() {
    if (!rosterCourseId) {
      Alert.alert('Проверьте форму', 'Выберите дисциплину');
      return;
    }
    await onLoadCourseRoster(rosterCourseId);
  }

  async function assignRosterGroup() {
    if (!rosterCourseId || !rosterGroupId) {
      Alert.alert('Проверьте форму', 'Выберите дисциплину и группу');
      return;
    }
    await onAssignGroupToCourse(rosterCourseId, rosterGroupId);
  }

  async function removeRosterGroup() {
    if (!rosterCourseId || !rosterGroupId) {
      Alert.alert('Проверьте форму', 'Выберите дисциплину и группу');
      return;
    }
    await onRemoveGroupFromCourse(rosterCourseId, rosterGroupId);
  }

  function prepareStudentForm(targetGroupId?: number) {
    setNewUserRole('student');
    if (targetGroupId) {
      setGroupId(targetGroupId);
      setStudentGroupFilter(targetGroupId);
    } else if (studentGroupFilter !== 'all') {
      setGroupId(studentGroupFilter);
    }
    if (!fullName.trim()) setFullName('Новый студент');
    if (!newEmail.trim()) setNewEmail('new.student@example.com');
    if (!newPassword.trim()) setNewPassword('password');
  }

  function toggleAdminForm(form: AdminForm) {
    const isOpening = openAdminForm !== form;
    setOpenAdminForm(isOpening ? form : null);
    if (!isOpening) return;

    if (form === 'student') {
      prepareStudentForm();
    }
    if (form === 'staff') {
      if (newUserRole === 'student') setNewUserRole('teacher');
      if (!fullName.trim()) setFullName('Новый преподаватель');
      if (!newEmail.trim()) setNewEmail('new.teacher@example.com');
      if (!newPassword.trim()) setNewPassword('password');
    }
  }

  function openStudentFormForGroup(targetGroupId: number) {
    setOpenAdminForm('student');
    prepareStudentForm(targetGroupId);
  }

  function chooseStudentGroupFilter(nextGroupId: StudentGroupFilter) {
    setStudentGroupFilter(nextGroupId);
    if (nextGroupId !== 'all') {
      setGroupId(nextGroupId);
    }
  }

  function openStudentsWindow() {
    if (adminWindow !== 'students') {
      setOpenAdminForm(null);
    }
    setAdminWindow('students');
  }

  function openMainAdminWindow() {
    if (adminWindow !== 'main') {
      setOpenAdminForm(null);
    }
    setAdminWindow('main');
  }

  if (adminWindow === 'students') {
    return (
      <>
        <AdminSectionNav
          activeWindow={adminWindow}
          studentCount={studentUsers.length}
          groupCount={groups.length}
          onOpenMain={openMainAdminWindow}
          onOpenStudents={openStudentsWindow}
        />
        <Pressable style={({ pressed }) => [styles.inlineBackButton, pressed && styles.pressed]} onPress={openMainAdminWindow}>
          <Ionicons name="arrow-back" size={18} color={palette.accentDark} />
          <Text style={styles.inlineBackButtonText}>Назад в админку</Text>
        </Pressable>
        <View style={styles.cardTop}>
          <View>
            <Text style={styles.pageTitle}>Студенты</Text>
            <Text style={styles.pageText}>Список сгруппирован по учебным группам. Нового студента можно добавить сразу в выбранную группу.</Text>
          </View>
        </View>

        <View style={styles.metricGrid}>
          <Metric label="В списке" value={visibleStudentCount} />
          <Metric label="Группы" value={groups.length} />
        </View>

        <View style={styles.card}>
          <View style={styles.cardTop}>
            <View style={styles.flex}>
              <Text style={styles.cardTitle}>Фильтр по группе</Text>
              <Text style={styles.cardText}>Выберите группу, чтобы работать только с ее студентами.</Text>
            </View>
            <View style={styles.statusBadge}>
              <Text style={styles.statusText}>{visibleStudentCount}</Text>
            </View>
          </View>
          <View style={styles.segmentRow}>
            <Pressable
              style={({ pressed }) => [styles.segmentButton, studentGroupFilter === 'all' && styles.segmentButtonActive, pressed && styles.pressed]}
              onPress={() => chooseStudentGroupFilter('all')}
            >
              <Text style={[styles.segmentText, studentGroupFilter === 'all' && styles.segmentTextActive]}>
                Все группы
              </Text>
            </Pressable>
            {studentsByGroup.map(({ group, count }) => (
              <Pressable
                key={group.id}
                style={({ pressed }) => [styles.segmentButton, studentGroupFilter === group.id && styles.segmentButtonActive, pressed && styles.pressed]}
                onPress={() => chooseStudentGroupFilter(group.id)}
              >
                <Text style={[styles.segmentText, studentGroupFilter === group.id && styles.segmentTextActive]}>
                  {group.name} · {count}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        <Pressable style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]} onPress={() => toggleAdminForm('student')}>
          <Text style={styles.primaryButtonText}>
            {openAdminForm === 'student'
              ? 'Скрыть форму студента'
              : selectedStudentGroup ? `Добавить в ${selectedStudentGroup.name}` : 'Добавить студента'}
          </Text>
        </Pressable>

        {openAdminForm === 'student' && (
          <View style={styles.card}>
            <View style={styles.rowHeader}>
              <Ionicons name="person-add-outline" size={21} color={palette.accent} />
              <Text style={styles.cardTitle}>
                {studentFormGroup ? `Новый студент: ${studentFormGroup.name}` : 'Новый студент'}
              </Text>
            </View>
            <Text style={styles.label}>ФИО</Text>
            <TextInput value={fullName} onChangeText={setFullName} style={styles.input} />
            <Text style={styles.label}>Email</Text>
            <TextInput value={newEmail} onChangeText={setNewEmail} autoCapitalize="none" style={styles.input} />
            <Text style={styles.label}>Пароль</Text>
            <TextInput value={newPassword} onChangeText={setNewPassword} secureTextEntry style={styles.input} />
            <Text style={styles.label}>Группа</Text>
            <View style={styles.segmentRow}>
              {groups.map((group) => (
                <Pressable
                  key={group.id}
                  style={({ pressed }) => [styles.segmentButton, group.id === groupId && styles.segmentButtonActive, pressed && styles.pressed]}
                  onPress={() => setGroupId(group.id)}
                >
                  <Text style={[styles.segmentText, group.id === groupId && styles.segmentTextActive]}>{group.name}</Text>
                </Pressable>
              ))}
            </View>
            <Pressable style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]} onPress={submitUser}>
              <Text style={styles.primaryButtonText}>Создать студента</Text>
            </Pressable>
          </View>
        )}

        {visibleStudentGroups.map(({ group, students }) => (
          <View key={group.id} style={styles.studentGroupBlock}>
            <View style={styles.groupSectionHeader}>
              <View style={styles.flex}>
                <Text style={styles.sectionTitle}>{group.name}</Text>
                <Text style={styles.muted}>
                  {group.speciality || 'Направление не указано'} · {group.studyYear ? `${group.studyYear} курс` : 'курс не указан'} · студентов: {students.length}
                </Text>
              </View>
              <Pressable style={({ pressed }) => [styles.compactActionButton, pressed && styles.pressed]} onPress={() => openStudentFormForGroup(group.id)}>
                <Ionicons name="person-add-outline" size={17} color={palette.accentDark} />
                <Text style={styles.compactActionButtonText}>Добавить</Text>
              </Pressable>
            </View>
            {students.map((item) => (
              <AdminUserCard
                key={item.id}
                user={item}
                groups={groups}
                onUpdateUser={onUpdateUser}
              />
            ))}
            {students.length === 0 && (
              <EmptyState icon="person-add-outline" title="В группе нет студентов" text="Нажмите «Добавить», чтобы создать студента в этой группе." />
            )}
          </View>
        ))}
        {studentGroupFilter === 'all' && ungroupedStudents.length > 0 && (
          <View style={styles.studentGroupBlock}>
            <View style={styles.groupSectionHeader}>
              <View style={styles.flex}>
                <Text style={styles.sectionTitle}>Без группы</Text>
                <Text style={styles.muted}>Студенты без привязки к учебной группе</Text>
              </View>
            </View>
            {ungroupedStudents.map((item) => (
              <AdminUserCard
                key={item.id}
                user={item}
                groups={groups}
                onUpdateUser={onUpdateUser}
              />
            ))}
          </View>
        )}
        {visibleStudentCount === 0 && (
          <EmptyState icon="people-outline" title="Студентов пока нет" text="Нажмите «Добавить студента» и выберите учебную группу." />
        )}
      </>
    );
  }

  return (
    <>
      <Text style={styles.pageTitle}>Панель администратора</Text>
      <Text style={styles.pageText}>Контроль пользователей, дисциплин и структуры данных системы.</Text>
      <AdminSectionNav
        activeWindow={adminWindow}
        studentCount={studentUsers.length}
        groupCount={groups.length}
        onOpenMain={openMainAdminWindow}
        onOpenStudents={openStudentsWindow}
      />
      <View style={styles.metricGrid}>
        {Object.entries(summary || {}).map(([key, value]) => (
          <Metric key={key} label={adminLabel(key)} value={value} />
        ))}
      </View>

      <SectionTitle title="Назначение групп" />
      <View style={styles.card}>
        <View style={styles.rowHeader}>
          <Ionicons name="git-branch-outline" size={21} color={palette.accent} />
          <Text style={styles.cardTitle}>Группы на дисциплинах</Text>
        </View>
        <Text style={styles.label}>Дисциплина</Text>
        <View style={styles.segmentRow}>
          {courses.map((course) => (
            <Pressable
              key={course.id}
              style={({ pressed }) => [styles.segmentButton, course.id === rosterCourseId && styles.segmentButtonActive, pressed && styles.pressed]}
              onPress={() => setRosterCourseId(course.id)}
            >
              <Text style={[styles.segmentText, course.id === rosterCourseId && styles.segmentTextActive]}>{course.code}</Text>
            </Pressable>
          ))}
        </View>
        <Text style={styles.label}>Группа</Text>
        <View style={styles.segmentRow}>
          {groups.map((group) => (
            <Pressable
              key={group.id}
              style={({ pressed }) => [styles.segmentButton, group.id === rosterGroupId && styles.segmentButtonActive, pressed && styles.pressed]}
              onPress={() => setRosterGroupId(group.id)}
            >
              <Text style={[styles.segmentText, group.id === rosterGroupId && styles.segmentTextActive]}>{group.name}</Text>
            </Pressable>
          ))}
        </View>
        <View style={styles.actionRow}>
          <Pressable style={({ pressed }) => [styles.secondaryButton, styles.actionButton, pressed && styles.pressed]} onPress={showRoster}>
            <Ionicons name="list-outline" size={18} color={palette.accent} />
            <Text style={styles.secondaryButtonText}>Показать состав</Text>
          </Pressable>
          <Pressable style={({ pressed }) => [styles.secondaryButton, styles.actionButton, pressed && styles.pressed]} onPress={assignRosterGroup}>
            <Ionicons name="add" size={18} color={palette.accent} />
            <Text style={styles.secondaryButtonText}>Назначить группу</Text>
          </Pressable>
        </View>
        <Pressable style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]} onPress={removeRosterGroup}>
          <Ionicons name="remove-circle-outline" size={18} color={palette.accent} />
          <Text style={styles.secondaryButtonText}>Снять группу</Text>
        </Pressable>
      </View>

      {visibleRoster.map((student) => (
        <View key={student.id} style={styles.listRow}>
          <View style={styles.roleIcon}>
            <Ionicons name="person" size={18} color={palette.accent} />
          </View>
          <View style={styles.flex}>
            <Text style={styles.cardTitle}>{student.fullName}</Text>
            <Text style={styles.cardText}>{student.email}</Text>
            <Text style={styles.muted}>{student.group}</Text>
          </View>
        </View>
      ))}
      {rosterCourseId > 0 && visibleRoster.length === 0 && (
        <EmptyState icon="people-outline" title="Состав не загружен" text="Нажмите «Показать состав» или назначьте группу на дисциплину." />
      )}

      <SectionTitle title="Группы" />
      <Pressable style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]} onPress={() => toggleAdminForm('group')}>
        <Text style={styles.primaryButtonText}>{openAdminForm === 'group' ? 'Скрыть форму группы' : 'Добавить группу'}</Text>
      </Pressable>
      {openAdminForm === 'group' && (
        <View style={styles.card}>
          <View style={styles.rowHeader}>
            <Ionicons name="people-outline" size={21} color={palette.accent} />
            <Text style={styles.cardTitle}>Новая группа</Text>
          </View>
          <Text style={styles.label}>Название группы</Text>
          <TextInput value={groupName} onChangeText={setGroupName} style={styles.input} placeholder="Например: ИВТ-43" />
          <Text style={styles.label}>Направление</Text>
          <TextInput value={speciality} onChangeText={setSpeciality} style={styles.input} />
          <Text style={styles.label}>Курс</Text>
          <TextInput value={studyYear} onChangeText={setStudyYear} keyboardType="number-pad" style={styles.input} placeholder="1-6" />
          <Pressable style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]} onPress={submitGroup}>
            <Ionicons name="add" size={18} color={palette.accent} />
            <Text style={styles.secondaryButtonText}>Создать группу</Text>
          </Pressable>
        </View>
      )}

      {groups.map((group) => (
        <View key={group.id} style={styles.listRow}>
          <View style={styles.roleIcon}>
            <Ionicons name="people" size={18} color={palette.accent} />
          </View>
          <View style={styles.flex}>
            <Text style={styles.cardTitle}>{group.name}</Text>
            <Text style={styles.cardText}>{group.speciality || 'Направление не указано'}</Text>
            <Text style={styles.muted}>
              {group.studyYear ? `${group.studyYear} курс` : 'Курс не указан'} · студентов: {group.studentCount}
            </Text>
          </View>
        </View>
      ))}

      <SectionTitle title="Сотрудники" />
      <Pressable style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]} onPress={() => toggleAdminForm('staff')}>
        <Text style={styles.primaryButtonText}>{openAdminForm === 'staff' ? 'Скрыть форму сотрудника' : 'Добавить преподавателя или админа'}</Text>
      </Pressable>
      <Text style={styles.helperText}>Студенты создаются и редактируются в отдельном окне, чтобы общий экран администратора оставался компактным.</Text>
      {openAdminForm === 'staff' && (
        <View style={styles.card}>
          <View style={styles.rowHeader}>
            <Ionicons name="person-add-outline" size={21} color={palette.accent} />
            <Text style={styles.cardTitle}>Новый сотрудник</Text>
          </View>
          <View style={styles.segmentRow}>
            {(['teacher', 'admin'] as Role[]).map((role) => (
              <Pressable
                key={role}
                style={({ pressed }) => [styles.segmentButton, role === newUserRole && styles.segmentButtonActive, pressed && styles.pressed]}
                onPress={() => setNewUserRole(role)}
              >
                <Text style={[styles.segmentText, role === newUserRole && styles.segmentTextActive]}>{roleLabel(role)}</Text>
              </Pressable>
            ))}
          </View>
          <Text style={styles.label}>ФИО</Text>
          <TextInput value={fullName} onChangeText={setFullName} style={styles.input} />
          <Text style={styles.label}>Email</Text>
          <TextInput value={newEmail} onChangeText={setNewEmail} autoCapitalize="none" style={styles.input} />
          <Text style={styles.label}>Пароль</Text>
          <TextInput value={newPassword} onChangeText={setNewPassword} secureTextEntry style={styles.input} />
          {newUserRole === 'teacher' && (
            <>
              <Text style={styles.label}>Кафедра</Text>
              <TextInput value={department} onChangeText={setDepartment} style={styles.input} />
            </>
          )}
          <Pressable style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]} onPress={submitUser}>
            <Text style={styles.primaryButtonText}>Создать сотрудника</Text>
          </Pressable>
        </View>
      )}

      {staffUsers.map((item) => (
        <AdminUserCard
          key={item.id}
          user={item}
          groups={groups}
          onUpdateUser={onUpdateUser}
        />
      ))}
      {staffUsers.length === 0 && (
        <EmptyState icon="people-outline" title="Пользователи не загружены" text="Проверьте подключение к серверу и повторите вход." />
      )}

      <SectionTitle title="Дисциплины" />
      <Pressable style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]} onPress={() => toggleAdminForm('course')}>
        <Text style={styles.primaryButtonText}>{openAdminForm === 'course' ? 'Скрыть форму дисциплины' : 'Добавить дисциплину'}</Text>
      </Pressable>
      {openAdminForm === 'course' && (
        <View style={styles.card}>
          <View style={styles.rowHeader}>
            <Ionicons name="library-outline" size={21} color={palette.accent} />
            <Text style={styles.cardTitle}>Новая дисциплина</Text>
          </View>
          <Text style={styles.label}>Название</Text>
          <TextInput value={courseTitle} onChangeText={setCourseTitle} style={styles.input} />
          <Text style={styles.label}>Код</Text>
          <TextInput value={courseCode} onChangeText={setCourseCode} autoCapitalize="characters" style={styles.input} />
          <Text style={styles.label}>Описание</Text>
          <TextInput value={courseDescription} onChangeText={setCourseDescription} multiline style={[styles.input, styles.textArea]} />
          <Text style={styles.label}>Преподаватель</Text>
          <View style={styles.segmentRow}>
            {teacherUsers.map((teacher) => (
              <Pressable
                key={teacher.id}
                style={({ pressed }) => [styles.segmentButton, teacher.id === courseTeacherUserId && styles.segmentButtonActive, pressed && styles.pressed]}
                onPress={() => setCourseTeacherUserId(teacher.id)}
              >
                <Text style={[styles.segmentText, teacher.id === courseTeacherUserId && styles.segmentTextActive]}>{teacher.fullName}</Text>
              </Pressable>
            ))}
          </View>
          <Pressable style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]} onPress={submitCourse}>
            <Text style={styles.primaryButtonText}>Создать дисциплину</Text>
          </Pressable>
        </View>
      )}
      {courses.map((course) => (
        <AdminCourseCard
          key={course.id}
          course={course}
          teachers={teacherUsers}
          onUpdateCourse={onUpdateCourse}
        />
      ))}
      {courses.length === 0 && (
        <EmptyState icon="library-outline" title="Дисциплины не созданы" text="После создания курсов они появятся в этом списке." />
      )}
    </>
  );
}

function AdminSectionNav({
  activeWindow,
  studentCount,
  groupCount,
  onOpenMain,
  onOpenStudents
}: {
  activeWindow: AdminWindow;
  studentCount: number;
  groupCount: number;
  onOpenMain: () => void;
  onOpenStudents: () => void;
}) {
  return (
    <View style={styles.adminNav}>
      <Pressable
        style={({ pressed }) => [styles.adminNavItem, activeWindow === 'main' && styles.adminNavItemActive, pressed && styles.pressed]}
        onPress={onOpenMain}
      >
        <View style={styles.rowHeaderCompact}>
          <Ionicons name="settings-outline" size={19} color={activeWindow === 'main' ? palette.accentDark : palette.muted} />
          <Text style={[styles.adminNavTitle, activeWindow === 'main' && styles.adminNavTitleActive]}>Обзор</Text>
        </View>
        <Text style={[styles.adminNavMeta, activeWindow === 'main' && styles.adminNavMetaActive]}>Группы: {groupCount}</Text>
      </Pressable>
      <Pressable
        style={({ pressed }) => [styles.adminNavItem, activeWindow === 'students' && styles.adminNavItemActive, pressed && styles.pressed]}
        onPress={onOpenStudents}
      >
        <View style={styles.rowHeaderCompact}>
          <Ionicons name="people-outline" size={19} color={activeWindow === 'students' ? palette.accentDark : palette.muted} />
          <Text style={[styles.adminNavTitle, activeWindow === 'students' && styles.adminNavTitleActive]}>Студенты</Text>
        </View>
        <Text style={[styles.adminNavMeta, activeWindow === 'students' && styles.adminNavMetaActive]}>Всего: {studentCount}</Text>
      </Pressable>
    </View>
  );
}

function AdminUserCard({
  user,
  groups,
  onUpdateUser
}: {
  user: UserSummary;
  groups: StudentGroup[];
  onUpdateUser: (userId: number, payload: {
    fullName: string;
    email: string;
    isActive: boolean;
    groupId?: number;
    department?: string;
  }) => Promise<void>;
}) {
  const [fullName, setFullName] = useState(user.fullName);
  const [email, setEmail] = useState(user.email);
  const [isActive, setIsActive] = useState(user.isActive);
  const [groupId, setGroupId] = useState(user.groupId || groups[0]?.id || 0);
  const [department, setDepartment] = useState(user.department || '');

  useEffect(() => {
    setFullName(user.fullName);
    setEmail(user.email);
    setIsActive(user.isActive);
    setGroupId(user.groupId || groups[0]?.id || 0);
    setDepartment(user.department || '');
  }, [groups, user]);

  async function submitUpdate(nextActive = isActive) {
    if (!fullName.trim() || !email.trim()) {
      Alert.alert('Проверьте форму', 'Заполните ФИО и email');
      return;
    }
    if (user.role === 'student' && !groupId) {
      Alert.alert('Проверьте форму', 'Выберите группу студента');
      return;
    }
    if (user.role === 'teacher' && !department.trim()) {
      Alert.alert('Проверьте форму', 'Укажите кафедру преподавателя');
      return;
    }

    await onUpdateUser(user.id, {
      fullName: fullName.trim(),
      email: email.trim(),
      isActive: nextActive,
      groupId: user.role === 'student' ? groupId : undefined,
      department: user.role === 'teacher' ? department.trim() : undefined
    });
  }

  async function toggleActive() {
    const nextActive = !isActive;
    setIsActive(nextActive);
    await submitUpdate(nextActive);
  }

  return (
    <View style={styles.card}>
      <View style={styles.cardTop}>
        <View style={styles.rowHeader}>
          <View style={styles.roleIcon}>
            <Ionicons name={roleIcon(user.role)} size={18} color={palette.accent} />
          </View>
          <View>
            <Text style={styles.cardTitle}>{user.fullName}</Text>
            <Text style={styles.muted}>{roleLabel(user.role)}</Text>
          </View>
        </View>
        <View style={[styles.statusBadge, isActive && styles.statusDone]}>
          <Text style={[styles.statusText, isActive && styles.statusDoneText]}>{isActive ? 'Активен' : 'Блок'}</Text>
        </View>
      </View>
      <Text style={styles.label}>ФИО</Text>
      <TextInput value={fullName} onChangeText={setFullName} style={styles.input} />
      <Text style={styles.label}>Email</Text>
      <TextInput value={email} onChangeText={setEmail} autoCapitalize="none" style={styles.input} />
      {user.role === 'student' && (
        <>
          <Text style={styles.label}>Группа</Text>
          <View style={styles.segmentRow}>
            {groups.map((group) => (
              <Pressable
                key={group.id}
                style={({ pressed }) => [styles.segmentButton, group.id === groupId && styles.segmentButtonActive, pressed && styles.pressed]}
                onPress={() => setGroupId(group.id)}
              >
                <Text style={[styles.segmentText, group.id === groupId && styles.segmentTextActive]}>{group.name}</Text>
              </Pressable>
            ))}
          </View>
        </>
      )}
      {user.role === 'teacher' && (
        <>
          <Text style={styles.label}>Кафедра</Text>
          <TextInput value={department} onChangeText={setDepartment} style={styles.input} />
        </>
      )}
      <View style={styles.actionRow}>
        <Pressable style={({ pressed }) => [styles.secondaryButton, styles.actionButton, pressed && styles.pressed]} onPress={() => submitUpdate()}>
          <Ionicons name="save-outline" size={18} color={palette.accent} />
          <Text style={styles.secondaryButtonText}>Сохранить</Text>
        </Pressable>
        <Pressable style={({ pressed }) => [styles.secondaryButton, styles.actionButton, pressed && styles.pressed]} onPress={toggleActive}>
          <Ionicons name={isActive ? 'lock-closed-outline' : 'lock-open-outline'} size={18} color={palette.accent} />
          <Text style={styles.secondaryButtonText}>{isActive ? 'Блок' : 'Активировать'}</Text>
        </Pressable>
      </View>
    </View>
  );
}

function AdminCourseCard({
  course,
  teachers,
  onUpdateCourse
}: {
  course: Course;
  teachers: UserSummary[];
  onUpdateCourse: (courseId: number, payload: {
    title: string;
    code: string;
    description: string;
    teacherUserId?: number;
  }) => Promise<void>;
}) {
  const [title, setTitle] = useState(course.title);
  const [code, setCode] = useState(course.code);
  const [description, setDescription] = useState(course.description);
  const [teacherUserId, setTeacherUserId] = useState(course.teacherId || teachers[0]?.id || 0);

  useEffect(() => {
    setTitle(course.title);
    setCode(course.code);
    setDescription(course.description);
    setTeacherUserId(course.teacherId || teachers[0]?.id || 0);
  }, [course, teachers]);

  async function submitUpdate() {
    if (!title.trim() || !code.trim()) {
      Alert.alert('Проверьте форму', 'Заполните название и код дисциплины');
      return;
    }
    if (!teacherUserId) {
      Alert.alert('Проверьте форму', 'Выберите преподавателя');
      return;
    }

    await onUpdateCourse(course.id, {
      title: title.trim(),
      code: code.trim(),
      description: description.trim(),
      teacherUserId
    });
  }

  return (
    <View style={styles.card}>
      <View style={styles.rowHeader}>
        <View style={styles.roleIcon}>
          <Ionicons name="library-outline" size={18} color={palette.accent} />
        </View>
        <View style={styles.flex}>
          <Text style={styles.cardTitle}>{course.title}</Text>
          <Text style={styles.muted}>{course.code}</Text>
        </View>
      </View>
      <Text style={styles.label}>Название</Text>
      <TextInput value={title} onChangeText={setTitle} style={styles.input} />
      <Text style={styles.label}>Код</Text>
      <TextInput value={code} onChangeText={setCode} autoCapitalize="characters" style={styles.input} />
      <Text style={styles.label}>Описание</Text>
      <TextInput value={description} onChangeText={setDescription} multiline style={[styles.input, styles.textArea]} />
      <Text style={styles.label}>Преподаватель</Text>
      <View style={styles.segmentRow}>
        {teachers.map((teacher) => (
          <Pressable
            key={teacher.id}
            style={({ pressed }) => [styles.segmentButton, teacher.id === teacherUserId && styles.segmentButtonActive, pressed && styles.pressed]}
            onPress={() => setTeacherUserId(teacher.id)}
          >
            <Text style={[styles.segmentText, teacher.id === teacherUserId && styles.segmentTextActive]}>{teacher.fullName}</Text>
          </Pressable>
        ))}
      </View>
      <Pressable style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]} onPress={submitUpdate}>
        <Text style={styles.primaryButtonText}>Сохранить дисциплину</Text>
      </Pressable>
    </View>
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
    groups: 'Группы',
    courses: 'Дисциплины',
    materials: 'Материалы',
    assignments: 'Задания',
    submissions: 'Ответы'
  };
  return labels[key] || key;
}

function materialIcon(type: Material['type']): IconName {
  const icons: Record<Material['type'], IconName> = {
    text: 'document-text-outline',
    link: 'link-outline',
    file: 'document-attach-outline',
    video: 'videocam-outline'
  };
  return icons[type];
}

function materialTypeLabel(type: Material['type']) {
  const labels: Record<Material['type'], string> = {
    text: 'Лекция',
    link: 'Ссылка',
    file: 'Файл',
    video: 'Видео'
  };
  return labels[type];
}

function questionTypeLabel(type: Question['type']) {
  const labels: Record<Question['type'], string> = {
    single: 'Один вариант ответа',
    multiple: 'Несколько вариантов ответа',
    text: 'Текстовый ответ'
  };
  return labels[type];
}

function assignmentStatusLabel(assignment: Assignment) {
  if (assignment.status === 'checked') return `${assignment.score ?? 0}/${assignment.maxScore}`;
  if (assignment.status === 'submitted') return 'На проверке';
  return 'К сдаче';
}

function answerGroupIsCorrect(answers: SubmissionReview['answers']) {
  return answers.length > 0 && answers.every((answer) => answer.isCorrect === true);
}

function answerGroupStatusLabel(group: { questionType: Question['type']; answers: SubmissionReview['answers'] }) {
  if (group.questionType === 'text') return 'Ручная проверка';
  return answerGroupIsCorrect(group.answers) ? 'Верно' : 'Ошибка';
}

function answerIcon(answer: SubmissionReview['answers'][number]): IconName {
  if (answer.isCorrect === true) return 'checkmark-circle';
  if (answer.isCorrect === false) return 'close-circle-outline';
  return 'document-text-outline';
}

function journalStatusLabel(result: CourseJournal['results'][number] | undefined, maxScore: number) {
  if (!result) return 'Нет ответа';
  if (result.status === 'checked') return `${result.score ?? 0}/${maxScore}`;
  return 'На проверке';
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
  commentInput: {
    minHeight: 86,
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
  adminNav: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 14
  },
  adminNavItem: {
    flex: 1,
    minHeight: 68,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: palette.surface,
    paddingHorizontal: 12,
    paddingVertical: 11,
    justifyContent: 'space-between'
  },
  adminNavItemActive: {
    borderColor: '#9bbdaa',
    backgroundColor: palette.accentSoft
  },
  adminNavTitle: {
    color: palette.muted,
    fontSize: 15,
    fontWeight: '800'
  },
  adminNavTitleActive: {
    color: palette.accentDark
  },
  adminNavMeta: {
    color: palette.faint,
    fontSize: 12,
    fontWeight: '700',
    marginTop: 8
  },
  adminNavMetaActive: {
    color: palette.accentDark
  },
  inlineBackButton: {
    alignSelf: 'flex-start',
    minHeight: 40,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#b7d1c4',
    backgroundColor: palette.accentSoft,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    marginBottom: 14
  },
  inlineBackButtonText: {
    color: palette.accentDark,
    fontSize: 14,
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
  iconButtonSmall: {
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
  materialHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 12
  },
  materialBody: {
    color: palette.ink,
    fontSize: 16,
    lineHeight: 24
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
  rowHeaderCompact: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  studentGroupBlock: {
    marginTop: 14
  },
  groupSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 10
  },
  compactActionButton: {
    minHeight: 38,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#b7d1c4',
    backgroundColor: palette.accentSoft,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10
  },
  compactActionButtonText: {
    color: palette.accentDark,
    fontSize: 13,
    fontWeight: '800'
  },
  questionMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 10,
    marginBottom: 8
  },
  miniBadge: {
    borderRadius: 8,
    paddingHorizontal: 9,
    paddingVertical: 6,
    backgroundColor: palette.surfaceMuted
  },
  miniBadgeSuccess: {
    backgroundColor: palette.successBg
  },
  miniBadgeWarning: {
    backgroundColor: palette.warningBg
  },
  miniBadgeText: {
    color: palette.muted,
    fontSize: 12,
    fontWeight: '800'
  },
  miniBadgeSuccessText: {
    color: palette.successText
  },
  miniBadgeWarningText: {
    color: palette.warningText
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14
  },
  actionButton: {
    flex: 1,
    marginTop: 0
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
  statusPending: {
    backgroundColor: palette.accentSoft
  },
  statusText: {
    color: palette.warningText,
    fontSize: 12,
    fontWeight: '800'
  },
  statusDoneText: {
    color: palette.successText
  },
  statusPendingText: {
    color: palette.accentDark
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
  optionEditorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8
  },
  answerOptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8
  },
  answerLine: {
    borderTopWidth: 1,
    borderTopColor: palette.line,
    paddingTop: 10,
    marginTop: 10
  },
  answerQuestion: {
    color: palette.ink,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '800'
  },
  gradeRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 12,
    marginTop: 12
  },
  gradeInputWrap: {
    flex: 1
  },
  gradeMaxBox: {
    width: 104,
    minHeight: 66,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: palette.surfaceMuted,
    paddingHorizontal: 12,
    paddingVertical: 9,
    justifyContent: 'center'
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
