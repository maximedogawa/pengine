export type Platform = "macos" | "windows" | "linux" | "unknown";

export type ReleaseAsset = { name: string; browser_download_url: string };

export function detectPlatform(): Platform {
  if (typeof navigator === "undefined") return "unknown";
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes("mac")) return "macos";
  if (ua.includes("win")) return "windows";
  if (ua.includes("linux") || ua.includes("x11")) return "linux";
  return "unknown";
}

// Preference order matches what `app-release.yml` publishes. First hit wins.
const EXTENSIONS: Record<Platform, string[]> = {
  macos: [".dmg"],
  windows: [".msi", ".exe"],
  linux: [".AppImage", ".deb"],
  unknown: [],
};

export const PLATFORM_LABEL: Record<Platform, string> = {
  macos: "macOS",
  windows: "Windows",
  linux: "Linux",
  unknown: "your platform",
};

export function pickAssetForPlatform(
  assets: ReleaseAsset[],
  platform: Platform,
): ReleaseAsset | null {
  for (const ext of EXTENSIONS[platform]) {
    const match = assets.find((a) => a.name.toLowerCase().endsWith(ext.toLowerCase()));
    if (match) return match;
  }
  return null;
}
