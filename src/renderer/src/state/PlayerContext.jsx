import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { createAudioGraph, EQ_PRESETS } from '../lib/audio'
import { subtitleToUrl } from '../lib/subtitles'
import { toMediaUrl, isSubtitle, title as trackTitle, folderOf } from '../lib/utils'

const PlayerCtx = createContext(null)
const TimeCtx = createContext({ currentTime: 0, duration: 0 })
export const usePlayer = () => useContext(PlayerCtx)
export const useTime = () => useContext(TimeCtx)

export const RATES = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2]
const STORE_KEY = 'oplay:state:v1'
const clamp = (n, a, b) => Math.min(b, Math.max(a, n))

function loadState() {
  try { return JSON.parse(localStorage.getItem(STORE_KEY)) || {} } catch { return {} }
}

function describeError(err) {
  if (err && err.code === 4) return "Oplay can't play this file. Its format or codec isn't supported."
  if (err && err.code === 3) return 'This file is damaged or uses a codec Oplay cannot decode.'
  if (err && err.code === 2) return 'The file could not be read from disk.'
  return 'Playback failed.'
}

// Playback time lives in its own context so the seek bar updates
// without re-rendering the whole app four times a second.
function TimeProvider({ videoRef, children }) {
  const [t, setT] = useState({ currentTime: 0, duration: 0 })
  useEffect(() => {
    const v = videoRef.current
    const upd = () => setT({ currentTime: v.currentTime || 0, duration: isFinite(v.duration) ? v.duration : 0 })
    const evs = ['timeupdate', 'durationchange', 'loadstart', 'emptied', 'seeked']
    evs.forEach((e) => v.addEventListener(e, upd))
    return () => evs.forEach((e) => v.removeEventListener(e, upd))
  }, [videoRef])
  return <TimeCtx.Provider value={t}>{children}</TimeCtx.Provider>
}

export function PlayerProvider({ children }) {
  const [saved] = useState(loadState)
  const videoRef = useRef(null)
  const areaRef = useRef(null)
  const graphRef = useRef(null)
  const autoplayRef = useRef(false)
  const subRef = useRef(null)
  const act = useRef({})
  const latest = useRef({})

  const [queue, setQueue] = useState(Array.isArray(saved.queue) ? saved.queue : [])
  const [index, setIndex] = useState(() => {
    const n = Array.isArray(saved.queue) ? saved.queue.length : 0
    return n ? clamp(saved.index ?? 0, 0, n - 1) : -1
  })
  const [token, setToken] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [kind, setKind] = useState('none') // none | loading | audio | video
  const [volume, setVolume] = useState(saved.volume ?? 0.8)
  const [muted, setMuted] = useState(!!saved.muted)
  const [rate, setRate] = useState(1)
  const [loop, setLoop] = useState(saved.loop || 'off') // off | all | one
  const [shuffle, setShuffle] = useState(!!saved.shuffle)
  const [eq, setEq] = useState(saved.eq && saved.eq.gains ? saved.eq : { preset: 'Flat', gains: [...EQ_PRESETS.Flat] })
  const [subtitle, setSubtitle] = useState(null)
  const [error, setError] = useState(null)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [adaptiveVolume, setAdaptiveVolume] = useState(!!saved.adaptiveVolume)
  const [adaptiveLight, setAdaptiveLight] = useState(!!saved.adaptiveLight)
  const [adaptiveLightLevel, setAdaptiveLightLevel] = useState(1)
  const adaptiveAudioRef = useRef(null)
  const adaptiveLightRef = useRef(null)

  const current = index >= 0 ? queue[index] : null
  latest.current = { queue, index, loop, shuffle, playing, eq, rate, current }

  // ---- persistence (fully offline: localStorage inside the app) ----
  useEffect(() => {
    try { localStorage.setItem(STORE_KEY, JSON.stringify({ queue, index, volume, muted, loop, shuffle, eq, adaptiveVolume, adaptiveLight })) } catch { /* ignore */ }
  }, [queue, index, volume, muted, loop, shuffle, eq, adaptiveVolume, adaptiveLight])

  // ---- adaptive volume: listens to ambient sound through the microphone and gently compensates ----
  useEffect(() => {
    let cancelled = false
    let stream = null
    let raf = 0
    let ctx = null
    let analyser = null
    let data = null
    let lastAdjust = 0

    async function start() {
      if (!adaptiveVolume || !navigator.mediaDevices?.getUserMedia) return
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: { autoGainControl: false, echoCancellation: false, noiseSuppression: false } })
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return }
        ctx = new (window.AudioContext || window.webkitAudioContext)()
        const source = ctx.createMediaStreamSource(stream)
        analyser = ctx.createAnalyser()
        analyser.fftSize = 512
        analyser.smoothingTimeConstant = 0.88
        source.connect(analyser)
        data = new Uint8Array(analyser.fftSize)

        const tick = (now) => {
          if (cancelled || !analyser) return
          analyser.getByteTimeDomainData(data)
          let sum = 0
          for (let i = 0; i < data.length; i++) {
            const x = (data[i] - 128) / 128
            sum += x * x
          }
          const rms = Math.sqrt(sum / data.length)
          // Typical room-noise range: ~0.01 quiet to ~0.20+ loud. Keep the response slow.
          if (now - lastAdjust > 650 && !muted) {
            const loudness = Math.min(1, Math.max(0, (rms - 0.008) / 0.19))
            const target = clamp(0.72 - loudness * 0.32, 0.38, 0.72)
            const currentVol = latest.current.volume
            const next = currentVol + (target - currentVol) * 0.16
            if (Math.abs(next - currentVol) > 0.008) {
              setVolume(clamp(next, 0.05, 1))
              lastAdjust = now
            }
          }
          raf = requestAnimationFrame(tick)
        }
        raf = requestAnimationFrame(tick)
      } catch (e) {
        console.warn('Adaptive volume microphone unavailable:', e)
        setAdaptiveVolume(false)
      }
    }
    start()
    return () => {
      cancelled = true
      cancelAnimationFrame(raf)
      if (stream) stream.getTracks().forEach((t) => t.stop())
      if (ctx) ctx.close().catch(() => {})
    }
  }, [adaptiveVolume, muted])

  // ---- adaptive light: uses Ambient Light Sensor when the device exposes one ----
  useEffect(() => {
    let sensor = null
    if (!adaptiveLight) {
      setAdaptiveLightLevel(1)
      return undefined
    }
    try {
      if (!('AmbientLightSensor' in window)) {
        console.info('Adaptive light: AmbientLightSensor is not available on this device.')
        setAdaptiveLightLevel(1)
        return undefined
      }
      sensor = new window.AmbientLightSensor({ frequency: 2 })
      sensor.onreading = () => {
        const lux = Math.max(1, sensor.illuminance || 1)
        // Quiet room -> keep display brighter; bright room -> keep it near full brightness.
        const level = clamp(0.72 + Math.min(1, Math.log10(lux + 1) / 3.2) * 0.28, 0.72, 1)
        setAdaptiveLightLevel(level)
      }
      sensor.onerror = (e) => console.warn('Adaptive light sensor error:', e)
      sensor.start()
    } catch (e) {
      console.warn('Adaptive light sensor unavailable:', e)
      setAdaptiveLightLevel(1)
    }
    return () => { try { sensor?.stop() } catch {} }
  }, [adaptiveLight])

  // ---- media element events ----
  useEffect(() => {
    const v = videoRef.current
    const h = {
      play: () => { setPlaying(true); setError(null); act.current.ensureGraph() },
      pause: () => setPlaying(false),
      loadedmetadata: () => setKind(v.videoWidth > 0 ? 'video' : 'audio'),
      ended: () => act.current.goNext(true),
      error: () => { if (v.getAttribute('src')) setError(describeError(v.error)) }
    }
    Object.entries(h).forEach(([k, fn]) => v.addEventListener(k, fn))
    return () => Object.entries(h).forEach(([k, fn]) => v.removeEventListener(k, fn))
  }, [])

  // ---- load a track whenever the current item (or an explicit play request) changes ----
  useEffect(() => {
    const v = videoRef.current
    let cancelled = false
    setError(null)
    setKind(current ? 'loading' : 'none')
    setSub(null)
    if (!current) {
      v.pause(); v.removeAttribute('src'); v.load()
      return
    }
    const auto = autoplayRef.current
    autoplayRef.current = false
    v.src = toMediaUrl(current)
    v.defaultPlaybackRate = latest.current.rate
    v.playbackRate = latest.current.rate
    if (auto) v.play().catch(() => {})
    window.oplay.findSubtitle(current).then((s) => { if (!cancelled && s) setSub(s.name, s.text) }).catch(() => {})
    return () => { cancelled = true }
  }, [current, token])

  useEffect(() => { const v = videoRef.current; v.volume = clamp(volume, 0, 1); v.muted = muted }, [volume, muted])
  useEffect(() => { const v = videoRef.current; v.defaultPlaybackRate = rate; v.playbackRate = rate }, [rate])

  // ---- subtitles: one <track> managed by hand ----
  useEffect(() => {
    const v = videoRef.current
    v.querySelectorAll('track').forEach((t) => t.remove())
    if (!subtitle) return
    const t = document.createElement('track')
    t.kind = 'subtitles'; t.label = subtitle.name; t.src = subtitle.url; t.default = true
    v.appendChild(t)
    t.track.mode = 'showing'
  }, [subtitle])

  // ---- equalizer ----
  useEffect(() => {
    const g = graphRef.current
    if (g) eq.gains.forEach((gain, i) => { g.filters[i].gain.value = gain })
  }, [eq])

  // ---- fullscreen, window title, media keys ----
  useEffect(() => {
    const onFs = () => setIsFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', onFs)
    return () => document.removeEventListener('fullscreenchange', onFs)
  }, [])
  useEffect(() => { document.title = current ? `${trackTitle(current)} - Oplay` : 'Oplay' }, [current])
  useEffect(() => {
    const ms = navigator.mediaSession
    if (!ms) return
    ms.metadata = current ? new MediaMetadata({ title: trackTitle(current), artist: folderOf(current), album: 'Oplay' }) : null
    const set = (name, fn) => { try { ms.setActionHandler(name, fn) } catch { /* unsupported */ } }
    set('play', () => videoRef.current.play().catch(() => {}))
    set('pause', () => videoRef.current.pause())
    set('previoustrack', () => act.current.goPrev())
    set('nexttrack', () => act.current.goNext(false))
  }, [current])

  // ---- files opened from Explorer / second launch ----
  useEffect(() => {
    window.oplay.getLaunchFiles().then((f) => { if (f && f.length) act.current.enqueue(f, { replace: true }) }).catch(() => {})
    return window.oplay.onOpenFiles((f) => act.current.enqueue(f, { replace: true }))
  }, [])

  // ================= actions =================
  function ensureGraph() {
    if (!graphRef.current) {
      try {
        graphRef.current = createAudioGraph(videoRef.current)
        latest.current.eq.gains.forEach((gain, i) => { graphRef.current.filters[i].gain.value = gain })
      } catch (e) { console.warn('Audio graph unavailable:', e) }
    }
    if (graphRef.current && graphRef.current.ctx.state === 'suspended') graphRef.current.ctx.resume()
  }

  function setSub(name, text) {
    if (subRef.current) URL.revokeObjectURL(subRef.current.url)
    subRef.current = name ? { name, url: subtitleToUrl(name, text) } : null
    setSubtitle(subRef.current)
  }

  function requestPlay(i) {
    autoplayRef.current = true
    setIndex(i)
    setToken((t) => t + 1)
  }

  function enqueue(paths, { replace = false, play = true } = {}) {
    if (!paths || !paths.length) return
    const q = latest.current.queue
    const base = replace ? 0 : q.length
    setQueue(replace ? [...paths] : [...q, ...paths])
    if (play) requestPlay(base)
    else if (q.length === 0 || replace) setIndex(0)
  }

  function pickNext(dir, fromEnded) {
    const { queue: q, index: i, loop: lp, shuffle: sh } = latest.current
    const n = q.length
    if (!n) return -1
    if (fromEnded && lp === 'one') return i
    if (sh && n > 1) {
      let r
      do { r = Math.floor(Math.random() * n) } while (r === i)
      return r
    }
    const ni = i + dir
    if (ni >= 0 && ni < n) return ni
    if (lp === 'all') return ni < 0 ? n - 1 : 0
    return fromEnded ? -1 : i
  }

  function goNext(fromEnded = false) {
    const ni = pickNext(1, fromEnded)
    if (ni >= 0) requestPlay(ni)
  }

  function goPrev() {
    const v = videoRef.current
    if (v.currentTime > 3) { v.currentTime = 0; return }
    const ni = pickNext(-1, false)
    if (ni >= 0) requestPlay(ni)
  }

  function togglePlay() {
    const v = videoRef.current
    if (!latest.current.current) return
    if (v.paused) v.play().catch(() => {})
    else v.pause()
  }

  function stop() { const v = videoRef.current; v.pause(); v.currentTime = 0 }
  function seek(t) { const v = videoRef.current; v.currentTime = clamp(t, 0, v.duration || 0) }
  function seekBy(d) { seek(videoRef.current.currentTime + d) }
  function changeVolume(d) { setMuted(false); setVolume((x) => clamp(Math.round((x + d) * 100) / 100, 0, 1)) }
  function stepRate(dir) {
    const i = RATES.indexOf(latest.current.rate)
    setRate(RATES[clamp((i < 0 ? 2 : i) + dir, 0, RATES.length - 1)])
  }
  function toggleFullscreen() {
    if (document.fullscreenElement) document.exitFullscreen()
    else if (areaRef.current) areaRef.current.requestFullscreen().catch(() => {})
  }

  function removeAt(i) {
    const { queue: q, index: idx, playing: p } = latest.current
    const nq = q.filter((_, k) => k !== i)
    let ni = idx
    if (i < idx) ni = idx - 1
    else if (i === idx) { ni = Math.min(idx, nq.length - 1); autoplayRef.current = p && nq.length > 0 }
    setQueue(nq)
    setIndex(nq.length ? ni : -1)
  }
  function clearQueue() { setQueue([]); setIndex(-1) }
  function reorder(from, to) {
    if (from === to) return
    const { queue: q, index: idx } = latest.current
    const nq = [...q]
    const [m] = nq.splice(from, 1)
    nq.splice(to, 0, m)
    let ni = idx
    if (idx === from) ni = to
    else if (from < idx && to >= idx) ni = idx - 1
    else if (from > idx && to <= idx) ni = idx + 1
    setQueue(nq)
    setIndex(ni)
  }

  async function openFiles() { enqueue(await window.oplay.openFiles(), { replace: true }) }
  async function openFolder() { enqueue(await window.oplay.openFolder(), { replace: true }) }
  async function addFiles() { enqueue(await window.oplay.openFiles(), { play: latest.current.queue.length === 0 }) }
  async function addFolder() { enqueue(await window.oplay.openFolder(), { play: latest.current.queue.length === 0 }) }
  async function loadSubtitleFile() { const s = await window.oplay.openSubtitle(); if (s) setSub(s.name, s.text) }
  async function handleDropped(paths) {
    const subs = paths.filter(isSubtitle)
    const rest = paths.filter((p) => !isSubtitle(p))
    if (subs.length) { const s = await window.oplay.readSubtitle(subs[0]); if (s) setSub(s.name, s.text) }
    if (rest.length) { const media = await window.oplay.expandPaths(rest); if (media.length) enqueue(media) }
  }

  const setEqPreset = (name) => setEq({ preset: name, gains: [...EQ_PRESETS[name]] })
  const setEqBand = (i, g) => setEq((e) => ({ preset: 'Custom', gains: e.gains.map((x, k) => (k === i ? g : x)) }))
  const cycleLoop = () => setLoop((l) => (l === 'off' ? 'all' : l === 'all' ? 'one' : 'off'))

  act.current = { ensureGraph, goNext, goPrev, enqueue }

  const value = {
    videoRef, areaRef, graphRef,
    queue, index, current, playing, kind, volume, muted, rate, loop, shuffle, eq, subtitle, error, isFullscreen, adaptiveVolume, adaptiveLight, adaptiveLightLevel,
    playIndex: requestPlay, goNext, goPrev, togglePlay, stop, seek, seekBy, changeVolume, stepRate, toggleFullscreen,
    setVolume, setMuted, setRate, cycleLoop, setShuffle, setAdaptiveVolume, setAdaptiveLight,
    toggleMute: () => setMuted((m) => !m),
    toggleShuffle: () => setShuffle((s) => !s),
    enqueue, removeAt, clearQueue, reorder,
    openFiles, openFolder, addFiles, addFolder, loadSubtitleFile, clearSubtitle: () => setSub(null), handleDropped,
    setEqPreset, setEqBand
  }

  return (
    <PlayerCtx.Provider value={value}>
      <TimeProvider videoRef={videoRef}>{children}</TimeProvider>
    </PlayerCtx.Provider>
  )
}
