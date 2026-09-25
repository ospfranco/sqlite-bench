import { open as opOpen } from "@op-engineering/op-sqlite";
import { openDatabaseSync } from "expo-sqlite";
import { open as nitroOpen } from "react-native-nitro-sqlite";
import opPackage from "@op-engineering/op-sqlite/package.json";
import nitroPackage from "../../node_modules/react-native-nitro-sqlite/package.json";
import expoPackage from "expo-sqlite/package.json";
import type { Adapter, Connection, QueryResult, Row, SqlValue } from "./types";

const op: Adapter = {
  id: "op-sqlite", label: "op-sqlite", color: "#f97316",
  version: opPackage.version,
  open: (name): Connection => {
    const db = opOpen({ name });
    return {
      executeSync: (sql, params) => normalize(db.executeSync(sql, params)),
      executeAsync: async (sql, params) => normalize(await db.execute(sql, params)),
      transaction: async (callback) => db.transaction(async (tx) => callback({
        executeAsync: async (sql, params) => normalize(await tx.execute(sql, params)),
      })),
      executeHostObjects: async (sql) => normalize(await db.executeWithHostObjects(sql)),
      close: () => db.close(),
    };
  },
};

const nitro: Adapter = {
  id: "nitro-sqlite", label: "nitro-sqlite", color: "#a78bfa",
  version: nitroPackage.version,
  open: (name): Connection => {
    const db = nitroOpen({ name });
    return {
      executeSync: (sql, params) => nitroResult(db.execute(sql, params)),
      executeAsync: async (sql, params) => nitroResult(await db.executeAsync(sql, params)),
      transaction: async (callback) => db.transaction(async (tx) => callback({
        executeAsync: async (sql, params) => nitroResult(await tx.executeAsync(sql, params)),
      })),
      close: () => db.close(),
    };
  },
};

const expo: Adapter = {
  id: "expo-sqlite", label: "expo-sqlite", color: "#34d399",
  version: expoPackage.version,
  open: (name): Connection => {
    const db = openDatabaseSync(name);
    return {
      executeSync: (sql, params) => expoSync(db, sql, params),
      executeAsync: (sql, params) => expoAsync(db, sql, params),
      transaction: async (callback) => db.withExclusiveTransactionAsync(async (tx) => callback({
        executeAsync: async (sql, params) => expoAsync(tx, sql, params),
      })),
      close: () => db.closeSync(),
    };
  },
};

export const adapters: Adapter[] = [op, nitro, expo];

function normalize(result: { rows: Row[]; rowsAffected: number }): QueryResult {
  return { rows: result.rows, rowsAffected: result.rowsAffected };
}

function nitroResult(result: ReturnType<ReturnType<typeof nitroOpen>["execute"]>): QueryResult {
  return { rows: dbRows(result), rowsAffected: result.rowsAffected };
}

function dbRows(result: ReturnType<ReturnType<typeof nitroOpen>["execute"]>): Row[] {
  return result.rows._array;
}

function expoSync(db: ReturnType<typeof openDatabaseSync>, sql: string, params: SqlValue[] = []): QueryResult {
  if (sql.trimStart().toUpperCase().startsWith("SELECT") || sql.trimStart().toUpperCase().startsWith("PRAGMA")) {
    return { rows: db.getAllSync<Row>(sql, params), rowsAffected: 0 };
  }
  const result = db.runSync(sql, params);
  return { rows: [], rowsAffected: result.changes };
}

async function expoAsync(db: Pick<ReturnType<typeof openDatabaseSync>, "getAllAsync" | "runAsync">, sql: string, params: SqlValue[] = []): Promise<QueryResult> {
  if (sql.trimStart().toUpperCase().startsWith("SELECT") || sql.trimStart().toUpperCase().startsWith("PRAGMA")) {
    return { rows: await db.getAllAsync<Row>(sql, params), rowsAffected: 0 };
  }
  const result = await db.runAsync(sql, params);
  return { rows: [], rowsAffected: result.changes };
}
