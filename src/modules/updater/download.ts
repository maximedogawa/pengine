/** Open a URL the way the current runtime expects: Tauri → default browser, web → new tab. */
export async function openDownload(url: string): Promise<void> {
  try {
    const { openUrl } = await import("@tauri-apps/plugin-opener");
    await openUrl(url);
  } catch {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}
