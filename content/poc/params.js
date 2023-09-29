export default function CreateParamReader(controlEl) {
  return function Param(paramName, paramType, cb) {
    let selector = `.${paramName}-control`
    let parentEl = controlEl.querySelector(selector)
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
      value = cb(parentEl, value)
    }

    if (state.params[paramName] != value) {
      state.params[paramName] = value
      state.dirty = true
      return true
    }
    return false
  };
}