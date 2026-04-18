import { useEffect, useState } from "react";
import { getLatestRelease, hasUpdate, RELEASES_PAGE_URL, type LatestRelease } from "../api";
import { openDownload } from "../download";
import { detectPlatform, pickAssetForPlatform } from "../platform";

type Props = { currentVersion: string | null };

export function UpdateIndicator({ currentVersion }: Props) {
  const [release, setRelease] = useState<LatestRelease | null>(null);

  useEffect(() => {
    let cancelled = false;
    void getLatestRelease().then((r) => {
      if (!cancelled) setRelease(r);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!release || !hasUpdate(currentVersion, release)) return null;

  const asset = pickAssetForPlatform(release.assets, detectPlatform());
  const downloadUrl = asset?.browser_download_url ?? release.htmlUrl ?? RELEASES_PAGE_URL;

  return (
    <div
      className="mt-2 inline-flex items-center gap-2 rounded-lg border border-yellow-300/30 bg-yellow-300/10 px-3 py-1.5"
      data-testid="update-indicator"
    >
      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-yellow-300 shadow-[0_0_6px_rgba(252,211,77,0.5)]" />
      <span className="font-mono text-[11px] text-yellow-100">Update available: {release.tag}</span>
      <button
        type="button"
        onClick={() => void openDownload(downloadUrl)}
        className="rounded-md border border-yellow-300/30 bg-yellow-300/15 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.1em] text-yellow-100 transition hover:bg-yellow-300/25"
      >
        Download
      </button>
    </div>
  );
}
