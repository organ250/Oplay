import { app, BrowserWindow, ipcMain, dialog, protocol } from 'electron'
import { join, extname, basename, dirname } from 'path'
import { readdir, readFile, stat } from 'fs/promises'
import { createReadStream, statSync, existsSync } from 'fs'
import { Readable } from 'stream'

const MIME = {
  mp3: 'audio/mpeg', flac: 'audio/flac', wav: 'audio/wav', m4a: 'audio/mp4',
  aac: 'audio/aac', ogg: 'audio/ogg', oga: 'audio/ogg', opus: 'audio/ogg', weba: 'audio/webm',
  mp4: 'video/mp4', m4v: 'video/mp4', mov: 'video/mp4', webm: 'video/webm',
  mkv: 'video/webm', ogv: 'video/ogg'
}
const isMedia = (p) => extname(p).slice(1).toLowerCase() in MIME
const natural = (a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })

// Media is served to the player through oplay:// so it works offline, supports seeking (Range),
// and lets the Web Audio equalizer read the samples (CORS header).
protocol.registerSchemesAsPrivileged([
  { scheme: 'oplay', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, bypassCSP: true, corsEnabled: true } }
])

function serveFile(request) {
  try {
    const filePath = decodeURIComponent(new URL(request.url).pathname.slice(1))
    const size = statSync(filePath).size
    const type = MIME[extname(filePath).slice(1).toLowerCase()] || 'application/octet-stream'
    const base = { 'Content-Type': type, 'Accept-Ranges': 'bytes', 'Access-Control-Allow-Origin': '*' }
    const range = request.headers.get('range')
    if (range) {
      const m = /bytes=(\d*)-(\d*)/.exec(range)
      let start = m && m[1] ? parseInt(m[1], 10) : 0
      let end = m && m[2] ? parseInt(m[2], 10) : size - 1
      if (m && !m[1] && m[2]) { start = Math.max(0, size - parseInt(m[2], 10)); end = size - 1 }
      end = Math.min(end, size - 1)
      if (start >= size || start > end) {
        return new Response(null, { status: 416, headers: { ...base, 'Content-Range': `bytes */${size}` } })
      }
      return new Response(Readable.toWeb(createReadStream(filePath, { start, end })), {
        status: 206,
        headers: { ...base, 'Content-Range': `bytes ${start}-${end}/${size}`, 'Content-Length': String(end - start + 1) }
      })
    }
    return new Response(Readable.toWeb(createReadStream(filePath)), {
      status: 200,
      headers: { ...base, 'Content-Length': String(size) }
    })
  } catch {
    return new Response('Not found', { status: 404 })
  }
}

async function scan(dir, depth, out) {
  if (depth > 6) return
  let entries
  try { entries = await readdir(dir, { withFileTypes: true }) } catch { return }
  for (const e of entries) {
    const full = join(dir, e.name)
    if (e.isDirectory()) await scan(full, depth + 1, out)
    else if (isMedia(full)) out.push(full)
  }
}

async function expand(paths) {
  const out = []
  for (const p of paths || []) {
    try {
      if ((await stat(p)).isDirectory()) await scan(p, 0, out)
      else if (isMedia(p)) out.push(p)
    } catch { /* skip unreadable */ }
  }
  return out.sort(natural)
}

const mediaFromArgs = (args) => args.filter((a) => !a.startsWith('-') && isMedia(a) && existsSync(a))

async function readSubtitle(p) {
  try { return { name: basename(p), text: await readFile(p, 'utf8') } } catch { return null }
}

let win = null

function createWindow() {
  const icon = join(__dirname, '../../resources/icon.png')
  win = new BrowserWindow({
    width: 1240, height: 760, minWidth: 860, minHeight: 540,
    show: false,
    backgroundColor: '#000000',
    title: 'Oplay',
    autoHideMenuBar: true,
    ...(existsSync(icon) ? { icon } : {}),
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#05080c', symbolColor: '#e6ebf2', height: 44 },
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true, contextIsolation: true, nodeIntegration: false
    }
  })
  win.once('ready-to-show', () => win.show())
  if (process.env['ELECTRON_RENDERER_URL']) win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  else win.loadFile(join(__dirname, '../renderer/index.html'))
}

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', (_e, argv) => {
    if (!win) return
    if (win.isMinimized()) win.restore()
    win.focus()
    const files = mediaFromArgs(argv.slice(1))
    if (files.length) win.webContents.send('app:open-files', files)
  })

  app.whenReady().then(() => {
    app.setAppUserModelId('com.oplay.app')
    protocol.handle('oplay', serveFile)
    createWindow()
    app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })
  })
}

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })

const MEDIA_FILTER = { name: 'Media', extensions: Object.keys(MIME) }

ipcMain.handle('dialog:open-files', async () => {
  const r = await dialog.showOpenDialog(win, { properties: ['openFiles', 'multiSelections'], filters: [MEDIA_FILTER, { name: 'All files', extensions: ['*'] }] })
  return r.canceled ? [] : r.filePaths.filter(isMedia).sort(natural)
})
ipcMain.handle('dialog:open-folder', async () => {
  const r = await dialog.showOpenDialog(win, { properties: ['openDirectory'] })
  return r.canceled ? [] : expand(r.filePaths)
})
ipcMain.handle('dialog:open-subtitle', async () => {
  const r = await dialog.showOpenDialog(win, { properties: ['openFile'], filters: [{ name: 'Subtitles', extensions: ['srt', 'vtt'] }] })
  return r.canceled ? null : readSubtitle(r.filePaths[0])
})
ipcMain.handle('subtitle:read', (_e, p) => readSubtitle(p))
ipcMain.handle('subtitle:find', async (_e, mediaPath) => {
  const stem = join(dirname(mediaPath), basename(mediaPath, extname(mediaPath)))
  for (const ext of ['.vtt', '.srt']) if (existsSync(stem + ext)) return readSubtitle(stem + ext)
  return null
})
ipcMain.handle('fs:expand', (_e, paths) => expand(paths))
ipcMain.handle('app:launch-files', () => mediaFromArgs(process.argv.slice(1)))
