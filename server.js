// ~/teslamate-api/server.js
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import { queryVehicleData } from './queries.js';
import { formatCards } from './formatter.js';
import { extractTimeRange } from './timeRange.js';
import { generateReply } from './llm.js';
import {
  authMiddleware,
  verifyPin,
  generateTokens,
  verifyRefreshToken,
} from './auth.js';

dotenv.config();

const app = express();
const PORT = parseInt(process.env.PORT || '3001');

// ─── 보안 미들웨어 ──────────────────────────────────────
app.use(helmet());
app.use(cors({
  origin: ['http://localhost:3002', 'http://192.168.50.11:3002'],
  credentials: true,
}));
app.use(express.json({ limit: '10kb' }));

// 전역 rate limit
app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: '너무 많은 요청입니다.' },
}));

// 로그인 전용 rate limit
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { error: '로그인 시도 횟수를 초과했습니다.' },
});

// ─── Intent Detection ────────────────────────────────────
function detectIntent(message) {
  const m = message.toLowerCase();

  if (/배터리|잔량|charge|soc|충전\s*량/.test(m))       return 'battery_status';
  if (/효율|소비|consumption|km\/kwh|연비/.test(m))      return 'efficiency';
  if (/주행|드라이브|drive|거리|운행/.test(m))            return 'recent_drives';
  if (/충전.*비용|cost|요금|얼마/.test(m))               return 'charge_cost';
  if (/위치|where|어디|차\s*있/.test(m))                return 'location';
  if (/히스토리|기록|history|타임라인/.test(m))           return 'history';
  if (/요약|summary|전체|overview|상태/.test(m))         return 'overview';

  return 'general';
}

// ═════════════════════════════════════════════════════════
// PUBLIC ROUTES (인증 불필요)
// ═════════════════════════════════════════════════════════

// PIN 로그인
app.post('/auth/login', loginLimiter, (req, res) => {
  const { pin, deviceId } = req.body;

  if (!pin || typeof pin !== 'string' || pin.length < 4) {
    return res.status(400).json({ error: 'PIN을 입력해주세요.' });
  }

  if (!verifyPin(pin)) {
    console.log(`[AUTH] Failed login from ${req.ip} at ${new Date().toISOString()}`);
    return res.status(401).json({ error: 'PIN이 올바르지 않습니다.' });
  }

  const tokens = generateTokens(deviceId || 'default');
  console.log(`[AUTH] Login success from ${req.ip}`);

  res.json(tokens);
});

// 토큰 갱신
app.post('/auth/refresh', (req, res) => {
  console.log('[REFRESH] body:', JSON.stringify(req.body));
  const { refreshToken } = req.body;

  if (!refreshToken) {
    console.log('[REFRESH] No refresh token in body');
    return res.status(400).json({ error: '리프레시 토큰이 필요합니다.' });
  }

  const decoded = verifyRefreshToken(refreshToken);
  if (!decoded) {
    console.log('[REFRESH] Invalid refresh token');
    return res.status(401).json({ error: '유효하지 않은 리프레시 토큰입니다.' });
  }

  const tokens = generateTokens(decoded.deviceId);
  console.log('[REFRESH] Success for device:', decoded.deviceId);
  res.json(tokens);
});

// 헬스 체크 (인증 불필요)
app.get('/api/health', async (req, res) => {
  try {
    const pool = (await import('./db.js')).default;
    await pool.query('SELECT 1');
    res.json({ status: 'ok', db: 'connected', uptime: process.uptime() });
  } catch (err) {
    res.status(500).json({ status: 'error', db: 'disconnected', error: err.message });
  }
});

// ═════════════════════════════════════════════════════════
// PROTECTED ROUTES (인증 필요)
// ═════════════════════════════════════════════════════════

app.use('/api/vehicle-chat', authMiddleware);

app.post('/api/vehicle-chat', async (req, res) => {
  const startTime = Date.now();

  try {
    const { message } = req.body;

    if (!message || typeof message !== 'string') {
      return res.status(400).json({
        reply: 'message 필드가 필요합니다.',
        cards: [],
        actions: [],
      });
    }

    // 1. 키워드 기반 intent 감지 (빠름)
    const intent = detectIntent(message);
    const timeRange = extractTimeRange(message);

    console.log(`[${new Date().toISOString()}] intent="${intent}" msg="${message}" range=${timeRange.label}`);

    // 2. DB 쿼리
    const rawData = await queryVehicleData(intent, timeRange);

    // 3. 카드 포맷
    const cards = formatCards(intent, rawData);

    // 4. LLM으로 자연어 답변 생성 (1회만 호출)
    const reply = await generateReply(message, intent, rawData);

    const elapsed = Date.now() - startTime;
    console.log(`  → ${elapsed}ms, ${cards.length} cards`);

    res.json({ reply, cards, actions: [] });
  } catch (err) {
    console.error('vehicle-chat error:', err);
    res.status(500).json({
      reply: '데이터를 가져오는 중 오류가 발생했습니다.',
      cards: [],
      actions: [],
    });
  }
});

// ─── 404 ────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: 'Not Found' });
});

// ─── Start ───────────────────────────────────────────────
app.listen(PORT, '0.0.0.0', () => {
  console.log(`TeslaLink API running on http://0.0.0.0:${PORT}`);
  console.log(`POST /auth/login       (public)`);
  console.log(`POST /auth/refresh     (public)`);
  console.log(`GET  /api/health       (public)`);
  console.log(`POST /api/vehicle-chat (protected)`);
});
