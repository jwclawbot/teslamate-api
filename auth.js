// ~/teslamate-api/auth.js
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import dotenv from 'dotenv';
dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES = process.env.JWT_EXPIRES_IN || '15m';
const JWT_REFRESH_EXPIRES = process.env.JWT_REFRESH_EXPIRES_IN || '7d';

// ─── PIN 해시 검증 ──────────────────────────────────────
// TODO: PIN 해시화 필요 — teslalink-web/src/app/api/auth/route.ts와 동일한 방식으로 마이그레이션 예정
export function verifyPin(pin) {
  const storedHash = process.env.APP_PIN_HASH;
  const salt = process.env.APP_SALT;

  if (!storedHash || !salt) return false;

  const hash = crypto
    .createHmac('sha256', salt)
    .update(pin)
    .digest('hex');

  return hash === storedHash;
}

// ─── 토큰 생성 ──────────────────────────────────────────
export function generateTokens(deviceId) {
  const accessToken = jwt.sign(
    { sub: 'teslalink-user', deviceId, type: 'access' },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES }
  );

  const refreshToken = jwt.sign(
    { sub: 'teslalink-user', deviceId, type: 'refresh' },
    JWT_SECRET,
    { expiresIn: JWT_REFRESH_EXPIRES }
  );

  return { accessToken, refreshToken };
}

// ─── JWT 검증 미들웨어 ──────────────────────────────────
export function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({
      error: '인증 토큰이 필요합니다.',
      code: 'NO_TOKEN',
    });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET);

    if (decoded.type !== 'access') {
      return res.status(401).json({
        error: '유효하지 않은 토큰 타입입니다.',
        code: 'INVALID_TOKEN_TYPE',
      });
    }

    req.user = decoded;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({
        error: '토큰이 만료되었습니다.',
        code: 'TOKEN_EXPIRED',
      });
    }
    return res.status(401).json({
      error: '유효하지 않은 토큰입니다.',
      code: 'INVALID_TOKEN',
    });
  }
}

// ─── 리프레시 토큰 검증 ─────────────────────────────────
export function verifyRefreshToken(token) {
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (decoded.type !== 'refresh') return null;
    return decoded;
  } catch {
    return null;
  }
}
