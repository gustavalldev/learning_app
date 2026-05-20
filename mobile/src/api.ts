import type {
  Assignment,
  Course,
  CourseJournal,
  CourseRosterItem,
  Material,
  Role,
  StudentGroup,
  Submission,
  SubmissionReview,
  User,
  UserSummary
} from './types';

const runtime = globalThis as typeof globalThis & {
  process?: { env?: { EXPO_PUBLIC_API_URL?: string } };
};

function normalizeApiUrl(value: string) {
  return value.replace(/\/+$/, '');
}

const API_URL = normalizeApiUrl(runtime.process?.env?.EXPO_PUBLIC_API_URL || 'http://localhost:4000/api');

async function request<T>(path: string, token?: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers
    }
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.message || 'Ошибка запроса');
  }

  return data;
}

export function login(email: string, password: string) {
  return request<{ token: string; user: User }>('/auth/login', undefined, {
    method: 'POST',
    body: JSON.stringify({ email, password })
  });
}

export function getCourses(token: string) {
  return request<Course[]>('/courses', token);
}

export function getMaterials(token: string, courseId: number) {
  return request<Material[]>(`/courses/${courseId}/materials`, token);
}

export function createMaterial(token: string, payload: { courseId: number; title: string; type: string; content: string }) {
  return request<Material>('/materials', token, {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export function updateMaterial(token: string, materialId: number, payload: { courseId: number; title: string; type: string; content: string }) {
  return request<Material>(`/materials/${materialId}`, token, {
    method: 'PATCH',
    body: JSON.stringify(payload)
  });
}

export function deleteMaterial(token: string, materialId: number) {
  return request<{ ok: boolean; id: number }>(`/materials/${materialId}`, token, {
    method: 'DELETE'
  });
}

export function getAssignments(token: string, courseId: number) {
  return request<Assignment[]>(`/courses/${courseId}/assignments`, token);
}

export function assignGroupToCourse(token: string, courseId: number, groupId: number) {
  return request<{ courseId: number; groupId: number; groupName: string; enrolledCount: number }>(
    `/courses/${courseId}/groups`,
    token,
    {
      method: 'POST',
      body: JSON.stringify({ groupId })
    }
  );
}

export function removeGroupFromCourse(token: string, courseId: number, groupId: number) {
  return request<{ courseId: number; groupId: number; groupName: string; removedCount: number }>(
    `/courses/${courseId}/groups/${groupId}`,
    token,
    { method: 'DELETE' }
  );
}

export function getCourseRoster(token: string, courseId: number) {
  return request<CourseRosterItem[]>(`/courses/${courseId}/roster`, token);
}

export function getCourseJournal(token: string, courseId: number) {
  return request<CourseJournal>(`/courses/${courseId}/journal`, token);
}

export function createAssignment(
  token: string,
  payload: {
    courseId: number;
    title: string;
    description: string;
    dueDate: string;
    maxScore: number;
    questions: unknown[];
  }
) {
  return request<Assignment>('/assignments', token, {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export function updateAssignment(
  token: string,
  assignmentId: number,
  payload: {
    title: string;
    description: string;
    dueDate: string;
    maxScore: number;
    questions?: unknown[];
  }
) {
  return request<Assignment>(`/assignments/${assignmentId}`, token, {
    method: 'PATCH',
    body: JSON.stringify(payload)
  });
}

export function deleteAssignment(token: string, assignmentId: number) {
  return request<{ ok: boolean; id: number }>(`/assignments/${assignmentId}`, token, {
    method: 'DELETE'
  });
}

export function submitAssignment(token: string, assignmentId: number, answers: unknown[]) {
  return request<Submission>('/submissions', token, {
    method: 'POST',
    body: JSON.stringify({ assignmentId, answers })
  });
}

export function getAssignmentSubmissions(token: string, assignmentId: number) {
  return request<SubmissionReview[]>(`/assignments/${assignmentId}/submissions`, token);
}

export function gradeSubmission(token: string, submissionId: number, score: number, comment: string) {
  return request<SubmissionReview>(`/submissions/${submissionId}/grade`, token, {
    method: 'PATCH',
    body: JSON.stringify({ score, comment })
  });
}

export function getAdminSummary(token: string) {
  return request<Record<string, number>>('/admin/summary', token);
}

export function getUsers(token: string) {
  return request<UserSummary[]>('/users', token);
}

export function createUser(
  token: string,
  payload: {
    fullName: string;
    email: string;
    password: string;
    role: Role;
    groupId?: number;
    department?: string;
  }
) {
  return request<UserSummary>('/users', token, {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export function updateUser(
  token: string,
  userId: number,
  payload: {
    fullName: string;
    email: string;
    isActive: boolean;
    groupId?: number;
    department?: string;
  }
) {
  return request<UserSummary>(`/users/${userId}`, token, {
    method: 'PATCH',
    body: JSON.stringify(payload)
  });
}

export function getGroups(token: string) {
  return request<StudentGroup[]>('/groups', token);
}

export function createGroup(
  token: string,
  payload: {
    name: string;
    speciality: string;
    studyYear: number | null;
  }
) {
  return request<StudentGroup>('/groups', token, {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export function createCourse(
  token: string,
  payload: {
    title: string;
    code: string;
    description: string;
    teacherUserId: number;
  }
) {
  return request<Course>('/courses', token, {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export function updateCourse(
  token: string,
  courseId: number,
  payload: {
    title: string;
    code: string;
    description: string;
    teacherUserId?: number;
  }
) {
  return request<Course>(`/courses/${courseId}`, token, {
    method: 'PATCH',
    body: JSON.stringify(payload)
  });
}
