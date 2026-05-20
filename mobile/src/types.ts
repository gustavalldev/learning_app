export type Role = 'student' | 'teacher' | 'admin';

export type User = {
  id: number;
  fullName: string;
  email: string;
  role: Role;
  groupId?: number;
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
  teacherId?: number | null;
  progress: number;
};

export type StudentGroup = {
  id: number;
  name: string;
  speciality: string;
  studyYear: number | null;
  studentCount: number;
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
  options: { id: number; text: string; correct?: boolean }[];
};

export type AnswerValue = string | number | number[];

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

export type CourseRosterItem = {
  id: number;
  userId: number;
  fullName: string;
  email: string;
  groupId: number | null;
  group: string;
};

export type CourseJournalAssignment = {
  id: number;
  title: string;
  dueDate: string | null;
  maxScore: number;
};

export type CourseJournalResult = {
  submissionId: number;
  assignmentId: number;
  studentId: number;
  score: number | null;
  status: 'submitted' | 'checked';
  comment: string | null;
  submittedAt: string | null;
};

export type CourseJournal = {
  course: Course;
  assignments: CourseJournalAssignment[];
  students: CourseRosterItem[];
  results: CourseJournalResult[];
};

export type Submission = {
  id: number;
  assignmentId: number;
  studentId: number;
  score: number | null;
  status: string;
  comment: string | null;
};

export type SubmissionReview = Submission & {
  studentFullName: string;
  group: string;
  submittedAt: string;
  answers: {
    questionId: number;
    questionText: string;
    questionType: Question['type'];
    optionText: string | null;
    textAnswer: string | null;
    isCorrect: boolean | null;
  }[];
};
