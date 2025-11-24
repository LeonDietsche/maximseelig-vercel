// api/auth/whoami.js
import { verifyJWT, getTokenFromCookie } from '../_lib/jwt.js'

export default async function handler(req, res) {
  const token = getTokenFromCookie(req, 'ms_access')
  if (!token) return res.status(200).json({ authed: false })

  const v = verifyJWT(token)
  if (!v.valid) return res.status(200).json({ authed: false, reason: v.reason })

  return res.status(200).json({ authed: true, payload: v.payload })
}
