import { memo, useEffect, useRef, useState } from 'react'
import { usePlayer } from '../state/PlayerContext'
import Icon from './Icon'
import { title, folderOf } from '../lib/utils'

const Row = memo(function Row({ path, i, active, playing, dropping, filtered, p, drag }) {
  return (
    <div
      className={`row ${active ? 'active' : ''} ${dropping ? 'dropping' : ''}`}
      draggable={!filtered}
      onClick={() => p.playIndex(i)}
      onDragStart={(e) => { drag.set(i); e.dataTransfer.setData('application/x-oplay-row', String(i)); e.dataTransfer.effectAllowed = 'move' }}
      onDragOver={(e) => { if (drag.from !== null) { e.preventDefault(); e.stopPropagation(); drag.over(i) } }}
      onDrop={(e) => { if (drag.from !== null) { e.preventDefault(); e.stopPropagation(); p.reorder(drag.from, i) } drag.end() }}
      onDragEnd={drag.end}
    >
      <span className="row-lead">
        {active && playing ? <span className="bars"><i /><i /><i /></span> : active ? <Icon name="play" size={12} /> : i + 1}
      </span>
      <span className="row-text">
        <span className="row-name">{title(path)}</span>
        <span className="row-sub">{folderOf(path)}</span>
      </span>
      <button className="row-x" title="Remove" onClick={(e) => { e.stopPropagation(); p.removeAt(i) }}><Icon name="x" size={14} /></button>
    </div>
  )
})

export default function Playlist() {
  const p = usePlayer()
  const [filter, setFilter] = useState('')
  const [from, setFrom] = useState(null)
  const [over, setOver] = useState(null)
  const listRef = useRef(null)

  useEffect(() => {
    const el = listRef.current && listRef.current.querySelector('.row.active')
    if (el) el.scrollIntoView({ block: 'nearest' })
  }, [p.index])

  const q = filter.trim().toLowerCase()
  const rows = p.queue.map((path, i) => ({ path, i })).filter((r) => !q || title(r.path).toLowerCase().includes(q))
  const drag = { from, set: setFrom, over: setOver, end: () => { setFrom(null); setOver(null) } }

  return (
    <aside className="sidebar">
      <div className="side-head">
        <h2>Playlist</h2>
        <span className="count">{p.queue.length}</span>
        <div className="side-actions">
          <button className="btn sm" title="Add files" onClick={p.addFiles}><Icon name="plus" size={17} /></button>
          <button className="btn sm" title="Add folder" onClick={p.addFolder}><Icon name="folder" size={17} /></button>
          <button className="btn sm" title="Clear playlist" onClick={p.clearQueue} disabled={!p.queue.length}><Icon name="trash" size={16} /></button>
        </div>
      </div>

      {p.queue.length > 0 && (
        <label className="search">
          <Icon name="search" size={15} />
          <input type="text" placeholder="Search playlist" value={filter} onChange={(e) => setFilter(e.target.value)} />
        </label>
      )}

      <div className="list" ref={listRef}>
        {p.queue.length === 0 && (
          <div className="list-empty">
            <p>Your playlist is empty.</p>
            <button className="ghost" onClick={p.addFiles}>Add files</button>
          </div>
        )}
        {p.queue.length > 0 && rows.length === 0 && <div className="list-empty"><p>Nothing matches "{filter}".</p></div>}
        {rows.map(({ path, i }) => (
          <Row key={i + path} path={path} i={i} p={p} drag={drag}
            active={i === p.index} playing={p.playing} filtered={!!q} dropping={from !== null && over === i && from !== i} />
        ))}
      </div>
    </aside>
  )
}
