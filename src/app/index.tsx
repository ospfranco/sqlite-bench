import { open as opSQLiteOpen } from '@op-engineering/op-sqlite';
import { openDatabaseSync } from 'expo-sqlite';
import { useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { open as nitroOpen } from 'react-native-nitro-sqlite';
import { SafeAreaView } from 'react-native-safe-area-context';

const ITERATIONS = 1000;
const COOL_DOWN_MS = 2500;

type BenchResult = { label: string; ms: number };
type BenchSection = { title: string; color: string; results: BenchResult[] };

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

async function cooldown() {
  // hint at GC by creating and dropping a large allocation
  let _sink: number[] | null = new Array(500_000).fill(0);
  _sink = null;
  await sleep(COOL_DOWN_MS);
}

// ── op-sqlite ─────────────────────────────────────────────────────────────────

async function benchOpSQLite(): Promise<BenchResult[]> {
  const results: BenchResult[] = [];
  const db = opSQLiteOpen({ name: 'op_bench.db' });

  db.executeSync('DROP TABLE IF EXISTS bench');
  db.executeSync(
    'CREATE TABLE bench (id INTEGER PRIMARY KEY, name TEXT, value REAL)',
  );

  // sync inserts
  let t = performance.now();
  for (let i = 0; i < ITERATIONS; i++) {
    db.executeSync('INSERT INTO bench VALUES (?,?,?)', [i, `n${i}`, i * 1.5]);
  }
  results.push({ label: 'op-sqlite · sync insert 1k', ms: performance.now() - t });

  db.executeSync('DELETE FROM bench');
  await cooldown();

  // async inserts
  t = performance.now();
  for (let i = 0; i < ITERATIONS; i++) {
    await db.execute('INSERT INTO bench VALUES (?,?,?)', [i, `n${i}`, i * 1.5]);
  }
  results.push({ label: 'op-sqlite · async insert 1k', ms: performance.now() - t });

  db.executeSync('DELETE FROM bench');
  await cooldown();

  // transaction inserts
  t = performance.now();
  await db.transaction(async (tx) => {
    for (let i = 0; i < ITERATIONS; i++) {
      await tx.execute('INSERT INTO bench VALUES (?,?,?)', [i, `n${i}`, i * 1.5]);
    }
  });
  results.push({ label: 'op-sqlite · tx insert 1k', ms: performance.now() - t });

  await cooldown();

  // select all
  t = performance.now();
  await db.execute('SELECT * FROM bench');
  results.push({ label: 'op-sqlite · select 1k', ms: performance.now() - t });

  db.executeSync('DROP TABLE IF EXISTS bench');
  db.close();
  await cooldown();

  return results;
}

// ── nitro-sqlite ───────────────────────────────────────────────────────────────

async function benchNitroSQLite(): Promise<BenchResult[]> {
  const results: BenchResult[] = [];
  const conn = nitroOpen({ name: 'nitro_bench.db' });

  conn.execute('DROP TABLE IF EXISTS bench');
  conn.execute('CREATE TABLE bench (id INTEGER PRIMARY KEY, name TEXT, value REAL)');

  // sync inserts
  let t = performance.now();
  for (let i = 0; i < ITERATIONS; i++) {
    conn.execute('INSERT INTO bench VALUES (?,?,?)', [i, `n${i}`, i * 1.5]);
  }
  results.push({ label: 'nitro-sqlite · sync insert 1k', ms: performance.now() - t });

  conn.execute('DELETE FROM bench');
  await cooldown();

  // async inserts
  t = performance.now();
  for (let i = 0; i < ITERATIONS; i++) {
    await conn.executeAsync('INSERT INTO bench VALUES (?,?,?)', [i, `n${i}`, i * 1.5]);
  }
  results.push({ label: 'nitro-sqlite · async insert 1k', ms: performance.now() - t });

  conn.execute('DELETE FROM bench');
  await cooldown();

  // transaction inserts
  t = performance.now();
  await conn.transaction(async (tx) => {
    for (let i = 0; i < ITERATIONS; i++) {
      tx.execute('INSERT INTO bench VALUES (?,?,?)', [i, `n${i}`, i * 1.5]);
    }
  });
  results.push({ label: 'nitro-sqlite · tx insert 1k', ms: performance.now() - t });

  await cooldown();

  // select all
  t = performance.now();
  conn.execute('SELECT * FROM bench');
  results.push({ label: 'nitro-sqlite · select 1k', ms: performance.now() - t });

  conn.execute('DROP TABLE IF EXISTS bench');
  conn.close();
  await cooldown();

  return results;
}

// ── expo-sqlite ────────────────────────────────────────────────────────────────

async function benchExpoSQLite(): Promise<BenchResult[]> {
  const results: BenchResult[] = [];
  const db = openDatabaseSync('expo_bench.db');

  db.execSync('DROP TABLE IF EXISTS bench');
  db.execSync('CREATE TABLE bench (id INTEGER PRIMARY KEY, name TEXT, value REAL)');

  // sync inserts
  let t = performance.now();
  for (let i = 0; i < ITERATIONS; i++) {
    db.runSync('INSERT INTO bench VALUES (?,?,?)', i, `n${i}`, i * 1.5);
  }
  results.push({ label: 'expo-sqlite · sync insert 1k', ms: performance.now() - t });

  db.execSync('DELETE FROM bench');
  await cooldown();

  // async inserts
  t = performance.now();
  for (let i = 0; i < ITERATIONS; i++) {
    await db.runAsync('INSERT INTO bench VALUES (?,?,?)', i, `n${i}`, i * 1.5);
  }
  results.push({ label: 'expo-sqlite · async insert 1k', ms: performance.now() - t });

  db.execSync('DELETE FROM bench');
  await cooldown();

  // transaction inserts
  t = performance.now();
  await db.withExclusiveTransactionAsync(async (txn) => {
    for (let i = 0; i < ITERATIONS; i++) {
      await txn.runAsync('INSERT INTO bench VALUES (?,?,?)', i, `n${i}`, i * 1.5);
    }
  });
  results.push({ label: 'expo-sqlite · tx insert 1k', ms: performance.now() - t });

  await cooldown();

  // select all
  t = performance.now();
  await db.getAllAsync('SELECT * FROM bench');
  results.push({ label: 'expo-sqlite · select 1k', ms: performance.now() - t });

  db.execSync('DROP TABLE IF EXISTS bench');
  db.closeSync();
  await cooldown();

  return results;
}

// ── component ─────────────────────────────────────────────────────────────────

const SECTIONS: { title: string; color: string }[] = [
  { title: 'op-sqlite', color: '#f97316' },
  { title: 'nitro-sqlite', color: '#a78bfa' },
  { title: 'expo-sqlite', color: '#34d399' },
];

export default function HomeScreen() {
  const [sections, setSections] = useState<BenchSection[]>([]);
  const [status, setStatus] = useState('starting…');
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    (async () => {
      try {
        setStatus('running op-sqlite…');
        const opResults = await benchOpSQLite();
        setSections([{ ...SECTIONS[0]!, results: opResults }]);

        setStatus('running nitro-sqlite…');
        const nitroResults = await benchNitroSQLite();
        setSections((prev) => [...prev, { ...SECTIONS[1]!, results: nitroResults }]);

        setStatus('running expo-sqlite…');
        const expoResults = await benchExpoSQLite();
        setSections((prev) => [...prev, { ...SECTIONS[2]!, results: expoResults }]);

        setStatus('done');
      } catch (e: any) {
        setStatus(`error: ${e?.message ?? e}`);
      }
    })();
  }, []);

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.heading}>SQLite Benchmark</Text>
      <Text style={styles.sub}>{ITERATIONS} rows · {COOL_DOWN_MS}ms cooldown between tests</Text>
      {status !== 'done' && <Text style={styles.status}>{status}</Text>}
      <ScrollView style={styles.scroll} contentContainerStyle={styles.list}>
        {sections.map((section) => (
          <View key={section.title} style={styles.section}>
            <View style={[styles.sectionHeader, { borderLeftColor: section.color }]}>
              <Text style={[styles.sectionTitle, { color: section.color }]}>{section.title}</Text>
            </View>
            {section.results.map((r) => {
              const shortLabel = r.label.replace(/^[^·]+· /, '');
              return (
                <View key={r.label} style={styles.row}>
                  <Text style={styles.label}>{shortLabel}</Text>
                  <Text style={[styles.ms, { color: section.color }]}>{r.ms.toFixed(1)} ms</Text>
                </View>
              );
            })}
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f0f0f', paddingHorizontal: 16 },
  heading: { fontSize: 22, fontWeight: '700', color: '#fff', marginTop: 16 },
  sub: { fontSize: 13, color: '#888', marginBottom: 4 },
  status: { fontSize: 14, color: '#f0a500', marginBottom: 12 },
  scroll: { flex: 1 },
  list: { gap: 16, paddingBottom: 40 },
  section: { gap: 6 },
  sectionHeader: {
    borderLeftWidth: 3,
    paddingLeft: 10,
    marginBottom: 2,
  },
  sectionTitle: { fontSize: 15, fontWeight: '700', letterSpacing: 0.3 },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: '#1c1c1e',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  label: { color: '#ddd', fontSize: 13, flexShrink: 1, marginRight: 8 },
  ms: { fontSize: 13, fontWeight: '600', flexShrink: 0 },
});
