import math
from PIL import Image

def descramble_horizontal(img, num_slices):
    width, height = img.size
    new_img = Image.new('RGB', (width, height))
    slice_width = math.floor(width / num_slices)
    remainder = width - slice_width * (num_slices - 1)
    for i in range(1, num_slices + 1):
        if i == num_slices:
            s_width = remainder
            sx = 0
            dx = slice_width * (num_slices - 1)
        else:
            s_width = slice_width
            sx = width - slice_width * i
            dx = slice_width * (i - 1)
        box = (sx, 0, sx + s_width, height)
        region = img.crop(box)
        new_img.paste(region, (dx, 0))
    return new_img

if __name__ == '__main__':
    in_path = r"C:\Users\user\.gemini\antigravity\brain\da44f6c3-08b7-4f1d-8aab-1bb310fe3926\scratch\boylove_test.webp"
    out_path = r"C:\Users\user\.gemini\antigravity\brain\da44f6c3-08b7-4f1d-8aab-1bb310fe3926\scratch\boylove_descrambled_13.webp"
    img = Image.open(in_path)
    h13 = descramble_horizontal(img, 13)
    h13.save(out_path)
    print("Done generating 13 slices")
