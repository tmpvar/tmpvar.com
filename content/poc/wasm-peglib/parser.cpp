// compile with:
// emcc -O2 --std=c++20 parser.cpp -s EXPORT_ES6=1 -lembind -o build/parser.js
#include <emscripten/bind.h>
#include <format>
#include "peglib.h"

using namespace emscripten;

std::string Parse(std::string source) {
  // (2) Make a parser
  peg::parser parser(R"(
        # Grammar for Calculator...
        Additive    <- Multiplicative '+' Additive / Multiplicative
        Multiplicative   <- Primary '*' Multiplicative^cond / Primary
        Primary     <- '(' Additive ')' / Number
        Number      <- < [0-9]+ >
        %whitespace <- [ \t]*
        cond <- '' { error_message "missing multiplicative" }
    )");

  if (static_cast<bool>(parser) != true) {
    return std::string("failed to parse grammar");
  }

  // (3) Setup actions
  parser["Additive"] = [](const peg::SemanticValues &vs) {
    switch (vs.choice()) {
    case 0: // "Multiplicative '+' Additive"
      return any_cast<int>(vs[0]) + any_cast<int>(vs[1]);
    default: // "Multiplicative"
      return any_cast<int>(vs[0]);
    }
  };

  parser["Multiplicative"] = [](const peg::SemanticValues &vs) {
    switch (vs.choice()) {
    case 0: // "Primary '*' Multiplicative"
      return any_cast<int>(vs[0]) * any_cast<int>(vs[1]);
    default: // "Primary"
      return any_cast<int>(vs[0]);
    }
  };

  parser["Number"] = [](const peg::SemanticValues &vs) {
    return vs.token_to_number<int>();
  };

  // (4) Parse
  parser.enable_packrat_parsing(); // Enable packrat parsing.

  int val = 0;
  auto ret = parser.parse(source, val);
  if (ret == true) {
    return std::format("{}", val);
  }
  return std::format("failed to parse: '{}'", source);
}

EMSCRIPTEN_BINDINGS(peglib) {
  function("Parse", &Parse);
}
