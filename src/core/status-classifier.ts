/**
 * Status classifier — determines artifact status based on type and content analysis.
 */

import type { ArtifactStatus, ArtifactType } from '../types/artifact.js';

const PLAN_TYPES = new Set<ArtifactType>(['plan', 'design_note']);
const AUDIT_TYPES = new Set<ArtifactType>(['vulnerability_finding', 'audit_note']);
const SYNTHESIS_TYPES = new Set<ArtifactType>(['knowledge_synthesis', 'summary']);
const ANALYSIS_TYPES = new Set<ArtifactType>(['competitive_analysis', 'code_analysis']);
const RAW_TYPES = new Set<ArtifactType>(['raw_capture']);
const PLAN_KEYWORDS = /\[(plan|spec|design|proposal)\]/i;
const SOURCE_LINK = /https?:\/\//;
const SOURCE_MARKER = /\[source\]/i;

export function classifyStatus(
  content: string,
  type: ArtifactType,
  override?: ArtifactStatus,
): ArtifactStatus {
  if (override !== undefined) return override;

  // Raw captures start as draft
  if (RAW_TYPES.has(type)) {
    return 'draft';
  }

  // Knowledge synthesis needs validation
  if (SYNTHESIS_TYPES.has(type)) {
    return 'needs_sources';
  }

  // Competitive analysis needs source citations
  if (ANALYSIS_TYPES.has(type) && !SOURCE_LINK.test(content) && !SOURCE_MARKER.test(content)) {
    return 'needs_sources';
  }

  if (PLAN_TYPES.has(type) || PLAN_KEYWORDS.test(content)) {
    return 'review_needed';
  }

  if (AUDIT_TYPES.has(type) && !SOURCE_LINK.test(content) && !SOURCE_MARKER.test(content)) {
    return 'needs_sources';
  }

  if (
    content.length > 300 &&
    !SOURCE_LINK.test(content) &&
    !SOURCE_MARKER.test(content)
  ) {
    return 'needs_sources';
  }

  return 'draft';
}
