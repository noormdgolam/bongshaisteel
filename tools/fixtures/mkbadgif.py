"""A GIF89a header with sane 8x8 dimensions and a truncated body."""
import struct, sys, pathlib

data = b"GIF89a" + struct.pack("<HH", 8, 8) + b"\x80\x00\x00" + b"\x00" * 12
p = pathlib.Path(sys.argv[1])
p.write_bytes(data)
print("wrote", p.name, len(data), "bytes")
