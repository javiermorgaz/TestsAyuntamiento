"""Create a private, consistent backup; the timer never removes previous copies."""
import datetime
import os
from pathlib import Path
import stat
import subprocess
import sys

DESTINATION = Path('/var/backups/tests-ayuntamiento')
DATABASE = Path('/var/lib/tests-ayuntamiento/tests-ayuntamiento.sqlite')


def main():
    os.umask(0o077)
    info = DESTINATION.lstat()
    if not stat.S_ISDIR(info.st_mode) or info.st_uid != 0 or stat.S_IMODE(info.st_mode) != 0o700:
        raise SystemExit('The backup directory must be a root-owned directory with mode 0700.')
    timestamp = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
    target = DESTINATION / ('tests-ayuntamiento-' + timestamp + '.sqlite')
    subprocess.run([
        sys.executable, '-m', 'server.manage', '--db', str(DATABASE), 'backup', str(target)
    ], check=True)
    print('Consistent backup completed: ' + target.name)


if __name__ == '__main__':
    main()
