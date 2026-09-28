import { useRef } from 'react'
import { usePlayer } from '../state/PlayerContext'
import Visualizer from './Visualizer'
import Icon from './Icon'
import { title, folderOf } from '../lib/utils'
import logoFull from '../assets/logo-full.png'
import logoIcon from '../assets/logo-icon.png'

export default function Stage() {
  const p = usePlayer()
  const { current, kind, playing, error } = p
  const timer = useRef(null)

  const onClick = () => {
    if (!current) return
    clearTimeout(timer.current)
    timer.current = setTimeout(p.togglePlay, 220)
  }
  const onDouble = () => {
    clearTimeout(timer.current)
    if (current) p.toggleFullscreen()
  }

  return (
    <div className={`stage ${playing ? 'playing' : ''}`} onClick={onClick} onDoubleClick={onDouble}>
      <video ref={p.videoRef} className={kind === 'video' ? 'video' : 'video hide'} crossOrigin="anonymous" playsInline />

      {!current && (
        <div className="empty" onClick={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
          <img className="empty-logo" src={logoFull} alt="Oplay. Organ Play. Your audio. Your space." draggable="false" />
          <div className="empty-actions">
            <button className="cta" onClick={p.openFiles}><Icon name="file" size={18} />Open files</button>
            <button className="ghost" onClick={p.openFolder}><Icon name="folder" size={18} />Open folder</button>
          </div>
          <p className="hint">Drop music or video anywhere in this window to play it.</p>
        </div>
      )}

      {current && kind === 'audio' && (
        <div className="scene">
          <div className="mark"><img src={logoIcon} alt="" draggable="false" /></div>
          <h1 className="scene-title">{title(current)}</h1>
          <p className="scene-sub">{folderOf(current)}</p>
          <Visualizer />
        </div>
      )}

      {current && kind === 'video' && !playing && !error && (
        <div className="paused-badge"><Icon name="play" size={30} /></div>
      )}

      {error && (
        <div className="error" onClick={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
          <p>{error}</p>
          <p className="error-note">Oplay plays MP3, AAC, FLAC, WAV, OGG, Opus, MP4 (H.264), WebM and MKV files that use these codecs.</p>
          {p.queue.length > 1 && <button className="ghost" onClick={() => p.goNext(false)}>Skip to next</button>}
        </div>
      )}
    </div>
  )
}
