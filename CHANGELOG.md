# Changelog

All notable changes to `dkg-claude-code-memory` are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.2] — 2026-05-26

Second bug-fix release from another full end-to-end test of the published package
against a live DKG v10 node.

### Fixed

- **`retrieve_artifact` returned no provenance fields.** `sessionId`, `source`,
  `capturedAt`, `dateCreated`, `modifiedAt`, `agentFramework`, and the multi-agent
  attribution (`subAgentId` / `parentTaskId` / `agentRole`) live on the artifact's
  `<id>/provenance` node, which the query never traversed. `retrieve` now `UNION`s
  in the provenance node, so the full record (including multi-agent attribution) is
  returned.
- **`get_claim_review` used the wrong `datePublished`.** It fell back to the current
  time because `capturedAt` (on the provenance node) was not fetched; it now uses the
  artifact's real capture timestamp.
- **`query_shared_memory` never found promoted artifacts.** It queried the default
  `working-memory` view; promoted artifacts live in the `shared-working-memory` view.
  It now queries that view, and each entry includes the artifact `id` so results can
  be passed straight to `retrieve_artifact`.

### Changed

- Test suite expanded to 566 unit/integration tests (100% statements, 99.46%
  branches) plus 13 live integration tests.

## [1.0.1] — 2026-05-26

Bug-fix release from a full end-to-end test of the published package against a
live DKG v10 node.

### Fixed

- **MCP stdio protocol corruption.** Capture logging was written to `stdout`
  (`console.log`), which is reserved for JSON-RPC under the stdio transport and
  corrupted the message stream on every capture/synthesis. Logging now goes to
  `stderr`.
- **Server crashed on startup when no token was configured.** It now starts and
  lists its tools; calls that reach the DKG node return a clear error instead of
  the whole server failing to connect.
- **`promote_to_shared_memory` did not block `confidential` artifacts.** The
  sensitivity lookup was unscoped and returned nothing on a live node; it is now
  scoped to the configured Context Graph / assertion, so the guard fires correctly.
- **`retrieve_artifact` returned literals wrapped in N-Quads quotes** (e.g.
  `"draft"`); values are now returned clean, matching the other readers.
- **Status updates were not reflected on read.** The DKG assertion store is
  append-only, so `update_artifact_status` leaves multiple `wm:status` quads.
  Readers (`retrieve`, `search`, `get_session_summary`, `get_claim_review`) now
  resolve the effective (furthest-advanced) status and de-duplicate artifacts that
  carry more than one status value.

### Changed

- Test suite expanded to 565 unit/integration tests (100% statements, 99.46%
  branches) plus 13 live integration tests.

## [1.0.0] — 2026-05-26

Initial release. An MCP server that gives Claude Code agents persistent, verifiable
Working Memory on OriginTrail DKG v10.

### Added

- **10 MCP tools** over stdio transport: `capture_research_finding`,
  `search_working_memory`, `retrieve_artifact`, `update_artifact_status`,
  `promote_to_shared_memory`, `synthesize_session`, `get_session_summary`,
  `query_shared_memory`, `get_claim_review`, `get_node_status`.
- **Content-addressable artifacts** — SHA-256 content hash → stable
  `urn:dkg:wm:<hash>` URN, plus the DKG-returned UAL.
- **Trust gradient** — `draft → needs_sources → review_needed → validated →
  ready_to_share` (plus `deprecated` / `discarded`), via `update_artifact_status`.
- **PROV-O provenance** — `prov:wasDerivedFrom` chains (`derivedFrom`) and
  multi-agent attribution (`subAgentId`, `parentTaskId`, `agentRole`).
- **Sensitivity / access control** — `public` / `internal` / `confidential`
  written as `schema:accessMode`; `promote_to_shared_memory` blocks `confidential`
  artifacts and requires explicit `confirm: true`.
- **Shared Memory promotion** — Curator-authority `SHARE`, never autonomous.
- **Oracle readiness** — `get_claim_review` serializes any artifact to a
  schema.org `ClaimReview` JSON-LD with a status→ratingValue mapping.
- **Content-hash deduplication** and **secret redaction** before any DKG write.
- **SPARQL-injection prevention** — all user strings escaped; type/status/sensitivity
  enum-validated.
- 552 unit/integration tests (100% statements, 99.81% branches) and 13 live
  integration tests against a local DKG v10 node.

[1.0.2]: https://github.com/drMurlly/dkg-claude-code-memory/compare/v1.0.1...v1.0.2
[1.0.1]: https://github.com/drMurlly/dkg-claude-code-memory/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/drMurlly/dkg-claude-code-memory/releases/tag/v1.0.0
