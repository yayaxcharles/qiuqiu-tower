from __future__ import annotations

import unittest
import tempfile
from pathlib import Path

import check_size


class CheckSizeClassificationTest(unittest.TestCase):
    def test_only_main_entry_module_graph_counts_as_startup_javascript(self) -> None:
        with tempfile.TemporaryDirectory() as raw:
            dist = Path(raw)
            assets = dist / 'assets'
            assets.mkdir()
            for name in ('main-HASH.js', 'shared-HASH.js', 'preview-HASH.js'):
                (assets / name).write_text('', encoding='utf-8')
            (dist / 'index.html').write_text(
                '<script type="module" src="/game/assets/main-HASH.js"></script>'
                '<link rel="modulepreload" href="/game/assets/shared-HASH.js">',
                encoding='utf-8',
            )
            self.assertEqual(
                check_size.load_initial_js(dist),
                {'assets/main-HASH.js', 'assets/shared-HASH.js'},
            )

    def test_motion_images_are_reported_outside_startup_budgets(self) -> None:
        self.assertEqual(
            check_size.classify_built_asset(
                Path('dist/assets/motion/qiuqiu/idle.webp'),
                'assets/motion/qiuqiu/idle.webp',
                set(),
            ),
            'motion',
        )
        self.assertEqual(
            check_size.classify_built_asset(
                Path('dist/assets/bg/title.webp'),
                'assets/bg/title.webp',
                set(),
            ),
            'img',
        )

    def test_existing_deferred_images_keep_their_category(self) -> None:
        original = 'assets/monsters/rat.webp'
        self.assertEqual(
            check_size.classify_built_asset(
                Path('dist/assets/monsters/rat-HASH.webp'),
                original,
                {original},
            ),
            'deferred',
        )

    def test_boss_phase_images_are_reported_as_encounter_warmup(self) -> None:
        phase = 'assets/monsters/nekomata_p2_idle.webp'
        self.assertEqual(
            check_size.classify_built_asset(
                Path('dist/assets/monsters/nekomata_p2_idle-HASH.webp'),
                phase,
                set(),
                encounter_art={phase},
            ),
            'encounter',
        )

    def test_result_images_excluded_by_preload_are_reported_on_demand(self) -> None:
        result = 'assets/bg/event_catnip_field_r1.webp'
        self.assertEqual(
            check_size.classify_built_asset(
                Path('dist/assets/bg/event_catnip_field_r1-HASH.webp'),
                result,
                set(),
                {result},
            ),
            'result',
        )
        normal = 'assets/bg/event_catnip_field.webp'
        self.assertEqual(
            check_size.classify_built_asset(
                Path('dist/assets/bg/event_catnip_field-HASH.webp'),
                normal,
                set(),
                {result},
            ),
            'img',
        )

    def test_unreferenced_public_work_files_are_not_counted_as_startup(self) -> None:
        work_file = 'assets/bg/fengfeng_scene_fallback.webp'
        normal = 'assets/bg/event_toll.webp'
        manifest_art = {normal}
        self.assertEqual(
            check_size.classify_built_asset(
                Path('dist/assets/bg/fengfeng_scene_fallback-HASH.webp'),
                work_file,
                set(),
                set(),
                manifest_art,
            ),
            'unreferenced',
        )
        self.assertEqual(
            check_size.classify_built_asset(
                Path('dist/assets/bg/event_toll-HASH.webp'),
                normal,
                set(),
                set(),
                manifest_art,
            ),
            'img',
        )


if __name__ == '__main__':
    unittest.main()
