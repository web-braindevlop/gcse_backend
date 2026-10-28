import mysql from "mysql2/promise";
import type { RowDataPacket } from "mysql2";
import { env } from "./env.js";

export const database = mysql.createPool({
  host: env.MYSQL_HOST ?? "127.0.0.1",
  port: env.MYSQL_PORT,
  user: env.MYSQL_USER ?? "root",
  password: env.MYSQL_PASSWORD ?? "",
  database: env.MYSQL_DATABASE ?? "educ",
  waitForConnections: true,
  connectionLimit: 10,
  maxIdle: 5,
  idleTimeout: 60_000,
  queueLimit: 0,
  enableKeepAlive: true,
});

export async function hasDatabaseColumn(tableName: string, columnName: string) {
  const [rows] = await database.execute<RowDataPacket[]>(
    `SELECT 1 FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ? LIMIT 1`,
    [tableName, columnName],
  );
  return rows.length > 0;
}
