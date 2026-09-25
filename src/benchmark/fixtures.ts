import type { Connection, QueryResult, Row } from "./types";

export const CREATE = "CREATE TABLE bench (id INTEGER PRIMARY KEY, name TEXT, value REAL)";
export const INSERT = "INSERT INTO bench VALUES (?,?,?)";
export const SELECT = "SELECT id, name, value FROM bench ORDER BY id";

export async function emptyTable(db: Connection): Promise<void> {
  db.executeSync("DROP TABLE IF EXISTS bench");
  db.executeSync(CREATE);
}

export async function populatedTable(db: Connection, count: number): Promise<void> {
  await emptyTable(db);
  for (let i = 0; i < count; i++) db.executeSync(INSERT, values(i));
  await checkRows(db, count);
}

export async function dropTable(db: Connection): Promise<void> {
  db.executeSync("DROP TABLE IF EXISTS bench");
}

export async function checkInserted(db: Connection, count: number, affected: number): Promise<void> {
  assertEqual(affected, count, "affected rows");
  await checkRows(db, count);
}

export async function checkRows(db: Connection, count: number): Promise<void> {
  assertEqual(consume(db.executeSync(SELECT), count), expectedChecksum(count), "stored rows");
}

export function consume(result: QueryResult, count: number): number {
  assertEqual(result.rows.length, count, "returned rows");
  let checksum = 0;
  for (let i = 0; i < result.rows.length; i++) checksum += rowChecksum(result.rows[i], i);
  return checksum;
}

function rowChecksum(row: Row, index: number): number {
  const { id, name, value } = row;
  if (id !== index || name !== `n${index}` || value !== index * 1.5) {
    throw new Error(`Wrong row at index ${index}`);
  }
  return id + value + name.length;
}

export function expectedChecksum(count: number): number {
  let checksum = 0;
  for (let i = 0; i < count; i++) checksum += i + i * 1.5 + `n${i}`.length;
  return checksum;
}

export function values(index: number): [number, string, number] {
  return [index, `n${index}`, index * 1.5];
}

export function assertEqual(actual: number, expected: number, label: string): void {
  if (actual !== expected) throw new Error(`${label}: expected ${expected}, got ${actual}`);
}
