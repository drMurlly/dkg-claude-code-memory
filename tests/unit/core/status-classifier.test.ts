/**
 * Unit tests for status-classifier.
 * Tests classifyStatus() with all artifact types, content patterns, and override logic.
 */

import { describe, it, expect } from 'vitest';
import { classifyStatus } from '../../../src/core/status-classifier.js';
import type { ArtifactStatus, ArtifactType } from '../../../src/types/artifact.js';

const SHORT = 'Short content under 300 chars.';
const LONG = 'x'.repeat(301);
const WITH_URL = 'See https://example.com for details ' + 'x'.repeat(50);
const WITH_SOURCE_MARKER = 'See [source] for details ' + 'x'.repeat(50);

describe('classifyStatus()', () => {

  // ─────────────────────────────────────────
  // Override logic (highest priority)
  // ─────────────────────────────────────────
  describe('override parameter', () => {
    it('returns override when provided — draft', () => {
      expect(classifyStatus(LONG, 'knowledge_synthesis', 'draft')).toBe('draft');
    });

    it('returns override when provided — validated', () => {
      expect(classifyStatus(SHORT, 'raw_capture', 'validated')).toBe('validated');
    });

    it('returns override when provided — ready_to_share', () => {
      expect(classifyStatus(SHORT, 'plan', 'ready_to_share')).toBe('ready_to_share');
    });

    it('returns override when provided — deprecated', () => {
      expect(classifyStatus(SHORT, 'chat', 'deprecated')).toBe('deprecated');
    });

    it('returns override when provided — discarded', () => {
      expect(classifyStatus(LONG, 'research_note', 'discarded')).toBe('discarded');
    });

    it('returns override when provided — needs_sources', () => {
      expect(classifyStatus(SHORT, 'raw_capture', 'needs_sources')).toBe('needs_sources');
    });

    it('returns override when provided — review_needed', () => {
      expect(classifyStatus(SHORT, 'raw_capture', 'review_needed')).toBe('review_needed');
    });
  });

  // ─────────────────────────────────────────
  // raw_capture type
  // ─────────────────────────────────────────
  describe('raw_capture type', () => {
    it('returns draft for raw_capture regardless of content length', () => {
      expect(classifyStatus(LONG, 'raw_capture')).toBe('draft');
    });

    it('returns draft for short raw_capture', () => {
      expect(classifyStatus(SHORT, 'raw_capture')).toBe('draft');
    });

    it('returns draft for raw_capture even with URL', () => {
      expect(classifyStatus(WITH_URL, 'raw_capture')).toBe('draft');
    });
  });

  // ─────────────────────────────────────────
  // knowledge_synthesis type
  // ─────────────────────────────────────────
  describe('knowledge_synthesis type', () => {
    it('returns needs_sources for knowledge_synthesis', () => {
      expect(classifyStatus(SHORT, 'knowledge_synthesis')).toBe('needs_sources');
    });

    it('returns needs_sources for knowledge_synthesis even with URL', () => {
      expect(classifyStatus(WITH_URL, 'knowledge_synthesis')).toBe('needs_sources');
    });

    it('returns needs_sources for knowledge_synthesis with long content', () => {
      expect(classifyStatus(LONG, 'knowledge_synthesis')).toBe('needs_sources');
    });
  });

  // ─────────────────────────────────────────
  // summary type
  // ─────────────────────────────────────────
  describe('summary type', () => {
    it('returns needs_sources for summary', () => {
      expect(classifyStatus(SHORT, 'summary')).toBe('needs_sources');
    });

    it('returns needs_sources for summary with URL', () => {
      expect(classifyStatus(WITH_URL, 'summary')).toBe('needs_sources');
    });
  });

  // ─────────────────────────────────────────
  // competitive_analysis and code_analysis types
  // ─────────────────────────────────────────
  describe('analysis types', () => {
    it('returns needs_sources for competitive_analysis without URL', () => {
      expect(classifyStatus('Analysis content ' + 'x'.repeat(50), 'competitive_analysis')).toBe('needs_sources');
    });

    it('returns draft for competitive_analysis with URL', () => {
      expect(classifyStatus(WITH_URL, 'competitive_analysis')).toBe('draft');
    });

    it('returns draft for competitive_analysis with [source] marker', () => {
      expect(classifyStatus(WITH_SOURCE_MARKER, 'competitive_analysis')).toBe('draft');
    });

    it('returns needs_sources for code_analysis without URL', () => {
      expect(classifyStatus('Analysis ' + 'x'.repeat(50), 'code_analysis')).toBe('needs_sources');
    });

    it('returns draft for code_analysis with URL reference', () => {
      expect(classifyStatus(WITH_URL, 'code_analysis')).toBe('draft');
    });
  });

  // ─────────────────────────────────────────
  // plan type
  // ─────────────────────────────────────────
  describe('plan type', () => {
    it('returns review_needed for plan type', () => {
      expect(classifyStatus(SHORT, 'plan')).toBe('review_needed');
    });

    it('returns review_needed for plan type with URL', () => {
      expect(classifyStatus(WITH_URL, 'plan')).toBe('review_needed');
    });

    it('returns review_needed for plan type with long content', () => {
      expect(classifyStatus(LONG, 'plan')).toBe('review_needed');
    });
  });

  // ─────────────────────────────────────────
  // design_note type
  // ─────────────────────────────────────────
  describe('design_note type', () => {
    it('returns review_needed for design_note type', () => {
      expect(classifyStatus(SHORT, 'design_note')).toBe('review_needed');
    });

    it('returns review_needed for design_note with URL', () => {
      expect(classifyStatus(WITH_URL, 'design_note')).toBe('review_needed');
    });
  });

  // ─────────────────────────────────────────
  // Plan keyword detection in content
  // ─────────────────────────────────────────
  describe('plan keyword detection in content', () => {
    it('returns review_needed when content contains [plan]', () => {
      expect(classifyStatus('[plan] for the new feature', 'chat')).toBe('review_needed');
    });

    it('returns review_needed when content contains [spec]', () => {
      expect(classifyStatus('[spec] for the new API', 'research_note')).toBe('review_needed');
    });

    it('returns review_needed when content contains [design]', () => {
      expect(classifyStatus('[design] document', 'other')).toBe('review_needed');
    });

    it('returns review_needed when content contains [proposal]', () => {
      expect(classifyStatus('[proposal] for changes', 'other')).toBe('review_needed');
    });

    it('is case-insensitive for plan keywords', () => {
      expect(classifyStatus('[PLAN] implementation', 'chat')).toBe('review_needed');
      expect(classifyStatus('[Spec] API design', 'chat')).toBe('review_needed');
    });
  });

  // ─────────────────────────────────────────
  // vulnerability_finding and audit_note types
  // ─────────────────────────────────────────
  describe('audit types', () => {
    it('returns needs_sources for vulnerability_finding without URL', () => {
      expect(classifyStatus('finding description ' + 'x'.repeat(50), 'vulnerability_finding')).toBe('needs_sources');
    });

    it('returns draft for vulnerability_finding with URL', () => {
      expect(classifyStatus(WITH_URL, 'vulnerability_finding')).toBe('draft');
    });

    it('returns draft for vulnerability_finding with [source] marker', () => {
      expect(classifyStatus(WITH_SOURCE_MARKER, 'vulnerability_finding')).toBe('draft');
    });

    it('returns needs_sources for audit_note without URL', () => {
      expect(classifyStatus('audit note content', 'audit_note')).toBe('needs_sources');
    });

    it('returns draft for audit_note with URL reference', () => {
      expect(classifyStatus(WITH_URL, 'audit_note')).toBe('draft');
    });
  });

  // ─────────────────────────────────────────
  // Long content > 300 chars
  // ─────────────────────────────────────────
  describe('long content (>300 chars)', () => {
    it('returns needs_sources for chat with >300 chars and no URL', () => {
      expect(classifyStatus(LONG, 'chat')).toBe('needs_sources');
    });

    it('returns needs_sources for research_note with >300 chars and no URL', () => {
      expect(classifyStatus(LONG, 'research_note')).toBe('needs_sources');
    });

    it('returns needs_sources for markdown with >300 chars and no URL', () => {
      expect(classifyStatus(LONG, 'markdown')).toBe('needs_sources');
    });

    it('returns draft for implementation_log with >300 chars and URL', () => {
      const longWithUrl = WITH_URL + 'x'.repeat(300);
      expect(classifyStatus(longWithUrl, 'implementation_log')).toBe('draft');
    });

    it('returns draft for other with >300 chars and [source]', () => {
      const longWithSource = WITH_SOURCE_MARKER + 'x'.repeat(300);
      expect(classifyStatus(longWithSource, 'other')).toBe('draft');
    });
  });

  // ─────────────────────────────────────────
  // Short content (<=300 chars) → draft
  // ─────────────────────────────────────────
  describe('short content (<=300 chars) falls through to draft', () => {
    it('returns draft for chat with short content', () => {
      expect(classifyStatus(SHORT, 'chat')).toBe('draft');
    });

    it('returns draft for research_note with short content', () => {
      expect(classifyStatus(SHORT, 'research_note')).toBe('draft');
    });

    it('returns draft for implementation_log with short content', () => {
      expect(classifyStatus(SHORT, 'implementation_log')).toBe('draft');
    });

    it('returns draft for markdown with short content', () => {
      expect(classifyStatus(SHORT, 'markdown')).toBe('draft');
    });

    it('returns draft for other with short content', () => {
      expect(classifyStatus(SHORT, 'other')).toBe('draft');
    });

    it('returns draft at exactly 300 chars (boundary)', () => {
      const exactly300 = 'x'.repeat(300);
      expect(classifyStatus(exactly300, 'chat')).toBe('draft');
    });

    it('returns needs_sources at 301 chars (boundary)', () => {
      const exactly301 = 'x'.repeat(301);
      expect(classifyStatus(exactly301, 'chat')).toBe('needs_sources');
    });
  });

  // ─────────────────────────────────────────
  // URL and source marker detection
  // ─────────────────────────────────────────
  describe('source detection', () => {
    it('detects http:// URLs as source', () => {
      const result = classifyStatus('Content https://docs.example.com with ref ' + 'x'.repeat(300), 'chat');
      expect(result).toBe('draft');
    });

    it('detects http:// (not https) URLs as source', () => {
      const result = classifyStatus('Content http://example.com/ref ' + 'x'.repeat(300), 'chat');
      expect(result).toBe('draft');
    });

    it('detects [source] marker in content', () => {
      const result = classifyStatus('[source] referenced ' + 'x'.repeat(300), 'chat');
      expect(result).toBe('draft');
    });

    it('detects [Source] marker (case-insensitive)', () => {
      const result = classifyStatus('[Source] referenced ' + 'x'.repeat(300), 'chat');
      expect(result).toBe('draft');
    });

    it('detects [SOURCE] marker (uppercase)', () => {
      const result = classifyStatus('[SOURCE] referenced ' + 'x'.repeat(300), 'chat');
      expect(result).toBe('draft');
    });
  });

  // ─────────────────────────────────────────
  // All artifact types covered
  // ─────────────────────────────────────────
  describe('all artifact types have defined behaviour', () => {
    const allTypes: ArtifactType[] = [
      'chat', 'research_note', 'code_analysis', 'markdown', 'plan', 'summary',
      'design_note', 'implementation_log', 'vulnerability_finding', 'audit_note',
      'competitive_analysis', 'knowledge_synthesis', 'raw_capture', 'other',
    ];

    const validStatuses: ArtifactStatus[] = [
      'draft', 'needs_sources', 'review_needed', 'validated', 'ready_to_share',
      'deprecated', 'discarded',
    ];

    it.each(allTypes)('classifyStatus returns valid status for type: %s', (type) => {
      const result = classifyStatus(SHORT, type);
      expect(validStatuses).toContain(result);
    });

    it.each(allTypes)('classifyStatus returns valid status for type %s with long content', (type) => {
      const result = classifyStatus(LONG, type);
      expect(validStatuses).toContain(result);
    });
  });
});
