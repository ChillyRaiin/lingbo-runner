"""从 Apple 健康 XML/ZIP 提取跑步摘要；流式读取，不输出其他健康记录或 GPS。"""
import argparse
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone, date
import hashlib
import json
import math
from pathlib import Path, PurePosixPath
import xml.etree.ElementTree as ET
from zipfile import ZipFile

MAX_XML_BYTES = 2 * 1024 * 1024 * 1024
ZONE = timezone(timedelta(hours=8))


class CheckedStream:
    def __init__(self, stream):
        self.stream, self.total, self.tail = stream, 0, b''

    def read(self, size=-1):
        raw = self.stream.read(size)
        self.total += len(raw)
        if self.total > MAX_XML_BYTES:
            raise ValueError('健康导出 XML 超过 2GB，请减少历史记录或分批导出')
        probe = (self.tail + raw).upper()
        # Apple 的合法导出包含内部 DTD；仅允许声明元素，不允许自定义实体。
        if b'<!ENTITY' in probe or b'\x00' in raw:
            raise ValueError('不接受实体声明或非 UTF-8 XML')
        self.tail = probe[-32:]
        return raw


@contextmanager
def open_health_export(path):
    source = Path(path)
    if source.suffix.lower() == '.zip':
        with ZipFile(source) as archive:
            matches = [info for info in archive.infolist() if PurePosixPath(info.filename).name == 'export.xml' and '..' not in PurePosixPath(info.filename).parts and not info.is_dir()]
            if len(matches) != 1:
                raise ValueError('ZIP 中需有且只有一份 export.xml')
            if matches[0].file_size > MAX_XML_BYTES or matches[0].flag_bits & 1:
                raise ValueError('XML 超过 2GB 或 ZIP 已加密')
            with archive.open(matches[0]) as stream:
                yield CheckedStream(stream)
    else:
        if source.stat().st_size > MAX_XML_BYTES:
            raise ValueError('XML 超过 2GB')
        with source.open('rb') as stream:
            yield CheckedStream(stream)


def number(value):
    result = float(value)
    if not math.isfinite(result) or result < 0:
        raise ValueError('数量必须是非负有限值')
    return result


def distance_km(value, unit):
    factors = {'km': 1, 'm': 0.001, 'mi': 1.609344, 'mile': 1.609344, 'ft': 0.0003048}
    if unit not in factors:
        raise ValueError('不支持的距离单位：' + str(unit))
    return number(value) * factors[unit]


def duration_seconds(value, unit):
    factors = {'min': 60, 's': 1, 'sec': 1, 'hr': 3600, 'h': 3600}
    if unit not in factors:
        raise ValueError('不支持的时长单位：' + str(unit))
    return number(value) * factors[unit]


def parse_workout(workout):
    start = datetime.fromisoformat(workout.attrib['startDate'].replace('Z', '+00:00'))
    if start.tzinfo is None:
        raise ValueError('开始时间缺少时区')
    duration = duration_seconds(workout.attrib['duration'], workout.attrib.get('durationUnit', ''))
    distance, heart = None, None
    if workout.attrib.get('totalDistance') is not None:
        distance = distance_km(workout.attrib['totalDistance'], workout.attrib.get('totalDistanceUnit'))
    for stats in workout.findall('./WorkoutStatistics'):
        if stats.get('type') == 'HKQuantityTypeIdentifierDistanceWalkingRunning' and distance is None and stats.get('sum'):
            distance = distance_km(stats.get('sum'), stats.get('unit'))
        if stats.get('type') == 'HKQuantityTypeIdentifierHeartRate' and stats.get('average') and stats.get('unit') in ('count/min', 'bpm'):
            value = number(stats.get('average'))
            if 30 <= value <= 240:
                heart = round(value)
    if distance is None or distance <= 0 or duration <= 0:
        raise ValueError('缺少有效跑步距离或计时时长，不从零散健康记录猜测')
    # 同样摘要重复导入保持稳定 ID；不使用含真实姓名的 sourceName/device 标识。
    identity = 'apple-health:running:' + start.astimezone(timezone.utc).isoformat() + ':' + str(round(duration, 3)) + ':' + str(round(distance, 6))
    record = {'externalId': hashlib.sha256(identity.encode()).hexdigest()[:32], 'sport': 'running', 'date': start.astimezone(ZONE).date().isoformat(), 'distanceKm': round(distance, 6), 'durationSec': round(duration, 3), 'rpe': None, 'isRace': False}
    if heart is not None:
        record['avgHr'] = heart
    return record


def parse_apple_health(path, since=None, until=None):
    records, warnings, skipped = [], [], 0
    with open_health_export(path) as stream:
        stack, workout_depth = [], None
        for event, element in ET.iterparse(stream, events=('start', 'end')):
            if event == 'start':
                stack.append(element)
                if element.tag == 'Workout':
                    workout_depth = len(stack)
                continue
            if element.tag == 'Workout':
                if element.get('workoutActivityType') == 'HKWorkoutActivityTypeRunning':
                    try:
                        value = parse_workout(element)
                        if (since is None or value['date'] >= since) and (until is None or value['date'] <= until):
                            records.append(value)
                    except (ValueError, KeyError) as error:
                        skipped += 1
                        if len(warnings) < 20:
                            warnings.append(str(error))
                workout_depth = None
            # 保留 Workout 的统计子节点至其结束；其余健康记录立即释放。
            if workout_depth is None:
                element.clear()
                if len(stack) > 1:
                    stack[-2].remove(element)
            stack.pop()
    unique = {record['externalId']: record for record in records}
    return list(unique.values()), {'importableRuns': len(unique), 'duplicateSummaries': len(records) - len(unique), 'skippedRuns': skipped, 'warnings': warnings, 'note': '只导出跑步摘要；没有输出姓名、GPS、诊疗、体重或其他健康记录。时长采用运动记录中的计时时长，不根据开始/结束时间补成移动时长。'}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('export_file', help='export.xml 或 Apple 健康导出 ZIP')
    parser.add_argument('--output', required=True)
    parser.add_argument('--since', help='只导入此日期以后的跑步，YYYY-MM-DD')
    parser.add_argument('--until', help='只导入此日期及以前的跑步，YYYY-MM-DD')
    args = parser.parse_args()
    for value in (args.since, args.until):
        if value and date.fromisoformat(value).isoformat() != value:
            raise ValueError('日期需为 YYYY-MM-DD')
    records, report = parse_apple_health(args.export_file, args.since, args.until)
    if not records:
        raise ValueError('未找到可导入的跑步摘要；请核对导出文件、日期和报告')
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    batches = [records[start:start + 100] for start in range(0, len(records), 100)]
    for index, batch in enumerate(batches, 1):
        target = output if len(batches) == 1 else output.with_name(output.stem + f'-{index:03d}' + output.suffix)
        target.write_text(json.dumps({'schemaVersion': 1, 'provider': 'apple-health', 'activities': batch}, ensure_ascii=False, indent=2), encoding='utf-8')
    output.with_name(output.stem + '-report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    print(f'已转换 {len(records)} 条跑步，{len(batches)} 个导入文件；跳过 {report["skippedRuns"]} 条摘要不完整的跑步。请导入后补充 RPE 和比赛标记。')


if __name__ == '__main__':
    main()
