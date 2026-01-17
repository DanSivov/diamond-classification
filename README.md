# Diamond Classification System

Web-based tool for classifying diamond orientations and collecting verification data.

**Live**: https://dansivov.github.io/diamond-classification/

## How It Works

1. **Sign In** - Enter your email to access the system
2. **Upload Images** - Select diamond images from your computer or Dropbox
3. **Automatic Processing** - The system detects diamonds and classifies their orientation (table-up or tilted)
4. **Verify Results** - Review each diamond and confirm or correct the classification
5. **Export Data** - Save final image to Dropbox and/or Download verification results for training improvements

## Verification Controls

- **Y** - Correct classification
- **N** - Wrong 
- **F** - Contour detection failed
- **S** - Skip
- **Q** - Quit and save

## Classification Output

Each diamond is classified as:
- **Table** - Flat side up, ready for pickup
- **Tilted** - Angled or on side, not pickable

Diamonds are also graded by pickup priority based on their isolation from neighbors.
