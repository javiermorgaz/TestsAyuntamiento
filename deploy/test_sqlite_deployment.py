"""Checks for deployment guardrails without root, SSH, filesystem writes or Caddy."""
import importlib.util
import json
from pathlib import Path
import sqlite3
import sys
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]


def load(name, filename):
    specification = importlib.util.spec_from_file_location(name, ROOT / filename)
    module = importlib.util.module_from_spec(specification)
    specification.loader.exec_module(module)
    return module


installer = load('sqlite_installer', 'scripts/sqlite-install.py')
downloader = load('sqlite_downloader', 'scripts/sqlite-download-backup.py')
caddy_check = load('sqlite_caddy_check', 'scripts/sqlite-check-caddy.py')


class DeploymentGuards(unittest.TestCase):
    def test_initial_migration_resolves_runuser_before_restricting_path(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            tool = root / 'runuser'
            tool.write_text(
                '#!' + sys.executable + '\n'
                'import json, os, pathlib, sys\n'
                'pathlib.Path(sys.argv[sys.argv.index("--db") + 1]).write_text('
                'json.dumps({"args": sys.argv[1:], "path": os.environ["PATH"], "cwd": os.getcwd()}))\n'
            )
            tool.chmod(0o700)
            destination = root / 'migration-call.json'
            with patch.object(installer.shutil, 'which', return_value=str(tool)) as lookup, \
                    patch.object(installer, 'CODE', root):
                programs = installer.system_programs()
                installer.migrate_initial_copy(Path(sys.executable), destination, programs['runuser'])
            actual = json.loads(destination.read_text())
            self.assertEqual(actual['path'], '/usr/bin:/bin')
            self.assertEqual(Path(actual['cwd']).resolve(), root.resolve())
            self.assertEqual(actual['args'][:4], ['-u', installer.ACCOUNT, '--', sys.executable])
            self.assertIn('server.manage', actual['args'])
            self.assertEqual(actual['args'][-1], 'migrate')
            lookup.assert_any_call('runuser', path=installer.SYSTEM_PATH)

    def test_missing_system_program_refused_before_installation(self):
        with patch.object(installer.shutil, 'which', return_value=None):
            with self.assertRaisesRegex(SystemExit, 'Missing system prerequisite'):
                installer.system_programs()

    def test_install_without_root_refused_before_mutation(self):
        with patch.object(installer.sys, 'argv', ['install', '--source', str(ROOT), '--allowed-origin', 'https://example.org']), \
                patch.object(installer.sys, 'platform', 'linux'), \
                patch.object(installer.os, 'geteuid', return_value=1234), \
                patch.object(installer.subprocess, 'run') as run, \
                patch.object(installer.os, 'open') as write:
            with self.assertRaises(SystemExit):
                installer.main()
            run.assert_not_called()
            write.assert_not_called()

    def test_download_never_overwrites_existing_file(self):
        with patch('sys.argv', [
            'download', '--ssh-target', 'backup@example.org',
            '--backup-name', 'tests-ayuntamiento-20261012T031700123456Z.sqlite',
            '--destination', str(ROOT / 'scripts/sqlite-download-backup.py'),
        ]), patch.object(downloader.subprocess, 'run') as run:
            with self.assertRaises(SystemExit):
                downloader.main()
            run.assert_not_called()

    def test_backup_verification_accepts_only_our_tables(self):
        connection = sqlite3.connect(':memory:')
        connection.executescript('CREATE TABLE tests(id); CREATE TABLE results(id); CREATE TABLE devices(id);')
        with patch.object(downloader.sqlite3, 'connect', return_value=connection):
            downloader.verify(Path('/not-a-real-backup.sqlite'))

    def test_backup_verification_rejects_orphan_foreign_key(self):
        connection = sqlite3.connect(':memory:')
        connection.executescript('''
            CREATE TABLE tests(id INTEGER PRIMARY KEY);
            CREATE TABLE devices(id);
            CREATE TABLE results(id, test_id REFERENCES tests(id));
            INSERT INTO results VALUES (1, 99);
        ''')
        with patch.object(downloader.sqlite3, 'connect', return_value=connection):
            with self.assertRaisesRegex(ValueError, 'foreign key'):
                downloader.verify(Path('/not-a-real-backup.sqlite'))

    def test_caddy_old_version_refused(self):
        with patch('sys.argv', ['check', '--binary', '/fake/caddy']), \
                patch.object(caddy_check.subprocess, 'run', return_value=SimpleNamespace(stdout='v2.10.2')) as run:
            with self.assertRaises(SystemExit):
                caddy_check.main()
            self.assertEqual(run.call_count, 1)

    def test_caddy_internal_issuer_refused(self):
        adapted = {'apps': {'tls': {'automation': {'policies': [{'issuers': [{'module': 'internal'}]}]}}}}
        with patch('sys.argv', ['check', '--binary', '/fake/caddy']), \
                patch.object(caddy_check.subprocess, 'run', side_effect=[
                    SimpleNamespace(stdout='v2.11.0'), SimpleNamespace(stdout=json.dumps(adapted)),
                ]):
            with self.assertRaises(SystemExit):
                caddy_check.main()

    def test_caddy_explicit_public_shortlived_profile_accepted(self):
        issuer = {'module': 'acme', 'ca': 'https://acme-v02.api.letsencrypt.org/directory', 'profile': 'shortlived'}
        adapted = {'apps': {'tls': {'automation': {'policies': [{'issuers': [issuer]}]}}}}
        with patch('sys.argv', ['check', '--binary', '/fake/caddy']), \
                patch.object(caddy_check.subprocess, 'run', side_effect=[
                    SimpleNamespace(stdout='v2.11.0'), SimpleNamespace(stdout=json.dumps(adapted)),
                ]):
            caddy_check.main()


if __name__ == '__main__':
    unittest.main()
