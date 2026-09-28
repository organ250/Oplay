import { usePlayer } from '../state/PlayerContext'
import { EQ_BANDS, EQ_PRESETS } from '../lib/audio'

const label = (f) => (f >= 1000 ? `${f / 1000}k` : String(f))
const db = (g) => (g > 0 ? `+${g}` : String(g))

export default function Equalizer() {
  const p = usePlayer()
  return (
    <div className="pop pop-eq" onDoubleClick={(e) => e.stopPropagation()}>
      <div className="pop-head">
        <span className="pop-title">Equalizer</span>
        <span className="pop-note">{p.eq.preset}</span>
      </div>
      <div className="chips">
        {Object.keys(EQ_PRESETS).map((n) => (
          <button key={n} className={`chip ${p.eq.preset === n ? 'on' : ''}`} onClick={() => p.setEqPreset(n)}>{n}</button>
        ))}
      </div>
      <div className="eq-grid">
        {EQ_BANDS.map((f, i) => (
          <label key={f} className="eq-band">
            <span className="eq-db">{db(p.eq.gains[i])}</span>
            <input type="range" min="-12" max="12" step="0.5" value={p.eq.gains[i]}
              onChange={(e) => p.setEqBand(i, parseFloat(e.target.value))} />
            <span className="eq-f">{label(f)}</span>
          </label>
        ))}
      </div>
    </div>
  )
}
