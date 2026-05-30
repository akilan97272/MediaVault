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

    // ---- App State ----
    let mediaFiles  = [];
    let currentPath = '';
    let currentIdx  = 0;

    // ---- Zoom State ----
    let scale = 1, pointX = 0, pointY = 0;
    let isDragging = false, startX = 0, startY = 0;

    // =====================
    // INIT
    // =====================
    loadMedia('');
    loadFolderTree();

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
        currentPath = path;
        grid.innerHTML = '';
        if (loadingState) loadingState.style.display = 'flex';
        if (emptyState)   emptyState.style.display   = 'none';

        updateBreadcrumb(path);

        document.querySelectorAll('.tree-item').forEach(el =>
            el.classList.toggle('active', el.dataset.path === path)
        );

        fetch(`/api/media?path=${encodeURIComponent(path)}`)
            .then(r => { if (r.status === 401) { location.href = '/'; } return r.json(); })
            .then(data => {
                if (loadingState) loadingState.style.display = 'none';
                mediaFiles = data.files || [];
                renderGrid(data.folders || [], data.files || []);
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
    // RENDER GRID
    // =====================
    function renderGrid(folders, files) {
        grid.innerHTML = '';

        if (folders.length === 0 && files.length === 0) {
            if (emptyState) emptyState.style.display = 'flex';
            return;
        }

        folders.forEach(name => {
            const isShared = name === 'shared' && !currentPath;
            const isOwnFolder = name === window.CURRENT_USER;
            const item = document.createElement('div');
            item.className = `media-item folder-item${isShared ? ' folder-shared' : ''}`;
            item.innerHTML = `
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
                    ${isOwnFolder ? '<span class="folder-tag own">yours</span>' : ''}
                </div>`;
            item.addEventListener('click', () => {
                const newPath = currentPath ? `${currentPath}/${name}` : name;
                loadMedia(newPath);
                loadFolderTree();
            });
            // Only allow delete for non-shared, accessible folders
            if (!isShared) {
                item.addEventListener('contextmenu', e => { e.preventDefault(); confirmDelete('', name, true); });
            }
            grid.appendChild(item);
        });

        files.forEach((file, idx) => {
            const item    = document.createElement('div');
            item.className = 'media-item';
            const urlPath = currentPath ? `${currentPath}/${file}` : file;
            const url     = `/media/${urlPath}`;
            const isVideo = /\.(mp4|webm|mkv)$/i.test(file);

            if (isVideo) {
                item.innerHTML = `<video src="${url}#t=0.1" preload="metadata" muted playsinline></video>
                    <div class="video-badge"><svg viewBox="0 0 16 16" fill="none"><polygon points="5,3 13,8 5,13" fill="white"/></svg></div>`;
            } else {
                item.innerHTML = `<img src="${url}" loading="lazy" alt="${escapeHtml(file)}">`;
            }

            item.addEventListener('click', () => openLightbox(idx));
            item.addEventListener('contextmenu', e => { e.preventDefault(); confirmDelete(currentPath, file, false); });
            grid.appendChild(item);
        });
    }

    // =====================
    // FOLDER TREE (Sidebar)
    // =====================
    function loadFolderTree() {
        fetch('/api/tree')
            .then(r => r.json())
            .then(data => {
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
        fetch('/api/users').then(r => r.json()).then(data => {
            const list = document.getElementById('userList');
            if (!list) return;
            list.innerHTML = (data.users || []).map(u => `
                <div class="user-row">
                    <div class="user-avatar">${u[0].toUpperCase()}</div>
                    <span class="user-name">${escapeHtml(u)}</span>
                    ${u !== 'admin'
                        ? `<button class="delete-user-btn" onclick="deleteUser('${escapeHtml(u)}')">Remove</button>`
                        : '<span class="user-badge">admin</span>'}
                </div>`).join('');
        });
    }

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

    function escapeHtml(s) {
        return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }
});