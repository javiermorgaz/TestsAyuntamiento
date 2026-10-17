"""Install the pinned, independent HTTPS proxy; never modify OpenClaw or SSH."""
import argparse
import datetime
import grp
import hashlib
import json
import os
from pathlib import Path
import pwd
import re
import shutil
import socket
import stat
import subprocess
import sys
import tempfile
import urllib.request

ACCOUNT = 'tests-ayuntamiento-https'
CODE = Path('/opt') / ACCOUNT
CONFIG = Path('/etc') / ACCOUNT
STATE = Path('/var/lib') / ACCOUNT
UNIT = Path('/etc/systemd/system') / (ACCOUNT + '.service')
SYSTEM_PATH = '/usr/sbin:/usr/bin:/sbin:/bin'
CADDY_SHA256 = '678ade3bfc088749c81a681adc603333ee0bb023b6a6cfe3c0f58bef8ff854e9'
CONFIG_SHA256 = '99955e8260176d9fc7440c42dc6d8eab27754a56c85bacaebf4c42085d3d4eea'
UNIT_SHA256 = '53b4c6cd4c6a48cbb80ef3a689b053221168020bb66217d2f0fe4f0a035e30cc'


def run(arguments, **kwargs):
    try:
        return subprocess.run(arguments, check=True, capture_output=True, text=True,
                              env={'PATH': SYSTEM_PATH, 'LC_ALL': 'C', 'HOME': '/root'}, **kwargs)
    except subprocess.CalledProcessError as error:
        diagnostic = '\n'.join((error.stderr or '').splitlines()[-8:])[-1200:]
        operation = Path(arguments[0]).name + ' ' + (arguments[1] if len(arguments) > 1 else '')
        raise ValueError('Command failed: ' + operation + (': ' + diagnostic if diagnostic else '')) from error


def resolve_programs():
    programs = {}
    for name in ('systemctl', 'systemd-analyze', 'useradd', 'groupadd'):
        executable = shutil.which(name, path=SYSTEM_PATH)
        if executable is None:
            raise ValueError('Missing required system program: ' + name)
        programs[name] = str(Path(executable).resolve(strict=True))
    programs['ufw'] = shutil.which('ufw', path=SYSTEM_PATH)
    return programs


def blob(path, expected):
    info = path.lstat()
    if not stat.S_ISREG(info.st_mode):
        raise ValueError('Expected a regular file, not a link: ' + str(path))
    content = path.read_bytes()
    if hashlib.sha256(content).hexdigest() != expected:
        raise ValueError('Pinned SHA256 mismatch: ' + path.name)
    return content


def verify_existing(path, owner, group, mode, content=None):
    if not path.exists() and not path.is_symlink():
        return
    info = path.lstat()
    expected_kind = stat.S_ISDIR(info.st_mode) if content is None else stat.S_ISREG(info.st_mode)
    if (not expected_kind or info.st_uid != owner or info.st_gid != group
            or stat.S_IMODE(info.st_mode) != mode):
        raise ValueError('Unexpected existing ownership, permissions or type: ' + str(path))
    if content is not None and path.read_bytes() != content:
        raise ValueError('Existing file differs; no file will be overwritten: ' + str(path))


def write_exclusive(path, content, mode):
    descriptor = os.open(path, os.O_CREAT | os.O_EXCL | os.O_WRONLY | os.O_NOFOLLOW, mode)
    with os.fdopen(descriptor, 'wb') as output:
        output.write(content)
        output.flush()
        os.fsync(output.fileno())


def check_account(account, group, groups, users):
    if (account.pw_uid == 0 or account.pw_gid != group.gr_gid
            or account.pw_shell != '/usr/sbin/nologin' or account.pw_dir != '/nonexistent'
            or any(ACCOUNT in entry.gr_mem for entry in groups)
            or any(entry.gr_gid == account.pw_gid and entry.gr_name != ACCOUNT for entry in groups)
            or any(entry.pw_uid == account.pw_uid and entry.pw_name != ACCOUNT for entry in users)):
        raise ValueError('Existing HTTPS account is not the expected isolated service account.')


def check_api_health():
    class NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self, request, file, code, message, headers, new_url):
            return None
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())
    with opener.open('http://127.0.0.1:8765/health', timeout=5) as response:
        if response.status != 200 or json.loads(response.read(4096)) != {'ok': True}:
            raise ValueError('The local SQLite API health check failed.')


def check_ports():
    listeners = []
    try:
        for family, host in ((socket.AF_INET, '0.0.0.0'), (socket.AF_INET6, '::')):
            for port in (80, 443):
                listener = socket.socket(family, socket.SOCK_STREAM)
                listeners.append(listener)
                if family == socket.AF_INET6:
                    listener.setsockopt(socket.IPPROTO_IPV6, socket.IPV6_V6ONLY, 1)
                listener.bind((host, port))
                listener.listen(1)
    except OSError as error:
        raise ValueError('TCP 80/443 must be available; no existing service has been stopped.') from error
    finally:
        for listener in listeners:
            listener.close()


def check_adapted(adapted):
    admin = adapted.get('admin', {})
    if admin.get('disabled') is not True or admin.get('config', {}).get('persist') is not False:
        raise ValueError('Caddy admin and configuration persistence must be disabled.')
    servers = adapted.get('apps', {}).get('http', {}).get('servers', {})
    if not servers or any(server.get('protocols') != ['h1', 'h2'] for server in servers.values()):
        raise ValueError('Only HTTP/1 and HTTP/2 over TCP are permitted.')
    policies = adapted.get('apps', {}).get('tls', {}).get('automation', {}).get('policies', [])
    issuers = [issuer for policy in policies for issuer in policy.get('issuers', [])]
    if not issuers or any(issuer.get('module') != 'acme'
                          or issuer.get('ca') != 'https://acme-v02.api.letsencrypt.org/directory'
                          or issuer.get('profile') != 'shortlived' for issuer in issuers):
        raise ValueError('Require explicit public Let\'s Encrypt shortlived ACME certificates.')


def check_caddy(binary, config):
    version = run([str(binary), 'version']).stdout.strip()
    match = re.match(r'v?(\d+)\.(\d+)\.(\d+)(?:\s|$)', version)
    if not match or tuple(map(int, match.groups())) < (2, 11, 0):
        raise ValueError('Require stable Caddy >= 2.11.0.')
    adapted = run([str(binary), 'adapt', '--config', str(config), '--adapter', 'caddyfile'])
    check_adapted(json.loads(adapted.stdout))


def public_rule_present(status, port):
    for line in status.splitlines():
        fields = line.partition('#')[0].split()
        if fields and fields[0] == str(port) + '/tcp' and fields[1:] in (
                ['ALLOW', 'Anywhere'], ['ALLOW', 'IN', 'Anywhere']):
            return True
    return False


def inspect_firewall(program):
    if program is None:
        return 'not-installed', '', []
    result = run([program, 'status', 'verbose']).stdout
    first = result.splitlines()[0] if result.splitlines() else ''
    if first == 'Status: inactive':
        return 'inactive', result, []
    if first != 'Status: active':
        raise ValueError('Unrecognized UFW status; firewall has not been changed.')
    return 'active', result, [port for port in (80, 443) if not public_rule_present(result, port)]


def configure_firewall(program, status, ports):
    if not ports:
        return
    timestamp = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
    backup = CONFIG / ('firewall-before-' + timestamp)
    backup.mkdir(mode=0o700)
    write_exclusive(backup / 'status.txt', status.encode(), 0o600)
    for name in ('user.rules', 'user6.rules'):
        source = Path('/etc/ufw') / name
        if source.exists():
            if not stat.S_ISREG(source.lstat().st_mode):
                raise ValueError('UFW rule file must be a regular file.')
            write_exclusive(backup / name, source.read_bytes(), 0o600)
    for port in ports:
        run([program, 'allow', str(port) + '/tcp', 'comment', 'Tests Ayuntamiento HTTPS'])


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', required=True, type=Path, help='Private package containing caddy and deploy files.')
    arguments = parser.parse_args()
    if sys.platform != 'linux' or os.geteuid() != 0:
        parser.exit(1, 'Run as administrator on the target Linux server.\n')
    try:
        programs = resolve_programs()  # No mutation before all required tools are resolved.
        source = arguments.source.resolve(strict=True)
        if (source / 'deploy').is_symlink():
            raise ValueError('Package deploy directory must not be a symlink.')
        binary = blob(source / 'caddy', CADDY_SHA256)
        configuration = blob(source / 'deploy/Caddyfile.tests-ayuntamiento-https', CONFIG_SHA256)
        unit = blob(source / 'deploy/tests-ayuntamiento-https.service', UNIT_SHA256)
        check_api_health()
        active = subprocess.run([programs['systemctl'], 'is-active', '--quiet', ACCOUNT + '.service'],
                                env={'PATH': SYSTEM_PATH, 'LC_ALL': 'C'}, capture_output=True).returncode == 0
        if not active:
            check_ports()
        try:
            account = pwd.getpwnam(ACCOUNT)
        except KeyError:
            account = None
        if account is not None:
            group = grp.getgrnam(ACCOUNT)
            check_account(account, group, grp.getgrall(), pwd.getpwall())
            verify_existing(STATE, account.pw_uid, account.pw_gid, 0o700)
        else:
            try:
                grp.getgrnam(ACCOUNT)
            except KeyError:
                pass
            else:
                raise ValueError('The HTTPS group already exists without the expected account.')
            if STATE.exists() or STATE.is_symlink():
                raise ValueError('HTTPS state exists without its expected account.')
        verify_existing(CODE, 0, 0, 0o755)
        verify_existing(CONFIG, 0, 0, 0o755)
        targets = ((CODE / 'caddy', binary, 0o755), (CONFIG / 'Caddyfile', configuration, 0o644), (UNIT, unit, 0o644))
        for target, content, mode in targets:
            verify_existing(target, 0, 0, mode, content)
        if active and any(not target.exists() for target, _, _ in targets):
            raise ValueError('Active HTTPS service has incomplete or unexpected installation paths.')
        firewall_status, firewall_snapshot, firewall_ports = inspect_firewall(programs['ufw'])
        with tempfile.TemporaryDirectory(prefix='tests-ayuntamiento-https-preflight-') as temporary:
            temporary = Path(temporary)
            write_exclusive(temporary / 'caddy', binary, 0o700)
            write_exclusive(temporary / 'Caddyfile', configuration, 0o600)
            check_caddy(temporary / 'caddy', temporary / 'Caddyfile')
        os.umask(0o022)
        if account is None:
            run([programs['groupadd'], '--system', ACCOUNT])
            run([programs['useradd'], '--system', '--gid', ACCOUNT, '--home-dir', '/nonexistent',
                 '--no-create-home', '--shell', '/usr/sbin/nologin', ACCOUNT])
            account = pwd.getpwnam(ACCOUNT)
        for directory, owner, group, mode in (
                (CODE, 0, 0, 0o755), (CONFIG, 0, 0, 0o755), (STATE, account.pw_uid, account.pw_gid, 0o700)):
            if not directory.exists():
                directory.mkdir(mode=mode)
                os.chown(directory, owner, group)
        unit_created = not UNIT.exists()
        for target, content, mode in targets:
            if not target.exists():
                write_exclusive(target, content, mode)
        run([programs['systemd-analyze'], 'verify', str(UNIT)])
        configure_firewall(programs['ufw'], firewall_snapshot, firewall_ports)
        if unit_created:
            run([programs['systemctl'], 'daemon-reload'])
        run([programs['systemctl'], 'enable', '--now', ACCOUNT + '.service'])
        run([programs['systemctl'], 'is-active', '--quiet', ACCOUNT + '.service'])
        print('Independent HTTPS service is active; certificate issuance and external HTTPS verification remain pending.')
        print('UFW: ' + firewall_status + '; opened TCP ports: ' + (','.join(map(str, firewall_ports)) or 'none'))
        print('OpenClaw, SSH rules, SQLite API and existing certificates have not been modified.')
    except (ValueError, OSError, KeyError, subprocess.SubprocessError) as error:
        parser.exit(1, 'HTTPS installation stopped: ' + str(error) + '\n')


if __name__ == '__main__':
    main()
