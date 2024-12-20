import GenerateIcosphere from "./icosphere-fast.js"

export function CreateCube(gpu) {
  const labelPrefix = `${gpu.labelPrefix}Primitive/Cube/`

  let positions = new Float32Array([
    // front
    -1, -1, -1,
    1, -1, -1,
    -1, 1, -1,

    1, -1, -1,
    1, 1, -1,
    -1, 1, -1,

    // back
    1, -1, 1,
    -1, -1, 1,
    -1, 1, 1,

    1, 1, 1,
    1, -1, 1,
    -1, 1, 1,

    // top
    -1, 1, -1,
    1, 1, -1,
    -1, 1, 1,

    1, 1, -1,
    1, 1, 1,
    -1, 1, 1,

    // bottom
    1, -1, -1,
    -1, -1, -1,
    -1, -1, 1,

    1, -1, 1,
    1, -1, -1,
    -1, -1, 1,

    // left
    -1, -1, -1,
    -1, 1, -1,
    -1, -1, 1,

    -1, 1, -1,
    -1, 1, 1,
    -1, -1, 1,

    // right
    1, 1, -1,
    1, -1, -1,
    1, -1, 1,

    1, 1, 1,
    1, 1, -1,
    1, -1, 1,


  ])


  let normals = new Float32Array([
    // front
    0, 0, -1,
    0, 0, -1,
    0, 0, -1,

    0, 0, -1,
    0, 0, -1,
    0, 0, -1,

    // back
    0, 0, 1,
    0, 0, 1,
    0, 0, 1,

    0, 0, 1,
    0, 0, 1,
    0, 0, 1,

    // top
    0, 1, 0,
    0, 1, 0,
    0, 1, 0,

    0, 1, 0,
    0, 1, 0,
    0, 1, 0,

    // bottom
    0, -1, 0,
    0, -1, 0,
    0, -1, 0,

    0, -1, 0,
    0, -1, 0,
    0, -1, 0,

    // left
    -1, 0, 0,
    -1, 0, 0,
    -1, 0, 0,

    -1, 0, 0,
    -1, 0, 0,
    -1, 0, 0,

    // right
    1, 0, 0,
    1, 0, 0,
    1, 0, 0,

    1, 0, 0,
    1, 0, 0,
    1, 0, 0,
  ])

  const mesh = {
    label: labelPrefix,
    vertexCount: positions.length / 3,
    positions: positions,
    normals: normals,
  }

  mesh.positionBuffer = gpu.device.createBuffer({
    label: `${labelPrefix}PositionBuffer`,
    size: positions.byteLength,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST
  })

  mesh.normalBuffer = gpu.device.createBuffer({
    label: `${labelPrefix}NormalBuffer`,
    size: normals.byteLength,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST
  })

  gpu.device.queue.writeBuffer(mesh.positionBuffer, 0, mesh.positions)
  gpu.device.queue.writeBuffer(mesh.normalBuffer, 0, mesh.normals)

  return mesh
}

export function CreateSphere(gpu, subdivisions) {
  const labelPrefix = `${gpu.label}Primitive/Sphere`
  const sphere = GenerateIcosphere(subdivisions)

  let positions = new Float32Array(sphere.cells.length * 3 * 3)
  let normals = new Float32Array(sphere.cells.length * 3 * 3)

  // build soup out of cells / positions
  sphere.cells.forEach((cell, i) => {
    cell.forEach((vertIndex, j) => {
      let a = sphere.positions[vertIndex][0]
      let b = sphere.positions[vertIndex][1]
      let c = sphere.positions[vertIndex][2]

      let l = Math.sqrt(a * a + b * b + c * c)

      let outIndex = i * 9 + j * 3

      positions[outIndex + 1] = a
      positions[outIndex + 0] = b
      positions[outIndex + 2] = c

      normals[outIndex + 1] = a / l
      normals[outIndex + 0] = b / l
      normals[outIndex + 2] = c / l
    })
  })

  const mesh = {
    label: labelPrefix,
    vertexCount: positions.length / 3,
    positions: positions,
    normals: normals,
  }

  mesh.positionBuffer = gpu.device.createBuffer({
    label: `${labelPrefix}PositionBuffer`,
    size: positions.byteLength,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST
  })

  mesh.normalBuffer = gpu.device.createBuffer({
    label: `${labelPrefix}NormalBuffer`,
    size: normals.byteLength,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST
  })

  gpu.device.queue.writeBuffer(mesh.positionBuffer, 0, mesh.positions)
  gpu.device.queue.writeBuffer(mesh.normalBuffer, 0, mesh.normals)

  return mesh
}