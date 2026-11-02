"""打包框架，排除私有书籍索引、用户数据库、密钥和缓存。"""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
import os
root = Path(__file__).resolve().parents[1]
output = root.parent / 'lingbo-runner-framework.zip'
excluded_roots = {'.private', 'data', 'node_modules', '.git', '.venv', '.pytest_cache', 'DerivedData'}
with ZipFile(output, 'w', ZIP_DEFLATED) as archive:
    count = 0
    for current, directories, files in os.walk(root):
        directory = Path(current)
        # 在遍历时剪枝，避免扫描大量缓存、备份或虚拟环境后才逐文件排除。
        directories[:] = sorted(name for name in directories if not (directory == root and name in excluded_roots) and name not in {'__pycache__', 'node_modules', '.venv', 'DerivedData', '.git', '.private', '.pytest_cache'})
        for name in sorted(files):
            path = directory / name
            secret_env = name == '.env' or (name.startswith('.env.') and name != '.env.example')
            if secret_env or name in {'project.private.config.json', '.DS_Store'}:
                continue
            archive.write(path, str(Path(root.name) / path.relative_to(root)))
            count += 1
print(f'{output}: {count} 个公开工程文件；不含用户数据、私有索引与密钥。')
