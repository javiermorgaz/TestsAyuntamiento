"""HTTPS deployment checks without root, network access or service changes."""
import hashlib
import importlib.util
import json
import subprocess
from pathlib import Path
from types import SimpleNamespace
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
specification = importlib.util.spec_from_file_location('sqlite_https', ROOT / 'scripts/sqlite-install-https.py')
https = importlib.util.module_from_spec(specification)
specification.loader.exec_module(https)


def adapted():
    return {
        'admin': {'disabled': True, 'config': {'persist': False}},
        'apps': {
            'http': {'servers': {'srv0': {'protocols': ['h1', 'h2']}}},
            'tls': {'automation': {'policies': [{'issuers': [{
                'module': 'acme', 'ca': 'https://acme-v02.api.letsencrypt.org/directory', 'profile': 'shortlived',
            }]}]}},
        },
    }


class HttpsDeployment(unittest.TestCase):
    def test_pinned_files_and_paths_are_independent(self):
        self.assertEqual(https.CADDY_SHA256, '678ade3bfc088749c81a681adc603333ee0bb023b6a6cfe3c0f58bef8ff854e9')
        for filename, expected in (
                ('deploy/Caddyfile.tests-ayuntamiento-https', https.CONFIG_SHA256),
                ('deploy/tests-ayuntamiento-https.service', https.UNIT_SHA256)):
            content = (ROOT / filename).read_bytes()
            self.assertEqual(hashlib.sha256(content).hexdigest(), expected)
            self.assertNotIn(b'/home/', content)
            self.assertNotIn(b'openclaw', content.lower())
        self.assertEqual(str(https.CODE), '/opt/tests-ayuntamiento-https')
        self.assertEqual(str(https.CONFIG), '/etc/tests-ayuntamiento-https')
        self.assertEqual(str(https.STATE), '/var/lib/tests-ayuntamiento-https')

    def test_non_root_rejected_without_program_execution(self):
        with patch('sys.argv', ['install', '--source', '/private/package']), \
                patch.object(https.sys, 'platform', 'linux'), \
                patch.object(https.os, 'geteuid', return_value=1000), \
                patch.object(https, 'resolve_programs') as resolve:
            with self.assertRaises(SystemExit):
                https.main()
            resolve.assert_not_called()

    def test_missing_tool_fails_before_mutation(self):
        with patch('sys.argv', ['install', '--source', '/private/package']), \
                patch.object(https.sys, 'platform', 'linux'), \
                patch.object(https.os, 'geteuid', return_value=0), \
                patch.object(https.shutil, 'which', return_value=None), \
                patch.object(https, 'write_exclusive') as write, \
                patch.object(https, 'run') as run:
            with self.assertRaises(SystemExit):
                https.main()
            write.assert_not_called()
            run.assert_not_called()

    def test_program_resolution_uses_trusted_path(self):
        with patch.object(https.shutil, 'which', return_value='/usr/bin/true') as which:
            programs = https.resolve_programs()
        self.assertEqual(set(programs), {'systemctl', 'systemd-analyze', 'useradd', 'groupadd', 'ufw'})
        self.assertTrue(all(call.kwargs == {'path': https.SYSTEM_PATH} for call in which.call_args_list))
        self.assertTrue(all(Path(value).is_absolute() for value in programs.values()))

    def test_account_cannot_share_admin_group_or_another_user_identity(self):
        account = SimpleNamespace(pw_name=https.ACCOUNT, pw_uid=993, pw_gid=993,
                                  pw_shell='/usr/sbin/nologin', pw_dir='/nonexistent')
        group = SimpleNamespace(gr_name=https.ACCOUNT, gr_gid=993, gr_mem=[])
        https.check_account(account, group, [group], [account])
        admin_alias = SimpleNamespace(gr_name='sudo', gr_gid=993, gr_mem=[])
        identity_alias = SimpleNamespace(pw_name='denver', pw_uid=993)
        for groups, users in (([group, admin_alias], [account]), ([group], [account, identity_alias])):
            with self.assertRaises(ValueError):
                https.check_account(account, group, groups, users)

    def test_ufw_inactive_is_never_enabled(self):
        with patch.object(https, 'run', return_value=SimpleNamespace(stdout='Status: inactive\n')) as run:
            state, snapshot, ports = https.inspect_firewall('/usr/sbin/ufw')
            https.configure_firewall('/usr/sbin/ufw', snapshot, ports)
        self.assertEqual(state, 'inactive')
        self.assertEqual(run.call_count, 1)
        self.assertNotIn('enable', run.call_args.args[0])

    def test_ufw_adds_only_missing_tcp_web_ports(self):
        status = 'Status: active\n22/tcp ALLOW IN Anywhere\n80/tcp ALLOW IN Anywhere # existing\n'
        with patch.object(https, 'run', return_value=SimpleNamespace(stdout=status)):
            state, _, ports = https.inspect_firewall('/usr/sbin/ufw')
        self.assertEqual(state, 'active')
        self.assertEqual(ports, [443])
        self.assertFalse(https.public_rule_present('80/tcp ALLOW IN 192.0.2.1', 80))

    def test_unknown_firewall_output_rejected(self):
        with patch.object(https, 'run', return_value=SimpleNamespace(stdout='unexpected output')):
            with self.assertRaisesRegex(ValueError, 'Unrecognized'):
                https.inspect_firewall('/usr/sbin/ufw')

    def test_configuration_requires_public_acme_no_admin_no_http3(self):
        https.check_adapted(adapted())
        for mutate in (
                lambda config: config['admin'].update(disabled=False),
                lambda config: config['admin']['config'].update(persist=True),
                lambda config: config['apps']['http']['servers']['srv0'].update(protocols=['h1', 'h2', 'h3']),
                lambda config: config['apps']['tls']['automation']['policies'][0]['issuers'][0].update(module='internal')):
            configuration = adapted()
            mutate(configuration)
            with self.assertRaises(ValueError):
                https.check_adapted(configuration)

    def test_caddy_preflight_never_starts_server_or_requests_certificate(self):
        with patch.object(https, 'run', side_effect=[
            SimpleNamespace(stdout='v2.11.7'), SimpleNamespace(stdout=json.dumps(adapted())),
        ]) as run:
            https.check_caddy(Path('/private/caddy'), Path('/private/Caddyfile'))
        self.assertEqual([call.args[0][1] for call in run.call_args_list], ['version', 'adapt'])

    def test_failed_command_has_bounded_diagnostic(self):
        error = subprocess.CalledProcessError(1, ['/private/caddy', 'adapt'], stderr='x' * 5000 + '\nconfig error')
        with patch.object(https.subprocess, 'run', side_effect=error):
            with self.assertRaises(ValueError) as raised:
                https.run(['/private/caddy', 'adapt'])
        self.assertIn('config error', str(raised.exception))
        self.assertLess(len(str(raised.exception)), 1300)


if __name__ == '__main__':
    unittest.main()
