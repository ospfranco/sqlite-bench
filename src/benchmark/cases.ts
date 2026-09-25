import type { Case, CaseRun, Connection, LibraryId, QueryResult, Row } from "./types";

type StaticCase = CaseRun & { id: string; label: string; libraries: LibraryId[] };

export const CREATE = "CREATE TABLE bench (id INTEGER PRIMARY KEY, name TEXT, value REAL)";
export const INSERT = "INSERT INTO bench VALUES (?,?,?)";
export const SELECT = "SELECT id, name, value FROM bench ORDER BY id";

const syncInsert: StaticCase = {
  id: "sync-insert", label: "sync insert", libraries: ["op-sqlite", "nitro-sqlite", "expo-sqlite"],
  setup: emptyTable, run: async (db, count) => {
    let affected = 0;
    for (let i = 0; i < count; i++) affected += db.executeSync(INSERT, values(i)).rowsAffected;
    return affected;
  },
  check: checkInserted, teardown: dropTable,
};

const asyncInsert: StaticCase = {
  id: "async-insert", label: "async insert", libraries: syncInsert.libraries,
  setup: emptyTable, run: async (db, count) => {
    let affected = 0;
    for (let i = 0; i < count; i++) affected += (await db.executeAsync(INSERT, values(i))).rowsAffected;
    return affected;
  },
  check: checkInserted, teardown: dropTable,
};

const transactionInsert: StaticCase = {
  id: "transaction-insert", label: "transaction insert", libraries: syncInsert.libraries,
  setup: emptyTable, run: async (db, count) => {
    let affected = 0;
    await db.transaction(async (tx) => {
      for (let i = 0; i < count; i++) affected += (await tx.executeAsync(INSERT, values(i))).rowsAffected;
    });
    return affected;
  },
  check: checkInserted, teardown: dropTable,
};

const fullRead: StaticCase = {
  id: "full-read", label: "full row read", libraries: syncInsert.libraries,
  setup: populatedTable, run: async (db, count) => {
    let checksum = 0;
    for (let i = 0; i < count; i++) checksum += consume(await db.executeAsync(SELECT), count);
    return checksum;
  },
  check: async (_db, count, checksum) => assertEqual(checksum, expectedChecksum(count) * count, "read checksum"),
  teardown: dropTable,
};

const hostCreation: StaticCase = {
  id: "host-creation", label: "HostObjects creation only", libraries: ["op-sqlite"],
  setup: populatedTable, run: async (db, count) => {
    if (!db.executeHostObjects) throw new Error("HostObjects unavailable");
    let rows = 0;
    for (let i = 0; i < count; i++) rows += (await db.executeHostObjects(SELECT)).rows.length;
    return rows;
  },
  check: async (_db, count, rows) => assertEqual(rows, count * count, "HostObjects row count"),
  teardown: dropTable,
};

const hostFullRead: StaticCase = {
  id: "host-full-read", label: "HostObjects full row read", libraries: ["op-sqlite"],
  setup: populatedTable, run: async (db, count) => {
    if (!db.executeHostObjects) throw new Error("HostObjects unavailable");
    let checksum = 0;
    for (let i = 0; i < count; i++) checksum += consume(await db.executeHostObjects(SELECT), count);
    return checksum;
  },
  check: fullRead.check, teardown: dropTable,
};

export const cases: Case[] = [syncInsert, asyncInsert, transactionInsert, fullRead, hostCreation, hostFullRead].map(
  ({ id, label, libraries, ...hooks }) => ({ id, label, libraries, create: () => ({ ...hooks }) }),
);

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
