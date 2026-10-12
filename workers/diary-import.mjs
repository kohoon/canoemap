const FORMAT = 'canoemap-diary-backup';

function splitTourTrack(trip) {
  if (!Array.isArray(trip?.track)) return null;
  const breaks = new Set(Array.isArray(trip.breaks) ? trip.breaks.map(Number) : []);
  const lines = [];
  let line = [];
  trip.track.forEach((point, index) => {
    if (breaks.has(index) && line.length) { lines.push(line); line = []; }
    line.push(point);
  });
  if (line.length) lines.push(line);
  return lines;
}

export async function prepareDiaryBackup(backup, uid) {
  if (!backup || backup.format !== FORMAT || backup.version !== 1 || !backup.record || typeof backup.record !== 'object') return null;
  const record = backup.record;
  if (!/^[a-zA-Z0-9_-]{3,100}$/.test(String(record.id || ''))
    || !['manual', 'gpx', 'tour'].includes(record.source)
    || !Number.isSafeInteger(Number(record.createdAt)) || Number(record.createdAt) <= 0) return null;
  const source = record.source === 'tour' ? 'gpx' : record.source;
  if (record.source === 'tour' && String(backup.tripSnapshot?.id || '') !== String(record.tripId || '')) return null;
  const lines = record.source === 'tour' ? splitTourTrack(backup.tripSnapshot) : record.lines;
  if (source === 'gpx' && !Array.isArray(lines)) return null;
  const fingerprint = `${uid}\n${record.source}\n${record.id}\n${record.createdAt}`;
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(fingerprint));
  const id = /^a_[0-9a-f]{32}$/.test(String(record.archiveIdentity || ''))
    ? record.archiveIdentity
    : 'a_' + [...new Uint8Array(bytes)].slice(0, 16).map((byte) => byte.toString(16).padStart(2, '0')).join('');
  return {
    id,
    archiveSource: ['manual', 'gpx', 'tour'].includes(record.archiveSource) ? record.archiveSource : record.source,
    body: {
      source, title: record.title, date: record.date,
      launch: record.launch, landing: record.landing, notes: record.notes,
      companions: record.companions, userDistanceKm: source === 'manual' ? record.distanceKm : null,
      lines: source === 'gpx' ? lines : undefined,
    },
  };
}
