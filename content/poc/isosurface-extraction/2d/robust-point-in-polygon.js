// taken from https://www.npmjs.com/package/robust-point-in-polygon @ 1.0.3
// The MIT License(MIT)

// Copyright(c) 2013 Mikola Lysenko

// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files(the "Software"), to deal
//   in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and / or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:

// The above copyright notice and this permission notice shall be included in
//   all copies or substantial portions of the Software.

// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
//   FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
//   OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
// THE SOFTWARE.


import { orient2d } from "./orient2d.js"

export default function RobustPointInPolygon(vs, x, y) {
  var n = vs.length
  var inside = 1
  var lim = n
  for (var i = 0, j = n - 1; i < lim; j = i++) {
    var a = vs[i]
    var b = vs[j]
    var yi = a[1]
    var yj = b[1]
    if (yj < yi) {
      if (yj < y && y < yi) {
        var s = orient2d(a[0], a[1], b[0], b[1], x, y)
        if (s === 0) {
          return 0
        } else {
          inside ^= (0 < s) | 0
        }
      } else if (y === yi) {
        var c = vs[(i + 1) % n]
        var yk = c[1]
        if (yi < yk) {
          var s = orient2d(a[0], a[1], b[0], b[1], x, y)
          if (s === 0) {
            return 0
          } else {
            inside ^= (0 < s) | 0
          }
        }
      }
    } else if (yi < yj) {
      if (yi < y && y < yj) {
        var s = orient2d(a[0], a[1], b[0], b[1], x, y)
        if (s === 0) {
          return 0
        } else {
          inside ^= (s < 0) | 0
        }
      } else if (y === yi) {
        var c = vs[(i + 1) % n]
        var yk = c[1]
        if (yk < yi) {
          var s = orient2d(a[0], a[1], b[0], b[1], x, y)
          if (s === 0) {
            return 0
          } else {
            inside ^= (s < 0) | 0
          }
        }
      }
    } else if (y === yi) {
      var x0 = Math.min(a[0], b[0])
      var x1 = Math.max(a[0], b[0])
      if (i === 0) {
        while (j > 0) {
          var k = (j + n - 1) % n
          var p = vs[k]
          if (p[1] !== y) {
            break
          }
          var px = p[0]
          x0 = Math.min(x0, px)
          x1 = Math.max(x1, px)
          j = k
        }
        if (j === 0) {
          if (x0 <= x && x <= x1) {
            return 0
          }
          return 1
        }
        lim = j + 1
      }
      var y0 = vs[(j + n - 1) % n][1]
      while (i + 1 < lim) {
        var p = vs[i + 1]
        if (p[1] !== y) {
          break
        }
        var px = p[0]
        x0 = Math.min(x0, px)
        x1 = Math.max(x1, px)
        i += 1
      }
      if (x0 <= x && x <= x1) {
        return 0
      }
      var y1 = vs[(i + 1) % n][1]
      if (x < x0 && (y0 < y !== y1 < y)) {
        inside ^= 1
      }
    }
  }
  return 2 * inside - 1
}