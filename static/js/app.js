const API_BASE = '/api/proxy';
let currentUser = null;
let currentDrama = null;
let currentEpisodes = [];
let currentTab = 'foryou';
let currentLibTab = 'history';
let favorites = [];
let searchTimeout = null;
let previousPage = 'home';
let homePage = 1;
let homeLoading = false;
let homeHasMore = true;
let searchPage = 1;
let searchLoading = false;
let searchHasMore = true;
let lastSearchQuery = '';
let userIsAdmin = false;
let userHasFullAccess = false;

const tg = window.Telegram?.WebApp;

function getUrlParam(name) {
    const params = new URLSearchParams(window.location.search);
    return params.get(name);
}

function initApp() {
    if (tg) {
        tg.ready();
        tg.expand();
        tg.setHeaderColor('#0a0a0a');
        tg.setBackgroundColor('#0a0a0a');

        const user = tg.initDataUnsafe?.user;
        if (user) {
            currentUser = {
                telegram_id: user.id,
                username: user.username || '',
                first_name: user.first_name || '',
                last_name: user.last_name || '',
                avatar_url: user.photo_url || ''
            };
            registerUser();
        }
    }

    if (!currentUser) {
        currentUser = {
            telegram_id: 0,
            username: 'guest',
            first_name: 'Guest',
            last_name: '',
            avatar_url: ''
        };
    }

    loadHomeContent('foryou');
}

async function registerUser() {
    try {
        const resp = await fetch('/api/user', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(currentUser)
        });
        const data = await resp.json();
        if (data.telegram_id) {
            currentUser = { ...currentUser, ...data };
            userIsAdmin = data.is_admin || false;
        }

        await checkUserAccess();

        let refCode = tg?.initDataUnsafe?.start_param;
        if (!refCode) {
            const urlRef = getUrlParam('ref');
            if (urlRef && urlRef.startsWith('ref_')) {
                refCode = urlRef;
            }
        }

        if (refCode && refCode.startsWith('ref_')) {
            const refResp = await fetch('/api/referral', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    telegram_id: currentUser.telegram_id,
                    ref_code: refCode
                })
            });
            const refData = await refResp.json();
            if (refData.status === 'ok') {
                showToast('Referral berhasil! Selamat bergabung!', 'success');
            } else if (refData.status === 'already_referred') {
                showToast('Kamu sudah terdaftar melalui referral', 'info');
            }
        }
    } catch (e) {
        console.error('Register error:', e);
    }
}

async function checkUserAccess() {
    if (!currentUser.telegram_id) return;
    try {
        const resp = await fetch(`/api/subscription/check/${currentUser.telegram_id}`);
        const data = await resp.json();
        userHasFullAccess = userIsAdmin || data.is_active || false;
        currentUser.membership = data.membership || 'Free';
        currentUser.has_referral_access = data.has_referral_access || false;
    } catch (e) {
        console.error('Access check error:', e);
    }
}

function stopVideoPlayer() {
    if (isCustomFullscreen) {
        exitCustomFullscreen();
    }
    const player = document.getElementById('video-player');
    if (player) {
        player.pause();
        player.removeAttribute('src');
        player.load();
    }
}

function showPage(pageId) {
    const currentPage = document.querySelector('.page.active')?.id?.replace('page-', '') || 'home';

    if (currentPage === 'player' && pageId !== 'player') {
        stopVideoPlayer();
    }

    const navPages = ['home', 'library', 'profile'];
    if (navPages.includes(pageId)) {
        previousPage = 'home';
    }

    document.querySelectorAll('.page').forEach(p => {
        if (p.classList.contains('active')) {
            p.classList.add('page-exit');
            p.classList.remove('active');
            setTimeout(() => p.classList.remove('page-exit'), 300);
        }
    });

    const targetPage = document.getElementById('page-' + pageId);
    targetPage.classList.add('active', 'page-enter');
    setTimeout(() => targetPage.classList.remove('page-enter'), 300);

    const nav = document.getElementById('bottom-nav');
    const hiddenPages = ['search', 'detail', 'player', 'help', 'settings', 'about', 'upgrade', 'stats'];
    nav.style.display = hiddenPages.includes(pageId) ? 'none' : 'flex';

    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    const navIndex = navPages.indexOf(pageId);
    if (navIndex >= 0) {
        document.querySelectorAll('.nav-item')[navIndex].classList.add('active');
    }

    if (pageId === 'search') loadSearchSuggestions();
    if (pageId === 'library') loadLibraryContent();
    if (pageId === 'profile') loadProfile();
    if (pageId === 'settings') loadSettings();
    if (pageId === 'upgrade') loadUpgradePage();
    if (pageId === 'stats') loadMonthlyStats();
    if (pageId === 'search') {
        setTimeout(() => document.getElementById('search-input')?.focus(), 100);
    }

    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function goBackFromDetail() {
    showPage(previousPage);
}

async function loadHomeContent(tab, append) {
    if (!append) {
        currentTab = tab;
        homePage = 1;
        homeHasMore = true;
    }

    if (homeLoading || (!homeHasMore && append)) return;
    homeLoading = true;

    const container = document.getElementById('home-content');
    if (!append) {
        container.innerHTML = renderSkeletonGrid(9);
    } else {
        removeLoadMore('home');
        appendLoadingIndicator(container);
    }

    let endpoint = tab;
    let params = '';
    if (tab === 'dubindo') {
        endpoint = 'dubindo';
        params = `?classify=terpopuler&page=${homePage}`;
    } else {
        params = `?page=${homePage}`;
    }

    try {
        const resp = await fetch(`${API_BASE}/${endpoint}${params}`);
        const text = await resp.text();
        let data;
        try {
            data = JSON.parse(text);
        } catch (pe) {
            console.error('JSON parse error:', pe, text.substring(0, 200));
            if (!append) container.innerHTML = '<div class="empty-state"><i class="fas fa-exclamation-circle"></i><p>Gagal memuat data</p></div>';
            homeLoading = false;
            return;
        }

        let items = extractItems(data);

        if (!items || items.length === 0) {
            homeHasMore = false;
            removeLoadingIndicator(container);
            if (!append) {
                container.innerHTML = '<div class="empty-state"><i class="fas fa-film"></i><p>Tidak ada drama ditemukan</p></div>';
            }
            homeLoading = false;
            return;
        }

        if (items.length < 5) {
            homeHasMore = false;
        }

        if (append) {
            removeLoadingIndicator(container);
            const grid = container.querySelector('.content-grid');
            if (grid) {
                const startIdx = grid.children.length;
                grid.insertAdjacentHTML('beforeend', items.map((item, i) => renderDramaCard(item, startIdx + i)).join(''));
            }
        } else {
            container.innerHTML = '<div class="content-grid">' +
                items.map((item, i) => renderDramaCard(item, i)).join('') +
                '</div>';
        }

        homePage++;

        if (homeHasMore) {
            appendLoadMoreButton(container, 'home');
        }
    } catch (e) {
        console.error('Load error:', e);
        removeLoadingIndicator(container);
        if (!append) container.innerHTML = '<div class="empty-state"><i class="fas fa-exclamation-circle"></i><p>Gagal memuat: ' + e.message + '</p></div>';
    }
    homeLoading = false;
}

function renderSkeletonGrid(count) {
    let html = '<div class="content-grid">';
    for (let i = 0; i < count; i++) {
        html += `<div class="skeleton-card" style="animation-delay:${i * 0.05}s">
            <div class="skeleton skeleton-img"></div>
            <div class="skeleton skeleton-text"></div>
        </div>`;
    }
    html += '</div>';
    return html;
}

function extractItems(data) {
    let items = [];
    if (Array.isArray(data)) {
        items = data;
    } else if (data && data.data) {
        items = Array.isArray(data.data) ? data.data : (data.data.bookList || data.data.list || []);
    } else if (data && data.result) {
        items = Array.isArray(data.result) ? data.result : (data.result.bookList || data.result.list || []);
    }
    return items;
}

function appendLoadMoreButton(container, type) {
    const btn = document.createElement('div');
    btn.className = 'load-more-wrapper';
    btn.setAttribute('data-loadmore', type);
    btn.innerHTML = '<button class="btn-load-more" onclick="' +
        (type === 'home' ? 'loadHomeContent(currentTab, true)' : 'loadMoreSearch()') +
        '"><i class="fas fa-plus"></i> Muat Lagi</button>';
    container.appendChild(btn);
}

function removeLoadMore(type) {
    const el = document.querySelector(`[data-loadmore="${type}"]`);
    if (el) el.remove();
}

function appendLoadingIndicator(container) {
    const el = document.createElement('div');
    el.className = 'load-more-spinner';
    el.innerHTML = '<div class="spinner"></div>';
    container.appendChild(el);
}

function removeLoadingIndicator(container) {
    const el = container.querySelector('.load-more-spinner');
    if (el) el.remove();
}

function renderDramaCard(item, index) {
    const id = item.bookId || item.id || item.book_id || '';
    const title = item.bookName || item.name || item.title || 'Tidak diketahui';
    const cover = item.coverWap || item.cover || item.coverUrl || item.image || '';

    return `<div class="drama-card" style="animation-delay:${index * 0.04}s" onclick="openDrama('${id}', '${encodeURIComponent(title)}', '${encodeURIComponent(cover)}')">
        <div class="card-img-wrapper">
            <img src="${cover}" alt="${title}" loading="lazy" onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 300 400%22><rect fill=%22%23141414%22 width=%22300%22 height=%22400%22/><text fill=%22%23444%22 x=%22150%22 y=%22200%22 text-anchor=%22middle%22 font-size=%2214%22>No Image</text></svg>'">
            <div class="card-overlay">
                <i class="fas fa-play"></i>
            </div>
        </div>
        <div class="card-title">${title}</div>
    </div>`;
}

function switchHomeTab(el, tab) {
    document.querySelectorAll('#home-tabs .tab').forEach(t => t.classList.remove('active'));
    el.classList.add('active');
    loadHomeContent(tab);
}

async function loadSearchSuggestions() {
    const container = document.getElementById('search-suggestions');
    const results = document.getElementById('search-results');
    results.innerHTML = '';

    try {
        const resp = await fetch(`${API_BASE}/populersearch`);
        const data = await resp.json();
        let keywords = [];
        if (data.data) {
            keywords = Array.isArray(data.data) ? data.data : (data.data.list || []);
        } else if (Array.isArray(data)) {
            keywords = data;
        } else if (data.result) {
            keywords = Array.isArray(data.result) ? data.result : [];
        }

        if (keywords.length > 0) {
            container.innerHTML = `
                <div class="suggestion-title"><i class="fas fa-fire" style="color:#e50914;margin-right:8px"></i>Pencarian Populer</div>
                <div class="suggestion-tags">
                    ${keywords.map((k, i) => {
                        const word = typeof k === 'string' ? k : (k.keyword || k.name || k.word || '');
                        return `<span class="suggestion-tag" style="animation-delay:${i * 0.03}s" onclick="searchFor('${word}')">${word}</span>`;
                    }).join('')}
                </div>`;
        }
    } catch (e) {
        console.error('Suggestion error:', e);
    }
}

function searchFor(query) {
    document.getElementById('search-input').value = query;
    handleSearch(query);
}

function handleSearch(query) {
    clearTimeout(searchTimeout);
    if (!query || query.length < 2) {
        document.getElementById('search-results').innerHTML = '';
        document.getElementById('search-suggestions').style.display = 'block';
        return;
    }

    document.getElementById('search-suggestions').style.display = 'none';
    lastSearchQuery = query;
    searchPage = 1;
    searchHasMore = true;

    searchTimeout = setTimeout(() => doSearch(query, false), 400);
}

async function doSearch(query, append) {
    if (searchLoading || (!searchHasMore && append)) return;
    searchLoading = true;

    const container = document.getElementById('search-results');
    if (!append) {
        container.innerHTML = renderSkeletonGrid(6);
    } else {
        removeLoadMore('search');
        appendLoadingIndicator(container);
    }

    try {
        const resp = await fetch(`${API_BASE}/search?query=${encodeURIComponent(query)}&page=${searchPage}`);
        const data = await resp.json();
        let items = extractItems(data);

        if (!items || items.length === 0) {
            searchHasMore = false;
            removeLoadingIndicator(container);
            if (!append) {
                container.innerHTML = '<div class="empty-state"><i class="fas fa-search"></i><p>Tidak ada hasil ditemukan</p></div>';
            }
            searchLoading = false;
            return;
        }

        if (items.length < 5) {
            searchHasMore = false;
        }

        if (append) {
            removeLoadingIndicator(container);
            const grid = container.querySelector('.content-grid');
            if (grid) {
                const startIdx = grid.children.length;
                grid.insertAdjacentHTML('beforeend', items.map((item, i) => renderDramaCard(item, startIdx + i)).join(''));
            }
        } else {
            container.innerHTML = '<div class="content-grid">' + items.map((item, i) => renderDramaCard(item, i)).join('') + '</div>';
        }

        searchPage++;
        if (searchHasMore) {
            appendLoadMoreButton(container, 'search');
        }
    } catch (e) {
        removeLoadingIndicator(container);
        if (!append) container.innerHTML = '<div class="empty-state"><i class="fas fa-exclamation-circle"></i><p>Pencarian gagal</p></div>';
    }
    searchLoading = false;
}

function loadMoreSearch() {
    doSearch(lastSearchQuery, true);
}

function clearSearch() {
    document.getElementById('search-input').value = '';
    document.getElementById('search-results').innerHTML = '';
    document.getElementById('search-suggestions').style.display = 'block';
}

async function openDrama(bookId, encodedTitle, encodedCover) {
    previousPage = document.querySelector('.page.active')?.id?.replace('page-', '') || 'home';
    showPage('detail');

    const container = document.getElementById('detail-content');
    container.innerHTML = `<div class="detail-skeleton">
        <div class="skeleton" style="width:100%;height:300px;border-radius:0"></div>
        <div style="padding:20px">
            <div class="skeleton" style="width:70%;height:24px;margin-bottom:12px"></div>
            <div class="skeleton" style="width:100%;height:14px;margin-bottom:8px"></div>
            <div class="skeleton" style="width:90%;height:14px;margin-bottom:8px"></div>
            <div class="skeleton" style="width:60%;height:14px"></div>
        </div>
    </div>`;

    try {
        const [detailResp, episodesResp] = await Promise.all([
            fetch(`${API_BASE}/detail?bookId=${bookId}`),
            fetch(`${API_BASE}/allepisode?bookId=${bookId}`)
        ]);

        const detailData = await detailResp.json();
        const episodesData = await episodesResp.json();

        let detail = detailData;
        if (detailData.data) {
            detail = typeof detailData.data === 'object' && !Array.isArray(detailData.data) ? detailData.data : detailData;
        } else if (detailData.result) {
            detail = typeof detailData.result === 'object' && !Array.isArray(detailData.result) ? detailData.result : detailData;
        }

        const rawSynopsis = detail.introduction || detail.description || detail.synopsis || detail.intro || detail.brief || detail.content || detail.bookInfo || '';
        const synopsis = rawSynopsis || 'Deskripsi tidak tersedia.';

        currentDrama = {
            bookId: bookId,
            title: detail.bookName || detail.name || detail.title || decodeURIComponent(encodedTitle),
            cover: detail.coverWap || detail.cover || detail.coverUrl || decodeURIComponent(encodedCover),
            synopsis: synopsis,
            tags: detail.tags || detail.tagList || detail.categoryList || []
        };

        let episodes = [];
        if (episodesData.data) {
            if (Array.isArray(episodesData.data)) {
                episodes = episodesData.data;
            } else {
                episodes = episodesData.data.episodeList || episodesData.data.list || episodesData.data.episodes || episodesData.data.chapterList || [];
            }
        } else if (Array.isArray(episodesData)) {
            episodes = episodesData;
        } else if (episodesData.result) {
            if (Array.isArray(episodesData.result)) {
                episodes = episodesData.result;
            } else {
                episodes = episodesData.result.episodeList || episodesData.result.list || episodesData.result.episodes || [];
            }
        }
        currentEpisodes = episodes;

        document.getElementById('detail-header-title').textContent = currentDrama.title;

        const isFav = await checkFavorite(bookId);
        const favBtn = document.getElementById('btn-fav');
        favBtn.innerHTML = isFav ? '<i class="fas fa-heart" style="color:#e50914"></i>' : '<i class="far fa-heart"></i>';

        let tagsHtml = '';
        if (currentDrama.tags && currentDrama.tags.length > 0) {
            const tagArr = Array.isArray(currentDrama.tags) ? currentDrama.tags :
                (typeof currentDrama.tags === 'string' ? currentDrama.tags.split(',') : []);
            tagsHtml = '<div class="detail-tags">' +
                tagArr.map(t => `<span class="detail-tag">${typeof t === 'object' ? (t.name || t.tagName || t.categoryName || '') : t}</span>`).join('') +
                '</div>';
        }

        const canPlayAll = userIsAdmin || userHasFullAccess;
        const freeLimit = 10;

        container.innerHTML = `
            <div class="detail-hero">
                <img class="detail-cover" src="${currentDrama.cover}" alt="${currentDrama.title}" onerror="this.style.display='none'">
                <div class="detail-cover-gradient"></div>
            </div>
            <div class="detail-info">
                <h2 class="detail-title">${currentDrama.title}</h2>
                ${tagsHtml}
                <p class="detail-synopsis collapsed" id="synopsis-text">${currentDrama.synopsis}</p>
                <button class="btn-expand" onclick="toggleSynopsis()"><i class="fas fa-chevron-down"></i> Selengkapnya</button>
            </div>
            <div class="episodes-section">
                <h3 class="section-title"><i class="fas fa-list" style="margin-right:8px;color:var(--accent)"></i>Episode (${episodes.length})</h3>
                ${!canPlayAll && episodes.length > freeLimit ? '<p class="episode-lock-info"><i class="fas fa-lock"></i> Episode 11+ memerlukan VIP atau referral (3 teman = 24 jam, 10 teman = 2 minggu)</p>' : ''}
                <div class="episode-grid">
                    ${episodes.map((ep, i) => {
                        const epNum = getEpNum(ep, i);
                        const isLocked = !canPlayAll && i >= freeLimit;
                        return `<button class="episode-btn ${isLocked ? 'locked' : ''}" onclick="playEpisode(${i})">
                            ${isLocked ? '<i class="fas fa-lock lock-icon"></i>' : ''}${epNum}
                        </button>`;
                    }).join('')}
                </div>
            </div>`;
    } catch (e) {
        console.error('Detail error:', e);
        container.innerHTML = '<div class="empty-state"><i class="fas fa-exclamation-circle"></i><p>Gagal memuat detail</p></div>';
    }
}

function toggleSynopsis() {
    const el = document.getElementById('synopsis-text');
    const btn = el.nextElementSibling;
    if (el.classList.contains('collapsed')) {
        el.classList.remove('collapsed');
        btn.innerHTML = '<i class="fas fa-chevron-up"></i> Tampilkan lebih sedikit';
    } else {
        el.classList.add('collapsed');
        btn.innerHTML = '<i class="fas fa-chevron-down"></i> Selengkapnya';
    }
}

function extractVideoUrl(ep) {
    if (ep.videoUrl || ep.url || ep.video || ep.playUrl) {
        return ep.videoUrl || ep.url || ep.video || ep.playUrl;
    }
    if (ep.cdnList && Array.isArray(ep.cdnList)) {
        const cdn = ep.cdnList.find(c => c.isDefault === 1) || ep.cdnList[0];
        if (cdn && cdn.videoPathList && Array.isArray(cdn.videoPathList)) {
            const vid = cdn.videoPathList.find(v => v.isDefault === 1) ||
                        cdn.videoPathList.find(v => v.quality === 720) ||
                        cdn.videoPathList.find(v => v.quality === 540) ||
                        cdn.videoPathList[0];
            if (vid && vid.videoPath) return vid.videoPath;
        }
    }
    return '';
}

function getEpNum(ep, index) {
    return ep.chapterName || ep.episodeNumber || ep.number || ep.idx || (index + 1);
}

async function playEpisode(index) {
    const ep = currentEpisodes[index];
    if (!ep) return;

    const freeLimit = 10;
    if (!userIsAdmin && !userHasFullAccess && index >= freeLimit) {
        showLockedModal();
        return;
    }

    const videoUrl = extractVideoUrl(ep);
    const epNum = getEpNum(ep, index);

    if (!videoUrl) {
        showToast('URL video tidak tersedia', 'error');
        return;
    }

    showPage('player');
    document.getElementById('player-title').textContent = `${currentDrama.title} - ${epNum}`;

    const player = document.getElementById('video-player');
    player.src = videoUrl;
    player.play().catch(() => {});

    const canPlayAll = userIsAdmin || userHasFullAccess;
    const epList = document.getElementById('episode-list');
    epList.innerHTML = `
        <h3 class="section-title">Semua Episode</h3>
        <div class="episode-grid">
            ${currentEpisodes.map((e, i) => {
                const n = getEpNum(e, i);
                const isLocked = !canPlayAll && i >= freeLimit;
                return `<button class="episode-btn ${i === index ? 'active' : ''} ${isLocked ? 'locked' : ''}" onclick="playEpisode(${i})">
                    ${isLocked ? '<i class="fas fa-lock lock-icon"></i>' : ''}${n}
                </button>`;
            }).join('')}
        </div>`;

    if (currentUser.telegram_id) {
        fetch('/api/history', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                telegram_id: currentUser.telegram_id,
                book_id: currentDrama.bookId,
                title: currentDrama.title,
                cover_url: currentDrama.cover,
                episode_number: epNum
            })
        }).catch(() => {});
    }
}

function showLockedModal() {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
    modal.innerHTML = `
        <div class="modal-content modal-enter">
            <div class="modal-body" style="text-align:center;padding:32px 24px;">
                <div class="locked-icon-wrapper">
                    <i class="fas fa-lock"></i>
                </div>
                <h3 style="margin-bottom:8px;font-size:20px">Episode Terkunci</h3>
                <p style="margin-bottom:20px;color:var(--text-secondary);font-size:14px">Episode ini memerlukan akses premium</p>
                <div class="locked-options">
                    <div class="locked-option">
                        <i class="fas fa-crown" style="color:#f59e0b"></i>
                        <div>
                            <strong>Upgrade VIP</strong>
                            <span>Akses semua episode tanpa batas</span>
                        </div>
                    </div>
                    <div class="locked-option">
                        <i class="fas fa-gift" style="color:#e50914"></i>
                        <div>
                            <strong>Undang 3 Teman = 24 Jam</strong>
                            <span>Atau 10 teman = akses 2 minggu gratis!</span>
                        </div>
                    </div>
                </div>
                <div class="modal-actions">
                    <button class="btn-ghost" onclick="this.closest('.modal-overlay').remove()">Tutup</button>
                    <button class="btn-primary" onclick="this.closest('.modal-overlay').remove();showPage('upgrade')"><i class="fas fa-crown"></i> Upgrade</button>
                </div>
            </div>
        </div>`;
    document.body.appendChild(modal);
}

async function checkFavorite(bookId) {
    if (!currentUser.telegram_id) return false;
    try {
        const resp = await fetch(`/api/favorites/${currentUser.telegram_id}`);
        const data = await resp.json();
        favorites = data;
        return data.some(f => f.book_id === bookId);
    } catch {
        return false;
    }
}

async function toggleFavorite() {
    if (!currentDrama || !currentUser.telegram_id) {
        showToast('Silakan login via Telegram', 'warning');
        return;
    }

    const isFav = favorites.some(f => f.book_id === currentDrama.bookId);
    const favBtn = document.getElementById('btn-fav');

    try {
        if (isFav) {
            await fetch('/api/favorites', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    telegram_id: currentUser.telegram_id,
                    book_id: currentDrama.bookId
                })
            });
            favorites = favorites.filter(f => f.book_id !== currentDrama.bookId);
            favBtn.innerHTML = '<i class="far fa-heart"></i>';
            showToast('Dihapus dari favorit', 'info');
        } else {
            await fetch('/api/favorites', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    telegram_id: currentUser.telegram_id,
                    book_id: currentDrama.bookId,
                    title: currentDrama.title,
                    cover_url: currentDrama.cover
                })
            });
            favorites.push({ book_id: currentDrama.bookId });
            favBtn.innerHTML = '<i class="fas fa-heart" style="color:#e50914"></i>';
            showToast('Ditambahkan ke favorit', 'success');
        }
    } catch (e) {
        showToast('Gagal memperbarui favorit', 'error');
    }
}

async function loadLibraryContent() {
    const container = document.getElementById('library-content');
    container.innerHTML = renderSkeletonGrid(6);

    if (!currentUser.telegram_id) {
        container.innerHTML = '<div class="empty-state"><i class="fas fa-user-lock"></i><p>Login via Telegram untuk melihat library</p></div>';
        return;
    }

    try {
        const endpoint = currentLibTab === 'history' ? 'history' : 'favorites';
        const resp = await fetch(`/api/${endpoint}/${currentUser.telegram_id}`);
        const data = await resp.json();

        if (!data || data.length === 0) {
            const icon = currentLibTab === 'history' ? 'fa-clock' : 'fa-heart';
            const text = currentLibTab === 'history' ? 'Belum ada riwayat tontonan' : 'Belum ada favorit';
            container.innerHTML = `<div class="empty-state"><i class="fas ${icon}"></i><p>${text}</p></div>`;
            return;
        }

        container.innerHTML = '<div class="content-grid">' +
            data.map((item, i) => {
                const id = item.book_id;
                const title = item.title || 'Tidak diketahui';
                const cover = item.cover_url || '';
                return `<div class="drama-card" style="animation-delay:${i * 0.04}s" onclick="openDrama('${id}', '${encodeURIComponent(title)}', '${encodeURIComponent(cover)}')">
                    <div class="card-img-wrapper">
                        <img src="${cover}" alt="${title}" loading="lazy" onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 300 400%22><rect fill=%22%23141414%22 width=%22300%22 height=%22400%22/><text fill=%22%23444%22 x=%22150%22 y=%22200%22 text-anchor=%22middle%22 font-size=%2214%22>No Image</text></svg>'">
                        <div class="card-overlay"><i class="fas fa-play"></i></div>
                    </div>
                    <div class="card-title">${title}${currentLibTab === 'history' && item.episode_number ? ' <span style="color:var(--accent)">Ep ${item.episode_number}</span>' : ''}</div>
                </div>`;
            }).join('') +
            '</div>';
    } catch (e) {
        container.innerHTML = '<div class="empty-state"><i class="fas fa-exclamation-circle"></i><p>Gagal memuat library</p></div>';
    }
}

function switchLibTab(el, tab) {
    currentLibTab = tab;
    document.querySelectorAll('#page-library .tab').forEach(t => t.classList.remove('active'));
    el.classList.add('active');
    loadLibraryContent();
}

async function loadProfile() {
    const container = document.getElementById('profile-content');

    let userData = currentUser;
    if (currentUser.telegram_id) {
        try {
            const resp = await fetch(`/api/user/${currentUser.telegram_id}`);
            const data = await resp.json();
            if (data.telegram_id) {
                userData = { ...currentUser, ...data };
                userIsAdmin = data.is_admin || false;
            }
        } catch {}
    }

    let referralData = { referral_count: 0, referrals_until_next_reward: 3, has_referral_access: false };
    if (currentUser.telegram_id) {
        try {
            const refResp = await fetch(`/api/referral/status/${currentUser.telegram_id}`);
            referralData = await refResp.json();
        } catch {}
    }

    const initial = (userData.first_name || 'G')[0].toUpperCase();
    const avatarUrl = userData.avatar_url || '';
    let botUsername = '';
    try {
        const botResp = await fetch('/api/bot/info');
        const botData = await botResp.json();
        botUsername = botData.username || '';
    } catch {}
    const refLink = botUsername ? `https://t.me/${botUsername}?start=ref_${userData.telegram_id}` : 'Bot belum dikonfigurasi';

    const avatarHtml = avatarUrl
        ? `<img src="${avatarUrl}" alt="Avatar" class="profile-avatar-img" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">`
            + `<div class="profile-avatar" style="display:none">${initial}</div>`
        : `<div class="profile-avatar">${initial}</div>`;

    const membershipLabel = userIsAdmin ? 'Admin' : (userData.membership || 'Free');
    const progressPercent = Math.min(100, ((referralData.referral_count % 3) / 3) * 100);
    const referralsNeeded = referralData.referrals_until_next_reward || 3;
    if (!referralData.referrals_until_2weeks && referralData.referrals_until_2weeks !== 0) {
        referralData.referrals_until_2weeks = Math.max(0, 10 - (referralData.referral_count || 0));
    }

    let referralAccessHtml = '';
    if (referralData.has_referral_access && referralData.referral_access_expires_at) {
        const expDate = new Date(referralData.referral_access_expires_at);
        referralAccessHtml = `
            <div class="referral-access-badge">
                <i class="fas fa-unlock"></i> Akses Penuh Aktif hingga ${expDate.toLocaleString('id-ID')}
            </div>`;
    }

    container.innerHTML = `
        <div class="profile-header">
            <div class="profile-avatar-wrapper">
                ${avatarHtml}
            </div>
            <div class="profile-info">
                <div class="profile-name">${userData.first_name || 'Guest'} ${userData.last_name || ''}</div>
                <div class="profile-username">@${userData.username || '-'}</div>
                <div class="membership-badge-inline ${membershipLabel === 'VIP' || membershipLabel === 'Admin' ? 'vip' : ''}">
                    <i class="fas ${membershipLabel === 'VIP' || membershipLabel === 'Admin' ? 'fa-crown' : 'fa-user'}"></i> ${membershipLabel}
                </div>
            </div>
        </div>

        <div class="stats-grid">
            <div class="stat-card">
                <div class="stat-value">${userData.points || 0}</div>
                <div class="stat-label">Poin</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">${userData.commission || 0}</div>
                <div class="stat-label">Komisi</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">${userData.referral_count || 0}</div>
                <div class="stat-label">Referral</div>
            </div>
        </div>

        ${membershipLabel !== 'Admin' ? `<div class="upgrade-banner" onclick="showPage('upgrade')">
            <div class="upgrade-banner-content">
                <i class="fas fa-crown"></i>
                <div>
                    <strong>Upgrade ke VIP</strong>
                    <span>Akses semua drama tanpa batas</span>
                </div>
            </div>
            <i class="fas fa-chevron-right"></i>
        </div>` : ''}

        <div class="referral-section">
            <div class="referral-header">
                <i class="fas fa-gift"></i>
                <h3>Sistem Referral</h3>
            </div>
            <p class="referral-desc">Undang 3 teman = 24 jam GRATIS! Undang 10 teman = 2 MINGGU GRATIS!</p>
            ${referralAccessHtml}
            <div class="referral-progress">
                <div class="referral-progress-info">
                    <span>${referralData.referral_count % 3}/3 referral</span>
                    <span>${referralsNeeded} lagi untuk 24 jam</span>
                </div>
                <div class="referral-progress-bar">
                    <div class="referral-progress-fill" style="width:${progressPercent}%"></div>
                </div>
            </div>
            <div class="referral-progress" style="margin-top:8px">
                <div class="referral-progress-info">
                    <span>${Math.min(referralData.referral_count, 10)}/10 referral</span>
                    <span>${referralData.referrals_until_2weeks > 0 ? referralData.referrals_until_2weeks + ' lagi untuk 2 minggu' : 'Tercapai!'}</span>
                </div>
                <div class="referral-progress-bar">
                    <div class="referral-progress-fill" style="width:${Math.min(100, (Math.min(referralData.referral_count, 10) / 10) * 100)}%;background:linear-gradient(135deg, #f5c518, #ff6b00)"></div>
                </div>
            </div>
            <div class="referral-link-box">
                <code id="ref-link">${refLink}</code>
                <button class="btn-copy" onclick="copyRefLink()"><i class="fas fa-copy"></i> Salin</button>
            </div>
        </div>

        <div class="menu-list">
            <div class="menu-item" onclick="showPage('help')">
                <i class="fas fa-headset"></i>
                <span>Pusat Bantuan</span>
                <i class="fas fa-chevron-right chevron"></i>
            </div>
            <div class="menu-item" onclick="showPage('settings')">
                <i class="fas fa-cog"></i>
                <span>Pengaturan</span>
                <i class="fas fa-chevron-right chevron"></i>
            </div>
            <div class="menu-item" onclick="showPage('about')">
                <i class="fas fa-info-circle"></i>
                <span>Tentang</span>
                <i class="fas fa-chevron-right chevron"></i>
            </div>
            ${userIsAdmin ? `<div class="menu-item" onclick="showMonthlyStats()">
                <i class="fas fa-chart-bar"></i>
                <span>Statistik Bulanan</span>
                <i class="fas fa-chevron-right chevron"></i>
            </div>` : ''}
        </div>`;
}

async function showMonthlyStats() {
    showPage('stats');
}

async function loadMonthlyStats() {
    const container = document.getElementById('stats-content');
    container.innerHTML = '<div class="loading-spinner"><div class="spinner"></div></div>';

    try {
        const resp = await fetch('/api/stats/monthly');
        const stats = await resp.json();

        container.innerHTML = `
            <div class="stats-month-title">
                <i class="fas fa-calendar-alt"></i> ${stats.month}
            </div>
            <div class="stats-grid stats-grid-admin">
                <div class="stat-card stat-card-highlight">
                    <div class="stat-icon"><i class="fas fa-users"></i></div>
                    <div class="stat-value">${stats.total_users}</div>
                    <div class="stat-label">Total User</div>
                </div>
                <div class="stat-card">
                    <div class="stat-icon"><i class="fas fa-user-plus"></i></div>
                    <div class="stat-value">${stats.new_users_this_month}</div>
                    <div class="stat-label">User Baru</div>
                </div>
                <div class="stat-card">
                    <div class="stat-icon"><i class="fas fa-signal"></i></div>
                    <div class="stat-value">${stats.active_users_this_month}</div>
                    <div class="stat-label">User Aktif</div>
                </div>
                <div class="stat-card stat-card-vip">
                    <div class="stat-icon"><i class="fas fa-crown"></i></div>
                    <div class="stat-value">${stats.vip_users}</div>
                    <div class="stat-label">User VIP</div>
                </div>
                <div class="stat-card">
                    <div class="stat-icon"><i class="fas fa-play-circle"></i></div>
                    <div class="stat-value">${stats.total_watches_this_month}</div>
                    <div class="stat-label">Tontonan</div>
                </div>
                <div class="stat-card">
                    <div class="stat-icon"><i class="fas fa-heart"></i></div>
                    <div class="stat-value">${stats.total_favorites_this_month}</div>
                    <div class="stat-label">Favorit</div>
                </div>
                <div class="stat-card">
                    <div class="stat-icon"><i class="fas fa-link"></i></div>
                    <div class="stat-value">${stats.total_referrals_this_month}</div>
                    <div class="stat-label">Referral</div>
                </div>
                <div class="stat-card stat-card-revenue">
                    <div class="stat-icon"><i class="fas fa-money-bill-wave"></i></div>
                    <div class="stat-value">Rp ${(stats.total_revenue_this_month || 0).toLocaleString('id-ID')}</div>
                    <div class="stat-label">Pendapatan</div>
                </div>
                <div class="stat-card">
                    <div class="stat-icon"><i class="fas fa-receipt"></i></div>
                    <div class="stat-value">${stats.total_transactions_this_month}</div>
                    <div class="stat-label">Transaksi</div>
                </div>
                <div class="stat-card">
                    <div class="stat-icon"><i class="fas fa-flag"></i></div>
                    <div class="stat-value">${stats.total_reports_this_month}</div>
                    <div class="stat-label">Laporan</div>
                </div>
            </div>
            ${stats.daily_signups && stats.daily_signups.length > 0 ? `
            <div class="daily-signups-section">
                <h3><i class="fas fa-chart-line"></i> Pendaftaran Harian</h3>
                <div class="daily-signups-list">
                    ${stats.daily_signups.map(d => `
                        <div class="daily-signup-item">
                            <span class="daily-date">${new Date(d.date).toLocaleDateString('id-ID', {day: 'numeric', month: 'short'})}</span>
                            <div class="daily-bar-container">
                                <div class="daily-bar" style="width: ${Math.min(100, (d.count / Math.max(...stats.daily_signups.map(s => s.count))) * 100)}%"></div>
                            </div>
                            <span class="daily-count">${d.count}</span>
                        </div>
                    `).join('')}
                </div>
            </div>` : ''}
        `;
    } catch (e) {
        container.innerHTML = '<div class="empty-state"><i class="fas fa-exclamation-circle"></i><p>Gagal memuat statistik</p></div>';
    }
}

function copyRefLink() {
    const link = document.getElementById('ref-link').textContent;
    navigator.clipboard.writeText(link).then(() => {
        showToast('Link referral disalin!', 'success');
    }).catch(() => {
        const textarea = document.createElement('textarea');
        textarea.value = link;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        showToast('Link referral disalin!', 'success');
    });
}

async function submitReport() {
    const type = document.getElementById('issue-type').value;
    const desc = document.getElementById('issue-desc').value;

    if (!type) { showToast('Pilih jenis masalah', 'warning'); return; }
    if (!desc) { showToast('Jelaskan masalahnya', 'warning'); return; }

    try {
        await fetch('/api/report', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                telegram_id: currentUser.telegram_id,
                issue_type: type,
                description: desc
            })
        });
        showToast('Laporan berhasil dikirim!', 'success');
        document.getElementById('issue-type').value = '';
        document.getElementById('issue-desc').value = '';
        setTimeout(() => showPage('profile'), 1000);
    } catch {
        showToast('Gagal mengirim laporan', 'error');
    }
}

async function showRandomDrama() {
    try {
        const resp = await fetch(`${API_BASE}/foryou?page=${Math.floor(Math.random() * 5) + 1}`);
        const data = await resp.json();
        let items = extractItems(data);

        if (!items || items.length === 0) {
            showToast('Gagal mendapatkan drama acak', 'error');
            return;
        }

        const drama = items[Math.floor(Math.random() * items.length)];
        const id = drama.bookId || drama.id || '';
        const title = drama.bookName || drama.name || drama.title || 'Tidak diketahui';
        const cover = drama.coverWap || drama.cover || drama.coverUrl || '';
        const synopsis = drama.introduction || drama.description || drama.synopsis || drama.intro || drama.brief || '';

        if (!id) {
            showToast('Gagal mendapatkan drama acak', 'error');
            return;
        }

        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
        modal.innerHTML = `
            <div class="modal-content modal-enter">
                <img src="${cover}" alt="${title}" onerror="this.style.display='none'" style="width:100%;height:220px;object-fit:cover;border-radius:16px 16px 0 0">
                <div class="modal-body">
                    <h3 style="font-size:18px;margin-bottom:8px">${title}</h3>
                    <p style="font-size:13px;color:var(--text-secondary);line-height:1.5;margin-bottom:16px;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden">${synopsis || 'Drama China pilihan acak untukmu!'}</p>
                    <div class="modal-actions">
                        <button class="btn-ghost" onclick="this.closest('.modal-overlay').remove()">Tutup</button>
                        <button class="btn-primary" onclick="this.closest('.modal-overlay').remove();openDrama('${id}','${encodeURIComponent(title)}','${encodeURIComponent(cover)}')"><i class="fas fa-play"></i> Tonton</button>
                    </div>
                </div>
            </div>`;
        document.body.appendChild(modal);
    } catch {
        showToast('Gagal mendapatkan drama acak', 'error');
    }
}

function showToast(msg, type = 'info') {
    const toast = document.getElementById('toast');
    const icons = { success: 'fa-check-circle', error: 'fa-exclamation-circle', warning: 'fa-exclamation-triangle', info: 'fa-info-circle' };
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `<i class="fas ${icons[type] || icons.info}"></i><span>${msg}</span>`;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 3000);
}

async function loadSettings() {
    const container = document.getElementById('settings-content');
    if (!currentUser.telegram_id) {
        container.innerHTML = '<div class="empty-state"><i class="fas fa-user-lock"></i><p>Login via Telegram untuk mengakses pengaturan</p></div>';
        return;
    }

    try {
        const resp = await fetch(`/api/settings/${currentUser.telegram_id}`);
        const settings = await resp.json();

        container.innerHTML = `
            <div class="settings-group">
                <h3 class="settings-group-title">Umum</h3>
                <div class="settings-item">
                    <div class="settings-item-info">
                        <i class="fas fa-globe"></i>
                        <div>
                            <div class="settings-item-name">Bahasa</div>
                            <div class="settings-item-desc">Pilih bahasa aplikasi</div>
                        </div>
                    </div>
                    <select class="settings-select" id="setting-language" onchange="updateSetting('language', this.value)">
                        <option value="id" ${settings.language === 'id' ? 'selected' : ''}>Indonesia</option>
                        <option value="en" ${settings.language === 'en' ? 'selected' : ''}>English</option>
                    </select>
                </div>
                <div class="settings-item">
                    <div class="settings-item-info">
                        <i class="fas fa-bell"></i>
                        <div>
                            <div class="settings-item-name">Notifikasi</div>
                            <div class="settings-item-desc">Aktifkan notifikasi push</div>
                        </div>
                    </div>
                    <label class="toggle-switch">
                        <input type="checkbox" id="setting-notifications" ${settings.notifications_enabled ? 'checked' : ''} onchange="updateSetting('notifications_enabled', this.checked)">
                        <span class="toggle-slider"></span>
                    </label>
                </div>
            </div>
            <div class="settings-group">
                <h3 class="settings-group-title">Data</h3>
                <div class="settings-item clickable" onclick="clearWatchHistory()">
                    <div class="settings-item-info">
                        <i class="fas fa-trash-alt" style="color:var(--danger)"></i>
                        <div>
                            <div class="settings-item-name" style="color:var(--danger)">Hapus Riwayat Tontonan</div>
                            <div class="settings-item-desc">Hapus semua riwayat menonton drama</div>
                        </div>
                    </div>
                    <i class="fas fa-chevron-right" style="color:var(--text-muted)"></i>
                </div>
            </div>
            <div class="settings-group">
                <h3 class="settings-group-title">Akun</h3>
                <div class="settings-item">
                    <div class="settings-item-info">
                        <i class="fas fa-id-badge"></i>
                        <div>
                            <div class="settings-item-name">Telegram ID</div>
                            <div class="settings-item-desc">${currentUser.telegram_id}</div>
                        </div>
                    </div>
                </div>
                <div class="settings-item">
                    <div class="settings-item-info">
                        <i class="fas fa-crown"></i>
                        <div>
                            <div class="settings-item-name">Keanggotaan</div>
                            <div class="settings-item-desc">${userIsAdmin ? 'Admin' : (settings.membership || 'Free')}</div>
                        </div>
                    </div>
                </div>
            </div>`;
    } catch (e) {
        container.innerHTML = '<div class="empty-state"><i class="fas fa-exclamation-circle"></i><p>Gagal memuat pengaturan</p></div>';
    }
}

async function updateSetting(key, value) {
    try {
        await fetch(`/api/settings/${currentUser.telegram_id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ [key]: value })
        });
        showToast('Pengaturan disimpan!', 'success');
    } catch {
        showToast('Gagal menyimpan pengaturan', 'error');
    }
}

async function clearWatchHistory() {
    if (!confirm('Yakin ingin menghapus semua riwayat tontonan?')) return;
    try {
        await fetch(`/api/history/${currentUser.telegram_id}`, {
            method: 'DELETE'
        });
        showToast('Riwayat tontonan dihapus!', 'success');
    } catch {
        showToast('Gagal menghapus riwayat', 'error');
    }
}

function selectPlan(el, plan) {
    document.querySelectorAll('.pricing-item').forEach(p => {
        p.classList.remove('selected');
    });
    el.classList.add('selected');
}

function copyTelegramId() {
    const id = currentUser.telegram_id;
    if (!id) return;
    navigator.clipboard.writeText(String(id)).then(() => {
        showToast('Telegram ID disalin!', 'success');
    }).catch(() => {
        const textarea = document.createElement('textarea');
        textarea.value = String(id);
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        showToast('Telegram ID disalin!', 'success');
    });
}

function loadUpgradePage() {
    const idEl = document.getElementById('user-tg-id');
    if (idEl) idEl.textContent = currentUser.telegram_id || '-';

    const statusEl = document.getElementById('upgrade-status');
    if (statusEl && (currentUser.membership === 'VIP' || userIsAdmin)) {
        statusEl.innerHTML = '<div class="vip-active-badge"><i class="fas fa-check-circle"></i> Kamu sudah memiliki akses penuh!</div>';
    } else if (statusEl && currentUser.has_referral_access) {
        statusEl.innerHTML = '<div class="vip-active-badge"><i class="fas fa-clock"></i> Akses referral aktif (24 jam)</div>';
    } else if (statusEl) {
        statusEl.innerHTML = '';
    }
}

let isCustomFullscreen = false;

function toggleCustomFullscreen() {
    const container = document.getElementById('player-container');
    const btn = document.getElementById('btn-fullscreen');
    const video = document.getElementById('video-player');

    if (!isCustomFullscreen) {
        container.classList.add('fullscreen-mode');
        btn.innerHTML = '<i class="fas fa-compress"></i>';
        isCustomFullscreen = true;

        document.body.style.overflow = 'hidden';

        if (screen.orientation && screen.orientation.lock) {
            screen.orientation.lock('landscape').catch(() => {});
        }
    } else {
        exitCustomFullscreen();
    }
}

function exitCustomFullscreen() {
    const container = document.getElementById('player-container');
    const btn = document.getElementById('btn-fullscreen');

    container.classList.remove('fullscreen-mode', 'landscape');
    btn.innerHTML = '<i class="fas fa-expand"></i>';
    isCustomFullscreen = false;

    document.body.style.overflow = '';

    if (screen.orientation && screen.orientation.unlock) {
        screen.orientation.unlock();
    }
}

document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape' && isCustomFullscreen) {
        exitCustomFullscreen();
    }
});

document.addEventListener('DOMContentLoaded', initApp);
