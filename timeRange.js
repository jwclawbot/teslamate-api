// ~/teslamate-api/timeRange.js

// LLM이 반환한 키를 실제 날짜로 변환
export function timeRangeFromKey(key) {
  const now = new Date();

  switch (key) {
    case 'today': {
      const start = new Date(now); start.setHours(0, 0, 0, 0);
      return { startDate: start, endDate: now, label: '오늘' };
    }
    case 'this_week': {
      const start = new Date(now);
      start.setDate(start.getDate() - start.getDay());
      start.setHours(0, 0, 0, 0);
      return { startDate: start, endDate: now, label: '이번 주' };
    }
    case 'last_week': {
      const end = new Date(now);
      end.setDate(end.getDate() - end.getDay() - 1);
      end.setHours(23, 59, 59, 999);
      const start = new Date(end);
      start.setDate(start.getDate() - 6);
      start.setHours(0, 0, 0, 0);
      return { startDate: start, endDate: end, label: '지난 주' };
    }
    case 'this_month': {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      return { startDate: start, endDate: now, label: '이번 달' };
    }
    case 'last_month': {
      const end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
      const start = new Date(end.getFullYear(), end.getMonth(), 1);
      return { startDate: start, endDate: end, label: '지난 달' };
    }
    default: { // '7d'
      const start = new Date(now);
      start.setDate(start.getDate() - 7);
      start.setHours(0, 0, 0, 0);
      return { startDate: start, endDate: now, label: '최근 7일' };
    }
  }
}

// 기존 함수 유지 (폴백용)
export function extractTimeRange(message) {
  const now = new Date();
  const m = message.toLowerCase();

  if (/오늘|today/.test(m)) {
    const start = new Date(now); start.setHours(0, 0, 0, 0);
    return { startDate: start, endDate: now, label: '오늘' };
  }

  if (/이번\s*주|this week/.test(m)) {
    const start = new Date(now);
    start.setDate(start.getDate() - start.getDay());
    start.setHours(0, 0, 0, 0);
    return { startDate: start, endDate: now, label: '이번 주' };
  }

  if (/지난\s*주|저번\s*주|last week/.test(m)) {
    const end = new Date(now);
    end.setDate(end.getDate() - end.getDay() - 1);
    end.setHours(23, 59, 59, 999);
    const start = new Date(end);
    start.setDate(start.getDate() - 6);
    start.setHours(0, 0, 0, 0);
    return { startDate: start, endDate: end, label: '지난 주' };
  }

  if (/이번\s*달|this month/.test(m)) {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    return { startDate: start, endDate: now, label: '이번 달' };
  }

  if (/지난\s*달|last month/.test(m)) {
    const end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
    const start = new Date(end.getFullYear(), end.getMonth(), 1);
    return { startDate: start, endDate: end, label: '지난 달' };
  }

  const start = new Date(now);
  start.setDate(start.getDate() - 7);
  start.setHours(0, 0, 0, 0);
  return { startDate: start, endDate: now, label: '최근 7일' };
}
