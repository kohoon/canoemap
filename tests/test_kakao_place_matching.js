const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'workers', 'auth-worker.js'), 'utf8');
const start = source.indexOf('function _kakaoPlaceName');
const end = source.indexOf('export default');
assert(start >= 0 && end > start, 'Kakao matching functions not found');
const matchKakaoPlace = new Function(source.slice(start, end) + '; return _matchKakaoPlace;')();

function response(documents) {
  return { ok: true, json: async () => ({ documents }) };
}

const exactLodging = {
  id: '18982960',
  place_name: '비수구미민박',
  category_name: '여행 > 숙박 > 민박',
  category_group_code: 'AD5',
  distance: '34',
  place_url: 'http://place.map.kakao.com/18982960',
};

(async () => {
  const realFetch = global.fetch;
  try {
    global.fetch = async () => response([exactLodging]);
    const matched = await matchKakaoPlace({ KAKAO_REST_KEY: 'test' }, '비수구미민박', 38.183258, 127.847498);
    assert(matched, 'an exact nearby Kakao place should match even when its category is lodging');
    assert.strictEqual(matched.kakaoPlaceId, '18982960');
    assert.strictEqual(matched.kakaoUrl, 'https://place.map.kakao.com/18982960');

    global.fetch = async () => response([{ ...exactLodging, distance: '251' }]);
    assert.strictEqual(
      await matchKakaoPlace({ KAKAO_REST_KEY: 'test' }, '비수구미민박', 38.183258, 127.847498),
      null,
      'a non-food place beyond 250m must not match',
    );

    global.fetch = async () => response([{ ...exactLodging, place_name: '비수구미민박펜션', distance: '20' }]);
    assert.strictEqual(
      await matchKakaoPlace({ KAKAO_REST_KEY: 'test' }, '비수구미민박', 38.183258, 127.847498),
      null,
      'a fuzzy non-food place must not match even when nearby',
    );

    global.fetch = async () => response([{
      ...exactLodging,
      id: '42',
      place_name: '비수구미 민박식당',
      category_name: '음식점 > 한식',
      category_group_code: 'FD6',
      distance: '120',
      place_url: 'http://place.map.kakao.com/42',
    }]);
    const food = await matchKakaoPlace({ KAKAO_REST_KEY: 'test' }, '비수구미민박', 38.183258, 127.847498);
    assert(food, 'the existing fuzzy food-place matching must remain available');
  } finally {
    global.fetch = realFetch;
  }
  console.log('Kakao place matching regression: ok');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
