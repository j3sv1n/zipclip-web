/* ===== ZipClip Web UI — app.js ===== */

// Dynamically determine API Base URL based on environment
const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' || window.location.protocol === 'file:';

// If running locally, connect to local backend (8000). Otherwise, connect to Hugging Face Space.
// In production, Vercel will securely replace this placeholder with your environment variable
const PROD_API_URL = 'VERCEL_API_URL_PLACEHOLDER';
const API_BASE = isLocal ? 'http://localhost:8000' : PROD_API_URL;

// Generate or retrieve a persistent Client ID to isolate jobs
function getClientId() {
    let clientId = localStorage.getItem('zipclip_client_id');
    if (!clientId) {
        clientId = 'client_' + Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
        localStorage.setItem('zipclip_client_id', clientId);
    }
    return clientId;
}
const CLIENT_ID = getClientId();

// ── State ──────────────────────────────────────────────────────────────────
let currentJobId = null;
let pollInterval = null;
let activeTab = 'file';

// ── Tab switching ──────────────────────────────────────────────────────────
function switchTab(tab) {
    activeTab = tab;
    document.getElementById('tab-file').classList.toggle('active', tab === 'file');
    document.getElementById('tab-url').classList.toggle('active', tab === 'url');
    document.getElementById('panel-file').classList.toggle('active', tab === 'file');
    document.getElementById('panel-url').classList.toggle('active', tab === 'url');
    document.getElementById('tab-file').setAttribute('aria-selected', tab === 'file');
    document.getElementById('tab-url').setAttribute('aria-selected', tab === 'url');
}

// ── Advanced section ───────────────────────────────────────────────────────
function toggleAdvanced() {
    const btn = document.getElementById('advanced-toggle-btn');
    const sec = document.getElementById('advanced-section');
    btn.classList.toggle('open');
    sec.classList.toggle('open');
}

// ── File drag-and-drop ─────────────────────────────────────────────────────
const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
const fileNameDisplay = document.getElementById('file-name-display');

dropZone.addEventListener('dragover', e => {
    e.preventDefault();
    dropZone.classList.add('drag-over');
});
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
dropZone.addEventListener('drop', e => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
    const files = Array.from(e.dataTransfer.files);
    if (files.length) setSelectedFiles(files);
});
fileInput.addEventListener('change', () => {
    const files = Array.from(fileInput.files);
    if (files.length) setSelectedFiles(files);
});

function setSelectedFiles(files) {
    if (files.length > 10) {
        toast('Maximum 10 files allowed.', 'error');
        files = files.slice(0, 10);
    }
    fileInput._selectedFiles = files;
    renderFileList(files);
}

function renderFileList(files) {
    const list = document.getElementById('file-list');
    if (!files.length) {
        list.innerHTML = '';
        return;
    }
    list.innerHTML = files.map(f => `
        <div class="file-item">
            <span>${f.type.startsWith('image/') ? '🖼️' : '🎬'}</span>
            ${f.name}
        </div>
    `).join('');
}

// ── Collect options ────────────────────────────────────────────────────────
function getOptions() {
    const promptEl = document.getElementById('user-prompt');
    const userPrompt = promptEl ? promptEl.value.trim() : '';
    return {
        mode: document.getElementById('mode-select').value,
        target_duration: parseInt(document.getElementById('duration-input').value, 10),
        add_subtitles: document.getElementById('toggle-subtitles').checked,
        auto_approve: document.getElementById('toggle-auto-approve')?.checked ?? true,
        user_prompt: userPrompt || null,
        subtitle_config: {
            font: document.getElementById('sub-font')?.value ?? "Montserrat-ExtraBold",
            fontsize: parseInt(document.getElementById('sub-fontsize')?.value ?? "80", 10),
            color: document.getElementById('sub-color')?.value ?? "#2699ff",
            stroke_color: document.getElementById('sub-stroke-color')?.value ?? "#000000",
            stroke_width: parseInt(document.getElementById('sub-stroke-width')?.value ?? "2", 10),
        },
        llm_config: {
            model: document.getElementById('llm-model')?.value ?? "gpt-4o-mini",
            temperature: 1.0,
        },
    };
}

// ── Submit job ─────────────────────────────────────────────────────────────
async function submitJob() {
    const btn = document.getElementById('submit-btn');
    const opts = getOptions();

    try {
        setSubmitLoading(true);

        let jobData;

        if (activeTab === 'file') {
            const files = fileInput._selectedFiles || Array.from(fileInput.files);
            if (!files.length) { toast('Please select media files first.', 'error'); return; }
            jobData = await uploadFiles(files, opts);
        } else {
            const url = document.getElementById('video-url').value.trim();
            if (!url) { toast('Please enter a video URL.', 'error'); return; }
            jobData = await submitUrl(url, opts);
        }

        currentJobId = jobData.job_id;
        showProgress(jobData);
        startPolling(jobData.job_id);
        loadJobs();

    } catch (err) {
        toast(`Error: ${err.message}`, 'error');
    } finally {
        setSubmitLoading(false);
    }
}

function setSubmitLoading(loading) {
    const btn = document.getElementById('submit-btn');
    const icon = document.getElementById('submit-icon');
    const label = document.getElementById('submit-label');
    btn.disabled = loading;
    icon.textContent = loading ? '⏳' : '⚡';
    label.textContent = loading ? 'Submitting…' : 'Generate Short';
}

// ── API: Upload files ──────────────────────────────────────────────────────
async function uploadFiles(files, opts) {
    const params = new URLSearchParams({
        mode: opts.mode,
        add_subtitles: opts.add_subtitles,
        target_duration: opts.target_duration,
        auto_approve: opts.auto_approve
    });

    const form = new FormData();
    form.append('request', JSON.stringify({
        mode: opts.mode,
        add_subtitles: opts.add_subtitles,
        target_duration: opts.target_duration,
        auto_approve: opts.auto_approve,
        user_prompt: opts.user_prompt,
        subtitle_config: opts.subtitle_config,
        llm_config: opts.llm_config,
        return_transcript: false,
        return_segments_preview: false,
    }));

    files.forEach(file => {
        form.append('files', file);
    });

    const res = await fetch(`${API_BASE}/api/process?${params.toString()}`, {
        method: 'POST',
        headers: { 'X-Client-ID': CLIENT_ID },
        body: form,
    });

    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || `HTTP ${res.status}`);
    }
    return res.json();
}

// ── API: Submit URL ────────────────────────────────────────────────────────
async function submitUrl(url, opts) {
    const params = new URLSearchParams({
        mode: opts.mode,
        add_subtitles: opts.add_subtitles,
        target_duration: opts.target_duration,
        auto_approve: opts.auto_approve
    });

    const form = new FormData();
    form.append('request', JSON.stringify({
        video_url: url,
        mode: opts.mode,
        add_subtitles: opts.add_subtitles,
        target_duration: opts.target_duration,
        auto_approve: opts.auto_approve,
        user_prompt: opts.user_prompt,
        subtitle_config: opts.subtitle_config,
        llm_config: opts.llm_config,
    }));

    const res = await fetch(`${API_BASE}/api/process?${params.toString()}`, {
        method: 'POST',
        headers: { 'X-Client-ID': CLIENT_ID },
        body: form,
    });

    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || `HTTP ${res.status}`);
    }
    return res.json();
}

// ── API: Health Check ──────────────────────────────────────────────────────
async function checkHealth() {
    const indicator = document.getElementById('api-health-indicator');
    const label = document.getElementById('api-health-label');

    try {
        const res = await fetch(`${API_BASE}/health`);
        if (res.ok) {
            indicator.className = 'health-dot online';
            label.textContent = 'API Online';
        } else {
            throw new Error();
        }
    } catch (_) {
        indicator.className = 'health-dot offline';
        label.textContent = 'API Offline';
    }
}

// ── Polling ────────────────────────────────────────────────────────────────
function startPolling(jobId) {
    stopPolling();
    pollInterval = setInterval(() => pollStatus(jobId), 2000);
}

function stopPolling() {
    if (pollInterval) { clearInterval(pollInterval); pollInterval = null; }
}

async function pollStatus(jobId) {
    try {
        const res = await fetch(`${API_BASE}/api/status/${jobId}`, {
            headers: { 'X-Client-ID': CLIENT_ID }
        });
        if (!res.ok) return;
        const job = await res.json();
        updateProgress(job);

        if (job.status === 'completed' || job.status === 'failed') {
            stopPolling();
            showResult(job);
            loadJobs();
        }
    } catch (_) { /* network hiccup, keep polling */ }
}

// ── UI: Progress ───────────────────────────────────────────────────────────
function showProgress(job) {
    document.getElementById('input-card').style.display = 'none';
    document.getElementById('progress-card').style.display = 'block';
    document.getElementById('result-card').style.display = 'none';
    document.getElementById('progress-job-id').textContent = `#${job.job_id}`;
    // Make sure no stale preview keeps streaming while we wait
    clearPreview();
    updateProgress(job);
}

function clearPreview() {
    const previewWrap = document.getElementById('result-preview');
    const video = document.getElementById('result-video');
    if (video) {
        try { video.pause(); } catch (_) { /* ignore */ }
        video.removeAttribute('src');
        video.load();
    }
    if (previewWrap) previewWrap.style.display = 'none';
    const refineSection = document.getElementById('refine-section');
    if (refineSection) refineSection.style.display = 'none';
    const refinePrompt = document.getElementById('refine-prompt');
    if (refinePrompt) refinePrompt.value = '';
}

function updateProgress(job) {
    const pct = job.progress || 0;
    document.getElementById('progress-bar').style.width = `${pct}%`;
    document.getElementById('progress-pct').textContent = `${pct}%`;
    document.getElementById('progress-message').textContent = job.message || 'Processing…';

    const titles = {
        pending: 'Job queued…',
        processing: 'Processing video…',
        completed: 'Done!',
        failed: 'Processing failed',
    };
    document.getElementById('progress-title').textContent = titles[job.status] || 'Processing…';
}

// ── UI: Result ─────────────────────────────────────────────────────────────
function showResult(job) {
    document.getElementById('progress-card').style.display = 'none';
    document.getElementById('result-card').style.display = 'block';

    const dot = document.getElementById('result-dot');
    const title = document.getElementById('result-title');
    const meta = document.getElementById('result-meta');
    const body = document.getElementById('result-body');
    const previewWrap = document.getElementById('result-preview');
    const video = document.getElementById('result-video');
    const refineSection = document.getElementById('refine-section');

    if (job.status === 'completed') {
        dot.className = 'status-dot success';
        title.textContent = job.video_title ? `✓ ${job.video_title}` : '✓ Processing Complete';

        // Meta chips
        const chips = [
            job.processing_mode && `Mode: <span>${job.processing_mode.replace('_', ' ')}</span>`,
            job.target_duration_used && `Duration: <span>${job.target_duration_used}s</span>`,
            job.parent_job_id && `Refined from: <span>#${job.parent_job_id}</span>`,
            job.job_id && `Job: <span>#${job.job_id}</span>`,
        ].filter(Boolean);
        meta.innerHTML = chips.map(c => `<div class="meta-chip">${c}</div>`).join('');

        // Inline preview
        if (video && previewWrap) {
            video.src = `${API_BASE}/api/preview/${job.job_id}?client_id=${CLIENT_ID}`;
            previewWrap.style.display = 'flex';
            try { video.load(); } catch (_) { /* ignore */ }
        }

        // Download button
        body.innerHTML = `
      <a class="btn-download" href="${API_BASE}/api/download/${job.job_id}?client_id=${CLIENT_ID}" download>
        ⬇ Download Short
      </a>
    `;

        // Refinement section
        if (refineSection) {
            refineSection.style.display = 'block';
            refineSection.dataset.jobId = job.job_id;
            const refinePrompt = document.getElementById('refine-prompt');
            if (refinePrompt) refinePrompt.value = '';
            setRefineLoading(false);
        }
    } else {
        dot.className = 'status-dot error';
        title.textContent = 'Processing Failed';
        meta.innerHTML = `<div class="meta-chip">Job: <span>#${job.job_id}</span></div>`;
        body.innerHTML = `<div class="error-box">⚠ ${job.error || 'An unknown error occurred.'}</div>`;

        if (previewWrap) previewWrap.style.display = 'none';
        if (refineSection) refineSection.style.display = 'none';
    }
}

// ── Refinement ─────────────────────────────────────────────────────────────
function setRefineLoading(loading) {
    const btn = document.getElementById('refine-btn');
    const icon = document.getElementById('refine-icon');
    const label = document.getElementById('refine-label');
    if (!btn) return;
    btn.disabled = loading;
    if (icon) icon.textContent = loading ? '⏳' : '✨';
    if (label) label.textContent = loading ? 'Submitting…' : 'Apply Changes';
}

async function submitRefinement() {
    const refineSection = document.getElementById('refine-section');
    const promptEl = document.getElementById('refine-prompt');
    if (!refineSection || !promptEl) return;

    const parentJobId = refineSection.dataset.jobId || currentJobId;
    if (!parentJobId) {
        toast('No job to refine.', 'error');
        return;
    }

    const refinementPrompt = promptEl.value.trim();
    if (!refinementPrompt) {
        toast('Please describe what you want changed.', 'error');
        return;
    }

    try {
        setRefineLoading(true);

        const res = await fetch(`${API_BASE}/api/refine/${parentJobId}`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'X-Client-ID': CLIENT_ID
            },
            body: JSON.stringify({ refinement_prompt: refinementPrompt }),
        });

        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.detail || `HTTP ${res.status}`);
        }

        const job = await res.json();
        currentJobId = job.job_id;
        showProgress(job);
        startPolling(job.job_id);
        loadJobs();
    } catch (err) {
        toast(`Error: ${err.message}`, 'error');
        setRefineLoading(false);
    }
}

// ── UI: Reset ──────────────────────────────────────────────────────────────
function resetToInput() {
    stopPolling();
    currentJobId = null;
    fileInput.value = '';
    fileInput._selectedFiles = null;
    document.getElementById('file-list').innerHTML = '';
    document.getElementById('input-card').style.display = 'block';
    document.getElementById('progress-card').style.display = 'none';
    document.getElementById('result-card').style.display = 'none';
    document.getElementById('progress-bar').style.width = '0%';
    const promptEl = document.getElementById('user-prompt');
    if (promptEl) promptEl.value = '';
    clearPreview();
}

// ── Jobs history ───────────────────────────────────────────────────────────
async function loadJobs() {
    try {
        const res = await fetch(`${API_BASE}/api/jobs?limit=10`, {
            headers: { 'X-Client-ID': CLIENT_ID }
        });
        if (!res.ok) return;
        const jobs = await res.json();
        renderJobs(jobs);
    } catch (_) { /* backend not running */ }
}

function renderJobs(jobs) {
    const list = document.getElementById('jobs-list');
    if (!jobs.length) {
        list.innerHTML = '<div class="jobs-empty">No jobs yet. Submit a video to get started.</div>';
        return;
    }

    list.innerHTML = jobs.map(job => `
    <div class="job-item" onclick="viewJob('${job.job_id}')" title="Click to view job ${job.job_id}">
      <div class="job-status-dot ${job.status}"></div>
      <div class="job-item-info">
        <div class="job-item-title">${job.video_title || 'Untitled video'}</div>
        <div class="job-item-id">#${job.job_id} &nbsp;·&nbsp; ${formatDate(job.created_at)}</div>
      </div>
      <span class="job-item-status ${job.status}">${job.status}</span>
    </div>
  `).join('');
}

async function viewJob(jobId) {
    try {
        const res = await fetch(`${API_BASE}/api/status/${jobId}`, {
            headers: { 'X-Client-ID': CLIENT_ID }
        });
        if (!res.ok) return;
        const job = await res.json();

        if (job.status === 'completed' || job.status === 'failed') {
            currentJobId = jobId;
            document.getElementById('input-card').style.display = 'none';
            document.getElementById('progress-card').style.display = 'none';
            showResult(job);
        } else {
            currentJobId = jobId;
            showProgress(job);
            startPolling(jobId);
        }
    } catch (_) { }
}

// ── Helpers ────────────────────────────────────────────────────────────────
function formatDate(iso) {
    try {
        return new Date(iso).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' });
    } catch (_) { return iso; }
}

function toast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    const icons = { success: '✓', error: '✕', info: 'ℹ' };
    el.innerHTML = `<span>${icons[type] || 'ℹ'}</span> ${message}`;
    container.appendChild(el);
    setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity 0.4s'; }, 3500);
    setTimeout(() => el.remove(), 4000);
}

// ── Init ───────────────────────────────────────────────────────────────────
function init() {
    checkHealth();
    loadJobs();
    // Re-check health every 30 seconds
    setInterval(checkHealth, 30000);
}

init();
