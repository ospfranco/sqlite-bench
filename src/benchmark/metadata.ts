import Constants from "expo-constants";
import * as Device from "expo-device";
import { Platform } from "react-native";
import reactNativePackage from "react-native/package.json";
import nitroModulesPackage from "react-native-nitro-modules/package.json";
import type { Adapter, Connection, LibraryId, Row } from "./types";

export type Mode = "library defaults" | "normalized WAL/FULL";

export type EngineMetadata = {
  library: LibraryId;
  packageVersion: string;
  sqliteVersion: string;
  sourceId: string;
  compileOptions: string[];
  pragmas: Record<string, unknown>;
};

export type Manifest = {
  createdAt: string;
  appVersion: string | null;
  reactNativeVersion: string;
  nitroModulesVersion: string;
  jsEngine: "Hermes" | "other";
  buildMode: "development" | "release";
  device: { platform: string; model: string | null; osVersion: string | null; isPhysicalDevice: boolean | null };
  mode: Mode;
  iterations: number;
  readRepetitions: number;
  warmupRounds: number;
  measuredRounds: number;
  cooldownMs: number;
  engines: EngineMetadata[];
  warnings: string[];
};

export async function makeManifest(adapters: Adapter[], settings: { iterations: number; warmupRounds: number; measuredRounds: number; cooldownMs: number; mode: Mode }): Promise<Manifest> {
  const engines: EngineMetadata[] = [];
  const warnings: string[] = [];
  for (const adapter of adapters) {
    const db = adapter.open(databaseName(adapter.id, settings.mode));
    try {
      configure(db, settings.mode);
      engines.push(inspect(adapter, db));
    } catch (error) {
      warnings.push(`${adapter.label}: SQLite metadata unavailable (${message(error)})`);
    } finally {
      db.close();
    }
  }
  for (let i = 0; i < engines.length; i++) {
    for (let j = i + 1; j < engines.length; j++) {
      if (engines[i].sourceId !== "unknown" && engines[i].sourceId === engines[j].sourceId) {
        warnings.push(`${engines[i].library} and ${engines[j].library} report the same SQLite source ID. This does not establish independent engine builds.`);
        if (engines[i].sqliteVersion !== engines[j].sqliteVersion) {
          warnings.push(`${engines[i].library} and ${engines[j].library} report the same source ID but different SQLite versions; check the native builds.`);
        }
      }
      if (engines[i].sqliteVersion !== "unknown" && engines[i].sqliteVersion === engines[j].sqliteVersion && engines[i].sourceId !== "unknown" && engines[j].sourceId !== "unknown" && engines[i].sourceId !== engines[j].sourceId) {
        warnings.push(`${engines[i].library} and ${engines[j].library} report the same SQLite version but different source IDs.`);
      }
    }
  }
  if (engines.length !== adapters.length) warnings.push("Some engine metadata is missing; compare results with caution.");
  if (settings.mode === "library defaults") warnings.push("Libraries retain their default SQLite settings; the recorded PRAGMAs may differ.");
  return {
    createdAt: new Date().toISOString(), appVersion: Constants.expoConfig?.version ?? null,
    reactNativeVersion: reactNativePackage.version, nitroModulesVersion: nitroModulesPackage.version,
    jsEngine: "HermesInternal" in globalThis ? "Hermes" : "other",
    buildMode: __DEV__ ? "development" : "release",
    device: { platform: Platform.OS, model: Device.modelName, osVersion: Device.osVersion, isPhysicalDevice: Device.isDevice },
    ...settings, readRepetitions: settings.iterations, engines, warnings,
  };
}

export function configure(db: Connection, mode: Mode): void {
  if (mode === "library defaults") return;
  for (const [name, value] of [["journal_mode", "WAL"], ["synchronous", "FULL"], ["cache_size", "-2000"], ["temp_store", "MEMORY"]]) {
    db.executeSync(`PRAGMA ${name}=${value}`);
  }
  const expected: Record<string, string> = { journal_mode: "wal", synchronous: "2", cache_size: "-2000", temp_store: "2" };
  for (const [name, value] of Object.entries(expected)) {
    const actual = Object.values(first(db.executeSync(`PRAGMA ${name}`).rows))[0];
    if (String(actual).toLowerCase() !== value) throw new Error(`${name}: expected ${value}, got ${String(actual)}`);
  }
}

export function databaseName(library: LibraryId, mode: Mode): string {
  return `${library.replace(/-/g, "_")}_${mode === "library defaults" ? "defaults" : "normalized"}.db`;
}

export function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function inspect(adapter: Adapter, db: Connection): EngineMetadata {
  const identity = first(db.executeSync("SELECT sqlite_version() AS version, sqlite_source_id() AS source_id").rows);
  const sqliteVersion = String(identity.version ?? "unknown");
  const sourceId = String(identity.source_id ?? "unknown");
  const compileOptions = db.executeSync("PRAGMA compile_options").rows.map((row) => String(Object.values(row)[0]));
  const pragmas: Record<string, unknown> = {};
  for (const name of ["journal_mode", "synchronous", "temp_store", "cache_size", "foreign_keys", "locking_mode"]) {
    pragmas[name] = Object.values(first(db.executeSync(`PRAGMA ${name}`).rows))[0] ?? null;
  }
  return { library: adapter.id, packageVersion: adapter.version, sqliteVersion, sourceId, compileOptions, pragmas };
}

function first(rows: Row[]): Row {
  if (!rows[0]) throw new Error("SQLite metadata query returned no rows");
  return rows[0];
}
