MarchingSquaresBegin(
  document.querySelector('#marching-squares-content')
)

function DashedLine(ctx, sx, sy, ex, ey, dashLen) {
  ctx.moveTo(sx, sy);

  var dX = ex - sx;
  var dY = ey - sy;
  var dashes = Math.floor(Math.sqrt(dX * dX + dY * dY) / dashLen);
  var dashX = dX / dashes;
  var dashY = dY / dashes;

  var q = 0;
  while (q++ < dashes) {
    sx += dashX;
    sy += dashY;
    ctx[q % 2 == 0 ? 'moveTo' : 'lineTo'](sx, sy);
  }
  ctx[q % 2 == 0 ? 'moveTo' : 'lineTo'](sx, sy);

  return ctx;
}

function ArrowLine(ctx, ax, ay, bx, by, padding, arrowLength, arrowWidth, dashLen) {
  let dx = ax - bx
  let dy = ay - by

  let l = Math.sqrt(dx * dx + dy * dy)
  dx /= l
  dy /= l

  ax -= dx * padding
  ay -= dy * padding
  bx += dx * padding
  by += dy * padding

  let ox = dx * arrowLength
  let oy = dy * arrowLength


  let sx = dy * arrowWidth
  let sy = dx * arrowWidth

  if (dashLen) {
    DashedLine(ctx, ax, ay, bx, by, dashLen)
  } else {
    ctx.moveTo(ax, ay)
    ctx.lineTo(bx, by)
  }

  ctx.moveTo(bx, by)

  ctx.lineTo(
    bx + ox + sx,
    by + oy - sy
  )

  ctx.lineTo(
    bx + ox - sx,
    by + oy + sy
  )

  ctx.lineTo(
    bx,
    by
  )
}

function MarchingSquaresBegin(rootEl) {
  const TAU = Math.PI * 2.0
  const canvas = rootEl.querySelector('canvas')
  const ctx = canvas.getContext('2d')

  if (ctx.reset == undefined) {
    ctx.reset = () => {
      let old = canvas.width
      canvas.width = 0
      canvas.width = old
    }
  }


  function RenderFrame() {
    ctx.reset()

    let gridWidth = 4
    let gridCellWidth = canvas.width / gridWidth
    let padding = gridCellWidth / 8
    let edgePadding = 8
    const fontSize = 20
    let cornerRadius = 16;
    ctx.strokeStyle = ""
    const corners = [[0, 0], [0, 0], [0, 0], [0, 0]]
    const edges = [[0, 0], [0, 0], [0, 0], [0, 0]]
    const edgeIndices = [[0, 1], [1, 2], [2, 3], [3, 0]]
    const edgeStates = [0, 0, 0, 0]


    const connections = [
      false,
      [0, 3],
      [1, 0],
      [1, 3],

      [2, 1],
      [[0, 1], [2, 3], [0, 3], [2, 1]],
      [2, 0],
      [2, 3],

      [3, 2],
      [0, 2],
      [[1, 0], [3, 2], [1, 2], [3, 0]],
      [1, 2],

      [3, 1],
      [0, 1],
      [3, 0],
      false
    ]

    for (let code = 0; code < 16; code++) {
      let cellCode = code.toString(2).padStart(4, '0')
      let y = Math.floor(code / gridWidth) * gridCellWidth
      let x = (code % gridWidth) * gridCellWidth
      let cellWidth = gridCellWidth - padding * 2
      let center = cellWidth * 0.5
      // ctx.strokeRect(x + padding, y + padding, cellWidth, cellWidth)

      corners[0][0] = x + padding + cornerRadius
      corners[0][1] = y + padding + cornerRadius
      corners[1][0] = x + padding + cellWidth - cornerRadius
      corners[1][1] = y + padding + cornerRadius
      corners[2][0] = x + padding + cellWidth - cornerRadius
      corners[2][1] = y + padding + cellWidth - cornerRadius
      corners[3][0] = x + padding + cornerRadius
      corners[3][1] = y + padding + cellWidth - cornerRadius

      for (let i = 0; i < 4; i++) {
        let indices = edgeIndices[i]
        edges[i][0] = (corners[indices[0]][0] + corners[indices[1]][0]) * 0.5
        edges[i][1] = (corners[indices[0]][1] + corners[indices[1]][1]) * 0.5

        let a = 1 << indices[0]
        let b = 1 << indices[1]
        edgeStates[i] = !!(code & a) != !!(code & b)
      }

      edges[1][0] = (corners[1][0] + corners[2][0]) * 0.5
      edges[1][1] = (corners[1][1] + corners[2][1]) * 0.5
      edges[2][0] = (corners[2][0] + corners[3][0]) * 0.5
      edges[2][1] = (corners[2][1] + corners[3][1]) * 0.5
      edges[3][0] = (corners[3][0] + corners[0][0]) * 0.5
      edges[3][1] = (corners[3][1] + corners[0][1]) * 0.5


      ctx.strokeStyle = "#b0a7b8"
      ctx.lineWidth = 2
      ctx.lineCap = 'round'
      ctx.beginPath()
      ctx.moveTo(corners[0][0], corners[0][1])

      ctx.moveTo(corners[0][0] + cornerRadius + edgePadding, corners[0][1])
      ctx.lineTo(corners[1][0] - cornerRadius - edgePadding, corners[1][1])

      ctx.moveTo(corners[1][0], corners[1][1] + cornerRadius + edgePadding)
      ctx.lineTo(corners[2][0], corners[2][1] - cornerRadius - edgePadding)

      ctx.moveTo(corners[2][0] - cornerRadius - edgePadding, corners[2][1])
      ctx.lineTo(corners[3][0] + cornerRadius + edgePadding, corners[3][1])

      ctx.moveTo(corners[3][0], corners[3][1] - cornerRadius - edgePadding)
      ctx.lineTo(corners[0][0], corners[0][1] + cornerRadius + edgePadding)

      ctx.stroke()

      for (let cornerIndex = 0; cornerIndex < 4; cornerIndex++) {
        let corner = corners[cornerIndex]
        ctx.beginPath()
        ctx.arc(corner[0], corner[1], cornerRadius, 0, TAU)
        if (code & (1 << cornerIndex)) {
          ctx.fillStyle = "#b0a7b8"
          ctx.fill()
        } else {
          ctx.stroke()
        }
      }

      // draw the corner
      if (0) {
        ctx.strokeStyle = "#5ab552"
        for (let edgeIndex = 0; edgeIndex < 4; edgeIndex++) {
          if (!edgeStates[edgeIndex]) {
            continue;
          }

          let edge = edges[edgeIndex]
          ctx.beginPath()
          ctx.arc(edge[0], edge[1], 2, 0, TAU)
          ctx.stroke()
        }
      }

      // draw the +/- in the corner
      {
        ctx.save()
        let symbolPadding = 8
        ctx.lineWidth = 4
        for (let cornerIndex = 0; cornerIndex < 4; cornerIndex++) {
          let corner = corners[cornerIndex]
          ctx.beginPath()
          ctx.moveTo(corner[0] - cornerRadius + symbolPadding, corner[1])
          ctx.lineTo(corner[0] + cornerRadius - symbolPadding, corner[1])
          ctx.strokeStyle = "#b0a7b8"
          if (code & (1 << cornerIndex)) {
            ctx.strokeStyle = "#111"
            ctx.moveTo(corner[0], corner[1] - cornerRadius + symbolPadding)
            ctx.lineTo(corner[0], corner[1] + cornerRadius - symbolPadding)
          } else {

          }
          ctx.stroke()
        }
        ctx.restore()
      }

      // draw the connections
      {
        if (connections[code]) {
          const angle = Math.PI * 0.25;
          const arrowLength = 10
          const arrowWidth = 3

          if (Array.isArray(connections[code][0])) {
            connections[code].forEach((pair, i) => {
              ctx.beginPath()
              let color = i < 2 ? '#5ab552' : '#3388de'

              ctx.strokeStyle = color
              ctx.fillStyle = color

              ArrowLine(
                ctx,
                edges[pair[0]][0],
                edges[pair[0]][1],
                edges[pair[1]][0],
                edges[pair[1]][1],
                edgePadding * 2.0,
                arrowLength,
                arrowWidth,
                8
              )

              ctx.stroke()
              ctx.fill()
            })


            // draw a question mark
            {
              ctx.fillStyle = '#b0a7b8'
              ctx.beginPath()
              ctx.arc(x + gridCellWidth * 0.5, y + gridCellWidth * 0.5, cornerRadius, 0, TAU)
              ctx.fill()
            }


            // draw a question mark
            {
              ctx.fillStyle = '#111'
              let textHeight = 28
              ctx.font = `${textHeight}px Hack,monospace`
              let text = '?'
              let textWidth = ctx.measureText(text).width
              ctx.fillText(
                text,
                x + gridCellWidth * 0.5 - textWidth * 0.5,
                y + gridCellWidth * 0.5 + textHeight * 0.35
              )
            }

          } else {
            ctx.beginPath()
            ctx.strokeStyle = "#5ab552"
            ctx.fillStyle = "#5ab552"
            let pair = connections[code]
            ArrowLine(
              ctx,
              edges[pair[0]][0],
              edges[pair[0]][1],
              edges[pair[1]][0],
              edges[pair[1]][1],
              edgePadding * 2.0,
              arrowLength,
              arrowWidth,
              0
            )
            ctx.stroke()
            ctx.fill()
          }
        }
      }

      ctx.fillStyle = "#fff"
      ctx.font = `${fontSize}px Hack, monospace`
      // add the cell binary code
      {
        let textWidth = ctx.measureText(cellCode).width
        ctx.fillText(
          cellCode,
          x + gridCellWidth * 0.5 - textWidth * 0.5,
          y + padding + cornerRadius - fontSize * 0.5
        )
      }

      // add the cell index
      {
        let textWidth = ctx.measureText(code).width

        ctx.fillText(
          code,
          x + gridCellWidth * 0.5 - textWidth * 0.5,
          y + gridCellWidth - cornerRadius * 0.5 - padding + fontSize
        )
      }
      // ctx.beginPath()
      // ctx.arc(x + x + gridCellWidth * 0.5, y + x + gridCellWidth * 0.5, 10, 0, TAU)
      // ctx.fill()

    }

  }

  requestAnimationFrame(RenderFrame)

}