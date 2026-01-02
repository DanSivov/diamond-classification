# Diamond Classification and Grading System

ML-based diamond orientation detection and pickup grading system using Random Forest classifier.

## 🌐 Web Interface

**Live Demo**: Access the web interface at your GitHub Pages URL after deployment.

The web interface provides team collaboration features:
- **Batch Review**: Upload and review JSON classification results
- **ROI Verification**: Web-based interactive verification system
- **Statistics Dashboard**: Real-time accuracy and performance metrics
- **Export Functionality**: Download verification data for model retraining

See [Web Interface Guide](#web-interface-guide) below for detailed instructions.

## Features

- **Automated Diamond Detection**: Uses FastSAM for robust segmentation
- **Auto Type Detection**: Automatically classifies diamond type (round, emerald, marquise, baguette)
- **ML-Based Classification**: Random Forest classifier with 95.6% accuracy
- **Pickup Grading**: Automatic grading for robotic pickup priority
- **Two Operation Modes**: Batch processing or interactive verification
- **Retraining Pipeline**: Export verified data for model improvement
- **Web Interface**: Team collaboration and verification portal

## Model Performance

- **Accuracy**: 95.6% on validation set
- **Training Data**: 681 labeled samples (emerald + marquise)
- **Features**: 8 geometric features extracted from diamond shape and reflections

## Installation

### Requirements

```bash
pip install -r requirements.txt
```

### Required Files

- `FastSAM-x.pt` - Place in project root directory
- Download from: https://github.com/CASIA-IVA-Lab/FastSAM

## Usage

### Mode 1: Batch Processing (Save Results)

Process images and save graded results to output folder.

**Single Image:**
```bash
python process_batch.py path/to/image.jpg
```

**Folder of Images:**
```bash
python process_batch.py path/to/images/
```

**Custom Output Directory:**
```bash
python process_batch.py path/to/images/ --output-dir results/
```

**Output Structure:**
```
output/
├── graded_shared_final/
│   └── dataset_name/
│       ├── image1.jpg        # Graded visualization
│       └── image2.jpg
└── graded_shared_final_json/
    └── dataset_name/
        ├── image1.json       # Classification results
        ├── image2.json
        └── batch_summary.json
```

### Mode 2: Interactive Verification

Verify each ROI classification interactively for quality control and retraining data collection.

**Verify Single Image:**
```bash
python verify_interactive.py path/to/image.jpg
```

**Verify Folder:**
```bash
python verify_interactive.py path/to/images/
```

**Keyboard Controls:**
- `y` = Classification is CORRECT
- `n` = Classification is WRONG (prompts for correct label)
- `s` = SKIP (uncertain)
- `q` = QUIT and save progress

**Output:**
```
output/verifications.json
```

This file contains all verification data for model retraining.

### Export Training Data for Retraining

Convert verification data into ML training format:

```bash
python export_training_data.py output/verifications.json path/to/original/images/
```

**Output:**
```
output/training_data.csv
```

This CSV contains extracted features and verified labels, ready for retraining.

## Output Formats

### JSON Results

```json
{
  "image_name": "diamond.jpg",
  "total_diamonds": 10,
  "table_count": 7,
  "tilted_count": 3,
  "pickable_count": 5,
  "invalid_count": 2,
  "average_grade": 6.8,
  "classifications": [
    {
      "roi_id": 0,
      "diamond_type": "emerald",      // Auto-detected
      "orientation": "table",          // ML predicted
      "confidence": 0.95,
      "features": {
        "outline_sym": 0.87,
        "reflection_sym": 0.82,
        "aspect_ratio": 0.65,
        "spot_sym": 0.79,
        "has_spot": true,
        "num_reflections": 3
      },
      "bounding_box": [100, 150, 80, 60],
      "center": [140.5, 180.2],
      "area": 4800.0
    }
  ],
  "model_name": "RandomForest",
  "model_accuracy": "95.6%"
}
```

### Verification Data (for Retraining)

```json
[
  {
    "image": "diamond.jpg",
    "roi_id": 0,
    "predicted_type": "emerald",
    "predicted_orientation": "table",
    "confidence": 0.95,
    "is_correct": true,
    "verified_type": "emerald",
    "verified_orientation": "table",
    "timestamp": "2026-01-02T18:30:00"
  }
]
```

### Visualization

- Green markers with numbers: Pickable diamonds (ordered by priority 1, 2, 3...)
- Red X markers: Invalid diamonds (too close to neighbors)
- No markers: Tilted diamonds (not pickable)

## Model Details

### Auto Diamond Type Detection

The system automatically detects diamond type based on shape analysis:
- **Round**: Aspect ratio > 0.85 (nearly circular)
- **Emerald**: Aspect ratio < 0.70 (rectangular)
- **Other**: Marquise, baguette, and other cuts

No user input required for diamond type classification.

### Features Used

1. **Outline Symmetry**: Shape symmetry of diamond contour
2. **Reflection Symmetry**: Symmetry of internal light reflections
3. **Aspect Ratio**: Minor/major axis ratio
4. **Spot Symmetry**: Symmetry of bright spot regions
5. **Has Large Spot**: Presence of central bright region
6. **Number of Reflections**: Count of distinct bright regions
7. **Diamond Type (Emerald)**: Binary indicator
8. **Diamond Type (Other)**: Binary indicator

### Classification Logic

- **TABLE**: Diamond positioned table-up (ready for pickup)
- **TILTED**: Diamond tilted or on side (not pickable)

### Grading System

- **Grade 0-10**: Pickup priority based on isolation
- **Grade -1**: Invalid (too close to neighbors)
- **Grade None**: Tilted (not pickable)

## Workflow

### Production Workflow (Mode 1)

```
1. Capture images → 2. Run process_batch.py → 3. Review graded images
```

### Quality Control Workflow (Mode 2)

```
1. Capture images → 2. Run verify_interactive.py → 3. Review each ROI →
4. Export training data → 5. Retrain model (future)
```

## Technical Architecture

```
src/
├── core.py                   # Core classification engine
├── preprocessing/
│   └── sam_detector.py       # Diamond detection
├── classification/
│   ├── pure_geometric_classifier.py  # Feature extraction
│   └── shape_based_symmetry.py       # Symmetry analysis
└── grading/
    └── pickup_grader.py      # Pickup grading logic

Scripts:
├── process_batch.py          # Mode 1: Batch processing
├── verify_interactive.py     # Mode 2: Interactive verification
└── export_training_data.py   # Retraining data export

models/
└── ml_classifier/
    ├── best_model_randomforest.pkl  # Trained ML model
    └── feature_names.json            # Feature list
```

## Web Interface Guide

### Accessing the Web Interface

1. **GitHub Pages Deployment**:
   - Push the `public/` directory to your GitHub repository
   - Enable GitHub Pages in repository settings
   - Select the branch containing `public/` folder
   - Access at: `https://yourusername.github.io/repository-name/`

2. **Local Development**:
   - Open `public/index.html` in a web browser
   - Or use a local server: `python -m http.server 8000` in the `public/` directory

### Using the Web Interface

#### Tab 1: Batch Review
1. Run batch processing locally:
   ```bash
   python process_batch.py path/to/images/
   ```

2. Upload generated JSON files from `output/graded_shared_final_json/`

3. Review classification statistics and results

#### Tab 2: ROI Verification
1. Upload classification JSON file (from batch processing)

2. Optionally upload original images for visual context

3. Use keyboard shortcuts to verify each ROI:
   - **Y**: Mark classification as correct
   - **N**: Mark as wrong and provide correction
   - **S**: Skip (uncertain)
   - **Q**: Quit and export verification data

4. Download verification JSON when complete

#### Tab 3: Statistics
- View real-time accuracy metrics
- See diamond type distribution
- Review verification history
- Export data as JSON or CSV

#### Tab 4: Help
- Complete usage instructions
- Model information
- Keyboard shortcuts reference

### Team Collaboration Workflow

**For Classification Team**:
1. Run `process_batch.py` on new diamond images
2. Share JSON results via cloud storage or commit to repository
3. Team members access web interface to review results

**For Verification Team**:
1. Access web interface via GitHub Pages
2. Upload shared JSON results
3. Verify classifications collaboratively
4. Export verification data for model improvement

**For ML Team**:
1. Collect verification data from team
2. Run `export_training_data.py` to generate training CSV
3. Retrain model with verified labels
4. Deploy updated model

### Deployment Notes

- Web interface is static HTML/CSS/JavaScript (no server required)
- Python backend runs locally for classification
- JSON files used for data transfer between backend and frontend
- All processing happens client-side in the browser

## Future Enhancements

- Real-time classification API integration
- Cloud storage integration for JSON files
- Automated model retraining pipeline
- Multi-model ensemble support
- Additional diamond cut support
- User authentication and access control

## License

Internal use only - Diamond sorting automation system
