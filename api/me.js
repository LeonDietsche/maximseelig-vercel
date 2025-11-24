import { getTokenFromCookie, verifyJWT } from './_lib/jwt.js'
export default function handler(req, res) {
  const token = getTokenFromCookie(req)
  const v = token && verifyJWT(token)
  if (!v || !v.valid) return res.status(401).json({ ok: false })
  res.status(200).json({ ok: true, user: v.payload.sub })
}
