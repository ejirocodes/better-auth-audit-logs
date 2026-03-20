# Publishing Guide

## Overview

`better-auth-audit-logs` ships two entry points from a single package:

| Entry | Source | Built output |
|---|---|---|
| `better-auth-audit-logs` | `src/index.ts` | `dist/index.js` (ESM) · `dist/index.cjs` (CJS) · `dist/index.d.ts` |
| `better-auth-audit-logs/client` | `src/client.ts` | `dist/client.js` · `dist/client.cjs` · `dist/client.d.ts` |

---

## Pre-publish checklist

Run all three before bumping the version:

```sh
bun run typecheck   # tsc --noEmit
bun test            # all tests must pass
bun run build       # produces dist/
```

Verify the build outputs exist:

```sh
ls dist/
# index.js  index.cjs  index.d.ts  index.d.ts.map
# client.js client.cjs client.d.ts client.d.ts.map
```

---

## Versioning

Follow [semver](https://semver.org):

| Change | Version bump |
|---|---|
| Bug fix, internal refactor | patch — `0.1.0` → `0.1.1` |
| New option, new endpoint, backward-compatible feature | minor — `0.1.0` → `0.2.0` |
| Breaking change to public API or storage interface | major — `0.1.0` → `1.0.0` |

**What counts as a breaking change for this package:**
- Removing or renaming an exported function/type (`auditLog`, `auditLogClient`, `MemoryStorage`, any type in `src/types.ts`)
- Changing a required field in `AuditLogEntry` or `AuditLogStorage`
- Removing a query parameter from an endpoint
- Dropping a peer dependency version range (e.g. raising `better-auth` minimum)
- Changing the DB schema in a way that requires a migration

Bump the version in `package.json` manually or with:

```sh
bun run --bun npm version patch   # or minor / major
```

---

## Build

```sh
bun run build
```

The build script runs three steps in sequence:

1. **ESM build** — `bun build src/index.ts src/client.ts --outdir dist --target node`
2. **CJS build** — same entry points, `--format cjs`, outputs `*.cjs`
3. **Type declarations** — `tsc -p tsconfig.build.json` (emits `.d.ts` + `.d.ts.map` only)

All output goes to `dist/`. Only `dist/` is included in the published package (see `"files"` in `package.json`).

---

## Publishing to npm

### First time

```sh
npm login          # authenticates with your npm account
```

Check the package name is available:

```sh
npm info better-auth-audit-logs
```

### Every release

```sh
# 1. Make sure you are on main and it is clean
git checkout main
git pull

# 2. Run checks
bun run typecheck && bun test

# 3. Build
bun run build

# 4. Bump version (edit package.json directly or use npm version)
#    e.g. for a patch release:
bun run --bun npm version patch --no-git-tag-version

# 5. Dry-run to verify what will be published
npm pack --dry-run
```

The dry-run output should list only:
- `dist/**`
- `package.json`
- `README.md`

Nothing else — no `src/`, no `tests/`, no `.env`, no `node_modules/`.

```sh
# 6. Publish
npm publish --access public
```

### Creating the GitHub release

```sh
# Commit the version bump
git add package.json
git commit -m "chore: release v$(node -e "console.log(require('./package.json').version)")"
git push

# Create a GitHub release with auto-generated notes from merged PRs
gh release create "v$(node -e "console.log(require('./package.json').version)")" \
  --generate-notes \
  --title "v$(node -e "console.log(require('./package.json').version)")"
```

This creates the git tag, pushes it, and publishes a GitHub release page with notes in one command. The `--generate-notes` flag builds the changelog from merged PRs and commits since the last tag.

To write custom release notes instead:

```sh
gh release create "v0.2.0" \
  --title "v0.2.0" \
  --notes "$(cat <<'EOF'
## What's new

- Added `retention` option for automatic log cleanup
- PII redaction now supports custom field lists

## Breaking changes

None
EOF
)"
```

---

## Post-publish verification

```sh
# Confirm the version is live
npm info better-auth-audit-logs version

# Smoke-test install in a fresh directory
mkdir /tmp/audit-logs-smoke && cd /tmp/audit-logs-smoke
bun add better-auth-audit-logs
bun -e "import { auditLog } from 'better-auth-audit-logs'; console.log(typeof auditLog)"
# → function
bun -e "import { auditLogClient } from 'better-auth-audit-logs/client'; console.log(typeof auditLogClient)"
# → function
```

---

## Package contents reference

```
"files": ["dist"]
```

```
"exports": {
  ".": {
    "require": "./dist/index.cjs", ← Node CJS (Next.js, etc.)
    "import":  "./dist/index.js",  ← Node ESM / bundlers
    "types":   "./dist/index.d.ts"
  },
  "./client": {
    "require": "./dist/client.cjs",
    "import":  "./dist/client.js",
    "types":   "./dist/client.d.ts"
  }
}
```

**Peer dependencies** — consumers must have these installed:

| Package | Required version |
|---|---|
| `better-auth` | `>=1.0.0` |
| `zod` | `>=3.0.0` |
| `typescript` | `^5` |

---

## Troubleshooting

**`npm publish` fails with `E403 You must be logged in`**
→ Run `npm login` first.

**CJS consumers get `ERR_REQUIRE_ESM`**
→ Check that `dist/index.cjs` exists and the `"require"` export condition points to it.

**Types not resolving in consumer projects**
→ Confirm `dist/index.d.ts` exists after build. The `tsc -p tsconfig.build.json` step must complete without errors.

**`mergeSchema` import error after `better-auth` upgrade**
→ `mergeSchema` is imported from `better-auth/db`. Check the changelog of the new `better-auth` version for API changes before bumping the peer dependency range.
