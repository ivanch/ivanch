import base64
import sys

KEY = b"lain"

def xor_bytes(data: bytes, key: bytes) -> bytes:
    return bytes(b ^ key[i % len(key)] for i, b in enumerate(data))

def encrypt(text: str) -> str:
    data = text.encode("utf-8")
    xored = xor_bytes(data, KEY)
    return base64.b64encode(xored).decode("ascii")

def decrypt(b64text: str) -> str:
    xored = base64.b64decode(b64text)
    return xor_bytes(xored, KEY).decode("utf-8")

def main():
    if len(sys.argv) > 1:
        # Use command-line arguments as the text
        text = " ".join(sys.argv[1:])
    else:
        text = input("Text to encrypt: ")
    print(encrypt(text))

if __name__ == "__main__":
    main()
