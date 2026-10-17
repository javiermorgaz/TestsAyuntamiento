"""Exercise private bundle preparation on disposable fixtures, without network access."""
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import sqlite3
import stat
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
specification = importlib.util.spec_from_file_location('sqlite_bundle', ROOT / 'scripts/sqlite-prepare-bundle.py')
bundle = importlib.util.module_from_spec(specification)
specification.loader.exec_module(bundle)


class PrivateBundle(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.addCleanup(os.umask, os.umask(0o077))
        self.source = Path(self.temporary.name)
        for relative in bundle.FILES:
            file = self.source / relative
            file.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
            file.write_text('fixture ' + relative + '\n')
        (self.source / '.env').write_text('DO_NOT_COPY_THIS_SECRET')
        (self.source / 'credentials.token').write_text('DO_NOT_COPY_THIS_SECRET')
        self.database = self.source / 'source.sqlite'
        with sqlite3.connect(self.database) as connection:
            connection.executescript('CREATE TABLE tests(id INTEGER PRIMARY KEY); CREATE TABLE results(id INTEGER PRIMARY KEY, test_id REFERENCES tests(id)); INSERT INTO tests VALUES(17); INSERT INTO results VALUES(91,17);')
        self.output = self.source / '.migration/staging'

    def prepare(self, output=None):
        return bundle.prepare(self.database, output or self.output, '/tmp/tests-ayuntamiento-review-1',
                              'https://javiermorgaz.github.io', source=self.source)

    def test_only_whitelist_private_files_and_consistent_sqlite(self):
        result = self.prepare()
        self.assertEqual(result['counts'], {'tests': 1, 'results': 1})
        expected = set(bundle.FILES) | {'initial.sqlite', 'install-command.txt', 'manifest.json'}
        actual = {str(path.relative_to(self.output)) for path in self.output.rglob('*') if path.is_file()}
        self.assertEqual(actual, expected)
        self.assertNotIn('.env', actual)
        for path in (self.output,) + tuple(self.output.rglob('*')):
            self.assertEqual(stat.S_IMODE(path.stat().st_mode), 0o700 if path.is_dir() else 0o600)
        manifest = json.loads((self.output / 'manifest.json').read_text())
        for relative, metadata in manifest['files'].items():
            self.assertEqual(metadata['sha256'], hashlib.sha256((self.output / relative).read_bytes()).hexdigest())
        self.assertIn('--allowed-origin https://javiermorgaz.github.io', (self.output / 'install-command.txt').read_text())
        with sqlite3.connect(self.output / 'initial.sqlite') as connection:
            self.assertEqual(connection.execute('SELECT id,test_id FROM results').fetchall(), [(91, 17)])

    def test_existing_bundle_never_overwritten(self):
        self.prepare()
        manifest_before = (self.output / 'manifest.json').read_bytes()
        with self.assertRaisesRegex(ValueError, 'already exists'):
            self.prepare()
        self.assertEqual((self.output / 'manifest.json').read_bytes(), manifest_before)

    def test_parent_escape_outside_private_migration_refused(self):
        with self.assertRaisesRegex(ValueError, 'below'):
            self.prepare(self.source / '.migration/../public/unsafe')
        self.assertFalse((self.source / 'public').exists())

    def test_symlinked_whitelisted_source_refused(self):
        file = self.source / bundle.FILES[0]
        file.unlink()
        file.symlink_to(self.source / '.env')
        with self.assertRaisesRegex(ValueError, 'linked whitelisted'):
            self.prepare()
        self.assertFalse(self.output.exists())


if __name__ == '__main__':
    unittest.main()
