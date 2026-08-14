/**
 * East Africa Time (Africa/Kampala) display helpers
 * Date: 14 Aug 2026 | Time: 24-hour 10:28
 */
const TZ = 'Africa/Kampala';
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function toDate(val) {
  if (val == null || val === '') return null;
  if (val instanceof Date) return isNaN(val.getTime()) ? null : val;
  const s = String(val).trim();
  // Date-only: treat as calendar date in EAT (avoid UTC midnight shift)
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const d = new Date(s + 'T12:00:00+03:00');
    return isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

/** Parts in EAT via Intl */
function parts(d) {
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ,
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });
  const map = {};
  fmt.formatToParts(d).forEach(function (p) {
    map[p.type] = p.value;
  });
  return map;
}

/** 14 Aug 2026 */
export function formatDate(val) {
  const d = toDate(val);
  if (!d) return val == null || val === '' ? '—' : String(val).slice(0, 10);
  const p = parts(d);
  // en-GB short month may be "Aug"; day may have leading zero strip
  const day = String(parseInt(p.day, 10));
  return day + ' ' + p.month + ' ' + p.year;
}

/** 14 Aug 2026 10:28 */
export function formatDateTime(val) {
  const d = toDate(val);
  if (!d) return val == null || val === '' ? '—' : String(val);
  const p = parts(d);
  const day = String(parseInt(p.day, 10));
  const hour = p.hour; // already 2-digit 24h from hour12:false
  const minute = p.minute;
  return day + ' ' + p.month + ' ' + p.year + ' ' + hour + ':' + minute;
}

/** YYYY-MM-DD in EAT for <input type="date"> defaults */
export function todayEAT() {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  // en-CA gives YYYY-MM-DD
  return fmt.format(new Date());
}

export default { formatDate, formatDateTime, todayEAT };
