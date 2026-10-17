"""Public update package, environment, rollback and readiness guards; no server access."""
import importlib.util
import json
import os
from pathlib import Path
import stat
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import MagicMock, patch

ROOT = Path(__file__).resolve().parents[1]
specification = importlib.util.spec_from_file_location('sqlite_public_update', ROOT / 'scripts/sqlite-update-public.py')
public = importlib.util.module_from_spec(specification)
specification.loader.exec_module(public)
OLD_ENV = (b'SQLITE_DB_PATH=/var/lib/tests-ayuntamiento/tests-ayuntamiento.sqlite\n'
           b'SQLITE_HOST=127.0.0.1\nSQLITE_PORT=8765\n'
           b'SQLITE_ALLOWED_ORIGINS=https://javiermorgaz.github.io,https://46.224.88.8\n')


class PublicUpdate(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.base = Path(self.temporary.name)
        self.source = self.base / 'package'
        self.old_code = {name: b'VALUE = "old"\n' for name in public.MODULES}
        self.new_code = {name: (old if name.endswith(('__init__.py', 'manage.py')) else b'VALUE = "public"\n')
                         for name, old in self.old_code.items()}
        self.old_web = {'index.html': b'<html>previous</html>', 'assets/app.js': b'old()'}
        self.new_web = {'index.html': b'<html>public</html>', 'assets/app.js': b'publicApp()'}
        contents = dict(self.new_code, **{'dist/' + name: value for name, value in self.new_web.items()})
        self.write(self.source, contents)
        for filename, files in (
                ('deployment-manifest.json', contents), ('previous-manifest.json', self.old_web),
                ('previous-backend-manifest.json', self.old_code)):
            document = {'format': 1, 'files': {name: public.metadata(value) for name, value in files.items()}}
            (self.source / filename).write_text(json.dumps(document))
        self.write(self.source, {'scripts/sqlite-update-public.py': b'# reviewed installer fixture\n'})

    def write(self, root, files):
        root.mkdir(mode=0o755, parents=True, exist_ok=True)
        for name, value in files.items():
            file = root / name
            file.parent.mkdir(mode=0o755, parents=True, exist_ok=True)
            file.write_bytes(value)
            file.chmod(0o644)

    def test_package_exact_whitelist_and_syntax(self):
        backend, frontend, _, _ = public.package(self.source)
        self.assertEqual(backend, self.new_code)
        self.assertEqual(frontend, self.new_web)
        (self.source / 'credentials.token').write_text('must not leave staging')
        with self.assertRaisesRegex(ValueError, 'whitelist'):
            public.package(self.source)

    def test_source_symlink_and_modified_code_are_rejected(self):
        app = self.source / 'server/app.py'
        app.write_text('changed without matching manifest')
        with self.assertRaisesRegex(ValueError, 'hashes'):
            public.package(self.source)
        app.unlink()
        app.symlink_to(self.source / 'server/manage.py')
        with self.assertRaisesRegex(ValueError, 'regular files'):
            public.package(self.source)

    def test_public_environment_adds_only_access_mode_and_is_idempotent(self):
        updated = public.public_environment(OLD_ENV)
        self.assertEqual(updated, OLD_ENV + b'SQLITE_ACCESS_MODE=public\n')
        self.assertEqual(public.public_environment(updated), updated)
        for bad in (OLD_ENV + b'TOKEN=value\n', OLD_ENV.replace(b'8765', b'22'),
                    OLD_ENV + b'SQLITE_ACCESS_MODE=token\n', OLD_ENV + b'SQLITE_PORT=8765\n'):
            with self.assertRaises(ValueError):
                public.public_environment(bad)

    def test_non_root_stops_before_updater(self):
        with patch('sys.argv', ['update', '--source', str(self.source)]), \
                patch.object(public.sys, 'platform', 'linux'), patch.object(public.os, 'geteuid', return_value=1000), \
                patch.object(public, 'update') as update:
            with self.assertRaises(SystemExit):
                public.main()
            update.assert_not_called()

    def test_failed_readiness_restores_code_environment_and_frontend(self):
        code, web, env = self.base / 'opt', self.base / 'www/preview', self.base / 'etc/api.env'
        config, backups = self.base / 'https/Caddyfile', self.base / 'updates'
        self.write(code, self.old_code)
        self.write(web, self.old_web)
        self.write(env.parent, {env.name: OLD_ENV})
        self.write(config.parent, {config.name: (ROOT / 'deploy/Caddyfile.tests-ayuntamiento-preview').read_bytes()})
        self.write(code, {'venv/bin/python': b'# interpreter fixture'})
        (code / 'venv/bin/python').chmod(0o755)
        calls = []
        def verify(path, uid, gid, mode, directory=False):
            if str(path).startswith('/var/lib/'):
                return
            info = path.lstat()
            self.assertEqual(stat.S_IMODE(info.st_mode), mode)
            self.assertFalse(path.is_symlink())
        def command(arguments, cwd=None):
            calls.append(arguments)
            return SimpleNamespace(stdout='')
        identities = {'tests-ayuntamiento': SimpleNamespace(pw_uid=1001, pw_gid=20),
                      'tests-ayuntamiento-https': SimpleNamespace(pw_uid=1002, pw_gid=21)}
        env.chmod(0o640)
        env.parent.chmod(0o750)
        with patch.multiple(public, CODE=code, WEB=web, ENV=env, BACKUPS=backups, CONFIG=config), \
                patch.object(public.shutil, 'which', return_value='/usr/bin/true'), \
                patch.object(public.pwd, 'getpwnam', side_effect=identities.__getitem__), \
                patch.object(public, 'verify_path', side_effect=verify), patch.object(public, 'run', side_effect=command), \
                patch.object(public.os, 'fchown'), patch.object(public, 'readiness', side_effect=ValueError('not public yet')):
            with self.assertRaisesRegex(ValueError, 'not public yet'):
                public.update(self.source)
        self.assertEqual({name: (code / name).read_bytes() for name in public.MODULES}, self.old_code)
        self.assertEqual(env.read_bytes(), OLD_ENV)
        self.assertEqual(public.tree_files(web), self.old_web)
        actions = [arguments[1] for arguments in calls if arguments[0] == '/usr/bin/true']
        self.assertEqual(actions[-4:], ['stop', 'stop', 'start', 'start'])
        self.assertTrue(any('backup' in arguments for arguments in calls))

    def test_readiness_requires_anonymous_tests_and_allowed_origin(self):
        bodies = [b'{"ok":true}', self.new_web['index.html'], json.dumps([{}] * 17).encode(),
                  json.dumps([{}] * 17).encode(), b'[]']
        responses = []
        for index, body in enumerate(bodies):
            response = MagicMock(status=200, headers={'Access-Control-Allow-Origin': public.PUBLIC_ORIGIN})
            response.read.return_value = body
            response.__enter__.return_value = response
            responses.append(response)
        opener = MagicMock()
        opener.open.side_effect = responses
        with patch.object(public.urllib.request, 'build_opener', return_value=opener):
            public.readiness(self.new_web['index.html'])
        requests = [call.args[0] for call in opener.open.call_args_list]
        self.assertEqual(requests[2].full_url, public.PUBLIC_ORIGIN + '/api/tests')
        self.assertIsNone(requests[2].get_header('Origin'))
        self.assertEqual(requests[3].get_header('Origin'), public.PUBLIC_ORIGIN)
        self.assertTrue(all(request.get_header('Authorization') is None for request in requests))


if __name__ == '__main__':
    unittest.main()
