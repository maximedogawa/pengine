import { isNewer } from "./semver";
import type { ReleaseAsset } from "./platform";

const RELEASES_API_URL = "https://api.github.com/repos/pengine-ai/pengine/releases/latest";
export const RELEASES_PAGE_URL = "https://github.com/pengine-ai/pengine/releases/latest";

const CACHE_KEY = "pengine-updater-cache";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export type LatestRelease = {
  tag: string;
  htmlUrl: string;
  assets: ReleaseAsset[];
  checkedAt: number;
};

export async function getLatestRelease(options?: {
  force?: boolean;
}): Promise<LatestRelease | null> {
  const cached = readCache();
  if (!options?.force && cached && Date.now() - cached.checkedAt < CACHE_TTL_MS) {
    return cached;
  }
  try {
    const res = await fetch(RELEASES_API_URL, {
      headers: { Accept: "application/vnd.github+json" },
    });
    if (!res.ok) return cached;
    const data = (await res.json()) as {
      tag_name?: string;
      html_url?: string;
      assets?: Array<{ name?: string; browser_download_url?: string }>;
    };
    const release: LatestRelease = {
      tag: String(data.tag_name ?? ""),
      htmlUrl: String(data.html_url ?? RELEASES_PAGE_URL),
      assets: (data.assets ?? []).map((a) => ({
        name: String(a.name ?? ""),
        browser_download_url: String(a.browser_download_url ?? ""),
      })),
      checkedAt: Date.now(),
    };
    writeCache(release);
    return release;
  } catch {
    return cached;
  }
}

export function hasUpdate(
  current: string | null | undefined,
  latest: LatestRelease | null,
): boolean {
  if (!current || !latest?.tag) return false;
  return isNewer(latest.tag, current);
}

function readCache(): LatestRelease | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LatestRelease;
    if (!parsed.tag || typeof parsed.checkedAt !== "number") return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeCache(value: LatestRelease): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(value));
  } catch {
    // storage full or blocked — skip caching, next call will refetch
  }
}
