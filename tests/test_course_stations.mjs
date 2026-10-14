import assert from 'node:assert/strict';
import { rankCourseStations } from '../assets/course-stations.mjs';

const river = { type: 'Feature', properties: { name: '본류' }, geometry: { type: 'LineString',
  coordinates: [[127, 37], [127.1, 37]] } };
const tributary = { type: 'Feature', properties: { name: '지류' }, geometry: { type: 'LineString',
  coordinates: [[127.045, 37.002], [127.065, 37.002]] } };
const course = { coords: [[37, 127.02], [37, 127.05], [37, 127.08]], travelMode: 'downriver' };
const stations = [
  { cd: 'in', lat: 37, lng: 127.05 },
  { cd: 'upper', lat: 37, lng: 127.01 },
  { cd: 'lower', lat: 37, lng: 127.09 },
  { cd: 'side', lat: 37.002, lng: 127.055 },
  { cd: 'far', lat: 37, lng: 127.3 },
];
const result = rankCourseStations(course, stations, [river, tributary]);
assert.deepEqual(result.map(x => [x.station.cd, x.relation]), [
  ['in', '코스 내'], ['upper', '상류'], ['lower', '하류'],
]);
assert.ok(result.every(x => x.distanceKm >= 0 && x.distanceKm <= 12));
const roundtrip = rankCourseStations({ ...course, travelMode: 'roundtrip' }, stations, [river, tributary]);
assert.deepEqual(roundtrip.map(x => x.station.cd), ['in']);
assert.deepEqual(rankCourseStations(course, [{ cd: 'side', lat: 37.002, lng: 127.055 }], [tributary]), []);
console.log('course station matching passed');
