import fs from 'node:fs'
import path from 'node:path'
import { verifyJWT, getTokenFromCookie } from '../../_lib/jwt.js'  // note the path

const ROOT = process.cwd()

// Map URL slugs -> repo file paths (NOT in /public)
const FILES = {
  'the-machinist':         'protected/tracks/mp3/the-machinist.mp3',
  'la-vie-est-belle':      'protected/tracks/mp3/la-vie-est-belle.mp3',
  'cheaper-than-a-life':   'protected/tracks/mp3/cheaper-than-a-life.mp3',
  'game':                  'protected/tracks/mp3/game.mp3',
  'post-traumatic-season': 'protected/tracks/mp3/post-traumatic-season.mp3',
}

function requireSession(req, res) {
  const token = getTokenFromCookie(req, 'ms_access')
  const { valid } = verifyJWT(token || '')
  if (!valid) {
    res.statusCode = 401
    res.setHeader('Cache-Control', 'no-store')
    res.end(JSON.stringify({ error: 'Not authorized' }))
    return false
  }
  return true
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.statusCode = 405
    return res.end('Method Not Allowed')
  }

  if (!requireSession(req, res)) return

  const slug = req.query?.slug
  const rel  = FILES[slug]
  if (!rel) {
    res.statusCode = 404
    return res.end(JSON.stringify({ error: 'Track not found' }))
  }

  const abs = path.join(ROOT, rel)
  if (!fs.existsSync(abs)) {
    res.statusCode = 404
    return res.end(JSON.stringify({ error: 'File missing' }))
  }

  // Range support for scrubbing
  const stat  = fs.statSync(abs)
  const total = stat.size
  const range = req.headers.range

  if (range) {
    const m     = /bytes=(\d+)-(\d*)/.exec(range)
    const start = m ? parseInt(m[1], 10) : 0
    const end   = m && m[2] ? parseInt(m[2], 10) : total - 1
    const size  = Math.max(0, end - start + 1)

    res.writeHead(206, {
      'Content-Range': `bytes ${start}-${end}/${total}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': size,
      'Content-Type': 'audio/mpeg',
      'Cache-Control': 'private, max-age=0, no-store',
    })
    return fs.createReadStream(abs, { start, end }).pipe(res)
  }

  res.writeHead(200, {
    'Content-Length': total,
    'Content-Type': 'audio/mpeg',
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'private, max-age=0, no-store',
  })
  fs.createReadStream(abs).pipe(res)
}
