Init(document.getElementById('demo-content'))

async function PlaySound(audioContext, audioBuffer, output, offset = 0) {
  const source = audioContext.createBufferSource();
  source.buffer = audioBuffer;
  source.connect(output);
  source.start(audioContext.currentTime + offset);
}

async function LoadSound(audioContext, url) {
  const buffer = await fetch(url)
    .then(res => res.arrayBuffer())
    .then(ArrayBuffer => audioContext.decodeAudioData(ArrayBuffer));
  return buffer
}



async function Init(rootElement) {
  const canvas = rootElement.querySelector('canvas')
  const ctx = canvas.getContext('2d')
  const state = {
    nextPlay: 0
  }


  canvas.addEventListener('mousedown', async () => {
    if (!state.audioContext) {
      state.audioContext = new (window.AudioContext || window.webkitAudioContext)();
      state.sound = await LoadSound(state.audioContext, './click.wav')
      state.analyser = state.audioContext.createAnalyser();
      state.analyser.connect(state.audioContext.destination)

      state.bufferLength = state.analyser.frequencyBinCount;
      state.dataArray = new Uint8Array(state.bufferLength);
    }
    state.down = true
  })

  canvas.addEventListener('mouseup', async () => {
    state.down = false
  })

  function Frame() {
    ctx.fillStyle = "#222";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (state.audioContext) {
      const now = state.audioContext.currentTime
      if (state.down && state.nextPlay < now) {
        PlaySound(state.audioContext, state.sound, state.analyser, 0)
        state.nextPlay = now + Math.random() * Math.random()
      }

      if (state.analyser) {
        state.analyser.getByteTimeDomainData(state.dataArray);


        ctx.lineWidth = 2;
        ctx.strokeStyle = "rgb(157, 230, 78)"

        ctx.beginPath();

        const sliceWidth = (canvas.width * 1.0) / state.bufferLength;
        let x = 0;

        for (let i = 0; i < state.bufferLength; i++) {
          const v = state.dataArray[i] / 128.0;
          const y = (v * canvas.height) / 2;

          if (i === 0) {
            ctx.moveTo(x, y);
          } else {
            ctx.lineTo(x, y);
          }

          x += sliceWidth;
        }

        ctx.lineTo(canvas.width, canvas.height / 2);
        ctx.stroke();
      }


    }
    requestAnimationFrame(Frame)
  }

  requestAnimationFrame(Frame)


  // const oscillator = audioCtx.createOscillator();
  // oscillator.type = "square";
  // oscillator.frequency.setValueAtTime(440, audioCtx.currentTime); // value in hertz
  // oscillator.connect(audioCtx.destination);
  // oscillator.start();

}