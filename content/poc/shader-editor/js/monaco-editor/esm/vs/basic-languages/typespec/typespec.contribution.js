/*!-----------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Version: 0.51.0(undefined)
 * Released under the MIT license
 * https://github.com/microsoft/monaco-editor/blob/main/LICENSE.txt
 *-----------------------------------------------------------------------------*/


// src/basic-languages/typespec/typespec.contribution.ts
import { registerLanguage } from "../_.contribution.js";
registerLanguage({
  id: "typespec",
  extensions: [".tsp"],
  aliases: ["TypeSpec"],
  loader: () => {
    if (false) {
      return new Promise((resolve, reject) => {
        __require(["vs/basic-languages/typespec/typespec"], resolve, reject);
      });
    } else {
      return import("./typespec.js");
    }
  }
});