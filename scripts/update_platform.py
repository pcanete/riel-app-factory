#!/usr/bin/env python3
"""Plan or apply a three-way platform upgrade without replacing client code."""
from __future__ import annotations
import argparse
import json
import os
from pathlib import Path
import tempfile
from uuid import uuid4
from platform_files import digest, managed_name, manifest, render_runtime

BLOCKING = {"CONFLICT", "UNKNOWN_BASELINE", "MIGRATION_REVIEW"}

def safe_path(project: Path, name: str) -> Path:
    if name not in {"platform-manifest.json", ".factory-update.lock"} and not managed_name(name):
        raise ValueError(f"Ruta fuera de propiedad de plataforma: {name}")
    path = project / name
    for component in [path, *path.parents]:
        if component == project.parent:
            break
        if component.is_symlink() or (hasattr(component, "is_junction") and component.is_junction()):
            raise ValueError(f"No se actualizan enlaces o junctions: {name}")
    if not path.resolve().is_relative_to(project.resolve()):
        raise ValueError(f"Ruta fuera de la aplicación: {name}")
    return path

def read_manifest(project: Path) -> dict | None:
    path = safe_path(project, "platform-manifest.json")
    if not path.exists():
        return None
    data = json.loads(path.read_text(encoding="utf-8"))
    if data.get("format_version") != 1 or not isinstance(data.get("files"), dict):
        raise ValueError("Formato de manifiesto no soportado; no se adopta implícitamente.")
    for name, checksum in data["files"].items():
        safe_path(project, name)
        if not isinstance(checksum, str) or len(checksum) != 64 or any(c not in "0123456789abcdef" for c in checksum):
            raise ValueError(f"Checksum inválido: {name}")
    return data

def plan_update(project: Path, desired: dict[str, bytes]) -> dict:
    baseline = read_manifest(project)
    original = (baseline or {}).get("files", {})
    entries = []
    for name in sorted(set(original) | set(desired)):
        path = safe_path(project, name)
        if path.exists() and not path.is_file():
            raise ValueError(f"Se esperaba un archivo: {name}")
        actual = digest(path.read_bytes()) if path.exists() else None
        old = original.get(name)
        new = digest(desired[name]) if name in desired else None
        if baseline is None:
            state = "UNKNOWN_BASELINE"
        elif old is None and actual is not None:
            state = "CONFLICT"
        elif actual == new:
            state = "UNCHANGED"
        elif actual == old:
            state = "ADD" if old is None else "DELETE" if new is None else "UPDATE"
        elif new == old:
            state = "CLIENT_MODIFIED" if actual is not None else "CLIENT_DELETED"
        else:
            state = "CONFLICT"
        if name.endswith(".sql") and state in {"UPDATE", "DELETE"}:
            state = "MIGRATION_REVIEW"
        entries.append({"path": name, "state": state, "local_checksum": actual})
    # Unknown files remain client-owned and never become baseline by observing them.
    unknown = []
    for tree in ("src", "database", "scripts"):
        for path in sorted((project / tree).rglob("*")):
            name = path.relative_to(project).as_posix()
            if path.is_file() and name not in original and name not in desired and managed_name(name):
                unknown.append(name)
    return {"baseline_version": (baseline or {}).get("factory_version"),
            "target_version": manifest(desired)["factory_version"], "entries": entries,
            "unknown_files_preserved": unknown,
            "can_apply": baseline is not None and not any(e["state"] in BLOCKING for e in entries)}

def replace_bytes(path: Path, raw: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(dir=path.parent, delete=False, prefix=".factory-") as handle:
        staging = Path(handle.name)
        handle.write(raw)
    try:
        os.replace(staging, path)
    finally:
        staging.unlink(missing_ok=True)

def apply_update(project: Path, desired: dict[str, bytes], reviewed: dict) -> dict:
    if not reviewed["can_apply"]:
        raise ValueError("Actualización bloqueada; revisá baseline, conflictos y migraciones.")
    lock = safe_path(project, ".factory-update.lock")
    # A stale lock after a process/OS crash intentionally stops the next update.
    with lock.open("x", encoding="utf-8") as handle:
        handle.write("Actualización en curso. Si se interrumpe, restaurá el respaldo antes de retirar este archivo.\n")
    snapshots: dict[str, bytes | None] = {}
    backup = None
    recovery_needed = False
    try:
        current = plan_update(project, desired)
        if current != reviewed:
            raise ValueError("La aplicación cambió después del plan. Generá un plan nuevo.")
        changes = [e for e in current["entries"] if e["state"] in {"ADD", "UPDATE", "DELETE"}]
        paths = [e["path"] for e in changes] + ["platform-manifest.json"]
        for name in paths:
            path = safe_path(project, name)
            snapshots[name] = path.read_bytes() if path.exists() else None
        backup = project / f".factory-backup-{uuid4().hex}"
        backup.mkdir()
        for name, raw in snapshots.items():
            if raw is not None:
                dest = backup / name
                dest.parent.mkdir(parents=True, exist_ok=True)
                dest.write_bytes(raw)
        (backup / "restore.json").write_text(json.dumps({"previously_absent": [n for n,r in snapshots.items() if r is None], "plan": current}, indent=2), encoding="utf-8")
        lock.write_text(f"Respaldo: {backup.name}\nSi se interrumpe, restaurá estos archivos y retirá los previamente ausentes antes de quitar este lock.\n", encoding="utf-8")
        for entry in changes:
            path = safe_path(project, entry["path"])
            if entry["state"] == "DELETE":
                path.unlink()
            else:
                replace_bytes(path, desired[entry["path"]])
        # Last commit point: baseline describes factory contents, never client edits.
        replace_bytes(safe_path(project, "platform-manifest.json"), (json.dumps(manifest(desired), indent=2) + "\n").encode())
        return {**current, "applied": True, "backup": str(backup)}
    except BaseException:
        try:
            for name, raw in snapshots.items():
                path = safe_path(project, name)
                if raw is None:
                    path.unlink(missing_ok=True)
                else:
                    replace_bytes(path, raw)
        except BaseException:
            recovery_needed = True
            raise RuntimeError(f"Restauración incompleta. Conservá el lock y recuperá {backup}.")
        raise
    finally:
        if not recovery_needed:
            lock.unlink(missing_ok=True)

def adopt(project: Path, baseline_files: dict[str, bytes], apply: bool) -> dict:
    if read_manifest(project) is not None:
        raise ValueError("La aplicación ya tiene manifiesto.")
    differences = [name for name, raw in baseline_files.items()
                   if not safe_path(project, name).is_file() or digest(safe_path(project, name).read_bytes()) != digest(raw)]
    result = {"adoption": True, "differences": differences, "can_apply": not differences, "applied": False}
    if apply:
        if differences:
            raise ValueError("No se puede adoptar: la aplicación difiere del baseline indicado.")
        # Exclusive creation prevents replacing another adoption.
        with safe_path(project, "platform-manifest.json").open("x", encoding="utf-8") as handle:
            data = manifest(baseline_files)
            data["factory_version"] = "historical-adopted"
            json.dump(data, handle, indent=2)
        result["applied"] = True
    return result

def main(*, read_only: bool = False) -> int:
    parser = argparse.ArgumentParser(description=__doc__, allow_abbrev=False)
    parser.add_argument("--project", required=True, type=Path)
    parser.add_argument("--json", action="store_true")
    parser.set_defaults(apply=False, adopt_from=None)
    if not read_only:
        parser.add_argument("--apply", action="store_true")
        parser.add_argument("--adopt-from", type=Path, help="Checkout histórico exacto de Factory usado para generar esta aplicación")
    args = parser.parse_args()
    try:
        project = args.project.resolve(strict=True)
        spec = json.loads((project / "app-spec.json").read_text(encoding="utf-8"))
        factory = args.adopt_from.resolve() if args.adopt_from else Path(__file__).resolve().parent.parent
        runtime = factory / "assets/runtime-nextjs"
        if not runtime.is_dir():
            raise ValueError("No existe el runtime de la fábrica indicada.")
        desired = render_runtime(runtime, spec)
        if args.adopt_from:
            result = adopt(project, desired, args.apply)
        else:
            result = plan_update(project, desired)
            if args.apply:
                result = apply_update(project, desired, result)
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return 0 if result["can_apply"] else 1
    except (OSError, ValueError) as error:
        print(json.dumps({"error": str(error)}, ensure_ascii=False))
        return 2

if __name__ == "__main__":
    raise SystemExit(main())
