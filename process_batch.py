"""
Mode 1: Batch Processing and Save
Processes images/folders and saves graded results
"""
import sys
from pathlib import Path

project_root = Path(__file__).parent.absolute()
sys.path.insert(0, str(project_root / 'src'))

import cv2
import json
from typing import List

from src.core import DiamondClassifier


def process_batch(input_path: str, output_dir: str = None):
    """
    Batch process images and save results

    Args:
        input_path: Path to image file or directory
        output_dir: Output directory (default: output/)
    """
    input_path = Path(input_path)

    if not input_path.exists():
        print(f"ERROR: Path not found: {input_path}")
        return

    # Determine if single image or folder
    if input_path.is_file():
        image_files = [input_path]
        dataset_name = input_path.stem
    elif input_path.is_dir():
        # Find all images in directory
        image_extensions = ['.jp2', '.jpg', '.jpeg', '.png']
        image_files = []
        for ext in image_extensions:
            image_files.extend(input_path.glob(f'*{ext}'))
        dataset_name = input_path.name
    else:
        print(f"ERROR: Invalid path: {input_path}")
        return

    if len(image_files) == 0:
        print(f"ERROR: No images found in {input_path}")
        return

    # Setup output directories
    if output_dir is None:
        output_dir = project_root / 'output'

    output_dir = Path(output_dir)
    images_dir = output_dir / 'graded_shared_final' / dataset_name
    json_dir = output_dir / 'graded_shared_final_json' / dataset_name

    images_dir.mkdir(parents=True, exist_ok=True)
    json_dir.mkdir(parents=True, exist_ok=True)

    # Initialize classifier
    model_file = project_root / 'models/ml_classifier/best_model_randomforest.pkl'
    feature_file = project_root / 'models/ml_classifier/feature_names.json'

    if not model_file.exists():
        print(f"ERROR: ML model not found: {model_file}")
        return

    classifier = DiamondClassifier(str(model_file), str(feature_file))

    print("="*80)
    print("BATCH DIAMOND CLASSIFICATION AND GRADING")
    print("="*80)
    print(f"Input: {input_path}")
    print(f"Images: {len(image_files)}")
    print(f"Output images: {images_dir}")
    print(f"Output JSONs: {json_dir}")
    print("="*80)
    print()

    # Process each image
    total_images = 0
    total_diamonds = 0
    total_table = 0
    total_tilted = 0
    batch_results = []

    for img_idx, image_path in enumerate(image_files):
        print(f"Processing {img_idx + 1}/{len(image_files)}: {image_path.name}")

        # Load image
        image = cv2.imread(str(image_path))
        if image is None:
            print(f"  WARNING: Could not load {image_path.name}")
            continue

        # Classify
        result = classifier.classify_image(image, image_path.name)

        # Save JSON
        json_file = json_dir / f'{image_path.stem}.json'
        with open(json_file, 'w') as f:
            json.dump(result.to_dict(), f, indent=2)

        # Save visualization
        vis_image = classifier.get_visualization()
        if vis_image is not None:
            vis_file = images_dir / f'{image_path.stem}.jpg'
            cv2.imwrite(str(vis_file), vis_image)

        # Update statistics
        total_images += 1
        total_diamonds += result.total_diamonds
        total_table += result.table_count
        total_tilted += result.tilted_count

        batch_results.append({
            'image': image_path.name,
            'diamonds': result.total_diamonds,
            'table': result.table_count,
            'tilted': result.tilted_count,
            'pickable': result.pickable_count
        })

        print(f"  Found {result.total_diamonds} diamonds (TABLE: {result.table_count}, TILTED: {result.tilted_count})")

    print()
    print("="*80)
    print("BATCH PROCESSING COMPLETE")
    print("="*80)
    print(f"Images processed: {total_images}")
    print(f"Total diamonds: {total_diamonds}")
    if total_diamonds > 0:
        print(f"  TABLE:  {total_table} ({100*total_table/total_diamonds:.1f}%)")
        print(f"  TILTED: {total_tilted} ({100*total_tilted/total_diamonds:.1f}%)")
    print()
    print(f"Images saved to: {images_dir}")
    print(f"JSONs saved to: {json_dir}")
    print()

    # Save batch summary
    summary_file = json_dir / 'batch_summary.json'
    with open(summary_file, 'w') as f:
        json.dump({
            'total_images': total_images,
            'total_diamonds': total_diamonds,
            'total_table': total_table,
            'total_tilted': total_tilted,
            'results': batch_results,
            'model': 'RandomForest',
            'model_accuracy': '95.6%'
        }, f, indent=2)

    print(f"Batch summary saved to: {summary_file}")
    print()


if __name__ == '__main__':
    import argparse

    parser = argparse.ArgumentParser(description='Batch diamond classification and grading')
    parser.add_argument('input', type=str, help='Path to image file or directory')
    parser.add_argument('--output-dir', type=str, help='Output directory (optional)')

    args = parser.parse_args()

    process_batch(args.input, args.output_dir)
