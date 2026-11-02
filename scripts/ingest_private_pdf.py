"""把用户自有材料建立为私有页级索引，默认不进入公开知识问答。"""
import argparse
import hashlib
import json
from pathlib import Path
from pypdf import PdfReader


def pages(spec, count):
    if not spec:
        return range(1, count + 1)
    values = set()
    for part in spec.split(','):
        bounds = part.split('-')
        values.update(range(int(bounds[0]), int(bounds[-1]) + 1))
    if any(page < 1 or page > count for page in values):
        raise ValueError('页序号超出 PDF 范围')
    return sorted(values)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('pdf')
    parser.add_argument('--source-id', default='daniels-3-cn')
    parser.add_argument('--pages', default='')
    args = parser.parse_args()
    if not args.source_id or any(c not in 'abcdefghijklmnopqrstuvwxyz0123456789-_' for c in args.source_id):
        raise ValueError('source-id 只允许小写英数字、连字符和下划线')
    source = Path(args.pdf)
    reader = PdfReader(source)
    output_dir = Path(__file__).resolve().parents[1] / '.private' / 'knowledge'
    output_dir.mkdir(parents=True, exist_ok=True)
    output = output_dir / (args.source_id + '.jsonl')
    fingerprint = hashlib.sha256(source.read_bytes()).hexdigest()
    weak_pages, selected, chunks = [], list(pages(args.pages, len(reader.pages))), 0
    with output.open('w', encoding='utf-8') as handle:
        for page in selected:
            content = (reader.pages[page - 1].extract_text() or '').strip()
            if len(content) < 80:
                weak_pages.append(page)
            # 表格/图片不会因为有少量文本就被当作已读；后续人工/OCR 核对。
            for start in range(0, len(content), 700):
                chunk = {'sourceId': args.source_id, 'documentSha256': fingerprint, 'pdfPage': page, 'chunkId': f'{args.source_id}-p{page}-{start}', 'text': content[start:start + 800], 'visibility': 'private', 'reviewStatus': 'extracted-not-reviewed', 'trustedInstruction': False}
                handle.write(json.dumps(chunk, ensure_ascii=False) + '\n')
                chunks += 1
    report = {'sourceId': args.source_id, 'pageCount': len(reader.pages), 'selectedPages': selected, 'chunks': chunks, 'weakTextPages': weak_pages, 'note': '提取不等于核对；所有图片和表格另需人工/OCR校验。未连接公开检索。'}
    (output_dir / (args.source_id + '-report.json')).write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps(report, ensure_ascii=False))


if __name__ == '__main__':
    main()
