"""
Export Training Data for Model Retraining
Converts verification data into ML training format
"""
import sys
from pathlib import Path

project_root = Path(__file__).parent.absolute()
sys.path.insert(0, str(project_root / 'src'))

import cv2
import json
import numpy as np
import pandas as pd

from src.core import DiamondClassifier


def export_training_data(verifications_file: str, images_dir: str, output_file: str = None):
    """
    Export verified classifications as training data

    Args:
        verifications_file: Path to verifications JSON
        images_dir: Directory containing original images
        output_file: Output CSV file (default: training_data.csv)
    """
    verifications_path = Path(verifications_file)
    images_path = Path(images_dir)

    if not verifications_path.exists():
        print(f"ERROR: Verifications file not found: {verifications_file}")
        return

    if not images_path.exists():
        print(f"ERROR: Images directory not found: {images_dir}")
        return

    # Load verifications
    with open(verifications_path, 'r') as f:
        verifications = json.load(f)

    print("="*80)
    print("EXPORT TRAINING DATA")
    print("="*80)
    print(f"Verifications: {len(verifications)}")
    print(f"Images directory: {images_path}")
    print("="*80)
    print()

    # Initialize classifier to extract features
    model_file = project_root / 'models/ml_classifier/best_model_randomforest.pkl'
    feature_file = project_root / 'models/ml_classifier/feature_names.json'

    if not model_file.exists():
        print(f"ERROR: ML model not found: {model_file}")
        return

    classifier = DiamondClassifier(str(model_file), str(feature_file))

    # Extract features for each verification
    training_samples = []

    # Group by image
    by_image = {}
    for v in verifications:
        img_name = v['image']
        if img_name not in by_image:
            by_image[img_name] = []
        by_image[img_name].append(v)

    for img_idx, (img_name, img_verifications) in enumerate(by_image.items()):
        print(f"Processing {img_idx + 1}/{len(by_image)}: {img_name}")

        # Find image file
        image_file = None
        for ext in ['.jp2', '.jpg', '.jpeg', '.png']:
            potential_file = images_path / img_name
            if not potential_file.exists():
                potential_file = images_path / (Path(img_name).stem + ext)
            if potential_file.exists():
                image_file = potential_file
                break

        if image_file is None:
            print(f"  WARNING: Image not found: {img_name}")
            continue

        # Load and classify image
        image = cv2.imread(str(image_file))
        if image is None:
            print(f"  WARNING: Could not load {img_name}")
            continue

        result = classifier.classify_image(image, img_name)

        # Match verifications to classifications
        for ver in img_verifications:
            # Find matching classification
            classification = None
            for c in result.classifications:
                if c.roi_id == ver['roi_id']:
                    classification = c
                    break

            if classification is None:
                print(f"  WARNING: ROI {ver['roi_id']} not found in classifications")
                continue

            # Create training sample
            sample = {
                'image': img_name,
                'roi_id': ver['roi_id'],
                'outline_sym': classification.features['outline_sym'],
                'reflection_sym': classification.features['reflection_sym'],
                'aspect_ratio': classification.features['aspect_ratio'],
                'spot_sym': classification.features['spot_sym'],
                'has_spot': int(classification.features['has_spot']),
                'num_reflections': classification.features['num_reflections'],
                'type_emerald': 1 if ver['verified_type'] == 'emerald' else 0,
                'type_other': 1 if ver['verified_type'] == 'other' else 0,
                'label': 1 if ver['verified_orientation'] == 'table' else 0,  # 1=table, 0=tilted
                'diamond_type': ver['verified_type'],
                'orientation': ver['verified_orientation']
            }

            training_samples.append(sample)

    if len(training_samples) == 0:
        print("ERROR: No training samples extracted")
        return

    # Convert to DataFrame
    df = pd.DataFrame(training_samples)

    # Save to CSV
    if output_file is None:
        output_file = project_root / 'output' / 'training_data.csv'

    output_path = Path(output_file)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    df.to_csv(output_path, index=False)

    print()
    print("="*80)
    print("EXPORT COMPLETE")
    print("="*80)
    print(f"Training samples: {len(training_samples)}")
    print()
    print("Label distribution:")
    print(f"  TABLE: {df['label'].sum()} ({100*df['label'].mean():.1f}%)")
    print(f"  TILTED: {len(df) - df['label'].sum()} ({100*(1-df['label'].mean()):.1f}%)")
    print()
    print("Diamond type distribution:")
    for dtype in ['round', 'emerald', 'other']:
        count = (df['diamond_type'] == dtype).sum()
        if count > 0:
            print(f"  {dtype.upper()}: {count}")
    print()
    print(f"Training data saved to: {output_path}")
    print()
    print("To retrain the model, use:")
    print(f"  python train_model.py --data {output_path}")
    print()


if __name__ == '__main__':
    import argparse

    parser = argparse.ArgumentParser(description='Export training data from verifications')
    parser.add_argument('verifications', type=str, help='Path to verifications JSON file')
    parser.add_argument('images_dir', type=str, help='Directory containing original images')
    parser.add_argument('--output', type=str, help='Output CSV file (default: training_data.csv)')

    args = parser.parse_args()

    export_training_data(args.verifications, args.images_dir, args.output)
