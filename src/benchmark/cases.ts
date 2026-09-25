import { readCases } from "./read-cases";
import { writeCases } from "./write-cases";
import { assertEqual, checkInserted, consume, dropTable, emptyTable, expectedChecksum, INSERT, populatedTable, SELECT, values } from "./fixtures";
import type { Case, CaseRun, LibraryId } from "./types";

type StaticCase = CaseRun & { id: string; label: string; libraries: LibraryId[] };

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

export const cases: Case[] = [
  ...[syncInsert, asyncInsert, transactionInsert, fullRead, hostCreation, hostFullRead].map(
    ({ id, label, libraries, ...hooks }) => ({ id, label, libraries, create: () => ({ ...hooks }) }),
  ),
  ...readCases,
  ...writeCases,
];
