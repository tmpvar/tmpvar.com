/*!-----------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Version: 0.51.0(undefined)
 * Released under the MIT license
 * https://github.com/microsoft/monaco-editor/blob/main/LICENSE.txt
 *-----------------------------------------------------------------------------*/


// src/basic-languages/pla/pla.contribution.ts
import { registerLanguage } from "../_.contribution.js";
registerLanguage({
  id: "pla",
  extensions: [".pla"],
  loader: () => {
    if (false) {
      return new Promise((resolve, reject) => {
        __require(["vs/basic-languages/pla/pla"], resolve, reject);
      });
    } else {
      return import("./pla.js");
    }
  }
});
