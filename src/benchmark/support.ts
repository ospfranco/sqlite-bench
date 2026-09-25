import type { Mode } from "./metadata";
import type { LibraryId } from "./types";

export function unsupportedReason(mode: Mode, library: LibraryId, caseId: string): string | null {
  if (mode === "normalized WAL/FULL" && library === "expo-sqlite" && caseId === "transaction-insert") {
    return "Expo's exclusive callback creates a new connection and begins the transaction before the callback. Its connection-local PRAGMAs cannot be set and verified outside the timer.";
  }
  return null;
}
