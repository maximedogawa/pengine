export type PengineHealth = {
  status: string;
  bot_connected: boolean;
  bot_username?: string;
  bot_id?: string | null;
};

/** One daily `audit-YYYY-MM-DD.log` row from disk (Tauri or File System Access API). */
export type AuditLogFileInfo = {
  date: string;
  filename: string;
  size_bytes: number;
};
