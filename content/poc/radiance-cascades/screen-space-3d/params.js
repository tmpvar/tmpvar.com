export default function CreateParamReader(state, controlEl) {
  return function Param(paramName, paramType, cb) {
    let selector = `.${paramName}-control`
    let parentEl = controlEl.querySelector(selector)
    if (!parentEl) {
      console.warn("could not locate '%s'", selector)
      return false
    }

    let el = parentEl.querySelector(['input', 'select'])
    if (!el) {
      console.warn("could not locate '%s input'", selector)
      return false
    }

    let value = 0;
    switch (el.type) {
      case 'checkbox': {
        if (el.checked) {
          value = el.value
        }
        break;
      }
      default: {
        value = el.value;
        break;
      }
    }

    switch (paramType) {
      case 'f32': {
        value = parseFloat(value);
        break;
      }
      case 'i32': {
        value = parseFloat(value) | 0;
        break;
      }
      case 'bool': {
        value = !!parseFloat(value) ? 1 : 0;
        break;
      }
      case 'color': {
        value = ParseColor(value)
        break;
      }
    }

    if (cb) {
      value = cb(parentEl, value, state.params[paramName])
    }

    if (state.params[paramName] != value) {
      if (el.type == 'checkbox' || el.type == 'select-one') {
        controlEl.querySelectorAll(
          `.disabledBy-${paramName} input, .disabledBy-${paramName} select`
        ).forEach(el => {
          el.disabled = !!value
        });
        controlEl.querySelectorAll(
          `.enabledBy-${paramName} input, .enabledBy-${paramName} select`
        ).forEach(el => {
          el.disabled = !value
        });

        controlEl.querySelectorAll(`.hiddenBy-${paramName} `).forEach(el => {

          el.style.display = value ? 'none' : 'block'
        });

        controlEl.querySelectorAll(`.shownBy-${paramName}`).forEach(el => {
          let requiredValue = el.getAttribute('showValue')
          if (!value) {
            el.style.display = 'none'
          } else {
            if (!requiredValue) {
              el.style.display = !value ? 'none' : 'block'
            } else {
              el.style.display = requiredValue == value ? 'block' : 'none'
            }
          }
        });
      }

      if (!cb) {
        let outputEl = parentEl.querySelector('output')
        if (outputEl) {
          outputEl.innerHTML = `${value}`
        }
      }

      state.params[paramName] = value
      state.dirty = true
      return true
    }
    return false
  };
}