// Global State
const state = {
    currentStep: 'start',
    classificationData: null,
    verificationData: [],
    currentROIIndex: 0,
    savedCodexes: []
};

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
function loadExistingClassification() {
    const fileInput = document.getElementById('existing-json-upload');
    if (fileInput.files.length === 0) {
        alert('Please select a JSON file');
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

// Step 3: Load New Classification
function loadNewClassification() {
    const fileInput = document.getElementById('new-json-upload');
    if (fileInput.files.length === 0) {
        alert('Please select a JSON file');
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

    drawPlaceholderCanvas('context-canvas', 'Context View');
    drawPlaceholderCanvas('roi-canvas', `ROI ${classification.roi_id}`);
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

function downloadResults() {
    const timestamp = document.getElementById('save-timestamp').textContent;

    const dataStr = JSON.stringify(state.verificationData, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });

    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `verification_${timestamp}.json`;
    link.click();

    URL.revokeObjectURL(url);

    goToStart();
}

// Step 7: Save Directly
function saveDirectly() {
    showStep('save-directly');
}

function downloadClassification() {
    const dataStr = JSON.stringify(state.classificationData, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });

    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `classification_${state.classificationData.image_name || 'result'}.json`;
    link.click();

    URL.revokeObjectURL(url);

    goToStart();
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    console.log('Diamond Classification System loaded');

    document.getElementById('correction-modal').addEventListener('click', (e) => {
        if (e.target.id === 'correction-modal') {
            closeCorrectionModal();
        }
    });
});
