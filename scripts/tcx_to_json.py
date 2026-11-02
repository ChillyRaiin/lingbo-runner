"""TCX -> 循跑 v1 跑步摘要。仅使用 Python 标准库，不输出 GPS 坐标。"""
import argparse
import hashlib
import json
import math
from datetime import datetime, timezone, timedelta
from pathlib import Path
import xml.etree.ElementTree as ET


def parse_tcx(path, provider):
    source = Path(path)
    if source.stat().st_size > 10 * 1024 * 1024:
        raise ValueError('TCX 文件超过 10MB，请拆分')
    raw = source.read_bytes()
    if b'<!DOCTYPE' in raw.upper() or b'<!ENTITY' in raw.upper():
        raise ValueError('不接受含 DTD 或实体声明的 XML')
    root = ET.fromstring(raw)
    values = []
    for activity in root.findall('.//{*}Activity'):
        if activity.get('Sport', '').lower() != 'running':
            continue
        start = activity.findtext('{*}Id')
        if not start:
            raise ValueError('跑步活动缺少 Id/开始时间')
        timestamp = datetime.fromisoformat(start.replace('Z', '+00:00'))
        if timestamp.tzinfo is None:
            raise ValueError('开始时间缺少时区，不能推断日期')
        laps = activity.findall('{*}Lap')
        duration, distance, heart_sum, heart_weight = 0.0, 0.0, 0.0, 0.0
        for lap in laps:
            seconds = float(lap.findtext('{*}TotalTimeSeconds', '0'))
            meters = float(lap.findtext('{*}DistanceMeters', '0'))
            if not all(math.isfinite(x) and x >= 0 for x in (seconds, meters)):
                raise ValueError('圈时长或距离无效')
            duration += seconds
            distance += meters
            heart = lap.findtext('{*}AverageHeartRateBpm/{*}Value')
            if heart and seconds > 0:
                hr = float(heart)
                if not math.isfinite(hr) or not 30 <= hr <= 240:
                    raise ValueError('平均心率无效')
                heart_sum += hr * seconds
                heart_weight += seconds
        if duration <= 0 or distance <= 0:
            raise ValueError('TCX 缺少有效圈摘要。首版不从轨迹猜测跑步距离或移动时间')
        fingerprint = hashlib.sha256((provider + ':' + start + ':' + str(distance) + ':' + str(duration)).encode()).hexdigest()[:32]
        record = {
            'externalId': fingerprint,
            'sport': 'running',
            'date': timestamp.astimezone(timezone(timedelta(hours=8))).date().isoformat(),
            'distanceKm': round(distance / 1000, 6),
            'durationSec': round(duration, 3),
            'rpe': None,
            'isRace': False,
        }
        if heart_weight:
            record['avgHr'] = round(heart_sum / heart_weight)
        values.append(record)
    if not values:
        raise ValueError('文件中没有明确标为 Running 的活动；GPX 路线不能直接视为跑步')
    return values


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('files', nargs='+')
    parser.add_argument('--provider', choices=['garmin', 'coros', 'suunto', 'tcx', 'file'], default='tcx')
    parser.add_argument('--output', required=True)
    args = parser.parse_args()
    values = [value for file in args.files for value in parse_tcx(file, args.provider)]
    if len(values) > 100:
        raise ValueError('一次导入最多 100 条，请拆分输出')
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps({'schemaVersion': 1, 'provider': args.provider, 'activities': values}, ensure_ascii=False, indent=2), encoding='utf-8')
    print(f'已转换 {len(values)} 条跑步摘要至 {output}；请在小程序补充 RPE 与比赛标记。')


if __name__ == '__main__':
    main()
