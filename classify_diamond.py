"""
Diamond Classification and Grading System
ML-based orientation detection using Random Forest classifier
"""
import sys
from pathlib import Path

project_root = Path(__file__).parent.absolute()
sys.path.insert(0, str(project_root / 'src'))

import cv2
import numpy as np
import joblib
import json
from preprocessing import SAMDiamondDetector
from classification import PureGeometricClassifier
from grading import PickupGrader


def classify_diamond(image_path: str, output_dir: str = None):
    """
    Classify and grade diamonds using ML classifier

    Args:
        image_path: Path to input image
        output_dir: Output directory for results (default: output/)

    Returns:
        dict: Classification results
    """
    # Load ML model
    model_file = project_root / 'models/ml_classifier/best_model_randomforest.pkl'
    feature_file = project_root / 'models/ml_classifier/feature_names.json'

    if not model_file.exists():
        raise FileNotFoundError(f"ML model not found: {model_file}")

    model = joblib.load(model_file)
    with open(feature_file, 'r') as f:
        feature_names = json.load(f)

    # Setup output directory
    if output_dir is None:
        output_dir = project_root / 'output'

    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    # Load image
    image = cv2.imread(str(image_path))
    if image is None:
        raise ValueError(f"Could not load image: {image_path}")

    h, w = image.shape[:2]

    # Calculate area thresholds based on image size
    image_pixels = h * w
    base_pixels = 1944 * 2592
    scale_factor = np.sqrt(image_pixels / base_pixels)
    base_area_scale = scale_factor ** 2
    min_area = max(30, int(200 * base_area_scale))
    max_area = max(1000, int(20000 * base_area_scale))

    # Detect diamonds
    detector = SAMDiamondDetector(
        min_area=min_area,
        max_area=max_area,
        padding=10,
        merge_overlapping=False
    )

    diamond_rois = detector.detect(image)

    if len(diamond_rois) == 0:
        return {
            'image': Path(image_path).name,
            'total_diamonds': 0,
            'table_count': 0,
            'tilted_count': 0,
            'pickable_count': 0,
            'invalid_count': 0,
            'classifications': []
        }

    # Extract features and classify
    feature_extractor = PureGeometricClassifier()
    table_count = 0
    tilted_count = 0
    classifications = []

    for roi in diamond_rois:
        # Extract geometric features
        result = feature_extractor.analyze(roi.contour, roi.mask, roi.roi_image)

        diamond_type = roi.detected_type if hasattr(roi, 'detected_type') else 'other'

        # Prepare features for ML model
        features = [
            result.outline_symmetry_score,
            result.reflection_symmetry_score,
            result.aspect_ratio,
            result.spot_symmetry_score,
            1 if result.has_large_central_spot else 0,
            result.num_reflection_spots,
            1 if diamond_type == 'emerald' else 0,
            1 if diamond_type == 'other' else 0
        ]

        # Predict orientation
        X = np.array([features])
        prediction = model.predict(X)[0]
        probability = model.predict_proba(X)[0]

        orientation = 'table' if prediction == 1 else 'tilted'
        confidence = probability[prediction]

        roi.orientation = orientation
        roi.ml_confidence = confidence

        if orientation == 'table':
            table_count += 1
        else:
            tilted_count += 1

        classifications.append({
            'roi_id': roi.id,
            'diamond_type': diamond_type,
            'orientation': orientation,
            'confidence': float(confidence)
        })

    # Grade diamonds
    grader = PickupGrader(check_orientation=True, image_width_px=w)
    graded_diamonds = grader.grade_diamonds(diamond_rois)

    pickable = [gd for gd in graded_diamonds if gd.grade is not None and gd.grade >= 0]
    invalid = [gd for gd in graded_diamonds if gd.grade == -1]

    # Save results
    img_name = Path(image_path).stem

    json_output = {
        'image': Path(image_path).name,
        'total_diamonds': len(diamond_rois),
        'table_count': table_count,
        'tilted_count': tilted_count,
        'pickable_count': len(pickable),
        'invalid_count': len(invalid),
        'average_grade': sum(gd.grade for gd in pickable) / len(pickable) if len(pickable) > 0 else 0,
        'classifications': classifications,
        'model': 'RandomForest',
        'model_accuracy': '95.6%'
    }

    json_file = output_dir / f'{img_name}.json'
    with open(json_file, 'w') as f:
        json.dump(json_output, f, indent=2)

    # Save visualization
    vis_image = grader.visualize_pickup_order(image, graded_diamonds)
    vis_file = output_dir / f'{img_name}.jpg'
    cv2.imwrite(str(vis_file), vis_image)

    return json_output


if __name__ == '__main__':
    import argparse

    parser = argparse.ArgumentParser(description='Diamond classification and grading')
    parser.add_argument('image', type=str, help='Path to image file')
    parser.add_argument('--output-dir', type=str, help='Output directory (optional)')

    args = parser.parse_args()

    result = classify_diamond(args.image, args.output_dir)

    print("\nRESULTS:")
    print(f"Total diamonds: {result['total_diamonds']}")
    print(f"TABLE: {result['table_count']}")
    print(f"TILTED: {result['tilted_count']}")
    print(f"Pickable: {result['pickable_count']}")
