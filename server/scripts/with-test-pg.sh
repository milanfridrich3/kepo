#!/usr/bin/env bash
# Runs the PostgreSQL-backed tests (src/**/*.pg.test.ts) against a THROWAWAY local cluster.
# Needs PostgreSQL server binaries (initdb, pg_ctl) on PATH or in /usr/lib/postgresql/*/bin.
# Never touches DATABASE_URL or any real database. Usage: scripts/with-test-pg.sh [tsx args]
set -euo pipefail
cd "$(dirname "$0")/.."

BIN=""
if command -v initdb >/dev/null 2>&1; then BIN="$(dirname "$(command -v initdb)")"
else BIN="$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1 || true)"; fi
if [ -z "$BIN" ] || [ ! -x "$BIN/initdb" ]; then if [ "${KEPO_REQUIRE_PG:-}" = "1" ]; then echo "PostgreSQL server binaries not found and KEPO_REQUIRE_PG=1." >&2; exit 1; fi
  echo "PostgreSQL server binaries not found; skipping pg tests." >&2; exit 0
fi

TMP="$(mktemp -d /var/tmp/kepo-pgtest.XXXXXX)"
PORT="${KEPO_PG_TEST_PORT:-54398}"
RUN=""
if [ "$(id -u)" = "0" ]; then chown postgres "$TMP"; RUN="su postgres -c"; fi
run() { if [ -n "$RUN" ]; then $RUN "$*"; else bash -c "$*"; fi; }
cleanup() { run "$BIN/pg_ctl -D $TMP/data -m immediate stop" >/dev/null 2>&1 || true; rm -rf "$TMP"; }
trap cleanup EXIT

run "$BIN/initdb -D $TMP/data -U postgres -A trust" >/dev/null
show_log() { if [ -s "$TMP/log" ]; then echo "--- PostgreSQL server log (throwaway cluster, trust auth, no secrets) ---" >&2; tail -n 200 "$TMP/log" >&2; echo "--- end of PostgreSQL server log ---" >&2; fi; }
run "$BIN/pg_ctl -D $TMP/data -o '-p $PORT -k $TMP -c listen_addresses=' -l $TMP/log -w start" >/dev/null || { echo "PostgreSQL failed to start." >&2; show_log; exit 1; }
run "$BIN/createdb -U postgres -h $TMP -p $PORT kepo_test"

export KEPO_PG_TEST_SOCKET="$TMP" KEPO_PG_TEST_PORT="$PORT" KEPO_PG_TEST_DB=kepo_test
TSX="${TSX:-tsx}"
FILES=$(find src -name '*.pg.test.ts' | sort)
# Keep the test command's own exit code; print the server log only when it failed.
rc=0
"$TSX" --test ${@:-$FILES} || rc=$?
if [ "$rc" -ne 0 ]; then show_log; fi
exit "$rc"
