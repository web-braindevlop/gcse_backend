import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { database, hasDatabaseColumn } from "../config/database.js";

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const SCRYPT_COST = 16_384;
const SCRYPT_BLOCK_SIZE = 8;
const SCRYPT_PARALLELIZATION = 1;
const PASSWORD_KEY_LENGTH = 64;

export type UserRole = "student" | "teacher" | "admin";
export type PublicUser = { id: string; username: string; email: string; displayName: string; role: UserRole };
type UserRow = RowDataPacket & {
  id: string;
  username: string;
  email: string;
  display_name: string;
  role: "student" | "teacher";
  password_hash?: string;
};
type AdminRow = RowDataPacket & { id: string; username: string; email: string; display_name: string; password_hash?: string };
type SessionAccountRow = RowDataPacket & { id: string; username: string; email: string; display_name: string; role: "student" | "teacher" };

function deriveKey(password: string, salt: Buffer, keyLength: number, options: { N: number; r: number; p: number }) {
  return new Promise<Buffer>((resolve, reject) => {
    scryptCallback(password, salt, keyLength, options, (error, key) => {
      if (error) reject(error);
      else resolve(key as Buffer);
    });
  });
}

export async function ensureAuthSchema() {
  await database.query(`
    CREATE TABLE IF NOT EXISTS users (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      username VARCHAR(32) NOT NULL,
      email VARCHAR(254) NOT NULL,
      display_name VARCHAR(120) NOT NULL,
      role ENUM('student', 'teacher') NOT NULL DEFAULT 'student',
      password_hash VARCHAR(255) NOT NULL,
      created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      UNIQUE KEY users_username_unique (username),
      UNIQUE KEY users_email_unique (email)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  if (!await hasDatabaseColumn("users", "role")) {
    await database.query("ALTER TABLE users ADD COLUMN role ENUM('student', 'teacher', 'admin') NOT NULL DEFAULT 'student' AFTER display_name");
  }
  await database.query(`
    CREATE TABLE IF NOT EXISTS auth_sessions (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      user_id BIGINT UNSIGNED NOT NULL,
      token_hash CHAR(64) NOT NULL,
      expires_at DATETIME(3) NOT NULL,
      created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      UNIQUE KEY auth_sessions_token_hash_unique (token_hash),
      KEY auth_sessions_expires_at_index (expires_at),
      CONSTRAINT auth_sessions_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  await database.query(`
    CREATE TABLE IF NOT EXISTS admins (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      username VARCHAR(32) NOT NULL,
      email VARCHAR(254) NOT NULL,
      full_name VARCHAR(120) NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      UNIQUE KEY admins_username_unique (username),
      UNIQUE KEY admins_email_unique (email)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  const [legacyAdminNameColumn] = await database.execute<(RowDataPacket & { column_name: string })[]>(
    "SELECT COLUMN_NAME AS column_name FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'admins' AND COLUMN_NAME = 'display_name' LIMIT 1",
  );
  if (legacyAdminNameColumn.length) {
    if (!await hasDatabaseColumn("admins", "full_name")) {
      await database.query("ALTER TABLE admins ADD COLUMN full_name VARCHAR(120) NULL AFTER email");
    }
    await database.query("UPDATE admins SET full_name = display_name WHERE (full_name IS NULL OR full_name = '') AND display_name <> ''");
    await database.query("ALTER TABLE admins MODIFY full_name VARCHAR(120) NOT NULL");
    await database.query("ALTER TABLE admins DROP COLUMN display_name");
  }
  await database.query(`
    CREATE TABLE IF NOT EXISTS admin_sessions (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      admin_id BIGINT UNSIGNED NOT NULL,
      token_hash CHAR(64) NOT NULL,
      expires_at DATETIME(3) NOT NULL,
      created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      UNIQUE KEY admin_sessions_token_hash_unique (token_hash),
      KEY admin_sessions_expires_at_index (expires_at),
      CONSTRAINT admin_sessions_admin_fk FOREIGN KEY (admin_id) REFERENCES admins(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  // Move legacy admin accounts and their active sessions without changing IDs or credentials.
  await database.query(`
    INSERT INTO admins (id, username, email, full_name, password_hash, created_at, updated_at)
    SELECT id, username, email, display_name, password_hash, created_at, updated_at
    FROM users WHERE role = 'admin'
    ON DUPLICATE KEY UPDATE username = VALUES(username), email = VALUES(email), full_name = VALUES(full_name), password_hash = VALUES(password_hash)
  `);
  await database.query(`
    INSERT INTO admin_sessions (admin_id, token_hash, expires_at, created_at)
    SELECT u.id, s.token_hash, s.expires_at, s.created_at
    FROM auth_sessions s JOIN users u ON u.id = s.user_id
    WHERE u.role = 'admin'
    ON DUPLICATE KEY UPDATE admin_id = VALUES(admin_id), expires_at = VALUES(expires_at)
  `);
  await database.query("DELETE s FROM auth_sessions s JOIN users u ON u.id = s.user_id WHERE u.role = 'admin'");
  await database.query("DELETE FROM users WHERE role = 'admin'");
  await database.query("ALTER TABLE users MODIFY role ENUM('student', 'teacher') NOT NULL DEFAULT 'student'");
}

export async function hashPassword(password: string) {
  const salt = randomBytes(16);
  const key = await deriveKey(password, salt, PASSWORD_KEY_LENGTH, {
    N: SCRYPT_COST,
    r: SCRYPT_BLOCK_SIZE,
    p: SCRYPT_PARALLELIZATION,
  });
  return `scrypt$${SCRYPT_COST}$${SCRYPT_BLOCK_SIZE}$${SCRYPT_PARALLELIZATION}$${salt.toString("base64url")}$${key.toString("base64url")}`;
}

export async function verifyPassword(password: string, encoded: string) {
  const [algorithm, n, r, p, saltText, keyText] = encoded.split("$");
  if (algorithm !== "scrypt" || !n || !r || !p || !saltText || !keyText) return false;
  const cost = Number(n);
  const blockSize = Number(r);
  const parallelization = Number(p);
  const expected = Buffer.from(keyText, "base64url");
  if (cost !== SCRYPT_COST || blockSize !== SCRYPT_BLOCK_SIZE || parallelization !== SCRYPT_PARALLELIZATION || expected.length !== PASSWORD_KEY_LENGTH) return false;
  const actual = await deriveKey(password, Buffer.from(saltText, "base64url"), expected.length, { N: cost, r: blockSize, p: parallelization });
  return timingSafeEqual(actual, expected);
}

function digestToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function toPublicUser(row: SessionAccountRow | (AdminRow & { role: "admin" })): PublicUser {
  return { id: row.id, username: row.username, email: row.email, displayName: row.display_name, role: row.role };
}

export async function createUserSession(userId: string, role: UserRole) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  const hash = digestToken(token);
  if (role === "admin") {
    await database.execute("DELETE FROM admin_sessions WHERE expires_at <= CURRENT_TIMESTAMP(3)");
    await database.execute("INSERT INTO admin_sessions (admin_id, token_hash, expires_at) VALUES (?, ?, ?)", [userId, hash, expiresAt]);
  } else {
    await database.execute("DELETE FROM auth_sessions WHERE expires_at <= CURRENT_TIMESTAMP(3)");
    await database.execute("INSERT INTO auth_sessions (user_id, token_hash, expires_at) VALUES (?, ?, ?)", [userId, hash, expiresAt]);
  }
  return { token, maxAge: SESSION_TTL_MS };
}

export async function findUserByIdentifier(identifier: string, audience: "student" | "staff") {
  const value = identifier.trim().toLowerCase();
  if (audience === "staff") {
    const [adminRows] = await database.execute<AdminRow[]>(
      "SELECT id, username, email, full_name AS display_name, password_hash FROM admins WHERE email = ? OR username = ? LIMIT 1",
      [value, value],
    );
    if (adminRows[0]) return { ...adminRows[0], role: "admin" as const };
  }
  const [rows] = await database.execute<UserRow[]>(
    `SELECT id, username, email, display_name, role, password_hash FROM users
     WHERE (email = ? OR username = ?) AND role = '${audience === "student" ? "student" : "teacher"}' LIMIT 1`,
    [value, value],
  );
  return rows[0] ?? null;
}

export async function findUserBySession(token: string): Promise<PublicUser | null> {
  const hash = digestToken(token);
  const [adminRows] = await database.execute<AdminRow[]>(
    `SELECT a.id, a.username, a.email, a.full_name AS display_name
     FROM admin_sessions s JOIN admins a ON a.id = s.admin_id
     WHERE s.token_hash = ? AND s.expires_at > CURRENT_TIMESTAMP(3) LIMIT 1`, [hash],
  );
  if (adminRows[0]) return toPublicUser({ ...adminRows[0], role: "admin" });
  const [rows] = await database.execute<UserRow[]>(
    `SELECT u.id, u.username, u.email, u.display_name, u.role
     FROM auth_sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = ? AND s.expires_at > CURRENT_TIMESTAMP(3) LIMIT 1`,
    [hash],
  );
  return rows[0] ? toPublicUser(rows[0]) : null;
}

export async function findUserBySessions(tokens: readonly string[]): Promise<PublicUser | null> {
  for (const token of new Set(tokens.filter(Boolean))) {
    const user = await findUserBySession(token);
    if (user) return user;
  }
  return null;
}

export async function deleteUserSession(token: string) {
  const hash = digestToken(token);
  await Promise.all([
    database.execute("DELETE FROM auth_sessions WHERE token_hash = ?", [hash]),
    database.execute("DELETE FROM admin_sessions WHERE token_hash = ?", [hash]),
  ]);
}

export async function createUser(input: { username: string; email: string; displayName: string; passwordHash: string; role: "student" | "teacher" }) {
  const [result] = await database.execute<ResultSetHeader>(
    "INSERT INTO users (username, email, display_name, password_hash, role) VALUES (?, ?, ?, ?, ?)",
    [input.username, input.email, input.displayName, input.passwordHash, input.role],
  );
  return String(result.insertId);
}
