// ~/teslamate-api/formatter.js

function koDate(dateStr) {
  return new Date(dateStr).toLocaleDateString('ko-KR', {
    month: 'numeric',
    day: 'numeric',
  });
}

// ─── Cards Only (LLM이 자연어 답변 생성) ─────────────────
export function formatCards(intent, data) {
  switch (intent) {
    case 'battery_status': return formatBatteryCards(data);
    case 'efficiency':     return formatEfficiencyCards(data);
    case 'recent_drives':  return formatDrivesCards(data);
    case 'charge_cost':    return formatChargeCostCards(data);
    case 'location':       return formatLocationCards(data);
    default:               return formatOverviewCards(data);
  }
}

// 기존 formatResponse도 유지 (폴백용)
export function formatResponse(intent, data) {
  const cards = formatCards(intent, data);
  const reply = formatReplyText(intent, data);
  return { reply, cards, actions: [] };
}

function formatReplyText(intent, data) {
  switch (intent) {
    case 'battery_status': {
      const { charge, range } = data;
      if (!charge && !range) return '배터리 데이터를 찾을 수 없습니다.';
      const soc = charge?.usable_battery_level ?? charge?.battery_level ?? range?.battery_level ?? 0;
      const km = range?.ideal_battery_range_km ?? 0;
      return `현재 배터리 ${soc}%. 예상 주행거리 ${km}km.`;
    }
    case 'efficiency': {
      const { daily } = data;
      if (!daily.length) return '해당 기간의 주행 데이터가 없습니다.';
      const avg = daily.reduce((s, d) => s + Number(d.efficiency), 0) / daily.length;
      const totalDist = daily.reduce((s, d) => s + Number(d.total_distance), 0);
      return `평균 효율 ${avg.toFixed(1)}km/kWh, 총 ${totalDist.toFixed(1)}km 주행.`;
    }
    case 'recent_drives': {
      if (!data.drives?.length) return '해당 기간의 주행 기록이 없습니다.';
      return `${data.drives.length}건의 주행 기록.`;
    }
    case 'charge_cost': {
      const { daily, total } = data;
      if (!daily.length) return '해당 기간의 충전 기록이 없습니다.';
      return `총 ₩${Number(total).toLocaleString()} 충전 비용.`;
    }
    case 'location': {
      if (!data.position) return '위치 데이터를 찾을 수 없습니다.';
      return `차량 위치: ${data.position.latitude}, ${data.position.longitude}`;
    }
    default: {
      const { car, drives, charges } = data;
      const name = car?.name || '차량';
      return `${name} (${car?.model || 'Model Y'}) 전체 요약.`;
    }
  }
}

function formatBatteryCards(data) {
  const { charge, range } = data;
  if (!charge && !range) return [];

  const soc = charge?.usable_battery_level ?? charge?.battery_level ?? range?.battery_level ?? 0;
  const km = range?.ideal_battery_range_km ?? 0;

  return [
    {
      type: 'stat',
      title: '배터리 잔량',
      value: soc,
      unit: '%',
      color: soc > 20 ? '#4CAF50' : '#FF5722',
      icon: '🔋',
    },
    {
      type: 'stat',
      title: '예상 주행거리',
      value: Number(km).toFixed(0),
      unit: 'km',
      color: '#2196F3',
      icon: '🚗',
    },
  ];
}

// ─── Efficiency ──────────────────────────────────────────
function formatEfficiencyCards(data) {
  const { daily } = data;
  if (!daily.length) return [];

  const avg = daily.reduce((s, d) => s + Number(d.efficiency), 0) / daily.length;
  const totalDist = daily.reduce((s, d) => s + Number(d.total_distance), 0);

  return [
    {
      type: 'chart',
      kind: 'line',
      title: '일별 효율 (km/kWh)',
      data: daily.map(d => ({ x: koDate(d.date), y: Number(d.efficiency) })),
      color: '#4CAF50',
    },
    {
      type: 'stat',
      title: '평균 효율',
      value: avg.toFixed(1),
      unit: 'km/kWh',
      color: '#4CAF50',
      icon: '⚡',
    },
    {
      type: 'stat',
      title: '총 주행거리',
      value: totalDist.toFixed(1),
      unit: 'km',
      color: '#2196F3',
      icon: '🛣️',
    },
  ];
}

// ─── Drives ──────────────────────────────────────────────
function formatDrivesCards(data) {
  const { drives } = data;
  if (!drives.length) return [];

  return [
    {
      type: 'chart',
      kind: 'bar',
      title: '일별 주행거리 (km)',
      data: drives.slice(0, 14).map(d => ({
        x: koDate(d.start_date),
        y: Number(d.distance_km),
      })).reverse(),
      color: '#2196F3',
    },
    ...drives.slice(0, 5).map(d => ({
      type: 'drive_item',
      date: d.start_date,
      distance_km: Number(d.distance_km),
      duration_min: d.duration_min,
      efficiency: Number(d.efficiency || 0),
      from: d.start_address || '출발지',
      to: d.end_address || '도착지',
    })),
  ];
}

// ─── Charge Cost ─────────────────────────────────────────
function formatChargeCostCards(data) {
  const { daily, total } = data;
  if (!daily.length) return [];

  return [
    {
      type: 'chart',
      kind: 'bar',
      title: '일별 충전 비용 (₩)',
      data: daily.map(d => ({
        x: koDate(d.date),
        y: Number(d.total_cost),
      })),
      color: '#FF9800',
    },
    {
      type: 'stat',
      title: '총 충전 비용',
      value: Number(total).toLocaleString(),
      unit: '₩',
      color: '#FF9800',
      icon: '💰',
    },
  ];
}

// ─── Location ────────────────────────────────────────────
function formatLocationCards(data) {
  const { position } = data;
  if (!position) return [];

  return [
    {
      type: 'map',
      title: '차량 위치',
      latitude: Number(position.latitude),
      longitude: Number(position.longitude),
      marker: '🚗 테이',
    },
  ];
}

// ─── Overview ────────────────────────────────────────────
function formatOverviewCards(data) {
  const { car, drives, charges } = data;

  return [
    {
      type: 'stat',
      title: '총 주행',
      value: Number(drives?.total_distance_km || 0).toLocaleString(),
      unit: 'km',
      color: '#2196F3',
      icon: '🚗',
    },
    {
      type: 'stat',
      title: '평균 효율',
      value: Number(drives?.avg_efficiency || 0).toFixed(1),
      unit: 'km/kWh',
      color: '#4CAF50',
      icon: '⚡',
    },
    {
      type: 'stat',
      title: '총 충전 비용',
      value: Number(charges?.total_cost || 0).toLocaleString(),
      unit: '₩',
      color: '#FF9800',
      icon: '💰',
    },
  ];
}
