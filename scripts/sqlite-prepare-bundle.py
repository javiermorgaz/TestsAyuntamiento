"""Prepare a private, explicit deployment bundle locally; never connect to a server."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import sqlite3
import stat
from urllib.parse import urlsplit

SOURCE = Path(__file__).resolve().parents[1]
FILES = (
    'server/__init__.py', 'server/database.py', 'server/manage.py', 'server/app.py',
    'deploy/tests-ayuntamiento.service', 'deploy/tests-ayuntamiento-backup.service',
    'deploy/tests-ayuntamiento-backup.timer', 'deploy/sqlite-backup.py',
    'deploy/Caddyfile.tests-ayuntamiento.example', 'deploy/Caddyfile.tests-ayuntamiento-ip.example',
    'scripts/sqlite-install.py', 'scripts/sqlite-check-caddy.py', 'scripts/sqlite-download-backup.py',
    'docs/SQLITE_DEPLOYMENT.md',
)


def verify_database(connection):
    if connection.execute('PRAGMA integrity_check').fetchall() != [('ok',)]:
        raise ValueError('SQLite integrity check failed.')
    if connection.execute('PRAGMA foreign_key_check').fetchall():
        raise ValueError('SQLite foreign key check failed.')
    tables = {row[0] for row in connection.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    if not {'tests', 'results'} <= tables:
        raise ValueError('Expected imported tests and results tables.')
    return {name: connection.execute('SELECT count(*) FROM ' + name).fetchone()[0] for name in ('tests', 'results')}


def write_private(path, content):
    descriptor = os.open(path, os.O_CREAT | os.O_EXCL | os.O_WRONLY | os.O_NOFOLLOW, 0o600)
    with os.fdopen(descriptor, 'wb') as output:
        output.write(content)
        output.flush()
        os.fsync(output.fileno())


def metadata(path):
    return {'sha256': hashlib.sha256(path.read_bytes()).hexdigest(), 'size': path.stat().st_size}


def prepare(initial_db, output_dir, remote_path, allowed_origin, source=SOURCE):
    source = Path(source).resolve(strict=True)
    database_path = Path(initial_db)
    requested_output = Path(output_dir)
    if requested_output.exists() or requested_output.is_symlink():
        raise ValueError('Output directory already exists; choose a new private staging path.')
    output = requested_output.resolve(strict=False)
    private_root = source / '.migration'
    if not output.is_relative_to(private_root) or output == private_root:
        raise ValueError('Output must be a new directory below this repository\'s .migration directory.')
    if not re.fullmatch(r'/tmp/tests-ayuntamiento-[A-Za-z0-9][A-Za-z0-9_-]{0,63}', remote_path):
        raise ValueError('Remote staging path must be /tmp/tests-ayuntamiento-<unique-name>.')
    origin = urlsplit(allowed_origin)
    if (origin.scheme != 'https' or not origin.hostname or origin.username or origin.password
            or origin.path or origin.query or origin.fragment
            or any(character.isspace() or character in '\\"\' ,' for character in allowed_origin)):
        raise ValueError('Use an exact HTTPS frontend origin without a path or credentials.')
    origin.port  # Validate a supplied port.
    if database_path.is_symlink() or not database_path.is_file():
        raise ValueError('Initial database must be a regular file, not a symlink.')
    for relative in FILES:
        file = source / relative
        if not file.is_file() or file.is_symlink():
            raise ValueError('Missing or linked whitelisted source: ' + relative)
        if any(parent.is_symlink() for parent in file.parents if parent != source and parent.is_relative_to(source)):
            raise ValueError('Linked source directory is not allowed: ' + relative)
    os.umask(0o077)
    # Every existing component of staging must be private and owned by this user.
    for directory in reversed((output.parent,) + tuple(output.parent.parents)):
        if directory == private_root or directory.is_relative_to(private_root):
            if directory.exists() or directory.is_symlink():
                info = directory.lstat()
                if (not stat.S_ISDIR(info.st_mode) or info.st_uid != os.getuid()
                        or stat.S_IMODE(info.st_mode) != 0o700):
                    raise ValueError('Existing staging directories must be owned by you with mode 0700.')
            else:
                directory.mkdir(mode=0o700)
    original = sqlite3.connect(database_path.resolve().as_uri() + '?mode=ro', uri=True)
    try:
        original_counts = verify_database(original)
        output.mkdir(mode=0o700)  # Exclusive creation; a raced existing path is refused.
        for relative in FILES:
            target = output / relative
            target.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
            write_private(target, (source / relative).read_bytes())
        initial = output / 'initial.sqlite'
        descriptor = os.open(initial, os.O_CREAT | os.O_EXCL | os.O_WRONLY | os.O_NOFOLLOW, 0o600)
        os.close(descriptor)
        copied = sqlite3.connect(initial)
        try:
            original.backup(copied)
            counts = verify_database(copied)
            if counts != original_counts:
                raise ValueError('Database changed while preparing the bundle; repeat with a stable snapshot.')
        finally:
            copied.close()
    finally:
        original.close()
    command = (
        'sudo python3 ' + remote_path + '/scripts/sqlite-install.py --source ' + remote_path
        + ' --initial-db ' + remote_path + '/initial.sqlite --allowed-origin ' + allowed_origin + '\n'
    )
    write_private(output / 'install-command.txt', command.encode())
    contents = FILES + ('initial.sqlite', 'install-command.txt')
    manifest = {'format': 1, 'files': {relative: metadata(output / relative) for relative in contents}}
    write_private(output / 'manifest.json', (json.dumps(manifest, indent=2, sort_keys=True) + '\n').encode())
    for relative, expected in manifest['files'].items():
        if metadata(output / relative) != expected:
            raise ValueError('Prepared bundle hash verification failed: ' + relative)
    with sqlite3.connect(initial.resolve().as_uri() + '?mode=ro', uri=True) as connection:
        verified_counts = verify_database(connection)
    return {'directory': str(output), 'files': len(contents) + 1, 'counts': verified_counts, 'hashes_verified': True}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--initial-db', required=True, type=Path)
    parser.add_argument('--output-dir', required=True, type=Path)
    parser.add_argument('--remote-path', required=True)
    parser.add_argument('--allowed-origin', required=True)
    arguments = parser.parse_args()
    try:
        result = prepare(arguments.initial_db, arguments.output_dir, arguments.remote_path, arguments.allowed_origin)
    except (ValueError, OSError, sqlite3.Error) as error:
        parser.exit(1, 'Bundle preparation failed: ' + str(error) + '\n')
    print(json.dumps(result, sort_keys=True))


if __name__ == '__main__':
    main()
