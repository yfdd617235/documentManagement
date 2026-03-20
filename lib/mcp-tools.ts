/**
 * MCP Tool Schemas — OpenAI function-calling format.
 *
 * These schemas are included in EVERY LLM request (Mode 1 and Mode 2).
 * In Mode 1 the LLM will not invoke them; in Mode 2 it will.
 *
 * Rule: All tool executions require a logged user approval before Drive operations.
 */

export const MCP_TOOLS = [
  {
    type: 'function' as const,
    function: {
      name: 'copy_file',
      description:
        'Copy a Google Drive file to a destination folder. ' +
        'ONLY call this after the user has explicitly approved the classification plan. ' +
        'Never use this to move or modify the original file.',
      parameters: {
        type: 'object',
        properties: {
          file_id: {
            type: 'string',
            description: 'The Google Drive file ID of the file to copy.',
          },
          destination_folder_id: {
            type: 'string',
            description: 'The Google Drive folder ID where the copy will be placed.',
          },
          new_name: {
            type: 'string',
            description: 'Optional new name for the copied file. If omitted, the original name is preserved.',
          },
        },
        required: ['file_id', 'destination_folder_id'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'create_folder',
      description:
        'Create a new folder inside an existing Google Drive folder. ' +
        'Returns the new folder ID which is then used as destination for copy_file calls.',
      parameters: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: 'The name of the new folder to create.',
          },
          parent_id: {
            type: 'string',
            description: 'The Google Drive folder ID of the parent folder. Use "root" for the user\'s My Drive root.',
          },
        },
        required: ['name', 'parent_id'],
        additionalProperties: false,
      },
    },
  },
] as const;

export type MCPToolName = 'copy_file' | 'create_folder';
