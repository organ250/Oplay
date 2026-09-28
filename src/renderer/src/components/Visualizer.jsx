import { useEffect, useRef } from 'react'
import { usePlayer } from '../state/PlayerContext'

const BARS = 44

export default function Visualizer() {
  const { graphRef } = usePlayer()
  const canvasRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const g = canvas.getContext('2d')
    const levels = new Array(BARS).fill(0)
    let data = null
    let raf

    const draw = () => {
      raf = requestAnimationFrame(draw)
      const dpr = window.devicePixelRatio || 1
      const w = canvas.clientWidth, h = canvas.clientHeight
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
        canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr)
      }
      g.setTransform(dpr, 0, 0, dpr, 0, 0)
      g.clearRect(0, 0, w, h)

      const an = graphRef.current && graphRef.current.analyser
      if (an) {
        if (!data) data = new Uint8Array(an.frequencyBinCount)
        an.getByteFrequencyData(data)
      }
      const grad = g.createLinearGradient(0, 0, w, 0)
      grad.addColorStop(0, '#2ee6c5'); grad.addColorStop(1, '#2f7bff')
      g.fillStyle = grad

      const gap = 5, bw = (w - gap * (BARS - 1)) / BARS
      for (let i = 0; i < BARS; i++) {
        const v = data ? data[Math.floor((i * data.length * 0.72) / BARS)] / 255 : 0
        levels[i] = Math.max(v, levels[i] * 0.9)
        const bh = 4 + levels[i] * (h - 8)
        g.beginPath()
        g.roundRect(i * (bw + gap), (h - bh) / 2, bw, bh, Math.min(bw / 2, 4))
        g.fill()
      }
    }
    draw()
    return () => cancelAnimationFrame(raf)
  }, [graphRef])

  return <canvas ref={canvasRef} className="viz" />
}
