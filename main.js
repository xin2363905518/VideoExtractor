// ==UserScript==
// @name         视频提取器
// @namespace   https://github.com/example/video-extractor
// @version      1.0.37
// @description  提取页面中的视频到独立播放器中播放，支持直链/HLS/DASH，并支持 blob 直播流的浮层播放（含网页全屏、拖拽、缩放，自定义控制栏）
// @author       Reasonix
// @match        *://*/*
// @grant        GM_registerMenuCommand
// @grant        GM_addStyle
// @run-at       document-end
// @license MIT
// @downloadURL https://update.greasyfork.org/scripts/589313/%E8%A7%86%E9%A2%91%E6%8F%90%E5%8F%96%E5%99%A8.user.js
// @updateURL https://update.greasyfork.org/scripts/589313/%E8%A7%86%E9%A2%91%E6%8F%90%E5%8F%96%E5%99%A8.meta.js
// ==/UserScript==

(function () {
    'use strict';

    // ========== 开关管理 ==========
    const STORAGE_KEY = 'videoExtractor_enabled';
    function isEnabled() { return sessionStorage.getItem(STORAGE_KEY) === 'true'; }
    function setEnabled(val) { sessionStorage.setItem(STORAGE_KEY, val ? 'true' : 'false'); }
    function toggleEnabled() {
        const next = !isEnabled();
        setEnabled(next);
        if (next) {
            removeAllIcons();
            scanAndInject();
        } else {
            removeAllIcons();
        }
        alert('视频提取器：已' + (next ? '开启' : '关闭'));
    }
    try {
        GM_registerMenuCommand('切换 视频提取器', toggleEnabled);
    } catch (e) {
        console.error('菜单注册失败：', e);
    }

    // ========== 全局 CSS ==========
    const CSS = `
.video-extractor-icon {
    position: fixed !important;
    width: 36px !important;
    height: 36px !important;
    border-radius: 50% !important;
    background: rgba(0,0,0,0.55) !important;
    color: #fff !important;
    font-size: 18px !important;
    cursor: pointer !important;
    z-index: 2147483647 !important;
    border: 2px solid rgba(255,255,255,0.5) !important;
    transition: background 0.2s, transform 0.2s !important;
    user-select: none !important;
    -webkit-user-select: none !important;
    pointer-events: auto !important;
    overflow: hidden !important;
    line-height: normal !important;
}
.video-extractor-icon:hover {
    background: rgba(0,0,0,0.8) !important;
    transform: scale(1.15) !important;
    border-color: rgba(255,255,255,0.9) !important;
}
.video-extractor-icon svg {
    position: absolute !important;
    top: 50% !important;
    left: 50% !important;
    transform: translate(-50%, -50%) !important;
    width: 20px !important;
    height: 20px !important;
    margin: 0 !important;
    vertical-align: baseline !important;
    display: block !important;
}

.ve-overlay { position: fixed; top:0; left:0; right:0; bottom:0; background: rgba(0,0,0,0.8); z-index: 999999; display: flex; align-items: center; justify-content: center; }
.ve-player-container { position: relative; width: 80%; height: 80%; min-width: 320px; min-height: 240px; background: #000; border-radius: 8px; box-shadow: 0 0 30px rgba(0,0,0,0.7); overflow: hidden; resize: both; transition: width 0.3s, height 0.3s, border-radius 0.3s; }
.ve-video-holder { position: absolute; top:0; left:0; width:100%; height:100%; display: flex; align-items: center; justify-content: center; transform-origin: center center; will-change: transform; }
.ve-video-holder video { width:100%; height:100%; object-fit: contain; display: block; }
.ve-btn { position: absolute; top: 10px; width: 40px; height: 40px; border-radius: 50%; background: rgba(0,0,0,0.7); color: #fff; font-size: 20px; line-height: 40px; text-align: center; cursor: pointer; z-index: 1000; border: 2px solid rgba(255,255,255,0.5); transition: background 0.2s, transform 0.2s; user-select: none; padding: 0; }
.ve-btn:hover { background: rgba(255,255,255,0.3); transform: scale(1.1); }
.ve-close-btn { right: 10px; }
.ve-close-btn:hover { background: rgba(255,0,0,0.8); }
.ve-fullscreen-btn { right: 60px; }
.ve-webfullscreen-btn { right: 110px; }

.ve-custom-controls { position: absolute; bottom: 0; left: 0; right: 0; height: 50px; background: linear-gradient(to top, rgba(0,0,0,0.9), rgba(0,0,0,0.3)); display: flex; align-items: center; padding: 0 15px; z-index: 1001; opacity: 0; transform: translateY(100%); transition: opacity 0.3s ease, transform 0.3s ease; pointer-events: none; }
.ve-custom-controls.active { opacity: 1; transform: translateY(0); pointer-events: auto; }
.ve-custom-controls button { background: none; border: none; color: #fff; font-size: 18px; cursor: pointer; margin-right: 10px; padding: 5px; flex: none; }
.ve-time { color: #fff; font-size: 13px; margin: 0 8px; white-space: nowrap; flex: none; }
.ve-progress-container { display: flex; align-items: center; flex: 3; min-width: 0; }
.ve-volume-container { display: flex; align-items: center; flex: 1; min-width: 0; }
.ve-custom-controls input[type="range"] { -webkit-appearance: none; appearance: none; background: rgba(255,255,255,0.3); height: 4px; border-radius: 2px; outline: none; cursor: pointer; }
.ve-progress-slider, .ve-volume-slider { flex: 1; margin: 0 5px; }
.ve-custom-controls input[type="range"]::-webkit-slider-thumb { -webkit-appearance: none; appearance: none; width: 14px; height: 14px; border-radius: 50%; background: #fff; cursor: pointer; }
.ve-volume-icon { font-size: 18px; margin: 0 5px; flex: none; }
`;
    try {
        GM_addStyle(CSS);
    } catch (e) {
        console.error('添加样式失败：', e);
    }

    // ========== 工具函数 ==========
    function isProcessed(video) { return video.dataset.videoExtractorProcessed === '1'; }
    function markProcessed(video) { video.dataset.videoExtractorProcessed = '1'; delete video.dataset.vePending; }
    function unmarkProcessed(video) { delete video.dataset.videoExtractorProcessed; delete video.dataset.vePending; }
    function isPending(video) { return video.dataset.vePending === '1'; }
    function markPending(video) { video.dataset.vePending = '1'; }

    function getVideoSources(video) {
        const sources = [];
        try {
            if (video.src && (video.src.startsWith('http') || video.src.startsWith('blob:'))) {
                sources.push({ url: video.src, type: video.getAttribute('type') || guessMimeByUrl(video.src) });
            }
            video.querySelectorAll('source').forEach(src => {
                const url = src.src;
                if (url && (url.startsWith('http') || url.startsWith('blob:'))) {
                    sources.push({ url: url, type: src.type || guessMimeByUrl(url) });
                }
            });
        } catch (e) {
            console.error('获取视频源失败：', e);
        }
        return sources;
    }
    function guessMimeByUrl(url) {
        const lower = url.toLowerCase();
        if (lower.endsWith('.m3u8')) return 'application/x-mpegURL';
        if (lower.endsWith('.mpd')) return 'application/dash+xml';
        if (lower.endsWith('.mp4')) return 'video/mp4';
        if (lower.endsWith('.webm')) return 'video/webm';
        if (lower.endsWith('.ogg') || lower.endsWith('.ogv')) return 'video/ogg';
        if (lower.endsWith('.ts')) return 'video/mp2t';
        return '';
    }
    function getBestSource(sources) {
        if (sources.length === 0) return null;
        const direct = sources.find(s => !s.url.toLowerCase().endsWith('.m3u8') && !s.url.toLowerCase().endsWith('.mpd') && s.type !== 'application/x-mpegURL' && s.type !== 'application/dash+xml');
        if (direct) return direct;
        const hls = sources.find(s => s.url.toLowerCase().endsWith('.m3u8') || s.type === 'application/x-mpegURL');
        if (hls) return hls;
        const dash = sources.find(s => s.url.toLowerCase().endsWith('.mpd') || s.type === 'application/dash+xml');
        return dash || sources[0];
    }

    // ========== SVG 图标 ==========
    const ICON_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"></polygon><rect x="2" y="1" width="20" height="22" rx="2" ry="2" stroke="rgba(255,255,255,0.3)" fill="none" stroke-width="1"/></svg>';
    function createIconSVG() {
        const div = document.createElement('div');
        div.innerHTML = ICON_SVG;
        return div.firstElementChild;
    }

    // ========== 按钮管理（独立固定定位） ==========
    const buttonRegistry = new Map(); // video -> icon element

    function positionIcon(icon, video) {
        const rect = video.getBoundingClientRect();
        if (rect.width === 0 && rect.height === 0) {
            icon.style.display = 'none';
            return;
        }
        icon.style.display = 'block';
        icon.style.left = (rect.right - 40) + 'px';
        icon.style.top = (rect.top + 8) + 'px';
    }

    function updateAllButtonPositions() {
        buttonRegistry.forEach((icon, video) => {
            if (!video.isConnected) {
                icon.remove();
                buttonRegistry.delete(video);
                return;
            }
            positionIcon(icon, video);
        });
    }

    window.addEventListener('scroll', updateAllButtonPositions, true);
    window.addEventListener('resize', updateAllButtonPositions);
    setInterval(updateAllButtonPositions, 2000);

    function addButtonForVideo(video) {
        if (buttonRegistry.has(video)) return;
        const icon = document.createElement('span');
        icon.className = 'video-extractor-icon';
        icon.title = '提取视频到独立播放器';
        icon.appendChild(createIconSVG());
        icon.style.position = 'fixed';
        icon.style.zIndex = '2147483647';
        icon.addEventListener('click', (e) => {
            e.stopPropagation();
            e.preventDefault();
            // 立即移除按钮，防止重复点击
            removeButtonForVideo(video);
            extractVideo(video);
        });
        document.body.appendChild(icon);
        buttonRegistry.set(video, icon);
        positionIcon(icon, video);
    }

    function removeButtonForVideo(video) {
        const icon = buttonRegistry.get(video);
        if (icon) {
            icon.remove();
            buttonRegistry.delete(video);
        }
    }

    // ========== 注入逻辑（不要求源存在，只要视频元素可见或潜在可见） ==========
    function wrapVideo(video) {
        if (isProcessed(video)) return true;
        addButtonForVideo(video);
        markProcessed(video);
        return true;
    }

    function removeAllIcons() {
        buttonRegistry.forEach((icon) => icon.remove());
        buttonRegistry.clear();
        document.querySelectorAll('video[data-video-extractor-processed="1"]').forEach(v => unmarkProcessed(v));
        document.querySelectorAll('video[data-ve-pending="1"]').forEach(v => delete v.dataset.vePending);
    }

    function tryWrapVideo(video) {
        if (isProcessed(video)) return;
        wrapVideo(video);
    }

    // ========== 视频提取 ==========
    function extractVideo(video) {
        const sources = getVideoSources(video);
        if (sources.length === 0) {
            alert('视频源尚未就绪，请稍后重试或手动输入视频地址。');
            return;
        }
        const bestSource = getBestSource(sources);
        if (bestSource.url.startsWith('blob:')) {
            extractBlobVideo(video);
            return;
        }
        const html = buildPlayerHTML(bestSource, sources);
        const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const newWindow = window.open(url, '_blank');
        if (!newWindow) {
            alert('浏览器阻止了新窗口打开，请允许弹窗后重试。');
            URL.revokeObjectURL(url);
        }
        setTimeout(() => URL.revokeObjectURL(url), 10000);
    }

    // ========== 浮层播放器（blob） ==========
    function extractBlobVideo(video) {
        const originalParent = video.parentNode;
        const originalNextSibling = video.nextSibling;

        const overlay = document.createElement('div');
        overlay.className = 've-overlay';
        const playerContainer = document.createElement('div');
        playerContainer.className = 've-player-container';
        const videoHolder = document.createElement('div');
        videoHolder.className = 've-video-holder';
        videoHolder.appendChild(video);
        playerContainer.appendChild(videoHolder);

        const actualVideo = video;
        const originalControls = actualVideo.controls;

        let webFullscreenActive = false;
        let scale = 1, translateX = 0, translateY = 0;
        let isDragging = false, dragStartX = 0, dragStartY = 0;
        let startTranslateX = 0, startTranslateY = 0;
        let suppressClick = false;

        function updateVideoTransform() {
            videoHolder.style.transform = 'translate(' + translateX + 'px, ' + translateY + 'px) scale(' + scale + ')';
        }
        function clearTransform() {
            videoHolder.style.transform = '';
            scale = 1; translateX = 0; translateY = 0;
        }

        const closeBtn = document.createElement('button');
        closeBtn.className = 've-btn ve-close-btn';
        closeBtn.innerHTML = '✕';
        closeBtn.title = '关闭';
        closeBtn.addEventListener('click', () => {
            if (webFullscreenActive) exitWebFullscreen();
            if (originalParent) {
                if (originalNextSibling) originalParent.insertBefore(video, originalNextSibling);
                else originalParent.appendChild(video);
            }
            clearTransform();
            actualVideo.controls = originalControls;
            overlay.remove();
            webFullscreenActive = false;
            isDragging = false;
        });

        const fullscreenBtn = document.createElement('button');
        fullscreenBtn.className = 've-btn ve-fullscreen-btn';
        fullscreenBtn.innerHTML = '⛶';
        fullscreenBtn.title = '浏览器全屏';
        fullscreenBtn.addEventListener('click', () => {
            if (!document.fullscreenElement) playerContainer.requestFullscreen();
            else document.exitFullscreen();
        });

        const webFullscreenBtn = document.createElement('button');
        webFullscreenBtn.className = 've-btn ve-webfullscreen-btn';
        webFullscreenBtn.innerHTML = '⤢';
        webFullscreenBtn.title = '网页全屏';
        webFullscreenBtn.addEventListener('click', () => {
            if (!webFullscreenActive) {
                enterWebFullscreen();
                webFullscreenBtn.innerHTML = '⤡';
                webFullscreenBtn.title = '退出网页全屏';
            } else {
                exitWebFullscreen();
                webFullscreenBtn.innerHTML = '⤢';
                webFullscreenBtn.title = '网页全屏';
            }
        });

        // 自定义控制栏
        const customControls = document.createElement('div');
        customControls.className = 've-custom-controls';
        customControls.style.display = 'none';

        const playPauseBtn = document.createElement('button');
        playPauseBtn.innerHTML = actualVideo.paused ? '▶' : '⏸';
        playPauseBtn.title = '播放/暂停';
        playPauseBtn.addEventListener('click', () => {
            if (actualVideo.paused) actualVideo.play().catch(() => {});
            else actualVideo.pause();
        });

        const progressContainer = document.createElement('div');
        progressContainer.className = 've-progress-container';
        const currentTimeSpan = document.createElement('span');
        currentTimeSpan.className = 've-time';
        currentTimeSpan.textContent = '0:00';
        const progressSlider = document.createElement('input');
        progressSlider.type = 'range';
        progressSlider.className = 've-progress-slider';
        progressSlider.min = 0; progressSlider.max = 100; progressSlider.value = 0; progressSlider.step = 0.1;
        progressSlider.addEventListener('input', () => {
            const duration = actualVideo.duration;
            if (duration && isFinite(duration)) actualVideo.currentTime = (progressSlider.value / 100) * duration;
        });
        const durationSpan = document.createElement('span');
        durationSpan.className = 've-time';
        durationSpan.textContent = '0:00';
        progressContainer.appendChild(currentTimeSpan);
        progressContainer.appendChild(progressSlider);
        progressContainer.appendChild(durationSpan);

        const volumeContainer = document.createElement('div');
        volumeContainer.className = 've-volume-container';
        const volumeIcon = document.createElement('span');
        volumeIcon.className = 've-volume-icon';
        volumeIcon.textContent = '🔊';
        const volumeSlider = document.createElement('input');
        volumeSlider.type = 'range';
        volumeSlider.className = 've-volume-slider';
        volumeSlider.min = 0; volumeSlider.max = 100; volumeSlider.value = actualVideo.volume * 100;
        volumeSlider.addEventListener('input', () => {
            actualVideo.muted = false;
            actualVideo.volume = volumeSlider.value / 100;
            updateVolumeIcon();
        });

        function updateVolumeIcon() {
            if (actualVideo.muted || actualVideo.volume === 0) volumeIcon.textContent = '🔇';
            else if (actualVideo.volume < 0.5) volumeIcon.textContent = '🔉';
            else volumeIcon.textContent = '🔊';
        }
        function syncVolumeUI() {
            volumeSlider.value = actualVideo.volume * 100;
            updateVolumeIcon();
        }

        volumeContainer.appendChild(volumeIcon);
        volumeContainer.appendChild(volumeSlider);
        customControls.appendChild(playPauseBtn);
        customControls.appendChild(progressContainer);
        customControls.appendChild(volumeContainer);

        function formatTime(seconds) {
            if (!isFinite(seconds) || seconds < 0) return '0:00';
            const hrs = Math.floor(seconds / 3600);
            const mins = Math.floor((seconds % 3600) / 60);
            const secs = Math.floor(seconds % 60);
            return hrs > 0 ? hrs + ':' + String(mins).padStart(2, '0') + ':' + String(secs).padStart(2, '0') : mins + ':' + String(secs).padStart(2, '0');
        }

        actualVideo.addEventListener('timeupdate', () => {
            if (actualVideo.duration) {
                progressSlider.value = (actualVideo.currentTime / actualVideo.duration) * 100;
                currentTimeSpan.textContent = formatTime(actualVideo.currentTime);
            }
        });
        actualVideo.addEventListener('loadedmetadata', () => {
            durationSpan.textContent = formatTime(actualVideo.duration);
            progressSlider.value = 0;
        });
        actualVideo.addEventListener('play', () => { playPauseBtn.innerHTML = '⏸'; });
        actualVideo.addEventListener('pause', () => { playPauseBtn.innerHTML = '▶'; });
        actualVideo.addEventListener('volumechange', syncVolumeUI);

        // 拖拽与缩放
        videoHolder.addEventListener('mousedown', (e) => {
            if (!webFullscreenActive) return;
            if (e.button !== 0) return;
            isDragging = true;
            dragStartX = e.clientX; dragStartY = e.clientY;
            startTranslateX = translateX; startTranslateY = translateY;
            suppressClick = false;
            e.preventDefault();
            videoHolder.style.cursor = 'grabbing';
        });
        document.addEventListener('mousemove', (e) => {
            if (!webFullscreenActive || !isDragging) return;
            const dx = e.clientX - dragStartX;
            const dy = e.clientY - dragStartY;
            if (Math.abs(dx) > 3 || Math.abs(dy) > 3) suppressClick = true;
            translateX = startTranslateX + dx;
            translateY = startTranslateY + dy;
            updateVideoTransform();
        });
        document.addEventListener('mouseup', () => {
            if (isDragging) {
                isDragging = false;
                videoHolder.style.cursor = 'grab';
                if (suppressClick) setTimeout(() => { suppressClick = false; }, 0);
            }
            // 松开鼠标后重新计时控制栏隐藏
            if (webFullscreenActive) scheduleHideControls();
        });
        videoHolder.addEventListener('click', (e) => {
            if (webFullscreenActive && suppressClick) {
                e.preventDefault();
                e.stopPropagation();
                suppressClick = false;
            }
        }, { capture: true });
        videoHolder.addEventListener('wheel', (e) => {
            if (!webFullscreenActive) return;
            e.preventDefault();
            const delta = e.deltaY > 0 ? -0.1 : 0.1;
            scale = Math.min(3, Math.max(0.5, scale + delta));
            updateVideoTransform();
        }, { passive: false });

        // ===== 控制栏自动隐藏逻辑 =====
        let controlsHideTimer = null;
        const CONTROLS_HIDE_DELAY = 5000;   // 无操作 5 秒后隐藏
        const CONTROLS_SHOW_ZONE = 70;      // 指针进入底部该区域(px)时显示

        function clearControlsTimer() {
            if (controlsHideTimer) {
                clearTimeout(controlsHideTimer);
                controlsHideTimer = null;
            }
        }

        function scheduleHideControls() {
            clearControlsTimer();
            controlsHideTimer = setTimeout(() => {
                controlsHideTimer = null;
                if (!webFullscreenActive) return;
                // 指针还在控制栏上就不隐藏，续期
                if (customControls.matches(':hover')) {
                    scheduleHideControls();
                    return;
                }
                customControls.classList.remove('active');
            }, CONTROLS_HIDE_DELAY);
        }

        function showControls() {
            if (!webFullscreenActive) return;
            customControls.classList.add('active');
            scheduleHideControls();
        }

        // 指针移动到播放器底部区域 → 显示控制栏
        playerContainer.addEventListener('mousemove', (e) => {
            if (!webFullscreenActive) return;
            const rect = playerContainer.getBoundingClientRect();
            if (e.clientY >= rect.bottom - CONTROLS_SHOW_ZONE) {
                showControls();
            }
        });

        // 指针停留在控制栏上 → 保持显示
        customControls.addEventListener('mousemove', () => {
            if (!webFullscreenActive) return;
            scheduleHideControls();
        });
        customControls.addEventListener('mouseenter', () => {
            if (!webFullscreenActive) return;
            clearControlsTimer();
            customControls.classList.add('active');
        });
        customControls.addEventListener('mouseleave', () => {
            if (!webFullscreenActive) return;
            scheduleHideControls();
        });
        // 拖动进度条/音量条时不要隐藏
        customControls.addEventListener('mousedown', () => {
            clearControlsTimer();
        });

        // 指针移出播放器（离开窗口）→ 立即隐藏
        playerContainer.addEventListener('mouseleave', () => {
            if (!webFullscreenActive) return;
            clearControlsTimer();
            customControls.classList.remove('active');
        });

        function enterWebFullscreen() {
            try {
                webFullscreenActive = true;
                document.body.appendChild(playerContainer);
                playerContainer.style.position = 'fixed';
                playerContainer.style.top = '0';
                playerContainer.style.left = '0';
                playerContainer.style.width = '100vw';
                playerContainer.style.height = '100vh';
                playerContainer.style.margin = '0';
                playerContainer.style.borderRadius = '0';
                playerContainer.style.resize = 'none';
                playerContainer.style.zIndex = '999999';
                playerContainer.style.boxShadow = 'none';
                videoHolder.style.width = '100%';
                videoHolder.style.height = '100%';
                actualVideo.style.width = '100%';
                actualVideo.style.height = '100%';
                actualVideo.style.objectFit = 'contain';
                actualVideo.controls = false;
                customControls.style.display = 'flex';
                showControls();   // 显示并启动 5 秒自动隐藏计时
                clearTransform();
                videoHolder.style.cursor = 'grab';
                syncVolumeUI();
            } catch (e) {
                console.error('进入网页全屏失败：', e);
                alert('进入网页全屏失败，请查看控制台错误信息。');
            }
        }

        function exitWebFullscreen() {
            try {
                webFullscreenActive = false;
                overlay.appendChild(playerContainer);
                playerContainer.style.position = '';
                playerContainer.style.top = '';
                playerContainer.style.left = '';
                playerContainer.style.width = '';
                playerContainer.style.height = '';
                playerContainer.style.margin = '';
                playerContainer.style.borderRadius = '';
                playerContainer.style.resize = '';
                playerContainer.style.zIndex = '';
                playerContainer.style.boxShadow = '';
                videoHolder.style.width = '';
                videoHolder.style.height = '';
                actualVideo.style.width = '';
                actualVideo.style.height = '';
                actualVideo.style.objectFit = '';
                actualVideo.controls = originalControls;
                clearControlsTimer();
                customControls.style.display = 'none';
                customControls.classList.remove('active');
                clearTransform();
                videoHolder.style.cursor = '';
                isDragging = false;
            } catch (e) {
                console.error('退出网页全屏失败：', e);
            }
        }

        playerContainer.appendChild(closeBtn);
        playerContainer.appendChild(fullscreenBtn);
        playerContainer.appendChild(webFullscreenBtn);
        playerContainer.appendChild(customControls);
        overlay.appendChild(playerContainer);
        document.body.appendChild(overlay);

        actualVideo.controls = originalControls;
        customControls.style.display = 'none';
        if (video.paused) video.play().catch(() => {});
    }

    // ========== 构建新标签页播放器 HTML（极简版） ==========
    function buildPlayerHTML(bestSource, allSources) {
        const title = escapeHtml(document.title || '视频播放器');
        const bestUrl = escapeHtml(bestSource.url);
        const bestType = escapeHtml(bestSource.type || '');
        return '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>' + title + ' — 视频提取器</title><style>body{margin:0;background:#000;display:flex;align-items:center;justify-content:center;height:100vh}video{max-width:100%;max-height:100vh}</style></head><body><video id="player" ' + (bestType ? 'type="' + bestType + '"' : '') + ' src="' + bestUrl + '" controls autoplay playsinline></video><script src="https://cdn.jsdelivr.net/npm/hls.js@latest"></script><script src="https://cdn.jsdelivr.net/npm/dashjs@latest"></script><script>const v=document.getElementById("player");const u="' + bestUrl + '";if(u.endsWith(".m3u8")&&Hls.isSupported()){const h=new Hls();h.loadSource(u);h.attachMedia(v)}else if(u.endsWith(".mpd")){dashjs.MediaPlayer().create().initialize(v,u,true)}</script></body></html>';
    }

    function escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    // ========== 扫描与观察 ==========
    function scanAndInject() {
        if (!isEnabled()) return;
        document.querySelectorAll('video').forEach(tryWrapVideo);
    }

    let observer = null;
    function startObserver() {
        if (observer) return;
        observer = new MutationObserver((mutations) => {
            if (!isEnabled()) return;
            const videosToCheck = new Set();
            for (const mutation of mutations) {
                for (const node of mutation.addedNodes) {
                    if (node.nodeType === Node.ELEMENT_NODE) {
                        if (node.tagName === 'VIDEO') videosToCheck.add(node);
                        if (node.querySelectorAll) node.querySelectorAll('video').forEach(v => videosToCheck.add(v));
                    }
                }
                if (mutation.type === 'attributes' && mutation.target.tagName === 'VIDEO') videosToCheck.add(mutation.target);
            }
            videosToCheck.forEach(tryWrapVideo);
        });
        observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['src'] });
    }

    // ========== 初始化 ==========
    function init() {
        startObserver();
        if (isEnabled()) {
            removeAllIcons();
            scanAndInject();
            setTimeout(scanAndInject, 500);
            setTimeout(scanAndInject, 1000);
            setTimeout(scanAndInject, 3000);
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
