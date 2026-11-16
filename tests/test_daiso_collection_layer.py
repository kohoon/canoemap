"""Offline regressions for official search scopes and snapshot safety checks."""

import contextlib
import copy
import importlib.util
import io
import json
import sys
import tempfile
import unittest
import urllib.error
import urllib.parse
from pathlib import Path
from unittest import mock


ROOT = Path(__file__).resolve().parents[1]


def load_tool(name):
    spec = importlib.util.spec_from_file_location(name, ROOT / "tools" / f"{name}.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


build = load_tool("build_daiso")
refresh = load_tool("refresh_stores")
DISTRICTS = ("광산구", "동구", "서구", "남구", "북구")


def store_html(name, number=0, address="전남광주통합특별시 광산구 테스트로 1", opening="20200101"):
    return (
        f'<div class="bx-store" data-lat="{35 + number / 10000}" '
        f'data-lng="126.8" data-opnday="{opening}" data-start="1000" data-end="2200">'
        f'<h4 class="place">{name}</h4><p class="addr">{address}</p>'
        '<em class="phone">T. 1522-4400</em><ul class="opts"><li><span>주차</span></li></ul></div>'
    )


class DaisoCollectionTests(unittest.TestCase):
    def test_moved_districts_normalize_without_rewriting_query_or_address(self):
        for district in DISTRICTS:
            for dong in ("", "테스트동"):
                address = f"전남광주통합특별시 {district} 테스트로 1"
                with self.subTest(district=district, dong=dong), mock.patch.object(
                    build, "read_url", return_value=store_html("테스트점", address=address)
                ) as read:
                    rows = build.fetch_stores("전남", district, dong)
                    query = urllib.parse.parse_qs(urllib.parse.urlsplit(read.call_args.args[0]).query,
                                                  keep_blank_values=True)
                    self.assertEqual(query, {"sido": ["전남"], "gugun": [district], "dong": [dong]})
                    self.assertEqual(rows[0]["region"], "광주")
                    self.assertEqual(rows[0]["address"], address)

    def test_unrelated_and_old_scopes_keep_their_regions(self):
        for region, district in (("전남", "목포시"), ("전남", "광양시"), ("전남", ""),
                                 ("경기", "광주시"), ("부산", "북구"), ("대구", "동구"),
                                 ("광주", "광산구")):
            with self.subTest(region=region, district=district), mock.patch.object(
                build, "read_url", return_value=store_html("광주라는 이름이 있는 점포")
            ):
                self.assertEqual(build.fetch_stores(region, district)[0]["region"], region)

    def collect_fixture(self, old_scope=False, district_error=False):
        calls = []
        stores = [store_html(f"광산점{i}", i) for i in range(12)]

        def read(url):
            parsed = urllib.parse.urlsplit(url)
            params = urllib.parse.parse_qs(parsed.query, keep_blank_values=True)
            region = params["sido"][0]
            district = params.get("gugun", [""])[0]
            dong = params.get("dong", [""])[0]
            endpoint = parsed.path.rsplit("/", 1)[1]
            calls.append((endpoint, region, district, dong))
            if endpoint == "sido_search":
                if region == "광주":
                    values = ["광산구"] if old_scope else []
                elif region == "전남":
                    values = [*DISTRICTS, "목포시"]
                elif region == "세종":
                    values = ["세종동"]
                else:
                    values = [f"{region}시"]
                return json.dumps([{"value": value} for value in values])
            if endpoint == "gugun_search":
                self.assertEqual((region, district), ("전남", "광산구"))
                return json.dumps([{"value": "첫동"}, {"value": "끝동"}])
            self.assertEqual(endpoint, "shop_search")
            if region == "광주":
                return stores[0].replace("전남광주통합특별시", "광주광역시")
            if region == "전남" and district == "광산구":
                if not dong:
                    if district_error:
                        raise urllib.error.HTTPError(url, 500, "fixture district error", {}, None)
                    return "".join(stores[:10])
                if dong == "첫동":
                    return "".join(stores[:7])
                return "".join(stores[6:]) + store_html("미래개점", 99, opening="20990101")
            if region == "전남" and district in DISTRICTS:
                return store_html(f"{district}점", 20 + DISTRICTS.index(district),
                                  f"전남광주통합특별시 {district} 테스트로 1")
            return store_html(f"{region}점", 100 + build.REGIONS.index(region), f"{region} 테스트로 1")

        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "stores.geojson"
            with mock.patch.object(build, "read_url", side_effect=read), \
                 mock.patch.object(build, "apply_coordinate_overrides", return_value=0), \
                 mock.patch.object(build.time, "sleep"), \
                 mock.patch.object(sys, "argv", ["build_daiso.py", "--as-of", "2026-11-09",
                                                  "--delay", "0", "--output", str(output)]), \
                 contextlib.redirect_stdout(io.StringIO()):
                build.main()
            return json.loads(output.read_text()), calls

    def assert_complete_collection(self, data):
        features = data["features"]
        self.assertEqual(data["metadata"]["count"], 32)
        self.assertEqual(len(features), 32)
        self.assertEqual({item["properties"]["region"] for item in features}, set(build.REGIONS))
        gwangju = [item for item in features if item["properties"]["region"] == "광주"]
        self.assertEqual(len(gwangju), 16)
        self.assertTrue(all(item["properties"]["address"].startswith("전남광주통합특별시")
                            for item in gwangju))
        self.assertEqual(len([item for item in features if item["properties"]["region"] == "전남"]), 1)
        self.assertNotIn("미래개점", {item["properties"]["name"] for item in features})
        previous = {"type": "FeatureCollection", "features": [
            {"properties": {"region": region}} for region in build.REGIONS
        ]}
        refresh.validate(data, previous)

    def test_empty_old_scope_and_capped_merged_scope_collect_all_stores(self):
        data, calls = self.collect_fixture()
        self.assert_complete_collection(data)
        self.assertIn(("gugun_search", "전남", "광산구", ""), calls)
        self.assertIn(("shop_search", "전남", "광산구", "끝동"), calls)
        self.assertIn(("shop_search", "세종", "", "세종동"), calls)

    def test_later_jeonnam_duplicate_does_not_erase_gwangju_region(self):
        data, _ = self.collect_fixture(old_scope=True)
        self.assert_complete_collection(data)
        matches = [item for item in data["features"] if item["properties"]["name"] == "광산점0"]
        self.assertEqual(len(matches), 1)
        self.assertEqual(matches[0]["properties"]["region"], "광주")

    def test_failed_district_still_expands_dong_scopes(self):
        data, calls = self.collect_fixture(district_error=True)
        self.assert_complete_collection(data)
        self.assertIn(("gugun_search", "전남", "광산구", ""), calls)

    def test_real_snapshot_region_and_count_guards_still_reject_losses(self):
        previous = json.loads((ROOT / "daiso_stores.geojson").read_text(encoding="utf-8"))
        refresh.validate(previous, previous)
        missing_region = copy.deepcopy(previous)
        for item in missing_region["features"]:
            if item["properties"]["region"] == "광주":
                item["properties"]["region"] = "전남"
        with self.assertRaisesRegex(ValueError, "Missing regions"):
            refresh.validate(missing_region, previous)
        truncated = copy.deepcopy(previous)
        truncated["features"] = truncated["features"][:int(len(previous["features"]) * .84)]
        truncated["metadata"]["count"] = len(truncated["features"])
        with self.assertRaisesRegex(ValueError, "Incomplete store collection"):
            refresh.validate(truncated, previous)

    def test_failed_second_dataset_leaves_both_snapshots_and_maps_untouched(self):
        data, _ = self.collect_fixture()
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            files = {root / f"{store}_stores.geojson": json.dumps(data).encode()
                     for store in refresh.STORES}
            files.update({root / filename: b'const DATAVER={daiso:"abc123",hanaro:"def456"};'
                          for filename in refresh.MAPS})
            for path, contents in files.items():
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_bytes(contents)

            def run(command, check):
                self.assertTrue(check)
                result = copy.deepcopy(data)
                if "build_hanaro.py" in command[2]:
                    result["features"] = []
                    result["metadata"]["count"] = 0
                Path(command[-1]).write_text(json.dumps(result))

            with mock.patch.object(refresh, "ROOT", root), \
                 mock.patch.object(refresh.subprocess, "run", side_effect=run), \
                 self.assertRaisesRegex(ValueError, "Incomplete store collection"):
                refresh.main()
            for path, contents in files.items():
                self.assertEqual(path.read_bytes(), contents)


if __name__ == "__main__":
    unittest.main()
