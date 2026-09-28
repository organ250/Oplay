import { useEffect, useRef, useState } from 'react'
import { PlayerProvider, usePlayer } from './state/PlayerContext'
import TitleBar from './components/TitleBar'
import Stage from './components/Stage'
import Controls from './components/Controls'
import Playlist from './components/Playlist'

const hasFiles = (e) => Array.from((e.dataTransfer && e.dataTransfer.types) || []).includes('Files')

function Shell() {
  const p = usePlayer()
  const pr = useRef(p)
  pr.current = p
  const [showList, setShowList] = useState(true)
  const [over, setOver] = useState(false)
  const [idle, setIdle] = useState(false)
  const depth = useRef(0)
  const idleTimer = useRef(null)

  // ---- keyboard shortcuts (VLC-style) ----
  useEffect(() => {
    const onKey = (e) => {
      const t = e.target
      if (t && (t.tagName === 'TEXTAREA' || (t.tagName === 'INPUT' && t.type === 'text'))) return
      const q = pr.current
      let handled = true
      if (e.ctrlKey || e.metaKey) {
        const k = e.key.toLowerCase()
        if (k === 'o') q.openFiles()
        else if (k === 'f') q.openFolder()
        else if (k === 'l') setShowList((s) => !s)
        else handled = false
      } else if (e.altKey) {
        handled = false
      } else {
        switch (e.key) {
          case ' ': case 'k': q.togglePlay(); break
          case 'ArrowLeft': q.seekBy(e.shiftKey ? -30 : -5); break
          case 'ArrowRight': q.seekBy(e.shiftKey ? 30 : 5); break
          case 'ArrowUp': q.changeVolume(0.05); break
          case 'ArrowDown': q.changeVolume(-0.05); break
          case 'm': q.toggleMute(); break
          case 'f': q.toggleFullscreen(); break
          case 'n': q.goNext(false); break
          case 'p': q.goPrev(); break
          case 's': q.stop(); break
          case 'l': q.cycleLoop(); break
          case 'r': q.toggleShuffle(); break
          case '[': q.stepRate(-1); break
          case ']': q.stepRate(1); break
          case '=': q.setRate(1); break
          default: handled = false
        }
      }
      if (handled) {
        e.preventDefault()
        if (t && t !== document.body && t.blur) t.blur()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // ---- hide controls + cursor while idle in fullscreen ----
  const onMove = () => {
    setIdle(false)
    clearTimeout(idleTimer.current)
    if (document.fullscreenElement) idleTimer.current = setTimeout(() => setIdle(true), 2500)
  }

  // ---- drag & drop files / folders / subtitles anywhere ----
  const onDragEnter = (e) => { if (hasFiles(e)) { e.preventDefault(); depth.current++; setOver(true) } }
  const onDragOver = (e) => { if (hasFiles(e)) e.preventDefault() }
  const onDragLeave = (e) => {
    if (!hasFiles(e)) return
    depth.current = Math.max(0, depth.current - 1)
    if (!depth.current) setOver(false)
  }
  const onDrop = (e) => {
    if (!hasFiles(e)) return
    e.preventDefault()
    depth.current = 0
    setOver(false)
    const paths = Array.from(e.dataTransfer.files).map((f) => window.oplay.pathForFile(f)).filter(Boolean)
    pr.current.handleDropped(paths)
  }

  return (
    <div className="app" onDragEnter={onDragEnter} onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}>
      <TitleBar />
      <div className="body">
        <div ref={p.areaRef} className={`player-area ${p.isFullscreen ? 'fs' : ''} ${idle ? 'idle' : ''}`} style={{ '--oplay-adaptive-light': p.adaptiveLight ? p.adaptiveLightLevel : 1 }} onMouseMove={onMove}>
          <Stage />
          <Controls showList={showList} onToggleList={() => setShowList((s) => !s)} />
        </div>
        {showList && <Playlist />}
      </div>
      {over && (
        <div className="drop-overlay">
          <div className="drop-card">Drop to play</div>
        </div>
      )}
    </div>
  )
}

export default function App() {
  return (
    <PlayerProvider>
      <Shell />
    </PlayerProvider>
  )
}
