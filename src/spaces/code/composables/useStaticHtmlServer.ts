/**
 * Shared static HTML server command builder.
 * Picks a free port and falls back across common local runtimes.
 */

const DEFAULT_PORT_CANDIDATES = [3000, 3001, 3002, 4173, 5173, 8080] as const

export function buildStaticHtmlServeScript(
  portCandidates: readonly number[] = DEFAULT_PORT_CANDIDATES
): string {
  const ports = portCandidates.join(' ')

  return `
PORT=""
for p in ${ports}; do
  if ! lsof -n -P -iTCP:$p -sTCP:LISTEN -t >/dev/null 2>&1; then
    PORT="$p"
    break
  fi
done

if [ -z "$PORT" ]; then
  PORT="3000"
fi

if command -v python3 >/dev/null 2>&1; then
  echo "Static HTML preview: http://localhost:$PORT"
  exec python3 -m http.server "$PORT" --bind 127.0.0.1
fi

if command -v python >/dev/null 2>&1; then
  echo "Static HTML preview: http://localhost:$PORT"
  exec python -m http.server "$PORT" --bind 127.0.0.1
fi

if command -v php >/dev/null 2>&1; then
  echo "Static HTML preview: http://localhost:$PORT"
  exec php -S "127.0.0.1:$PORT" -t .
fi

if command -v bun >/dev/null 2>&1; then
  echo "Static HTML preview: http://localhost:$PORT"
  exec bun x serve -l "tcp://127.0.0.1:$PORT" .
fi

if command -v bunx >/dev/null 2>&1; then
  echo "Static HTML preview: http://localhost:$PORT"
  exec bunx serve -l "tcp://127.0.0.1:$PORT" .
fi

if command -v npx >/dev/null 2>&1; then
  echo "Static HTML preview: http://localhost:$PORT"
  exec npx --yes serve -l "tcp://127.0.0.1:$PORT" .
fi

echo "No static server runtime found (python3/python/php/bun/bunx/npx)." >&2
exit 1
`.trim()
}

export function buildStaticHtmlServeCommand(
  portCandidates: readonly number[] = DEFAULT_PORT_CANDIDATES
): readonly string[] {
  return ['sh', '-c', buildStaticHtmlServeScript(portCandidates)] as const
}
