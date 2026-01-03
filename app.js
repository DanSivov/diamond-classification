// Global State
// TODO: Update production API URL after deploying to Railway/Render
const state = {
    currentStep: 'start',
    classificationData: null,
    verificationData: [],
    currentROIIndex: 0,
    savedCodexes: [],
    uploadedImage: null,
    batchResults: null,
    apiUrl: window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
        ? 'http://localhost:5000'
        : 'https://web-production-53bec.up.railway.app'
};

// Dropbox Configuration
const DROPBOX_CONFIG = {
    clientId: 'jyiz9jj4khq51k7',
    redirectUri: window.location.origin + window.location.pathname,
    folderPath: '/Diamond-Classifier'
};

let dropboxClient = null;

// Navigation
function showStep(stepId) {
    document.querySelectorAll('.step-section').forEach(section => {
        section.classList.remove('active');
    });
    document.getElementById(`step-${stepId}`).classList.add('active');
    state.currentStep = stepId;
}

function goToStart() {
    state.classificationData = null;
    state.verificationData = [];
    state.currentROIIndex = 0;
    state.uploadedImage = null;
    showStep('start');
}

// Step 1: Start
function uploadExisting() {
    showStep('upload-existing');
}

function beginNewClassification() {
    showStep('new-classification');
}

// Step 2: Load Existing Classification
async function loadExistingClassification() {
    const fileInput = document.getElementById('existing-zip-upload');
    if (fileInput.files.length === 0) {
        alert('Please select a ZIP file');
        return;
    }

    const zipFile = fileInput.files[0];
    console.log('Loading ZIP file:', zipFile.name);

    try {
        const zip = await JSZip.loadAsync(zipFile);
        console.log('ZIP loaded, files:', Object.keys(zip.files));

        // Find JSON file
        let jsonFile = null;
        let jsonFilename = null;
        for (const [filename, file] of Object.entries(zip.files)) {
            if (filename.endsWith('.json') && !file.dir) {
                jsonFile = file;
                jsonFilename = filename;
                break;
            }
        }

        if (!jsonFile) {
            alert('No JSON file found in ZIP');
            return;
        }

        console.log('Found JSON file:', jsonFilename);
        const jsonText = await jsonFile.async('text');
        state.classificationData = JSON.parse(jsonText);

        // Find and load graded images
        const gradedImages = {};
        for (const [filename, file] of Object.entries(zip.files)) {
            if (filename.endsWith('.png') && !file.dir) {
                const base64 = await file.async('base64');
                gradedImages[filename] = base64;
                console.log('Loaded image:', filename);
            }
        }

        // Match graded image to classification data
        if (gradedImages[state.classificationData.image_name + '_graded.png']) {
            state.classificationData.graded_image_base64 = gradedImages[state.classificationData.image_name + '_graded.png'];
        }

        console.log('Classification loaded successfully');
        showCheckOrSave();
    } catch (error) {
        console.error('Error loading ZIP:', error);
        alert('Error loading ZIP file: ' + error.message);
    }
}

// Step 3: Process Images
async function processImages() {
    const fileInput = document.getElementById('new-image-upload');
    console.log('processImages called, fileInput:', fileInput);
    console.log('Files selected:', fileInput.files.length);

    if (fileInput.files.length === 0) {
        alert('Please select images to classify');
        return;
    }

    const files = fileInput.files;
    console.log('File(s) to process:', Array.from(files).map(f => f.name));

    // Check if API is available
    const apiAvailable = await checkAPIHealth();
    console.log('API available:', apiAvailable);

    if (!apiAvailable) {
        alert('API server not available. Run images through process_batch.py locally, then upload the JSON file.');
        showStep('processing-fallback');
        return;
    }

    showStep('processing');
    showProcessingStatus('Uploading images...', 0);

    try {
        if (files.length === 1) {
            console.log('Calling processSingleImage with file:', files[0].name);
            await processSingleImage(files[0]);
        } else {
            console.log('Calling processBatchImages with', files.length, 'files');
            await processBatchImages(files);
        }
    } catch (error) {
        console.error('Processing error:', error);
        alert('Classification failed: ' + error.message);
        showStep('new-classification');
    }
}

async function checkAPIHealth() {
    try {
        const response = await fetch(`${state.apiUrl}/health`, {
            method: 'GET',
            timeout: 5000
        });
        return response.ok;
    } catch (error) {
        return false;
    }
}

async function processSingleImage(file) {
    console.log('processSingleImage started with file:', file?.name, 'type:', file?.type);

    const formData = new FormData();
    formData.append('image', file);

    showProcessingStatus('Processing image...', 50);

    console.log('Sending API request to:', `${state.apiUrl}/classify`);
    const response = await fetch(`${state.apiUrl}/classify`, {
        method: 'POST',
        body: formData
    });

    console.log('API response received, status:', response.status);
    if (!response.ok) {
        throw new Error('Classification failed');
    }

    const data = await response.json();
    console.log('API response data:', data);

    showProcessingStatus('Complete', 100);

    console.log('Setting state.classificationData and state.uploadedImage');
    state.classificationData = data;
    state.uploadedImage = file;
    console.log('Single image processed, uploadedImage set:', state.uploadedImage?.name);
    console.log('State.uploadedImage is now:', state.uploadedImage);
    showCheckOrSave();
}

async function processBatchImages(files) {
    const formData = new FormData();

    for (let i = 0; i < files.length; i++) {
        formData.append('images', files[i]);
    }

    showProcessingStatus(`Processing ${files.length} images...`, 50);

    const response = await fetch(`${state.apiUrl}/classify-batch`, {
        method: 'POST',
        body: formData
    });

    if (!response.ok) {
        throw new Error('Batch classification failed');
    }

    const data = await response.json();

    showProcessingStatus('Complete', 100);

    if (data.results.length === 1) {
        // Single image in batch - treat as single image
        state.classificationData = data.results[0];
        state.uploadedImage = files[0];
        state.batchResults = null;
    } else {
        // Multiple images - store all results and create merged view
        state.batchResults = data.results;

        const allClassifications = [];
        let classificationIdOffset = 0;

        data.results.forEach((result, imageIndex) => {
            if (result.classifications) {
                result.classifications.forEach(c => {
                    // Add image metadata to each classification
                    allClassifications.push({
                        ...c,
                        source_image_name: result.image_name,
                        source_image_base64: result.full_image_base64,
                        roi_id: classificationIdOffset + c.roi_id
                    });
                });
                classificationIdOffset += result.classifications.length;
            }
        });

        state.classificationData = {
            image_name: 'Batch Results',
            total_diamonds: data.results.reduce((sum, r) => sum + (r.total_diamonds || 0), 0),
            table_count: data.results.reduce((sum, r) => sum + (r.table_count || 0), 0),
            tilted_count: data.results.reduce((sum, r) => sum + (r.tilted_count || 0), 0),
            pickable_count: data.results.reduce((sum, r) => sum + (r.pickable_count || 0), 0),
            invalid_count: data.results.reduce((sum, r) => sum + (r.invalid_count || 0), 0),
            average_grade: data.results.reduce((sum, r) => sum + (r.average_grade || 0), 0) / data.results.length,
            full_image_base64: data.results[0]?.full_image_base64,
            classifications: allClassifications
        };
        state.uploadedImage = null;
    }

    showCheckOrSave();
}

function showProcessingStatus(message, progress) {
    const statusDiv = document.getElementById('processing-status');
    if (statusDiv) {
        statusDiv.innerHTML = `
            <p>${message}</p>
            <div class="progress-bar">
                <div class="progress-fill" style="width: ${progress}%"></div>
            </div>
        `;
    }
}

function loadFallbackResults() {
    const fileInput = document.getElementById('fallback-json-upload');
    if (fileInput.files.length === 0) {
        alert('Please select the generated JSON file');
        return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            state.classificationData = JSON.parse(e.target.result);
            showCheckOrSave();
        } catch (error) {
            alert('Error parsing JSON: ' + error.message);
        }
    };
    reader.readAsText(fileInput.files[0]);
}

// Step 4: Show Check or Save Options
function showCheckOrSave() {
    console.log('showCheckOrSave called, uploadedImage:', state.uploadedImage?.name);
    const summary = document.getElementById('classification-summary');
    const data = state.classificationData;

    summary.innerHTML = `
        <div class="summary-box">
            <p><strong>Image:</strong> ${data.image_name || 'Unknown'}</p>
            <p><strong>Total Diamonds:</strong> ${data.total_diamonds || 0}</p>
            <p><strong>Table:</strong> ${data.table_count || 0}</p>
            <p><strong>Tilted:</strong> ${data.tilted_count || 0}</p>
            <p><strong>Pickable:</strong> ${data.pickable_count || 0}</p>
        </div>
    `;

    showStep('check-or-save');
}

// Step 5: Start Verification
function startVerification() {
    if (!state.classificationData || !state.classificationData.classifications) {
        alert('No classification data available');
        return;
    }

    state.currentROIIndex = 0;
    state.verificationData = [];

    showStep('verification');
    updateVerificationDisplay();

    document.addEventListener('keydown', handleVerificationKeyboard);
}

function updateVerificationDisplay() {
    const classifications = state.classificationData.classifications;
    const index = state.currentROIIndex;

    if (index >= classifications.length) {
        completeVerification();
        return;
    }

    const classification = classifications[index];

    // Update progress
    const progress = ((index / classifications.length) * 100);
    document.getElementById('progress-fill').style.width = `${progress}%`;
    document.getElementById('progress-text').textContent = `${index + 1} / ${classifications.length}`;

    // Update ROI info
    document.getElementById('roi-title').textContent = `ROI ${classification.roi_id}`;
    document.getElementById('roi-type').textContent = classification.diamond_type.toUpperCase();
    document.getElementById('roi-orientation').textContent = classification.orientation.toUpperCase();
    document.getElementById('roi-confidence').textContent = `${(classification.confidence * 100).toFixed(1)}%`;

    // Update orientation color
    const orientationSpan = document.getElementById('roi-orientation');
    orientationSpan.style.color = classification.orientation === 'table' ?
        'var(--success-color)' : 'var(--warning-color)';

    console.log('updateVerificationDisplay - uploadedImage exists:', !!state.uploadedImage, 'name:', state.uploadedImage?.name);
    console.log('Classification data has full_image_base64:', !!state.classificationData.full_image_base64);

    if (state.classificationData.full_image_base64) {
        console.log('Drawing actual images from API base64 data for ROI', classification.roi_id);
        drawContextViewFromBase64(classification);
        drawROIViewFromBase64(classification);
    } else if (state.uploadedImage) {
        console.log('Drawing actual images from uploaded file for ROI', classification.roi_id);
        drawContextView(classification);
        drawROIView(classification);
    } else {
        console.log('No uploaded image or base64 data, showing placeholders');
        drawPlaceholderCanvas('context-canvas', 'Context View');
        drawPlaceholderCanvas('roi-canvas', `ROI ${classification.roi_id}`);
    }
}

function drawContextView(currentClassification) {
    console.log('drawContextView called for ROI', currentClassification.roi_id);
    const canvas = document.getElementById('context-canvas');
    const ctx = canvas.getContext('2d');

    const reader = new FileReader();
    reader.onerror = (error) => {
        console.error('FileReader error in drawContextView:', error);
    };
    reader.onload = (e) => {
        console.log('Image data loaded for context view');
        const img = new Image();
        img.onerror = (error) => {
            console.error('Image load error in drawContextView:', error);
        };
        img.onload = () => {
            console.log('Image rendered for context view, size:', img.width, 'x', img.height);
            const scale = Math.min(400 / img.width, 300 / img.height);
            canvas.width = 400;
            canvas.height = 300;

            const scaledWidth = img.width * scale;
            const scaledHeight = img.height * scale;
            const offsetX = (400 - scaledWidth) / 2;
            const offsetY = (300 - scaledHeight) / 2;

            ctx.fillStyle = '#1f2937';
            ctx.fillRect(0, 0, 400, 300);
            ctx.drawImage(img, offsetX, offsetY, scaledWidth, scaledHeight);

            state.classificationData.classifications.forEach(c => {
                const [x, y, w, h] = c.bounding_box;
                const sx = offsetX + x * scale;
                const sy = offsetY + y * scale;
                const sw = w * scale;
                const sh = h * scale;

                if (c.roi_id === currentClassification.roi_id) {
                    ctx.strokeStyle = '#fbbf24';
                    ctx.lineWidth = 3;
                } else {
                    ctx.strokeStyle = c.orientation === 'table' ? '#10b981' : '#ef4444';
                    ctx.lineWidth = 2;
                }
                ctx.strokeRect(sx, sy, sw, sh);
            });
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(state.uploadedImage);
}

function drawROIView(classification) {
    console.log('drawROIView called for ROI', classification.roi_id);
    const canvas = document.getElementById('roi-canvas');
    const ctx = canvas.getContext('2d');

    const reader = new FileReader();
    reader.onerror = (error) => {
        console.error('FileReader error in drawROIView:', error);
    };
    reader.onload = (e) => {
        console.log('Image data loaded for ROI view');
        const img = new Image();
        img.onerror = (error) => {
            console.error('Image load error in drawROIView:', error);
        };
        img.onload = () => {
            console.log('Image rendered for ROI view, size:', img.width, 'x', img.height);
            const [x, y, w, h] = classification.bounding_box;

            canvas.width = 400;
            canvas.height = 300;

            const scale = Math.min(400 / w, 300 / h);
            const scaledWidth = w * scale;
            const scaledHeight = h * scale;
            const offsetX = (400 - scaledWidth) / 2;
            const offsetY = (300 - scaledHeight) / 2;

            ctx.fillStyle = '#1f2937';
            ctx.fillRect(0, 0, 400, 300);

            ctx.drawImage(img, x, y, w, h, offsetX, offsetY, scaledWidth, scaledHeight);

            ctx.strokeStyle = classification.orientation === 'table' ? '#10b981' : '#ef4444';
            ctx.lineWidth = 3;
            ctx.strokeRect(offsetX, offsetY, scaledWidth, scaledHeight);
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(state.uploadedImage);
}

function drawContextViewFromBase64(currentClassification) {
    console.log('drawContextViewFromBase64 called for ROI', currentClassification.roi_id);
    const canvas = document.getElementById('context-canvas');
    const ctx = canvas.getContext('2d');

    // For batch mode, use the source image of the current classification
    const imageBase64 = currentClassification.source_image_base64 || state.classificationData.full_image_base64;

    const img = new Image();
    img.onerror = (error) => {
        console.error('Image load error in drawContextViewFromBase64:', error);
    };
    img.onload = () => {
        console.log('Base64 image rendered for context view, size:', img.width, 'x', img.height);
        const scale = Math.min(400 / img.width, 300 / img.height);
        canvas.width = 400;
        canvas.height = 300;

        const scaledWidth = img.width * scale;
        const scaledHeight = img.height * scale;
        const offsetX = (400 - scaledWidth) / 2;
        const offsetY = (300 - scaledHeight) / 2;

        ctx.fillStyle = '#1f2937';
        ctx.fillRect(0, 0, 400, 300);
        ctx.drawImage(img, offsetX, offsetY, scaledWidth, scaledHeight);

        // Draw bounding boxes only for diamonds from the same source image
        const sourceImageName = currentClassification.source_image_name || state.classificationData.image_name;
        state.classificationData.classifications.forEach(c => {
            // Skip diamonds from different images in batch mode
            if (c.source_image_name && c.source_image_name !== sourceImageName) {
                return;
            }

            const [x, y, w, h] = c.bounding_box;
            const sx = offsetX + x * scale;
            const sy = offsetY + y * scale;
            const sw = w * scale;
            const sh = h * scale;

            if (c.roi_id === currentClassification.roi_id) {
                ctx.strokeStyle = '#fbbf24';
                ctx.lineWidth = 3;
            } else {
                ctx.strokeStyle = c.orientation === 'table' ? '#10b981' : '#ef4444';
                ctx.lineWidth = 2;
            }
            ctx.strokeRect(sx, sy, sw, sh);
        });
    };
    img.src = 'data:image/png;base64,' + imageBase64;
}

function drawROIViewFromBase64(classification) {
    console.log('drawROIViewFromBase64 called for ROI', classification.roi_id);
    const canvas = document.getElementById('roi-canvas');
    const ctx = canvas.getContext('2d');

    if (!classification.roi_image_base64) {
        console.log('No ROI image available, drawing placeholder');
        drawPlaceholderCanvas('roi-canvas', `ROI ${classification.roi_id}`);
        return;
    }

    const img = new Image();
    img.onerror = (error) => {
        console.error('Image load error in drawROIViewFromBase64:', error);
    };
    img.onload = () => {
        console.log('Base64 ROI image rendered, size:', img.width, 'x', img.height);

        canvas.width = 400;
        canvas.height = 300;

        const scale = Math.min(400 / img.width, 300 / img.height);
        const scaledWidth = img.width * scale;
        const scaledHeight = img.height * scale;
        const offsetX = (400 - scaledWidth) / 2;
        const offsetY = (300 - scaledHeight) / 2;

        ctx.fillStyle = '#1f2937';
        ctx.fillRect(0, 0, 400, 300);

        ctx.drawImage(img, offsetX, offsetY, scaledWidth, scaledHeight);

        ctx.strokeStyle = classification.orientation === 'table' ? '#10b981' : '#ef4444';
        ctx.lineWidth = 3;
        ctx.strokeRect(offsetX, offsetY, scaledWidth, scaledHeight);
    };
    img.src = 'data:image/png;base64,' + classification.roi_image_base64;
}

function drawPlaceholderCanvas(canvasId, text) {
    const canvas = document.getElementById(canvasId);
    const ctx = canvas.getContext('2d');

    canvas.width = 400;
    canvas.height = 300;

    ctx.fillStyle = '#1f2937';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = '#6b7280';
    ctx.font = '16px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(text, canvas.width / 2, canvas.height / 2);
}

function handleVerificationKeyboard(event) {
    const key = event.key.toLowerCase();

    switch(key) {
        case 'y':
            verifyCorrect();
            break;
        case 'n':
            verifyWrong();
            break;
        case 's':
            verifySkip();
            break;
        case 'q':
            verifyQuit();
            break;
    }
}

function verifyCorrect() {
    const classification = state.classificationData.classifications[state.currentROIIndex];

    state.verificationData.push({
        roi_id: classification.roi_id,
        predicted_type: classification.diamond_type,
        predicted_orientation: classification.orientation,
        confidence: classification.confidence,
        is_correct: true,
        verified_type: classification.diamond_type,
        verified_orientation: classification.orientation,
        timestamp: new Date().toISOString()
    });

    state.currentROIIndex++;
    updateVerificationDisplay();
}

function verifyWrong() {
    const classification = state.classificationData.classifications[state.currentROIIndex];

    const modal = document.getElementById('correction-modal');
    document.getElementById('modal-prediction').textContent =
        `${classification.diamond_type.toUpperCase()}, ${classification.orientation.toUpperCase()}`;

    document.getElementById('correct-orientation').value = classification.orientation;
    document.getElementById('correct-type').value = classification.diamond_type;

    modal.classList.add('active');
}

function submitCorrection() {
    const classification = state.classificationData.classifications[state.currentROIIndex];
    const correctOrientation = document.getElementById('correct-orientation').value;
    const correctType = document.getElementById('correct-type').value;

    state.verificationData.push({
        roi_id: classification.roi_id,
        predicted_type: classification.diamond_type,
        predicted_orientation: classification.orientation,
        confidence: classification.confidence,
        is_correct: false,
        verified_type: correctType,
        verified_orientation: correctOrientation,
        timestamp: new Date().toISOString()
    });

    closeCorrectionModal();
    state.currentROIIndex++;
    updateVerificationDisplay();
}

function closeCorrectionModal() {
    document.getElementById('correction-modal').classList.remove('active');
}

function verifySkip() {
    state.currentROIIndex++;
    updateVerificationDisplay();
}

function verifyQuit() {
    completeVerification();
}

function completeVerification() {
    document.removeEventListener('keydown', handleVerificationKeyboard);

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

    saveToCodebase(timestamp);

    const summary = document.getElementById('verification-summary');
    const total = state.verificationData.length;
    const correct = state.verificationData.filter(v => v.is_correct).length;
    const accuracy = total > 0 ? ((correct / total) * 100).toFixed(1) : 0;

    summary.innerHTML = `
        <div class="summary-box">
            <p><strong>Total Verified:</strong> ${total}</p>
            <p><strong>Correct:</strong> ${correct}</p>
            <p><strong>Corrected:</strong> ${total - correct}</p>
            <p><strong>Accuracy:</strong> ${accuracy}%</p>
        </div>
    `;

    document.getElementById('save-timestamp').textContent = timestamp;
    showStep('save-results');
}

function saveToCodebase(timestamp) {
    state.savedCodexes.push({
        timestamp: timestamp,
        data: state.verificationData,
        classification: state.classificationData
    });

    console.log('Saved to codebase:', timestamp);
}

async function downloadResults() {
    const timestamp = document.getElementById('save-timestamp').textContent;
    const zipName = `verification_${timestamp}`;

    console.log('Creating ZIP file:', zipName);

    const zip = new JSZip();

    // Add verification JSON
    const verificationData = {
        timestamp: timestamp,
        verificationData: state.verificationData,
        classificationData: state.classificationData
    };
    zip.file(`${zipName}.json`, JSON.stringify(verificationData, null, 2));

    // Add graded images
    if (state.classificationData.graded_image_base64) {
        const gradedImageName = `${state.classificationData.image_name}_graded.png`;
        zip.file(gradedImageName, state.classificationData.graded_image_base64, {base64: true});
        console.log('Added graded image:', gradedImageName);
    }

    // For batch processing, extract graded images from stored batch results
    if (state.batchResults && state.batchResults.length > 0) {
        state.batchResults.forEach(result => {
            if (result.graded_image_base64) {
                const gradedImageName = `${result.image_name}_graded.png`;
                zip.file(gradedImageName, result.graded_image_base64, {base64: true});
                console.log('Added batch graded image:', gradedImageName);
            }
        });
    }

    // Generate and download ZIP
    const zipBlob = await zip.generateAsync({type: 'blob'});
    const url = URL.createObjectURL(zipBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${zipName}.zip`;
    link.click();

    URL.revokeObjectURL(url);

    goToStart();
}

// Step 7: Save Directly
function saveDirectly() {
    showStep('save-directly');
}

async function downloadClassification() {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const imageName = state.classificationData.image_name || 'result';
    const zipName = `classification_${imageName}_${timestamp}`;

    console.log('Creating classification ZIP file:', zipName);

    const zip = new JSZip();

    // Add classification JSON
    zip.file(`${zipName}.json`, JSON.stringify(state.classificationData, null, 2));

    // Add graded images
    if (state.classificationData.graded_image_base64) {
        const gradedImageName = `${imageName}_graded.png`;
        zip.file(gradedImageName, state.classificationData.graded_image_base64, {base64: true});
        console.log('Added graded image:', gradedImageName);
    }

    // For batch processing, extract graded images from stored batch results
    if (state.batchResults && state.batchResults.length > 0) {
        state.batchResults.forEach(result => {
            if (result.graded_image_base64) {
                const gradedImageName = `${result.image_name}_graded.png`;
                zip.file(gradedImageName, result.graded_image_base64, {base64: true});
                console.log('Added batch graded image:', gradedImageName);
            }
        });
    }

    // Generate and download ZIP
    const zipBlob = await zip.generateAsync({type: 'blob'});
    const url = URL.createObjectURL(zipBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${zipName}.zip`;
    link.click();

    URL.revokeObjectURL(url);

    goToStart();
}

// ========================================
// DROPBOX INTEGRATION
// ========================================

function initializeDropbox() {
    const accessToken = localStorage.getItem('dropboxAccessToken');

    if (accessToken) {
        dropboxClient = new Dropbox.Dropbox({ accessToken: accessToken });
        updateDropboxStatus('Connected to Dropbox', true);
        console.log('Dropbox client initialized with stored token');
        return true;
    }

    // Check if we're returning from OAuth
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');

    if (code) {
        handleDropboxOAuthCallback(code);
    }

    return false;
}

async function authenticateDropbox() {
    console.log('Starting Dropbox authentication...');

    // Generate PKCE code verifier and challenge
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = await generateCodeChallenge(codeVerifier);

    // Store verifier for callback
    sessionStorage.setItem('dropboxCodeVerifier', codeVerifier);

    // Build OAuth URL
    const authUrl = `https://www.dropbox.com/oauth2/authorize?` +
        `client_id=${DROPBOX_CONFIG.clientId}&` +
        `response_type=code&` +
        `redirect_uri=${encodeURIComponent(DROPBOX_CONFIG.redirectUri)}&` +
        `code_challenge_method=S256&` +
        `code_challenge=${codeChallenge}&` +
        `token_access_type=offline`;

    // Redirect to Dropbox OAuth
    window.location.href = authUrl;
}

async function handleDropboxOAuthCallback(code) {
    console.log('Handling Dropbox OAuth callback');

    const codeVerifier = sessionStorage.getItem('dropboxCodeVerifier');

    if (!codeVerifier) {
        console.error('Code verifier not found');
        return;
    }

    try {
        // Exchange code for token
        const response = await fetch('https://api.dropboxapi.com/oauth2/token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
                code: code,
                grant_type: 'authorization_code',
                code_verifier: codeVerifier,
                client_id: DROPBOX_CONFIG.clientId,
                redirect_uri: DROPBOX_CONFIG.redirectUri
            })
        });

        const data = await response.json();

        if (data.access_token) {
            localStorage.setItem('dropboxAccessToken', data.access_token);
            dropboxClient = new Dropbox.Dropbox({ accessToken: data.access_token });

            // Clean up URL
            window.history.replaceState({}, document.title, window.location.pathname);

            updateDropboxStatus('Successfully connected to Dropbox!', true);
            console.log('Dropbox authentication successful');
        } else {
            throw new Error('No access token received');
        }
    } catch (error) {
        console.error('Dropbox authentication failed:', error);
        updateDropboxStatus('Failed to connect to Dropbox', false);
    } finally {
        sessionStorage.removeItem('dropboxCodeVerifier');
    }
}

function updateDropboxStatus(message, success) {
    const statusDiv = document.getElementById('dropbox-status');
    const statusText = document.getElementById('dropbox-status-text');

    statusDiv.style.display = 'block';
    statusText.textContent = message;
    statusDiv.style.background = success ? '#065f46' : '#7f1d1d';

    if (success) {
        setTimeout(() => {
            statusDiv.style.display = 'none';
        }, 5000);
    }
}

function generateCodeVerifier() {
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    return base64URLEncode(array);
}

async function generateCodeChallenge(verifier) {
    const encoder = new TextEncoder();
    const data = encoder.encode(verifier);
    const hash = await crypto.subtle.digest('SHA-256', data);
    return base64URLEncode(new Uint8Array(hash));
}

function base64URLEncode(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary)
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=/g, '');
}

async function saveToDropbox() {
    if (!dropboxClient) {
        const confirm = window.confirm('You need to connect to Dropbox first. Connect now?');
        if (confirm) {
            await authenticateDropbox();
        }
        return;
    }

    const timestamp = document.getElementById('save-timestamp').textContent;
    const zipName = `verification_${timestamp}`;

    console.log('Creating ZIP for Dropbox upload:', zipName);

    const zip = new JSZip();

    // Add verification JSON
    const verificationData = {
        timestamp: timestamp,
        verificationData: state.verificationData,
        classificationData: state.classificationData
    };
    zip.file(`${zipName}.json`, JSON.stringify(verificationData, null, 2));

    // Add graded images
    if (state.classificationData.graded_image_base64) {
        const gradedImageName = `${state.classificationData.image_name}_graded.png`;
        zip.file(gradedImageName, state.classificationData.graded_image_base64, {base64: true});
    }

    if (state.batchResults && state.batchResults.length > 0) {
        state.batchResults.forEach(result => {
            if (result.graded_image_base64) {
                const gradedImageName = `${result.image_name}_graded.png`;
                zip.file(gradedImageName, result.graded_image_base64, {base64: true});
            }
        });
    }

    // Generate ZIP blob
    const zipBlob = await zip.generateAsync({type: 'blob'});

    // Upload to Dropbox
    try {
        const path = `${DROPBOX_CONFIG.folderPath}/${zipName}.zip`;

        await dropboxClient.filesUpload({
            path: path,
            contents: zipBlob,
            mode: 'add',
            autorename: true
        });

        alert(`Successfully saved to Dropbox: ${path}`);
        goToStart();
    } catch (error) {
        console.error('Dropbox upload failed:', error);
        alert('Failed to save to Dropbox: ' + error.message);
    }
}

async function saveClassificationToDropbox() {
    if (!dropboxClient) {
        const confirm = window.confirm('You need to connect to Dropbox first. Connect now?');
        if (confirm) {
            await authenticateDropbox();
        }
        return;
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const imageName = state.classificationData.image_name || 'result';
    const zipName = `classification_${imageName}_${timestamp}`;

    console.log('Creating classification ZIP for Dropbox:', zipName);

    const zip = new JSZip();

    zip.file(`${zipName}.json`, JSON.stringify(state.classificationData, null, 2));

    if (state.classificationData.graded_image_base64) {
        const gradedImageName = `${imageName}_graded.png`;
        zip.file(gradedImageName, state.classificationData.graded_image_base64, {base64: true});
    }

    if (state.batchResults && state.batchResults.length > 0) {
        state.batchResults.forEach(result => {
            if (result.graded_image_base64) {
                const gradedImageName = `${result.image_name}_graded.png`;
                zip.file(gradedImageName, result.graded_image_base64, {base64: true});
            }
        });
    }

    const zipBlob = await zip.generateAsync({type: 'blob'});

    try {
        const path = `${DROPBOX_CONFIG.folderPath}/${zipName}.zip`;

        await dropboxClient.filesUpload({
            path: path,
            contents: zipBlob,
            mode: 'add',
            autorename: true
        });

        alert(`Successfully saved to Dropbox: ${path}`);
        goToStart();
    } catch (error) {
        console.error('Dropbox upload failed:', error);
        alert('Failed to save to Dropbox: ' + error.message);
    }
}

async function loadFromDropbox() {
    if (!dropboxClient) {
        const confirm = window.confirm('You need to connect to Dropbox first. Connect now?');
        if (confirm) {
            await authenticateDropbox();
        }
        return;
    }

    try {
        // List files in the Diamond-Classifier folder
        const response = await dropboxClient.filesListFolder({
            path: DROPBOX_CONFIG.folderPath
        });

        const zipFiles = response.result.entries.filter(entry =>
            entry['.tag'] === 'file' && entry.name.endsWith('.zip')
        );

        if (zipFiles.length === 0) {
            alert('No saved classifications found in Dropbox');
            return;
        }

        // Show file picker
        const fileList = zipFiles.map((file, index) =>
            `${index + 1}. ${file.name}`
        ).join('\n');

        const selection = prompt(`Select a file to load (enter number):\n\n${fileList}`);

        if (!selection) return;

        const fileIndex = parseInt(selection) - 1;

        if (fileIndex < 0 || fileIndex >= zipFiles.length) {
            alert('Invalid selection');
            return;
        }

        const selectedFile = zipFiles[fileIndex];

        // Download the file
        const downloadResponse = await dropboxClient.filesDownload({
            path: selectedFile.path_lower
        });

        const blob = downloadResponse.result.fileBlob;

        // Process the ZIP file
        const zip = await JSZip.loadAsync(blob);
        console.log('ZIP loaded from Dropbox, files:', Object.keys(zip.files));

        // Find JSON file
        let jsonFile = null;
        for (const [filename, file] of Object.entries(zip.files)) {
            if (filename.endsWith('.json') && !file.dir) {
                jsonFile = file;
                break;
            }
        }

        if (!jsonFile) {
            alert('No JSON file found in ZIP');
            return;
        }

        const jsonText = await jsonFile.async('text');
        state.classificationData = JSON.parse(jsonText);

        // Find and load graded images
        const gradedImages = {};
        for (const [filename, file] of Object.entries(zip.files)) {
            if (filename.endsWith('.png') && !file.dir) {
                const base64 = await file.async('base64');
                gradedImages[filename] = base64;
            }
        }

        // Match graded image
        if (gradedImages[state.classificationData.image_name + '_graded.png']) {
            state.classificationData.graded_image_base64 = gradedImages[state.classificationData.image_name + '_graded.png'];
        }

        console.log('Classification loaded from Dropbox successfully');
        showCheckOrSave();

    } catch (error) {
        console.error('Failed to load from Dropbox:', error);
        alert('Failed to load from Dropbox: ' + error.message);
    }
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    console.log('Diamond Classification System loaded');

    // Initialize Dropbox
    initializeDropbox();

    document.getElementById('correction-modal').addEventListener('click', (e) => {
        if (e.target.id === 'correction-modal') {
            closeCorrectionModal();
        }
    });
});
