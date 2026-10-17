"""Check the proposed IP HTTPS fragment; do not start or reconfigure Caddy."""
import argparse
import json
from pathlib import Path
import re
import subprocess


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--binary', required=True, type=Path)
    parser.add_argument('--config', type=Path, default=Path('deploy/Caddyfile.tests-ayuntamiento-ip.example'))
    arguments = parser.parse_args()
    version = subprocess.run([str(arguments.binary), 'version'], capture_output=True, text=True, check=True).stdout
    match = re.match(r'v?(\d+)\.(\d+)\.(\d+)(?:\s|$)', version.strip())
    if not match or tuple(map(int, match.groups())) < (2, 11, 0):
        parser.error('Require a stable Caddy release >= 2.11.0 for this IP HTTPS configuration.')
    result = subprocess.run([
        str(arguments.binary), 'adapt', '--config', str(arguments.config), '--adapter', 'caddyfile',
    ], capture_output=True, text=True, check=True)
    adapted = json.loads(result.stdout)
    policies = adapted.get('apps', {}).get('tls', {}).get('automation', {}).get('policies', [])
    issuers = [issuer for policy in policies for issuer in policy.get('issuers', [])]
    if not issuers or any(
        issuer.get('module') != 'acme'
        or issuer.get('ca') != 'https://acme-v02.api.letsencrypt.org/directory'
        or issuer.get('profile') != 'shortlived'
        for issuer in issuers
    ):
        parser.error('Require explicit Let\'s Encrypt ACME issuers with the shortlived profile; internal certificates are refused.')
    print('Caddy version and explicit public ACME profile verified; no service or certificate was created.')
    print('Certificate issuance and automatic renewal still require validation on the server.')


if __name__ == '__main__':
    main()
