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
    currentJob: null,  // Current job being processed
    currentJobImages: null,  // Images from current job
    currentImage: null,  // Current image being verified
    currentROIs: null,  // ROIs from current image
    userEmail: localStorage.getItem('userEmail') || null,  // User email for verification
    apiUrl: window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
        ? 'http://localhost:5000'
        : 'https://web-production-53bec.up.railway.app'
};

// Dropbox Configuration
const DROPBOX_CONFIG = {
    clientId: 'jyiz9jj4khq51k7',
    redirectUri: 'https://dansivov.github.io/diamond-classification',
    folderPath: '/sorting-robot'
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

// ============================================================================
// Authentication Functions
// ============================================================================

function handleLogin() {
    const email = document.getElementById('login-email').value.trim();

    if (!email || !email.includes('@')) {
        alert('Please enter a valid email address');
        return;
    }

    // Save email to state and localStorage
    state.userEmail = email;
    localStorage.setItem('userEmail', email);

    // Show user bar and header
    document.getElementById('user-bar').style.display = 'flex';
    document.getElementById('main-header').style.display = 'block';
    document.getElementById('current-user-email').textContent = email;

    // Go to dashboard
    showStep('dashboard');
}

function handleLogout() {
    if (!confirm('Are you sure you want to sign out?')) {
        return;
    }

    // Clear state
    state.userEmail = null;
    state.currentJob = null;
    state.currentJobImages = null;
    localStorage.removeItem('userEmail');

    // Hide user bar and header
    document.getElementById('user-bar').style.display = 'none';
    document.getElementById('main-header').style.display = 'none';

    // Clear login input
    document.getElementById('login-email').value = '';

    // Return to login
    showStep('login');
}

// Check if user is already logged in on page load
window.addEventListener('DOMContentLoaded', () => {
    if (state.userEmail) {
        document.getElementById('login-email').value = state.userEmail;
        handleLogin();
    }
});

// ============================================================================
// Dashboard Functions
// ============================================================================

function startNewJob() {
    showStep('new-job-source');
}

async function showPreviousJobs() {
    try {
        showStep('previous-jobs');

        // Fetch all jobs from API
        // TODO: Filter by user once we add user tracking to jobs
        const response = await fetch(`${state.apiUrl}/jobs`);

        if (!response.ok) {
            throw new Error('Failed to fetch jobs');
        }

        const data = await response.json();
        displayJobsList(data.jobs);

    } catch (error) {
        console.error('Error fetching jobs:', error);
        alert('Failed to load previous jobs: ' + error.message);
        showStep('dashboard');
    }
}

function displayJobsList(jobs) {
    const container = document.getElementById('jobs-list');

    if (!jobs || jobs.length === 0) {
        container.innerHTML = `
            <div class="browser-empty">
                <p>No previous jobs found</p>
                <p style="margin-top: 8px;">Start a new verification job to get started</p>
            </div>
        `;
        return;
    }

    container.innerHTML = jobs.map(job => {
        const statusColor = job.status === 'complete' ? 'var(--success)' :
                          job.status === 'in_progress' ? 'var(--warning)' :
                          job.status === 'ready' ? 'var(--primary)' :
                          job.status === 'failed' ? 'var(--danger)' : 'var(--text-secondary)';

        return `
        <div class="job-item" onclick="resumeJob('${job.id}')">
            <div class="job-item-header">
                <div class="job-item-title">Job #${job.id.substring(0, 8)}</div>
                <div class="job-item-date">${new Date(job.created_at).toLocaleDateString()}</div>
            </div>
            <div class="job-item-stats">
                <div class="job-stat">
                    <div class="job-stat-value">${job.total_images}</div>
                    <div class="job-stat-label">Images</div>
                </div>
                <div class="job-stat">
                    <div class="job-stat-value">${job.verified_rois || 0} / ${job.total_rois || 0}</div>
                    <div class="job-stat-label">ROIs Verified</div>
                </div>
                <div class="job-stat">
                    <div class="job-stat-value" style="color: ${statusColor}">${job.status}</div>
                    <div class="job-stat-label">Status</div>
                </div>
            </div>
        </div>
    `;
    }).join('');
}

async function resumeJob(jobId) {
    try {
        console.log('Resuming job:', jobId);

        // Load job results
        await loadJobResults(jobId);

    } catch (error) {
        console.error('Error resuming job:', error);
        alert('Failed to resume job: ' + error.message);
    }
}

// ============================================================================
// Job Management Functions
// ============================================================================

async function showManageJobs() {
    try {
        showStep('manage-jobs');

        // Fetch all jobs from API
        const response = await fetch(`${state.apiUrl}/jobs`);

        if (!response.ok) {
            throw new Error('Failed to fetch jobs');
        }

        const data = await response.json();
        displayManageJobsList(data.jobs);

    } catch (error) {
        console.error('Error fetching jobs:', error);
        alert('Failed to load jobs: ' + error.message);
        showStep('dashboard');
    }
}

function displayManageJobsList(jobs) {
    const container = document.getElementById('manage-jobs-list');

    if (!jobs || jobs.length === 0) {
        container.innerHTML = `
            <div class="browser-empty">
                <p>No jobs found</p>
            </div>
        `;
        return;
    }

    container.innerHTML = jobs.map(job => {
        const canContinue = (job.status === 'ready' || job.status === 'in_progress' || job.status === 'complete') && job.total_rois > 0;
        const statusColor = job.status === 'complete' ? 'var(--success)' :
                          job.status === 'in_progress' ? 'var(--warning)' :
                          job.status === 'ready' ? 'var(--primary)' :
                          job.status === 'failed' ? 'var(--danger)' : 'var(--text-secondary)';

        return `
            <div class="job-item" style="position: relative;">
                <div class="job-item-header">
                    <div class="job-item-title">Job #${job.id.substring(0, 8)}</div>
                    <div class="job-item-date">${new Date(job.created_at).toLocaleDateString()} ${new Date(job.created_at).toLocaleTimeString()}</div>
                </div>
                <div class="job-item-stats">
                    <div class="job-stat">
                        <div class="job-stat-value">${job.total_images}</div>
                        <div class="job-stat-label">Images</div>
                    </div>
                    <div class="job-stat">
                        <div class="job-stat-value">${job.verified_rois || 0} / ${job.total_rois || 0}</div>
                        <div class="job-stat-label">ROIs Verified</div>
                    </div>
                    <div class="job-stat">
                        <div class="job-stat-value" style="color: ${statusColor}">${job.status}</div>
                        <div class="job-stat-label">Status</div>
                    </div>
                </div>
                <div style="display: flex; gap: 12px; margin-top: 16px;">
                    ${canContinue ? `<button onclick="resumeJob('${job.id}')" class="btn-primary" style="flex: 1;">Continue Verification</button>` : ''}
                    <button onclick="confirmDeleteJob('${job.id}')" class="btn-wrong" style="flex: 1;">Delete Job</button>
                </div>
            </div>
        `;
    }).join('');
}

async function confirmDeleteJob(jobId) {
    if (!confirm('Are you sure you want to delete this job? This will permanently delete all images, ROIs, and verifications associated with this job.')) {
        return;
    }

    try {
        const response = await fetch(`${state.apiUrl}/jobs/${jobId}`, {
            method: 'DELETE'
        });

        if (!response.ok) {
            throw new Error('Failed to delete job');
        }

        console.log('Job deleted:', jobId);

        // Refresh the jobs list
        await showManageJobs();

        alert('Job deleted successfully');

    } catch (error) {
        console.error('Error deleting job:', error);
        alert('Failed to delete job: ' + error.message);
    }
}

function selectFromDropbox() {
    openDropboxBrowser();
}

function selectFromComputer() {
    // TODO: Implement computer upload for new job
    alert('Computer upload coming soon. Please use Dropbox for now.');
    showStep('new-job-source');
}

function goToStart() {
    state.classificationData = null;
    state.verificationData = [];
    state.currentROIIndex = 0;
    state.uploadedImage = null;
    state.currentJob = null;
    state.currentJobImages = null;
    showStep('dashboard');
}

// Step 1: Start
function uploadExisting() {
    showStep('upload-existing');
}

function uploadFromComputer() {
    showStep('upload-computer');
}

function beginNewClassification() {
    showStep('new-classification-source');
}

function processFromComputer() {
    showStep('new-classification');
}

// Dropbox File Browser State
const dropboxBrowserState = {
    currentPath: '',
    selectedFiles: [],
    allEntries: []
};

async function processFromDropbox() {
    if (!dropboxClient) {
        const confirm = window.confirm('You need to connect to Dropbox first. Connect now?');
        if (confirm) {
            await authenticateDropbox();
        }
        return;
    }

    // Reset browser state
    dropboxBrowserState.currentPath = '';
    dropboxBrowserState.selectedFiles = [];
    dropboxBrowserState.allEntries = [];

    // Show modal and load root folder
    openDropboxBrowser();
    await loadDropboxFolder('');
}

async function openDropboxBrowser() {
    const modal = document.getElementById('dropbox-browser-modal');
    modal.classList.add('active');

    // Initialize Dropbox if needed
    if (!dropboxClient) {
        await initializeDropbox();
    }

    // Load the default folder
    await loadDropboxFolder(DROPBOX_CONFIG.folderPath);
}

function closeDropboxBrowser() {
    const modal = document.getElementById('dropbox-browser-modal');
    modal.classList.remove('active');
    dropboxBrowserState.selectedFiles = [];
    dropboxBrowserState.allEntries = [];
}

async function loadDropboxFolder(path) {
    const content = document.getElementById('file-browser-content');
    content.innerHTML = '<div class="browser-loading">Loading...</div>';

    try {
        const response = await dropboxClient.filesListFolder({
            path: path,
            recursive: false
        });

        dropboxBrowserState.currentPath = path;
        dropboxBrowserState.allEntries = response.result.entries;

        renderBreadcrumb(path);
        renderFileList(response.result.entries);

    } catch (error) {
        console.error('Failed to load Dropbox folder:', error);

        // Handle 401 authentication error
        if (error.status === 401) {
            content.innerHTML = `
                <div class="browser-error">
                    <p>Session expired. Please reconnect to Dropbox.</p>
                    <button onclick="reauthenticateDropbox()" class="btn-primary">Reconnect</button>
                </div>
            `;
        } else if (error.status === 409) {
            // 409 means path not found - try loading root folder
            console.log('Path not found, loading root folder instead');
            if (path !== '') {
                await loadDropboxFolder('');
            } else {
                content.innerHTML = `
                    <div class="browser-error">
                        <p>Unable to access Dropbox folder. Please check your permissions.</p>
                    </div>
                `;
            }
        } else {
            content.innerHTML = `
                <div class="browser-error">
                    <p>Failed to load folder: ${error.message}</p>
                    <button onclick="loadDropboxFolder('${path}')" class="btn-primary">Retry</button>
                </div>
            `;
        }
    }
}

async function reauthenticateDropbox() {
    localStorage.removeItem('dropboxAccessToken');
    dropboxClient = null;
    closeDropboxBrowser();
    await authenticateDropbox();
}

function renderBreadcrumb(path) {
    const breadcrumbPath = document.getElementById('breadcrumb-path');
    breadcrumbPath.innerHTML = '';

    const parts = path ? path.split('/').filter(p => p) : [];

    // Add root
    const root = document.createElement('span');
    root.className = 'breadcrumb-item';
    root.textContent = 'Root';
    root.onclick = () => loadDropboxFolder('');
    breadcrumbPath.appendChild(root);

    // Add path parts
    let currentPath = '';
    parts.forEach((part, index) => {
        const separator = document.createElement('span');
        separator.className = 'breadcrumb-separator';
        separator.textContent = '/';
        breadcrumbPath.appendChild(separator);

        currentPath += '/' + part;
        const pathPart = currentPath;

        const item = document.createElement('span');
        item.className = 'breadcrumb-item';
        item.textContent = part;
        item.onclick = () => loadDropboxFolder(pathPart);
        breadcrumbPath.appendChild(item);
    });
}

function renderFileList(entries) {
    const content = document.getElementById('file-browser-content');

    if (entries.length === 0) {
        content.innerHTML = '<div class="browser-empty">This folder is empty</div>';
        return;
    }

    // Separate folders and files
    const folders = entries.filter(e => e['.tag'] === 'folder').sort((a, b) => a.name.localeCompare(b.name));
    const imageExtensions = ['.jpg', '.jpeg', '.png', '.jp2'];
    const files = entries
        .filter(e => {
            if (e['.tag'] !== 'file') return false;
            const ext = e.name.substring(e.name.lastIndexOf('.')).toLowerCase();
            return imageExtensions.includes(ext);
        })
        .sort((a, b) => a.name.localeCompare(b.name));

    const ul = document.createElement('ul');
    ul.className = 'file-list';

    // Render folders
    folders.forEach(folder => {
        const li = document.createElement('li');
        li.className = 'file-item folder';
        li.innerHTML = `
            <span class="file-icon">📁</span>
            <span class="file-name">${folder.name}</span>
        `;
        li.onclick = () => loadDropboxFolder(folder.path_lower);
        ul.appendChild(li);
    });

    // Render image files
    files.forEach(file => {
        const li = document.createElement('li');
        li.className = 'file-item file';
        li.innerHTML = `
            <input type="checkbox" class="file-checkbox" data-path="${file.path_lower}" data-name="${file.name}">
            <span class="file-icon">🖼️</span>
            <span class="file-name">${file.name}</span>
        `;

        const checkbox = li.querySelector('.file-checkbox');
        checkbox.onchange = (e) => {
            e.stopPropagation();
            updateSelectedFiles();
        };

        li.onclick = (e) => {
            if (e.target !== checkbox) {
                checkbox.checked = !checkbox.checked;
                updateSelectedFiles();
            }
        };

        ul.appendChild(li);
    });

    content.innerHTML = '';
    content.appendChild(ul);

    updateSelectedFiles();
}

function updateSelectedFiles() {
    const checkboxes = document.querySelectorAll('.file-checkbox:checked');
    dropboxBrowserState.selectedFiles = Array.from(checkboxes).map(cb => ({
        path: cb.dataset.path,
        name: cb.dataset.name
    }));

    const count = dropboxBrowserState.selectedFiles.length;
    document.getElementById('selected-count').textContent = `${count} file${count !== 1 ? 's' : ''} selected`;
}

function selectAllDropboxImages() {
    const checkboxes = document.querySelectorAll('.file-checkbox');
    checkboxes.forEach(checkbox => {
        checkbox.checked = true;
    });
    updateSelectedFiles();
}

function deselectAllDropboxImages() {
    const checkboxes = document.querySelectorAll('.file-checkbox');
    checkboxes.forEach(checkbox => {
        checkbox.checked = false;
    });
    updateSelectedFiles();
}

async function processSelectedDropboxFiles() {
    if (dropboxBrowserState.selectedFiles.length === 0) {
        alert('Please select at least one image file');
        return;
    }

    // Save selected files before closing modal (which clears the state)
    const filesToDownload = [...dropboxBrowserState.selectedFiles];

    closeDropboxBrowser();

    try {
        // Download images from Dropbox
        console.log('Downloading', filesToDownload.length, 'images from Dropbox...');
        showStep('processing');
        showProcessingStatus(`Downloading ${filesToDownload.length} images from Dropbox...`, 0);

        const filesData = [];
        for (let i = 0; i < filesToDownload.length; i++) {
            const file = filesToDownload[i];
            const progress = Math.round((i / filesToDownload.length) * 30); // 0-30% for download
            showProcessingStatus(`Downloading ${file.name}... (${i + 1}/${filesToDownload.length})`, progress);

            const downloadResponse = await dropboxClient.filesDownload({
                path: file.path
            });

            const blob = downloadResponse.result.fileBlob;

            // Convert to base64 for efficient JSON transfer
            const arrayBuffer = await blob.arrayBuffer();
            const uint8Array = new Uint8Array(arrayBuffer);

            // Convert to base64 in chunks to avoid stack overflow on large files
            let base64 = '';
            const chunkSize = 32768; // 32KB chunks
            for (let i = 0; i < uint8Array.length; i += chunkSize) {
                const chunk = uint8Array.subarray(i, i + chunkSize);
                base64 += String.fromCharCode.apply(null, chunk);
            }
            base64 = btoa(base64);

            filesData.push({
                filename: file.name,
                data: base64  // Send as base64 string instead of array
            });
        }

        console.log('Downloaded', filesData.length, 'files from Dropbox');

        // Check if API is available
        showProcessingStatus('Checking API availability...', 35);
        const apiAvailable = await checkAPIHealth();

        if (!apiAvailable) {
            alert('API server not available. Try again later.');
            showStep('new-classification-source');
            return;
        }

        // Create async job
        showProcessingStatus('Creating job...', 40);

        const response = await fetch(`${state.apiUrl}/jobs/create`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ files: filesData })
        });

        if (!response.ok) {
            throw new Error('Failed to create job');
        }

        const jobData = await response.json();
        state.currentJob = jobData;

        console.log('Job created:', jobData.job_id);

        // Start polling for job status
        pollJobStatus(jobData.job_id);

    } catch (error) {
        console.error('Dropbox image processing failed:', error);

        // Handle 401 authentication error
        if (error.status === 401) {
            alert('Session expired. Please reconnect to Dropbox.');
            await reauthenticateDropbox();
        } else {
            alert('Failed to process images from Dropbox: ' + error.message);
        }
        showStep('new-classification-source');
    }
}

// Poll job status until complete
async function pollJobStatus(jobId) {
    try {
        const response = await fetch(`${state.apiUrl}/jobs/${jobId}/status`);

        if (!response.ok) {
            throw new Error('Failed to get job status');
        }

        const job = await response.json();
        state.currentJob = job;

        console.log('Job status:', job.status, `${job.processed_images}/${job.total_images}`);

        // Update UI
        const progress = job.total_images > 0 ? Math.round((job.processed_images / job.total_images) * 100) : 0;
        showProcessingStatus(`Processing images... ${job.processed_images}/${job.total_images}`, 40 + Math.round(progress * 0.6));

        if (job.status === 'complete') {
            // Job finished successfully
            showProcessingStatus('Complete!', 100);
            console.log('Job completed successfully');

            // Load job results
            await loadJobResults(jobId);

        } else if (job.status === 'failed') {
            // Job failed
            throw new Error(job.error_message || 'Job processing failed');

        } else {
            // Still processing, poll again in 2 seconds
            setTimeout(() => pollJobStatus(jobId), 2000);
        }

    } catch (error) {
        console.error('Error polling job status:', error);
        alert('Failed to check job status: ' + error.message);
        showStep('new-classification-source');
    }
}

// Load completed job results
async function loadJobResults(jobId) {
    try {
        const response = await fetch(`${state.apiUrl}/jobs/${jobId}/images`);

        if (!response.ok) {
            throw new Error('Failed to load job results');
        }

        const data = await response.json();
        state.currentJob = data.job;
        state.currentJobImages = data.images;

        console.log('Job results loaded:', data.images.length, 'images');

        // Show job summary
        showJobSummary();

    } catch (error) {
        console.error('Error loading job results:', error);
        alert('Failed to load results: ' + error.message);
        showStep('new-classification-source');
    }
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
        let errorMessage = 'Classification failed';
        try {
            const errorData = await response.json();
            errorMessage = errorData.error || errorMessage;
        } catch (e) {
            errorMessage = `Server error: ${response.status} ${response.statusText}`;
        }
        throw new Error(errorMessage);
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

    console.log('Sending batch request to:', `${state.apiUrl}/classify-batch`);
    console.log('Files:', Array.from(files).map(f => f.name));

    const response = await fetch(`${state.apiUrl}/classify-batch`, {
        method: 'POST',
        body: formData
    });

    console.log('Batch response status:', response.status);

    if (!response.ok) {
        let errorMessage = 'Batch classification failed';
        try {
            const errorData = await response.json();
            errorMessage = errorData.error || errorMessage;
        } catch (e) {
            errorMessage = `Server error: ${response.status} ${response.statusText}`;
        }
        throw new Error(errorMessage);
    }

    const data = await response.json();
    console.log('Batch response data:', data);

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
                    // Note: Batch results don't include images to reduce response size
                    allClassifications.push({
                        ...c,
                        source_image_name: result.image_name,
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

// Show job summary after async processing
function showJobSummary() {
    const job = state.currentJob;
    const images = state.currentJobImages;

    if (!job || !images) {
        alert('No job data available');
        return;
    }

    // Calculate totals
    const totalDiamonds = images.reduce((sum, img) => sum + img.total_diamonds, 0);
    const totalTable = images.reduce((sum, img) => sum + img.table_count, 0);
    const totalTilted = images.reduce((sum, img) => sum + img.tilted_count, 0);
    const totalPickable = images.reduce((sum, img) => sum + img.pickable_count, 0);

    const summary = document.getElementById('job-summary-content');
    summary.innerHTML = `
        <div class="summary-box">
            <p><strong>Job ID:</strong> ${job.id.substring(0, 8)}...</p>
            <p><strong>Images Processed:</strong> ${images.length}</p>
            <p><strong>Total Diamonds Found:</strong> ${totalDiamonds}</p>
            <p><strong>Table:</strong> ${totalTable}</p>
            <p><strong>Tilted:</strong> ${totalTilted}</p>
            <p><strong>Pickable:</strong> ${totalPickable}</p>
        </div>
        <div class="info-box" style="margin-top: 15px;">
            <p><strong>Ready for Verification</strong></p>
            <p>Click "Start Verification" to review and correct the classifications.</p>
            <p>ROI images and graded visualizations are stored in the cloud and will load as you verify.</p>
        </div>
    `;

    showStep('job-summary');
}

// Start verification workflow for async job
async function startJobVerification() {
    try {
        // User is already logged in, email is in state.userEmail

        // Gather all ROIs from all images
        const allROIs = [];
        const imageMap = {}; // Map ROI to its image

        for (const image of state.currentJobImages) {
            // Fetch ROIs for this image
            const response = await fetch(`${state.apiUrl}/images/${image.id}/rois`);
            if (!response.ok) {
                console.error(`Failed to fetch ROIs for image ${image.id}`);
                continue;
            }

            const data = await response.json();

            // Add ROIs to the list
            for (const roi of data.rois) {
                allROIs.push(roi);
                imageMap[roi.id] = image;
            }
        }

        if (allROIs.length === 0) {
            alert('No ROIs found in this job');
            return;
        }

        console.log(`Loaded ${allROIs.length} total ROIs from ${state.currentJobImages.length} images`);

        // Find first unverified ROI (ROI without verification from current user)
        let startIndex = 0;
        for (let i = 0; i < allROIs.length; i++) {
            const roi = allROIs[i];
            const hasVerification = roi.verifications && roi.verifications.some(v => v.user_email === state.userEmail);
            if (!hasVerification) {
                startIndex = i;
                break;
            }
        }

        console.log(`Resuming from ROI ${startIndex + 1} / ${allROIs.length}`);

        // Store all ROIs and image map, start from the first unverified one
        state.currentROIs = allROIs;
        state.currentROIImageMap = imageMap;  // Store image map for later use
        state.currentROIIndex = startIndex;
        state.currentImage = imageMap[allROIs[startIndex].id];

        // Start verification UI
        startROIVerification();

    } catch (error) {
        console.error('Error starting job verification:', error);
        alert('Failed to start verification: ' + error.message);
    }
}

// Export verified labels from job
async function exportJobLabels() {
    try {
        const jobId = state.currentJob.id;

        const response = await fetch(`${state.apiUrl}/jobs/${jobId}/export`);
        if (!response.ok) {
            throw new Error(`Export failed: ${response.statusText}`);
        }

        const data = await response.json();

        // Download as JSON file
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `job_${jobId.substring(0, 8)}_labels_${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        alert(`Exported ${data.total_labels} labels`);

    } catch (error) {
        console.error('Error exporting labels:', error);
        alert('Failed to export labels: ' + error.message);
    }
}

// Start ROI verification for async job
function startROIVerification() {
    state.currentROIIndex = 0;
    state.currentImageIndex = 0;
    state.verificationData = [];

    showStep('verification');
    updateROIVerificationDisplay();

    document.addEventListener('keydown', handleROIVerificationKeyboard);
}

// Update verification display for database ROIs
async function updateROIVerificationDisplay() {
    const rois = state.currentROIs;
    const index = state.currentROIIndex;

    if (index >= rois.length) {
        // All ROIs verified - complete the verification
        alert(`Verification complete! ${rois.length} ROIs verified.`);
        showStep('dashboard');
        return;
    }

    const roi = rois[index];

    // Update current image for this ROI
    if (state.currentROIImageMap) {
        state.currentImage = state.currentROIImageMap[roi.id];
    }

    // Update progress - use actual ROI index and total count
    const totalROIs = rois.length;
    const progress = ((index / totalROIs) * 100);
    document.getElementById('progress-fill').style.width = `${progress}%`;
    document.getElementById('progress-text').textContent = `${index + 1} / ${totalROIs}`;

    // Update ROI info
    const imageName = state.currentImage ? state.currentImage.filename : 'Unknown';
    document.getElementById('roi-title').textContent = `${imageName} - ROI ${roi.roi_index}`;
    document.getElementById('roi-type').textContent = roi.predicted_type.toUpperCase();
    document.getElementById('roi-orientation').textContent = roi.predicted_orientation.toUpperCase();
    document.getElementById('roi-confidence').textContent = `${(roi.confidence * 100).toFixed(1)}%`;

    // Update orientation color
    const orientationSpan = document.getElementById('roi-orientation');
    orientationSpan.style.color = roi.predicted_orientation === 'table' ?
        'var(--success-color)' : 'var(--warning-color)';

    // Load and display images from R2
    await drawROIFromURL(roi);
    await drawContextFromURL(roi);
}

// Draw ROI image from R2 URL
async function drawROIFromURL(roi) {
    const canvas = document.getElementById('roi-canvas');
    const ctx = canvas.getContext('2d');

    if (!roi.roi_image_url) {
        drawPlaceholderCanvas('roi-canvas', `ROI ${roi.roi_index}`);
        return;
    }

    try {
        const img = new Image();
        img.crossOrigin = 'anonymous';

        await new Promise((resolve, reject) => {
            img.onload = resolve;
            img.onerror = reject;
            img.src = roi.roi_image_url;
        });

        canvas.width = 200;
        canvas.height = 200;

        const scale = Math.min(200 / img.width, 200 / img.height);
        const scaledWidth = img.width * scale;
        const scaledHeight = img.height * scale;
        const offsetX = (200 - scaledWidth) / 2;
        const offsetY = (200 - scaledHeight) / 2;

        ctx.fillStyle = '#1f2937';
        ctx.fillRect(0, 0, 200, 200);
        ctx.drawImage(img, offsetX, offsetY, scaledWidth, scaledHeight);

    } catch (error) {
        console.error('Failed to load ROI image:', error);
        drawPlaceholderCanvas('roi-canvas', `ROI ${roi.roi_index}`);
    }
}

// Draw context view from graded image URL
async function drawContextFromURL(roi) {
    const canvas = document.getElementById('context-canvas');
    const ctx = canvas.getContext('2d');

    const currentImage = state.currentImage;
    if (!currentImage.graded_url) {
        drawPlaceholderCanvas('context-canvas', 'Context View');
        return;
    }

    try {
        const img = new Image();
        img.crossOrigin = 'anonymous';

        await new Promise((resolve, reject) => {
            img.onload = resolve;
            img.onerror = reject;
            img.src = currentImage.graded_url;
        });

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

        // Highlight current ROI
        const [x, y, w, h] = roi.bounding_box;
        const sx = offsetX + x * scale;
        const sy = offsetY + y * scale;
        const sw = w * scale;
        const sh = h * scale;

        ctx.strokeStyle = '#fbbf24';
        ctx.lineWidth = 2;
        ctx.strokeRect(sx, sy, sw, sh);

    } catch (error) {
        console.error('Failed to load context image:', error);
        drawPlaceholderCanvas('context-canvas', 'Context View');
    }
}

// Move to next image in job
async function moveToNextImageInJob() {
    const currentImageIndex = state.currentJobImages.findIndex(img => img.id === state.currentImage.id);

    if (currentImageIndex + 1 < state.currentJobImages.length) {
        // Load next image
        const nextImage = state.currentJobImages[currentImageIndex + 1];
        state.currentImage = nextImage;

        // Fetch ROIs for next image
        const response = await fetch(`${state.apiUrl}/images/${nextImage.id}/rois`);
        const data = await response.json();
        state.currentROIs = data.rois;

        // Reset ROI index
        state.currentROIIndex = 0;
        updateROIVerificationDisplay();

    } else {
        // All images verified
        completeJobVerification();
    }
}

// Complete job verification
function completeJobVerification() {
    document.removeEventListener('keydown', handleROIVerificationKeyboard);

    alert(`Verification complete! You verified ${state.verificationData.length} ROIs across ${state.currentJobImages.length} images.`);

    // Show job summary again
    showJobSummary();
}

// Handle keyboard input for ROI verification
function handleROIVerificationKeyboard(e) {
    if (e.key === 'y' || e.key === 'Y') {
        verifyROICorrect();
    } else if (e.key === 'n' || e.key === 'N') {
        verifyROIWrong();
    } else if (e.key === 's' || e.key === 'S') {
        verifyROISkip();
    } else if (e.key === 'q' || e.key === 'Q') {
        verifyROIQuit();
    }
}

// Verify ROI as correct
async function verifyROICorrect() {
    const roi = state.currentROIs[state.currentROIIndex];

    try {
        await fetch(`${state.apiUrl}/rois/${roi.id}/verify`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                user_email: state.userEmail,
                is_correct: true
            })
        });

        state.verificationData.push({ roi_id: roi.id, is_correct: true });
        state.currentROIIndex++;
        updateROIVerificationDisplay();

    } catch (error) {
        console.error('Failed to submit verification:', error);
        alert('Failed to submit verification');
    }
}

// Verify ROI as wrong
function verifyROIWrong() {
    const roi = state.currentROIs[state.currentROIIndex];

    // Show correction modal
    const modal = document.getElementById('correction-modal');
    document.getElementById('modal-prediction').textContent =
        `${roi.predicted_type.toUpperCase()} - ${roi.predicted_orientation.toUpperCase()}`;

    // Pre-select current values
    document.getElementById('correct-orientation').value = roi.predicted_orientation;

    modal.style.display = 'flex';
}

// Submit corrected ROI verification
async function submitROICorrection() {
    const roi = state.currentROIs[state.currentROIIndex];
    const correctedOrientation = document.getElementById('correct-orientation').value;

    try {
        await fetch(`${state.apiUrl}/rois/${roi.id}/verify`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                user_email: state.userEmail,
                is_correct: false,
                corrected_orientation: correctedOrientation
            })
        });

        state.verificationData.push({
            roi_id: roi.id,
            is_correct: false,
            corrected_orientation: correctedOrientation
        });

        document.getElementById('correction-modal').style.display = 'none';
        state.currentROIIndex++;
        updateROIVerificationDisplay();

    } catch (error) {
        console.error('Failed to submit correction:', error);
        alert('Failed to submit correction');
    }
}

// Skip ROI verification
function verifyROISkip() {
    state.currentROIIndex++;
    updateROIVerificationDisplay();
}

// Quit ROI verification
function verifyROIQuit() {
    if (confirm('Are you sure you want to quit verification? Progress will be saved.')) {
        document.removeEventListener('keydown', handleROIVerificationKeyboard);
        showJobSummary();
    }
}

// Step 4: Show Check or Save Options
function showCheckOrSave() {
    console.log('showCheckOrSave called, uploadedImage:', state.uploadedImage?.name);
    const summary = document.getElementById('classification-summary');
    const data = state.classificationData;

    const isBatch = state.batchResults && state.batchResults.length > 1;
    const batchNote = isBatch ? `
        <div class="info-box" style="margin-top: 15px; font-size: 0.9em;">
            <p><strong>Note:</strong> Batch processing includes classification data only.
            Visualization images are not included to reduce response size and improve performance.</p>
        </div>
    ` : '';

    summary.innerHTML = `
        <div class="summary-box">
            <p><strong>Image:</strong> ${data.image_name || 'Unknown'}</p>
            <p><strong>Total Diamonds:</strong> ${data.total_diamonds || 0}</p>
            <p><strong>Table:</strong> ${data.table_count || 0}</p>
            <p><strong>Tilted:</strong> ${data.tilted_count || 0}</p>
            <p><strong>Pickable:</strong> ${data.pickable_count || 0}</p>
        </div>
        ${batchNote}
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
        case 'f':
            verifySAMFailure();
            break;
        case 's':
            verifySkip();
            break;
        case 'q':
            verifyQuit();
            break;
    }
}

async function verifyCorrect() {
    // Check if we're in job verification mode or regular verification mode
    if (state.currentJob && state.currentROIs) {
        // Job verification mode - submit to API
        const roi = state.currentROIs[state.currentROIIndex];

        try {
            await fetch(`${state.apiUrl}/rois/${roi.id}/verify`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    user_email: state.userEmail,
                    is_correct: true
                })
            });

            state.verificationData.push({
                roi_id: roi.id,
                is_correct: true
            });

            state.currentROIIndex++;
            updateROIVerificationDisplay();

        } catch (error) {
            console.error('Failed to submit verification:', error);
            alert('Failed to submit verification');
        }
    } else {
        // Regular verification mode
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
}

function verifyWrong() {
    // Check if we're in job verification mode or regular verification mode
    if (state.currentJob && state.currentROIs) {
        // Job verification mode
        const roi = state.currentROIs[state.currentROIIndex];
        const modal = document.getElementById('correction-modal');
        document.getElementById('modal-prediction').textContent =
            `${roi.predicted_type.toUpperCase()}, ${roi.predicted_orientation.toUpperCase()}`;

        document.getElementById('correct-orientation').value = roi.predicted_orientation;
        document.getElementById('correct-type').value = roi.predicted_type;

        modal.classList.add('active');
    } else {
        // Regular verification mode
        const classification = state.classificationData.classifications[state.currentROIIndex];
        const modal = document.getElementById('correction-modal');
        document.getElementById('modal-prediction').textContent =
            `${classification.diamond_type.toUpperCase()}, ${classification.orientation.toUpperCase()}`;

        document.getElementById('correct-orientation').value = classification.orientation;
        document.getElementById('correct-type').value = classification.diamond_type;

        modal.classList.add('active');
    }
}

async function verifySAMFailure() {
    // Check if we're in job verification mode or regular verification mode
    if (state.currentJob && state.currentROIs) {
        // Job verification mode - submit to API with SAM failure note
        const roi = state.currentROIs[state.currentROIIndex];

        try {
            await fetch(`${state.apiUrl}/rois/${roi.id}/verify`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    user_email: state.userEmail,
                    is_correct: false,
                    notes: 'SAM_FAILURE: Detection error (merged/partial diamond)'
                })
            });

            state.verificationData.push({
                roi_id: roi.id,
                is_correct: false,
                notes: 'SAM_FAILURE'
            });

            state.currentROIIndex++;
            updateROIVerificationDisplay();

        } catch (error) {
            console.error('Failed to submit SAM failure:', error);
            alert('Failed to submit SAM failure');
        }
    } else {
        // Regular verification mode
        const classification = state.classificationData.classifications[state.currentROIIndex];

        state.verificationData.push({
            roi_id: classification.roi_id,
            predicted_type: classification.diamond_type,
            predicted_orientation: classification.orientation,
            confidence: classification.confidence,
            is_correct: false,
            sam_failure: true,
            notes: 'SAM detection error (merged/partial diamond)',
            timestamp: new Date().toISOString()
        });

        state.currentROIIndex++;
        updateVerificationDisplay();
    }
}

function submitCorrection() {
    // Check if we're in job verification mode or regular verification mode
    if (state.currentJob && state.currentROIs) {
        // Job verification mode - call async function
        submitROICorrection();
    } else {
        // Regular verification mode
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

    document.getElementById('dropbox-browser-modal').addEventListener('click', (e) => {
        if (e.target.id === 'dropbox-browser-modal') {
            closeDropboxBrowser();
        }
    });
});
