import math
from PIL import Image
import sys

def find_slice_boundaries(img_path):
    img = Image.open(img_path).convert('L')
    width, height = img.size
    pixels = img.load()
    
    col_diffs = []
    for x in range(1, width):
        diff = 0
        for y in range(height):
            diff += abs(pixels[x, y] - pixels[x-1, y])
        col_diffs.append((x, diff))
        
    # Sort by difference descending
    col_diffs.sort(key=lambda x: x[1], reverse=True)
    
    print(f"Image width: {width}")
    print("Top 20 vertical boundaries by discontinuity:")
    for i in range(20):
        print(f"X: {col_diffs[i][0]}, Diff: {col_diffs[i][1]}")

if __name__ == '__main__':
    in_path = r"C:\Users\user\.gemini\antigravity\brain\da44f6c3-08b7-4f1d-8aab-1bb310fe3926\scratch\boylove_test.webp"
    find_slice_boundaries(in_path)
