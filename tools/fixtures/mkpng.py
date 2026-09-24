"""Write a 1200x800 RGB PNG with no image library, so the upload path gets a
real file wide enough to trigger both the 400w and 700w variants."""
import struct, sys, zlib, pathlib

W, H = 1200, 800

def chunk(tag, data):
    return (struct.pack(">I", len(data)) + tag + data
            + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF))

rows = bytearray()
for y in range(H):
    rows.append(0)                        # filter type: none
    for x in range(W):
        rows += bytes(((x * 255) // W, (y * 255) // H, 90))

png = (b"\x89PNG\r\n\x1a\n"
       + chunk(b"IHDR", struct.pack(">IIBBBBB", W, H, 8, 2, 0, 0, 0))
       + chunk(b"IDAT", zlib.compress(bytes(rows), 6))
       + chunk(b"IEND", b""))

p = pathlib.Path(sys.argv[1])
p.write_bytes(png)
print("wrote", p.name, len(png), "bytes", W, "x", H)
