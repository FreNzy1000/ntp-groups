from __future__ import annotations

import hashlib
import json
import shutil
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / "dist"
EDGE_DIST = DIST / "edge"

RUNTIME_FILES = [
    "manifest.json",
    "background.js",
    "newtab.html",
    "newtab.css",
    "newtab.js",
    "icons/icon16.png",
    "icons/icon32.png",
    "icons/icon48.png",
    "icons/icon128.png",
]

# Fixed timestamp makes repeated builds byte-identical when source bytes are unchanged.
FIXED_TIME = (2026, 8, 18, 0, 0, 0)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest().upper()


def build_zip(output: Path) -> None:
    output.parent.mkdir(parents=True, exist_ok=True)
    if output.exists():
        output.unlink()
    with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for relative in RUNTIME_FILES:
            source = ROOT / relative
            if not source.is_file():
                raise FileNotFoundError(relative)
            info = zipfile.ZipInfo(relative.replace("\\", "/"), date_time=FIXED_TIME)
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o100644 << 16
            archive.writestr(info, source.read_bytes(), compress_type=zipfile.ZIP_DEFLATED, compresslevel=9)


def main() -> None:
    manifest = json.loads((ROOT / "manifest.json").read_text(encoding="utf-8"))
    version = manifest["version"]
    chromium = DIST / f"NTP-Groups-{version}.zip"
    edge = EDGE_DIST / f"NTP-Groups-{version}-edge.zip"

    build_zip(chromium)
    edge.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(chromium, edge)

    chromium_hash = sha256(chromium)
    edge_hash = sha256(edge)
    if chromium.read_bytes() != edge.read_bytes():
        raise RuntimeError("Chromium and Edge packages are not byte-identical")

    with zipfile.ZipFile(chromium) as archive:
        names = archive.namelist()
        if names != RUNTIME_FILES:
            raise RuntimeError(f"Unexpected ZIP contents: {names}")
        packaged_manifest = json.loads(archive.read("manifest.json"))
        if packaged_manifest.get("version") != version:
            raise RuntimeError("Packaged manifest version mismatch")
        if packaged_manifest.get("update_url"):
            raise RuntimeError("Packaged manifest unexpectedly contains update_url")

    print(json.dumps({
        "version": version,
        "chromium": str(chromium),
        "edge": str(edge),
        "bytes": chromium.stat().st_size,
        "sha256": chromium_hash,
        "edge_sha256": edge_hash,
        "byte_identical": True,
        "files": RUNTIME_FILES,
    }, indent=2))


if __name__ == "__main__":
    main()
