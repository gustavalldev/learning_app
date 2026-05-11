export type Role = 'student' | 'teacher' | 'admin';

export type User = {
  id: number;
  fullName: string;
  email: string;
  role: Role;
  group?: string;
  department?: string;
};

export type UserSummary = User & {
  isActive: boolean;
  createdAt: string;
};

export type Course = {
  id: number;
  title: string;
  code: string;
  description: string;
  progress: number;
};

export type Material = {
  id: number;
  courseId: number;
  title: string;
  type: 'text' | 'link' | 'file' | 'video';
  content: string;
  createdAt: string;
};

export type Question = {
  id: number;
  text: string;
  type: 'single' | 'multiple' | 'text';
  options: { id: number; text: string }[];
};

export type Assignment = {
  id: number;
  courseId: number;
  title: string;
  description: string;
  dueDate: string;
  maxScore: number;
  questions: Question[];
  status: 'not_started' | 'submitted' | 'checked';
  score: number | null;
  comment: string | null;
};

export type Submission = {
  id: number;
  assignmentId: number;
  studentId: number;
  score: number;
  status: string;
  comment: string;
};
