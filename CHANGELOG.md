# Changelog

All notable changes to `dkg-claude-code-memory` are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

[1.0.0]: https://github.com/drMurlly/dkg-claude-code-memory/releases/tag/v1.0.0
