#!/usr/bin/env python3
"""
Convert icon.png to SVG files:
- icon.svg: Full color vectorized version
- activitybar-icon.svg: Monochrome silhouette with currentColor for VS Code themes
"""

from PIL import Image
import vtracer
import re

def convert_to_color_svg(input_png: str, output_svg: str) -> None:
    """Convert PNG to full color SVG."""
    vtracer.convert_image_to_svg_py(
        input_png,
        output_svg,
        colormode='color',
        hierarchical='stacked',
        mode='spline',
        filter_speckle=4,
        color_precision=6,
        layer_difference=16,
        corner_threshold=60,
        length_threshold=4.0,
        max_iterations=10,
        splice_threshold=45,
        path_precision=3
    )
    print(f'Created color SVG: {output_svg}')


def convert_to_monochrome_svg(input_png: str, output_svg: str) -> None:
    """Convert PNG to monochrome SVG with currentColor for activity bar."""
    # Load the original PNG
    img = Image.open(input_png).convert('RGBA')
    data = list(img.getdata())
    width, height = img.size

    # Create silhouette - keep non-transparent, non-white pixels as black
    new_data = []
    for item in data:
        r, g, b, a = item
        if a > 50 and not (r > 250 and g > 250 and b > 250):
            new_data.append((0, 0, 0, 255))  # Black
        else:
            new_data.append((255, 255, 255, 255))  # White background

    img_bw = Image.new('RGBA', (width, height))
    img_bw.putdata(new_data)
    img_bw.save('/tmp/icon_silhouette.png')

    # Convert to SVG
    vtracer.convert_image_to_svg_py(
        '/tmp/icon_silhouette.png',
        '/tmp/silhouette.svg',
        colormode='binary',
        hierarchical='stacked',
        mode='spline',
        filter_speckle=4,
        corner_threshold=60,
        length_threshold=4.0,
        max_iterations=10,
        splice_threshold=45,
        path_precision=3
    )

    # Read and extract black paths only
    with open('/tmp/silhouette.svg', 'r') as f:
        content = f.read()

    paths = re.findall(r'<path[^>]+/>', content)
    black_paths = [p for p in paths if '#000' in p or 'black' in p.lower()]

    if not black_paths:
        black_paths = [p for p in paths if '#fff' not in p and '#FFF' not in p]

    # Create SVG with currentColor
    svg_content = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1206 1206" width="24" height="24" fill="currentColor">\n'

    for path in black_paths:
        path = re.sub(r'fill="[^"]*"', 'fill="currentColor"', path)
        svg_content += path + '\n'

    svg_content += '</svg>'

    with open(output_svg, 'w') as f:
        f.write(svg_content)

    print(f'Created monochrome SVG: {output_svg}')


if __name__ == '__main__':
    import os

    script_dir = os.path.dirname(os.path.abspath(__file__))
    project_dir = os.path.dirname(script_dir)

    input_png = os.path.join(project_dir, 'icon.png')
    color_svg = os.path.join(project_dir, 'icon.svg')
    mono_svg = os.path.join(project_dir, 'activitybar-icon.svg')

    convert_to_color_svg(input_png, color_svg)
    convert_to_monochrome_svg(input_png, mono_svg)

    print('Done!')
