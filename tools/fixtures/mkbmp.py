"""Write a small valid 24-bit BMP. getimagesize() recognises it, so it proves
the upload allowlist rejects image types the CMS does not want."""
import struct, sys, pathlib

W, H = 8, 8
row = bytes((200, 120, 40)) * W
pad = b"\x00" * ((4 - (W * 3) % 4) % 4)
pixels = (row + pad) * H

dib = struct.pack("<IiiHHIIiiII", 40, W, H, 1, 24, 0, len(pixels), 96, 96, 0, 0)
bmp = b"BM" + struct.pack("<IHHI", 14 + len(dib) + len(pixels), 0, 0, 14 + len(dib)) + dib + pixels

p = pathlib.Path(sys.argv[1])
p.write_bytes(bmp)
print("wrote", p.name, len(bmp), "bytes")
