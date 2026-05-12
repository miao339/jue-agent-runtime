# Claude Code Jue Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local Claude Code plugin that provides the complete Jue / Harness3 behavior mechanism.

**Architecture:** Use Claude Code plugin components for integration and a Node MCP server for stateful tools. Store all runtime state in plugin data, and inject current judgment context through hooks.

**Tech Stack:** Claude Code plugins, Node.js ESM, MCP SDK, zod, Node test runner.

---

### Task 1: Plugin Shell

**Files:**
- Create: `.claude-plugin/plugin.json`
- Create: `.mcp.json`
- Create: `settings.json`
- Create: `hooks/hooks.json`
- Create: `package.json`

- [x] Add plugin metadata and default component locations.
- [x] Register the `jue` MCP server.
- [x] Set the main session agent to `jue`.
- [x] Register SessionStart, UserPromptSubmit, PostToolBatch, and PreCompact hooks.

### Task 2: Judgment Runtime

**Files:**
- Create: `server/jue/storage.mjs`
- Create: `server/jue/triplets.mjs`
- Create: `server/jue/harnesses.mjs`
- Create: `server/jue/autoSelect.mjs`
- Create: `server/jue/context.mjs`
- Create: `server/jue/tool.mjs`

- [x] Implement runtime directory initialization.
- [x] Implement triplet CRUD, search, status governance, and merge.
- [x] Implement harness write/read/evolve/archive.
- [x] Implement auto-selection from name/category/tags/HARNESS.md.
- [x] Implement context building for hooks and activation responses.
- [x] Implement all `river_harness` actions.

### Task 3: Claude Code Integration

**Files:**
- Create: `server/index.mjs`
- Create: `scripts/hook.mjs`
- Create: `agents/jue.md`
- Create: `skills/harness-creation/SKILL.md`
- Create: `skills/harness-evolution/SKILL.md`
- Create: `skills/code-craft/SKILL.md`
- Create: `bin/claude-jue.ps1`

- [x] Register MCP tool with Claude Code.
- [x] Emit hook `additionalContext`.
- [x] Provide main Jue agent instructions.
- [x] Provide skills for harness creation/evolution/code-craft.
- [x] Provide a Windows PowerShell wrapper for local launch.

### Task 4: Seeds And Tests

**Files:**
- Create: `seed/harness3/harnesses/code-craft/HARNESS.md`
- Create: `seed/harness3/harnesses/code-craft/meta.json`
- Create: `test/jue.test.mjs`
- Create: `README.md`

- [x] Seed `code-craft` from Jue WSL's current mechanism.
- [x] Test triplet recording/search/list/status.
- [x] Test harness generation/evolution/archive.
- [x] Test active harness context injection.
- [x] Validate the plugin with Claude Code.
