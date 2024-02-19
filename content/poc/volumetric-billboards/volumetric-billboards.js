Init(document.getElementById('volumetric-billboards-content'))

function CreateDataStore(name) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name, 3);
    request.onupgradeneeded = function (e) {
      const db = e.target.result
      db.createObjectStore("models", { keyPath: "vox" });
      resolve(db)
    }
    request.onsuccess = function (e) {
      console.log(e)
      resolve(e.target.result)
    }
    request.onerror = reject
  })
}

function LoadVox(arrayBuffer) {
  const view = new DataView(arrayBuffer)
  let offset = 0
  function ReadHeader() {
    return String.fromCharCode(view.getInt8(offset++), view.getInt8(offset++), view.getInt8(offset++), view.getInt8(offset++))
  }

  function ReadI32() {
    let result = view.getInt32(offset, true)
    offset += 4
    return result
  }

  function ReadU8() {
    return view.getUint8(offset++, true)
  }

  if (ReadHeader() !== 'VOX ') {
    console.warn("invalid vox header")
    return
  }

  const version = ReadI32()

  if (ReadHeader() !== 'MAIN') {
    console.warn("no main")
    return
  }

  ReadI32()
  ReadI32()

  let currentModel;

  while (offset < view.byteLength) {
    const chunkID = ReadHeader()
    switch (chunkID) {
      case 'SIZE': {
        ReadI32()
        ReadI32()
        const dims = [ReadI32(), ReadI32(), ReadI32()]
        console.log(dims)
        currentModel = {
          dims,
          volume: new Uint8Array(dims[0] * dims[1] * dims[2]),
          palette: new Uint8Array(4 * 256)
        }

        break;
      }

      case 'XYZI': {
        ReadI32()
        ReadI32()
        const TotalVoxels = ReadI32()
        const DimsX = currentModel.dims[0]
        const DimsXTimesY = DimsX * currentModel.dims[1]
        for (let i = 0; i < TotalVoxels; i++) {
          let x = ReadU8()
          let y = ReadU8()
          let z = ReadU8()
          let colorIndex = ReadU8()
          currentModel.volume[x + y * DimsX + z * DimsXTimesY] = colorIndex
        }

        break;
      }

      case 'RGBA': {
        const expect = ReadI32() + offset + 4
        ReadI32()
        for (let i = 0; i < 256; i++) {
          currentModel.palette[(i + 1) * 4 + 0] = ReadU8()
          currentModel.palette[(i + 1) * 4 + 1] = ReadU8()
          currentModel.palette[(i + 1) * 4 + 2] = ReadU8()
          currentModel.palette[(i + 1) * 4 + 3] = ReadU8()
        }

        if (expect !== offset) {
          console.error("expected offset does not match actual")
        }
        break;
      }
      default: {
        const skipBytes = ReadI32() + ReadI32()
        // console.warn('unhandled %s, skipping %s bytes', chunkID, skipBytes)
        offset += skipBytes
        break;
      }
    }
  }




}

async function Init(rootEl) {
  const canvas = rootEl.querySelector("canvas")
  const gl = canvas.getContext('webgl2')
  const state = {
    volumes: [],
    db: await CreateDataStore(rootEl.id)
  }

  // Load default model
  const request = await fetch("./assets/default.vox")
  const blob = await request.blob()
  const arrayBuffer = await blob.arrayBuffer()
  LoadVox(arrayBuffer)



  // create a volume texture
  {
    const volume = {
      dims: [128, 128, 128],
      occupancy: gl.createTexture(),
      material: gl.createTexture()
    }

    // setup occupancy
    gl.bindTexture(gl.TEXTURE_3D, volume.occupancy)
    gl.texImage3D(
      gl.TEXTURE_3D,
      0,
      gl.RED,
      volume.dims[0],
      volume.dims[1],
      volume.dims[2],
      0,
      gl.RED,
      gl.UNSIGNED_BYTE,
      0
    )

    // setup material
    gl.bindTexture(gl.TEXTURE_2D, volume.material)
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      256, // width
      4,   // height
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      0
    )

    state.volumes.push(volume)
  }
}
