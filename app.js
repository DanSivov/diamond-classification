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
    previousImageId: null,  // Track previous image to detect when image changes
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

// Admin Configuration
const ADMIN_EMAIL = 'sivovolenkodaniil@gmail.com';

function isAdmin() {
    return state.userEmail && state.userEmail.toLowerCase() === ADMIN_EMAIL.toLowerCase();
}

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

    // Show/hide admin panel button based on admin status
    const adminBtn = document.getElementById('admin-panel-btn');
    if (adminBtn) {
        adminBtn.style.display = isAdmin() ? 'inline-block' : 'none';
    }

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

    // Clear Dropbox credentials (so each user can connect their own Dropbox)
    localStorage.removeItem('dropboxAccessToken');
    dropboxClient = null;
    updateDropboxStatus('Not connected', false);

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

        // Fetch user's jobs from API
        const response = await fetch(`${state.apiUrl}/jobs?user_email=${encodeURIComponent(state.userEmail)}`);

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

        // Fetch user's jobs from API
        const response = await fetch(`${state.apiUrl}/jobs?user_email=${encodeURIComponent(state.userEmail)}`);

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
        const response = await fetch(`${state.apiUrl}/jobs/${jobId}?requester_email=${encodeURIComponent(state.userEmail)}`, {
            method: 'DELETE'
        });

        if (!response.ok) {
            const data = await response.json();
            throw new Error(data.error || 'Failed to delete job');
        }

        const result = await response.json();
        console.log('Job deleted:', jobId, 'R2 files deleted:', result.r2_files_deleted);

        // Refresh the jobs list
        await showManageJobs();

        alert(`Job deleted successfully. ${result.r2_files_deleted || 0} storage files cleaned up.`);

    } catch (error) {
        console.error('Error deleting job:', error);
        alert('Failed to delete job: ' + error.message);
    }
}

// ============================================================================
// Admin Panel Functions
// ============================================================================

async function showAdminPanel() {
    if (!isAdmin()) {
        alert('Unauthorized: Admin access required');
        return;
    }

    showStep('admin-panel');
    await loadAdminUsers();
}

function showAdminTab(tabName) {
    // Update tab buttons
    document.querySelectorAll('.admin-tab').forEach(tab => tab.classList.remove('active'));
    document.getElementById(`tab-${tabName}`).classList.add('active');

    // Update tab content visibility
    document.querySelectorAll('.admin-tab-content').forEach(content => content.style.display = 'none');
    document.getElementById(`admin-${tabName}-tab`).style.display = 'block';

    // Load data for selected tab
    if (tabName === 'users') {
        loadAdminUsers();
    } else if (tabName === 'jobs') {
        loadAdminJobs();
    } else if (tabName === 'activity') {
        loadAdminActivity();
    } else if (tabName === 'storage') {
        loadAdminStorage();
    }
}

async function loadAdminUsers() {
    try {
        const response = await fetch(`${state.apiUrl}/admin/users?requester_email=${encodeURIComponent(state.userEmail)}`);

        if (!response.ok) {
            if (response.status === 403) {
                throw new Error('Unauthorized - admin access required');
            }
            throw new Error('Failed to fetch users');
        }

        const data = await response.json();
        displayAdminUsers(data.users);

        // Populate user filter dropdown
        const filterSelect = document.getElementById('admin-user-filter');
        filterSelect.innerHTML = '<option value="">All users</option>';
        data.users.forEach(user => {
            filterSelect.innerHTML += `<option value="${user.email}">${user.email}</option>`;
        });

    } catch (error) {
        console.error('Error loading admin users:', error);
        document.getElementById('admin-users-list').innerHTML = `
            <div class="browser-empty">
                <p>Error: ${error.message}</p>
            </div>
        `;
    }
}

function displayAdminUsers(users) {
    const container = document.getElementById('admin-users-list');

    if (!users || users.length === 0) {
        container.innerHTML = `
            <div class="browser-empty">
                <p>No users found</p>
            </div>
        `;
        return;
    }

    container.innerHTML = users.map(user => `
        <div class="job-item" onclick="filterAdminJobsByUser('${user.email}')">
            <div class="job-item-header">
                <div class="job-item-title">${user.email}</div>
                <div class="job-item-date">Last active: ${user.last_activity ? new Date(user.last_activity).toLocaleDateString() : 'Never'}</div>
            </div>
            <div class="job-item-stats">
                <div class="job-stat">
                    <div class="job-stat-value">${user.job_count}</div>
                    <div class="job-stat-label">Jobs</div>
                </div>
                <div class="job-stat">
                    <div class="job-stat-value">${user.total_rois || 0}</div>
                    <div class="job-stat-label">Total ROIs</div>
                </div>
                <div class="job-stat">
                    <div class="job-stat-value">${user.verified_rois || 0}</div>
                    <div class="job-stat-label">Verified</div>
                </div>
            </div>
        </div>
    `).join('');
}

function filterAdminJobsByUser(email) {
    document.getElementById('admin-user-filter').value = email;
    showAdminTab('jobs');
}

async function loadAdminJobs(userFilter = null) {
    try {
        let url = `${state.apiUrl}/admin/jobs?requester_email=${encodeURIComponent(state.userEmail)}`;

        if (!userFilter) {
            userFilter = document.getElementById('admin-user-filter').value;
        }

        if (userFilter) {
            url += `&user_email=${encodeURIComponent(userFilter)}`;
        }

        const response = await fetch(url);

        if (!response.ok) {
            throw new Error('Failed to fetch jobs');
        }

        const data = await response.json();
        displayAdminJobs(data.jobs);

    } catch (error) {
        console.error('Error loading admin jobs:', error);
        document.getElementById('admin-jobs-list').innerHTML = `
            <div class="browser-empty">
                <p>Error: ${error.message}</p>
            </div>
        `;
    }
}

function filterAdminJobs() {
    loadAdminJobs();
}

function displayAdminJobs(jobs) {
    const container = document.getElementById('admin-jobs-list');

    if (!jobs || jobs.length === 0) {
        container.innerHTML = `
            <div class="browser-empty">
                <p>No jobs found</p>
            </div>
        `;
        return;
    }

    container.innerHTML = jobs.map(job => {
        const statusColor = job.status === 'complete' ? 'var(--success)' :
                          job.status === 'in_progress' ? 'var(--warning)' :
                          job.status === 'ready' ? 'var(--primary)' :
                          job.status === 'failed' ? 'var(--danger)' : 'var(--text-secondary)';

        const lastGraded = job.last_verification_at
            ? new Date(job.last_verification_at).toLocaleString()
            : 'Never';

        return `
            <div class="job-item">
                <div class="job-item-header">
                    <div class="job-item-title">Job #${job.id.substring(0, 8)}</div>
                    <div class="job-item-date">Created: ${new Date(job.created_at).toLocaleString()}</div>
                </div>
                <div class="job-owner">Owner: ${job.user_email || 'Unknown'}</div>
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
                <div class="job-last-graded">Last verification: ${lastGraded}</div>
                <div style="display: flex; gap: 12px; margin-top: 16px;">
                    <button onclick="adminDeleteJob('${job.id}')" class="btn-wrong" style="flex: 1;">Delete Job</button>
                </div>
            </div>
        `;
    }).join('');
}

async function adminDeleteJob(jobId) {
    if (!confirm('Are you sure you want to delete this job? This will permanently delete all images, ROIs, verifications, AND storage files.')) {
        return;
    }

    try {
        const response = await fetch(`${state.apiUrl}/jobs/${jobId}?requester_email=${encodeURIComponent(state.userEmail)}`, {
            method: 'DELETE'
        });

        if (!response.ok) {
            const data = await response.json();
            throw new Error(data.error || 'Failed to delete job');
        }

        const result = await response.json();
        console.log('Job deleted:', jobId, 'R2 files deleted:', result.r2_files_deleted);

        // Refresh the jobs list
        await loadAdminJobs();

        alert(`Job deleted successfully. ${result.r2_files_deleted || 0} storage files cleaned up.`);

    } catch (error) {
        console.error('Error deleting job:', error);
        alert('Failed to delete job: ' + error.message);
    }
}

async function loadAdminActivity() {
    try {
        const response = await fetch(`${state.apiUrl}/admin/activity?requester_email=${encodeURIComponent(state.userEmail)}&limit=50`);

        if (!response.ok) {
            throw new Error('Failed to fetch activity');
        }

        const data = await response.json();
        displayAdminActivity(data.activity);

    } catch (error) {
        console.error('Error loading admin activity:', error);
        document.getElementById('admin-activity-list').innerHTML = `
            <div class="browser-empty">
                <p>Error: ${error.message}</p>
            </div>
        `;
    }
}

function displayAdminActivity(activity) {
    const container = document.getElementById('admin-activity-list');

    if (!activity || activity.length === 0) {
        container.innerHTML = `
            <div class="browser-empty">
                <p>No recent activity</p>
            </div>
        `;
        return;
    }

    container.innerHTML = activity.map(item => {
        const timestamp = new Date(item.timestamp).toLocaleString();

        if (item.type === 'verification') {
            const statusIcon = item.is_correct ? '(correct)' : '(corrected)';
            return `
                <div class="activity-item">
                    <div class="activity-icon verification-icon">V</div>
                    <div class="activity-details">
                        <div class="activity-title">${item.user_email} verified ROI #${item.roi_index} ${statusIcon}</div>
                        <div class="activity-meta">
                            Job: ${item.job_id.substring(0, 8)} | Image: ${item.image_filename} | ${timestamp}
                        </div>
                    </div>
                </div>
            `;
        } else if (item.type === 'job_created') {
            return `
                <div class="activity-item">
                    <div class="activity-icon job-icon">J</div>
                    <div class="activity-details">
                        <div class="activity-title">${item.user_email || 'Unknown'} created job with ${item.total_images} images</div>
                        <div class="activity-meta">
                            Job: ${item.job_id.substring(0, 8)} | ${timestamp}
                        </div>
                    </div>
                </div>
            `;
        }
        return '';
    }).join('');
}

// ============================================================================
// Admin Storage Management Functions
// ============================================================================

async function loadAdminStorage() {
    try {
        document.getElementById('storage-summary').innerHTML = '<div class="storage-loading">Loading storage information...</div>';
        document.getElementById('admin-storage-list').innerHTML = '';
        document.getElementById('btn-clean-orphaned').disabled = true;

        // Also fetch debug info to help diagnose issues
        const [response, debugResponse] = await Promise.all([
            fetch(`${state.apiUrl}/admin/storage?requester_email=${encodeURIComponent(state.userEmail)}`),
            fetch(`${state.apiUrl}/admin/storage/debug?requester_email=${encodeURIComponent(state.userEmail)}`)
        ]);

        if (!response.ok) {
            throw new Error('Failed to fetch storage info');
        }

        const data = await response.json();
        let debugData = null;
        if (debugResponse.ok) {
            debugData = await debugResponse.json();
        }

        displayStorageSummary(data, debugData);
        displayStorageList(data.jobs);

        // Enable clean orphaned button if there are orphaned files
        document.getElementById('btn-clean-orphaned').disabled = data.orphaned_files === 0;

    } catch (error) {
        console.error('Error loading admin storage:', error);
        document.getElementById('storage-summary').innerHTML = `
            <div class="storage-error">
                <p>Error: ${error.message}</p>
            </div>
        `;
    }
}

function displayStorageSummary(data, debugData = null) {
    const container = document.getElementById('storage-summary');

    let debugHtml = '';
    if (debugData) {
        // Check if R2 is not configured
        if (debugData.r2_not_configured) {
            const envVars = debugData.env_vars_set || {};
            const allR2Vars = debugData.all_r2_env_vars || {};
            debugHtml = `
                <div class="storage-debug" style="margin-top: 16px; padding: 12px; background: #7f1d1d; border-radius: 8px; font-size: 12px;">
                    <h4 style="margin: 0 0 8px 0; color: #fca5a5;">R2 Not Configured</h4>
                    <p style="margin: 4px 0; color: #fca5a5;">${debugData.message || 'Missing R2 configuration'}</p>
                    <p style="margin: 8px 0 4px 0; color: #f87171;">Expected Variables (raw values):</p>
                    <ul style="margin: 4px 0; padding-left: 20px; color: #fca5a5; font-family: monospace;">
                        ${Object.entries(envVars).map(([k, v]) => `<li>${k}: ${v}</li>`).join('')}
                    </ul>
                    ${Object.keys(allR2Vars).length > 0 ? `
                        <p style="margin: 8px 0 4px 0; color: #f87171;">All R2* env vars found:</p>
                        <ul style="margin: 4px 0; padding-left: 20px; color: #fca5a5; font-family: monospace;">
                            ${Object.entries(allR2Vars).map(([k, v]) => `<li>${k}: ${v}</li>`).join('')}
                        </ul>
                    ` : '<p style="margin: 4px 0; color: #fca5a5;">No R2* environment variables found at all!</p>'}
                    ${debugData.all_env_var_names ? `
                        <details style="margin-top: 8px;">
                            <summary style="cursor: pointer; color: #f87171;">All ${debugData.all_env_var_names.length} env var names</summary>
                            <pre style="margin: 8px 0; padding: 8px; background: #450a0a; border-radius: 4px; color: #fca5a5; font-size: 10px; max-height: 200px; overflow-y: auto;">${debugData.all_env_var_names.join('\\n')}</pre>
                        </details>
                    ` : ''}
                </div>
            `;
        } else {
            const emptyPrefix = debugData.empty_prefix || {};
            debugHtml = `
                <div class="storage-debug" style="margin-top: 16px; padding: 12px; background: #1f2937; border-radius: 8px; font-size: 12px;">
                    <h4 style="margin: 0 0 8px 0; color: #60a5fa;">R2 Debug Info</h4>
                    <p style="margin: 4px 0; color: #9ca3af;">Bucket: ${debugData.bucket_name || 'N/A'}</p>
                    <p style="margin: 4px 0; color: #9ca3af;">Files found (empty prefix): ${emptyPrefix.key_count || 0}</p>
                    <p style="margin: 4px 0; color: #9ca3af;">Has Contents: ${emptyPrefix.has_contents ? 'Yes' : 'No'}</p>
                    ${emptyPrefix.error ? `<p style="margin: 4px 0; color: #ef4444;">Error: ${emptyPrefix.error}</p>` : ''}
                    ${emptyPrefix.contents && emptyPrefix.contents.length > 0 ? `
                        <details style="margin-top: 8px;">
                            <summary style="cursor: pointer; color: #60a5fa;">First ${emptyPrefix.contents.length} files</summary>
                            <ul style="margin: 8px 0; padding-left: 20px; color: #9ca3af; max-height: 150px; overflow-y: auto;">
                                ${emptyPrefix.contents.map(f => `<li style="word-break: break-all;">${f}</li>`).join('')}
                            </ul>
                        </details>
                    ` : ''}
                    ${debugData.prefixes_tried && debugData.prefixes_tried.length > 0 ? `
                        <details style="margin-top: 8px;">
                            <summary style="cursor: pointer; color: #60a5fa;">Prefix test results</summary>
                            <ul style="margin: 8px 0; padding-left: 20px; color: #9ca3af;">
                                ${debugData.prefixes_tried.map(p => `<li>"${p.prefix}": ${p.key_count || 0} files ${p.error ? `(Error: ${p.error})` : ''}</li>`).join('')}
                            </ul>
                        </details>
                    ` : ''}
                </div>
            `;
        }
    }

    container.innerHTML = `
        <div class="storage-stats">
            <div class="storage-stat">
                <div class="storage-stat-value">${data.total_files}</div>
                <div class="storage-stat-label">Total Files</div>
            </div>
            <div class="storage-stat">
                <div class="storage-stat-value">${data.total_jobs_in_storage}</div>
                <div class="storage-stat-label">Jobs in Storage</div>
            </div>
            <div class="storage-stat ${data.orphaned_files > 0 ? 'warning' : ''}">
                <div class="storage-stat-value">${data.orphaned_files}</div>
                <div class="storage-stat-label">Orphaned Files</div>
            </div>
            <div class="storage-stat ${data.orphaned_jobs > 0 ? 'warning' : ''}">
                <div class="storage-stat-value">${data.orphaned_jobs}</div>
                <div class="storage-stat-label">Orphaned Jobs</div>
            </div>
        </div>
        ${debugHtml}
    `;
}

function displayStorageList(jobs) {
    const container = document.getElementById('admin-storage-list');

    if (!jobs || jobs.length === 0) {
        container.innerHTML = `
            <div class="browser-empty">
                <p>No files in storage</p>
            </div>
        `;
        return;
    }

    container.innerHTML = jobs.map(job => {
        const statusClass = job.is_orphaned ? 'orphaned' : 'active';
        const statusLabel = job.is_orphaned ? 'ORPHANED' : 'Active';

        return `
            <div class="storage-item ${statusClass}">
                <div class="storage-item-header">
                    <div class="storage-item-title">
                        Job #${job.job_id.substring(0, 8)}
                        <span class="storage-status-badge ${statusClass}">${statusLabel}</span>
                    </div>
                    <div class="storage-item-count">${job.file_count} files</div>
                </div>
                <div class="storage-item-actions">
                    <button onclick="deleteJobStorage('${job.job_id}')" class="btn-small btn-danger">
                        Delete Files
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

async function deleteJobStorage(jobId) {
    if (!confirm(`Delete all storage files for job ${jobId.substring(0, 8)}?`)) {
        return;
    }

    try {
        const response = await fetch(`${state.apiUrl}/admin/storage/job/${jobId}?requester_email=${encodeURIComponent(state.userEmail)}`, {
            method: 'DELETE'
        });

        if (!response.ok) {
            const data = await response.json();
            throw new Error(data.error || 'Failed to delete job storage');
        }

        const result = await response.json();
        alert(`Deleted ${result.deleted_count} files for job ${jobId.substring(0, 8)}`);

        // Refresh storage list
        await loadAdminStorage();

    } catch (error) {
        console.error('Error deleting job storage:', error);
        alert('Failed to delete job storage: ' + error.message);
    }
}

async function cleanOrphanedStorage() {
    if (!confirm('Delete all orphaned files? These are files for jobs that no longer exist in the database.')) {
        return;
    }

    try {
        document.getElementById('btn-clean-orphaned').disabled = true;
        document.getElementById('btn-clean-orphaned').textContent = 'Cleaning...';

        const response = await fetch(`${state.apiUrl}/admin/storage/orphaned?requester_email=${encodeURIComponent(state.userEmail)}`, {
            method: 'DELETE'
        });

        if (!response.ok) {
            const data = await response.json();
            throw new Error(data.error || 'Failed to clean orphaned storage');
        }

        const result = await response.json();
        alert(`Cleaned up ${result.deleted_count} orphaned files!`);

        // Refresh storage list
        await loadAdminStorage();

    } catch (error) {
        console.error('Error cleaning orphaned storage:', error);
        alert('Failed to clean orphaned storage: ' + error.message);
    } finally {
        document.getElementById('btn-clean-orphaned').textContent = 'Clean Orphaned Files';
    }
}

async function clearAllStorage() {
    // Ask if they also want to clear the database
    const clearDb = confirm('Also clear ALL jobs from the database?\n\nClick OK to delete storage + database\nClick Cancel to delete storage only');

    const confirmText = clearDb ? 'DELETE ALL AND DATABASE' : 'DELETE ALL';
    const confirmation = prompt(`This will DELETE ALL storage files${clearDb ? ' AND all database records' : ''}!\n\nType "${confirmText}" to confirm:`);

    if (confirmation !== confirmText) {
        alert(`Cancelled. You must type "${confirmText}" exactly to confirm.`);
        return;
    }

    try {
        document.getElementById('btn-clear-all').disabled = true;
        document.getElementById('btn-clear-all').textContent = 'Clearing...';

        const url = `${state.apiUrl}/admin/storage/all?requester_email=${encodeURIComponent(state.userEmail)}&confirm=DELETE_ALL&clear_database=${clearDb}`;
        const response = await fetch(url, {
            method: 'DELETE'
        });

        if (!response.ok) {
            const data = await response.json();
            throw new Error(data.error || 'Failed to clear all storage');
        }

        const result = await response.json();
        let message = `Cleared ALL storage! Deleted ${result.deleted_count} files.`;
        if (result.database_cleared) {
            message += `\n\nDatabase cleared:\n- ${result.db_deleted.jobs} jobs\n- ${result.db_deleted.images} images\n- ${result.db_deleted.rois} ROIs\n- ${result.db_deleted.verifications} verifications`;
        }
        alert(message);

        // Refresh storage list and jobs list
        await loadAdminStorage();
        if (typeof loadAdminJobs === 'function') {
            await loadAdminJobs();
        }

    } catch (error) {
        console.error('Error clearing all storage:', error);
        alert('Failed to clear all storage: ' + error.message);
    } finally {
        document.getElementById('btn-clear-all').disabled = false;
        document.getElementById('btn-clear-all').textContent = 'Clear ALL Storage';
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

// Map to track Dropbox source paths for each image filename
// Used to save graded images back to the correct folder
const dropboxSourcePaths = new Map();

/**
 * Parse filename to create graded version
 * Removes existing prefix (marked_, original_, processed_) and adds graded_
 * @param {string} filename - Original filename (e.g., "marked_image123.png")
 * @returns {string} - Parsed filename with graded_ prefix (e.g., "graded_image123.png")
 */
function parseFilenameForGraded(filename) {
    // Remove extension first
    const lastDot = filename.lastIndexOf('.');
    const ext = lastDot > 0 ? filename.substring(lastDot) : '.png';
    const baseName = lastDot > 0 ? filename.substring(0, lastDot) : filename;

    // Known prefixes to remove
    const prefixesToRemove = ['marked_', 'original_', 'processed_'];

    let cleanedName = baseName;
    for (const prefix of prefixesToRemove) {
        if (cleanedName.toLowerCase().startsWith(prefix.toLowerCase())) {
            cleanedName = cleanedName.substring(prefix.length);
            break; // Only remove one prefix
        }
    }

    // Add graded_ prefix and extension
    return `graded_${cleanedName}${ext}`;
}

/**
 * Calculate graded folder path from source path
 * Replaces /original/, /marked/, or /processed/ with /graded/
 * @param {string} sourcePath - Original Dropbox path (e.g., "/sorting-robot/marquise/original/marked_image123.png")
 * @returns {string} - Graded folder path (e.g., "/sorting-robot/marquise/graded")
 */
function calculateGradedFolderPath(sourcePath) {
    // Get directory path (remove filename)
    const lastSlash = sourcePath.lastIndexOf('/');
    const dirPath = lastSlash > 0 ? sourcePath.substring(0, lastSlash) : sourcePath;

    // Replace source subfolder with graded
    const subFolders = ['original', 'marked', 'processed'];

    for (const subFolder of subFolders) {
        // Check if path ends with the subfolder
        if (dirPath.toLowerCase().endsWith(`/${subFolder}`)) {
            return dirPath.substring(0, dirPath.length - subFolder.length) + 'graded';
        }
    }

    // If no known subfolder found, just append /graded to the directory
    return `${dirPath}/graded`;
}

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

    // Update master checkbox state based on file selection
    const masterCheckbox = document.getElementById('master-checkbox');
    if (masterCheckbox) {
        const allCheckboxes = document.querySelectorAll('.file-checkbox');
        const totalFiles = allCheckboxes.length;
        const selectedFiles = count;

        if (selectedFiles === 0) {
            masterCheckbox.checked = false;
            masterCheckbox.indeterminate = false;
        } else if (selectedFiles === totalFiles) {
            masterCheckbox.checked = true;
            masterCheckbox.indeterminate = false;
        } else {
            masterCheckbox.checked = false;
            masterCheckbox.indeterminate = true;
        }
    }
}

function toggleAllDropboxFiles() {
    const masterCheckbox = document.getElementById('master-checkbox');
    const checkboxes = document.querySelectorAll('.file-checkbox');
    const shouldCheck = masterCheckbox.checked;

    checkboxes.forEach(checkbox => {
        checkbox.checked = shouldCheck;
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

            // Store source path for this file (used when saving graded image back)
            // file.path looks like: /sorting-robot/marquise/original/original_image123.png
            dropboxSourcePaths.set(file.name, file.path);
            console.log(`Stored source path for ${file.name}: ${file.path}`);

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
            body: JSON.stringify({
                files: filesData,
                user_email: state.userEmail  // Include user email for job isolation
            })
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

        if (job.status === 'ready' || job.status === 'complete' || job.status === 'in_progress') {
            // Job finished processing and ready for verification
            showProcessingStatus('Complete!', 100);
            console.log('Job ready for verification');

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
        let startIndex = -1;
        for (let i = 0; i < allROIs.length; i++) {
            const roi = allROIs[i];
            console.log(`ROI ${i}: id=${roi.id}, verifications=`, roi.verifications);
            const hasVerification = roi.verifications && roi.verifications.length > 0 &&
                                  roi.verifications.some(v => v.user_email === state.userEmail);
            if (!hasVerification) {
                startIndex = i;
                console.log(`Found first unverified ROI at index ${i}`);
                break;
            }
        }

        // If all ROIs verified, show completion message
        if (startIndex === -1) {
            alert(`All ${allROIs.length} ROIs have been verified by you!`);
            showStep('dashboard');
            return;
        }

        console.log(`Resuming from ROI ${startIndex + 1} / ${allROIs.length}`);

        // Store all ROIs and image map, start from the first unverified one
        state.currentROIs = allROIs;
        state.currentROIImageMap = imageMap;  // Store image map for later use
        state.currentROIIndex = startIndex;
        state.currentImage = imageMap[allROIs[startIndex].id];
        state.previousImageId = state.currentImage ? state.currentImage.id : null;  // Initialize tracking

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
    // DON'T reset currentROIIndex here - it's already set by the calling function
    // to resume from the correct position
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
        // All ROIs verified - save last image and complete
        if (state.previousImageId) {
            await regenerateAndSaveToDropbox(state.previousImageId);
        }
        alert(`Verification complete! ${rois.length} ROIs verified.`);
        showStep('dashboard');
        return;
    }

    const roi = rois[index];

    // Update current image for this ROI
    if (state.currentROIImageMap) {
        const newImage = state.currentROIImageMap[roi.id];

        // Check if we've moved to a new image (previous image is now fully verified)
        if (state.previousImageId && newImage && newImage.id !== state.previousImageId) {
            console.log(`Image ${state.previousImageId} fully verified, regenerating and saving...`);
            // Don't await - let it run in background while user continues
            regenerateAndSaveToDropbox(state.previousImageId);
        }

        // Update tracking
        state.previousImageId = newImage ? newImage.id : null;
        state.currentImage = newImage;
    }

    // Update progress - use actual ROI index and total count
    const totalROIs = rois.length;
    const progress = ((index / totalROIs) * 100);
    document.getElementById('progress-fill').style.width = `${progress}%`;
    document.getElementById('progress-text').textContent = `${index + 1} / ${totalROIs}`;

    // Update ROI info
    const imageName = state.currentImage ? state.currentImage.filename : 'Unknown';
    document.getElementById('roi-title').textContent = `${imageName} - ROI ${roi.roi_index}`;
    document.getElementById('roi-orientation').textContent = roi.predicted_orientation.toUpperCase();
    document.getElementById('roi-confidence').textContent = `${(roi.confidence * 100).toFixed(1)}%`;

    // Update orientation color (green=table, red=tilted)
    const orientationSpan = document.getElementById('roi-orientation');
    orientationSpan.style.color = roi.predicted_orientation === 'table' ?
        '#00C853' : '#FF3B30';

    // Update ROI canvas border color based on orientation
    const roiCanvas = document.getElementById('roi-canvas');
    roiCanvas.className = ''; // Clear existing classes
    roiCanvas.classList.add(`orientation-${roi.predicted_orientation}`);

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
    } else if (e.key === 'f' || e.key === 'F') {
        verifySAMFailure();  // Same function as button - handles both modes
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

// Verify ROI as wrong - auto-flip orientation without modal
async function verifyROIWrong() {
    const roi = state.currentROIs[state.currentROIIndex];

    // Flip the orientation: table → tilted, tilted → table
    const correctedOrientation = roi.predicted_orientation === 'table' ? 'tilted' : 'table';

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

        state.verificationData.push({ roi_id: roi.id, is_correct: false });
        state.currentROIIndex++;
        updateROIVerificationDisplay();

    } catch (error) {
        console.error('Failed to submit correction:', error);
        alert('Failed to submit correction');
    }
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
    document.getElementById('roi-orientation').textContent = classification.orientation.toUpperCase();
    document.getElementById('roi-confidence').textContent = `${(classification.confidence * 100).toFixed(1)}%`;

    // Update orientation color
    const orientationSpan = document.getElementById('roi-orientation');
    orientationSpan.style.color = classification.orientation === 'table' ?
        'var(--success)' : 'var(--warning)';

    // Update ROI canvas border color based on orientation
    const roiCanvas = document.getElementById('roi-canvas');
    roiCanvas.className = ''; // Clear existing classes
    roiCanvas.classList.add(`orientation-${classification.orientation}`);

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

async function verifyWrong() {
    // Check if we're in job verification mode or regular verification mode
    if (state.currentJob && state.currentROIs) {
        // Job verification mode - automatically flip orientation and submit
        const roi = state.currentROIs[state.currentROIIndex];

        // Flip the orientation: table → tilted, tilted → table
        const correctedOrientation = roi.predicted_orientation === 'table' ? 'tilted' : 'table';

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

            state.currentROIIndex++;
            updateROIVerificationDisplay();

        } catch (error) {
            console.error('Failed to submit correction:', error);
            alert('Failed to submit correction');
        }
    } else {
        // Regular verification mode - automatically flip orientation
        const classification = state.classificationData.classifications[state.currentROIIndex];

        // Flip the orientation: table → tilted, tilted → table
        const correctedOrientation = classification.orientation === 'table' ? 'tilted' : 'table';

        state.verificationData.push({
            roi_id: classification.roi_id,
            predicted_type: classification.diamond_type,
            predicted_orientation: classification.orientation,
            confidence: classification.confidence,
            is_correct: false,
            verified_type: classification.diamond_type,  // Keep same type
            verified_orientation: correctedOrientation,  // Flip orientation
            timestamp: new Date().toISOString()
        });

        state.currentROIIndex++;
        updateVerificationDisplay();
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

/**
 * Check if a file exists in Dropbox
 * @param {string} path - Full Dropbox path to check
 * @returns {boolean} - True if file exists
 */
async function checkDropboxFileExists(path) {
    try {
        await dropboxClient.filesGetMetadata({ path });
        return true;
    } catch (error) {
        if (error.status === 409) {
            // File not found - this is expected
            return false;
        }
        console.error('Error checking file existence:', error);
        return false;
    }
}

/**
 * Generate unique filename with duplicate suffix if needed
 * @param {string} folderPath - Dropbox folder path
 * @param {string} filename - Desired filename
 * @returns {string} - Unique filename with _duplicate1, _duplicate2, etc. if needed
 */
async function generateUniqueFilename(folderPath, filename) {
    const fullPath = `${folderPath}/${filename}`;
    const exists = await checkDropboxFileExists(fullPath);

    if (!exists) {
        return filename;
    }

    // File exists, need to add duplicate suffix
    const lastDot = filename.lastIndexOf('.');
    const ext = lastDot > 0 ? filename.substring(lastDot) : '.png';
    const baseName = lastDot > 0 ? filename.substring(0, lastDot) : filename;

    let duplicateNum = 1;
    let newFilename;
    do {
        newFilename = `${baseName}_duplicate${duplicateNum}${ext}`;
        const newPath = `${folderPath}/${newFilename}`;
        const newExists = await checkDropboxFileExists(newPath);
        if (!newExists) {
            break;
        }
        duplicateNum++;
    } while (duplicateNum < 100); // Safety limit

    return newFilename;
}

/**
 * Show duplicate confirmation modal and wait for user response
 * @param {string} filename - The filename that already exists
 * @param {string} folderPath - The folder path
 * @returns {Promise<string>} - 'overwrite', 'rename', or 'cancel'
 */
function showDuplicateConfirmModal(filename, folderPath) {
    return new Promise((resolve) => {
        const modal = document.createElement('div');
        modal.className = 'modal active';
        modal.id = 'duplicate-confirm-modal';
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 500px;">
                <h3>File Already Exists</h3>
                <p>A file named <strong>${filename}</strong> already exists in:</p>
                <p style="word-break: break-all; color: #666; font-size: 0.9em;">${folderPath}</p>
                <p>What would you like to do?</p>
                <div style="display: flex; gap: 10px; justify-content: center; margin-top: 20px;">
                    <button class="btn btn-primary" id="duplicate-overwrite">Overwrite</button>
                    <button class="btn btn-secondary" id="duplicate-rename">Save as Copy</button>
                    <button class="btn" id="duplicate-cancel">Cancel</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        document.getElementById('duplicate-overwrite').onclick = () => {
            document.body.removeChild(modal);
            resolve('overwrite');
        };
        document.getElementById('duplicate-rename').onclick = () => {
            document.body.removeChild(modal);
            resolve('rename');
        };
        document.getElementById('duplicate-cancel').onclick = () => {
            document.body.removeChild(modal);
            resolve('cancel');
        };
    });
}

/**
 * Ensure graded folder exists in Dropbox
 * @param {string} folderPath - Full path to the graded folder
 */
async function ensureGradedFolderExists(folderPath) {
    try {
        await dropboxClient.filesGetMetadata({ path: folderPath });
        console.log(`Graded folder already exists: ${folderPath}`);
    } catch (error) {
        if (error.status === 409) {
            // Folder doesn't exist, create it
            console.log(`Creating graded folder: ${folderPath}`);
            try {
                await dropboxClient.filesCreateFolderV2({ path: folderPath });
                console.log(`Created graded folder: ${folderPath}`);
            } catch (createError) {
                // Might fail if parent doesn't exist or already created by another request
                console.warn('Could not create folder, it may already exist:', createError);
            }
        } else {
            console.error('Error checking graded folder:', error);
        }
    }
}

/**
 * Regenerate graded image with human corrections and save to Dropbox
 * Called when an image is fully verified (all ROIs have been reviewed)
 */
async function regenerateAndSaveToDropbox(imageId) {
    try {
        console.log(`Regenerating graded image for image ${imageId}...`);

        // Find the image info
        const imageInfo = state.currentJobImages?.find(img => img.id === imageId);
        if (!imageInfo) {
            console.error(`Image ${imageId} not found in job images`);
            return;
        }

        // Call API to regenerate graded image with human corrections
        const response = await fetch(`${state.apiUrl}/images/${imageId}/regenerate-graded`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });

        if (!response.ok) {
            const error = await response.json();
            console.error('Failed to regenerate graded image:', error);
            return;
        }

        const result = await response.json();
        console.log(`Regenerated image with ${result.roi_count} ROIs`);

        // Check if Dropbox is connected
        if (!dropboxClient) {
            console.log('Dropbox not connected, skipping upload');
            return;
        }

        // Convert base64 to blob
        const base64Data = result.corrected_graded_base64;
        const binaryString = atob(base64Data);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        const blob = new Blob([bytes], { type: 'image/png' });

        // Get the source path for this image
        const sourcePath = dropboxSourcePaths.get(imageInfo.filename);
        console.log(`Source path for ${imageInfo.filename}: ${sourcePath}`);

        let gradedFolderPath;
        let gradedFilename;

        if (sourcePath) {
            // Calculate graded folder path from source path
            gradedFolderPath = calculateGradedFolderPath(sourcePath);
            gradedFilename = parseFilenameForGraded(imageInfo.filename);
        } else {
            // Fallback: save to default graded folder with timestamp
            console.warn('No source path found, using fallback location');
            gradedFolderPath = `${DROPBOX_CONFIG.folderPath}/graded`;
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
            const originalName = imageInfo.filename.replace(/\.[^/.]+$/, '');
            gradedFilename = `graded_${originalName}_${timestamp}.png`;
        }

        console.log(`Target folder: ${gradedFolderPath}`);
        console.log(`Target filename: ${gradedFilename}`);

        // Ensure graded folder exists
        await ensureGradedFolderExists(gradedFolderPath);

        // Check if file already exists
        const fullPath = `${gradedFolderPath}/${gradedFilename}`;
        const exists = await checkDropboxFileExists(fullPath);

        let finalFilename = gradedFilename;
        let uploadMode = 'add';

        if (exists) {
            // Ask user what to do
            const userChoice = await showDuplicateConfirmModal(gradedFilename, gradedFolderPath);

            if (userChoice === 'cancel') {
                console.log('User cancelled upload');
                return;
            } else if (userChoice === 'overwrite') {
                uploadMode = 'overwrite';
                console.log('User chose to overwrite');
            } else if (userChoice === 'rename') {
                finalFilename = await generateUniqueFilename(gradedFolderPath, gradedFilename);
                console.log(`User chose to save as: ${finalFilename}`);
            }
        }

        // Upload to Dropbox
        const dropboxPath = `${gradedFolderPath}/${finalFilename}`;
        console.log(`Uploading to Dropbox: ${dropboxPath} (mode: ${uploadMode})`);

        await dropboxClient.filesUpload({
            path: dropboxPath,
            contents: blob,
            mode: uploadMode === 'overwrite' ? { '.tag': 'overwrite' } : 'add',
            autorename: false
        });

        console.log(`Successfully saved corrected graded image to Dropbox: ${finalFilename}`);

        // Show success notification
        showNotification(`Saved to Dropbox: ${finalFilename}`, 'success');

    } catch (error) {
        console.error('Error in regenerateAndSaveToDropbox:', error);
        showNotification('Failed to save to Dropbox', 'error');
    }
}

/**
 * Show a notification message
 */
function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 15px 25px;
        border-radius: 8px;
        background: ${type === 'success' ? '#4CAF50' : type === 'error' ? '#f44336' : '#2196F3'};
        color: white;
        font-weight: 500;
        z-index: 10000;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        animation: slideIn 0.3s ease;
    `;
    notification.textContent = message;
    document.body.appendChild(notification);

    // Remove after 3 seconds
    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => document.body.removeChild(notification), 300);
    }, 3000);
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
