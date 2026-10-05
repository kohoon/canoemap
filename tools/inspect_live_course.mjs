import { createHash } from 'node:crypto';

const account = process.env.CLOUDFLARE_ACCOUNT_ID;
const token = process.env.CLOUDFLARE_API_TOKEN;
const namespace = 'fa39499b8c8346408f24fd07a323d9e0';
if (!account || !token) throw new Error('Cloudflare credentials unavailable');

const url = `https://api.cloudflare.com/client/v4/accounts/${account}/storage/kv/namespaces/${namespace}/values/courses`;
const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
if (!response.ok) throw new Error(`KV read failed: HTTP ${response.status}`);
const raw = await response.text();
const courses = JSON.parse(raw);
if (!Array.isArray(courses)) throw new Error('Unexpected courses value');
const matches = courses.filter((course) => String(course?.name || '').includes('봉양운치길'));
const checksum = createHash('sha256').update(raw).digest('hex');
console.log(JSON.stringify({ checksum, count: matches.length, matches: matches.map((course) => ({
  id: course.id, name: course.name, owner: course.owner, km: course.km,
  coordinates: course.coords?.length || 0, start: course.coords?.[0], finish: course.coords?.at(-1),
  segments: course.segments,
})) }, null, 2));
