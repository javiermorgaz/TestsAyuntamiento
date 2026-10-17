"""Download one private SQLite backup through SSH without overwriting local data."""
import argparse
import os
from pathlib import Path
import re
import shlex
import sqlite3
import stat
import subprocess
import tempfile


def verify(path):
    connection = sqlite3.connect(path.resolve().as_uri() + '?mode=ro', uri=True)
    try:
        if connection.execute('PRAGMA integrity_check').fetchall() != [('ok',)]:
            raise ValueError('SQLite integrity check failed.')
        if connection.execute('PRAGMA foreign_key_check').fetchall():
            raise ValueError('SQLite foreign key check failed.')
        tables = {row[0] for row in connection.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        if not {'tests', 'results', 'devices'} <= tables:
            raise ValueError('This file is not a migrated Tests Ayuntamiento database.')
    finally:
        connection.close()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--ssh-target', required=True, help='An SSH account already authorized to read this backup.')
    parser.add_argument('--backup-name', required=True)
    parser.add_argument('--destination', type=Path, required=True)
    arguments = parser.parse_args()
    if not re.fullmatch(r'[A-Za-z0-9_.@:-]+', arguments.ssh_target) or arguments.ssh_target.startswith('-'):
        parser.error('Invalid SSH target.')
    if not re.fullmatch(r'tests-ayuntamiento-\d{8}T\d{12}Z\.sqlite', arguments.backup_name):
        parser.error('Use the exact filename of a backup created by the backup service.')
    destination = arguments.destination.absolute()
    if destination.exists() or destination.is_symlink():
        parser.error('The destination already exists; select a new filename.')
    if not destination.parent.is_dir():
        parser.error('Create a private destination directory first (mode 0700).')
    directory_info = destination.parent.lstat()
    if (not stat.S_ISDIR(directory_info.st_mode) or directory_info.st_uid != os.getuid()
            or stat.S_IMODE(directory_info.st_mode) != 0o700):
        parser.error('The destination directory must belong to you and have mode 0700.')
    os.umask(0o077)
    descriptor, temporary_name = tempfile.mkstemp(prefix='.sqlite-download-', dir=destination.parent)
    temporary = Path(temporary_name)
    try:
        remote = '/var/backups/tests-ayuntamiento/' + arguments.backup_name
        with os.fdopen(descriptor, 'wb') as output:
            subprocess.run([
                'ssh', '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=yes',
                '-o', 'UpdateHostKeys=no', '-o', 'ConnectTimeout=15', arguments.ssh_target,
                'cat -- ' + shlex.quote(remote),
            ], stdout=output, check=True)
            output.flush()
            os.fsync(output.fileno())
        verify(temporary)
        os.link(temporary, destination)  # Atomic publication that refuses a raced overwrite.
        print('Backup downloaded and verified: ' + str(destination))
    finally:
        temporary.unlink(missing_ok=True)


if __name__ == '__main__':
    main()
