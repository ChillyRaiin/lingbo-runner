import sys
import unittest
import tempfile
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
from tcx_to_json import parse_tcx


class TcxTests(unittest.TestCase):
    def test_units_timezone_heart_and_missing_rpe(self):
        value = parse_tcx(Path(__file__).resolve().parents[1] / 'examples' / 'synthetic-run.tcx', 'coros')[0]
        self.assertEqual(value['date'], '2026-10-02')
        self.assertEqual(value['distanceKm'], 5)
        self.assertEqual(value['durationSec'], 1500)
        self.assertEqual(value['avgHr'], 154)
        self.assertIsNone(value['rpe'])
        self.assertFalse(value['isRace'])

    def test_reject_entities(self):
        temporary_root = Path(__file__).resolve().parents[1] / '.private/qa'
        temporary_root.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory(dir=temporary_root) as directory:
            path = Path(directory) / 'bad.tcx'
            path.write_text('<!DOCTYPE x [<!ENTITY y "bad">]><x/>', encoding='utf-8')
            with self.assertRaises(ValueError):
                parse_tcx(path, 'tcx')


if __name__ == '__main__':
    unittest.main()
