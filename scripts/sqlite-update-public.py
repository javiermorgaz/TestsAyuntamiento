"""Update only Tests Ayuntamiento to shared public access, with private rollback copies."""
import argparse
import datetime
import grp
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import pwd
import shutil
import stat
import subprocess
import sys
import tempfile
import time
import urllib.request

CODE = Path('/opt/tests-ayuntamiento')
WEB = Path('/var/www/tests-ayuntamiento-preview')
ENV = Path('/etc/tests-ayuntamiento/api.env')
BACKUPS = Path('/var/backups/tests-ayuntamiento-updates')
CONFIG = Path('/etc/tests-ayuntamiento-https/Caddyfile')
CONFIG_SHA256 = 'ee9e283e86c393744ec89b6c63da065ff5fc80755992519fc95037586ea62f08'
SYSTEM_PATH = '/usr/sbin:/usr/bin:/sbin:/bin'
PUBLIC_ORIGIN = 'https://46.224.88.8'
MODULES = {'server/' + name for name in ('__init__.py', 'app.py', 'database.py', 'manage.py')}
EXTENSIONS = {'.html', '.js', '.css', '.json', '.svg', '.png', '.jpg', '.jpeg', '.gif', '.ico',
              '.webp', '.avif', '.woff', '.woff2', '.ttf', '.txt', '.webmanifest'}
SERVICES = ('tests-ayuntamiento.service', 'tests-ayuntamiento-https.service')


def metadata(content):
    return {'sha256': hashlib.sha256(content).hexdigest(), 'size': len(content)}


def manifest(content):
    document = json.loads(content)
    if (not isinstance(document, dict) or set(document) != {'format', 'files'}
            or document['format'] != 1 or not isinstance(document['files'], dict)):
        raise ValueError('Expected manifest format1 and explicit files mapping.')
    for name, entry in document['files'].items():
        path = PurePosixPath(name)
        if (not name or path.is_absolute() or str(path) != name or any(part.startswith('.') for part in path.parts)
                or not isinstance(entry, dict) or set(entry) != {'sha256', 'size'}):
            raise ValueError('Invalid manifest entry: ' + name)
    return document['files']


def regular(path):
    if not stat.S_ISREG(path.lstat().st_mode):
        raise ValueError('Expected regular file without links: ' + str(path))
    return path.read_bytes()


def verify_path(path, uid, gid, mode, directory=False):
    info = path.lstat()
    correct = stat.S_ISDIR(info.st_mode) if directory else stat.S_ISREG(info.st_mode)
    if not correct or (info.st_uid, info.st_gid, stat.S_IMODE(info.st_mode)) != (uid, gid, mode):
        raise ValueError('Unexpected ownership, permissions or type: ' + str(path))


def tree_files(root):
    if root.is_symlink() or not root.is_dir():
        raise ValueError('Expected a real directory: ' + str(root))
    result = {}
    for path in root.rglob('*'):
        if path.is_symlink() or not (path.is_dir() or path.is_file()):
            raise ValueError('Only regular files and directories are allowed.')
        if path.is_file():
            result[path.relative_to(root).as_posix()] = path.read_bytes()
    return result


def matches(files, expected):
    return {name: metadata(content) for name, content in files.items()} == expected


def package(source):
    contents = tree_files(source)
    new = manifest(contents['deployment-manifest.json'])
    previous_web = manifest(contents['previous-manifest.json'])
    previous_code = manifest(contents['previous-backend-manifest.json'])
    frontend = {name[5:]: entry for name, entry in new.items() if name.startswith('dist/')}
    if set(previous_code) != MODULES or set(new) != MODULES | {'dist/' + name for name in frontend}:
        raise ValueError('Backend whitelist must contain exactly the four server modules.')
    if 'index.html' not in frontend or any(PurePosixPath(name).suffix.lower() not in EXTENSIONS for name in frontend):
        raise ValueError('Frontend must include index.html and only static file types.')
    allowed = set(new) | {'deployment-manifest.json', 'previous-manifest.json',
                          'previous-backend-manifest.json', 'scripts/sqlite-update-public.py'}
    if set(contents) != allowed or not matches({name: contents[name] for name in new}, new):
        raise ValueError('Package files differ from the explicit deployment whitelist or hashes.')
    backend = {name: contents[name] for name in MODULES}
    for name, content in backend.items():
        compile(content.decode(), name, 'exec')  # No execution, imports or pycache writes.
    return backend, {name: contents['dist/' + name] for name in frontend}, previous_code, previous_web


def public_environment(content):
    pairs = [line.split('=', 1) for line in content.decode().splitlines()]
    if any(len(pair) != 2 for pair in pairs) or len(dict(pairs)) != len(pairs):
        raise ValueError('Malformed or duplicate API environment keys.')
    values = dict(pairs)
    expected = {'SQLITE_DB_PATH': '/var/lib/tests-ayuntamiento/tests-ayuntamiento.sqlite',
                'SQLITE_HOST': '127.0.0.1', 'SQLITE_PORT': '8765',
                'SQLITE_ALLOWED_ORIGINS': 'https://javiermorgaz.github.io,' + PUBLIC_ORIGIN}
    if values == expected:
        return content.rstrip(b'\r\n') + b'\nSQLITE_ACCESS_MODE=public\n'
    if values == dict(expected, SQLITE_ACCESS_MODE='public'):
        return content
    raise ValueError('Only the four known API settings and optional public access mode are permitted.')


def run(arguments, cwd=None):
    try:
        return subprocess.run(arguments, cwd=cwd, check=True, capture_output=True, text=True,
                              env={'PATH': SYSTEM_PATH, 'LC_ALL': 'C', 'HOME': '/root', 'PYTHONDONTWRITEBYTECODE': '1'})
    except subprocess.CalledProcessError as error:
        details = '\n'.join((error.stderr or '').splitlines()[-6:])[-1000:]
        raise ValueError('Command failed: ' + Path(arguments[0]).name + ' ' + arguments[1] + ': ' + details) from error


def atomic_write(path, content, mode, gid=0):
    descriptor, temporary = tempfile.mkstemp(prefix='.public-update-', dir=path.parent)
    try:
        with os.fdopen(descriptor, 'wb') as output:
            os.fchmod(output.fileno(), mode)
            os.fchown(output.fileno(), 0, gid)
            output.write(content)
            output.flush()
            os.fsync(output.fileno())
        os.replace(temporary, path)
    finally:
        Path(temporary).unlink(missing_ok=True)


def save_private(path, content):
    path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    descriptor = os.open(path, os.O_CREAT | os.O_EXCL | os.O_WRONLY | os.O_NOFOLLOW, 0o600)
    with os.fdopen(descriptor, 'wb') as output:
        output.write(content)


def readiness(index, timeout=30):
    class NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self, request, file, code, message, headers, new_url):
            return None
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())
    deadline, last = time.monotonic() + timeout, 'server not ready'
    while time.monotonic() < deadline:
        try:
            for route, origin in (('/health', None), ('/', None), ('/api/tests', None),
                                  ('/api/tests', PUBLIC_ORIGIN), ('/api/progress', PUBLIC_ORIGIN)):
                remaining = deadline - time.monotonic()
                if remaining <= 0:
                    raise ValueError('Readiness deadline reached.')
                request = urllib.request.Request(PUBLIC_ORIGIN + route, headers={'Origin': origin} if origin else {})
                with opener.open(request, timeout=min(2, remaining)) as response:
                    body = response.read(len(index) + 1 if route == '/' else 2_000_000)
                    if response.status != 200 or (origin and response.headers.get('Access-Control-Allow-Origin') != origin):
                        raise ValueError('Public API status or CORS response is not ready.')
                    if route == '/':
                        if metadata(body) != metadata(index):
                            raise ValueError('Frontend index differs from the deployed version.')
                    else:
                        value = json.loads(body)
                        if ((route == '/health' and value != {'ok': True})
                                or (route == '/api/tests' and (not isinstance(value, list) or len(value) != 17))
                                or (route == '/api/progress' and not isinstance(value, (list, dict)))):
                            raise ValueError('Unexpected public API response.')
            return
        except (OSError, ValueError) as error:
            last = str(error)[-400:]
        remaining = deadline - time.monotonic()
        if remaining > 0:
            time.sleep(min(0.5, remaining))
    raise ValueError('Public access readiness failed: ' + last)


def update(source):
    systemctl = shutil.which('systemctl', path=SYSTEM_PATH)
    if systemctl is None:
        raise ValueError('Missing systemctl in trusted system PATH.')
    systemctl = str(Path(systemctl).resolve(strict=True))
    backend, frontend, previous_code, previous_web = package(source)
    account = pwd.getpwnam('tests-ayuntamiento')
    https = pwd.getpwnam('tests-ayuntamiento-https')
    if account.pw_uid == 0 or https.pw_uid == 0 or account.pw_uid == https.pw_uid:
        raise ValueError('API and HTTPS must retain separate non-root service identities.')
    verify_path(CODE, 0, 0, 0o755, True)
    verify_path(CODE / 'server', 0, 0, 0o755, True)
    verify_path(ENV.parent, 0, account.pw_gid, 0o750, True)
    verify_path(ENV, 0, account.pw_gid, 0o640)
    verify_path(WEB.parent, 0, 0, 0o755, True)
    verify_path(WEB, 0, 0, 0o755, True)
    verify_path(CONFIG.parent, 0, 0, 0o755, True)
    verify_path(CONFIG, 0, 0, 0o644)
    if metadata(CONFIG.read_bytes())['sha256'] != CONFIG_SHA256:
        raise ValueError('HTTPS configuration changed; it will not be modified.')
    for name, user in (('tests-ayuntamiento', account), ('tests-ayuntamiento-https', https)):
        verify_path(Path('/var/lib') / name, user.pw_uid, user.pw_gid, 0o700, True)
    current_code = {}
    for name in MODULES:
        verify_path(CODE / name, 0, 0, 0o644)
        current_code[name] = regular(CODE / name)
    for name in ('server/__init__.py', 'server/manage.py'):
        if current_code[name] != backend[name]:
            raise ValueError('Public update must not change package initialization or administrative commands.')
    current_web = tree_files(WEB)
    for path in WEB.rglob('*'):
        verify_path(path, 0, 0, 0o755 if path.is_dir() else 0o644, path.is_dir())
    old_env = ENV.read_bytes()
    new_env = public_environment(old_env)
    if current_code == backend and current_web == frontend and old_env == new_env:
        readiness(frontend['index.html'])
        return 'Already installed; no files, services or database were changed.'
    if (not matches(current_code, previous_code) or not matches(current_web, previous_web) or old_env == new_env):
        raise ValueError('Current deployment differs from the complete previous version; no files changed.')
    for service in SERVICES:
        run([systemctl, 'is-active', '--quiet', service])
    python = CODE / 'venv/bin/python'
    verify_path(python.resolve(strict=True), 0, 0, 0o755)
    for directory in (CODE / 'venv', CODE / 'venv/bin'):
        verify_path(directory, 0, 0, 0o755, True)
    if BACKUPS.exists() or BACKUPS.is_symlink():
        verify_path(BACKUPS, 0, 0, 0o700, True)
    else:
        BACKUPS.mkdir(mode=0o700)
    timestamp = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
    backup = BACKUPS / timestamp
    backup.mkdir(mode=0o700)
    for name, content in current_code.items():
        save_private(backup / 'code' / name, content)
    save_private(backup / 'api.env', old_env)
    stopped = False
    try:
        stopped = True
        for service in reversed(SERVICES):
            run([systemctl, 'stop', service])
        run([str(python), '-m', 'server.manage', '--db', '/var/lib/tests-ayuntamiento/tests-ayuntamiento.sqlite',
             'backup', str(backup / 'database.sqlite')], cwd=CODE)
        with tempfile.TemporaryDirectory(prefix='.tests-public-', dir=WEB.parent) as stage:
            stage = Path(stage)
            for name, content in frontend.items():
                target = stage / name
                target.parent.mkdir(mode=0o755, parents=True, exist_ok=True)
                target.write_bytes(content)
                target.chmod(0o644)
            for directory in stage.rglob('*'):
                if directory.is_dir():
                    directory.chmod(0o755)
            stage.chmod(0o755)
            for name, content in backend.items():
                atomic_write(CODE / name, content, 0o644)
            atomic_write(ENV, new_env, 0o640, account.pw_gid)
            WEB.rename(backup / 'frontend')
            stage.rename(WEB)
        for service in SERVICES:
            run([systemctl, 'start', service])
        readiness(frontend['index.html'])
    except (ValueError, OSError):
        for service in reversed(SERVICES):
            run([systemctl, 'stop', service])
        for name, content in current_code.items():
            atomic_write(CODE / name, content, 0o644)
        atomic_write(ENV, old_env, 0o640, account.pw_gid)
        if (backup / 'frontend').exists():
            if WEB.exists():
                WEB.rename(backup / 'failed-frontend')
            (backup / 'frontend').rename(WEB)
        if stopped:
            for service in SERVICES:
                run([systemctl, 'start', service])
        raise
    return 'Public shared access installed and verified; rollback copies: ' + str(backup)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', required=True, type=Path)
    arguments = parser.parse_args()
    if sys.platform != 'linux' or os.geteuid() != 0:
        parser.exit(1, 'Run as administrator on the target Linux server.\n')
    os.umask(0o077)
    try:
        print(update(arguments.source))
    except (ValueError, OSError, KeyError, SyntaxError) as error:
        parser.exit(1, 'Public update stopped: ' + str(error) + '\n')


if __name__ == '__main__':
    main()
