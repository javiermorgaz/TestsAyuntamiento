#!/usr/bin/env python3
"""Keep deployment addresses and credentials out of public documentation."""

from pathlib import Path
import re
import sys


ROOT = Path(__file__).resolve().parents[1]
PATTERNS = {
    "dirección absoluta": re.compile(r"(?:https?|ssh|postgres(?:ql)?)://", re.I),
    "dirección IP": re.compile(r"(?<![\d.])(?:\d{1,3}\.){3}\d{1,3}(?![\d.])"),
    "clave privada": re.compile(r"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----"),
    "credencial": re.compile(
        r"(?:gh[pousr]_|github_pat_|sb_secret_)[A-Za-z0-9_-]{20,}"
        r"|eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}"
        r"|(?:api[_-]?key|token|password|secret)\s*[:=]\s*[\"']?[A-Za-z0-9/_+=.-]{20,}",
        re.I,
    ),
}


def violations(content):
    for line_number, line in enumerate(content.splitlines(), 1):
        for label, pattern in PATTERNS.items():
            if pattern.search(line):
                yield line_number, label


def main():
    documents = sorted({*ROOT.glob("*.md"), *(ROOT / "docs").rglob("*.md")})
    failed = False
    for document in documents:
        for line_number, label in violations(document.read_text(encoding="utf-8")):
            # Never print a matching value: a future violation may be a real secret.
            print(f"{document.relative_to(ROOT)}:{line_number}: {label}", file=sys.stderr)
            failed = True
    if failed:
        return 1
    print(f"Documentación pública verificada: {len(documents)} archivos.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
