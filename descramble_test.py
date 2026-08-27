import math
from PIL import Image

def descramble_boylove(input_path, output_path, num_slices=10):
    img = Image.open(input_path)
    width, height = img.size
    
    new_img = Image.new('RGB', (width, height))
    
    slice_width = math.floor(width / num_slices)
    remainder = width - slice_width * (num_slices - 1)
    
    for i in range(1, num_slices + 1):
        if i == num_slices:
            # Last slice (contains remainder)
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
        
    new_img.save(output_path)

if __name__ == '__main__':
    in_path = r"C:\Users\user\.gemini\antigravity\brain\da44f6c3-08b7-4f1d-8aab-1bb310fe3926\scratch\boylove_test.webp"
    out_path = r"C:\Users\user\.gemini\antigravity\brain\da44f6c3-08b7-4f1d-8aab-1bb310fe3926\scratch\boylove_descrambled.webp"
    descramble_boylove(in_path, out_path)
    print("Done")
