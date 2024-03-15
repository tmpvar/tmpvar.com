Init(document.getElementById('fill-me-with-greebles-please'))

function Init(svg) {
  const TAU = Math.PI * 2.0
  function $(el) {
    return {
      addTo(parent) {
        if (Array.isArray(el)) {
          el.forEach(e => parent.appendChild(e))
        }
        return this
      }
    }
  }

  $.circle = function(x, y, r, color) {
    const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    c.setAttributeNS(null, 'cx', x)
    c.setAttributeNS(null, 'cy', y)
    c.setAttributeNS(null, 'r', r)
    c.setAttributeNS(null, 'fill', color || '#f0f')
    return c
  }

  $.pattern = function(shape, cb) {
    if (!Array.isArray(shape)) {
      const ret = []
      for (let i=0;i<shape;i++) {
        const r = cb(i/shape)
        if (r) ret.push(r)
      }
      return $(ret)
    }
  }

  $.pattern(1000, (ts) => {
    const centerx = 100
    const centery = 75
    const radius = 30 + Math.cos(ts * 10 * TAU) * 2
    const x = centerx + Math.sin(ts * TAU) * radius
    const y = centery + Math.cos(ts * TAU) * radius
    return $.circle(x, y, 1)
  }).addTo(svg)
}