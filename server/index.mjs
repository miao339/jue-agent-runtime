import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { ACTIONS, riverHarness } from "./jue/tool.mjs";

const server = new McpServer({
  name: "jue-harness3",
  version: "0.1.0"
});

server.registerTool(
  "river_harness",
  {
    title: "River Harness3",
    description:
      "River/Jue 判断力工具。Triplet/Harness 记录的是为什么这么判断，不是 memory 或 skill。常用 action: record_triplet, search_triplets, list_triplets, generate_harness, evolve_harness, activate_harness, deactivate_harness, get_active_harness.",
    inputSchema: {
      action: z.enum(ACTIONS),
      content: z.string().optional(),
      situation: z.string().optional(),
      judgment: z.string().optional(),
      structure: z.string().optional(),
      query: z.string().optional(),
      tags: z.array(z.string()).optional(),
      track: z.string().optional(),
      task_id: z.string().optional(),
      session_id: z.string().optional(),
      limit: z.number().optional(),
      triplet_id: z.string().optional(),
      status: z.string().optional(),
      source_status: z.string().optional(),
      confirm_delete: z.boolean().optional(),
      triplet_ids: z.array(z.string()).optional(),
      harness_id: z.string().optional(),
      reason: z.string().optional(),
      name: z.string().optional(),
      category: z.string().optional(),
      root_paradigm_fragment: z.string().optional(),
      soul: z.string().optional(),
      evolution_direction: z.string().optional()
    }
  },
  async (args) => {
    const result = await riverHarness(args, { rootDir: process.env.JUE_STATE_DIR });
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(result, null, 2)
        }
      ]
    };
  }
);

await server.connect(new StdioServerTransport());
