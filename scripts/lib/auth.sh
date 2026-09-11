#!/bin/bash
# ============================================================================
# scripts/lib/auth.sh - bearer credentials for shell callers of the OpenFoundry API
#
# Source this, then call `of_curl` wherever a script would have called `curl`:
#
#   source "$(dirname "$0")/lib/auth.sh"
#   of_curl -s "${GATEWAY_URL}/api/v2/ontologies"
#
# The gateway rejects unauthenticated requests as soon as AUTH_PUBLIC_KEY is
# configured (services/svc-gateway/src/middleware/auth.ts). Every script that
# talks to it therefore needs a token, and the token must come from the
# environment: this repository is public, so no credential is written here.
#
# Credentials, in precedence order - all optional, all read from the
# environment or from the gitignored .env, never from this file:
#
#   OPENFOUNDRY_TOKEN                        a bearer token, used verbatim
#   OPENFOUNDRY_CLIENT_ID / _CLIENT_SECRET   exchanged for a token via the
#                                            OAuth2 client_credentials grant
#   OPENFOUNDRY_AUTH_URL                     where to exchange them
#                                            (default: the gateway)
#
# With neither credential set no Authorization header is sent, which is exactly
# today's behaviour and still works against a gateway that has no
# AUTH_PUBLIC_KEY. The keys are listed in .env.example with empty values.
#
# The TypeScript equivalent is scripts/lib/auth.ts; keep the two in step.
# ============================================================================

# Sourcing this twice would mint a second token for nothing.
if [ -n "${OF_AUTH_SH_LOADED:-}" ]; then
  return 0
fi
OF_AUTH_SH_LOADED=1

# ---------------------------------------------------------------------------
# Read the OPENFOUNDRY_* credential keys out of .env, without sourcing the
# whole file: a seed script has no business inheriting DATABASE_URL and the
# rest. Values already present in the environment win.
# ---------------------------------------------------------------------------
of_load_env_credentials() {
  local env_file="$1"
  [ -f "$env_file" ] || return 0

  local line key value
  while IFS= read -r line || [ -n "$line" ]; do
    case "$line" in
      OPENFOUNDRY_TOKEN=*|OPENFOUNDRY_CLIENT_ID=*|OPENFOUNDRY_CLIENT_SECRET=*|OPENFOUNDRY_AUTH_URL=*)
        key="${line%%=*}"
        value="${line#*=}"
        # Strip one layer of surrounding quotes, as `source` would.
        case "$value" in
          \"*\") value="${value#\"}"; value="${value%\"}" ;;
          \'*\') value="${value#\'}"; value="${value%\'}" ;;
        esac
        [ -z "$value" ] && continue
        [ -n "${!key:-}" ] && continue
        export "$key=$value"
        ;;
    esac
  done < "$env_file"
}

of_load_env_credentials "$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)/.env"

# Where to exchange client credentials for a token. Defaults to the gateway,
# whose /multipass/api/oauth2/ prefix is reachable without a token by design -
# it is where tokens come from.
OPENFOUNDRY_AUTH_URL="${OPENFOUNDRY_AUTH_URL:-${GATEWAY_URL:-http://localhost:8080}}"

# Resolved once per script run; empty means "send no Authorization header".
OF_ACCESS_TOKEN=""

of_resolve_token() {
  if [ -n "${OPENFOUNDRY_TOKEN:-}" ]; then
    OF_ACCESS_TOKEN="${OPENFOUNDRY_TOKEN}"
    return 0
  fi

  if [ -z "${OPENFOUNDRY_CLIENT_ID:-}" ] || [ -z "${OPENFOUNDRY_CLIENT_SECRET:-}" ]; then
    return 0
  fi

  local response=""
  response=$(curl -s -X POST "${OPENFOUNDRY_AUTH_URL}/multipass/api/oauth2/token" \
    -H "Content-Type: application/json" \
    -d "{\"grant_type\":\"client_credentials\",\"client_id\":\"${OPENFOUNDRY_CLIENT_ID}\",\"client_secret\":\"${OPENFOUNDRY_CLIENT_SECRET}\"}" 2>/dev/null) || true

  OF_ACCESS_TOKEN=$(printf '%s' "$response" | python3 -c "import sys,json
try:
    print(json.load(sys.stdin).get('access_token', ''))
except Exception:
    print('')" 2>/dev/null) || true

  if [ -z "${OF_ACCESS_TOKEN}" ]; then
    echo "WARNING: OPENFOUNDRY_CLIENT_ID is set but ${OPENFOUNDRY_AUTH_URL} issued no token." >&2
    echo "         Continuing unauthenticated; requests fail if the gateway enforces auth." >&2
  fi
}

of_resolve_token

# curl with the resolved Authorization header attached. Takes exactly the same
# arguments as curl, and adds nothing when no credential is configured.
of_curl() {
  if [ -n "${OF_ACCESS_TOKEN}" ]; then
    curl -H "Authorization: Bearer ${OF_ACCESS_TOKEN}" "$@"
  else
    curl "$@"
  fi
}
