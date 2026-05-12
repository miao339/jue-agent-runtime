# Jue Agent Runtime

Jue Agent Runtime is a judgment layer for agent systems. This repository contains the current Claude Code adapter and runtime implementation.

Jue is not a normal prompt pack and not a normal workflow engine. Its goal is to help an agent keep judgment during real tasks: why it is doing something, when it should ask, when it should stop, when it should switch into a more suitable domain judgment subject, and when it should admit uncertainty.

## Core Idea

Most agents accumulate methods: how to use a tool, how to follow a workflow, how to complete a task. Jue accumulates judgment reasons: in what situation a judgment was made, why that judgment made sense, and what reusable structure can be carried into future tasks.

In vertical domains such as coding, law, sales strategy, research, or operations, the hard part is often not tool use. The hard part is knowing what matters, what is uncertain, what evidence is missing, whether the user intent is being understood correctly, and whether the agent is merely following its own momentum or over-agreeing with the user.

Jue gives the model a source and direction for judgment. A useful agent should not only continue executing. When uncertain, it should be able to say it is uncertain, slow down, and ask the user why.

## Runtime Structure

The current runtime includes:

- `ROOT_PARADIGM`: the root judgment frame.
- `SOUL`: the default judgment texture.
- `Harness3`: domain judgment subjects, such as code, law, or sales strategy.
- `JudgmentTriplet`: reusable records of situation, judgment, and structure.
- Hooks: Claude Code hook integration for session start, user prompt submit, compaction, and tool batch boundaries.
- MCP tool: a `river_harness` tool for recording triplets, searching judgment records, activating harnesses, generating harnesses, and evolving harnesses.
- Status line: optional active-harness display for Claude Code.

The runtime stores state outside the repository by default, under `~/.jue-claude-code`, unless `JUE_STATE_DIR` is provided.

## Current Adapter

This repository currently ships a Claude Code plugin adapter:

- `.claude-plugin/plugin.json`
- `.mcp.json`
- `hooks/hooks.json`
- `agents/jue.md`
- `server/`
- `scripts/`
- `seed/harness3/`

The design is intentionally adapter-friendly. The Jue judgment runtime can later be connected to Codex, Claude Code, or other agent platforms through MCP or other adapter interfaces.

## Install Locally

Install dependencies:

```powershell
cd path\to\jue-agent-runtime
npm install
```

Launch Claude Code with the local plugin:

```powershell
.\bin\claude-jue.ps1
```

Or launch directly:

```powershell
claude --plugin-dir . --agent jue:jue --append-system-prompt-file .\root\BOOTSTRAP.md
```

Admin commands:

```powershell
npm run jue -- status
npm run jue -- list
npm run jue -- activate code-craft
npm run jue -- deactivate
```

## Validation

```powershell
npm test
claude plugin validate .
```

`claude plugin validate .` requires Claude Code to be installed and available on `PATH`.

## License

This repository is source-available, not OSI open source.

Non-commercial use is permitted under the [PolyForm Noncommercial License 1.0.0](./LICENSE).

Commercial use requires prior written authorization from River (Zuduo Wei). Commercial use includes, but is not limited to:

- using Jue, Harness3, JudgmentTriplet, ROOT_PARADIGM, SOUL, or related runtime mechanisms in a paid product or service
- integrating this project into SaaS, consulting delivery, enterprise deployment, client projects, internal business systems, or commercial AI agents
- selling, reselling, hosting, or providing this project or its judgment-system components as part of a paid offering

See [LICENSE](./LICENSE) for details.

## Project Status

This is an early public runtime. It is being actively refactored toward a cleaner structure:

```text
ROOT_SOUL
+ PARADIGM
+ active Harness3
+ orientation / triplets / manifest
+ small_soul heartbeat
```

The current repository preserves the working Claude Code implementation while the cleaner runtime abstraction is being prepared.
