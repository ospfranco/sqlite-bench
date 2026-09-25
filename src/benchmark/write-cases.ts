import { assertEqual, checkInserted, dropTable, emptyTable, INSERT, values } from "./fixtures";
import type { Case, Connection, Prepared, SqlValue } from "./types";

type Dispatch = "sync" | "async";
const libraries: Case["libraries"] = ["op-sqlite", "nitro-sqlite", "expo-sqlite"];

function makeTransactionInsertCase(dispatch: Dispatch, prepared: boolean): Case {
  return {
    id: `${prepared ? "prepared" : "ordinary"}-${dispatch}-manual-transaction-insert`,
    label: `${prepared ? "prepared" : "ordinary"} ${dispatch} insert in explicit transaction`,
    libraries,
    create: () => {
      let statement: Prepared | undefined;
      let parameters: SqlValue[][] = [];
      return {
        setup: async (db, count) => {
          await emptyTable(db);
          parameters = Array.from({ length: count }, (_, index) => values(index));
          if (prepared) statement = db.prepare(INSERT, "write");
        },
        run: (db) => dispatch === "sync"
          ? runSyncTransaction(db, parameters, statement)
          : runAsyncTransaction(db, parameters, statement),
        check: checkInserted,
        teardown: async (db) => {
          try { statement?.dispose(); }
          finally { await dropTable(db); }
        },
      };
    },
  };
}

const batchInsert: Case = {
  id: "native-async-batch-insert",
  label: "native async batch insert (one transaction)",
  libraries: ["op-sqlite", "nitro-sqlite"],
  unsupported: { "expo-sqlite": "No native parameter batch API" },
  create: () => {
    let parameters: SqlValue[][] = [];
    return {
      setup: async (db, count) => {
        await emptyTable(db);
        parameters = Array.from({ length: count }, (_, index) => values(index));
      },
      run: async (db, count) => {
        if (!db.batchAsync) throw new Error("Native batch API unsupported");
        const affected = await db.batchAsync(INSERT, parameters);
        if (affected !== undefined) assertEqual(affected, count, "batch affected rows");
        return count;
      },
      check: checkInserted,
      teardown: dropTable,
    };
  },
};

export const writeCases: Case[] = [
  makeTransactionInsertCase("sync", false),
  makeTransactionInsertCase("sync", true),
  makeTransactionInsertCase("async", false),
  makeTransactionInsertCase("async", true),
  batchInsert,
];

async function runSyncTransaction(db: Connection, parameters: SqlValue[][], statement?: Prepared): Promise<number> {
  db.executeSync("BEGIN");
  try {
    let affected = 0;
    for (const params of parameters) {
      affected += (statement ? statement.executeSync(params) : db.executeSync(INSERT, params)).rowsAffected;
    }
    db.executeSync("COMMIT");
    return affected;
  } catch (error) {
    try { db.executeSync("ROLLBACK"); }
    catch { /* Preserve the operation failure if SQLite already rolled back. */ }
    throw error;
  }
}

async function runAsyncTransaction(db: Connection, parameters: SqlValue[][], statement?: Prepared): Promise<number> {
  await db.executeAsync("BEGIN");
  try {
    let affected = 0;
    for (const params of parameters) {
      affected += (statement ? await statement.executeAsync(params) : await db.executeAsync(INSERT, params)).rowsAffected;
    }
    await db.executeAsync("COMMIT");
    return affected;
  } catch (error) {
    try { await db.executeAsync("ROLLBACK"); }
    catch { /* Preserve the operation failure if SQLite already rolled back. */ }
    throw error;
  }
}
