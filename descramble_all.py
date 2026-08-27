import math
from PIL import Image

def descramble_vertical(img, num_slices):
    width, height = img.size
    new_img = Image.new('RGB', (width, height))
    slice_height = math.floor(height / num_slices)
    remainder = height - slice_height * (num_slices - 1)
    for i in range(1, num_slices + 1):
        if i == num_slices:
            s_height = remainder
            sy = 0
            dy = slice_height * (num_slices - 1)
        else:
            s_height = slice_height
            sy = height - slice_height * i
            dy = slice_height * (i - 1)
        box = (0, sy, width, sy + s_height)
        region = img.crop(box)
        new_img.paste(region, (0, dy))
    return new_img

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
    img = Image.open(in_path)
    
    # 10 slices horizontal
    h10 = descramble_horizontal(img, 10)
    h10.save(r"C:\Users\user\.gemini\antigravity\brain\da44f6c3-08b7-4f1d-8aab-1bb310fe3926\scratch\boylove_h10.webp")
    
    # 10 slices vertical
    v10 = descramble_vertical(img, 10)
    v10.save(r"C:\Users\user\.gemini\antigravity\brain\da44f6c3-08b7-4f1d-8aab-1bb310fe3926\scratch\boylove_v10.webp")
    
    # Let's also do 10 slices vertical BUT WITHOUT REVERSE (JMComic Mode 0 style)
    # Wait, Mode 0 is not reverse, it just shifts pieces based on MD5. 
    # But boylove JS explicitly does REVERSE. Let's just give these two to the user.
    print("Done")
