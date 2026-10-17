"""Install only Tests Ayuntamiento files on Ubuntu; do not start or expose services."""
import argparse
import grp
import hashlib
import os
from pathlib import Path
import pwd
import shutil
import sqlite3
import stat
import subprocess
import sys
import tempfile
from urllib.parse import urlsplit

ACCOUNT = 'tests-ayuntamiento'
CODE = Path('/opt/tests-ayuntamiento')
CONFIG = Path('/etc/tests-ayuntamiento')
STATE = Path('/var/lib/tests-ayuntamiento')
BACKUPS = Path('/var/backups/tests-ayuntamiento')
DATABASE = STATE / 'tests-ayuntamiento.sqlite'
SYSTEM_PATH = '/usr/sbin:/usr/bin:/sbin:/bin'
CODE_FILES = (
    'server/__init__.py', 'server/database.py', 'server/manage.py', 'server/app.py',
    'deploy/sqlite-backup.py',
)
UNITS = (
    'tests-ayuntamiento.service', 'tests-ayuntamiento-backup.service',
    'tests-ayuntamiento-backup.timer',
)


def fail(message):
    raise SystemExit(message)


def system_programs():
    programs = {}
    for name in ('systemctl', 'useradd', 'groupadd', 'runuser'):
        executable = shutil.which(name, path=SYSTEM_PATH)
        if executable is None:
            fail('Missing system prerequisite: ' + name)
        programs[name] = executable
    return programs


def migrate_initial_copy(python, database, runuser):
    subprocess.run([
        runuser, '-u', ACCOUNT, '--', str(python), '-m', 'server.manage',
        '--db', str(database), 'migrate',
    ], check=True, cwd=CODE, env={'PATH': '/usr/bin:/bin', 'PYTHONDONTWRITEBYTECODE': '1'})


def regular_file(path):
    if not path.is_file() or path.is_symlink():
        fail('Expected a regular file, not a link: ' + str(path))


def digest(path):
    return hashlib.sha256(path.read_bytes()).digest()


def verify_database(path):
    regular_file(path)
    connection = sqlite3.connect(path.resolve().as_uri() + '?mode=ro', uri=True)
    try:
        if connection.execute('PRAGMA integrity_check').fetchall() != [('ok',)]:
            fail('SQLite integrity check failed.')
        if connection.execute('PRAGMA foreign_key_check').fetchall():
            fail('SQLite foreign key check failed.')
        tables = {row[0] for row in connection.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        if not {'tests', 'results'} <= tables:
            fail('The initial database must contain the imported tests and results tables.')
    finally:
        connection.close()


def verify_directory(path, owner, group, mode):
    if not path.exists() and not path.is_symlink():
        return
    info = path.lstat()
    if (not stat.S_ISDIR(info.st_mode) or info.st_uid != owner or info.st_gid != group
            or stat.S_IMODE(info.st_mode) != mode):
        fail('Existing directory has unexpected ownership or permissions: ' + str(path))


def verify_file_permissions(path, owner, group, mode):
    if not path.exists() and not path.is_symlink():
        return
    regular_file(path)
    info = path.lstat()
    if (info.st_uid, info.st_gid, stat.S_IMODE(info.st_mode)) != (owner, group, mode):
        fail('Existing file has unexpected ownership or permissions: ' + str(path))


def verify_venv(path):
    if not path.exists():
        return
    for directory, directories, files in os.walk(path, followlinks=False):
        for name in directories + files:
            entry = Path(directory) / name
            info = entry.lstat()
            if info.st_uid != 0 or info.st_gid != 0:
                fail('The private Python environment must be entirely root-owned.')
            if entry.is_symlink():
                resolved = entry.resolve()
                if not resolved.is_relative_to(path) and not str(resolved).startswith('/usr/bin/python'):
                    fail('Unexpected link in the private Python environment: ' + str(entry))
            elif info.st_mode & 0o022:
                fail('The private Python environment must not be writable by other users.')


def write_exclusive(path, data, owner=0, group=0, mode=0o644):
    descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, mode)
    with os.fdopen(descriptor, 'wb') as output:
        output.write(data)
        output.flush()
        os.fsync(output.fileno())
    os.chown(path, owner, group)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', required=True, type=Path, help='Private staging directory containing the explicit whitelist.')
    parser.add_argument('--initial-db', type=Path, help='Only for the first installation; never overwrites a database.')
    parser.add_argument('--allowed-origin', action='append', required=True, help='Exact HTTPS frontend origin; repeat for multiple origins.')
    arguments = parser.parse_args()
    if sys.platform != 'linux' or os.geteuid() != 0:
        fail('Run this installer as administrator on the target Linux server.')
    programs = system_programs()
    for origin in arguments.allowed_origin:
        url = urlsplit(origin)
        if (url.scheme != 'https' or not url.hostname or url.username or url.password
                or url.path or url.query or url.fragment or ',' in origin
                or any(character.isspace() or character in '"\\' for character in origin)):
            fail('Provide exact HTTPS origins without paths, credentials, spaces or quotes.')
        try:
            url.port
        except ValueError:
            fail('Invalid origin port.')
    origins = ','.join(dict.fromkeys(arguments.allowed_origin))
    source = arguments.source.resolve(strict=True)
    for relative in CODE_FILES + tuple('deploy/' + name for name in UNITS):
        file = source / relative
        regular_file(file)
        if file.resolve().parent != (source / relative).parent.resolve() or (source / relative).parent.is_symlink():
            fail('Source subdirectories must not be symlinks.')
    if subprocess.run([programs['systemctl'], 'is-active', '--quiet', ACCOUNT + '.service']).returncode == 0:
        fail('Stop only tests-ayuntamiento.service before any installation; running databases are not migrated.')
    try:
        account = pwd.getpwnam(ACCOUNT)
        group = grp.getgrnam(ACCOUNT)
        if (account.pw_uid == 0 or account.pw_gid != group.gr_gid or account.pw_shell != '/usr/sbin/nologin'
                or account.pw_dir != '/nonexistent' or any(ACCOUNT in entry.gr_mem for entry in grp.getgrall())):
            fail('Existing service account is not the expected isolated account.')
    except KeyError:
        account = None
        try:
            grp.getgrnam(ACCOUNT)
        except KeyError:
            pass
        else:
            fail('A group with the service name already exists without the expected account.')
    expected_config = (
        'SQLITE_DB_PATH=/var/lib/tests-ayuntamiento/tests-ayuntamiento.sqlite\n'
        'SQLITE_HOST=127.0.0.1\nSQLITE_PORT=8765\nSQLITE_ALLOWED_ORIGINS=' + origins + '\n'
    ).encode()
    for relative in CODE_FILES:
        target = CODE / relative
        if target.exists() or target.is_symlink():
            regular_file(target)
            if digest(target) != digest(source / relative):
                fail('Installed code differs. Use the documented backup/update procedure, not this first-install script.')
    configuration = CONFIG / 'api.env'
    if configuration.exists() or configuration.is_symlink():
        regular_file(configuration)
        if configuration.read_bytes() != expected_config:
            fail('Existing configuration differs; no configuration has been replaced.')
    for name in UNITS:
        target = Path('/etc/systemd/system') / name
        if target.exists() or target.is_symlink():
            regular_file(target)
            if digest(target) != digest(source / 'deploy' / name):
                fail('Existing systemd unit differs; no unit has been replaced: ' + name)
    if DATABASE.exists() or DATABASE.is_symlink():
        if arguments.initial_db is not None:
            fail('A database already exists. Omit --initial-db for an identical installation; never replace it.')
        verify_database(DATABASE)
    elif arguments.initial_db is None:
        fail('First installation requires an explicit --initial-db containing the verified import.')
    else:
        verify_database(arguments.initial_db)
    verify_directory(CODE, 0, 0, 0o755)
    for directory in (CODE / 'server', CODE / 'deploy'):
        verify_directory(directory, 0, 0, 0o755)
    for relative in CODE_FILES:
        verify_file_permissions(CODE / relative, 0, 0, 0o644)
    for name in UNITS:
        verify_file_permissions(Path('/etc/systemd/system') / name, 0, 0, 0o644)
    if account is not None:
        verify_directory(CONFIG, 0, account.pw_gid, 0o750)
        verify_directory(STATE, account.pw_uid, account.pw_gid, 0o700)
        verify_file_permissions(configuration, 0, account.pw_gid, 0o640)
        verify_file_permissions(DATABASE, account.pw_uid, account.pw_gid, 0o600)
    elif CONFIG.exists() or STATE.exists():
        fail('Configuration or state directories already exist without the service account.')
    verify_directory(BACKUPS, 0, 0, 0o700)
    verify_directory(CODE / 'venv', 0, 0, 0o755)
    verify_venv(CODE / 'venv')
    os.umask(0o022)
    if account is None:
        subprocess.run([programs['groupadd'], '--system', ACCOUNT], check=True)
        subprocess.run([
            programs['useradd'], '--system', '--gid', ACCOUNT, '--home-dir', '/nonexistent',
            '--no-create-home', '--shell', '/usr/sbin/nologin', ACCOUNT,
        ], check=True)
        account = pwd.getpwnam(ACCOUNT)
    for directory, owner, group_id, mode in (
        (CODE, 0, 0, 0o755), (CONFIG, 0, account.pw_gid, 0o750),
        (STATE, account.pw_uid, account.pw_gid, 0o700), (BACKUPS, 0, 0, 0o700),
    ):
        if not directory.exists():
            directory.mkdir(mode=mode)
            os.chown(directory, owner, group_id)
    for relative in CODE_FILES:
        target = CODE / relative
        target.parent.mkdir(mode=0o755, parents=True, exist_ok=True)
        if not target.exists():
            write_exclusive(target, (source / relative).read_bytes())
    venv = CODE / 'venv'
    if venv.is_symlink():
        fail('The private Python environment must not be a symlink.')
    if not venv.exists():
        subprocess.run([sys.executable, '-m', 'venv', '--without-pip', str(venv)], check=True)
    python = venv / 'bin/python'
    if not python.is_file():
        fail('Private Python environment is incomplete; repair it before continuing.')
    if not configuration.exists():
        write_exclusive(configuration, expected_config, 0, account.pw_gid, 0o640)
    if not DATABASE.exists():
        descriptor, temporary_name = tempfile.mkstemp(prefix='.initial-', suffix='.sqlite', dir=STATE)
        os.close(descriptor)
        temporary = Path(temporary_name)
        try:
            original = sqlite3.connect(arguments.initial_db.resolve().as_uri() + '?mode=ro', uri=True)
            copy = sqlite3.connect(temporary)
            try:
                original.backup(copy)
            finally:
                copy.close()
                original.close()
            os.chown(temporary, account.pw_uid, account.pw_gid)
            migrate_initial_copy(python, temporary, programs['runuser'])
            verify_database(temporary)
            os.link(temporary, DATABASE)
        finally:
            temporary.unlink(missing_ok=True)
    else:
        print('Existing database retained; no schema migration or data change was performed.')
    for name in UNITS:
        target = Path('/etc/systemd/system') / name
        if not target.exists():
            write_exclusive(target, (source / 'deploy' / name).read_bytes())
    subprocess.run([programs['systemctl'], 'daemon-reload'], check=True)
    print('Installation prepared. No service was started, enabled or publicly exposed.')
    print('Next: verify units, create a device token privately, then start the API and backup timer explicitly.')


if __name__ == '__main__':
    main()
