// No imports needed

/**
 * MCP Tool definitions for Mode 2 (Classification)
 * These are injected into the LLM context so it can decide when to trigger them.
 * Note: Mode 1 ignores these, but passing them is safe.
 *
 * Principle: "Use what Google manages" -> We only define the tool schemas here.
 * The actual execution happens via server actions / API routes after user approval.
 */
export const MCP_TOOLS = {
  create_folder: {
    description: 'Create a new folder in Google Drive',
    parameters: {
      type: 'object',
      properties: {
        folderName: {
          type: 'string',
          description: 'Name of the new folder to create',
        },
        parentFolderId: {
          type: 'string',
          description: 'Optional ID of the parent folder where this should be created',
        },
      },
      required: ['folderName'],
    },
  },
  copy_file: {
    description: 'Copy a file in Google Drive to a destination folder',
    parameters: {
      type: 'object',
      properties: {
        fileId: {
          type: 'string',
          description: 'The Google Drive ID of the file to copy',
        },
        destinationFolderId: {
          type: 'string',
          description: 'The Google Drive ID of the folder to copy the file into',
        },
        newName: {
          type: 'string',
          description: 'Optional new name for the copied file',
        },
      },
      required: ['fileId', 'destinationFolderId'],
    },
  },
};
