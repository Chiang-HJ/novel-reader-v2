import sys

def parse_varint(data, offset):
    result = 0
    shift = 0
    while True:
        if offset >= len(data): break
        b = data[offset]
        offset += 1
        result |= (b & 0x7f) << shift
        if not (b & 0x80):
            break
        shift += 7
    return result, offset

def decode_proto(data, offset, end, level=0):
    indent = '  ' * level
    while offset < end:
        tag_type, offset = parse_varint(data, offset)
        tag = tag_type >> 3
        wire_type = tag_type & 7
        if wire_type == 0:
            val, offset = parse_varint(data, offset)
            print(f'{indent}{tag}: {val}')
        elif wire_type == 1:
            if offset + 8 > end: break
            import struct
            val = struct.unpack('<d', data[offset:offset+8])[0]
            print(f'{indent}{tag}: {val} (double)')
            offset += 8
        elif wire_type == 2:
            length, offset = parse_varint(data, offset)
            if offset + length > end: break
            print(f'{indent}{tag}: [{length} bytes] hex: {data[offset:offset+length].hex()}')
            offset += length
        elif wire_type == 5:
            if offset + 4 > end: break
            import struct
            val = struct.unpack('<f', data[offset:offset+4])[0]
            print(f'{indent}{tag}: {val} (float)')
            offset += 4
        else:
            print(f'{indent}{tag}: unknown wire type {wire_type}')
            break

data = bytes.fromhex('0adc01d0c28302c0449609297f33af220e7ce54284a7acf30d1f57fd97f33429cbc6519d07490997984506272c74e04ac589d1069a0dc2fb6acd5f180ae4c62d713881a06da3cbe29c2f04adfabc1adbc1ebdb0859df82bdfe10178c7b69ece8961371e5d32ffd2a22d9198e26bb6c4cfec5faa11569b9f5f064444b6d053e5b76c86687f15187970e90be3014def02e4906d5bad2b87dab112c98c0898c47b937f5799faa1c47917843c12ba37b7b7b65aa20ba77753b854ecf4cf70b263c80e3c20a5bdd9e2057f5f57eb84d4fb45c3a48967b461dba44ad14169eb77d9a120c98d0dbe500cfbdacba8fc8f21d0000904120012a0874656c65706f727430a5eed3a28a3438a591f8a08a3440901c4a0ce5b9bde99d88e8b7afe5be9150035a80026aed58c6b8168005f375fa8e5859fa9d2f6897094c6a3d3133df4d1b841eb0493d5dafd1a8dd89dbe49ea47a474ab5c6533edd22132b7ee157c39f4ebb39cd64e01dc845bcab8569967d003ca402f7cf7b4b963202c4b071fe168747d2285ea2d165d5c2f7f100e93a330178db5cfa4a96eedbc3547fa7a463c1c187a24f2ce0cb2ad74949f579a5cbc2f4199cc3c929d3e34fb359bc72140167eb89f5a9e12fc3ee8b8f4cea5586c975c0955b80b6a28cc980c1c95e70f43ff520830ff7021f02208f2e19c07056f6c2696526da0c121132274362efea248a8989bfec4cc9f352daac72522c61299f432a554515c17bdddc2ddcd3926a9ae04331268e00b63d')
decode_proto(data, 0, len(data))
