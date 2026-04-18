export type PengineHealth = {
  status: string;
  bot_connected: boolean;
  bot_username?: string;
  bot_id?: string | null;
  app_version?: string;
  git_commit?: string;
};

/**
 * One daily `audit-YYYY-MM-DD.log` row from disk (Tauri `AuditFileEntry` over IPC).
 * Keep `size_bytes` in snake_case: it must match serde field names from the Rust struct;
 * renaming to camelCase would break deserialization.
 */
export type AuditLogFileInfo = {
  date: string;
  filename: string;
  size_bytes: number;
};
