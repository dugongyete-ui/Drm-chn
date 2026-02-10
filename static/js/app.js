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

const tg = window.Telegram?.WebApp;

function initApp() {
    if (tg) {
        tg.ready();
        tg.expand();
        tg.setHeaderColor('#0b1426');
        tg.setBackgroundColor('#0b1426');

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
        }

        const startParam = tg?.initDataUnsafe?.start_param;
        if (startParam && startParam.startsWith('ref_')) {
            await fetch('/api/referral', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    telegram_id: currentUser.telegram_id,
                    ref_code: startParam
                })
            });
        }
    } catch (e) {
        console.error('Register error:', e);
    }
}

function showPage(pageId) {
    const navPages = ['home', 'library', 'profile'];
    if (navPages.includes(pageId)) {
        previousPage = 'home';
    }

    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById('page-' + pageId).classList.add('active');

    const nav = document.getElementById('bottom-nav');
    const hiddenPages = ['search', 'detail', 'player', 'help', 'settings', 'about', 'upgrade'];
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
    if (pageId === 'search') {
        setTimeout(() => document.getElementById('search-input')?.focus(), 100);
    }
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
        container.innerHTML = '<div class="loading-spinner"><div class="spinner"></div></div>';
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
            if (!append) container.innerHTML = '<div class="empty-state"><i class="fas fa-exclamation-circle"></i><p>Failed to parse data</p></div>';
            homeLoading = false;
            return;
        }

        let items = extractItems(data);

        if (!items || items.length === 0) {
            homeHasMore = false;
            removeLoadingIndicator(container);
            if (!append) {
                container.innerHTML = '<div class="empty-state"><i class="fas fa-film"></i><p>No dramas found</p></div>';
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
            container.innerHTML = '<div class="content-grid" style="padding:0;">' +
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
        if (!append) container.innerHTML = '<div class="empty-state"><i class="fas fa-exclamation-circle"></i><p>Failed to load: ' + e.message + '</p></div>';
    }
    homeLoading = false;
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
        '"><i class="fas fa-arrow-down"></i> Load More</button>';
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
    const title = item.bookName || item.name || item.title || 'Unknown';
    const cover = item.coverWap || item.cover || item.coverUrl || item.image || '';

    return `<div class="drama-card" style="animation-delay:${index * 0.05}s" onclick="openDrama('${id}', '${encodeURIComponent(title)}', '${encodeURIComponent(cover)}')">
        <img src="${cover}" alt="${title}" loading="lazy" onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 300 400%22><rect fill=%22%231a2332%22 width=%22300%22 height=%22400%22/><text fill=%22%2364748b%22 x=%22150%22 y=%22200%22 text-anchor=%22middle%22 font-size=%2214%22>No Image</text></svg>'">
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
                <div class="suggestion-title">Popular Searches</div>
                <div class="suggestion-tags">
                    ${keywords.map(k => {
                        const word = typeof k === 'string' ? k : (k.keyword || k.name || k.word || '');
                        return `<span class="suggestion-tag" onclick="searchFor('${word}')">${word}</span>`;
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
        container.innerHTML = '<div class="loading-spinner"><div class="spinner"></div></div>';
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
                container.innerHTML = '<div class="empty-state"><i class="fas fa-search"></i><p>No results found</p></div>';
            }
            searchLoading = false;
            return;
        }

        if (items.length < 5) {
            searchHasMore = false;
        }

        if (append) {
            removeLoadingIndicator(container);
            const startIdx = container.querySelectorAll('.drama-card').length;
            const wrapper = document.createElement('div');
            wrapper.innerHTML = items.map((item, i) => renderDramaCard(item, startIdx + i)).join('');
            while (wrapper.firstChild) {
                container.insertBefore(wrapper.firstChild, container.querySelector('[data-loadmore]'));
            }
        } else {
            container.innerHTML = items.map((item, i) => renderDramaCard(item, i)).join('');
        }

        searchPage++;
        if (searchHasMore) {
            appendLoadMoreButton(container, 'search');
        }
    } catch (e) {
        removeLoadingIndicator(container);
        if (!append) container.innerHTML = '<div class="empty-state"><i class="fas fa-exclamation-circle"></i><p>Search failed</p></div>';
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
    container.innerHTML = '<div class="loading-spinner"><div class="spinner"></div></div>';

    try {
        const [detailResp, episodesResp] = await Promise.all([
            fetch(`${API_BASE}/detail?bookId=${bookId}`),
            fetch(`${API_BASE}/allepisode?bookId=${bookId}`)
        ]);

        const detailData = await detailResp.json();
        const episodesData = await episodesResp.json();

        const detail = detailData.data || detailData.result || detailData;
        currentDrama = {
            bookId: bookId,
            title: detail.bookName || detail.name || decodeURIComponent(encodedTitle),
            cover: detail.coverWap || detail.cover || decodeURIComponent(encodedCover),
            synopsis: detail.description || detail.synopsis || detail.intro || 'No description available.',
            tags: detail.tags || detail.tagList || []
        };

        let episodes = [];
        if (episodesData.data) {
            episodes = Array.isArray(episodesData.data) ? episodesData.data :
                (episodesData.data.episodeList || episodesData.data.list || episodesData.data.episodes || []);
        } else if (Array.isArray(episodesData)) {
            episodes = episodesData;
        } else if (episodesData.result) {
            episodes = Array.isArray(episodesData.result) ? episodesData.result : [];
        }
        currentEpisodes = episodes;

        document.getElementById('detail-header-title').textContent = currentDrama.title;

        const isFav = await checkFavorite(bookId);
        const favBtn = document.getElementById('btn-fav');
        favBtn.innerHTML = isFav ? '<i class="fas fa-heart" style="color:#ef4444"></i>' : '<i class="far fa-heart"></i>';

        let tagsHtml = '';
        if (currentDrama.tags && currentDrama.tags.length > 0) {
            const tagArr = Array.isArray(currentDrama.tags) ? currentDrama.tags :
                (typeof currentDrama.tags === 'string' ? currentDrama.tags.split(',') : []);
            tagsHtml = '<div class="detail-tags">' +
                tagArr.map(t => `<span class="detail-tag">${typeof t === 'object' ? (t.name || t.tagName || '') : t}</span>`).join('') +
                '</div>';
        }

        container.innerHTML = `
            <img class="detail-cover" src="${currentDrama.cover}" alt="${currentDrama.title}" onerror="this.style.display='none'">
            <div class="detail-info">
                <h2 class="detail-title">${currentDrama.title}</h2>
                ${tagsHtml}
                <p class="detail-synopsis collapsed" id="synopsis-text">${currentDrama.synopsis}</p>
                <button class="btn-expand" onclick="toggleSynopsis()">Read more</button>
            </div>
            <div class="episodes-section">
                <h3 class="section-title">Episodes (${episodes.length})</h3>
                <div class="episode-grid">
                    ${episodes.map((ep, i) => {
                        const epNum = getEpNum(ep, i);
                        return `<button class="episode-btn" onclick="playEpisode(${i})">${epNum}</button>`;
                    }).join('')}
                </div>
            </div>`;
    } catch (e) {
        console.error('Detail error:', e);
        container.innerHTML = '<div class="empty-state"><i class="fas fa-exclamation-circle"></i><p>Failed to load details</p></div>';
    }
}

function toggleSynopsis() {
    const el = document.getElementById('synopsis-text');
    const btn = el.nextElementSibling;
    if (el.classList.contains('collapsed')) {
        el.classList.remove('collapsed');
        btn.textContent = 'Show less';
    } else {
        el.classList.add('collapsed');
        btn.textContent = 'Read more';
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

    const videoUrl = extractVideoUrl(ep);
    const epNum = getEpNum(ep, index);

    if (!videoUrl) {
        showToast('Video URL not available');
        return;
    }

    showPage('player');
    document.getElementById('player-title').textContent = `${currentDrama.title} - ${epNum}`;

    const player = document.getElementById('video-player');
    player.src = videoUrl;
    player.play().catch(() => {});

    const epList = document.getElementById('episode-list');
    epList.innerHTML = `
        <h3 class="section-title">All Episodes</h3>
        <div class="episode-grid">
            ${currentEpisodes.map((e, i) => {
                const n = getEpNum(e, i);
                return `<button class="episode-btn ${i === index ? 'active' : ''}" onclick="playEpisode(${i})">${n}</button>`;
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
        showToast('Please login via Telegram');
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
            showToast('Removed from favorites');
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
            favBtn.innerHTML = '<i class="fas fa-heart" style="color:#ef4444"></i>';
            showToast('Added to favorites');
        }
    } catch (e) {
        showToast('Failed to update favorites');
    }
}

async function loadLibraryContent() {
    const container = document.getElementById('library-content');
    container.innerHTML = '<div class="loading-spinner"><div class="spinner"></div></div>';

    if (!currentUser.telegram_id) {
        container.innerHTML = '<div class="empty-state"><i class="fas fa-user-lock"></i><p>Login via Telegram to see your library</p></div>';
        return;
    }

    try {
        const endpoint = currentLibTab === 'history' ? 'history' : 'favorites';
        const resp = await fetch(`/api/${endpoint}/${currentUser.telegram_id}`);
        const data = await resp.json();

        if (!data || data.length === 0) {
            const icon = currentLibTab === 'history' ? 'fa-clock' : 'fa-heart';
            const text = currentLibTab === 'history' ? 'No watch history yet' : 'No favorites yet';
            container.innerHTML = `<div class="empty-state"><i class="fas ${icon}"></i><p>${text}</p></div>`;
            return;
        }

        container.innerHTML = '<div class="content-grid" style="padding:0;">' +
            data.map((item, i) => {
                const id = item.book_id;
                const title = item.title || 'Unknown';
                const cover = item.cover_url || '';
                return `<div class="drama-card" style="animation-delay:${i * 0.05}s" onclick="openDrama('${id}', '${encodeURIComponent(title)}', '${encodeURIComponent(cover)}')">
                    <img src="${cover}" alt="${title}" loading="lazy" onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 300 400%22><rect fill=%22%231a2332%22 width=%22300%22 height=%22400%22/><text fill=%22%2364748b%22 x=%22150%22 y=%22200%22 text-anchor=%22middle%22 font-size=%2214%22>No Image</text></svg>'">
                    <div class="card-title">${title}${currentLibTab === 'history' && item.episode_number ? ' <span style="color:var(--accent)">Ep ${item.episode_number}</span>' : ''}</div>
                </div>`;
            }).join('') +
            '</div>';
    } catch (e) {
        container.innerHTML = '<div class="empty-state"><i class="fas fa-exclamation-circle"></i><p>Failed to load library</p></div>';
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
            if (data.telegram_id) userData = { ...currentUser, ...data };
        } catch {}
    }

    const initial = (userData.first_name || 'G')[0].toUpperCase();
    const botUsername = 'DramaBoxBot';
    const refLink = `https://t.me/${botUsername}?start=ref_${userData.telegram_id}`;

    container.innerHTML = `
        <div class="profile-header">
            <div class="profile-avatar">${initial}</div>
            <div>
                <div class="profile-name">${userData.first_name || 'Guest'} ${userData.last_name || ''}</div>
                <div class="profile-id">ID: ${userData.telegram_id || '-'}</div>
            </div>
        </div>

        <div class="stats-grid">
            <div class="stat-card">
                <div class="stat-value">${userData.points || 0}</div>
                <div class="stat-label">Points</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">${userData.commission || 0}</div>
                <div class="stat-label">Commission</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">${userData.referral_count || 0}</div>
                <div class="stat-label">Referrals</div>
            </div>
        </div>

        <div class="membership-card">
            <div class="membership-status">
                <span>Membership</span>
                <span class="membership-badge ${userData.membership === 'VIP' ? 'vip' : ''}">${userData.membership || 'Free'} Member</span>
            </div>
            <button class="btn-primary btn-full" onclick="showPage('upgrade')">
                <i class="fas fa-crown"></i> Upgrade to VIP
            </button>
        </div>

        <div class="pricing-grid">
            <div class="pricing-card featured">
                <div class="pricing-name">Lifetime</div>
                <div class="pricing-price">$29.99</div>
                <div class="pricing-period">one-time</div>
            </div>
            <div class="pricing-card">
                <div class="pricing-name">1 Year</div>
                <div class="pricing-price">$14.99</div>
                <div class="pricing-period">/year</div>
            </div>
        </div>

        <div class="referral-section">
            <h3 class="section-title">Referral Link</h3>
            <p style="font-size:13px;color:var(--text-secondary);margin-bottom:8px">Share & earn 100 points per referral!</p>
            <div class="referral-link">
                <code id="ref-link">${refLink}</code>
                <button class="btn-copy" onclick="copyRefLink()">Copy</button>
            </div>
        </div>

        <div class="menu-list">
            <div class="menu-item" onclick="showPage('help')">
                <i class="fas fa-headset"></i>
                <span>Help Center</span>
                <i class="fas fa-chevron-right chevron"></i>
            </div>
            <div class="menu-item" onclick="showPage('settings')">
                <i class="fas fa-cog"></i>
                <span>Settings</span>
                <i class="fas fa-chevron-right chevron"></i>
            </div>
            <div class="menu-item" onclick="showPage('about')">
                <i class="fas fa-info-circle"></i>
                <span>About</span>
                <i class="fas fa-chevron-right chevron"></i>
            </div>
        </div>`;
}

function copyRefLink() {
    const link = document.getElementById('ref-link').textContent;
    navigator.clipboard.writeText(link).then(() => {
        showToast('Link copied!');
    }).catch(() => {
        const textarea = document.createElement('textarea');
        textarea.value = link;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        showToast('Link copied!');
    });
}

async function submitReport() {
    const type = document.getElementById('issue-type').value;
    const desc = document.getElementById('issue-desc').value;

    if (!type) { showToast('Please select issue type'); return; }
    if (!desc) { showToast('Please describe the issue'); return; }

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
        showToast('Report sent successfully!');
        document.getElementById('issue-type').value = '';
        document.getElementById('issue-desc').value = '';
        setTimeout(() => showPage('profile'), 1000);
    } catch {
        showToast('Failed to send report');
    }
}

async function showRandomDrama() {
    try {
        const resp = await fetch(`${API_BASE}/randomdrama`);
        const data = await resp.json();
        const drama = data.data || data.result || data;

        if (!drama) { showToast('Failed to get random drama'); return; }

        const id = drama.bookId || drama.id || '';
        const title = drama.bookName || drama.name || drama.title || 'Unknown';
        const cover = drama.coverWap || drama.cover || '';
        const synopsis = drama.description || drama.synopsis || drama.intro || '';

        const modal = document.createElement('div');
        modal.className = 'random-modal';
        modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
        modal.innerHTML = `
            <div class="random-modal-content">
                <img src="${cover}" alt="${title}" onerror="this.style.display='none'">
                <div class="random-modal-body">
                    <h3>${title}</h3>
                    <p>${synopsis}</p>
                    <div class="random-modal-actions">
                        <button class="btn-secondary" onclick="this.closest('.random-modal').remove()">Close</button>
                        <button class="btn-primary" onclick="this.closest('.random-modal').remove();openDrama('${id}','${encodeURIComponent(title)}','${encodeURIComponent(cover)}')">Watch</button>
                    </div>
                </div>
            </div>`;
        document.body.appendChild(modal);
    } catch {
        showToast('Failed to get random drama');
    }
}

function showToast(msg) {
    const toast = document.getElementById('toast');
    toast.textContent = msg;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 2500);
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
                            <div class="settings-item-name">Membership</div>
                            <div class="settings-item-desc">${settings.membership || 'Free'}</div>
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
        showToast('Pengaturan disimpan!');
    } catch {
        showToast('Gagal menyimpan pengaturan');
    }
}

async function clearWatchHistory() {
    if (!confirm('Yakin ingin menghapus semua riwayat tontonan?')) return;
    try {
        await fetch(`/api/history/${currentUser.telegram_id}`, {
            method: 'DELETE'
        });
        showToast('Riwayat tontonan dihapus!');
    } catch {
        showToast('Gagal menghapus riwayat');
    }
}

function selectPlan(el, plan) {
    document.querySelectorAll('.pricing-item').forEach(p => p.classList.remove('selected'));
    el.classList.add('selected');
}

function copyTelegramId() {
    const id = currentUser.telegram_id;
    if (!id) return;
    navigator.clipboard.writeText(String(id)).then(() => {
        showToast('Telegram ID disalin!');
    }).catch(() => {
        const textarea = document.createElement('textarea');
        textarea.value = String(id);
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        showToast('Telegram ID disalin!');
    });
}

function loadUpgradePage() {
    const idEl = document.getElementById('user-tg-id');
    if (idEl) idEl.textContent = currentUser.telegram_id || '-';

    const statusEl = document.getElementById('upgrade-status');
    if (statusEl && currentUser.membership === 'VIP') {
        statusEl.innerHTML = '<div class="vip-active-badge"><i class="fas fa-check-circle"></i> Kamu sudah VIP Member!</div>';
    } else if (statusEl) {
        statusEl.innerHTML = '';
    }
}

document.addEventListener('DOMContentLoaded', initApp);
