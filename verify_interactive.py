"""
Mode 2: Interactive ROI Verification
Shows each ROI and verifies classification correctness
Saves verification data for future retraining
"""
import sys
from pathlib import Path

project_root = Path(__file__).parent.absolute()
sys.path.insert(0, str(project_root / 'src'))

import cv2
import json
import numpy as np
import matplotlib.pyplot as plt
from matplotlib.patches import Rectangle
from datetime import datetime

from src.core import DiamondClassifier


class InteractiveVerifier:
    """Interactive verification of diamond classifications"""

    def __init__(self, classifier: DiamondClassifier):
        self.classifier = classifier
        self.verifications = []
        self.current_idx = 0
        self.should_quit = False
        self.current_image = None
        self.current_result = None
        self.current_image_path = None

    def verify_image(self, image_path: str):
        """
        Interactively verify all ROIs in an image

        Args:
            image_path: Path to image file
        """
        self.current_image_path = Path(image_path)

        # Load image
        self.current_image = cv2.imread(str(image_path))
        if self.current_image is None:
            print(f"ERROR: Could not load {image_path}")
            return

        # Classify image
        print(f"\nClassifying {self.current_image_path.name}...")
        self.current_result = self.classifier.classify_image(
            self.current_image,
            self.current_image_path.name
        )

        if self.current_result.total_diamonds == 0:
            print("No diamonds detected in image")
            return

        print(f"Found {self.current_result.total_diamonds} diamonds")
        print()

        # Start interactive verification
        self._start_interactive_session()

    def _start_interactive_session(self):
        """Start matplotlib interactive session"""
        print("="*80)
        print("INTERACTIVE VERIFICATION")
        print("="*80)
        print("KEYBOARD CONTROLS:")
        print("  y = Classification is CORRECT")
        print("  n = Classification is WRONG (will ask for correct label)")
        print("  s = SKIP (uncertain)")
        print("  q = QUIT and save progress")
        print("="*80)
        print()

        plt.ion()
        self.fig, (self.ax_context, self.ax_roi) = plt.subplots(1, 2, figsize=(16, 8))
        self.fig.canvas.mpl_connect('key_press_event', self._on_key)

        self.current_idx = 0
        self._update_display()
        plt.show(block=True)

    def _on_key(self, event):
        """Handle keyboard input"""
        if self.current_idx >= len(self.current_result.classifications):
            return

        classification = self.current_result.classifications[self.current_idx]

        if event.key == 'y':
            # Correct classification
            self.verifications.append({
                'image': self.current_image_path.name,
                'roi_id': classification.roi_id,
                'predicted_type': classification.diamond_type,
                'predicted_orientation': classification.orientation,
                'confidence': classification.confidence,
                'is_correct': True,
                'verified_type': classification.diamond_type,
                'verified_orientation': classification.orientation,
                'timestamp': datetime.now().isoformat()
            })
            print(f"✓ ROI {classification.roi_id}: Verified as CORRECT ({classification.diamond_type.upper()}, {classification.orientation.upper()})")
            self.current_idx += 1

        elif event.key == 'n':
            # Wrong classification - need correction
            print(f"\n✗ ROI {classification.roi_id}: Marked as WRONG")
            print(f"  Predicted: {classification.diamond_type.upper()}, {classification.orientation.upper()}")

            # Ask for correct labels
            plt.close(self.fig)

            correct_orientation = input("  Enter correct orientation (table/tilted): ").strip().lower()
            while correct_orientation not in ['table', 'tilted']:
                correct_orientation = input("  Please enter 'table' or 'tilted': ").strip().lower()

            correct_type = input(f"  Enter correct diamond type (round/emerald/other) [default: {classification.diamond_type}]: ").strip().lower()
            if correct_type == '':
                correct_type = classification.diamond_type
            while correct_type not in ['round', 'emerald', 'other']:
                correct_type = input("  Please enter 'round', 'emerald', or 'other': ").strip().lower()

            self.verifications.append({
                'image': self.current_image_path.name,
                'roi_id': classification.roi_id,
                'predicted_type': classification.diamond_type,
                'predicted_orientation': classification.orientation,
                'confidence': classification.confidence,
                'is_correct': False,
                'verified_type': correct_type,
                'verified_orientation': correct_orientation,
                'timestamp': datetime.now().isoformat()
            })

            print(f"  Saved correction: {correct_type.upper()}, {correct_orientation.upper()}")
            self.current_idx += 1

            # Reopen figure
            self.fig, (self.ax_context, self.ax_roi) = plt.subplots(1, 2, figsize=(16, 8))
            self.fig.canvas.mpl_connect('key_press_event', self._on_key)
            plt.ion()

        elif event.key == 's':
            # Skip
            print(f"⊘ ROI {classification.roi_id}: Skipped")
            self.current_idx += 1

        elif event.key == 'q':
            # Quit
            self.should_quit = True
            plt.close(self.fig)
            return

        # Update display or finish
        if self.current_idx >= len(self.current_result.classifications):
            print("\n✓ All ROIs verified!")
            plt.close(self.fig)
            self.should_quit = True
        elif not self.should_quit:
            self._update_display()

    def _update_display(self):
        """Update matplotlib display with current ROI"""
        if self.current_idx >= len(self.current_result.classifications):
            return

        classification = self.current_result.classifications[self.current_idx]

        # Clear axes
        self.ax_context.clear()
        self.ax_roi.clear()

        # Left: Full image context
        img_rgb = cv2.cvtColor(self.current_image, cv2.COLOR_BGR2RGB)
        self.ax_context.imshow(img_rgb)

        # Draw all bounding boxes
        for c in self.current_result.classifications:
            x, y, w, h = c.bounding_box
            color = 'yellow' if c.roi_id == classification.roi_id else 'gray'
            linewidth = 3 if c.roi_id == classification.roi_id else 1
            alpha = 1.0 if c.roi_id == classification.roi_id else 0.3

            rect = Rectangle((x, y), w, h, fill=False,
                            edgecolor=color, linewidth=linewidth, alpha=alpha)
            self.ax_context.add_patch(rect)

            if c.roi_id == classification.roi_id:
                self.ax_context.text(x, y - 10, f"ROI #{c.roi_id}",
                                   color='yellow', fontsize=12, fontweight='bold')

        self.ax_context.set_title(f'Context: {self.current_image_path.name}',
                                 fontsize=12, fontweight='bold')
        self.ax_context.axis('off')

        # Right: Zoomed ROI
        roi_image = self.classifier.get_roi_image(classification.roi_id)
        if roi_image is not None:
            roi_rgb = cv2.cvtColor(roi_image, cv2.COLOR_BGR2RGB)
            self.ax_roi.imshow(roi_rgb)

        prediction_color = 'green' if classification.orientation == 'table' else 'orange'
        self.ax_roi.set_title(
            f'ROI #{classification.roi_id}\n' +
            f'Type: {classification.diamond_type.upper()}\n' +
            f'Orientation: {classification.orientation.upper()} ({100*classification.confidence:.1f}% confidence)',
            fontsize=12, fontweight='bold', color=prediction_color
        )
        self.ax_roi.axis('off')

        # Overall title
        self.fig.suptitle(
            f'Verifying {self.current_idx + 1}/{len(self.current_result.classifications)} | ' +
            f'Verified: {len(self.verifications)} | ' +
            f'Press: y=CORRECT, n=WRONG, s=SKIP, q=QUIT',
            fontsize=14, fontweight='bold'
        )

        plt.draw()

    def save_verifications(self, output_file: str):
        """
        Save verification results for future retraining

        Args:
            output_file: Path to save verification JSON
        """
        if len(self.verifications) == 0:
            print("No verifications to save")
            return

        output_path = Path(output_file)
        output_path.parent.mkdir(parents=True, exist_ok=True)

        with open(output_path, 'w') as f:
            json.dump(self.verifications, f, indent=2)

        # Calculate statistics
        total = len(self.verifications)
        correct = sum(1 for v in self.verifications if v['is_correct'])
        accuracy = 100 * correct / total if total > 0 else 0

        print()
        print("="*80)
        print("VERIFICATION SUMMARY")
        print("="*80)
        print(f"Total verified: {total}")
        print(f"Correct predictions: {correct}")
        print(f"Wrong predictions: {total - correct}")
        print(f"Verified accuracy: {accuracy:.1f}%")
        print()
        print(f"Verification data saved to: {output_path}")
        print("This data can be used for future model retraining")
        print()


def verify_batch(input_path: str, output_file: str = None):
    """
    Interactively verify classifications in batch

    Args:
        input_path: Path to image file or directory
        output_file: Path to save verification data (default: verifications.json)
    """
    input_path = Path(input_path)

    if not input_path.exists():
        print(f"ERROR: Path not found: {input_path}")
        return

    # Get image files
    if input_path.is_file():
        image_files = [input_path]
    elif input_path.is_dir():
        image_extensions = ['.jp2', '.jpg', '.jpeg', '.png']
        image_files = []
        for ext in image_extensions:
            image_files.extend(input_path.glob(f'*{ext}'))
    else:
        print(f"ERROR: Invalid path: {input_path}")
        return

    if len(image_files) == 0:
        print(f"ERROR: No images found in {input_path}")
        return

    # Initialize classifier
    model_file = project_root / 'models/ml_classifier/best_model_randomforest.pkl'
    feature_file = project_root / 'models/ml_classifier/feature_names.json'

    if not model_file.exists():
        print(f"ERROR: ML model not found: {model_file}")
        return

    classifier = DiamondClassifier(str(model_file), str(feature_file))
    verifier = InteractiveVerifier(classifier)

    print("="*80)
    print("BATCH INTERACTIVE VERIFICATION")
    print("="*80)
    print(f"Images to verify: {len(image_files)}")
    print("="*80)

    # Verify each image
    for img_idx, image_path in enumerate(image_files):
        print(f"\n--- Image {img_idx + 1}/{len(image_files)} ---")
        verifier.verify_image(str(image_path))

        if verifier.should_quit:
            print("\nQuitting verification...")
            break

    # Save verification data
    if output_file is None:
        output_file = project_root / 'output' / 'verifications.json'

    verifier.save_verifications(str(output_file))


if __name__ == '__main__':
    import argparse

    parser = argparse.ArgumentParser(description='Interactive diamond classification verification')
    parser.add_argument('input', type=str, help='Path to image file or directory')
    parser.add_argument('--output', type=str, help='Verification output file (default: verifications.json)')

    args = parser.parse_args()

    verify_batch(args.input, args.output)
