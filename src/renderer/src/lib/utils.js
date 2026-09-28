export const baseName = (p) => (p || '').split(/[\\/]/).pop()
export const title = (p) => baseName(p).replace(/\.[^.]+$/, '')
export const folderOf = (p) => {
  const parts = (p || '').split(/[\\/]/)
  return parts.length > 1 ? parts[parts.length - 2] : ''
}
export const toMediaUrl = (p) => 'oplay://media/' + encodeURIComponent(p)
export const isSubtitle = (p) => /\.(srt|vtt)$/i.test(p)

export function fmt(sec) {
  if (!isFinite(sec) || sec < 0) sec = 0
  const s = Math.floor(sec)
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60
  const pad = (n) => String(n).padStart(2, '0')
  return h ? `${h}:${pad(m)}:${pad(r)}` : `${m}:${pad(r)}`
}
