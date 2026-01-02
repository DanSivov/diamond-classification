// Global State
const state = {
    batchResults: [],
    currentVerification: {
        classifications: [],
        images: {},
        currentIndex: 0,
        verifications: []
    },
    statistics: {
        total: 0,
        correct: 0,
        table: 0,
        tilted: 0,
        byType: {}
    }
};

// Tab Switching
function switchTab(tabName) {
    // Hide all tabs
    document.querySelectorAll('.tab-content').forEach(tab => {
        tab.classList.remove('active');
    });
    document.querySelectorAll('.tab-button').forEach(btn => {
        btn.classList.remove('active');
    });

    // Show selected tab
    document.getElementById(tabName).classList.add('active');
    event.target.classList.add('active');
}

// Batch Review Functions
function loadJSONFiles() {
    const fileInput = document.getElementById('json-upload');
    const files = fileInput.files;

    if (files.length === 0) {
        alert('Please select JSON files to upload');
        return;
    }

    state.batchResults = [];
    const resultsContainer = document.getElementById('batch-results');
    resultsContainer.innerHTML = '<p class="placeholder">Loading...</p>';

    let filesProcessed = 0;

    Array.from(files).forEach(file => {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = JSON.parse(e.target.result);
                state.batchResults.push(data);
                filesProcessed++;

                if (filesProcessed === files.length) {
                    displayBatchResults();
                }
            } catch (error) {
                console.error('Error parsing JSON:', error);
                alert(`Error parsing ${file.name}: ${error.message}`);
            }
        };
        reader.readAsText(file);
    });
}

function displayBatchResults() {
    const container = document.getElementById('batch-results');
    container.innerHTML = '';

    if (state.batchResults.length === 0) {
        container.innerHTML = '<p class="placeholder">No results to display</p>';
        return;
    }

    state.batchResults.forEach((result, index) => {
        const card = document.createElement('div');
        card.className = 'result-card';

        const summary = `
            <h3>📄 ${result.image_name || `Result ${index + 1}`}</h3>
            <div class="result-grid">
                <div class="result-item">
                    <strong>Total Diamonds:</strong>
                    <span>${result.total_diamonds || 0}</span>
                </div>
                <div class="result-item">
                    <strong>Table:</strong>
                    <span style="color: var(--success-color)">${result.table_count || 0}</span>
                </div>
                <div class="result-item">
                    <strong>Tilted:</strong>
                    <span style="color: var(--warning-color)">${result.tilted_count || 0}</span>
                </div>
                <div class="result-item">
                    <strong>Pickable:</strong>
                    <span style="color: var(--primary-color)">${result.pickable_count || 0}</span>
                </div>
                <div class="result-item">
                    <strong>Invalid:</strong>
                    <span style="color: var(--danger-color)">${result.invalid_count || 0}</span>
                </div>
                <div class="result-item">
                    <strong>Avg Grade:</strong>
                    <span>${result.average_grade ? result.average_grade.toFixed(1) : 'N/A'}</span>
                </div>
            </div>
        `;

        card.innerHTML = summary;
        container.appendChild(card);
    });
}

// ROI Verification Functions
function startVerification() {
    const jsonInput = document.getElementById('roi-json-upload');
    const imageInput = document.getElementById('roi-image-upload');

    if (jsonInput.files.length === 0) {
        alert('Please select a classification JSON file');
        return;
    }

    // Load JSON
    const jsonReader = new FileReader();
    jsonReader.onload = (e) => {
        try {
            const data = JSON.parse(e.target.result);
            state.currentVerification.classifications = data.classifications || [];

            // Load images if provided
            if (imageInput.files.length > 0) {
                loadVerificationImages(imageInput.files);
            } else {
                initializeVerification();
            }
        } catch (error) {
            alert(`Error parsing JSON: ${error.message}`);
        }
    };
    jsonReader.readAsText(jsonInput.files[0]);
}

function loadVerificationImages(files) {
    state.currentVerification.images = {};
    let imagesLoaded = 0;

    Array.from(files).forEach(file => {
        const reader = new FileReader();
        reader.onload = (e) => {
            state.currentVerification.images[file.name] = e.target.result;
            imagesLoaded++;

            if (imagesLoaded === files.length) {
                initializeVerification();
            }
        };
        reader.readAsDataURL(file);
    });
}

function initializeVerification() {
    if (state.currentVerification.classifications.length === 0) {
        alert('No classifications found in JSON file');
        return;
    }

    state.currentVerification.currentIndex = 0;
    state.currentVerification.verifications = [];

    document.getElementById('verification-controls').style.display = 'block';
    updateVerificationDisplay();

    // Add keyboard listener
    document.addEventListener('keydown', handleVerificationKeyboard);
}

function updateVerificationDisplay() {
    const index = state.currentVerification.currentIndex;
    const classifications = state.currentVerification.classifications;

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
    document.getElementById('roi-title').textContent = `ROI #${classification.roi_id}`;
    document.getElementById('roi-type').textContent = classification.diamond_type.toUpperCase();
    document.getElementById('roi-orientation').textContent = classification.orientation.toUpperCase();
    document.getElementById('roi-confidence').textContent = `${(classification.confidence * 100).toFixed(1)}%`;

    // Update orientation color
    const orientationSpan = document.getElementById('roi-orientation');
    orientationSpan.style.color = classification.orientation === 'table' ?
        'var(--success-color)' : 'var(--warning-color)';

    // TODO: Draw ROI on canvas (requires image data)
    // For now, just show placeholder
    drawPlaceholderCanvas('context-canvas', 'Context View');
    drawPlaceholderCanvas('roi-canvas', `ROI #${classification.roi_id}`);
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
    ctx.fillText('(Image preview not available)', canvas.width / 2, canvas.height / 2 + 25);
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
    const index = state.currentVerification.currentIndex;
    const classification = state.currentVerification.classifications[index];

    state.currentVerification.verifications.push({
        roi_id: classification.roi_id,
        predicted_type: classification.diamond_type,
        predicted_orientation: classification.orientation,
        confidence: classification.confidence,
        is_correct: true,
        verified_type: classification.diamond_type,
        verified_orientation: classification.orientation,
        timestamp: new Date().toISOString()
    });

    console.log(`✓ ROI ${classification.roi_id}: Verified as CORRECT`);
    state.currentVerification.currentIndex++;
    updateVerificationDisplay();
}

function verifyWrong() {
    const index = state.currentVerification.currentIndex;
    const classification = state.currentVerification.classifications[index];

    // Show correction modal
    const modal = document.getElementById('correction-modal');
    document.getElementById('modal-prediction').textContent =
        `${classification.diamond_type.toUpperCase()}, ${classification.orientation.toUpperCase()}`;

    document.getElementById('correct-orientation').value = classification.orientation;
    document.getElementById('correct-type').value = classification.diamond_type;

    modal.classList.add('active');
}

function submitCorrection() {
    const index = state.currentVerification.currentIndex;
    const classification = state.currentVerification.classifications[index];

    const correctOrientation = document.getElementById('correct-orientation').value;
    const correctType = document.getElementById('correct-type').value;

    state.currentVerification.verifications.push({
        roi_id: classification.roi_id,
        predicted_type: classification.diamond_type,
        predicted_orientation: classification.orientation,
        confidence: classification.confidence,
        is_correct: false,
        verified_type: correctType,
        verified_orientation: correctOrientation,
        timestamp: new Date().toISOString()
    });

    console.log(`✗ ROI ${classification.roi_id}: Corrected to ${correctType.toUpperCase()}, ${correctOrientation.toUpperCase()}`);

    closeCorrectionModal();
    state.currentVerification.currentIndex++;
    updateVerificationDisplay();
}

function closeCorrectionModal() {
    document.getElementById('correction-modal').classList.remove('active');
}

function verifySkip() {
    const index = state.currentVerification.currentIndex;
    const classification = state.currentVerification.classifications[index];

    console.log(`⊘ ROI ${classification.roi_id}: Skipped`);
    state.currentVerification.currentIndex++;
    updateVerificationDisplay();
}

function verifyQuit() {
    if (confirm('Are you sure you want to quit? Your progress will be exported.')) {
        completeVerification();
    }
}

function completeVerification() {
    document.removeEventListener('keydown', handleVerificationKeyboard);

    alert(`Verification complete! Verified ${state.currentVerification.verifications.length} ROIs.`);

    // Update statistics
    updateStatistics();

    // Switch to statistics tab
    switchTab('statistics');
    document.querySelector('.tab-button:nth-child(3)').click();
}

// Statistics Functions
function updateStatistics() {
    const verifications = state.currentVerification.verifications;

    if (verifications.length === 0) {
        return;
    }

    const total = verifications.length;
    const correct = verifications.filter(v => v.is_correct).length;
    const accuracy = (correct / total) * 100;

    let tableCount = 0;
    let tiltedCount = 0;
    const byType = {};

    verifications.forEach(v => {
        if (v.verified_orientation === 'table') tableCount++;
        if (v.verified_orientation === 'tilted') tiltedCount++;

        byType[v.verified_type] = (byType[v.verified_type] || 0) + 1;
    });

    // Update display
    document.getElementById('stat-total').textContent = total;
    document.getElementById('stat-accuracy').textContent = `${accuracy.toFixed(1)}%`;
    document.getElementById('stat-table').textContent = tableCount;
    document.getElementById('stat-tilted').textContent = tiltedCount;

    // Update verification log
    displayVerificationLog(verifications);

    // Store in state
    state.statistics = { total, correct, table: tableCount, tilted: tiltedCount, byType };
}

function displayVerificationLog(verifications) {
    const logContainer = document.getElementById('verification-log');
    logContainer.innerHTML = '';

    if (verifications.length === 0) {
        logContainer.innerHTML = '<p class="placeholder">No verification data available</p>';
        return;
    }

    verifications.forEach(v => {
        const logItem = document.createElement('div');
        logItem.className = `log-item ${v.is_correct ? 'correct' : 'wrong'}`;

        const status = v.is_correct ? '✓' : '✗';
        const color = v.is_correct ? 'var(--success-color)' : 'var(--danger-color)';

        logItem.innerHTML = `
            <div>
                <span style="color: ${color}; font-weight: bold; margin-right: 10px">${status}</span>
                ROI #${v.roi_id}:
                ${v.verified_type.toUpperCase()}, ${v.verified_orientation.toUpperCase()}
                ${!v.is_correct ? `(predicted: ${v.predicted_orientation.toUpperCase()})` : ''}
            </div>
            <div style="color: var(--text-secondary); font-size: 0.9em">
                ${v.confidence ? `${(v.confidence * 100).toFixed(1)}%` : ''}
            </div>
        `;

        logContainer.appendChild(logItem);
    });
}

// Export Functions
function exportVerifications() {
    const verifications = state.currentVerification.verifications;

    if (verifications.length === 0) {
        alert('No verification data to export');
        return;
    }

    const dataStr = JSON.stringify(verifications, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });

    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `verifications_${new Date().toISOString().split('T')[0]}.json`;
    link.click();

    URL.revokeObjectURL(url);
}

function exportCSV() {
    const verifications = state.currentVerification.verifications;

    if (verifications.length === 0) {
        alert('No verification data to export as CSV');
        return;
    }

    // CSV Header
    let csv = 'roi_id,predicted_type,predicted_orientation,verified_type,verified_orientation,is_correct,confidence,timestamp\n';

    // CSV Rows
    verifications.forEach(v => {
        csv += `${v.roi_id},${v.predicted_type},${v.predicted_orientation},${v.verified_type},${v.verified_orientation},${v.is_correct},${v.confidence},${v.timestamp}\n`;
    });

    const dataBlob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `verification_data_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();

    URL.revokeObjectURL(url);
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    console.log('Diamond Classification Verification System loaded');
    console.log('Model: Random Forest Classifier (95.6% accuracy)');

    // Click outside modal to close
    document.getElementById('correction-modal').addEventListener('click', (e) => {
        if (e.target.id === 'correction-modal') {
            closeCorrectionModal();
        }
    });
});
