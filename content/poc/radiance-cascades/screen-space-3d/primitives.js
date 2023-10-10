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