import type { RowDataPacket } from "mysql2";
import { database } from "../config/database.js";

export type StudentLearningProfileInput = {
  level: "gcse" | "igcse_o_level" | "a_level";
  subject: string;
  examBoard: string;
  schoolYear: string;
  targetGrade: string;
  tier: "foundation" | "higher" | "not_sure" | null;
};

export type StudentLearningProfile = StudentLearningProfileInput & {
  studentId: string;
  updatedAt: string;
};

export type StudentRecord = { id: string; username: string; email: string; displayName: string; joinedAt: string; hasLearningProfile: boolean };
type StudentRecordBase = Omit<StudentRecord, "hasLearningProfile">;
type StudentRow = RowDataPacket & { id: string; username: string; email: string; display_name: string; created_at: Date; has_learning_profile: number };
type ProfileRow = RowDataPacket & {
  student_id: string | null; level: StudentLearningProfileInput["level"]; subject: string;
  exam_board: string; school_year: string; target_grade: string;
  tier: StudentLearningProfileInput["tier"]; updated_at: Date;
};

export async function ensureStudentLearningProfileSchema() {
  await database.query(`
    CREATE TABLE IF NOT EXISTS student_learning_profiles (
      student_id BIGINT UNSIGNED NOT NULL PRIMARY KEY,
      level ENUM('gcse', 'igcse_o_level', 'a_level') NOT NULL,
      subject VARCHAR(80) NOT NULL,
      exam_board VARCHAR(80) NOT NULL,
      school_year VARCHAR(20) NOT NULL,
      target_grade VARCHAR(10) NOT NULL,
      tier ENUM('foundation', 'higher', 'not_sure') NULL,
      updated_by_id BIGINT UNSIGNED NOT NULL,
      updated_by_role ENUM('teacher', 'admin') NOT NULL,
      created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      CONSTRAINT student_learning_profiles_student_fk FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE,
      KEY student_learning_profiles_updated_at_index (updated_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
}

function serialize(row: StudentRow): StudentRecordBase {
  return {
    id: String(row.id), username: row.username, email: row.email,
    displayName: row.display_name, joinedAt: new Date(row.created_at).toISOString(),
  };
}

export async function listStudents(input: { query: string; page: number; pageSize: number }) {
  const search = input.query ? `%${input.query}%` : null;
  const where = search ? "WHERE role = 'student' AND (display_name LIKE ? OR email LIKE ? OR username LIKE ?)" : "WHERE role = 'student'";
  const values = search ? [search, search, search] : [];
  const [[countRows], [studentRows]] = await Promise.all([
    database.execute<(RowDataPacket & { total: number | string })[]>(`SELECT COUNT(*) AS total FROM users ${where}`, values),
    database.execute<StudentRow[]>(
      `SELECT users.id, users.username, users.email, users.display_name, users.created_at,
        (student_learning_profiles.student_id IS NOT NULL) AS has_learning_profile
       FROM users LEFT JOIN student_learning_profiles ON student_learning_profiles.student_id = users.id
       ${where.replaceAll("role", "users.role").replaceAll("display_name", "users.display_name").replaceAll("email", "users.email").replaceAll("username", "users.username")}
       ORDER BY users.created_at DESC, users.id DESC LIMIT ? OFFSET ?`,
      [...values, input.pageSize, (input.page - 1) * input.pageSize],
    ),
  ]);
  return {
    items: studentRows.map((row) => ({ ...serialize(row), hasLearningProfile: Boolean(row.has_learning_profile) })),
    total: Number(countRows[0]?.total ?? 0), page: input.page, pageSize: input.pageSize,
  };
}

export async function getStudentLearningProfile(studentId: string) {
  const [rows] = await database.execute<ProfileRow[]>(
    `SELECT profiles.student_id, profiles.level, profiles.subject, profiles.exam_board,
      profiles.school_year, profiles.target_grade, profiles.tier, profiles.updated_at
     FROM users
     LEFT JOIN student_learning_profiles profiles ON profiles.student_id = users.id
     WHERE users.id = ? AND users.role = 'student' LIMIT 1`,
    [studentId],
  );
  const row = rows[0];
  if (!row) return undefined;
  if (!row.student_id) return null;
  return serializeProfile(row);
}

function serializeProfile(row: ProfileRow): StudentLearningProfile {
  return {
    studentId: String(row.student_id),
    level: row.level,
    subject: row.subject,
    examBoard: row.exam_board,
    schoolYear: row.school_year,
    targetGrade: row.target_grade,
    tier: row.tier,
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

export async function saveStudentLearningProfile(
  studentId: string,
  input: StudentLearningProfileInput,
  updatedBy: { id: string; role: "teacher" | "admin" },
) {
  const [studentRows] = await database.execute<RowDataPacket[]>(
    "SELECT id FROM users WHERE id = ? AND role = 'student' LIMIT 1",
    [studentId],
  );
  if (!studentRows.length) return undefined;

  await database.execute(
    `INSERT INTO student_learning_profiles
      (student_id, level, subject, exam_board, school_year, target_grade, tier, updated_by_id, updated_by_role)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE level = VALUES(level), subject = VALUES(subject), exam_board = VALUES(exam_board),
       school_year = VALUES(school_year), target_grade = VALUES(target_grade), tier = VALUES(tier),
       updated_by_id = VALUES(updated_by_id), updated_by_role = VALUES(updated_by_role)`,
    [studentId, input.level, input.subject, input.examBoard, input.schoolYear, input.targetGrade, input.level === "gcse" ? input.tier : null, updatedBy.id, updatedBy.role],
  );
  return getStudentLearningProfile(studentId);
}
