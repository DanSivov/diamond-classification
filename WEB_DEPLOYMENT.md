# GitHub Pages Deployment Guide

Complete guide for deploying the Diamond Classification Web Interface to GitHub Pages.

## Prerequisites

- GitHub account
- Git installed locally
- Diamond Classification System repository

## Step 1: Prepare Repository

### 1.1 Initialize Git Repository INSIDE public/ folder

**IMPORTANT**: Initialize git in the `public/` folder only, so ONLY the public code is shared.

```bash
cd C:\Users\sivov\Downloads\Diamond-Orinetation-Clasifier\public
git init
```

This ensures that all development files, test scripts, and data outside `public/` remain private.

### 1.2 Verify .gitignore exists

The `.gitignore` file already exists in the `public/` folder with these rules:

```
# Output directories (generated locally, not for web deployment)
output/

# Python cache
__pycache__/
*.pyc
*.pyo

# Model files (too large for git, download separately)
FastSAM-x.pt
*.pt

# Data directories (too large for git)
data/

# IDE
.vscode/
.idea/

# OS
.DS_Store
Thumbs.db
```

No changes needed - this is already configured correctly.

### 1.3 Add Files to Git

```bash
# Still in public/ folder
git add .
git commit -m "Initial commit: Diamond Classification System with web interface"
```

**Note**: Only files in `public/` will be committed. Everything outside this folder stays private.

## Step 2: Create GitHub Repository

### 2.1 On GitHub

1. Go to [github.com](https://github.com)
2. Click "New repository"
3. Name: `diamond-classification` (or your preferred name)
4. Description: "ML-based diamond orientation detection and grading system"
5. **Public** (required for free GitHub Pages)
6. Do NOT initialize with README (we already have one)
7. Click "Create repository"

### 2.2 Link Local Repository to GitHub

```bash
git remote add origin https://github.com/yourusername/diamond-classification.git
git branch -M main
git push -u origin main
```

## Step 3: Enable GitHub Pages

### 3.1 Configure GitHub Pages

1. Go to your repository on GitHub
2. Click **Settings** tab
3. Scroll down to **Pages** section (left sidebar)
4. Under "Source":
   - Select branch: `main`
   - Select folder: **`/ (root)`** ← Important: Since you initialized git IN the public folder, the repository root IS the public folder
   - Click **Save**

### 3.2 Wait for Deployment

- GitHub Pages will build your site (takes 1-2 minutes)
- Look for green checkmark indicating success
- Your site will be available at: `https://yourusername.github.io/diamond-classification/`

## Step 4: Verify Deployment

### 4.1 Access Web Interface

Open your browser and go to:
```
https://yourusername.github.io/diamond-classification/
```

You should see:
- Purple gradient header with "Diamond Classification & Verification"
- Four tabs: Batch Review, ROI Verification, Statistics, Help
- Upload sections and instructions

### 4.2 Test Functionality

1. **Check Help Tab**: Navigate to Help tab, verify instructions are visible
2. **Test File Upload**: Try uploading a JSON file (even if empty, should show error)
3. **Check Console**: Open browser DevTools (F12), verify no JavaScript errors

## Step 5: Share with Team

### 5.1 Share URL

Send team members the GitHub Pages URL:
```
https://yourusername.github.io/diamond-classification/
```

### 5.2 Usage Instructions

**For team members to use the web interface**:

1. **Access the URL** (no login required for public repo)

2. **To review batch results**:
   - Someone runs `python process_batch.py path/to/images/` locally
   - Upload generated JSON files to cloud storage (Google Drive, Dropbox, etc.)
   - Team members download and upload to web interface

3. **To verify classifications**:
   - Upload JSON file from batch processing
   - Verify each ROI using keyboard shortcuts
   - Export verification data when done

4. **To contribute verified data**:
   - Download verification JSON from web interface
   - Share with ML team via cloud storage or commit to repo

## Step 6: Update Deployment

### 6.1 Make Changes

When you update the frontend:

```bash
cd public/
# Edit index.html, styles.css, or app.js
git add .
git commit -m "Update: description of changes"
git push origin main
```

### 6.2 Auto-Deploy

- GitHub Pages automatically rebuilds when you push to main branch
- Changes appear within 1-2 minutes
- Check deployment status in Settings > Pages

## Advanced Configuration

### Custom Domain (Optional)

**If you have a custom domain**:

1. In repository Settings > Pages
2. Enter custom domain: `diamonds.yourcompany.com`
3. Add CNAME record in your DNS settings:
   ```
   CNAME: diamonds -> yourusername.github.io
   ```
4. Wait for DNS propagation (up to 24 hours)

### HTTPS Enforcement

1. In Settings > Pages
2. Check "Enforce HTTPS"
3. GitHub provides free SSL certificate

## Troubleshooting

### Issue: 404 Page Not Found

**Solution**:
- Verify GitHub Pages is enabled
- Check folder is set to `/public`
- Ensure `index.html` exists in `public/` directory
- Wait 2 minutes for rebuild

### Issue: Styles Not Loading

**Solution**:
- Check `styles.css` and `app.js` are in `public/` directory
- Verify paths in `index.html` are relative (no leading `/`)
- Clear browser cache (Ctrl+F5)

### Issue: Changes Not Appearing

**Solution**:
- Verify changes are committed and pushed
- Check Actions tab for build status
- Clear browser cache
- Wait 2 minutes for rebuild

### Issue: JavaScript Errors

**Solution**:
- Open DevTools (F12) > Console
- Check for specific error messages
- Verify all files are properly uploaded
- Check file paths are correct

## Workflow Integration

### Recommended Team Workflow

**Classification Phase**:
1. Engineer captures diamond images
2. Engineer runs `process_batch.py` locally
3. Engineer commits JSON results to repo or uploads to shared storage

**Verification Phase**:
1. Team accesses web interface via GitHub Pages
2. Team downloads and uploads JSON results
3. Team verifies classifications
4. Team exports verification data

**Retraining Phase**:
1. ML engineer collects verification JSON files
2. ML engineer runs `export_training_data.py`
3. ML engineer retrains model
4. Updated model deployed to production

## Security Considerations

### Public Repository

- ⚠️ **No sensitive data**: Don't commit API keys, credentials, or proprietary data
- ✅ **Share via JSON**: Use JSON files for data transfer, not raw images
- ✅ **Web interface only**: No backend API exposed

### Private Repository (GitHub Pro)

If you upgrade to GitHub Pro:
- Set repository to Private
- GitHub Pages will require authentication
- Only collaborators can access web interface
- More secure for proprietary data

## Files Structure

```
public/
├── index.html              # Main web interface
├── styles.css              # Styling
├── app.js                  # Frontend logic
├── .nojekyll               # Disable Jekyll processing
├── README.md               # Documentation
├── BACKEND_SUMMARY.md      # Backend API docs
├── WEB_DEPLOYMENT.md       # This file
├── requirements.txt        # Python dependencies
├── process_batch.py        # Backend script
├── verify_interactive.py   # Backend script
├── export_training_data.py # Backend script
├── classify_diamond.py     # Legacy script
├── src/                    # Python source code
└── models/                 # ML models
```

## Support

For issues or questions:
1. Check [Troubleshooting](#troubleshooting) section
2. Review browser console for JavaScript errors
3. Verify GitHub Pages deployment status
4. Check repository issues tab

## Next Steps

After successful deployment:

1. ✅ Test web interface with sample JSON data
2. ✅ Share URL with team
3. ✅ Run batch processing locally and upload results
4. ✅ Collect team feedback
5. ✅ Iterate on features as needed

---

**Note**: This deployment guide assumes you're using the free tier of GitHub Pages. For private repositories or custom domains, GitHub Pro ($4/month) is required.
