import { Tool } from "../types/tool.js";
import { DkgClient } from "../core/dkg-client.js";

/**
 * get_node_status — check DKG node health via DkgClient.getStatus()
 *
 * Uses the DKG client's getStatus() method which verifies the DKG API
 * actually responds (not just port-open check).
 */
export const getNodeStatusTool: Tool = {
  name: "get_node_status",
  description: "Check the health and status of the connected DKG node",
  inputSchema: {
    type: "object" as const,
    properties: {},
    required: [],
  },

  async execute(deps: { client: DkgClient }) {
    try {
      const status = await deps.client.getStatus();
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(status, null, 2),
          },
        ],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        content: [
          {
            type: "text" as const,
            text: `Node status check failed: ${message}`,
          },
        ],
        isError: true,
      };
    }
  },
};
