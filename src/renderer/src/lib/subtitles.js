// Converts .srt to WebVTT so the browser can render it; .vtt passes through.
export function subtitleToUrl(name, text) {
  const clean = text.replace(/^\uFEFF/, '').replace(/\r+/g, '')
  const isVtt = /\.vtt$/i.test(name) || clean.trimStart().startsWith('WEBVTT')
  const vtt = isVtt ? clean : 'WEBVTT\n\n' + clean.trim().replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2')
  return URL.createObjectURL(new Blob([vtt], { type: 'text/vtt' }))
}
