import Module from './build/strings.js'

(async () => {
  const m = await Module();

  const outputEl = document.getElementById('output')
  function Log(content) {
    outputEl.innerText += content + '\n'
  }

  Log('lerp result: ' + m.lerp(1, 2, 0.5));
  Log(m.ReturnString(123));
  m.CallMeBack(1.5, (str) => {
    Log(`in CallMeBack cb "${str}"`)
  })

})();
