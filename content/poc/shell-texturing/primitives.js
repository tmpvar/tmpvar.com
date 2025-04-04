import GenerateIcosphere from "./icosphere-fast.js"

function ComputeUVs(positions) {
  let triangleCount = positions.length / 9;
  let dims = Math.sqrt(triangleCount)

  console.log(1.0 / (dims * 0.5), triangleCount);

  let uvs = new Float32Array((positions.length / 3) * 2)
  let triangle = 0
  for (let i = 0; i < positions.length; i += 3) {
    if ((i % 9) == 0) {
      triangle++;
    }

    uvs[0]
  }

}

export function CreatePlane(gpu) {
  const labelPrefix = `${gpu.labelPrefix}Primitive/Plane/`

  let positions = new Float32Array([
    1, -1, 0,
    -1, -1, 0,
    -1, 1, 0,

    1, 1, 0,
    1, -1, 0,
    -1, 1, 0,
  ])


  let normals = new Float32Array([
    0, 0, -1,
    0, 0, -1,
    0, 0, -1,

    0, 0, -1,
    0, 0, -1,
    0, 0, -1,
  ])

  let uvs = new Float32Array([
    1, 0,
    0, 0,
    0, 1,

    1, 1,
    1, 0,
    0, 1,
  ])

  const mesh = {
    label: labelPrefix,
    vertexCount: positions.length / 3,
    positions: positions,
    normals: normals,
    uvs: uvs,
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

  mesh.uvBuffer = gpu.device.createBuffer({
    label: `${labelPrefix}UVBuffer`,
    size: uvs.byteLength,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST
  })

  gpu.device.queue.writeBuffer(mesh.positionBuffer, 0, mesh.positions)
  gpu.device.queue.writeBuffer(mesh.normalBuffer, 0, mesh.normals)
  gpu.device.queue.writeBuffer(mesh.uvBuffer, 0, mesh.uvs)

  return mesh
}

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


  let normals = new Float32Array(positions.length)
  function Length(x, y, z) {
    return Math.sqrt(x * x + y * y * z * z);
  }

  for (let i = 0; i < positions.length; i += 3) {
    let x = positions[i + 0]
    let y = positions[i + 1]
    let z = positions[i + 2]

    let l = Length(x, y, z)

    normals[i + 0] = x / l;
    normals[i + 1] = y / l;
    normals[i + 2] = z / l;
  }

  //   0  1  2  3  4
  // 0    [^]
  // 1 [F][R][B][L]
  // 2    [v]
  // 3

  let uvs = new Float32Array(([
    // front [0, 1] -> [1, 2]
    0, 1,
    1, 1,
    0, 2,

    1, 1,
    1, 2,
    0, 2,

    // back [2, 1] -> [3, 2]
    3, 1,
    2, 1,
    2, 2,

    3, 2,
    3, 1,
    2, 2,

    // top [1, 0] -> [2, 1]
    1, 0,
    2, 0,
    1, 1,

    2, 0,
    2, 1,
    1, 1,

    // bottom [1, 2] -> [2, 3]
    2, 2,
    1, 2,
    1, 3,

    2, 3,
    2, 2,
    1, 3,

    // left [3,1] -> [4,2]
    3, 1,
    4, 1,
    3, 2,

    4, 1,
    4, 2,
    3, 2,

    // right [1,1] -> [2,2]
    2, 1,
    1, 1,
    1, 2,

    2, 2,
    2, 1,
    1, 2,

  ]).map(v => v * 0.25))

  const mesh = {
    label: labelPrefix,
    vertexCount: positions.length / 3,
    positions: positions,
    normals: normals,
    uvs,
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

  mesh.uvBuffer = gpu.device.createBuffer({
    label: `${labelPrefix}UVBuffer`,
    size: uvs.byteLength,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST
  })

  gpu.device.queue.writeBuffer(mesh.positionBuffer, 0, mesh.positions)
  gpu.device.queue.writeBuffer(mesh.normalBuffer, 0, mesh.normals)
  gpu.device.queue.writeBuffer(mesh.uvBuffer, 0, mesh.uvs)

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
