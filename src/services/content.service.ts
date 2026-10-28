import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { database, hasDatabaseColumn } from "../config/database.js";

export type ContentStatus = "draft" | "published";
export type ContentInput = { subject: string; title: string; topic: string; summary: string; body: string; status: ContentStatus };
export type ContentRecord = ContentInput & { id: string; createdBy: string; createdAt: string; updatedAt: string };
type ContentRow = RowDataPacket & ContentInput & { id: string; created_by: string; created_at: Date; updated_at: Date };

export async function ensureContentSchema() {
  await database.query(`
    CREATE TABLE IF NOT EXISTS student_content (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      subject VARCHAR(100) NOT NULL,
      title VARCHAR(180) NOT NULL,
      topic VARCHAR(180) NOT NULL,
      summary VARCHAR(500) NOT NULL DEFAULT '',
      body LONGTEXT NOT NULL,
      status ENUM('draft', 'published') NOT NULL DEFAULT 'draft',
      created_by BIGINT UNSIGNED NOT NULL,
      created_by_role ENUM('teacher', 'admin') NOT NULL DEFAULT 'teacher',
      created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      KEY student_content_status_updated_index (status, updated_at),
      KEY student_content_subject_index (subject)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  if (!await hasDatabaseColumn("student_content", "created_by_role")) {
    await database.query("ALTER TABLE student_content ADD COLUMN created_by_role ENUM('teacher', 'admin') NOT NULL DEFAULT 'teacher' AFTER created_by");
  }

  const [userTables] = await database.execute<(RowDataPacket & { table_name: string })[]>(
    "SELECT TABLE_NAME AS table_name FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' LIMIT 1",
  );
  if (userTables.length) {
    await database.query(`
      UPDATE student_content content_item
      JOIN users author ON author.id = content_item.created_by
      SET content_item.created_by_role = author.role
      WHERE author.role IN ('teacher', 'admin') AND content_item.created_by_role = 'teacher'
    `);
  }

  const [foreignKeys] = await database.execute<(RowDataPacket & { constraint_name: string })[]>(
    "SELECT DISTINCT CONSTRAINT_NAME AS constraint_name FROM information_schema.KEY_COLUMN_USAGE WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'student_content' AND REFERENCED_TABLE_NAME = 'users'",
  );
  for (const { constraint_name } of foreignKeys) {
    if (/^[A-Za-z0-9_]+$/.test(constraint_name)) await database.query(`ALTER TABLE student_content DROP FOREIGN KEY \`${constraint_name}\``);
  }
}

function serialize(row: ContentRow): ContentRecord {
  return {
    id: String(row.id), subject: row.subject, title: row.title, topic: row.topic,
    summary: row.summary, body: row.body, status: row.status, createdBy: String(row.created_by),
    createdAt: new Date(row.created_at).toISOString(), updatedAt: new Date(row.updated_at).toISOString(),
  };
}

export async function listContent(input: { query?: string; status?: ContentStatus | "all" }) {
  const clauses: string[] = [];
  const values: (string | number)[] = [];
  if (input.status && input.status !== "all") { clauses.push("status = ?"); values.push(input.status); }
  if (input.query) {
    clauses.push("(title LIKE ? OR subject LIKE ? OR topic LIKE ? OR summary LIKE ?)");
    const term = `%${input.query}%`;
    values.push(term, term, term, term);
  }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const [rows] = await database.execute<ContentRow[]>(
    `SELECT id, subject, title, topic, summary, body, status, created_by, created_at, updated_at FROM student_content ${where} ORDER BY updated_at DESC LIMIT 200`,
    values,
  );
  return rows.map(serialize);
}

export async function createContent(input: ContentInput, createdBy: string, createdByRole: "teacher" | "admin") {
  const [result] = await database.execute<ResultSetHeader>(
    "INSERT INTO student_content (subject, title, topic, summary, body, status, created_by, created_by_role) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    [input.subject, input.title, input.topic, input.summary, input.body, input.status, createdBy, createdByRole],
  );
  return getContent(String(result.insertId));
}

export async function updateContent(id: string, input: ContentInput) {
  const [result] = await database.execute<ResultSetHeader>(
    "UPDATE student_content SET subject = ?, title = ?, topic = ?, summary = ?, body = ?, status = ? WHERE id = ?",
    [input.subject, input.title, input.topic, input.summary, input.body, input.status, id],
  );
  return result.affectedRows ? getContent(id) : null;
}

async function getContent(id: string) {
  const [rows] = await database.execute<ContentRow[]>(
    "SELECT id, subject, title, topic, summary, body, status, created_by, created_at, updated_at FROM student_content WHERE id = ? LIMIT 1", [id],
  );
  return rows[0] ? serialize(rows[0]) : null;
}

export async function deleteContent(id: string) {
  const [result] = await database.execute<ResultSetHeader>("DELETE FROM student_content WHERE id = ?", [id]);
  return result.affectedRows > 0;
}
