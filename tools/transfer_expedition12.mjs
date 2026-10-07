// One-off, guarded production KV migration. Run only through the manual workflow.
const mode = process.env.TRANSFER_MODE;
const expectedId = String(process.env.EXPECTED_COURSE_ID || '').replace(/^k/, '');
const token = process.env.CLOUDFLARE_API_TOKEN;
const account = process.env.CLOUDFLARE_ACCOUNT_ID;
const namespace = 'fa39499b8c8346408f24fd07a323d9e0';
if (!['inspect', 'apply'].includes(mode) || !token || !account) throw new Error('Missing mode or Cloudflare credentials');
if (mode === 'apply' && !/^\d{13}$/.test(expectedId)) throw new Error('Apply requires an exact 13-digit course ID');

const base = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(account)}/storage/kv/namespaces/${namespace}/values/`;
const keyUrl = (key) => base + encodeURIComponent(key);
const headers = { Authorization: `Bearer ${token}` };
async function read(key) {
  const response = await fetch(keyUrl(key), { headers });
  if (!response.ok) throw new Error(`KV read ${key}: HTTP ${response.status}`);
  return response.text();
}
async function write(key, value) {
  const response = await fetch(keyUrl(key), { method: 'PUT', headers: { ...headers, 'Content-Type': 'application/octet-stream' }, body: value });
  if (!response.ok) throw new Error(`KV write ${key}: HTTP ${response.status}`);
  const result = await response.json();
  if (!result.success) throw new Error(`KV write ${key}: unsuccessful`);
}
const source = await read('courses');
const courses = JSON.parse(source);
if (!Array.isArray(courses)) throw new Error('Course storage is not an array');
const isExpedition12 = (course) => /^엑스페디션\s*#\s*12(?!\d)/.test(String(course?.name || ''));
const matches = courses.filter((course) => course && String(course.nick || '').trim() === '번버리' && isExpedition12(course));
if (mode === 'inspect') {
  console.log(JSON.stringify({ matches: matches.map((course) => ({ id: String(course.id), name: String(course.name), ownerKind: course.owner === 'admin' ? 'admin' : 'member' })) }));
} else {
  if (matches.length !== 1 || String(matches[0].id) !== expectedId) throw new Error('Exact nickname, title, and course ID did not resolve to one course');
  const course = matches[0];
  if (course.owner === 'admin') {
    console.log(JSON.stringify({ status: 'already-admin', id: expectedId }));
  } else {
    if (!course.owner || String(course.owner) === 'admin') throw new Error('Source owner is invalid');
    const backupKey = `course_transfer_backup_${Date.now()}_${expectedId}`;
    await write(backupKey, source);
    course.owner = 'admin';
    await write('courses', JSON.stringify(courses));
    let verified = false;
    for (let attempt = 0; attempt < 5; attempt++) {
      const current = JSON.parse(await read('courses'));
      const item = Array.isArray(current) ? current.find((candidate) => String(candidate?.id) === expectedId) : null;
      if (item?.owner === 'admin') { verified = true; break; }
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
    if (!verified) throw new Error(`Write accepted but verification is pending; backup ${backupKey}`);
    console.log(JSON.stringify({ status: 'transferred', id: expectedId, name: String(course.name), backupKey }));
  }
}
