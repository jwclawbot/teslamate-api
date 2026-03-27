// ~/teslamate-api/llm.js
// Ollama LLM 연동 (Mistral-Small3.1:24b)

const OLLAMA_URL = 'http://localhost:11434';
const MODEL = 'mistral-small3.1:24b';

// ─── Intent + Parameters Extraction ────────────────────
// @deprecated — not used by server.js
export async function extractIntent(message) {
  const systemPrompt = `당신은 TeslaMate 차량 데이터 분석 시스템의 intent 분류기입니다.
사용자의 질문을 분석하여 JSON으로 응답하세요.

가능한 intent:
- battery_status: 배터리 잔량, 충전 상태, 주행 가능 거리
- efficiency: 연비, 효율, 소비전력, km/kWh
- recent_drives: 주행 기록, 드라이브 히스토리
- charge_cost: 충전 비용, 충전 요금
- location: 차량 위치, 어디에 있는지
- history: 전체 기록, 타임라인
- overview: 전체 요약, 상태, 차량 정보

가능한 timeRange:
- today: 오늘
- this_week: 이번 주
- last_week: 지난 주
- this_month: 이번 달
- last_month: 지난 달
- 7d: 최근 7일 (기본값)

반드시 다음 JSON 형식으로만 응답하세요:
{"intent": "intent명", "timeRange": "timeRange값"}

예시:
사용자: "배터리 얼마나 남았어?" → {"intent": "battery_status", "timeRange": "7d"}
사용자: "이번 달 효율 보여줘" → {"intent": "efficiency", "timeRange": "this_month"}
사용자: "어제 충전 비용" → {"intent": "charge_cost", "timeRange": "today"}`;

  try {
    const res = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: message },
        ],
        stream: false,
        options: {
          temperature: 0.1,
          num_predict: 100,
        },
      }),
    });

    const data = await res.json();
    const content = data.message?.content?.trim() || '';

    // JSON 파싱 (마크다운 코드블록 처리)
    const jsonMatch = content.match(/\{[^}]+\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        intent: parsed.intent || 'general',
        timeRange: parsed.timeRange || '7d',
      };
    }

    // 파싱 실패 시 폴백
    console.log('[LLM] Intent parse failed:', content);
    return { intent: 'general', timeRange: '7d' };
  } catch (err) {
    console.error('[LLM] Intent extraction error:', err.message);
    return { intent: 'general', timeRange: '7d' };
  }
}

// ─── Natural Language Response Generation ──────────────
export async function generateReply(userMessage, intent, data) {
  const systemPrompt = `당신은 TeslaMate 차량 데이터를 기반으로 답변하는 AI 비서입니다.
사용자의 질문과 데이터를 바탕으로 자연스럽고 친근한 한국어로 답변하세요.

규칙:
- 2~3문장 이내로 간결하게
- 핵심 데이터를 포함하되 자연스럽게
- 이모지를 적절히 사용 (🔋🚗⚡💰 등)
- 데이터가 없으면 솔직하게 알려주세요`;

  const dataContext = JSON.stringify(data, null, 2);

  try {
    const res = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `질문: ${userMessage}\n\n데이터:\n${dataContext}` },
        ],
        stream: false,
        options: {
          temperature: 0.5,
          num_predict: 300,
        },
      }),
    });

    const result = await res.json();
    return result.message?.content?.trim() || '데이터를 분석할 수 없습니다.';
  } catch (err) {
    console.error('[LLM] Reply generation error:', err.message);
    return '답변 생성 중 오류가 발생했습니다.';
  }
}
