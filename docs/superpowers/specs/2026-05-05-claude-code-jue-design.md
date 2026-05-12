# Claude Code Jue Design

## Goal

Build a Claude Code plugin that gives Claude Code the complete Jue behavior layer: ROOT/SOUL judgment context, Harness3 activation, judgment triplet storage, harness generation/evolution, active harness injection, auto-selection, and compression continuity.

## Scope

This first implementation targets behavior and mechanism completeness, not Claude Code source patch parity. It must not modify Claude Code's installation files. It loads through official Claude Code plugin surfaces: plugin manifest, main agent, hooks, MCP server, and an optional PowerShell wrapper.

## Architecture

The plugin has four cooperating parts:

1. **Agent prompt**: establishes the Jue posture and instructs Claude to use the Jue MCP tool for triplets and harness state.
2. **MCP server**: exposes one `river_harness` tool with the same action vocabulary as Hermes Jue: record/search/list/flag/merge/delete/check convergence/generate/evolve/list/activate/deactivate/get active.
3. **Hooks**: inject ROOT, SOUL, harness manifest, active HARNESS.md, and relevant triplets at SessionStart and UserPromptSubmit. PreCompact emits Jue continuity context.
4. **Persistent state**: stores runtime data under `${CLAUDE_PLUGIN_DATA}/jue`, not inside Claude Code or WSL `.river`.

## Data Model

Runtime state mirrors Jue WSL:

- `harness3/state.json`: active harness and activation history.
- `harness3/index.json`: triplet index.
- `harness3/triplets/{triplet_id}.json`: full judgment triplets.
- `harness3/harnesses/{harness_id}/HARNESS.md`: human-readable harness body.
- `harness3/harnesses/{harness_id}/meta.json`: machine metadata.
- `harness3/harnesses/archive/{harness_id}_v{version}/`: archived old harness versions.

## Injection Behavior

SessionStart injects ROOT/SOUL and the harness manifest. UserPromptSubmit additionally auto-selects a harness unless user/model sticky state says not to. If a harness is active, the hook injects its ROOT supplement, optional SOUL override, and full HARNESS.md.

The hook output uses Claude Code's `additionalContext`, so the injected content enters the conversation as a system reminder instead of replacing Claude Code's native prompt.

## Tool Behavior

The MCP server returns JSON text. It validates the same core semantics as Hermes Jue:

- Triplets require situation, judgment, and structure.
- Generated harnesses require a non-empty name and at least three tags.
- `evolve_harness` supports both append-by-triplet and rewrite fields.
- Harness activation writes state and returns reference content so the current turn has immediate visibility.
- Hard delete requires a reason and explicit confirmation.

## Verification

Use Node's test runner for store/tool/context behavior, Claude Code's plugin validator for structure, and a local Claude Code `--plugin-dir` smoke test for MCP/hook loading.
