/*
  Graphical Terminal Utilities
    draw interactive bitmap graphics on terminals that support the Kitty
    Terminal Graphics Protocol
    see: https://sw.kovidgoyal.net/kitty/graphics-protocol/

  All functions are defined as static so you might get some code bloat but don't
  have to set any special defines to get the functionality.

  NOTE: This is built with the idea that keyboard inputs are used to control the
        graphical representation, not necessarily input text. If you would like
        to use this for textual input, you'll probably have to add some bits to
        the parser to extract the textual representation from keyboard events
        see: https://sw.kovidgoyal.net/kitty/keyboard-protocol/#progressive-enhancement

  LICENSE: MIT, see the bottom of this file
  SEE: https://tmpvar.com/articles/rendering-interactive-graphics-in-kitty/
*/

#ifndef _GRAPHICAL_TERM_UTIL_H
#define _GRAPHICAL_TERM_UTIL_H

#include <errno.h>
#include <fcntl.h>
#include <poll.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/ioctl.h>
#include <sys/mman.h>
#include <termios.h>
#include <unistd.h>

// clang-format off
enum GraphicsTermKeyCode {
  // Functional Keys
  GTKEY_FUNCTIONAL_KEYS_START = (1<<14),
  GTKEY_ESCAPE = GTKEY_FUNCTIONAL_KEYS_START, GTKEY_ENTER, GTKEY_TAB, GTKEY_BACKSPACE, GTKEY_INSERT, GTKEY_DELETE,
  GTKEY_LEFT, GTKEY_RIGHT, GTKEY_UP, GTKEY_DOWN, GTKEY_PAGE_UP, GTKEY_PAGE_DOWN,
  GTKEY_HOME, GTKEY_END, GTKEY_CAPS_LOCK, GTKEY_SCROLL_LOCK, GTKEY_NUM_LOCK,
  GTKEY_PRINT_SCREEN, GTKEY_PAUSE, GTKEY_MENU, GTKEY_F1, GTKEY_F2, GTKEY_F3,
  GTKEY_F4, GTKEY_F5, GTKEY_F6, GTKEY_F7, GTKEY_F8, GTKEY_F9, GTKEY_F10, GTKEY_F11,
  GTKEY_F12, GTKEY_F13, GTKEY_F14, GTKEY_F15, GTKEY_F16, GTKEY_F17, GTKEY_F18,
  GTKEY_F19, GTKEY_F20, GTKEY_F21, GTKEY_F22, GTKEY_F23, GTKEY_F24, GTKEY_F25,
  GTKEY_F26, GTKEY_F27, GTKEY_F28, GTKEY_F29, GTKEY_F30, GTKEY_F31, GTKEY_F32,
  GTKEY_F33, GTKEY_F34, GTKEY_F35, GTKEY_KP_0, GTKEY_KP_1, GTKEY_KP_2, GTKEY_KP_3,
  GTKEY_KP_4, GTKEY_KP_5, GTKEY_KP_6, GTKEY_KP_7, GTKEY_KP_8, GTKEY_KP_9,
  GTKEY_KP_DECIMAL, GTKEY_KP_DIVIDE, GTKEY_KP_MULTIPLY, GTKEY_KP_SUBTRACT,
  GTKEY_KP_ADD, GTKEY_KP_ENTER, GTKEY_KP_EQUAL, GTKEY_KP_SEPARATOR, GTKEY_KP_LEFT,
  GTKEY_KP_RIGHT, GTKEY_KP_UP, GTKEY_KP_DOWN, GTKEY_KP_PAGE_UP, GTKEY_KP_PAGE_DOWN,
  GTKEY_KP_HOME, GTKEY_KP_END, GTKEY_KP_INSERT, GTKEY_KP_DELETE, GTKEY_KP_BEGIN,
  GTKEY_MEDIA_PLAY, GTKEY_MEDIA_PAUSE, GTKEY_MEDIA_PLAY_PAUSE, GTKEY_MEDIA_REVERSE,
  GTKEY_MEDIA_STOP, GTKEY_MEDIA_FAST_FORWARD, GTKEY_MEDIA_REWIND, GTKEY_MEDIA_TRACK_NEXT,
  GTKEY_MEDIA_TRACK_PREVIOUS, GTKEY_MEDIA_RECORD, GTKEY_LOWER_VOLUME, GTKEY_RAISE_VOLUME,
  GTKEY_MUTE_VOLUME, GTKEY_LEFT_SHIFT, GTKEY_LEFT_CONTROL, GTKEY_LEFT_ALT, GTKEY_LEFT_SUPER,
  GTKEY_LEFT_HYPER, GTKEY_LEFT_META, GTKEY_RIGHT_SHIFT, GTKEY_RIGHT_CONTROL, GTKEY_RIGHT_ALT,
  GTKEY_RIGHT_SUPER, GTKEY_RIGHT_HYPER, GTKEY_RIGHT_META, GTKEY_ISO_LEVEL3_SHIFT,
  GTKEY_ISO_LEVEL5_SHIFT
};

static const char *GraphicsTermKeyNames[] = {
  // Functional Keys
 "GTKEY_ESCAPE ", "GTKEY_ENTER ", "GTKEY_TAB ", "GTKEY_BACKSPACE ", "GTKEY_INSERT ", "GTKEY_DELETE ",
 "GTKEY_LEFT ", "GTKEY_RIGHT ", "GTKEY_UP ", "GTKEY_DOWN ", "GTKEY_PAGE_UP ", "GTKEY_PAGE_DOWN ",
 "GTKEY_HOME ", "GTKEY_END ", "GTKEY_CAPS_LOCK ", "GTKEY_SCROLL_LOCK ", "GTKEY_NUM_LOCK ",
 "GTKEY_PRINT_SCREEN ", "GTKEY_PAUSE ", "GTKEY_MENU ", "GTKEY_F1 ", "GTKEY_F2 ", "GTKEY_F3 ",
 "GTKEY_F4 ", "GTKEY_F5 ", "GTKEY_F6 ", "GTKEY_F7 ", "GTKEY_F8 ", "GTKEY_F9 ", "GTKEY_F10 ", "GTKEY_F11 ",
 "GTKEY_F12 ", "GTKEY_F13 ", "GTKEY_F14 ", "GTKEY_F15 ", "GTKEY_F16 ", "GTKEY_F17 ", "GTKEY_F18 ",
 "GTKEY_F19 ", "GTKEY_F20 ", "GTKEY_F21 ", "GTKEY_F22 ", "GTKEY_F23 ", "GTKEY_F24 ", "GTKEY_F25 ",
 "GTKEY_F26 ", "GTKEY_F27 ", "GTKEY_F28 ", "GTKEY_F29 ", "GTKEY_F30 ", "GTKEY_F31 ", "GTKEY_F32 ",
 "GTKEY_F33 ", "GTKEY_F34 ", "GTKEY_F35 ", "GTKEY_KP_0 ", "GTKEY_KP_1 ", "GTKEY_KP_2 ", "GTKEY_KP_3 ",
 "GTKEY_KP_4 ", "GTKEY_KP_5 ", "GTKEY_KP_6 ", "GTKEY_KP_7 ", "GTKEY_KP_8 ", "GTKEY_KP_9 ",
 "GTKEY_KP_DECIMAL ", "GTKEY_KP_DIVIDE ", "GTKEY_KP_MULTIPLY ", "GTKEY_KP_SUBTRACT ",
 "GTKEY_KP_ADD ", "GTKEY_KP_ENTER ", "GTKEY_KP_EQUAL ", "GTKEY_KP_SEPARATOR ", "GTKEY_KP_LEFT ",
 "GTKEY_KP_RIGHT ", "GTKEY_KP_UP ", "GTKEY_KP_DOWN ", "GTKEY_KP_PAGE_UP ", "GTKEY_KP_PAGE_DOWN ",
 "GTKEY_KP_HOME ", "GTKEY_KP_END ", "GTKEY_KP_INSERT ", "GTKEY_KP_DELETE ", "GTKEY_KP_BEGIN ",
 "GTKEY_MEDIA_PLAY ", "GTKEY_MEDIA_PAUSE ", "GTKEY_MEDIA_PLAY_PAUSE ", "GTKEY_MEDIA_REVERSE ",
 "GTKEY_MEDIA_STOP ", "GTKEY_MEDIA_FAST_FORWARD ", "GTKEY_MEDIA_REWIND ", "GTKEY_MEDIA_TRACK_NEXT ",
 "GTKEY_MEDIA_TRACK_PREVIOUS ", "GTKEY_MEDIA_RECORD ", "GTKEY_LOWER_VOLUME ", "GTKEY_RAISE_VOLUME ",
 "GTKEY_MUTE_VOLUME ", "GTKEY_LEFT_SHIFT ", "GTKEY_LEFT_CONTROL ", "GTKEY_LEFT_ALT ", "GTKEY_LEFT_SUPER ",
 "GTKEY_LEFT_HYPER ", "GTKEY_LEFT_META ", "GTKEY_RIGHT_SHIFT ", "GTKEY_RIGHT_CONTROL ", "GTKEY_RIGHT_ALT ",
 "GTKEY_RIGHT_SUPER ", "GTKEY_RIGHT_HYPER ", "GTKEY_RIGHT_META ", "GTKEY_ISO_LEVEL3_SHIFT ",
 "GTKEY_ISO_LEVEL5_SHIFT",
};

// clang-format on

struct Dims {
  int width;
  int height;
};

struct GraphicalTermMouse {
  uint32_t x;
  uint32_t y;
  uint32_t buttons;
  uint32_t prevButtons;
};

#define GTSHM_MAX_NAME_LENGTH 256
struct GraphicalTermSHMImage {
  int fd;
  // some mmap'd memory where pixels live
  uint32_t *ptr;
  uint32_t size;
  uint32_t counter;
  uint32_t lastValid;
  uint32_t lastSent;

  int width;
  int height;

  char name[GTSHM_MAX_NAME_LENGTH + 1];
};

struct GraphicalTermState {
  Dims sizeInPixels;
  Dims sizeInCells;

  struct termios termiosRaw;
  struct termios termiosOriginal;
  bool isRaw;

  bool hideTextualCursor;

  uint32_t currentKeys[(1 << 16) >> 5];
  uint32_t previousKeys[(1 << 16) >> 5];

  GraphicalTermMouse mouse;

  bool framebufferPending;
  GraphicalTermSHMImage framebuffer;

  FILE *log;
};

static GraphicalTermState *_GlobalTermState = NULL;
static void
GraphicalTermSignalHandler(int signo);

static void
GraphicalTermSetMode(uint32_t mode, bool enabled) {
  fprintf(stdout, "\x1B[?%u%c", mode, enabled ? 'h' : 'l');
  fflush(stdout);
}

static void
GraphicalTermMoveCursorHome() {
  fputs("\x1B[H", stdout);
  fflush(stdout);
}

static void
GraphicalTermClear() {
  fputs("\x1B[2J", stdout);
  fflush(stdout);
  GraphicalTermMoveCursorHome();
}

static void
GraphicalTermStart(GraphicalTermState *state) {
  state->framebuffer.fd = -1;
  state->framebuffer.size = 0;
  state->framebuffer.ptr = 0;
  state->framebuffer.counter = 1;
  state->framebuffer.lastSent = 1;
  state->framebuffer.lastValid = 1;

  // Setup the SGR-pixel mouse position mode
  // see: https://invisible-island.net/xterm/ctlseqs/ctlseqs.html#h2-Mouse-Tracking
  GraphicalTermSetMode(1000, true);
  GraphicalTermSetMode(1002, true);
  GraphicalTermSetMode(1003, true);
  GraphicalTermSetMode(1004, true);
  GraphicalTermSetMode(1006, true);
  GraphicalTermSetMode(1016, true);

  // Setup the raw / original state
  tcgetattr(0, &state->termiosOriginal);
  tcgetattr(0, &state->termiosRaw);

  cfmakeraw(&state->termiosRaw);
  state->termiosRaw.c_lflag &= ~(ICANON | ECHO);
  // state->termiosRaw.c_cc[VINTR] = SIGINT;
  // Set raw
  tcsetattr(0, TCSANOW, &state->termiosRaw);
  state->isRaw = true;
  fcntl(0, F_SETFL, O_NONBLOCK);

  memset(state->currentKeys, 0, sizeof(state->currentKeys));
  memset(state->previousKeys, 0, sizeof(state->previousKeys));

  // Setup the keyboard protocol (0b11111)
  // see: https://sw.kovidgoyal.net/kitty/keyboard-protocol/#progressive-enhancement
  fprintf(stdout, "\x1B[>%uu", 31);
  fflush(stdout);

  state->log = fopen("graphical-term.log", "w");
  fprintf(state->log, "session start\n");
  fflush(state->log);

  GraphicalTermClear();

  _GlobalTermState = state;
}

static void
GraphicalTermHideTextualCursor(GraphicalTermState *state) {
  state->hideTextualCursor = true;
  fputs("\x1B[?25l", stdout);
  fflush(stdout);
}

static void
GraphicalTermShowTextualCursor(GraphicalTermState *state) {
  if (state->hideTextualCursor) {
    state->hideTextualCursor = false;
    fputs("\x1B[?25h", stdout);
    fflush(stdout);
  }
}

static void
GraphicalTermStop(GraphicalTermState *state) {
  // Disable the SGR-pixel mouse position mode
  // see: https://invisible-island.net/xterm/ctlseqs/ctlseqs.html#h2-Mouse-Tracking
  GraphicalTermSetMode(1000, false);
  GraphicalTermSetMode(1002, false);
  GraphicalTermSetMode(1003, false);
  GraphicalTermSetMode(1004, false);
  GraphicalTermSetMode(1006, false);
  GraphicalTermSetMode(1016, false);

  if (state->isRaw) {
    // avoid leaving lingering stdin data that will pollute the command line.
    char c;
    while (read(0, &c, 1) > 0) {
    }

    GraphicalTermMoveCursorHome();
    GraphicalTermClear();

    tcsetattr(0, TCSANOW, &state->termiosOriginal);
    state->isRaw = false;
  }

  if (state->hideTextualCursor) {
    GraphicalTermShowTextualCursor(state);
  }

  // Teardown the keyboard protocol
  fputs("\x1B[<u", stdout);
  fflush(stdout);
}

static void
GraphicalTermSignalHandler(int signo) {
  GraphicalTermStop(_GlobalTermState);
  exit(0);
}

enum GraphicalTermParserState {
  GTPS_NONE,
  GTPS_EVENT_ESCAPE_START,
  GTPS_EVENT_ESCAPE_COMPLETE,
  GTPS_KEY_EVENT_NUMBER,
  GTPS_KEY_EVENT_MODIFIER,
  GTPS_KEY_EVENT_TYPE,
  GTPS_GRAPHICS_RESPONSE,
};

struct GraphicalTermParser {
  GraphicalTermParserState state;
  char pending[32];
  int pendingLocation;
  uint32_t modifier;
  uint32_t keycode;

  uint32_t readLocation;
  char read[1024];
};

static bool
GraphicalTermIsKeyDown(GraphicalTermState *state, GraphicsTermKeyCode keycode) {
  uint32_t code = uint32_t(keycode);
  uint32_t wordIndex = code >> 5;
  uint32_t mask = 1 << (code & 31);

  uint32_t result = (state->currentKeys[wordIndex] & mask);
  return result != 0;
}

static bool
GraphicalTermWasKeyDown(GraphicalTermState *state, GraphicsTermKeyCode keyCode) {
  uint32_t code = uint32_t(keyCode);
  uint32_t wordIndex = code >> 5;
  uint32_t mask = 1 << (code & 31);
  return (state->previousKeys[wordIndex] & mask) != 0;
}

#define GTCombineKeyParts(NUM, CODE) ((NUM) | (uint32_t(CODE) << 16))
#define GTKeyMatch(NUM, CODE, ACTUAL)                                                    \
  case GTCombineKeyParts((NUM), (CODE)): code = ACTUAL; break

static void
GraphicalTermSetKeyBit(GraphicalTermState *state, GraphicalTermParser *parser, char c) {
  GraphicsTermKeyCode code = GraphicsTermKeyCode(parser->keycode);
  switch (GTCombineKeyParts(parser->keycode, c)) {
    GTKeyMatch(27, 'u', GTKEY_ESCAPE);
    GTKeyMatch(13, 'u', GTKEY_ENTER);
    GTKeyMatch(9, 'u', GTKEY_TAB);
    GTKeyMatch(127, 'u', GTKEY_BACKSPACE);
    GTKeyMatch(2, '~', GTKEY_INSERT);
    GTKeyMatch(3, '~', GTKEY_DELETE);
    GTKeyMatch(1, 'D', GTKEY_LEFT);
    GTKeyMatch(1, 'C', GTKEY_RIGHT);
    GTKeyMatch(1, 'A', GTKEY_UP);
    GTKeyMatch(1, 'B', GTKEY_DOWN);
    GTKeyMatch(5, '~', GTKEY_PAGE_UP);
    GTKeyMatch(6, '~', GTKEY_PAGE_DOWN);

    GTKeyMatch(1, 'H', GTKEY_HOME);
    GTKeyMatch(7, '~', GTKEY_HOME);

    GTKeyMatch(1, 'F', GTKEY_END);
    GTKeyMatch(8, '~', GTKEY_END);

    GTKeyMatch(57358, 'u', GTKEY_CAPS_LOCK);
    GTKeyMatch(57359, 'u', GTKEY_SCROLL_LOCK);
    GTKeyMatch(57360, 'u', GTKEY_NUM_LOCK);
    GTKeyMatch(57361, 'u', GTKEY_PRINT_SCREEN);
    GTKeyMatch(57362, 'u', GTKEY_PAUSE);
    GTKeyMatch(57363, 'u', GTKEY_MENU);

    GTKeyMatch(1, 'P', GTKEY_F1);
    GTKeyMatch(11, '~', GTKEY_F1);

    GTKeyMatch(1, 'Q', GTKEY_F2);
    GTKeyMatch(12, '~', GTKEY_F2);

    GTKeyMatch(13, '~', GTKEY_F3);

    GTKeyMatch(1, 'S', GTKEY_F4);
    GTKeyMatch(14, '~', GTKEY_F4);

    GTKeyMatch(15, '~', GTKEY_F5);
    GTKeyMatch(17, '~', GTKEY_F6);
    GTKeyMatch(18, '~', GTKEY_F7);
    GTKeyMatch(19, '~', GTKEY_F8);
    GTKeyMatch(20, '~', GTKEY_F9);
    GTKeyMatch(21, '~', GTKEY_F10);
    GTKeyMatch(23, '~', GTKEY_F11);
    GTKeyMatch(24, '~', GTKEY_F12);
    GTKeyMatch(57376, 'u', GTKEY_F13);
    GTKeyMatch(57377, 'u', GTKEY_F14);
    GTKeyMatch(57378, 'u', GTKEY_F15);
    GTKeyMatch(57379, 'u', GTKEY_F16);
    GTKeyMatch(57380, 'u', GTKEY_F17);
    GTKeyMatch(57381, 'u', GTKEY_F18);
    GTKeyMatch(57382, 'u', GTKEY_F19);
    GTKeyMatch(57383, 'u', GTKEY_F20);
    GTKeyMatch(57384, 'u', GTKEY_F21);
    GTKeyMatch(57385, 'u', GTKEY_F22);
    GTKeyMatch(57386, 'u', GTKEY_F23);
    GTKeyMatch(57387, 'u', GTKEY_F24);
    GTKeyMatch(57388, 'u', GTKEY_F25);
    GTKeyMatch(57389, 'u', GTKEY_F26);
    GTKeyMatch(57390, 'u', GTKEY_F27);
    GTKeyMatch(57391, 'u', GTKEY_F28);
    GTKeyMatch(57392, 'u', GTKEY_F29);
    GTKeyMatch(57393, 'u', GTKEY_F30);
    GTKeyMatch(57394, 'u', GTKEY_F31);
    GTKeyMatch(57395, 'u', GTKEY_F32);
    GTKeyMatch(57396, 'u', GTKEY_F33);
    GTKeyMatch(57397, 'u', GTKEY_F34);
    GTKeyMatch(57398, 'u', GTKEY_F35);
    GTKeyMatch(57399, 'u', GTKEY_KP_0);
    GTKeyMatch(57400, 'u', GTKEY_KP_1);
    GTKeyMatch(57401, 'u', GTKEY_KP_2);
    GTKeyMatch(57402, 'u', GTKEY_KP_3);
    GTKeyMatch(57403, 'u', GTKEY_KP_4);
    GTKeyMatch(57404, 'u', GTKEY_KP_5);
    GTKeyMatch(57405, 'u', GTKEY_KP_6);
    GTKeyMatch(57406, 'u', GTKEY_KP_7);
    GTKeyMatch(57407, 'u', GTKEY_KP_8);
    GTKeyMatch(57408, 'u', GTKEY_KP_9);
    GTKeyMatch(57409, 'u', GTKEY_KP_DECIMAL);
    GTKeyMatch(57410, 'u', GTKEY_KP_DIVIDE);
    GTKeyMatch(57411, 'u', GTKEY_KP_MULTIPLY);
    GTKeyMatch(57412, 'u', GTKEY_KP_SUBTRACT);
    GTKeyMatch(57413, 'u', GTKEY_KP_ADD);
    GTKeyMatch(57414, 'u', GTKEY_KP_ENTER);
    GTKeyMatch(57415, 'u', GTKEY_KP_EQUAL);
    GTKeyMatch(57416, 'u', GTKEY_KP_SEPARATOR);
    GTKeyMatch(57417, 'u', GTKEY_KP_LEFT);
    GTKeyMatch(57418, 'u', GTKEY_KP_RIGHT);
    GTKeyMatch(57419, 'u', GTKEY_KP_UP);
    GTKeyMatch(57420, 'u', GTKEY_KP_DOWN);
    GTKeyMatch(57421, 'u', GTKEY_KP_PAGE_UP);
    GTKeyMatch(57422, 'u', GTKEY_KP_PAGE_DOWN);
    GTKeyMatch(57423, 'u', GTKEY_KP_HOME);
    GTKeyMatch(57424, 'u', GTKEY_KP_END);
    GTKeyMatch(57425, 'u', GTKEY_KP_INSERT);
    GTKeyMatch(57426, 'u', GTKEY_KP_DELETE);

    GTKeyMatch(1, 'E', GTKEY_KP_BEGIN);
    GTKeyMatch(57427, '~', GTKEY_KP_BEGIN);

    GTKeyMatch(57428, 'u', GTKEY_MEDIA_PLAY);
    GTKeyMatch(57429, 'u', GTKEY_MEDIA_PAUSE);
    GTKeyMatch(57430, 'u', GTKEY_MEDIA_PLAY_PAUSE);
    GTKeyMatch(57431, 'u', GTKEY_MEDIA_REVERSE);
    GTKeyMatch(57432, 'u', GTKEY_MEDIA_STOP);
    GTKeyMatch(57433, 'u', GTKEY_MEDIA_FAST_FORWARD);
    GTKeyMatch(57434, 'u', GTKEY_MEDIA_REWIND);
    GTKeyMatch(57435, 'u', GTKEY_MEDIA_TRACK_NEXT);
    GTKeyMatch(57436, 'u', GTKEY_MEDIA_TRACK_PREVIOUS);
    GTKeyMatch(57437, 'u', GTKEY_MEDIA_RECORD);
    GTKeyMatch(57438, 'u', GTKEY_LOWER_VOLUME);
    GTKeyMatch(57439, 'u', GTKEY_RAISE_VOLUME);
    GTKeyMatch(57440, 'u', GTKEY_MUTE_VOLUME);
    GTKeyMatch(57441, 'u', GTKEY_LEFT_SHIFT);
    GTKeyMatch(57442, 'u', GTKEY_LEFT_CONTROL);
    GTKeyMatch(57443, 'u', GTKEY_LEFT_ALT);
    GTKeyMatch(57444, 'u', GTKEY_LEFT_SUPER);
    GTKeyMatch(57445, 'u', GTKEY_LEFT_HYPER);
    GTKeyMatch(57446, 'u', GTKEY_LEFT_META);
    GTKeyMatch(57447, 'u', GTKEY_RIGHT_SHIFT);
    GTKeyMatch(57448, 'u', GTKEY_RIGHT_CONTROL);
    GTKeyMatch(57449, 'u', GTKEY_RIGHT_ALT);
    GTKeyMatch(57450, 'u', GTKEY_RIGHT_SUPER);
    GTKeyMatch(57451, 'u', GTKEY_RIGHT_HYPER);
    GTKeyMatch(57452, 'u', GTKEY_RIGHT_META);
    GTKeyMatch(57453, 'u', GTKEY_ISO_LEVEL3_SHIFT);
    GTKeyMatch(57454, 'u', GTKEY_ISO_LEVEL5_SHIFT);
  }

  uint32_t wordIndex = uint32_t(code) >> 5;
  uint32_t mask = 1 << (uint32_t(code) & 31);
  fprintf(state->log, "write: word: %u bit: %u\n", wordIndex, uint32_t(code) & 31);
  if (parser->pendingLocation == 0 || parser->pending[0] == '1') {
    fprintf(state->log, " press\n");
    state->currentKeys[wordIndex] |= mask;
  } else if (parser->pending[0] == '2') {
    fprintf(state->log, " repeat\n");
  } else if (parser->pending[0] == '3') {
    fprintf(state->log, " release\n");
    state->currentKeys[wordIndex] &= ~mask;
  } else {
    fprintf(state->log, " unknown %s\n", parser->pending);
  }

  parser->pendingLocation = 0;
  parser->keycode = 0;
  return;
}

static void
GraphicalTermParserReset(GraphicalTermParser *parser) {
  parser->pendingLocation = 0;
  parser->readLocation = 0;

  parser->pending[0] = 0;
  parser->read[0] = 0;
}

static char
GraphicalTermControlLastChar(GraphicalTermParser *parser) {
  if (parser->readLocation == 0) {
    return 0;
  }
  return parser->read[parser->readLocation - 1];
}

static char
GraphicalTermControlReadChar(GraphicalTermParser *parser) {
  char c = 0;
  if (read(0, &c, 1) > 0) {
    parser->read[parser->readLocation++] = c;
    parser->read[parser->readLocation] = 0;

    parser->pending[parser->pendingLocation++] = c;
    parser->pending[parser->pendingLocation] = 0;
    return c;
  }
  return 0;
}

static uint32_t
GraphicalTermControlReadU32(GraphicalTermParser *parser) {
  char c;
  while (1) {
    if (read(0, &c, 1) > 0) {
      parser->read[parser->readLocation++] = c;
      parser->read[parser->readLocation] = 0;
    } else {
      parser->pending[parser->pendingLocation] = 0;
      break;
    }

    if (c < '0' || c > '9') {
      parser->pending[parser->pendingLocation] = 0;
      break;
    }

    parser->pending[parser->pendingLocation++] = c;
  }

  uint32_t result = uint32_t(atoi(parser->pending));
  parser->pending[0] = 0;
  parser->pendingLocation = 0;
  return result;
}

/*
 * base64.c : base-64 / MIME encode/decode
 * PUBLIC DOMAIN - Jon Mayo - November 13, 2003
 * $Id: base64.c 156 2007-07-12 23:29:10Z orange $
 */

static const uint8_t
  base64enc_tab[] = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

static int
Base64Encode(size_t in_len, const uint8_t *in, size_t out_len, char *out) {
  uint ii, io;
  uint_least32_t v;
  uint rem;

  for (io = 0, ii = 0, v = 0, rem = 0; ii < in_len; ii++) {
    uint8_t ch;
    ch = in[ii];
    v = (v << 8) | ch;
    rem += 8;
    while (rem >= 6) {
      rem -= 6;
      if (io >= out_len)
        return -1; /* truncation is failure */
      out[io++] = base64enc_tab[(v >> rem) & 63];
    }
  }
  if (rem) {
    v <<= (6 - rem);
    if (io >= out_len)
      return -1; /* truncation is failure */
    out[io++] = base64enc_tab[v & 63];
  }
  while (io & 3) {
    if (io >= out_len)
      return -1; /* truncation is failure */
    out[io++] = '=';
  }
  if (io >= out_len)
    return -1; /* no room for null terminator */
  out[io] = 0;
  return io;
}

static void
GraphicalTermGetFramebuffer(GraphicalTermState *state) {
  // Avoid spamming images faster than the terminal can respond with
  if (state->framebuffer.lastSent != state->framebuffer.lastValid) {
    return;
  }

  struct winsize sz;

  ioctl(0, TIOCGWINSZ, &sz);

  state->framebuffer.width = sz.ws_xpixel;
  state->framebuffer.height = sz.ws_ypixel;

  // Clean the previous frame's image
  if (state->framebuffer.fd != -1) {
    if (state->framebuffer.size) {
      munmap(state->framebuffer.ptr, state->framebuffer.size);
      state->framebuffer.ptr = 0;
      state->framebuffer.size = 0;
    }

    close(state->framebuffer.fd);
    state->framebuffer.fd = -1;

    shm_unlink(state->framebuffer.name);
    state->framebuffer.name[0] = 0;
  }

  uint32_t id = state->framebuffer.counter++;
  state->framebuffer.lastSent = id;
  state->framebuffer.lastValid = 0;

  int nameLength = snprintf(state->framebuffer.name,
                            GTSHM_MAX_NAME_LENGTH,
                            "/gtshm-image-%u",
                            id);
  state->framebuffer.fd = shm_open(state->framebuffer.name,
                                   O_CREAT | O_RDWR,
                                   S_IRUSR | S_IWUSR);
  if (state->framebuffer.fd == -1) {
    fprintf(stderr,
            "ERROR: failed to open shm (%s)\n  %s\n",
            state->framebuffer.name,
            strerror(errno));
    return;
  }

  const uint32_t size = state->framebuffer.width * state->framebuffer.height * 4;
  if (ftruncate(state->framebuffer.fd, size) == -1) {
    fprintf(stderr,
            "ERROR: failed to truncate shm (%s)\n  %s\n",
            state->framebuffer.name,
            strerror(errno));
    return;
  }

  state->framebuffer.ptr = (uint32_t *)
    mmap(0, size, (PROT_WRITE | PROT_READ), MAP_SHARED, state->framebuffer.fd, 0);
  if (state->framebuffer.ptr == MAP_FAILED) {
    fprintf(stderr,
            "ERROR: failed to mmap shm (%s)\n  %s\n",
            state->framebuffer.name,
            strerror(errno));
    return;
  }
  state->framebuffer.size = size;
  state->framebufferPending = true;
}

// Display an image in the upper left corner
static void
GraphicalTermShowFramebuffer(GraphicalTermState *state) {
  if (!state->framebufferPending) {
    return;
  }

  state->framebufferPending = false;

  size_t nameLength = strlen(state->framebuffer.name);
  size_t encodedSize = ((nameLength + 2) / 3) * 4 + 1;
  uint8_t *encodedName = (uint8_t *)alloca(encodedSize + 1);
  if (!encodedName) {
    fprintf(stderr, "ERROR: failed to aloca\n");
    return;
  }

  // base64 encode the filename
  int ret = Base64Encode(nameLength,
                         (uint8_t *)state->framebuffer.name,
                         encodedSize + 1,
                         (char *)encodedName);

  if (ret < 0) {
    fprintf(stderr, "ERROR: base64_encode failed: ret=%d\n", ret);
    return;
  }

  GraphicalTermMoveCursorHome();

  // create and place the framebuffer
  char cmd = 'T';
  int zIndex = -1;
  fprintf(stdout, "\x1B_Ga=d,d=A;\x1B\\");
  fprintf(stdout,
          "\x1B_Gf=32,X=0,Y=0,C=1,t=s,a=%c,i=%u,z=%i,s=%u,v=%u;%s\x1B\\",
          cmd,
          state->framebuffer.lastSent,
          zIndex,
          state->framebuffer.width,
          state->framebuffer.height,
          encodedName);
  fflush(stdout);
}

static void
GraphicalTermFrameBegin(GraphicalTermState *state) {
  struct winsize sz;
  ioctl(0, TIOCGWINSZ, &sz);

  state->sizeInCells.width = sz.ws_col;
  state->sizeInCells.width = sz.ws_row;

  state->sizeInPixels.width = sz.ws_xpixel;
  state->sizeInPixels.height = sz.ws_ypixel;

  state->framebufferPending = false;

  memcpy(state->previousKeys, state->currentKeys, sizeof(state->currentKeys));

  // Poll input
  {
    {

      GraphicalTermParser parser;
      parser.state = GTPS_NONE;
      parser.readLocation = 0;
      while (1) {
        char c;
        ssize_t readCount = read(0, &c, 1);
        if (readCount < 1) {
          GraphicalTermParserReset(&parser);
          break;
        }

        if (c == 0x1B) {
          parser.pendingLocation = 0;
          parser.state = GTPS_EVENT_ESCAPE_START;

          if (parser.readLocation) {
            fprintf(state->log, "\nRESET (%s)\n", parser.read);
            fflush(state->log);
          }
          parser.readLocation = 0;
          continue;
        }

        parser.read[parser.readLocation++] = c == 0x1B ? '!' : c;
        parser.read[parser.readLocation] = 0;

        switch (parser.state) {
          case GTPS_NONE: {
            break;
          }

          case GTPS_EVENT_ESCAPE_START: {
            if (c == 0x5b) {
              parser.state = GTPS_EVENT_ESCAPE_COMPLETE;
              parser.pendingLocation = 0;
              continue;
            }

            if (c == '_') {
              parser.state = GTPS_GRAPHICS_RESPONSE;
              parser.pendingLocation = 0;
              continue;
            }

            break;
          }

          case GTPS_EVENT_ESCAPE_COMPLETE: {
            if (c == '<') {
              GraphicalTermParserReset(&parser);
              uint32_t button = GraphicalTermControlReadU32(&parser);
              state->mouse.x = GraphicalTermControlReadU32(&parser);
              state->mouse.y = GraphicalTermControlReadU32(&parser);

              uint32_t MOVEMENT = 1 << 5;
              // no button
              if (button != 35) {
                bool down = GraphicalTermControlLastChar(&parser) == 'M';

                // Buttons 3+ come back as 128, 129, etc..
                if (button >= 128) {
                  button = 3 + (button & 7);
                }

                uint32_t mask = 1 << button;
                if (down) {
                  state->mouse.buttons |= mask;
                } else {
                  state->mouse.buttons &= ~mask;
                }
              }

              parser.state = GTPS_NONE;
              parser.pendingLocation = 0;
              continue;
            }

            if (c >= '0' && c <= '9') {
              parser.pending[parser.pendingLocation++] = c;
              parser.pending[parser.pendingLocation] = 0;
              parser.state = GTPS_KEY_EVENT_NUMBER;
            }
            break;
          }

          case GTPS_KEY_EVENT_NUMBER: {
            if (c == ';' || c == 'u') {
              parser.keycode = uint32_t(atoi(parser.pending));

              fprintf(state->log, " number: %s\n", parser.pending);
              fflush(state->log);
              parser.pendingLocation = 0;
              if (c == 'u') {
                GraphicalTermSetKeyBit(state, &parser, c);
                parser.state = GTPS_NONE;
              } else {
                parser.state = GTPS_KEY_EVENT_MODIFIER;
              }
            } else {
              int charIndex = parser.pendingLocation++;
              parser.pending[charIndex] = c;
              parser.pending[parser.pendingLocation] = 0;
            }
            break;
          }

          case GTPS_KEY_EVENT_MODIFIER: {
            if (c == ';') {
              parser.state = GTPS_KEY_EVENT_TYPE;
              parser.pendingLocation = 0;
              parser.modifier = 1;
              continue;
            }

            if (c == ':' || c == 'u') {
              // modifiers are 1 indexed (https://sw.kovidgoyal.net/kitty/keyboard-protocol/#modifiers)
              if (parser.pendingLocation > 0 && parser.pending[0] != '1') {
                fprintf(state->log, " modifier: %s\n", parser.pending);
              }

              parser.modifier = uint32_t(atoi(parser.pending));
              parser.state = GTPS_KEY_EVENT_TYPE;
              parser.pendingLocation = 0;
            } else {
              int charIndex = parser.pendingLocation++;
              parser.pending[charIndex] = c;
              parser.pending[parser.pendingLocation] = 0;
            }

            break;
          }

          case GTPS_KEY_EVENT_TYPE: {
            // Key press/repeat/release events

            if (c < '0' || c > '9') {
              GraphicalTermSetKeyBit(state, &parser, c);
            } else {
              int charIndex = parser.pendingLocation++;
              parser.pending[charIndex] = c;
              parser.pending[parser.pendingLocation] = 0;
            }
            break;
          }

          case GTPS_GRAPHICS_RESPONSE: {
            if (c == 'G') {
              char param = GraphicalTermControlReadChar(&parser);
              char next = GraphicalTermControlReadChar(&parser);
              if (param == 'i' && next == '=') {
                parser.pendingLocation = 0;
                uint32_t id = GraphicalTermControlReadU32(&parser);
                // Note: we don't care whether this succeded, we'll just push another image anyway.
                //       you _could_ test for OK or error and do somethins special here, but
                //       I'm not sure what that would be.
                state->framebuffer.lastValid = id;

                while (1) {
                  char c = GraphicalTermControlReadChar(&parser);
                  if (c == 0 || c == '\\') {
                    break;
                  }
                }
              }
            }
            break;
          }
        }
      }

      if (parser.readLocation) {
        fprintf(state->log, " read: %s\n", parser.read);
        fflush(state->log);
      }
    }
  }

  GraphicalTermGetFramebuffer(state);
}

static void
GraphicalTermFrameEnd(GraphicalTermState *state) {
  GraphicalTermShowFramebuffer(state);
}

/*
  Copyright © 2020-present Elijah Insua <tmpvar@gmail.com>

  Permission is hereby granted, free of charge, to any person obtaining a copy
  of this software and associated documentation files (the “Software”), to deal
  in the Software without restriction, including without limitation the rights
  to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
  copies of the Software, and to permit persons to whom the Software is
  furnished to do so, subject to the following conditions:

  The above copyright notice and this permission notice shall be included in all
  copies or substantial portions of the Software.

  THE SOFTWARE IS PROVIDED “AS IS”, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
  IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
  FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
  AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
  LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
  OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
  SOFTWARE.
*/

#endif

