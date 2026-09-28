export const EQ_BANDS = [60, 170, 310, 600, 1000, 3000, 6000, 12000, 14000, 16000]

export const EQ_PRESETS = {
  Flat: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  'Bass boost': [6, 5, 4, 2, 0, 0, 0, 0, 0, 0],
  'Treble boost': [0, 0, 0, 0, 0, 1, 3, 5, 6, 6],
  Vocal: [-2, -2, -1, 1, 3, 3, 2, 0, -1, -2],
  Rock: [5, 4, 2, -1, -2, -1, 2, 4, 5, 5],
  Pop: [-1, 2, 4, 4, 2, 0, -1, -1, 1, 1],
  Classical: [4, 3, 2, 1, 0, 0, 0, 1, 2, 3],
  Night: [3, 2, 1, 0, -1, -1, -2, -3, -3, -4]
}

// source -> preamp -> 10 EQ filters -> analyser (visualizer) -> speakers
export function createAudioGraph(mediaEl) {
  const Ctx = window.AudioContext || window.webkitAudioContext
  const ctx = new Ctx()
  const source = ctx.createMediaElementSource(mediaEl)
  const preamp = ctx.createGain()
  const filters = EQ_BANDS.map((f, i) => {
    const b = ctx.createBiquadFilter()
    b.type = i === 0 ? 'lowshelf' : i === EQ_BANDS.length - 1 ? 'highshelf' : 'peaking'
    b.frequency.value = f
    b.Q.value = 1.1
    b.gain.value = 0
    return b
  })
  const analyser = ctx.createAnalyser()
  analyser.fftSize = 256
  analyser.smoothingTimeConstant = 0.8

  source.connect(preamp)
  let node = preamp
  filters.forEach((f) => { node.connect(f); node = f })
  node.connect(analyser)
  analyser.connect(ctx.destination)
  return { ctx, filters, analyser, preamp }
}
