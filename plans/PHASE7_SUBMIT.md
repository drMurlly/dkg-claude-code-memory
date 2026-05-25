# Phase 7: Demo, Publish, Submit — `dkg-claude-code-memory`

**Duration:** ~3 hours  
**Goal:** npm package live with SLSA provenance, registry entry validates clean, PR open and tagged.

---

## Step 1: Final Pre-Publish Checks

```bash
cd /home/selon/dkg-claude-code-memory

# All tests must pass
npm test
# Expected: 150+ tests, 0 failures

# Live integration tests against real DKG node
DKG_INTEGRATION_TEST=1 npm run test:live
# Expected: 8 live tests pass

# Zero production vulnerabilities
npm audit --production
# Expected: found 0 vulnerabilities

# Clean build
npm run build
# Expected: 0 TypeScript errors

# Verify the bin works
node dist/index.js --help 2>&1 || echo "server starts (expected: no --help, just starts)"
```

---

## Step 2: Record Demo Video

Follow `docs/DEMO_SCRIPT.md` exactly. Use OBS or Loom.

Requirements:
- **3–5 minutes** — no longer, no shorter
- **Shows real DKG writes** — terminal visible confirming UALs returned
- **Shows cross-session persistence** — new session retrieves prior findings
- **Shows sub-agent attribution** — at least one sub-agent capture visible
- **No scripts/mocks** — real Claude Code session, real DKG node

Upload to YouTube as **unlisted**. Save URL.

---

## Step 3: Tag and Publish via GitHub Actions

```bash
cd /home/selon/dkg-claude-code-memory

# Confirm final version in package.json is 1.0.0
grep '"version"' package.json

# Stage and commit everything
git add -A
git commit -m "feat: initial release — Claude Code Research Memory MCP server for DKG v10"

# Push to GitHub
git push origin main

# Create and push version tag — this triggers GitHub Actions publish workflow
git tag v1.0.0
git push origin v1.0.0
```

**Watch the GitHub Actions run:**
```
https://github.com/drMurlly/dkg-claude-code-memory/actions
```

The `publish.yml` workflow will:
1. Run `npm ci && npm run build && npm test`
2. Run `npm publish --provenance --access public`
3. Generate SLSA v1 attestation via sigstore

**Verify npm publish succeeded:**
```bash
npm view dkg-claude-code-memory@1.0.0
# Should show: version, dist-tarball, _attestations
```

**Get the exact commit SHA for the registry entry:**
```bash
git rev-parse v1.0.0
# Copy the full 40-character hash
```

---

## Step 4: Fill `REGISTRY_ENTRY.json`

File location: `/home/selon/OriginTrail_v10_bounty_program/REGISTRY_ENTRY_CCM.json`

```json
{
  "$schema": "../schema/integration.schema.json",
  "schemaVersion": "0.1.0",
  "slug": "claude-code-memory",
  "name": "Claude Code Research Memory for DKG v10",
  "description": "MCP server giving Claude Code agents persistent, verifiable Working Memory on DKG v10. Research findings, vulnerability reports, and architectural decisions persist across sessions with sub-agent provenance chains and SPARQL-backed retrieval.",
  "category": ["mcp-server", "working-memory", "claude-code"],
  "maintainer": {
    "github": "@drMurlly",
    "name": "drMurlly"
  },
  "repo": "https://github.com/drMurlly/dkg-claude-code-memory",
  "commit": "FILL_IN_40_CHAR_SHA_FROM_GIT_REV_PARSE_V1.0.0",
  "license": "Apache-2.0",
  "requiresDkgNodeVersion": ">=10.0.0-rc.1",
  "memoryLayers": ["WM", "SWM"],
  "v10PrimitivesUsed": ["ContextGraph", "Assertion", "UAL", "Integration", "Curator"],
  "publicInterfacesUsed": ["http-api", "mcp-server"],
  "targetAgents": ["Claude Code"],
  "install": {
    "kind": "mcp-server",
    "package": "dkg-claude-code-memory",
    "version": "1.0.0"
  },
  "security": {
    "networkEgress": [],
    "writeAuthority": [
      "POST /api/context-graph/create",
      "POST /api/assertion/create",
      "POST /api/assertion/{name}/write",
      "POST /api/assertion/{name}/promote [Curator-authority: SHARE — requires explicit user confirmation via confirm=true parameter]"
    ],
    "credentialsHandled": [],
    "notes": "Bearer token read from DKG_AUTH_TOKEN env var or ~/.dkg/auth.token file. All content is secret-redacted before write (API keys, private keys, PEM blocks, bearer tokens stripped). No eval, no remote code loading. Only communicates with local DKG node (127.0.0.1:9200). Content-hash deduplication prevents re-uploading identical artifacts."
  },
  "trustTier": "community",
  "designBrief": "https://github.com/drMurlly/dkg-claude-code-memory/blob/main/docs/DESIGN_BRIEF.md",
  "demo": "FILL_IN_YOUTUBE_URL",
  "promotionPath": "Artifacts enter Working Memory as 'draft'. Agent upgrades status through draft → needs_sources → review_needed → validated → ready_to_share via update_artifact_status tool. User explicitly triggers SWM promotion via promote_to_shared_memory(confirm=true). Round 2: SWM artifacts with endorsement → Verified Memory via on-chain anchoring. Same SPARQL queries work unchanged across all three layers.",
  "fitNotes": "Claude Code sub-agents are an explicit priority target in the bounty spec (Section 5). This integration directly realizes the LLM-Wiki vision: Claude Code is the autoresearch agent; DKG WM is the wiki. Sub-agent provenance chains (parentTaskId/subAgentId) enable multi-agent knowledge accumulation across orchestrated research sessions — a capability not present in any other submitted integration."
}
```

**CRITICAL SCHEMA CONSTRAINTS — will cause CI failure if wrong:**

| Field | Must be |
|---|---|
| `schemaVersion` | `"0.1.0"` not `"1.0.0"` |
| `maintainer.github` | `"@drMurlly"` — must start with `@` |
| `targetAgents` | `["Claude Code"]` — capitalized, not `["claude-code"]` |
| `install.kind` | `"mcp-server"` — flat fields only, no nested object |
| `security.networkEgress` | `[]` — local node excluded from this list |
| `commit` | Exactly 40 lowercase hex chars from `git rev-parse v1.0.0` |
| Additional fields | NONE — `additionalProperties: false` |

---

## Step 5: Local Registry Validation

```bash
# Ensure dkg-integrations is cloned
ls /tmp/dkg-integrations || git clone --depth 1 https://github.com/OriginTrail/dkg-integrations.git /tmp/dkg-integrations
cd /tmp/dkg-integrations && npm install

# Copy our registry entry
cp /home/selon/OriginTrail_v10_bounty_program/REGISTRY_ENTRY_CCM.json \
   /tmp/dkg-integrations/integrations/claude-code-memory.json

# Run both validators — BOTH must exit 0 with 0 errors
node scripts/validate.mjs integrations/claude-code-memory.json
# Expected: ✓ 0 errors

node scripts/security-checks.mjs integrations/claude-code-memory.json
# Expected: ✓ 0 errors
# If 'missing-version': npm package not yet published — run Step 3 first
```

---

## Step 6: Open the PR

```bash
cd /tmp/dkg-integrations

# Create feature branch
git checkout -b add-claude-code-memory

# Commit the registry entry
git add integrations/claude-code-memory.json
git commit -m "feat: add claude-code-memory MCP server integration [cfi-dkgv10-r1]"

# Push branch
git push origin add-claude-code-memory
```

**Create PR:**
```bash
gh pr create \
  --repo OriginTrail/dkg-integrations \
  --title "[cfi-dkgv10-r1] Add claude-code-memory: Claude Code Research Memory for DKG v10" \
  --label "cfi-dkgv10-r1" \
  --body "$(cat <<'EOF'
## What this PR does

Adds `claude-code-memory` as a community integration — an MCP server that gives Claude Code
agents persistent, verifiable Working Memory on DKG v10, purpose-built for research and
multi-agent orchestration workflows.

## Integration links

- **Repo:** https://github.com/drMurlly/dkg-claude-code-memory
- **Commit pinned:** FILL_IN_SHA
- **Published package:** [`dkg-claude-code-memory@1.0.0`](https://www.npmjs.com/package/dkg-claude-code-memory/v/1.0.0)
- **Design brief:** https://github.com/drMurlly/dkg-claude-code-memory/blob/main/docs/DESIGN_BRIEF.md
- **Demo video:** FILL_IN_YOUTUBE_URL

## Bounty tag

`cfi-dkgv10-r1`

## Scope & faithfulness

- [x] Uses only supported public interfaces: MCP server + DKG HTTP API
- [x] Does not import internal DKG packages or patch node source
- [x] `memoryLayers: ["WM", "SWM"]` correctly reflects layers touched
- [x] `v10PrimitivesUsed` correctly reflects primitives exercised
- [x] Curator authority respected: `promote_to_shared_memory` requires `confirm: true`
- [x] No UI buttons for endorsement or voting — all operations are conversational
- [x] Terminology follows v10 vocabulary exactly (Context Graph, Assertion, UAL, etc.)

## Key differentiators

**Sub-agent provenance chains** — When Claude Code spawns sub-agents via the Agent tool,
each sub-agent's artifacts are attributed via `wm:parentTaskId` + `wm:subAgentId` RDF quads.
Parent agents retrieve all sub-agent findings via `search_working_memory(sessionId)`.
No other submitted integration tracks sub-agent provenance.

**Research-specialized taxonomy** — 14 artifact types covering real research workflows:
`vulnerability_finding`, `code_analysis`, `audit_note`, `competitive_analysis`,
`knowledge_synthesis` and more. Each maps to a specific status classifier path.

**Cross-session knowledge accumulation** — Content-hash deduplication + persistent state
ensure that re-running the same analysis doesn't duplicate artifacts. Every finding enriches
a personal DKG wiki that grows across sessions.

## Security

- npm published with `--provenance` (SLSA v1, GitHub Actions, sigstore log)
- No `postinstall`/`preinstall` scripts
- All content secret-redacted before write (API keys, private keys, PEM blocks, bearer tokens)
- Bearer token read from env var or `~/.dkg/auth.token` only
- `npm audit --production`: 0 vulnerabilities
- `networkEgress: []` — only communicates with local DKG node

## Contributor attestation

The code in the pinned commit is my own work, properly licensed under Apache-2.0,
and contains no intentional backdoors. I accept the OriginTrail DKG v10 Terms & Conditions.

## TRAC payment preference

**Base** network (or NeuroWeb if Base unavailable at time of disbursement).

## Maintenance

I commit to maintaining this integration for at least 12 months post-merge.
EOF
)"
```

---

## Step 7: Post in OriginTrail Submission Thread

Post the following in the designated OriginTrail submission thread on the official channel:

```
New submission: dkg-claude-code-memory (Claude Code Research Memory for DKG v10)

MCP server giving Claude Code agents persistent, verifiable Working Memory on DKG v10.
Purpose-built for multi-agent research workflows.

PR: https://github.com/OriginTrail/dkg-integrations/pull/N
Repo: https://github.com/drMurlly/dkg-claude-code-memory
Demo: YOUTUBE_URL
Design brief: https://github.com/drMurlly/dkg-claude-code-memory/blob/main/docs/DESIGN_BRIEF.md

Tag: #cfi-dkgv10-r1
```

---

## Final Submission Checklist

- [ ] `npm run build` — 0 TypeScript errors
- [ ] `npm test` — 150+ tests, 0 failures, >95% coverage
- [ ] `DKG_INTEGRATION_TEST=1 npm run test:live` — 8 live tests pass
- [ ] `npm audit --production` — 0 vulnerabilities
- [ ] GitHub repo is PUBLIC at `drMurlly/dkg-claude-code-memory`
- [ ] `v1.0.0` tag pushed → GitHub Actions publish completed
- [ ] `npm view dkg-claude-code-memory@1.0.0` — package exists on npm
- [ ] Demo video recorded, uploaded to YouTube (unlisted)
- [ ] `REGISTRY_ENTRY_CCM.json` — `commit` SHA filled in (40 chars)
- [ ] `REGISTRY_ENTRY_CCM.json` — `demo` URL filled in
- [ ] `validate.mjs integrations/claude-code-memory.json` — exits 0
- [ ] `security-checks.mjs integrations/claude-code-memory.json` — exits 0
- [ ] PR opened against `OriginTrail/dkg-integrations`
- [ ] PR tagged `cfi-dkgv10-r1`
- [ ] PR body includes contributor attestation
- [ ] PR body includes TRAC payment network preference
- [ ] PR body includes T&C acceptance
- [ ] Posted in OriginTrail submission thread
