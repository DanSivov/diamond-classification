# Diamond Classification and Grading System

ML-based diamond orientation detection and pickup grading system using Random Forest classifier.

## Web Interface

**Live Demo**: Access the web interface at your GitHub Pages URL after deployment.

The web interface provides team collaboration features:
- **Batch Review**: Upload and review JSON classification results
- **ROI Verification**: Web-based interactive verification system
- **Statistics Dashboard**: Real-time accuracy and performance metrics
- **Export Functionality**: Download verification data for model retraining

**Keyboard Controls:**
- `y` = Classification is correct
- `n` = Classification is wrong (prompts for correct label)
- `s` = Skip (uncertain)
- `q` = Quit and save progress


## Output 

**Output Location:**
```
output/training_data.csv
```

This CSV contains extracted features and verified labels, ready for retraining.


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
