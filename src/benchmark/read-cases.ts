import { assertEqual, consume, dropTable, expectedChecksum, populatedTable, values } from "./fixtures";
import type { Case, Prepared, QueryResult, SqlValue } from "./types";

type ReadShape = "full" | "point";
type Dispatch = "sync" | "async";

const FULL = "SELECT id, name, value FROM bench WHERE id >= ? ORDER BY id";
const POINT = "SELECT id, name, value FROM bench WHERE id = ?";
const libraries: Case["libraries"] = ["op-sqlite", "nitro-sqlite", "expo-sqlite"];

export const readCases: Case[] = (["full", "point"] as const).flatMap((shape) =>
  (["sync", "async"] as const).flatMap((dispatch) => [
    makeReadCase(shape, dispatch, false),
    makeReadCase(shape, dispatch, true),
  ]),
);

function makeReadCase(shape: ReadShape, dispatch: Dispatch, prepared: boolean): Case {
  const sql = shape === "full" ? FULL : POINT;
  const id = `${prepared ? "prepared" : "ordinary"}-${dispatch}-${shape}-read`;
  return {
    id,
    label: `${prepared ? "prepared" : "ordinary"} ${dispatch} ${shape === "full" ? "full row" : "indexed point"} read`,
    libraries,
    create: () => {
      let statement: Prepared | undefined;
      let parameters: SqlValue[][] = [];
      return {
        setup: async (db, count) => {
          await populatedTable(db, count);
          parameters = Array.from({ length: count }, (_, index) => [shape === "full" ? 0 : index]);
          if (prepared) statement = db.prepare(sql, "read");
        },
        run: async (db, count) => {
          let checksum = 0;
          for (let index = 0; index < parameters.length; index++) {
            const params = parameters[index];
            const result = dispatch === "sync"
              ? statement ? statement.executeSync(params) : db.executeSync(sql, params)
              : statement ? await statement.executeAsync(params) : await db.executeAsync(sql, params);
            checksum += shape === "full" ? consume(result, count) : consumePoint(result, index);
          }
          return checksum;
        },
        check: async (_db, count, checksum) => {
          const expected = expectedChecksum(count) * (shape === "full" ? count : 1);
          assertEqual(checksum, expected, "read checksum");
        },
        teardown: async (db) => {
          try { statement?.dispose(); }
          finally { await dropTable(db); }
        },
      };
    },
  };
}

function consumePoint(result: QueryResult, index: number): number {
  assertEqual(result.rows.length, 1, "point row count");
  const row = result.rows[0];
  const [id, name, value] = values(index);
  if (row.id !== id || row.name !== name || row.value !== value) {
    throw new Error(`Wrong point row for id ${index}`);
  }
  return id + value + name.length;
}
