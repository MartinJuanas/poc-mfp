"""Audit Git blobs without displaying secret values. Default: staged content."""
import argparse
import json
import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def git(*args):
    return subprocess.check_output(['git', *args], cwd=ROOT)


def private_values():
    values = []
    for folder in [ROOT, ROOT / 'backend', ROOT / 'frontend']:
        for path in folder.glob('.env*'):
            if not path.is_file() or path.name == '.env.example':
                continue
            for line in path.read_text(encoding='utf-8-sig').splitlines():
                match = re.match(r'(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)', line.strip())
                if not match or not re.search(r'KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL', match[1], re.I):
                    continue
                value = match[2].strip().strip('"\'')
                if len(value) >= 8 and not re.search(r'tu_api|placeholder|change.?me|example|your_', value, re.I):
                    values.append(value.encode())
    return values


RULES = {
    'Google API key': rb'AIza[0-9A-Za-z_-]{30,}',
    'LLM access key': rb'\bsk-(?:proj-|ant-)?[A-Za-z0-9_-]{20,}',
    'GitHub token': rb'\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{30,})',
    'AWS access key': rb'\b(?:AKIA|ASIA)[A-Z0-9]{16}\b',
    'private key': rb'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----',
    'personal absolute path': rb'(?:[A-Z]:[\\/]+Users[\\/]+|/Users/|/home/)[A-Za-z][A-Za-z0-9_.-]+',
    'URL with credentials': rb'(?:mongodb(?:\+srv)?|https?|redis)://[^\s/:@]+:[^\s/@]+@',
    'literal secret': rb'(?i)(?:api[_-]?key|password|secret|access[_-]?token)\s*[:=]\s*["\'][A-Za-z0-9_./+=-]{16,}["\']',
}
PRIVATE_DIRS = {'.local-backups', '.aws', '.ssh', '.codex', '.agents', '.docker', 'node_modules', 'dist', 'data', 'uploads', 'temp', 'volumes', 'mongodb_data', 'redis_data', 'bulk_data', 'backups', 'backup', 'dumps', 'dump', '.cache', '__pycache__'}
PRIVATE_SUFFIXES = {'.zip', '.7z', '.tar', '.gz', '.bson', '.wt', '.rdb', '.aof', '.dump', '.db', '.sqlite', '.sqlite3', '.pem', '.key', '.p12', '.pfx', '.log', '.bak'}


def audit(tree=None):
    paths = git('ls-tree', '-r', '--name-only', '-z', tree) if tree else git('ls-files', '-z')
    values = private_values()
    findings = []
    checked = 0
    for raw in paths.split(b'\0'):
        if not raw:
            continue
        path = raw.decode('utf-8')
        p = Path(path)
        checked += 1
        if (set(p.parts) & PRIVATE_DIRS or p.suffix.lower() in PRIVATE_SUFFIXES
                or (p.name.startswith('.env') and p.name != '.env.example')
                or (p.suffix.lower() == '.pdf' and not path.startswith('backend/src/tests/fixtures/'))
                or path.startswith(('docs/screenshots/', 'img/'))):
            findings.append({'path': path, 'rule': 'private or generated file tracked'})
        content = git('show', f'{tree}:{path}' if tree else f':{path}')
        for name, pattern in RULES.items():
            for match in re.finditer(pattern, content):
                findings.append({'path': path, 'line': content[:match.start()].count(b'\n') + 1, 'rule': name})
        if any(value in content for value in values):
            findings.append({'path': path, 'rule': 'matches a private environment credential'})
        if p.name == '.env.example':
            for line in content.decode('utf-8-sig').splitlines():
                match = re.match(r'([A-Z_][A-Z0-9_]*)\s*=\s*(.*)', line)
                if match and re.search(r'KEY|TOKEN|SECRET|PASSWORD', match[1]) and match[2].strip():
                    findings.append({'path': path, 'rule': 'credential template must have empty secret values'})
    print(json.dumps({'checked_files': checked, 'findings': findings}, ensure_ascii=False, indent=2))
    return bool(findings)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--tree', help='Audit a commit instead of the staged index, e.g. HEAD')
    args = parser.parse_args()
    raise SystemExit(audit(args.tree))
