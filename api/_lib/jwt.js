import crypto from 'node:crypto'

const SECRET = process.env.SESSION_SECRET || 'dev-secret'
const ENC = 'base64url'

const b64  = (obj) => Buffer.from(JSON.stringify(obj)).toString(ENC)
const hmac = (data) => crypto.createHmac('sha256', SECRET).update(data).digest(ENC)

export function createJWT(payload, { expSec = (Number(process.env.SESSION_MAX_DAYS || 90) * 86400) } = {}) {
  const now = Math.floor(Date.now() / 1000)
  const body = { iat: now, exp: now + expSec, ...payload }
  const header = { alg: 'HS256', typ: 'JWT' }
  const p1 = b64(header)
  const p2 = b64(body)
  const sig = hmac(`${p1}.${p2}`)
  return `${p1}.${p2}.${sig}`
}

export function verifyJWT(token) {
  try {
    const [p1, p2, sig] = token.split('.')
    if (!p1 || !p2 || !sig) return { valid: false, reason: 'format' }
    const expect = hmac(`${p1}.${p2}`)
    if (expect !== sig) return { valid: false, reason: 'sig' }
    const payload = JSON.parse(Buffer.from(p2, ENC).toString('utf8'))
    if (typeof payload.exp === 'number' && Date.now() / 1000 > payload.exp) {
      return { valid: false, reason: 'exp' }
    }
    return { valid: true, payload }
  } catch {
    return { valid: false, reason: 'error' }
  }
}

export function getTokenFromCookie(req, name = 'ms_access') {
  const raw = req.headers.cookie || ''
  const hit = raw.split(/;\s*/).find(c => c.startsWith(name + '='))
  return hit ? decodeURIComponent(hit.split('=').slice(1).join('=')) : null
}

export function makeSessionCookie(token, days = Number(process.env.SESSION_MAX_DAYS || 90)) {
  return [
    `ms_access=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'Secure',
    'SameSite=Lax',
    `Max-Age=${days * 86400}`
  ].join('; ')
}

export function clearSessionCookie() {
  return 'ms_access=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0'
}
