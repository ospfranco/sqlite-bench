import { useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, Share, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { adapters } from "../benchmark/adapters";
import { cases } from "../benchmark/cases";
import type { Mode } from "../benchmark/metadata";
import { runBenchmarks, settings } from "../benchmark/runner";

type Run = Awaited<ReturnType<typeof runBenchmarks>>;

export default function HomeScreen() {
  const [run, setRun] = useState<Run | null>(null);
  const [status, setStatus] = useState("Starting…");
  const [running, setRunning] = useState(true);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    start("library defaults");
  }, []);

  function start(mode: Mode): void {
    setRun(null);
    setRunning(true);
    setStatus("Starting…");
    runBenchmarks(setStatus, { ...settings, mode }).then((result) => {
      setRun(result);
      setStatus(result.failures.length ? `${result.failures.length} workload failures` : result.skipped.length ? `Done · ${result.skipped.length} unsupported workload` : "Done");
    }).catch((error: unknown) => {
      setStatus(`Run failed: ${error instanceof Error ? error.message : String(error)}`);
    }).finally(() => setRunning(false));
  }

  const maxMs = Math.max(1, ...(run?.summaries.map((summary) => summary.medianMs) ?? []));
  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.heading}>SQLite Benchmark</Text>
      <Text style={styles.sub}>{settings.iterations} rows · {settings.warmupRounds} warmup · {settings.measuredRounds} measured rounds · {settings.cooldownMs} ms cooldown</Text>
      <Text style={styles.sub}>{settings.iterations} full-read queries per case. The original screen used 1,000 rows and queries; these results are a new workload.</Text>
      <Text style={styles.status}>{status}</Text>
      {!running && <View style={styles.actions}>
        <Pressable onPress={() => start("library defaults")} style={styles.share}><Text style={styles.shareText}>Run defaults</Text></Pressable>
        <Pressable onPress={() => start("normalized WAL/FULL")} style={styles.share}><Text style={styles.shareText}>Run normalized</Text></Pressable>
      </View>}
      <ScrollView style={styles.scroll} contentContainerStyle={styles.list}>
        {run && <>
          <Text style={styles.sub}>Mode: {run.manifest.mode} · {run.manifest.buildMode} · {run.manifest.device.platform} {run.manifest.device.osVersion}</Text>
          {run.manifest.warnings.map((warning) => <Text key={warning} style={styles.warning}>{warning}</Text>)}
          {cases.map((benchmarkCase) => {
            const summaries = run.summaries.filter((summary) => summary.caseId === benchmarkCase.id);
            const failures = run.failures.filter((failure) => failure.caseId === benchmarkCase.id);
            const skipped = run.skipped.filter((entry) => entry.caseId === benchmarkCase.id);
            return <View key={benchmarkCase.id} style={styles.section}>
              <Text style={styles.sectionTitle}>{benchmarkCase.label}</Text>
              {summaries.map((summary) => {
                const adapter = adapters.find((item) => item.id === summary.library);
                const color = adapter?.color ?? "#ddd";
                return <View key={summary.library} style={styles.barRow}>
                  <View style={styles.barMeta}>
                    <Text style={[styles.label, { color }]}>{adapter?.label ?? summary.library}</Text>
                    <Text style={[styles.ms, { color }]}>{summary.medianMs.toFixed(1)} ms median</Text>
                  </View>
                  <View style={styles.barTrack}><View style={[styles.barFill, { width: `${summary.medianMs / maxMs * 100}%`, backgroundColor: color }]} /></View>
                  <Text style={styles.detail}>Samples: {summary.samples.map((ms) => ms.toFixed(1)).join(", ")} ms · range {summary.minMs.toFixed(1)}–{summary.maxMs.toFixed(1)} ms</Text>
                </View>;
              })}
              {failures.map((failure) => <Text key={`${failure.library}-${failure.round}`} style={styles.warning}>{failure.library} round {failure.round}: {failure.message}</Text>)}
              {skipped.map((entry) => <Text key={`${entry.library}-skipped`} style={styles.warning}>{entry.library} omitted: {entry.reason}</Text>)}
            </View>;
          })}
          <Pressable onPress={() => void Share.share({ message: JSON.stringify(run, null, 2) })} style={styles.share}><Text style={styles.shareText}>Share run data and manifest</Text></Pressable>
          <Text style={styles.footnote}>HostObjects creation measures result creation and row count only. Full row read checks every id, name, and value. Normalized mode uses WAL, synchronous FULL, 2 MiB cache, and memory temp storage. Matching SQLite source IDs do not prove separate engine builds.</Text>
        </>}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0f0f0f", paddingHorizontal: 16 },
  heading: { fontSize: 22, fontWeight: "700", color: "#fff", marginTop: 16 },
  sub: { fontSize: 13, color: "#aaa", marginBottom: 4 },
  status: { fontSize: 14, color: "#f0a500", marginBottom: 12 },
  scroll: { flex: 1 }, list: { gap: 16, paddingBottom: 40 }, section: { gap: 8 },
  sectionTitle: { color: "white", fontSize: 15, fontWeight: "700", borderLeftWidth: 3, borderColor: "#777", paddingLeft: 10 },
  barRow: { gap: 4 }, barMeta: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" },
  label: { color: "#ddd", fontSize: 12, flexShrink: 1, marginRight: 8 },
  ms: { fontSize: 12, fontWeight: "600", flexShrink: 0 },
  barTrack: { height: 10, backgroundColor: "#1c1c1e", borderRadius: 5, overflow: "hidden" },
  barFill: { height: "100%", borderRadius: 5 }, detail: { color: "#999", fontSize: 11 },
  warning: { color: "#f0a500", fontSize: 12, lineHeight: 18 },
  actions: { flexDirection: "row", gap: 8, marginBottom: 8 },
  share: { borderColor: "#777", borderWidth: 1, borderRadius: 8, padding: 12, alignItems: "center" },
  shareText: { color: "white", fontSize: 13 },
  footnote: { fontSize: 11, color: "#888", lineHeight: 16, paddingTop: 8 },
});
