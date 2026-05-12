# Jue Agent Runtime

中文 | [English](./README_EN.md)

Jue Agent Runtime 是一个面向 Agent 系统的判断层。这个仓库保存当前可运行的 Claude Code 适配器和 Jue 运行时实现。

Jue 不是普通提示词包，也不是传统工作流引擎。它关注的是让 Agent 在真实任务中保持判断力：为什么这样做，什么时候该问，什么时候该停，什么时候该切换到更合适的领域判断主体，以及什么时候应该承认不确定。

## 核心理念

多数 Agent 积累的是方法：怎么调用工具，怎么遵循流程，怎么完成任务。Jue 积累的是判断理由：在什么情境下做出了什么判断，为什么这个判断成立，以及这个判断背后的结构能不能带到未来任务里继续使用。

在代码、法律、销售策略、研究、运营等垂直领域里，难点往往不只是会不会用工具。真正难的是知道什么重要、哪里不确定、缺少什么证据、有没有真正理解用户意图，以及 Agent 是不是只是在沿着自己的惯性执行，或者过度附和用户。

Jue 给模型提供判断力的来源和方向。一个有用的 Agent 不应该只是继续执行。当它不确定时，它应该能承认不确定，慢下来，并向用户追问为什么。

## 运行时结构

当前运行时包括：

- `ROOT_PARADIGM`：根判断框架。
- `SOUL`：默认判断底色。
- `Harness3`：领域判断主体，例如代码、法律、销售策略。
- `JudgmentTriplet`：可复用的判断记录，包含情境、判断和结构。
- Hooks：接入 Claude Code 的 session start、user prompt submit、compaction、tool batch 等时机。
- MCP 工具：`river_harness`，用于记录 triplet、搜索判断记录、激活 harness、生成 harness、进化 harness。
- 状态栏：可选的 Claude Code 当前活跃 harness 显示。

运行时默认把状态保存在仓库外部的 `~/.jue-claude-code`，除非用户主动设置 `JUE_STATE_DIR`。

## 当前适配器

这个仓库当前提供 Claude Code 插件适配器：

- `.claude-plugin/plugin.json`
- `.mcp.json`
- `hooks/hooks.json`
- `agents/jue.md`
- `server/`
- `scripts/`
- `seed/harness3/`

整体设计会尽量保持适配器友好。后续 Jue 判断运行时可以通过 MCP 或其他适配接口接入 Codex、Claude Code，或者其他 Agent 平台。

## 本地安装

安装依赖：

```powershell
cd path\to\jue-agent-runtime
npm install
```

用本地插件启动 Claude Code：

```powershell
.\bin\claude-jue.ps1
```

也可以直接启动：

```powershell
claude --plugin-dir . --agent jue:jue --append-system-prompt-file .\root\BOOTSTRAP.md
```

管理命令：

```powershell
npm run jue -- status
npm run jue -- list
npm run jue -- activate code-craft
npm run jue -- deactivate
```

## 验证

```powershell
npm test
claude plugin validate .
```

`claude plugin validate .` 需要本机已经安装 Claude Code，并且可以在 `PATH` 中直接调用 `claude`。

## 许可证

这个仓库是 source-available，不是 OSI 意义上的开源项目。

非商业使用允许遵循 [PolyForm Noncommercial License 1.0.0](./LICENSE)。

商业使用需要提前获得 River（韦祖舵）的书面授权。商业使用包括但不限于：

- 在付费产品或服务中使用 Jue、Harness3、JudgmentTriplet、ROOT_PARADIGM、SOUL 或相关运行机制
- 将本项目集成到 SaaS、咨询交付、企业部署、客户项目、内部业务系统或商业 AI Agent 中
- 将本项目或其中的判断系统组件作为付费产品的一部分进行销售、转售、托管或提供服务

详情见 [LICENSE](./LICENSE)。

## 项目状态

这是早期公开运行时版本，正在向更清晰的结构重构：

```text
ROOT_SOUL
+ PARADIGM
+ active Harness3
+ orientation / triplets / manifest
+ small_soul heartbeat
```

当前仓库保留了已经跑通的 Claude Code 实现，同时后续会继续抽象出更干净的通用运行时。
