// api/subscribe.js
import crypto from 'node:crypto'

const DC   = process.env.MC_SERVER_PREFIX
const LIST = process.env.MC_AUDIENCE_ID
const KEY  = process.env.MAILCHIMP_API_KEY
const FORCE_SUB = process.env.MC_FORCE_SUBSCRIBE === 'true' // optional

// Merge-tag names (configurable per audience)
const SERVICE_TAG = 'MMERGE12'
const SUBTYPE_TAG = 'MMERGE10'

function md5Lower(s) {
  return crypto.createHash('md5').update(s.trim().toLowerCase()).digest('hex')
}
function assertEnv() {
  const miss = []
  if (!DC) miss.push('MC_SERVER_PREFIX')
  if (!LIST) miss.push('MC_AUDIENCE_ID')
  if (!KEY) miss.push('MAILCHIMP_API_KEY')
  if (miss.length) throw new Error(`Missing env vars: ${miss.join(', ')}`)
}
function buildMergeFields() {
  const mf = {}
  if (SERVICE_TAG) mf[SERVICE_TAG] = 'website' // service
  if (SUBTYPE_TAG) mf[SUBTYPE_TAG] = 'na'      // subscription type
  return mf
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end('Method Not Allowed')
  try {
    assertEnv()

    const { email } = req.body || {}
    const ok = typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    if (!ok) return res.status(400).json({ error: 'Invalid email' })

    const base = `https://${DC}.api.mailchimp.com/3.0`
    const headers = { 'Authorization': `apikey ${KEY}`, 'Content-Type': 'application/json' }
    const hash = md5Lower(email)
    const merge_fields = buildMergeFields()

    // 1) Upsert member (idempotent). Use 'pending' for double opt-in safety.
    const upsertBody = {
      email_address: email,
      status_if_new: FORCE_SUB ? 'subscribed' : 'pending',
      merge_fields
    }
    const upsert = await fetch(`${base}/lists/${LIST}/members/${hash}`, {
      method: 'PUT', headers, body: JSON.stringify(upsertBody)
    })
    const upsertJson = await upsert.json().catch(() => ({}))
    if (!upsert.ok) {
      if (FORCE_SUB && upsertJson?.detail?.toLowerCase?.().includes('confirm')) {
        // fall back to pending if forced subscribe is disallowed
        const fallback = await fetch(`${base}/lists/${LIST}/members/${hash}`, {
          method: 'PUT', headers,
          body: JSON.stringify({ ...upsertBody, status_if_new: 'pending' })
        })
        if (!fallback.ok) {
          const detail = await fallback.json().catch(() => ({}))
          return res.status(fallback.status).json({ error: detail?.detail || 'Mailchimp upsert error (fallback)' })
        }
      } else {
        return res.status(upsert.status).json({ error: upsertJson?.detail || 'Mailchimp upsert error' })
      }
    }

    // 2) Optionally upgrade to subscribed if allowed
    if (FORCE_SUB) {
      const get = await fetch(`${base}/lists/${LIST}/members/${hash}`, { headers })
      const member = await get.json()
      if (member?.status !== 'subscribed') {
        await fetch(`${base}/lists/${LIST}/members/${hash}`, {
          method: 'PATCH', headers,
          body: JSON.stringify({ status: 'subscribed', merge_fields })
        })
      }
    }

    // 3) Tag for segmentation ("website")
    await fetch(`${base}/lists/${LIST}/members/${hash}/tags`, {
      method: 'POST', headers,
      body: JSON.stringify({ tags: [{ name: 'website', status: 'active' }] })
    })

    return res.status(200).json({
      ok: true,
      mode: FORCE_SUB ? 'subscribed-if-allowed' : 'pending',
      email
    })
  } catch (e) {
    return res.status(500).json({ error: e.message || 'Server error' })
  }
}
