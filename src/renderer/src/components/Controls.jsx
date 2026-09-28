import { useEffect, useRef, useState } from 'react'
import { usePlayer, useTime, RATES } from '../state/PlayerContext'
import Icon from './Icon'
import Equalizer from './Equalizer'
import { fmt } from '../lib/utils'

export default function Controls({ showList, onToggleList }) {
  const p = usePlayer()
  const { currentTime, duration } = useTime()
  const [panel, setPanel] = useState(null)
  const ref = useRef(null)

  useEffect(() => {
    if (!panel) return
    const away = (e) => { if (ref.current && !ref.current.contains(e.target)) setPanel(null) }
    document.addEventListener('mousedown', away)
    return () => document.removeEventListener('mousedown', away)
  }, [panel])

  const toggle = (name) => setPanel(panel === name ? null : name)
  const pct = duration ? Math.min(100, (currentTime / duration) * 100) : 0
  const vol = p.muted ? 0 : p.volume
  const volIcon = vol === 0 ? 'volume-x' : vol < 0.5 ? 'volume-1' : 'volume-2'

  return (
    <footer className="controls" ref={ref} onDoubleClick={(e) => e.stopPropagation()}>
      <div className="seek-row">
        <span className="time">{fmt(currentTime)}</span>
        <input className="slider seek" type="range" min="0" max={duration || 0} step="0.05"
          value={Math.min(currentTime, duration || 0)} disabled={!p.current}
          style={{ '--p': pct + '%' }} onChange={(e) => p.seek(parseFloat(e.target.value))} aria-label="Seek" />
        <span className="time">{fmt(duration)}</span>
      </div>

      <div className="btn-row">
        <div className="grp">
          <button className={`btn ${p.shuffle ? 'on' : ''}`} title="Shuffle (R)" onClick={p.toggleShuffle}><Icon name="shuffle" size={18} /></button>
          <button className="btn" title="Previous (P)" onClick={p.goPrev}><Icon name="prev" /></button>
          <button className="btn play" title="Play / Pause (Space)" onClick={p.current ? p.togglePlay : p.openFiles}>
            <Icon name={p.playing ? 'pause' : 'play'} size={22} />
          </button>
          <button className="btn" title="Next (N)" onClick={() => p.goNext(false)}><Icon name="next" /></button>
          <button className="btn" title="Stop (S)" onClick={p.stop}><Icon name="stop" size={17} /></button>
          <button className={`btn ${p.loop !== 'off' ? 'on' : ''}`} title={`Repeat: ${p.loop} (L)`} onClick={p.cycleLoop}>
            <Icon name={p.loop === 'one' ? 'repeat-one' : 'repeat'} size={18} />
          </button>
        </div>

        <div className="grp">
          <div className="pop-wrap">
            <button className={`btn txt ${p.rate !== 1 ? 'on' : ''}`} title="Speed ( [  ]  = )" onClick={() => toggle('speed')}>{p.rate}×</button>
            {panel === 'speed' && (
              <div className="pop">
                <div className="pop-head"><span className="pop-title">Playback speed</span></div>
                <div className="chips">
                  {RATES.map((r) => (
                    <button key={r} className={`chip ${r === p.rate ? 'on' : ''}`} onClick={() => p.setRate(r)}>{r}×</button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="pop-wrap">
            <button className={`btn ${p.subtitle ? 'on' : ''}`} title="Subtitles" onClick={() => toggle('subs')}><Icon name="captions" size={19} /></button>
            {panel === 'subs' && (
              <div className="pop">
                <div className="pop-head"><span className="pop-title">Subtitles</span></div>
                <button className="pop-item" onClick={() => { p.loadSubtitleFile(); setPanel(null) }}>Load subtitle file (.srt, .vtt)</button>
                {p.subtitle && (
                  <>
                    <p className="pop-note">{p.subtitle.name}</p>
                    <button className="pop-item" onClick={p.clearSubtitle}>Turn off subtitles</button>
                  </>
                )}
              </div>
            )}
          </div>

          <div className="pop-wrap">
            <button className={`btn ${p.eq.preset !== 'Flat' ? 'on' : ''}`} title="Equalizer" onClick={() => toggle('eq')}><Icon name="sliders" size={19} /></button>
            {panel === 'eq' && <Equalizer />}
          </div>

          <div className="pop-wrap">
            <button className={`btn ${p.adaptiveVolume || p.adaptiveLight ? 'on' : ''}`} title="Adaptive controls" onClick={() => toggle('adaptive')}>
              <Icon name="sparkles" size={19} />
            </button>
            {panel === 'adaptive' && (
              <div className="pop adaptive-pop">
                <div className="pop-head">
                  <span className="pop-title">Adaptive</span>
                  <span className="pop-note">Independent controls</span>
                </div>
                <button className={`adaptive-row ${p.adaptiveVolume ? 'on' : ''}`} onClick={() => p.setAdaptiveVolume(!p.adaptiveVolume)}>
                  <span><strong>Adaptive Volume</strong><small>Adjusts volume with surrounding sound</small></span>
                  <span className={`switch ${p.adaptiveVolume ? 'on' : ''}`} aria-hidden="true"><i /></span>
                </button>
                <button className={`adaptive-row ${p.adaptiveLight ? 'on' : ''}`} onClick={() => p.setAdaptiveLight(!p.adaptiveLight)}>
                  <span><strong>Adaptive Light</strong><small>Adjusts Oplay display to ambient light</small></span>
                  <span className={`switch ${p.adaptiveLight ? 'on' : ''}`} aria-hidden="true"><i /></span>
                </button>
                {p.adaptiveVolume && <p className="adaptive-note">Microphone access is used only while Adaptive Volume is on.</p>}
                {p.adaptiveLight && <p className="adaptive-note">Adaptive Light needs an ambient-light sensor on supported devices.</p>}
              </div>
            )}
          </div>

          <div className="vol">
            <button className="btn" title="Mute (M)" onClick={p.toggleMute}><Icon name={volIcon} size={19} /></button>
            <input className="slider vol-slider" type="range" min="0" max="1" step="0.01" value={vol}
              style={{ '--p': vol * 100 + '%' }} aria-label="Volume"
              onChange={(e) => { p.setMuted(false); p.setVolume(parseFloat(e.target.value)) }} />
          </div>

          <button className="btn" title="Fullscreen (F)" onClick={p.toggleFullscreen}><Icon name={p.isFullscreen ? 'minimize' : 'maximize'} size={19} /></button>
          {!p.isFullscreen && (
            <button className={`btn ${showList ? 'on' : ''}`} title="Playlist (Ctrl+L)" onClick={onToggleList}><Icon name="list" size={19} /></button>
          )}
        </div>
      </div>
    </footer>
  )
}
