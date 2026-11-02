from pathlib import Path
import sys
import tempfile
import unittest
from zipfile import ZipFile
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
from apple_health_to_json import parse_apple_health, duration_seconds, distance_km, CheckedStream
from io import BytesIO


class AppleHealthTests(unittest.TestCase):
    def test_running_only_timezone_pause_and_stats(self):
        values, report = parse_apple_health(Path(__file__).resolve().parents[1] / 'examples/apple-health-synthetic.xml')
        self.assertEqual(len(values), 1)
        self.assertEqual(values[0]['date'], '2026-10-02')
        self.assertEqual(values[0]['durationSec'], 1500)  # 计时25分钟，不把35分钟含暂停的时间误用。
        self.assertEqual(values[0]['distanceKm'], 5)
        self.assertEqual(values[0]['avgHr'], 155)
        self.assertIsNone(values[0]['rpe'])
        self.assertFalse(values[0]['isRace'])
        self.assertNotIn('sourceName', values[0])

    def test_zip_read_without_extract_and_date_filter(self):
        example = Path(__file__).resolve().parents[1] / 'examples/apple-health-synthetic.xml'
        directory = Path(__file__).resolve().parents[1] / '.private/qa'
        directory.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory(dir=directory) as temporary:
            path = Path(temporary) / 'health.zip'
            with ZipFile(path, 'w') as archive:
                archive.write(example, 'apple_health_export/export.xml')
                archive.writestr('workout-routes/route.gpx', '<gpx/>')
            self.assertEqual(len(parse_apple_health(path)[0]), 1)
            self.assertEqual(len(parse_apple_health(path, since='2026-10-03')[0]), 0)
            self.assertFalse((Path(temporary) / 'apple_health_export').exists())

    def test_units_and_entities(self):
        self.assertEqual(duration_seconds('1', 'hr'), 3600)
        self.assertAlmostEqual(distance_km('1', 'mi'), 1.609344)
        with self.assertRaises(ValueError):
            duration_seconds('NaN', 's')
        with self.assertRaises(ValueError):
            CheckedStream(BytesIO(b'<!DOCTYPE x [<!ENTITY x "attack">]>')).read()


if __name__ == '__main__':
    unittest.main()
