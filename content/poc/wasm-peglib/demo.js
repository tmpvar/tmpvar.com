import Module from './build/parser.js'

(async () => {
  const m = await Module();

  const outputEl = document.getElementById('output')
  const inputEl = document.getElementById('string-to-parse')
  inputEl.addEventListener('keyup', (e) => {
    outputEl.innerText = m.Parse(e.target.value)
  })

  outputEl.innerText = m.Parse(inputEl.getAttribute('value'))
})();
