+++
title = "Convering PNG to a Win32 Resource File (.res)"
date = 2024-04-19
description = "Application icons from PNGs on windows the easy way"
keywords = "ico, png, .res, resource, win32, c++, handmade"
[extra]
enableSampleImage = true
+++

Wanting to add application icons to my prototyping platform (hotcart) I discovered there is pretty trivial way to add icons to applications without using the Visual Studio GUI or tools like `rc.exe`.

<!-- more -->

When searching for how embed to a png into an executable as its icon, you'll probably come across a process that looks something like this:

1. Use some online tool to convert your `icon.png` into a `icon.ico`
2. create an `icon.rc` file referencing `icon.ico`
3. run `rc.exe` on `icon.rc` to produce `icon.res`
4. link `icon.res` with your program (e.g., `cl.exe .... -link icon.res`)

What a pain.

I have great news though, if you are willing to only ship on Windows Vista (released in 2007 / extended support ended in 2017) or newer. The release of Vista came with the ability to pack PNG content directly into `.ico` files - `.res` files also got the same treatment!

What does this mean in practice? Well, with a bit of code we can go directly from `icon.png` to `icon.res`!

```cpp
// this code is marked with CC0 1.0 Universal.
// To view a copy of this license, visit https://creativecommons.org/publicdomain/zero/1.0/
#include <windows.h>
#include <stdint.h>

typedef int32_t i32;
typedef uint32_t u32;
typedef uint8_t u8;
typedef uint16_t u16;

#define STB_IMAGE_IMPLEMENTATION
#include "stb_image.h"

// Convert a .png to .res for linking with cl.exe on Windows
static bool
PNG2Res(const char *pngFilepath, const char *resFilepath) {
  // Step 1: Load the PNG
  u8 *pngData = nullptr;
  u32 pngDataLength = 0;
  i32 pngWidth = 0;
  i32 pngHeight = 0;
  i32 pngComponents = 0;
  {
    HANDLE file = CreateFileA(pngFilepath,
                              GENERIC_READ,
                              FILE_SHARE_READ | FILE_SHARE_WRITE,
                              NULL,
                              OPEN_EXISTING,
                              FILE_ATTRIBUTE_NORMAL,
                              NULL);

    if (!file) {
      return false;
    }

    LARGE_INTEGER filesize = {};

    if (!GetFileSizeEx(file, &filesize)) {
      return false;
    }
    pngDataLength = filesize.LowPart;

    pngData = (u8 *)malloc(pngDataLength);
    if (!pngData) {
      return false;
    }

    DWORD bytesRead = 0;
    BOOL r = ReadFile(file, (void *)pngData, pngDataLength, &bytesRead, NULL);
    if (!r) {
      free(pngData);
      return false;
    }
    CloseHandle(file);

    if (bytesRead < 8) {
      free(pngData);
      return false;
    }

    stbi_info_from_memory(pngData, pngDataLength, &pngWidth, &pngHeight, &pngComponents);
  }

  // Step 2: Output RES
  {
    struct RESOURCEHEADER {
      DWORD DataSize;
      DWORD HeaderSize;
      DWORD TYPE;
      DWORD NAME;
      DWORD DataVersion;
      WORD MemoryFlags;
      WORD LanguageId;
      DWORD Version;
      DWORD Characteristics;
    };

    HANDLE resFile = CreateFileA(resFilepath,
                                 GENERIC_WRITE,
                                 FILE_SHARE_READ | FILE_SHARE_WRITE,
                                 NULL,
                                 CREATE_ALWAYS,
                                 FILE_ATTRIBUTE_NORMAL,
                                 NULL);

    if (!resFile) {
      printf("could not open res file for writing\n");
      free(pngData);
      return false;
    }

    // Resource ID: 0 (empty)
    RESOURCEHEADER blank = {};
    blank.TYPE = 0xFFFF;
    blank.NAME = 0xFFFF;
    blank.HeaderSize = 32;
    WriteFile(resFile, &blank, sizeof(RESOURCEHEADER), 0, 0);

    // Resource ID: 1 (our png)
    RESOURCEHEADER icoResourceHeader = {};
    icoResourceHeader.TYPE = 0x0003FFFF; // RT_ICON
    icoResourceHeader.NAME = 0x0001FFFF; // 1
    icoResourceHeader.HeaderSize = 32;
    icoResourceHeader.DataSize = pngDataLength;

    // reversed from the output of rc.exe 🤷‍♂️
    icoResourceHeader.MemoryFlags = 0x1030;
    icoResourceHeader.LanguageId = 0x0409;

    WriteFile(resFile, &icoResourceHeader, sizeof(RESOURCEHEADER), 0, 0);
    WriteFile(resFile, pngData, pngDataLength, 0, 0);

    // pad out to the next u32 boundary
    u32 fileOffset = sizeof(RESOURCEHEADER) * 2 + pngDataLength;
    u32 neededPadding = fileOffset % 4;
    u8 padding[3] = {0, 0, 0};
    WriteFile(resFile, &padding, neededPadding, 0, 0);

    struct GRPICONDIR {
      WORD idReserved;
      WORD idType;
      WORD idCount;
      // GRPICONDIRENTRY idEntries[];
    };
    struct GRPICONDIRENTRY {
      BYTE bWidth;
      BYTE bHeight;
      BYTE bColorCount;
      BYTE bReserved;
      WORD wPlanes;
      WORD wBitCount;
      DWORD dwBytesInRes;
      WORD nId;
    };

    const u32 iconCount = 1;

    RESOURCEHEADER trailer = {};

    icoResourceHeader.TYPE = 0x000EFFFF; // RT_GROUP_ICON
    icoResourceHeader.NAME = 0x0001FFFF; // 1
    icoResourceHeader.HeaderSize = 32;
    icoResourceHeader.DataSize = sizeof(GRPICONDIR) + sizeof(GRPICONDIRENTRY) * iconCount;

    // reversed from the output of rc.exe 🤷‍♂️
    icoResourceHeader.MemoryFlags = 0x1030;
    icoResourceHeader.LanguageId = 0x0409;

    WriteFile(resFile, &icoResourceHeader, sizeof(RESOURCEHEADER), 0, 0);

    GRPICONDIR groupHeader = {};
    groupHeader.idCount = iconCount;
    groupHeader.idType = 1; // icon
    WriteFile(resFile, &groupHeader, sizeof(GRPICONDIR), 0, 0);

    GRPICONDIRENTRY groupDirEntry = {};
    groupDirEntry.bWidth = pngWidth;
    groupDirEntry.bHeight = pngHeight;
    groupDirEntry.bColorCount = 0;
    groupDirEntry.bReserved = 0;
    groupDirEntry.wPlanes = 1;
    groupDirEntry.dwBytesInRes = pngDataLength;
    groupDirEntry.nId = 1; // Resource ID: 1

    WriteFile(resFile, &groupDirEntry, sizeof(GRPICONDIRENTRY), 0, 0);

    CloseHandle(resFile);
  }

  free(pngData);
  return true;
}
```

This could use some tweaking to be production ready, but as a proof of concept it works great. Let me know how it works for you.

While figuring this out I discovered [ImHex](https://imhex.werwolv.net/) which is an amazing hex editor that made this work soo much easier.

## References

- [https://bytepointer.com/resources/win32_res_format.htm](https://bytepointer.com/resources/win32_res_format.htm)
- [https://learn.microsoft.com/en-us/windows/win32/menurc/resource-file-formats](https://learn.microsoft.com/en-us/windows/win32/menurc/resource-file-formats#cursor-and-icon-resources)
- [https://devblogs.microsoft.com/oldnewthing/20120720-00/?p=7083](https://devblogs.microsoft.com/oldnewthing/20120720-00/?p=7083)
- [https://github.com/retorillo/icokit/blob/master/icondir.h](https://github.com/retorillo/icokit/blob/master/icondir.h)