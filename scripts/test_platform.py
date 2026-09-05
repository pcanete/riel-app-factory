import json
from pathlib import Path
import tempfile
import subprocess
import sys
import unittest
from unittest.mock import patch
from platform_files import manifest, render_runtime
import update_platform as updater

class PlatformTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.project = Path(self.tmp.name)
        self.original = {"src/lib/base.ts": b"baseline\n", "package.json": b'{"version":"1"}\n'}
        for name, content in self.original.items():
            path = self.project / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(content)
        (self.project / "platform-manifest.json").write_text(json.dumps(manifest(self.original)))

    def states(self, files):
        return {e["path"]: e["state"] for e in updater.plan_update(self.project, files)["entries"]}

    def test_safe_upgrade_keeps_client_files_and_tracks_root_dependencies(self):
        client = self.project / "src/features/client.ts"
        client.parent.mkdir(parents=True)
        client.write_text("client logic")
        custom_sql = self.project / "database/custom/999_client.sql"
        custom_sql.parent.mkdir(parents=True)
        custom_sql.write_text("client SQL")
        desired = {**self.original, "src/lib/base.ts": b"upgraded", "package.json": b'{"version":"2"}'}
        result = updater.apply_update(self.project, desired, updater.plan_update(self.project, desired))
        self.assertTrue(result["applied"])
        self.assertEqual(client.read_text(), "client logic")
        self.assertEqual(custom_sql.read_text(), "client SQL")
        self.assertEqual((self.project / "package.json").read_bytes(), desired["package.json"])
        self.assertTrue((Path(result["backup"]) / "package.json").is_file())
        self.assertEqual(set(self.states(desired).values()), {"UNCHANGED"})

    def test_client_only_change_remains_client_change(self):
        (self.project / "src/lib/base.ts").write_text("local")
        self.assertEqual(self.states(self.original)["src/lib/base.ts"], "CLIENT_MODIFIED")
        updater.apply_update(self.project, self.original, updater.plan_update(self.project, self.original))
        self.assertEqual((self.project / "src/lib/base.ts").read_text(), "local")
        self.assertEqual(self.states(self.original)["src/lib/base.ts"], "CLIENT_MODIFIED")

    def test_conflict_stops_all_writes(self):
        (self.project / "src/lib/base.ts").write_text("local")
        desired = {"src/lib/base.ts": b"factory", "package.json": b"other"}
        with self.assertRaises(ValueError):
            updater.apply_update(self.project, desired, updater.plan_update(self.project, desired))
        self.assertEqual((self.project / "package.json").read_bytes(), self.original["package.json"])

    def test_unknown_baseline_does_not_authorize_updates(self):
        (self.project / "platform-manifest.json").unlink()
        self.assertFalse(updater.plan_update(self.project, self.original)["can_apply"])
        self.assertEqual(set(self.states(self.original).values()), {"UNKNOWN_BASELINE"})

    def test_collision_with_unknown_client_route_is_not_adopted(self):
        path = self.project / "src/app/client/page.tsx"
        path.parent.mkdir(parents=True)
        path.write_bytes(b"same as incoming")
        before = updater.plan_update(self.project, self.original)
        self.assertIn("src/app/client/page.tsx", before["unknown_files_preserved"])
        desired = {**self.original, "src/app/client/page.tsx": b"same as incoming"}
        self.assertEqual(self.states(desired)["src/app/client/page.tsx"], "CONFLICT")

    def test_local_delete_is_preserved_until_factory_changes_file(self):
        (self.project / "src/lib/base.ts").unlink()
        self.assertEqual(self.states(self.original)["src/lib/base.ts"], "CLIENT_DELETED")
        self.assertEqual(self.states({**self.original, "src/lib/base.ts": b"new"})["src/lib/base.ts"], "CONFLICT")

    def test_platform_removed_file_requires_no_local_edits(self):
        desired = {"package.json": self.original["package.json"]}
        self.assertEqual(self.states(desired)["src/lib/base.ts"], "DELETE")
        updater.apply_update(self.project, desired, updater.plan_update(self.project, desired))
        self.assertFalse((self.project / "src/lib/base.ts").exists())

    def test_migrations_are_never_rewritten_or_removed(self):
        name = "database/platform/200_test.sql"
        path = self.project / name
        path.parent.mkdir(parents=True)
        path.write_bytes(b"original SQL")
        original = {**self.original, name: b"original SQL"}
        (self.project / "platform-manifest.json").write_text(json.dumps(manifest(original)))
        for desired in [self.original, {**original, name: b"changed SQL"}]:
            self.assertEqual(self.states(desired)[name], "MIGRATION_REVIEW")

    def test_paths_cannot_escape_or_claim_client_zones(self):
        for name in ["../outside", "C:/outside", "src/features/customer.ts", "database/custom/999_client.sql", "src/generated/app-spec.ts", ".env.local"]:
            with self.subTest(name=name), self.assertRaises(ValueError):
                updater.plan_update(self.project, {name: b"bad"})

    def test_failure_rolls_back_source_and_manifest(self):
        old_manifest = (self.project / "platform-manifest.json").read_bytes()
        original_replace = updater.replace_bytes
        calls = 0
        def failing_replace(path, content):
            nonlocal calls
            calls += 1
            if calls == 2:
                raise OSError("simulated disk failure")
            original_replace(path, content)
        desired = {**self.original, "package.json": b"new deps", "src/lib/base.ts": b"new code"}
        with patch.object(updater, "replace_bytes", failing_replace), self.assertRaises(OSError):
            updater.apply_update(self.project, desired, updater.plan_update(self.project, desired))
        for name, content in self.original.items():
            self.assertEqual((self.project / name).read_bytes(), content)
        self.assertEqual((self.project / "platform-manifest.json").read_bytes(), old_manifest)
        self.assertFalse((self.project / ".factory-update.lock").exists())

    def test_drift_after_plan_is_rejected(self):
        desired = {**self.original, "package.json": b"new"}
        plan = updater.plan_update(self.project, desired)
        (self.project / "package.json").write_bytes(b"external edit")
        with self.assertRaises(ValueError):
            updater.apply_update(self.project, desired, plan)
        self.assertEqual((self.project / "package.json").read_bytes(), b"external edit")

    def test_adoption_requires_exact_historical_runtime(self):
        (self.project / "platform-manifest.json").unlink()
        self.assertFalse(updater.adopt(self.project, {**self.original, "package.json": b"different"}, False)["can_apply"])
        self.assertTrue(updater.adopt(self.project, self.original, True)["applied"])

    def test_render_uses_spec_values_and_line_endings(self):
        runtime = self.project / "fixture"
        runtime.mkdir()
        (runtime / "package.json").write_bytes(b'{"name":"__APP_KEY__"}\r\n')
        files = render_runtime(runtime, {"app": {"key": "client_one"}})
        self.assertEqual(files["package.json"], b'{"name":"client-one"}\n')

    def test_read_only_command_rejects_mutation_flags_and_abbreviations(self):
        script = Path(__file__).with_name("check_platform.py")
        before = (self.project / "platform-manifest.json").read_bytes()
        for flag in ["--apply", "--appl", "--ap", "--adopt-from=x"]:
            result = subprocess.run([sys.executable, str(script), "--project", str(self.project), flag], capture_output=True)
            self.assertEqual(result.returncode, 2, flag)
            self.assertIn(b"unrecognized arguments", result.stderr)
        self.assertEqual((self.project / "platform-manifest.json").read_bytes(), before)

    def test_binary_local_modifications_are_never_normalized_away(self):
        name = "src/platform/data.bin"
        path = self.project / name
        path.parent.mkdir(parents=True)
        for original, changed in [(b"\xff\r\x00", b"\xff\n\x00"), (b"\x00\r", b"\x00\n")]:
            path.write_bytes(changed)
            (self.project / "platform-manifest.json").write_text(json.dumps(manifest({name: original})))
            self.assertEqual(self.states({name: b"upstream"})[name], "CONFLICT")

if __name__ == "__main__":
    unittest.main()
