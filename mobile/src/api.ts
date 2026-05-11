import type { Assignment, Course, Material, Submission, User, UserSummary } from './types';

const API_URL = 'http://localhost:4000/api';

async function request<T>(path: string, token?: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers
    }
  });

  const data = await response.json();
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

export function getAssignments(token: string, courseId: number) {
  return request<Assignment[]>(`/courses/${courseId}/assignments`, token);
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

export function submitAssignment(token: string, assignmentId: number, answers: unknown[]) {
  return request<Submission>('/submissions', token, {
    method: 'POST',
    body: JSON.stringify({ assignmentId, answers })
  });
}

export function getAdminSummary(token: string) {
  return request<Record<string, number>>('/admin/summary', token);
}

export function getUsers(token: string) {
  return request<UserSummary[]>('/users', token);
}
