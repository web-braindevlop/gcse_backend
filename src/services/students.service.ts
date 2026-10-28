import type { RowDataPacket } from "mysql2";
import { database } from "../config/database.js";

export type StudentRecord = { id: string; username: string; email: string; displayName: string; joinedAt: string };
type StudentRow = RowDataPacket & { id: string; username: string; email: string; display_name: string; created_at: Date };

function serialize(row: StudentRow): StudentRecord {
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
      `SELECT id, username, email, display_name, created_at FROM users ${where} ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`,
      [...values, input.pageSize, (input.page - 1) * input.pageSize],
    ),
  ]);
  return { items: studentRows.map(serialize), total: Number(countRows[0]?.total ?? 0), page: input.page, pageSize: input.pageSize };
}
