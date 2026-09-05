"""Exact ownership and rendered checksums shared by generation and upgrades."""
from __future__ import annotations
import hashlib
import json
from pathlib import Path, PurePosixPath

PLATFORM_VERSION = "0.2.0"
LEGACY_SQL = {
    "110_user_management.sql", "120_clerk_authentication.sql", "130_application_settings.sql",
    "140_mcp_agents.sql", "150_mcp_write.sql", "160_setting_agent_actor.sql", "170_agent_accountability.sql",
}
LEGACY_FEATURES = {
    "auth/adapter.ts", "auth/config.ts", "auth/invitations.ts", "users/store.ts", "settings/store.ts",
    "mcp/access.ts", "mcp/admin.ts", "mcp/mutations.ts", "mcp/server.ts", "mcp/store.ts",
}
ROOT_FILES = {"package.json", "pnpm-lock.yaml", "pnpm-workspace.yaml", "next.config.ts",
              "tsconfig.json", "next-env.d.ts", "compose.yaml", ".gitignore", ".env.example", "RUNTIME.md"}

def digest(content: bytes) -> str:
    return hashlib.sha256(normalize_text(content)).hexdigest()


def normalize_text(content: bytes) -> bytes:
    if b"\x00" in content:
        return content
    try:
        content.decode("utf-8")
    except UnicodeDecodeError:
        return content
    return content.replace(b"\r\n", b"\n").replace(b"\r", b"\n")

def managed_name(name: str) -> bool:
    path = PurePosixPath(name)
    if path.is_absolute() or "\\" in name or ":" in name or any(p in ("", ".", "..") for p in name.split("/")):
        return False
    if name.startswith(("src/generated/", "database/generated/", "src/components/custom/", "src/app/api/custom/")):
        return False
    if name.startswith("src/features/"):
        return name.removeprefix("src/features/") in LEGACY_FEATURES
    if name.startswith("database/custom/"):
        return name.removeprefix("database/custom/") in LEGACY_SQL
    return name in ROOT_FILES or name == "src/proxy.ts" or name.startswith((
        "src/platform/", "src/lib/", "src/app/", "src/components/", "scripts/", "database/platform/"))

def render_runtime(runtime: Path, spec: dict) -> dict[str, bytes]:
    replacements = {
        "__APP_KEY__": spec["app"]["key"].replace("_", "-"),
        "__PRIMARY__": spec["app"].get("theme", {}).get("primary", "#6757E8"),
        "__SURFACE__": spec["app"].get("theme", {}).get("surface", "#151820"),
    }
    files = {}
    for path in sorted(runtime.rglob("*")):
        relative = path.relative_to(runtime)
        if any(part in {"node_modules", ".next", ".git", "__pycache__"} for part in relative.parts):
            continue
        if not path.is_file() or not managed_name(relative.as_posix()):
            continue
        if path.is_symlink():
            raise ValueError(f"Symlink in runtime: {relative}")
        raw = path.read_bytes()
        try:
            if b"\x00" in raw:
                files[relative.as_posix()] = raw
                continue
            content = normalize_text(raw).decode("utf-8")
            for token, value in replacements.items():
                content = content.replace(token, value)
            raw = content.encode("utf-8")
        except UnicodeDecodeError:
            pass
        files[relative.as_posix()] = raw
    return files

def manifest(files: dict[str, bytes]) -> dict:
    return {"format_version": 1, "factory_version": PLATFORM_VERSION,
            "files": {name: digest(content) for name, content in sorted(files.items())}}

def write_manifest(project: Path, runtime: Path, spec: dict) -> Path:
    path = project / "platform-manifest.json"
    path.write_text(json.dumps(manifest(render_runtime(runtime, spec)), indent=2) + "\n", encoding="utf-8", newline="\n")
    return path
