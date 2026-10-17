"""Checks for preview publication using disposable files and no network access."""
import hashlib
import importlib.util
from pathlib import Path
import tempfile
import unittest
from unittest.mock import MagicMock, patch

ROOT = Path(__file__).resolve().parents[1]
specification = importlib.util.spec_from_file_location('sqlite_preview', ROOT / 'scripts/sqlite-install-preview.py')
preview = importlib.util.module_from_spec(specification)
specification.loader.exec_module(preview)
ENVIRONMENT = (
    b'SQLITE_DB_PATH=/var/lib/tests-ayuntamiento/tests-ayuntamiento.sqlite\n'
    b'SQLITE_HOST=127.0.0.1\nSQLITE_PORT=8765\n'
    b'SQLITE_ALLOWED_ORIGINS=https://javiermorgaz.github.io\n'
)


class SqlitePreview(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.dist = Path(self.temporary.name) / 'dist'
        self.dist.mkdir()
        self.index = b'<html>private preview, no credential</html>'
        (self.dist / 'index.html').write_bytes(self.index)
        self.manifest = {'format': 1, 'files': {'index.html': {
            'sha256': hashlib.sha256(self.index).hexdigest(), 'size': len(self.index),
        }}}

    def test_exact_static_tree_and_manifest_are_accepted(self):
        self.assertEqual(preview.frontend_files(self.dist, self.manifest), {'index.html': self.index})

    def test_malformed_manifest_and_modified_files_are_rejected(self):
        for manifest in ([], {'format': 1, 'files': []}, {'format': 99, 'files': {}},
                         {'format': 1, 'files': {'../secret.json': {'sha256': 'x', 'size': 1}}}):
            with self.assertRaises(ValueError):
                preview.frontend_files(self.dist, manifest)
        (self.dist / 'index.html').write_bytes(b'modified')
        with self.assertRaisesRegex(ValueError, 'hash or size'):
            preview.frontend_files(self.dist, self.manifest)

    def test_unlisted_or_secret_files_are_rejected(self):
        (self.dist / '.env').write_text('not a frontend asset')
        with self.assertRaisesRegex(ValueError, 'differs'):
            preview.frontend_files(self.dist, self.manifest)

    def test_symlink_file_or_directory_is_rejected(self):
        (self.dist / 'linked.json').symlink_to(self.dist / 'index.html')
        with self.assertRaisesRegex(ValueError, 'regular static'):
            preview.frontend_files(self.dist, self.manifest)
        (self.dist / 'linked.json').unlink()
        with self.assertRaisesRegex(ValueError, 'real directory'):
            linked = self.dist.parent / 'linked-dist'
            linked.symlink_to(self.dist, target_is_directory=True)
            preview.frontend_files(linked, self.manifest)

    def test_env_only_appends_preview_origin_and_is_idempotent(self):
        updated = preview.preview_environment(ENVIRONMENT)
        self.assertEqual(updated.replace(b',https://46.224.88.8', b''), ENVIRONMENT)
        self.assertEqual(preview.preview_environment(updated), updated)

    def test_env_rejects_unexpected_keys_values_duplicates_or_origins(self):
        for bad in (
            ENVIRONMENT + b'EXTRA_SECRET=value\n',
            ENVIRONMENT.replace(b'SQLITE_PORT=8765', b'SQLITE_PORT=22'),
            ENVIRONMENT.replace(b'SQLITE_HOST=127.0.0.1', b'SQLITE_HOST=0.0.0.0'),
            ENVIRONMENT.replace(b'https://javiermorgaz.github.io', b'https://unexpected.example'),
            ENVIRONMENT.replace(b'SQLITE_HOST', b'SQLITE_PORT'),
        ):
            with self.assertRaises(ValueError):
                preview.preview_environment(bad)

    def test_preview_configuration_matches_pin_and_separates_static_from_api(self):
        config = (ROOT / 'deploy/Caddyfile.tests-ayuntamiento-preview').read_bytes()
        self.assertEqual(preview.digest(config), preview.PREVIEW_SHA256)
        self.assertIn(b'@api path /api /api/* /health', config)
        self.assertIn(b'root * /var/www/tests-ayuntamiento-preview', config)
        self.assertIn(b'profile shortlived', config)
        self.assertIn(b'admin off', config)
        self.assertNotIn(b'openclaw', config.lower())
        self.assertNotIn(b'tls internal', config)

    def test_non_root_guard_runs_before_any_tool_or_copy(self):
        with patch('sys.argv', ['install', '--source', '/private/package']), \
                patch.object(preview.sys, 'platform', 'linux'), \
                patch.object(preview.os, 'geteuid', return_value=1000), \
                patch.object(preview.shutil, 'which') as which, \
                patch.object(preview, 'atomic_write') as write:
            with self.assertRaises(SystemExit):
                preview.main()
            which.assert_not_called()
            write.assert_not_called()

    def test_readiness_retries_unavailable_https_until_health_and_index_are_ready(self):
        health = MagicMock(status=200)
        health.read.return_value = b'{"ok":true}'
        health.__enter__.return_value = health
        index = MagicMock(status=200)
        index.read.return_value = self.index
        index.__enter__.return_value = index
        opener = MagicMock()
        opener.open.side_effect = [ConnectionRefusedError('starting'), health, index]
        with patch.object(preview.urllib.request, 'build_opener', return_value=opener), \
                patch.object(preview.time, 'monotonic', return_value=1), \
                patch.object(preview.time, 'sleep') as sleep:
            preview.wait_preview(self.index)
        self.assertEqual(opener.open.call_count, 3)
        sleep.assert_called_once_with(0.5)
        self.assertEqual(opener.open.call_args.args[0], 'https://46.224.88.8/')

    def test_readiness_times_out_without_sleeping_or_accepting_unavailable_https(self):
        opener = MagicMock()
        opener.open.side_effect = ConnectionRefusedError('still starting')
        with patch.object(preview.urllib.request, 'build_opener', return_value=opener), \
                patch.object(preview.time, 'monotonic', side_effect=[0, 0, 0, 29.8, 30.1]), \
                patch.object(preview.time, 'sleep') as sleep:
            with self.assertRaisesRegex(ValueError, 'readiness timed out'):
                preview.wait_preview(self.index)
        self.assertLessEqual(sleep.call_args.args[0], 0.5)


if __name__ == '__main__':
    unittest.main()
