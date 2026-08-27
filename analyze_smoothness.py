import math
from PIL import Image
import sys

def compute_smoothness(img):
    # Convert to grayscale to simplify
    img_gray = img.convert('L')
    pixels = img_gray.load()
    width, height = img_gray.size
    
    diff = 0
    # calculate difference between adjacent columns
    for y in range(height):
        for x in range(width - 1):
            diff += abs(pixels[x, y] - pixels[x+1, y])
    return diff

if __name__ == '__main__':
    in_path = r"C:\Users\user\.gemini\antigravity\brain\da44f6c3-08b7-4f1d-8aab-1bb310fe3926\scratch\boylove_test.webp"
    img = Image.open(in_path)
    
    base_diff = compute_smoothness(img)
    print(f"Original image column difference: {base_diff}")
    
    best_s = 1
    best_diff = base_diff
    
    # Try all slices from 2 to 50
    for s in range(2, 51):
        # Generate descrambled
        width, height = img.size
        new_img = Image.new('RGB', (width, height))
        slice_width = math.floor(width / s)
        remainder = width - slice_width * (s - 1)
        for i in range(1, s + 1):
            if i == s:
                s_width = remainder
                sx = 0
                dx = slice_width * (s - 1)
            else:
                s_width = slice_width
                sx = width - slice_width * i
                dx = slice_width * (i - 1)
            box = (sx, 0, sx + s_width, height)
            region = img.crop(box)
            new_img.paste(region, (dx, 0))
            
        diff = compute_smoothness(new_img)
        if diff < best_diff:
            best_diff = diff
            best_s = s
            
    print(f"Best horizontal reverse slices: {best_s} with diff {best_diff}")
    
    # Try vertical slices
    best_v_s = 1
    best_v_diff = base_diff
    for s in range(2, 51):
        width, height = img.size
        new_img = Image.new('RGB', (width, height))
        slice_height = math.floor(height / s)
        remainder = height - slice_height * (s - 1)
        for i in range(1, s + 1):
            if i == s:
                s_height = remainder
                sy = 0
                dy = slice_height * (s - 1)
            else:
                s_height = slice_height
                sy = height - slice_height * i
                dy = slice_height * (i - 1)
            box = (0, sy, width, sy + s_height)
            region = img.crop(box)
            new_img.paste(region, (0, dy))
        diff = compute_smoothness(new_img)
        if diff < best_v_diff:
            best_v_diff = diff
            best_v_s = s
            
    print(f"Best vertical reverse slices: {best_v_s} with diff {best_v_diff}")

