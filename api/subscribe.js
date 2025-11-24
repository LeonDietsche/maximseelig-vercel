// api/subscribe.js
import crypto from 'node:crypto'
import { createJWT, makeSessionCookie } from './_lib/jwt.js'

const DC   = process.env.MC_SERVER_PREFIX
const LIST = process.env.MC_AUDIENCE_ID
const KEY  = process.env.MAILCHIMP_API_KEY
const FORCE_SUB = process.env.MC_FORCE_SUBSCRIBE === 'true' // optional

// Merge-Tag-Felder: bitte an deine Audience anpassen (Settings -> Audience fields)
const SERVICE_TAG = 'MMERGE12' // "service"
const SUBTYPE_TAG = 'MMERGE10' // "subscription type"

const base = () => `https://${DC}.api.mailchimp.com/3.0`
const headers = () => ({ 'Authorization': `apikey ${KEY}`, 'Content-Type': 'application/json' })

const md5Lower = (s) => crypto.createHash('md5').update(s.trim().toLowerCase()).digest('hex')

function assertEnv() {
  const miss = []
  if (!DC) miss.push('MC_SERVER_PREFIX')
  if (!LIST) miss.push('MC_AUDIENCE_ID')
  if (!KEY) miss.push('MAILCHIMP_API_KEY')
  if (miss.length) throw new Error(`Missing env vars: ${miss.join(', ')}`)
}
function buildMergeFields() {
  const mf = {}
  if (SERVICE_TAG) mf[SERVICE_TAG] = 'website'
  if (SUBTYPE_TAG) mf[SUBTYPE_TAG] = 'na'
  return mf
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end('Method Not Allowed')
  try {
    assertEnv()
    const { email } = req.body || {}
    const ok = typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    if (!ok) return res.status(400).json({ error: 'Invalid email' })

    const hash = md5Lower(email)
    const merge_fields = buildMergeFields()

    // Upsert → pending (Double Opt-In) bzw. subscribed wenn erlaubt
    const upsertBody = {
      email_address: email,
      status_if_new: FORCE_SUB ? 'subscribed' : 'pending',
      merge_fields
    }
    const up = await fetch(`${base()}/lists/${LIST}/members/${hash}`, {
      method: 'PUT', headers: headers(), body: JSON.stringify(upsertBody)
    })
    const upJson = await up.json().catch(() => ({}))
    if (!up.ok) {
      if (FORCE_SUB && upJson?.detail?.toLowerCase?.().includes('confirm')) {
        // Fallback auf pending, falls "subscribed" nicht erlaubt
        const fb = await fetch(`${base()}/lists/${LIST}/members/${hash}`, {
          method: 'PUT', headers: headers(), body: JSON.stringify({ ...upsertBody, status_if_new: 'pending' })
        })
        if (!fb.ok) {
          const det = await fb.json().catch(() => ({}))
          return res.status(fb.status).json({ error: det?.detail || 'Mailchimp upsert error (fallback)' })
        }
      } else {
        return res.status(up.status).json({ error: upJson?.detail || 'Mailchimp upsert error' })
      }
    }

    // Tagging (Segment „website“)
    await fetch(`${base()}/lists/${LIST}/members/${hash}/tags`, {
      method: 'POST', headers: headers(),
      body: JSON.stringify({ tags: [{ name: 'website', status: 'active' }] })
    })

    // Session-Cookie setzen (hält z. B. 90 Tage)
    const token = createJWT({ sub: email, scope: 'tracks' })
    res.setHeader('Set-Cookie', makeSessionCookie(token))

    return res.status(200).json({ ok: true, email })
  } catch (e) {
    return res.status(500).json({ error: e.message || 'Server error' })
  }
}
