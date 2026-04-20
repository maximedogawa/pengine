import { useEffect, useState } from "react";
import { getLatestRelease, RELEASES_PAGE_URL, type LatestRelease } from "../api";
import { openDownload } from "../download";
import { detectPlatform, pickAssetForPlatform, PLATFORM_LABEL } from "../platform";

type Props = { className?: string };

export function DownloadLatestButton({ className }: Props) {
  const [release, setRelease] = useState<LatestRelease | null>(null);
  const platform = detectPlatform();

  useEffect(() => {
    let cancelled = false;
    void getLatestRelease({ force: true }).then((r) => {
      if (!cancelled) setRelease(r);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleClick = () => {
    const asset = release ? pickAssetForPlatform(release.assets, platform) : null;
    const url = asset?.browser_download_url ?? release?.htmlUrl ?? RELEASES_PAGE_URL;
    void openDownload(url);
  };

  const label =
    platform === "unknown" ? "Download latest" : `Download for ${PLATFORM_LABEL[platform]}`;

  return (
    <button
      type="button"
      onClick={handleClick}
      className={className ?? "primary-button px-6"}
      data-testid="download-latest"
    >
      {label}
      {release?.tag ? (
        <span className="ml-2 font-mono text-xs opacity-70">{release.tag}</span>
      ) : null}
    </button>
  );
}
