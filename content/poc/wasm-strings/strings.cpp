// compile with: emcc -O2 --std=c++20 strings.cpp -s EXPORT_ES6=1 -lembind
#include <emscripten/bind.h>
#include <format>
#include <string>

using namespace emscripten;

float lerp(float a, float b, float t) {
  return (1 - t) * a + t * b;
}

std::string ReturnString(int value) {
  return std::format("whee value:{}", value);
}

EMSCRIPTEN_DECLARE_VAL_TYPE(CallbackType);

void CallMeBack(float value, CallbackType cb) {
  cb(std::format("callback time value:{}", value));
}

EMSCRIPTEN_BINDINGS(my_module) {
  function("lerp", &lerp);
  function("ReturnString", &ReturnString);
  function("CallMeBack", &CallMeBack);
  register_type<CallbackType>("(message: string) => void");
}
