"""只读生成 SQLite 一致性备份；备份保存在项目 .private，不进入交付包。"""
import argparse
from datetime import datetime
from pathlib import Path
import sqlite3
ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--source', default=str(ROOT / 'data/runner.sqlite'))
parser.add_argument('--output', default=str(ROOT / '.private/backups' / ('runner-' + datetime.now().strftime('%Y%m%d-%H%M%S') + '.sqlite')))
args = parser.parse_args()
source, target = Path(args.source).resolve(), Path(args.output).resolve()
if not source.is_file():
    raise SystemExit('没有可备份的运行数据库')
if not target.is_relative_to(ROOT / '.private') or target.exists():
    raise SystemExit('备份必须位于项目.private目录，且不能覆盖已有文件')
target.parent.mkdir(parents=True, exist_ok=True)
with sqlite3.connect(source.as_uri() + '?mode=ro', uri=True) as original:
    with sqlite3.connect(target) as snapshot:
        original.backup(snapshot)
        if snapshot.execute('PRAGMA integrity_check').fetchone()[0] != 'ok':
            raise SystemExit('备份完整性检查失败')
print('备份完成：' + str(target))
