"""Check 16 KB ELF segment alignment for 64-bit Android libraries in APKs and bundles."""

import struct
import sys
from pathlib import PurePosixPath
from zipfile import ZipFile


def check_native_libraries(path):
    count = 0
    with ZipFile(path) as package:
        for name in package.namelist():
            parts = PurePosixPath(name).parts
            if len(parts) < 3 or parts[-3] != "lib" or not name.endswith(".so"):
                continue
            if parts[-2] not in {"arm64-v8a", "x86_64"}:
                continue
            data = package.read(name)
            if data[:6] != b"\x7fELF\x02\x01":
                raise ValueError(f"{name}: invalid 64-bit little-endian ELF header")
            table = struct.unpack_from("<Q", data, 32)[0]
            size, entries = struct.unpack_from("<HH", data, 54)
            loads = 0
            for index in range(entries):
                segment = table + size * index
                if struct.unpack_from("<I", data, segment)[0] != 1:
                    continue
                alignment = struct.unpack_from("<Q", data, segment + 48)[0]
                if alignment < 16384:
                    raise ValueError(f"{name}: PT_LOAD alignment {alignment} is below 16 KB")
                loads += 1
            if not loads:
                raise ValueError(f"{name}: no loadable ELF segments")
            count += 1
    print(f"{path}: {count} 64-bit native libraries passed 16 KB ELF checks")


for archive in sys.argv[1:]:
    check_native_libraries(archive)
