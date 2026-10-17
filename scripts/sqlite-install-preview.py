"""Install the private SQLite frontend preview without publishing GitHub Pages."""
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

SYSTEM_PATH = '/usr/sbin:/usr/bin:/sbin:/bin'
WEB = Path('/var/www/tests-ayuntamiento-preview')
ENV = Path('/etc/tests-ayuntamiento/api.env')
CADDY = Path('/opt/tests-ayuntamiento-https/caddy')
CONFIG = Path('/etc/tests-ayuntamiento-https/Caddyfile')
CADDY_SHA256 = '678ade3bfc088749c81a681adc603333ee0bb023b6a6cfe3c0f58bef8ff854e9'
OLD_CONFIG_SHA256 = '99955e8260176d9fc7440c42dc6d8eab27754a56c85bacaebf4c42085d3d4eea'
PREVIEW_SHA256 = 'ee9e283e86c393744ec89b6c63da065ff5fc80755992519fc95037586ea62f08'
EXTENSIONS = {'.html', '.js', '.css', '.json', '.svg', '.png', '.jpg', '.jpeg', '.gif', '.ico',
              '.webp', '.avif', '.woff', '.woff2', '.ttf', '.txt', '.webmanifest'}


def digest(content):
    return hashlib.sha256(content).hexdigest()


def run(arguments):
    try:
        return subprocess.run(arguments, check=True, capture_output=True, text=True,
                              env={'PATH': SYSTEM_PATH, 'LC_ALL': 'C', 'HOME': '/root'})
    except subprocess.CalledProcessError as error:
        diagnostic = '\n'.join((error.stderr or '').splitlines()[-6:])[-1000:]
        raise ValueError('Command failed: ' + Path(arguments[0]).name + ' ' + arguments[1]
                         + (': ' + diagnostic if diagnostic else '')) from error


def verify_path(path, uid, gid, mode, directory=False):
    info = path.lstat()
    valid_type = stat.S_ISDIR(info.st_mode) if directory else stat.S_ISREG(info.st_mode)
    if not valid_type or (info.st_uid, info.st_gid, stat.S_IMODE(info.st_mode)) != (uid, gid, mode):
        raise ValueError('Unexpected file type, ownership or permissions: ' + str(path))


def frontend_files(dist, manifest):
    if (not isinstance(manifest, dict) or set(manifest) != {'format', 'files'}
            or manifest['format'] != 1 or not isinstance(manifest['files'], dict)):
        raise ValueError('Expected manifest format 1 with an explicit files map.')
    if dist.is_symlink() or not dist.is_dir():
        raise ValueError('dist must be a real directory.')
    files = {}
    for path in dist.rglob('*'):
        if path.is_symlink() or not (path.is_dir() or path.is_file()):
            raise ValueError('Frontend must contain only regular static files and directories.')
        if path.is_file():
            files[path.relative_to(dist).as_posix()] = path
    if set(files) != set(manifest['files']) or 'index.html' not in files:
        raise ValueError('Frontend tree differs from its manifest or index.html is missing.')
    result = {}
    for name, expected in manifest['files'].items():
        relative = PurePosixPath(name)
        if (not name or relative.is_absolute() or str(relative) != name
                or any(part.startswith('.') for part in relative.parts)
                or relative.suffix.lower() not in EXTENSIONS
                or not isinstance(expected, dict) or set(expected) != {'sha256', 'size'}):
            raise ValueError('Invalid static manifest entry: ' + name)
        content = files[name].read_bytes()
        if expected != {'sha256': digest(content), 'size': len(content)}:
            raise ValueError('Static file hash or size mismatch: ' + name)
        result[name] = content
    return result


def preview_environment(content):
    lines = content.decode().splitlines()
    pairs = [line.split('=', 1) for line in lines]
    if any(len(pair) != 2 for pair in pairs) or len(pairs) != 4 or len(dict(pairs)) != 4:
        raise ValueError('API environment must contain exactly the four known keys.')
    values = dict(pairs)
    fixed = {'SQLITE_DB_PATH': '/var/lib/tests-ayuntamiento/tests-ayuntamiento.sqlite',
             'SQLITE_HOST': '127.0.0.1', 'SQLITE_PORT': '8765'}
    if set(values) != set(fixed) | {'SQLITE_ALLOWED_ORIGINS'} or any(values.get(key) != value for key, value in fixed.items()):
        raise ValueError('Unexpected database, host, port or environment key.')
    old = 'https://javiermorgaz.github.io'
    new = 'https://46.224.88.8'
    if values['SQLITE_ALLOWED_ORIGINS'] not in (old, old + ',' + new):
        raise ValueError('Unexpected existing frontend origins.')
    if values['SQLITE_ALLOWED_ORIGINS'] == old + ',' + new:
        return content
    return ('\n'.join('SQLITE_ALLOWED_ORIGINS=' + old + ',' + new if line.startswith('SQLITE_ALLOWED_ORIGINS=') else line
                      for line in lines) + '\n').encode()


def atomic_write(path, content, mode, gid=0):
    descriptor, temporary = tempfile.mkstemp(prefix='.preview-', dir=path.parent)
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


def wait_preview(expected_index, timeout=30):
    class NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self, request, file, code, message, headers, new_url):
            return None
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())
    deadline = time.monotonic() + timeout
    last_error = 'HTTPS is not ready.'
    while time.monotonic() < deadline:
        try:
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                break
            with opener.open('https://46.224.88.8/health', timeout=min(2, remaining)) as response:
                if response.status != 200 or json.loads(response.read(4096)) != {'ok': True}:
                    raise ValueError('HTTPS health response is not ready.')
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                break
            with opener.open('https://46.224.88.8/', timeout=min(2, remaining)) as response:
                if response.status != 200 or digest(response.read(len(expected_index) + 1)) != digest(expected_index):
                    raise ValueError('HTTPS frontend does not match the installed index.html.')
            return
        except (OSError, ValueError) as error:
            last_error = str(error)[-400:]
        remaining = deadline - time.monotonic()
        if remaining > 0:
            time.sleep(min(0.5, remaining))
    raise ValueError('HTTPS preview readiness timed out: ' + last_error)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', required=True, type=Path)
    arguments = parser.parse_args()
    if sys.platform != 'linux' or os.geteuid() != 0:
        parser.exit(1, 'Run as administrator on the target Linux server.\n')
    try:
        systemctl = shutil.which('systemctl', path=SYSTEM_PATH)
        if not systemctl:
            raise ValueError('Missing systemctl in trusted system PATH.')
        systemctl = str(Path(systemctl).resolve(strict=True))
        source = arguments.source.resolve(strict=True)
        for path in (source / 'manifest.json', source / 'deploy/Caddyfile.tests-ayuntamiento-preview'):
            if not stat.S_ISREG(path.lstat().st_mode) or path.parent.is_symlink():
                raise ValueError('Package manifest/configuration must be regular files without links.')
        files = frontend_files(source / 'dist', json.loads((source / 'manifest.json').read_text()))
        configuration = (source / 'deploy/Caddyfile.tests-ayuntamiento-preview').read_bytes()
        if digest(configuration) != PREVIEW_SHA256:
            raise ValueError('Preview configuration does not match its pinned hash.')
        accounts = {name: pwd.getpwnam(name) for name in ('tests-ayuntamiento', 'tests-ayuntamiento-https')}
        if len({account.pw_uid for account in accounts.values()}) != 2:
            raise ValueError('API and HTTPS must use different accounts.')
        for name, account in accounts.items():
            if (account.pw_uid == 0 or account.pw_shell != '/usr/sbin/nologin'
                    or account.pw_gid != grp.getgrnam(name).gr_gid):
                raise ValueError('Unexpected service account.')
            verify_path(Path('/var/lib') / name, account.pw_uid, account.pw_gid, 0o700, True)
            run([systemctl, 'is-active', '--quiet', name + '.service'])
        api_gid = accounts['tests-ayuntamiento'].pw_gid
        verify_path(ENV.parent, 0, api_gid, 0o750, True)
        verify_path(ENV, 0, api_gid, 0o640)
        verify_path(CONFIG.parent, 0, 0, 0o755, True)
        verify_path(CONFIG, 0, 0, 0o644)
        verify_path(CADDY.parent, 0, 0, 0o755, True)
        verify_path(CADDY, 0, 0, 0o755)
        if digest(CADDY.read_bytes()) != CADDY_SHA256:
            raise ValueError('Installed Caddy binary does not match the official pinned binary.')
        old_config, old_environment = CONFIG.read_bytes(), ENV.read_bytes()
        if digest(old_config) not in (OLD_CONFIG_SHA256, PREVIEW_SHA256):
            raise ValueError('Unexpected current Caddy configuration; no configuration changed.')
        environment = preview_environment(old_environment)
        if WEB.parent.exists() or WEB.parent.is_symlink():
            verify_path(WEB.parent, 0, 0, 0o755, True)
        if WEB.exists() or WEB.is_symlink():
            verify_path(WEB, 0, 0, 0o755, True)
            expected = {'format': 1, 'files': {name: {'sha256': digest(data), 'size': len(data)} for name, data in files.items()}}
            if frontend_files(WEB, expected) != files:
                raise ValueError('Existing preview differs; no files have been overwritten.')
            for path in WEB.rglob('*'):
                verify_path(path, 0, 0, 0o755 if path.is_dir() else 0o644, path.is_dir())
        with tempfile.NamedTemporaryFile(prefix='tests-preview-', mode='wb') as temporary:
            temporary.write(configuration)
            temporary.flush()
            adapted = json.loads(run([str(CADDY), 'adapt', '--config', temporary.name, '--adapter', 'caddyfile']).stdout)
            if adapted.get('admin', {}).get('disabled') is not True:
                raise ValueError('Caddy administrative endpoint must remain disabled.')
        os.umask(0o022)
        if not WEB.exists():
            WEB.parent.mkdir(mode=0o755, exist_ok=True)
            with tempfile.TemporaryDirectory(prefix='.tests-preview-', dir=WEB.parent) as staging:
                staging = Path(staging)
                for name, content in files.items():
                    target = staging / name
                    target.parent.mkdir(mode=0o755, parents=True, exist_ok=True)
                    target.write_bytes(content)
                    target.chmod(0o644)
                staging.chmod(0o755)
                WEB.mkdir(mode=0o755)  # Exclusive creation; never replace even an empty existing preview.
                for entry in staging.iterdir():
                    entry.rename(WEB / entry.name)
        changes = [(ENV, old_environment, environment, 0o640, api_gid, 'tests-ayuntamiento.service'),
                   (CONFIG, old_config, configuration, 0o644, 0, 'tests-ayuntamiento-https.service')]
        changes = [change for change in changes if change[1] != change[2]]
        timestamp = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
        for path, old, _, _, _, _ in changes:
            descriptor = os.open(str(path) + '.preview-backup-' + timestamp, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
            with os.fdopen(descriptor, 'wb') as backup:
                backup.write(old)
        try:
            for path, _, content, mode, gid, _ in changes:
                atomic_write(path, content, mode, gid)
            for _, _, _, _, _, service in changes:
                run([systemctl, 'restart', service])
                run([systemctl, 'is-active', '--quiet', service])
            wait_preview(files['index.html'])
        except (ValueError, OSError):
            for path, old, _, mode, gid, _ in changes:
                atomic_write(path, old, mode, gid)
            for _, _, _, _, _, service in changes:
                run([systemctl, 'restart', service])
            raise
        print('SQLite preview installed; verify https://46.224.88.8/ externally. GitHub Pages was not changed.')
    except (ValueError, OSError, KeyError) as error:
        parser.exit(1, 'Preview installation stopped: ' + str(error) + '\n')


if __name__ == '__main__':
    main()
