#!/usr/bin/env python3
"""Structural + self-check tests for the prefab compiler, against the
PassiveSkillControl (Symbol 769) fixture -- the real symbol used by target
C2 (SkillTreeScene passive panel). Verifies the compiler reproduces the
positions already hand-verified in tasks/skilltree-report.md §1.2 (pskill1..5
at x≈122-124, y=144.95/221.95/304.95/381.95/460.95) and that the self-check /
flatten-sprite / bounds-math primitives behave as documented.

Run: python3 -m unittest discover -s tools/prefab-compiler/tests
"""
import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from compiler import (  # noqa: E402
    SwfIndex, compile_symbol, union, xform, mat_dict,
)

FIXTURES = os.path.join(os.path.dirname(__file__), 'fixtures')


class PassiveSkillControlStructureTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.idx = SwfIndex(os.path.join(FIXTURES, 'passiveskill.xml'))

    def test_resolves_by_class_name(self):
        self.assertEqual(self.idx.resolve('export.shop.PassiveSkillControl'), 769)

    def test_five_pskill_slots_at_known_positions(self):
        result = compile_symbol(self.idx, 769)
        children = result['root']['children']
        # bg (shape 758) + 5 pskill slots (sprite 768), per skilltree-report §1.2.
        self.assertEqual(len(children), 6)
        bg, *slots = children
        self.assertEqual(bg['type'], 'image')
        self.assertEqual(bg['characterId'], 758)
        self.assertEqual(len(slots), 5)
        expected_y = [144.95, 221.95, 304.95, 381.95, 460.95]
        for slot, ey in zip(slots, expected_y):
            self.assertEqual(slot['characterId'], 768)
            self.assertAlmostEqual(slot['matrix']['ty'], ey, places=2)
            self.assertIn(round(slot['matrix']['tx']), (122, 124))

    def test_flatten_sprite_emits_per_frame_textures_no_recursion(self):
        result = compile_symbol(self.idx, 769, flatten_sprites=[768])
        slots = result['root']['children'][1:]
        for slot in slots:
            self.assertEqual(slot['type'], 'image')
            self.assertEqual(slot['symbolKind'], 'sprite-flattened')
            self.assertEqual(slot['frameCount'], 6)
            self.assertEqual(len(slot['frames']), 6)
            self.assertNotIn('children', slot)

    def test_missing_images_dir_produces_warnings_not_fabricated_textures(self):
        result = compile_symbol(self.idx, 769, images_dir=os.path.join(FIXTURES, 'nonexistent'))
        self.assertGreater(len(result['warnings']), 0)
        bg = result['root']['children'][0]
        self.assertTrue(bg.get('textureMissing'))
        self.assertNotIn('textureFile', bg)

    def test_self_check_flags_mismatched_png_size(self):
        # Real 758.png is 746x429 (verified against FFDec's own `-export
        # shape` output) -- point the compiler at a directory holding a
        # deliberately wrong-sized PNG under that name and confirm the
        # tolerance check actually fires instead of silently passing.
        import tempfile
        from PIL import Image
        with tempfile.TemporaryDirectory() as d:
            Image.new('RGBA', (10, 10)).save(os.path.join(d, '758.png'))
            result = compile_symbol(self.idx, 769, images_dir=d)
            self.assertTrue(any('exceeds' in w and '758' in w for w in result['warnings']),
                             result['warnings'])


class BoundsMathTest(unittest.TestCase):
    def test_union_identity(self):
        self.assertEqual(union(None, (1, 2, 3, 4)), (1, 2, 3, 4))
        self.assertEqual(union((1, 2, 3, 4), None), (1, 2, 3, 4))
        self.assertEqual(union((0, 0, 10, 10), (5, 5, 20, 20)), (0, 0, 20, 20))

    def test_xform_translation_only(self):
        b = (0, 0, 100, 50)
        m = (1.0, 0.0, 0.0, 1.0, 200.0, 300.0)  # twips
        self.assertEqual(xform(b, m), (200.0, 300.0, 300.0, 350.0))

    def test_xform_scale(self):
        b = (0, 0, 100, 50)
        m = (2.0, 0.0, 0.0, 0.5, 0.0, 0.0)
        self.assertEqual(xform(b, m), (0.0, 0.0, 200.0, 25.0))

    def test_mat_dict_converts_twips_translate_only(self):
        m = (1.0, 0.0, 0.0, 1.0, 20.0, 40.0)
        d = mat_dict(m)
        self.assertEqual(d['tx'], 1.0)
        self.assertEqual(d['ty'], 2.0)
        self.assertEqual(d['scaleX'], 1.0)


if __name__ == '__main__':
    unittest.main()
