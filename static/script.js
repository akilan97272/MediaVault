/* =========================================================
   MediaVault — script.js
   ========================================================= */

document.addEventListener('DOMContentLoaded', () => {

    // ---- DOM refs ----
    const grid         = document.getElementById('galleryGrid');
    const lightbox     = document.getElementById('lightbox');
    const lbContainer  = document.getElementById('lightboxContainer');
    const fileInput    = document.getElementById('fileInput');
    const pathNav      = document.getElementById('pathNav');
    const pathLabel    = document.getElementById('pathLabel');
    const emptyState   = document.getElementById('emptyState');
    const loadingState = document.getElementById('loadingState');
    const folderTree   = document.getElementById('folderTree');

    let mediaFiles  = [];
    let currentPath = '';
    let currentIdx  = 0;

    // ── Pagination ─────────────────────────────────────────────
    const PAGE_SIZE  = 25;
    let   currentPage = 1;
    let   allFolders  = [];  
    let   allFiles    = [];

    // ---- Zoom State ----
    let scale = 1, pointX = 0, pointY = 0;
    let isDragging = false, startX = 0, startY = 0;

    // =====================
    // INIT
    // =====================
    loadMedia('');
    loadFolderTree();

    function redirectIfRestricted(response) {
        if (response.status === 401) {
            location.href = '/';
            return true;
        }
        if (response.status === 403) {
            response.clone().json()
                .then(data => {
                    if (data.error === 'Access restricted') {
                        location.replace(`/?error=day&day=${encodeURIComponent(data.day || '')}`);
                    }
                })
                .catch(() => {});
        }
        return false;
    }

    // =====================
    // THEME
    // =====================
    window.toggleTheme = function () {
        const current = document.documentElement.getAttribute('data-theme') || 'dark';
        const next    = current === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', next);
        localStorage.setItem('mv-theme', next);
    };

    // =====================
    // MEDIA LOADING
    // =====================
    function loadMedia(path) {
        currentPath  = path;
        currentPage  = 1;           // reset to page 1 on every navigation
        grid.innerHTML = '';
        if (loadingState) loadingState.style.display = 'flex';
        if (emptyState)   emptyState.style.display   = 'none';

        updateBreadcrumb(path);
        document.querySelectorAll('.tree-item').forEach(el =>
            el.classList.toggle('active', el.dataset.path === path)
        );

        fetch(`/api/media?path=${encodeURIComponent(path)}`)
            .then(r => {
                if (redirectIfRestricted(r)) return null;
                return r.json();
            })
            .then(data => {
                if (!data) return;
                if (loadingState) loadingState.style.display = 'none';
                allFolders = data.folders || [];
                allFiles   = data.files   || [];
                mediaFiles = allFiles;          // lightbox always sees full list
                renderPage();
            })
            .catch(() => { if (loadingState) loadingState.style.display = 'none'; });
    }

    function updateBreadcrumb(path) {
        const bc = document.getElementById('pathBreadcrumb');
        if (!path) {
            if (bc) bc.textContent = 'All Media';
            if (pathNav) pathNav.style.display = 'none';
        } else {
            const parts = path.split('/');
            if (bc) bc.textContent = parts[parts.length - 1];
            if (pathNav) pathNav.style.display = 'flex';
            if (pathLabel) pathLabel.textContent = '/' + path;
        }
    }

    // =====================
    // RENDER PAGE (paginated)
    // =====================
    function renderPage() {
        grid.innerHTML = '';

        // Build a flat combined array so folders + files share one index space
        const combined = [
            ...allFolders.map(n  => ({ kind: 'folder', name: n })),
            ...allFiles  .map((n, i) => ({ kind: 'file',   name: n, fileIdx: i })),
        ];
        const total      = combined.length;
        const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
        currentPage      = Math.min(currentPage, totalPages);

        if (total === 0) {
            if (emptyState) emptyState.style.display = 'flex';
            renderPagination(0, 1, 1);
            return;
        }
        if (emptyState) emptyState.style.display = 'none';

        const slice = combined.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

        slice.forEach(item => {
            if (item.kind === 'folder') {
                const name       = item.name;
                const isShared   = name === 'shared' && !currentPath;
                const isOwn      = name === window.CURRENT_USER;
                const el         = document.createElement('div');
                el.className     = `media-item folder-item${isShared ? ' folder-shared' : ''}`;
                el.innerHTML     = `
                    <div class="folder-body">
                        <div class="folder-icon-wrap">
                            <svg viewBox="0 0 48 48" fill="none">
                                <path d="M6 12a4 4 0 014-4h9l4 4h15a4 4 0 014 4v20a4 4 0 01-4 4H10a4 4 0 01-4-4V12z"
                                      fill="var(--folder-fill)" stroke="var(--folder-stroke)" stroke-width="1.5"/>
                                <path d="M6 18h36" stroke="var(--folder-stroke)" stroke-width="1" opacity="0.5"/>
                            </svg>
                        </div>
                        <span class="folder-label">${escapeHtml(name)}</span>
                        ${isShared ? '<span class="folder-tag">shared</span>' : ''}
                        ${isOwn    ? '<span class="folder-tag own">yours</span>'  : ''}
                    </div>`;
                el.addEventListener('click', () => {
                    loadMedia(currentPath ? `${currentPath}/${name}` : name);
                    loadFolderTree();
                });
                if (!isShared) {
                    el.addEventListener('contextmenu', e => {
                        e.preventDefault(); confirmDelete('', name, true);
                    });
                }
                grid.appendChild(el);

            } else {
                const file    = item.name;
                const fileIdx = item.fileIdx;   // original index in allFiles / mediaFiles
                const urlPath = currentPath ? `${currentPath}/${file}` : file;
                const url     = `/media/${urlPath}`;
                const isVideo = /\.(mp4|webm|mkv)$/i.test(file);
                const el      = document.createElement('div');
                el.className  = 'media-item';
                el.innerHTML  = isVideo
                    ? `<video src="${url}#t=0.1" preload="metadata" muted playsinline></video>
                       <div class="video-badge"><svg viewBox="0 0 16 16" fill="none"><polygon points="5,3 13,8 5,13" fill="white"/></svg></div>`
                    : `<img src="${url}" loading="lazy" alt="${escapeHtml(file)}">`;
                el.addEventListener('click', () => openLightbox(fileIdx));
                el.addEventListener('contextmenu', e => {
                    e.preventDefault(); confirmDelete(currentPath, file, false);
                });
                grid.appendChild(el);
            }
        });

        renderPagination(total, currentPage, totalPages);
    }

    function renderPagination(total, page, totalPages) {
        const bar = document.getElementById('paginationBar');
        if (!bar) return;
        if (totalPages <= 1) { bar.style.display = 'none'; return; }

        bar.style.display = 'flex';

        const start = (page - 1) * PAGE_SIZE + 1;
        const end   = Math.min(page * PAGE_SIZE, total);

        // Build compact page number list with ellipsis
        let nums = [];
        if (totalPages <= 7) {
            nums = Array.from({ length: totalPages }, (_, i) => i + 1);
        } else if (page <= 3) {
            nums = [1, 2, 3, 4, '…', totalPages];
        } else if (page >= totalPages - 2) {
            nums = [1, '…', totalPages-3, totalPages-2, totalPages-1, totalPages];
        } else {
            nums = [1, '…', page - 1, page, page + 1, '…', totalPages];
        }

        bar.innerHTML = `
            <span class="pg-info">Showing <strong>${start}–${end}</strong> of <strong>${total}</strong></span>
            <div class="pg-controls">
                <button class="pg-btn pg-arrow" onclick="goToPage(${page - 1})" ${page === 1 ? 'disabled' : ''} title="Previous">&#10094;</button>
                ${nums.map(n => n === '…'
                    ? `<span class="pg-dots">…</span>`
                    : `<button class="pg-btn${n === page ? ' pg-active' : ''}" onclick="goToPage(${n})">${n}</button>`
                ).join('')}
                <button class="pg-btn pg-arrow" onclick="goToPage(${page + 1})" ${page === totalPages ? 'disabled' : ''} title="Next">&#10095;</button>
            </div>`;
    }

    window.goToPage = function (page) {
        const totalPages = Math.max(1, Math.ceil((allFolders.length + allFiles.length) / PAGE_SIZE));
        if (page < 1 || page > totalPages) return;
        currentPage = page;
        renderPage();
        // Scroll grid back to top smoothly
        grid.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };

    // =====================
    // FOLDER TREE (Sidebar)
    // =====================
    function loadFolderTree() {
        fetch('/api/tree')
            .then(r => {
                if (redirectIfRestricted(r)) return null;
                return r.json();
            })
            .then(data => {
                if (!data) return;
                if (!folderTree) return;
                folderTree.innerHTML = renderTreeNodes(data.tree || [], 1);
                folderTree.querySelectorAll('.tree-item[data-path]').forEach(el => {
                    el.addEventListener('click', () => { navigateTo(el.dataset.path); closeSidebar(); });
                });
            });
    }

    function renderTreeNodes(nodes, depth) {
        if (!nodes || nodes.length === 0) return '';
        return nodes.map(node => {
            const hasChildren = node.children && node.children.length > 0;
            const indent      = depth * 12;
            const isShared    = node.is_shared;
            return `
            <div class="tree-group">
                <div class="tree-item${hasChildren ? ' has-children' : ''}${isShared ? ' tree-shared' : ''}"
                     data-path="${escapeHtml(node.path)}"
                     style="padding-left:${16 + indent}px">
                    <span class="tree-icon">${isShared ? '🌐' : hasChildren ? '📂' : '📁'}</span>
                    <span class="tree-label">${escapeHtml(node.name)}</span>
                    ${isShared ? '<span class="tree-tag">shared</span>' : ''}
                </div>
                ${hasChildren ? `<div class="tree-children">${renderTreeNodes(node.children, depth + 1)}</div>` : ''}
            </div>`;
        }).join('');
    }

    window.navigateTo = function (path) { loadMedia(path); };

    // =====================
    // GO UP
    // =====================
    window.goUp = function () {
        if (!currentPath) return;
        const parts = currentPath.split('/');
        parts.pop();
        loadMedia(parts.join('/'));
    };

    // =====================
    // CREATE FOLDER
    // =====================
    window.createFolder = async function () {
        const name = prompt('Enter folder name:');
        if (!name || !name.trim()) return;
        const fd = new FormData();
        fd.append('name', name.trim());
        fd.append('path', currentPath);
        const res = await fetch('/api/folder', { method: 'POST', body: fd });
        if (res.ok) { loadMedia(currentPath); loadFolderTree(); }
        else { const d = await res.json(); alert('Error: ' + (d.detail || 'Could not create folder')); }
    };

    // =====================
    // UPLOAD
    // =====================
    fileInput.addEventListener('change', async e => {
        const files = Array.from(e.target.files);
        if (!files.length) return;
        const fab = document.querySelector('.fab-primary');
        if (fab) fab.classList.add('uploading');
        for (const file of files) {
            const fd = new FormData();
            fd.append('file', file);
            fd.append('path', currentPath);
            try { await fetch('/api/upload', { method: 'POST', body: fd }); }
            catch (err) { console.error(err); }
        }
        if (fab) fab.classList.remove('uploading');
        fileInput.value = '';
        loadMedia(currentPath);
    });

    // =====================
    // DELETE
    // =====================
    function confirmDelete(path, name, isFolder) {
        if (!confirm(`Delete ${isFolder ? 'folder' : 'file'} "${name}"?`)) return;
        const params = new URLSearchParams({ path, filename: name });
        fetch(`/api/media?${params}`, { method: 'DELETE' })
            .then(r => { if (r.ok) { loadMedia(currentPath); loadFolderTree(); } })
            .catch(console.error);
    }

    // =====================
    // LIGHTBOX
    // =====================
    function openLightbox(idx) {
        currentIdx = idx;
        renderLightbox();
        lightbox.classList.add('active');
        resetZoom();
    }

    function renderLightbox() {
        lbContainer.innerHTML = '';
        const file    = mediaFiles[currentIdx];
        if (!file) return;
        const urlPath = currentPath ? `${currentPath}/${file}` : file;
        const url     = `/media/${urlPath}`;
        const isVideo = /\.(mp4|webm|mkv)$/i.test(file);

        if (isVideo) {
            const v     = document.createElement('video');
            v.src       = url;
            v.controls  = true;
            v.autoplay  = true;
            v.className = 'lb-media';
            lbContainer.appendChild(v);
        } else {
            const img   = document.createElement('img');
            img.src     = url;
            img.className = 'lb-media';
            img.addEventListener('load', () => resetZoom());
            attachZoom(img);
            lbContainer.appendChild(img);
        }
    }

    // =====================
    // SLIDESHOW
    // =====================
    let ssInterval   = null;
    let ssSeconds    = 10;
    let ssTickHandle = null;
    let ssStartTime  = 0;
    const circumference = 94.25;

    const ssBtn       = document.getElementById('slideshowBtn');
    const ssPlayIcon  = document.getElementById('ssPlayIcon');
    const ssPauseIcon = document.getElementById('ssPauseIcon');
    const ssCountdown = document.getElementById('ssCountdown');
    const ssRing      = document.getElementById('ssRing');
    const ssCountNum  = document.getElementById('ssCountNum');
    const speedPicker = document.getElementById('speedPicker');
    const speedOpts   = document.querySelectorAll('.speed-opt');

    speedOpts[0].classList.add('active');

    speedOpts.forEach(btn => {
        btn.addEventListener('click', e => {
            e.stopPropagation();
            speedOpts.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            ssSeconds = parseInt(btn.dataset.sec);
            speedPicker.classList.remove('visible');
            startSlideshow();
        });
    });

    ssBtn.addEventListener('click', e => {
        e.stopPropagation();
        if (ssInterval) { stopSlideshow(); return; }
        speedPicker.classList.toggle('visible');
    });

    function startSlideshow() {
        if (mediaFiles.length < 2) return;
        ssBtn.classList.add('playing');
        ssPlayIcon.style.display  = 'none';
        ssPauseIcon.style.display = '';
        ssCountdown.style.display = 'flex';
        tickCountdown(ssSeconds);
        ssInterval = setInterval(() => {
            currentIdx = (currentIdx + 1) % mediaFiles.length;
            renderLightbox(); resetZoom();
            tickCountdown(ssSeconds);
        }, ssSeconds * 1000);
    }

    function stopSlideshow() {
        clearInterval(ssInterval);
        cancelAnimationFrame(ssTickHandle);
        ssInterval = null;
        ssBtn.classList.remove('playing');
        ssPlayIcon.style.display  = '';
        ssPauseIcon.style.display = 'none';
        ssCountdown.style.display = 'none';
        ssRing.style.strokeDashoffset = '0';
    }

    function tickCountdown(total) {
        cancelAnimationFrame(ssTickHandle);
        ssStartTime = performance.now();
        function frame(now) {
            const elapsed  = (now - ssStartTime) / 1000;
            const left     = Math.max(0, total - elapsed);
            ssRing.style.strokeDashoffset = String(circumference * (1 - left / total));
            ssCountNum.textContent = Math.ceil(left);
            if (left > 0) ssTickHandle = requestAnimationFrame(frame);
        }
        ssTickHandle = requestAnimationFrame(frame);
    }

    // =====================
    // LIGHTBOX CONTROLS
    // =====================
    function closeLightbox() {
        stopSlideshow();
        speedPicker.classList.remove('visible');
        lightbox.classList.remove('active');
        const v = lbContainer.querySelector('video');
        if (v) v.pause();
        resetZoom();
    }

    document.getElementById('closeLightbox').addEventListener('click', closeLightbox);
    lightbox.addEventListener('click', e => { if (e.target === lightbox) closeLightbox(); });

    document.getElementById('nextBtn').addEventListener('click', e => {
        e.stopPropagation(); stopSlideshow();
        currentIdx = (currentIdx + 1) % mediaFiles.length;
        renderLightbox(); resetZoom();
    });
    document.getElementById('prevBtn').addEventListener('click', e => {
        e.stopPropagation(); stopSlideshow();
        currentIdx = (currentIdx - 1 + mediaFiles.length) % mediaFiles.length;
        renderLightbox(); resetZoom();
    });

    document.addEventListener('keydown', e => {
        if (!lightbox.classList.contains('active')) return;
        if (e.key === 'ArrowRight') { stopSlideshow(); currentIdx = (currentIdx + 1) % mediaFiles.length; renderLightbox(); resetZoom(); }
        if (e.key === 'ArrowLeft')  { stopSlideshow(); currentIdx = (currentIdx - 1 + mediaFiles.length) % mediaFiles.length; renderLightbox(); resetZoom(); }
        if (e.key === 'Escape')     closeLightbox();
    });

    let touchStartX = 0;
    lbContainer.addEventListener('touchstart', e => { touchStartX = e.touches[0].clientX; }, { passive: true });
    lbContainer.addEventListener('touchend', e => {
        const diff = touchStartX - e.changedTouches[0].clientX;
        if (Math.abs(diff) > 60 && scale === 1) {
            if (diff > 0) { currentIdx = (currentIdx + 1) % mediaFiles.length; }
            else          { currentIdx = (currentIdx - 1 + mediaFiles.length) % mediaFiles.length; }
            renderLightbox(); resetZoom();
        }
    }, { passive: true });

    // =====================
    // ZOOM & PAN
    // =====================
    function resetZoom() {
        scale = 1; pointX = 0; pointY = 0; isDragging = false;
        const el = document.querySelector('.lb-media');
        if (el) el.style.transform = 'translate(0,0) scale(1)';
    }

    function setTransform(el) {
        el.style.transform = `translate(${pointX}px,${pointY}px) scale(${scale})`;
    }

    function attachZoom(img) {
        img.ondragstart = () => false;
        img.addEventListener('wheel', e => {
            e.preventDefault();
            const xs = (e.clientX - pointX) / scale;
            const ys = (e.clientY - pointY) / scale;
            scale = Math.min(5, Math.max(1, scale * (e.deltaY < 0 ? 1.1 : 0.9)));
            pointX = e.clientX - xs * scale;
            pointY = e.clientY - ys * scale;
            setTransform(img);
        }, { passive: false });

        img.addEventListener('mousedown', e => {
            if (scale === 1) return;
            isDragging = true; startX = e.clientX - pointX; startY = e.clientY - pointY;
        });
        window.addEventListener('mousemove', e => {
            if (!isDragging) return;
            pointX = e.clientX - startX; pointY = e.clientY - startY; setTransform(img);
        });
        window.addEventListener('mouseup', () => { isDragging = false; });

        let lastDist = 0;
        img.addEventListener('touchstart', e => {
            if (e.touches.length === 2) {
                lastDist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
            } else if (e.touches.length === 1 && scale > 1) {
                isDragging = true; startX = e.touches[0].clientX - pointX; startY = e.touches[0].clientY - pointY;
            }
        }, { passive: true });

        img.addEventListener('touchmove', e => {
            if (e.touches.length === 2) {
                e.preventDefault();
                const dist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
                scale = Math.min(5, Math.max(1, scale * (dist / lastDist)));
                lastDist = dist; setTransform(img);
            } else if (isDragging) {
                e.preventDefault();
                pointX = e.touches[0].clientX - startX; pointY = e.touches[0].clientY - startY; setTransform(img);
            }
        }, { passive: false });

        img.addEventListener('touchend', () => { isDragging = false; });
        let lastTap = 0;
        img.addEventListener('touchend', e => {
            const now = Date.now();
            if (now - lastTap < 300) { e.preventDefault(); scale > 1 ? resetZoom() : (scale = 2.5, setTransform(img)); }
            lastTap = now;
        });
    }

    // =====================
    // SIDEBAR
    // =====================
    window.openSidebar  = () => { document.getElementById('sidebar').classList.add('open'); document.getElementById('sidebarOverlay').classList.add('visible'); };
    window.closeSidebar = () => { document.getElementById('sidebar').classList.remove('open'); document.getElementById('sidebarOverlay').classList.remove('visible'); };
    const sidebarClose = document.getElementById('sidebarClose');
    if (sidebarClose) sidebarClose.addEventListener('click', closeSidebar);

    // =====================
    // USER MANAGER
    // =====================
    window.openUserManager = function () {
        if (!window.IS_ADMIN) return;
        document.getElementById('userModal').classList.add('active');
        loadUserList();
    };
    window.closeUserManager = function () {
        document.getElementById('userModal').classList.remove('active');
    };
    document.getElementById('userModal').addEventListener('click', e => {
        if (e.target === document.getElementById('userModal')) closeUserManager();
    });

function loadUserList() {
        Promise.all([
            fetch('/api/users').then(r => r.json()),
            fetch('/api/restrictions').then(r => r.json()),
        ]).then(([uData, rData]) => {
            const list  = document.getElementById('userList');
            if (!list) return;
            const restr = rData.restrictions || {};
            const DAYS  = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];

            list.innerHTML = (uData.users || []).map(u => {
                const rc      = restr[u] || { enabled: false, allowed_days: [] };
                const isAdmin = u === 'admin';
                return `
                <div class="user-row" id="urow-${escapeHtml(u)}">
                    <div class="user-row-main">
                        <div class="user-avatar">${u[0].toUpperCase()}</div>
                        <span class="user-name">${escapeHtml(u)}</span>
                        ${rc.enabled ? '<span class="restrict-badge">Restricted</span>' : ''}
                        <div class="user-row-actions">
                            ${!isAdmin ? `
                                <button class="restrict-btn" title="Set access days"
                                    onclick="toggleRestrictPanel('${escapeHtml(u)}')">🗓</button>
                                <button class="delete-user-btn"
                                    onclick="deleteUser('${escapeHtml(u)}')">Remove</button>
                            ` : '<span class="user-badge">admin</span>'}
                        </div>
                    </div>
                    ${!isAdmin ? `
                    <div class="restrict-panel" id="rp-${escapeHtml(u)}" style="display:none">
                        <div class="restrict-header">
                            <span>Access restriction</span>
                            <label class="toggle-switch" title="${rc.enabled ? 'Enabled' : 'Disabled'}">
                                <input type="checkbox" id="re-${escapeHtml(u)}"
                                    ${rc.enabled ? 'checked' : ''}
                                    onchange="onRestrictToggle('${escapeHtml(u)}')">
                                <span class="toggle-track"></span>
                            </label>
                        </div>
                        <div class="restrict-days" id="rd-${escapeHtml(u)}"
                             style="${rc.enabled ? '' : 'display:none'}">
                            ${DAYS.map((d, i) => `
                                <button class="day-btn ${rc.allowed_days.includes(i) ? 'active' : ''}"
                                        data-day="${i}">
                                    ${d}
                                </button>`).join('')}
                            <button class="save-restrict-btn"
                                onclick="saveRestriction('${escapeHtml(u)}')">Save</button>
                        </div>
                    </div>
                    ` : ''}
                </div>`;
            }).join('');

            // Wire day-btn toggles (can't use inline onclick with CSP-safe approach)
            list.querySelectorAll('.day-btn').forEach(btn => {
                btn.addEventListener('click', () => btn.classList.toggle('active'));
            });
        });
    }

    window.toggleRestrictPanel = function (u) {
        const p = document.getElementById(`rp-${u}`);
        if (p) p.style.display = p.style.display === 'none' ? 'block' : 'none';
    };

    window.onRestrictToggle = function (u) {
        const enabled = document.getElementById(`re-${u}`).checked;
        const days    = document.getElementById(`rd-${u}`);
        if (days) days.style.display = enabled ? 'flex' : 'none';
    };

    window.saveRestriction = async function (u) {
        const enabled     = document.getElementById(`re-${u}`).checked;
        const activeDays  = [...document.querySelectorAll(`#rd-${u} .day-btn.active`)]
                               .map(b => parseInt(b.dataset.day));
        const res = await fetch(`/api/restrictions/${encodeURIComponent(u)}`, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ enabled, allowed_days: activeDays }),
        });
        const msg = document.getElementById('userFormMsg');
        if (res.ok) {
            showFormMsg(msg, 'success', `Restrictions saved for "${u}"`);
            loadUserList();
        } else {
            showFormMsg(msg, 'error', 'Failed to save restrictions');
        }
    };

    window.createUser = async function () {
        const username = document.getElementById('newUsername').value.trim();
        const password = document.getElementById('newPassword').value;
        const msg      = document.getElementById('userFormMsg');
        if (!username || !password) { showFormMsg(msg, 'error', 'Both fields required'); return; }
        const fd = new FormData();
        fd.append('username', username);
        fd.append('password', password);
        const res  = await fetch('/api/users', { method: 'POST', body: fd });
        const data = await res.json();
        if (res.ok) {
            showFormMsg(msg, 'success', `User "${username}" created`);
            document.getElementById('newUsername').value = '';
            document.getElementById('newPassword').value = '';
            loadUserList();
        } else {
            showFormMsg(msg, 'error', data.error || 'Failed to create user');
        }
    };

    window.deleteUser = async function (username) {
        if (!confirm(`Remove user "${username}"?`)) return;
        const res = await fetch(`/api/users/${encodeURIComponent(username)}`, { method: 'DELETE' });
        if (res.ok) loadUserList();
        else { const d = await res.json(); alert(d.error || 'Error'); }
    };

    function showFormMsg(el, type, text) {
        if (!el) return;
        el.textContent = text;
        el.className   = `form-msg ${type}`;
        setTimeout(() => { el.textContent = ''; el.className = 'form-msg'; }, 3500);
    }

    // =====================
    // ACTIVITY LOG
    // =====================
    window.openActivityLog = function () {
        if (!window.IS_ADMIN) return;
        document.getElementById('activityModal').classList.add('active');
        loadActivityLog();
    };

    window.closeActivityLog = function () {
        document.getElementById('activityModal').classList.remove('active');
    };

    document.getElementById('activityModal').addEventListener('click', e => {
        if (e.target === document.getElementById('activityModal')) closeActivityLog();
    });

    async function loadActivityLog() {
        try {
            const res = await fetch('/api/activity-log');
            if (!res.ok) return;
            const data = await res.json();
            displayActivityLog(data.activities || []);
        } catch (err) {
            console.error('Failed to load activity log:', err);
        }
    }

    window.filterActivityLog = function () {
        const filterValue = document.getElementById('activityFilter').value;
        // Reload and filter will happen on next load
        loadActivityLog();
    };

    function displayActivityLog(activities) {
        const list = document.getElementById('activityList');
        if (!list) return;

        if (activities.length === 0) {
            list.innerHTML = '<div class="empty-activity">No login activity recorded yet</div>';
            return;
        }

        list.innerHTML = activities.map(a => {
            const date = new Date(a.timestamp);
            const timeStr = date.toLocaleTimeString();
            const dateStr = date.toLocaleDateString();
            const device = a.device_info || {};
            const statusClass = a.success ? 'success' : 'failed';
            const statusText = a.success ? 'Success' : 'Failed';
            
            return `
                <div class="activity-item">
                    <div style="display:flex;justify-content:space-between;align-items:start;">
                        <div>
                            <span class="activity-user">${escapeHtml(a.username)}</span>
                            <span class="activity-action ${statusClass}"> — ${statusText}</span>
                        </div>
                        <span style="font-size:0.7rem;color:var(--text-3);">${statusClass === 'success' ? '✓' : '✗'}</span>
                    </div>
                    <div class="activity-time">${dateStr} ${timeStr}</div>
                    <div style="margin-top:6px;display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:0.75rem;color:var(--text-3);">
                        <div><strong>Device:</strong> ${escapeHtml(device.device_type || 'Unknown')}</div>
                        <div><strong>OS:</strong> ${escapeHtml(device.os || 'Unknown')}</div>
                        <div><strong>Browser:</strong> ${escapeHtml(device.browser || 'Unknown')}</div>
                        <div><strong>IP:</strong> ${escapeHtml(a.ip_address || 'Unknown')}</div>
                    </div>
                </div>
            `;
        }).join('');
    }

    function escapeHtml(s) {
        return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }
});
