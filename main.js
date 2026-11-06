// ==UserScript==
// @name         视频提取器
// @namespace   https://github.com/example/video-extractor
// @version      1.1.1
// @description  提取页面中的视频到独立播放器中播放，支持直链/HLS/DASH 与 blob 直播流浮层（网页全屏、拖拽、缩放、自定义控制栏、快捷键），支持 open Shadow DOM
// @author       Reasonix
// @match        *://*/*
// @grant        GM_registerMenuCommand
// @grant        GM_unregisterMenuCommand
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
    function isEnabled() { return localStorage.getItem(STORAGE_KEY) === 'true'; }
    function setEnabled(val) { localStorage.setItem(STORAGE_KEY, val ? 'true' : 'false'); }

    let menuCommandId = null;

    function updateMenuCommand() {
        // 先注销旧菜单项（如果支持）
        try {
            if (menuCommandId !== null && typeof GM_unregisterMenuCommand === 'function') {
                GM_unregisterMenuCommand(menuCommandId);
                menuCommandId = null;
            }
        } catch (e) {
            console.error('注销菜单失败：', e);
        }
        // 按当前状态显示对应菜单文字
        const label = isEnabled() ? '当前状态：开，点击关闭' : '当前状态：关，点击开启';
        try {
            menuCommandId = GM_registerMenuCommand(label, toggleEnabled);
        } catch (e) {
            console.error('菜单注册失败：', e);
        }
    }

    function toggleEnabled() {
        const next = !isEnabled();
        setEnabled(next);
        if (next) {
            removeAllIcons();
            scanAndInject();
        } else {
            removeAllIcons();
        }
        updateMenuCommand();
        showToast('视频提取器：已' + (next ? '开启' : '关闭'));
    }

    // 首次注册菜单
    updateMenuCommand();

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

.ve-toast { position: fixed; right: 24px; bottom: 24px; z-index: 2147483647; max-width: 360px; padding: 10px 16px; border-radius: 8px; background: rgba(0,0,0,0.85); color: #fff; font-size: 13px; line-height: 1.5; box-shadow: 0 4px 16px rgba(0,0,0,0.4); opacity: 0; transform: translateY(10px); transition: opacity 0.25s, transform 0.25s; pointer-events: none; font-family: system-ui, -apple-system, "Segoe UI", sans-serif; }
.ve-toast.show { opacity: 1; transform: translateY(0); }
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

    // ========== 轻提示（替代阻塞式 alert） ==========
    let toastEl = null;
    let toastTimer = null;

    function showToast(message, duration) {
        if (!document.body) return;
        if (!toastEl) {
            toastEl = document.createElement('div');
            toastEl.className = 've-toast';
            document.body.appendChild(toastEl);
        }
        toastEl.textContent = message;
        // 强制回流，保证连续提示时入场动画能重播
        void toastEl.offsetWidth;
        toastEl.classList.add('show');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => {
            if (!toastEl) return;
            toastEl.classList.remove('show');
            setTimeout(() => {
                if (toastEl && !toastEl.classList.contains('show')) {
                    toastEl.remove();
                    toastEl = null;
                }
            }, 300);
        }, duration || 3000);
    }

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
        // 注意不能用 endsWith：带 ?token=... 的地址结尾不是扩展名
        if (/\.m3u8(\?|#|$)/.test(lower)) return 'application/x-mpegURL';
        if (/\.mpd(\?|#|$)/.test(lower)) return 'application/dash+xml';
        if (/\.mp4(\?|#|$)/.test(lower)) return 'video/mp4';
        if (/\.webm(\?|#|$)/.test(lower)) return 'video/webm';
        if (/\.og[gv](\?|#|$)/.test(lower)) return 'video/ogg';
        if (/\.ts(\?|#|$)/.test(lower)) return 'video/mp2t';
        return '';
    }
    function isHlsSource(s) {
        return s.type === 'application/x-mpegURL' || /\.m3u8(\?|#|$)/i.test(s.url);
    }
    function isDashSource(s) {
        return s.type === 'application/dash+xml' || /\.mpd(\?|#|$)/i.test(s.url);
    }
    function getBestSource(sources) {
        if (sources.length === 0) return null;
        // 优先直链，其次 HLS，最后 DASH
        const direct = sources.find(s => !isHlsSource(s) && !isDashSource(s));
        if (direct) return direct;
        const hls = sources.find(isHlsSource);
        if (hls) return hls;
        const dash = sources.find(isDashSource);
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
    const visibilityMap = new WeakMap(); // video -> 是否在视口内（未记录时按可见处理）
    const disconnectSince = new Map(); // video -> 首次发现脱离文档的时间戳
    const mediaBound = new WeakSet();  // 已绑定媒体事件的 video，避免重复绑定
    const DISCONNECT_GRACE = 10000;    // 脱离文档超过该时长才真正清理按钮
    let visibilityObserver = null;
    let rafId = 0;

    function getVisibilityObserver() {
        if (visibilityObserver) return visibilityObserver;
        visibilityObserver = new IntersectionObserver((entries) => {
            let needUpdate = false;
            entries.forEach((entry) => {
                const video = entry.target;
                visibilityMap.set(video, entry.isIntersecting);
                const icon = buttonRegistry.get(video);
                if (!icon) return;
                if (!entry.isIntersecting) {
                    icon.style.display = 'none';
                } else {
                    needUpdate = true;
                }
            });
            if (needUpdate) scheduleUpdate();
        }, { rootMargin: '100px' });
        return visibilityObserver;
    }

    function positionIcon(icon, video) {
        if (visibilityMap.get(video) === false) {
            icon.style.display = 'none';
            return;
        }
        const rect = video.getBoundingClientRect();
        if ((rect.width === 0 && rect.height === 0) || rect.bottom < 0 || rect.top > window.innerHeight) {
            icon.style.display = 'none';
            return;
        }
        icon.style.display = 'block';
        icon.style.left = (rect.right - 40) + 'px';
        icon.style.top = (rect.top + 8) + 'px';
    }

    function updateAllButtonPositions() {
        const now = Date.now();
        buttonRegistry.forEach((icon, video) => {
            // 切集/换源时播放器常把 video 移出文档再插回，先隐藏并计时，超时才真正清理
            if (!video.isConnected) {
                icon.style.display = 'none';
                if (!disconnectSince.has(video)) disconnectSince.set(video, now);
                else if (now - disconnectSince.get(video) > DISCONNECT_GRACE) removeButtonForVideo(video);
                return;
            }
            disconnectSince.delete(video);
            // video 已经被搬进浮层（或浮层内的网页全屏），按钮不该浮在播放器上方
            if (typeof video.closest === 'function' && video.closest('.ve-player-container')) {
                icon.style.display = 'none';
                return;
            }
            positionIcon(icon, video);
        });
    }

    /** 用 rAF 合并同一帧内的多次刷新请求 */
    function scheduleUpdate() {
        if (rafId) return;
        rafId = requestAnimationFrame(() => {
            rafId = 0;
            updateAllButtonPositions();
        });
    }

    window.addEventListener('scroll', scheduleUpdate, { capture: true, passive: true });
    window.addEventListener('resize', scheduleUpdate);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) scheduleUpdate(); });
    // 兜底轮询：应对 transform / 动画 / 站点手动改样式导致的位移
    setInterval(() => {
        if (document.hidden || buttonRegistry.size === 0) return;
        scheduleUpdate();
    }, 2000);

    function addButtonForVideo(video) {
        if (buttonRegistry.has(video) || !document.body) return;
        const icon = document.createElement('span');
        icon.className = 'video-extractor-icon';
        icon.title = '提取视频到独立播放器';
        icon.appendChild(createIconSVG());
        icon.style.position = 'fixed';
        icon.style.zIndex = '2147483647';

        let busy = false;
        icon.addEventListener('click', (e) => {
            e.stopPropagation();
            e.preventDefault();
            if (busy) return;
            busy = true;
            // 按钮常驻：切集时站点会复用同一个 <video>，按钮一旦移除就再也回不来
            icon.style.pointerEvents = 'none';
            icon.style.opacity = '0.4';
            extractVideo(video);
            setTimeout(() => {
                busy = false;
                icon.style.pointerEvents = '';
                icon.style.opacity = '';
            }, 800);
        });

        document.body.appendChild(icon);
        buttonRegistry.set(video, icon);
        disconnectSince.delete(video);
        bindMediaEvents(video);
        try {
            getVisibilityObserver().observe(video);
        } catch (e) {
            console.error('观察视频可见性失败：', e);
        }
        positionIcon(icon, video);
    }

    function removeButtonForVideo(video) {
        const icon = buttonRegistry.get(video);
        if (icon) icon.remove();
        buttonRegistry.delete(video);
        disconnectSince.delete(video);
        if (visibilityObserver) {
            try { visibilityObserver.unobserve(video); } catch (e) { /* 忽略 */ }
        }
    }

    /**
     * 确保按钮存在。用于媒体源变化（换集/换源）后的恢复，
     * 绕过 isProcessed 标记——正常扫描仍然遵守该标记。
     */
    function ensureButton(video) {
        if (!isEnabled() || !video.isConnected || !document.body) return;
        disconnectSince.delete(video);
        if (!buttonRegistry.has(video)) addButtonForVideo(video);
        markProcessed(video);
        scheduleUpdate();
    }

    /** 每个 video 只绑一次：切集时浏览器会触发 loadstart / emptied */
    function bindMediaEvents(video) {
        if (mediaBound.has(video)) return;
        mediaBound.add(video);
        video.addEventListener('loadstart', () => ensureButton(video));
        video.addEventListener('emptied', () => ensureButton(video));
    }

    // ========== 注入逻辑（不要求源存在，只要视频元素可见或潜在可见） ==========
    function wrapVideo(video) {
        if (isProcessed(video)) return true;
        addButtonForVideo(video);
        markProcessed(video);
        return true;
    }

    function removeAllIcons() {
        buttonRegistry.forEach((icon, video) => {
            icon.remove();
            if (visibilityObserver) {
                try { visibilityObserver.unobserve(video); } catch (e) { /* 忽略 */ }
            }
        });
        buttonRegistry.clear();
        disconnectSince.clear();
        // 一并清理 shadow root 内的标记，否则重新开启后这些视频不会重新注入
        const found = new Set();
        scanRoot(document, found);
        found.forEach(v => unmarkProcessed(v));
    }

    function tryWrapVideo(video) {
        if (isProcessed(video)) return;
        wrapVideo(video);
    }

    // ========== 视频提取 ==========
    /** @returns {boolean} 是否成功发起提取 */
    function extractVideo(video) {
        const sources = getVideoSources(video);
        if (sources.length === 0) {
            showToast('视频源尚未就绪，请稍后重试');
            return false;
        }
        const bestSource = getBestSource(sources);
        if (bestSource.url.startsWith('blob:')) {
            return extractBlobVideo(video);
        }
        const html = buildPlayerHTML(bestSource);
        const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const newWindow = window.open(url, '_blank');
        if (!newWindow) {
            showToast('浏览器拦截了新窗口，请允许弹窗后重试');
            URL.revokeObjectURL(url);
            return false;
        }
        // 60 秒后回收，避免弱网下播放器还没解析完就被释放
        setTimeout(() => URL.revokeObjectURL(url), 60000);
        return true;
    }

    // ========== 浮层播放器（blob） ==========
    function extractBlobVideo(video) {
        if (!video.isConnected || !video.ownerDocument || !video.parentNode) {
            showToast('视频元素已失效，请刷新页面后重试');
            return false;
        }

        // 记录原始内联样式，退出时原样还原
        const originStyle = {
            width: video.style.width,
            height: video.style.height,
            objectFit: video.style.objectFit
        };
        const originalState = {
            paused: video.paused,
            controls: video.controls
        };

        // 用注释节点占位，比记录 nextSibling 更稳
        const placeholder = document.createComment('ve-placeholder');
        video.parentNode.replaceChild(placeholder, video);

        const overlay = document.createElement('div');
        overlay.className = 've-overlay';
        const playerContainer = document.createElement('div');
        playerContainer.className = 've-player-container';
        const videoHolder = document.createElement('div');
        videoHolder.className = 've-video-holder';
        videoHolder.appendChild(video);
        playerContainer.appendChild(videoHolder);

        const actualVideo = video;
        let closed = false;
        let webFullscreenActive = false;
        let scale = 1, translateX = 0, translateY = 0;
        let isDragging = false, dragStartX = 0, dragStartY = 0;
        let startTranslateX = 0, startTranslateY = 0;
        let suppressClick = false;

        // 统一管理挂在 document 上的监听，关闭时一次性摘除，避免泄漏
        const docListeners = [];
        function bindDocument(type, handler, options) {
            const opts = options || {};
            document.addEventListener(type, handler, opts);
            docListeners.push({ type: type, handler: handler, opts: opts });
        }
        function unbindDocumentAll() {
            while (docListeners.length) {
                const item = docListeners.pop();
                document.removeEventListener(item.type, item.handler, item.opts);
            }
        }

        function updateVideoTransform() {
            videoHolder.style.transform = 'translate(' + translateX + 'px, ' + translateY + 'px) scale(' + scale + ')';
        }
        function clearTransform() {
            videoHolder.style.transform = '';
            scale = 1; translateX = 0; translateY = 0;
        }

        function togglePlay() {
            if (actualVideo.paused) {
                const p = actualVideo.play();
                if (p && typeof p.catch === 'function') p.catch(() => {});
            } else {
                actualVideo.pause();
            }
        }
        function seekBy(seconds) {
            const duration = actualVideo.duration;
            let target = actualVideo.currentTime + seconds;
            if (isFinite(duration) && duration > 0) target = Math.min(duration, target);
            target = Math.max(0, target);
            try { actualVideo.currentTime = target; } catch (e) { /* 直播流可能不支持 */ }
        }
        function changeVolume(delta) {
            actualVideo.muted = false;
            actualVideo.volume = Math.min(1, Math.max(0, actualVideo.volume + delta));
            syncVolumeUI();
        }

        function toggleBrowserFullscreen() {
            try {
                if (!document.fullscreenElement) {
                    const p = playerContainer.requestFullscreen();
                    if (p && typeof p.catch === 'function') p.catch(() => showToast('进入浏览器全屏失败'));
                } else {
                    document.exitFullscreen();
                }
            } catch (e) {
                showToast('进入浏览器全屏失败');
            }
        }

        const closeBtn = document.createElement('button');
        closeBtn.className = 've-btn ve-close-btn';
        closeBtn.innerHTML = '✕';
        closeBtn.title = '关闭（Esc）';
        closeBtn.addEventListener('click', () => closeOverlay());

        const fullscreenBtn = document.createElement('button');
        fullscreenBtn.className = 've-btn ve-fullscreen-btn';
        fullscreenBtn.innerHTML = '⛶';
        fullscreenBtn.title = '浏览器全屏（F）';
        fullscreenBtn.addEventListener('click', toggleBrowserFullscreen);

        const webFullscreenBtn = document.createElement('button');
        webFullscreenBtn.className = 've-btn ve-webfullscreen-btn';
        webFullscreenBtn.innerHTML = '⤢';
        webFullscreenBtn.title = '网页全屏';
        webFullscreenBtn.addEventListener('click', toggleWebFullscreen);

        function updateWebFullscreenBtn() {
            webFullscreenBtn.innerHTML = webFullscreenActive ? '⤡' : '⤢';
            webFullscreenBtn.title = webFullscreenActive ? '退出网页全屏' : '网页全屏';
        }

        function toggleWebFullscreen() {
            if (!webFullscreenActive) enterWebFullscreen();
            else exitWebFullscreen();
            updateWebFullscreenBtn();
        }

        // 自定义控制栏
        const customControls = document.createElement('div');
        customControls.className = 've-custom-controls';
        customControls.style.display = 'none';

        const playPauseBtn = document.createElement('button');
        playPauseBtn.innerHTML = actualVideo.paused ? '▶' : '⏸';
        playPauseBtn.title = '播放/暂停';
        playPauseBtn.addEventListener('click', togglePlay);

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

        function onTimeUpdate() {
            if (actualVideo.duration) {
                progressSlider.value = (actualVideo.currentTime / actualVideo.duration) * 100;
                currentTimeSpan.textContent = formatTime(actualVideo.currentTime);
            }
        }
        function onLoadedMetadata() {
            durationSpan.textContent = formatTime(actualVideo.duration);
            progressSlider.value = 0;
        }
        function onPlay() { playPauseBtn.innerHTML = '⏸'; }
        function onPause() { playPauseBtn.innerHTML = '▶'; }

        actualVideo.addEventListener('timeupdate', onTimeUpdate);
        actualVideo.addEventListener('loadedmetadata', onLoadedMetadata);
        actualVideo.addEventListener('play', onPlay);
        actualVideo.addEventListener('pause', onPause);
        actualVideo.addEventListener('volumechange', syncVolumeUI);

        // ===== 键盘快捷键 =====
        function onKeyDown(e) {
            if (closed) return;
            const t = e.target;
            if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;

            const key = e.key;
            if (key === 'Escape' || key === 'Esc') {
                e.preventDefault(); e.stopPropagation();
                if (webFullscreenActive) { exitWebFullscreen(); updateWebFullscreenBtn(); }
                else closeOverlay();
            } else if (key === ' ' || key === 'Spacebar' || key === 'Space') {
                e.preventDefault(); e.stopPropagation(); togglePlay();
            } else if (key === 'ArrowLeft') {
                e.preventDefault(); e.stopPropagation(); seekBy(-5);
            } else if (key === 'ArrowRight') {
                e.preventDefault(); e.stopPropagation(); seekBy(5);
            } else if (key === 'ArrowUp') {
                e.preventDefault(); e.stopPropagation(); changeVolume(0.05);
            } else if (key === 'ArrowDown') {
                e.preventDefault(); e.stopPropagation(); changeVolume(-0.05);
            } else if (key === 'm' || key === 'M') {
                e.preventDefault(); e.stopPropagation();
                actualVideo.muted = !actualVideo.muted;
                syncVolumeUI();
            } else if (key === 'f' || key === 'F') {
                e.preventDefault(); e.stopPropagation(); toggleBrowserFullscreen();
            }
        }

        // ===== 拖拽与缩放 =====
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

        function onDocumentMouseMove(e) {
            if (!webFullscreenActive || !isDragging) return;
            const dx = e.clientX - dragStartX;
            const dy = e.clientY - dragStartY;
            if (Math.abs(dx) > 3 || Math.abs(dy) > 3) suppressClick = true;
            translateX = startTranslateX + dx;
            translateY = startTranslateY + dy;
            updateVideoTransform();
        }

        function onDocumentMouseUp() {
            if (isDragging) {
                isDragging = false;
                videoHolder.style.cursor = 'grab';
                if (suppressClick) setTimeout(() => { suppressClick = false; }, 0);
            }
            // 松开鼠标后重新计时控制栏隐藏
            if (webFullscreenActive) scheduleHideControls();
        }

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
                showToast('进入网页全屏失败，请查看控制台');
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
                actualVideo.style.width = originStyle.width;
                actualVideo.style.height = originStyle.height;
                actualVideo.style.objectFit = originStyle.objectFit;
                actualVideo.controls = originalState.controls;
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

        // ===== 还原视频 =====
        function restoreVideo() {
            clearTransform();
            actualVideo.controls = originalState.controls;
            actualVideo.style.width = originStyle.width;
            actualVideo.style.height = originStyle.height;
            actualVideo.style.objectFit = originStyle.objectFit;

            if (placeholder.parentNode) {
                placeholder.parentNode.replaceChild(actualVideo, placeholder);
            } else if (document.body) {
                // 原位置已不存在，兜底挂到 body，避免元素丢失
                if (actualVideo.parentNode) actualVideo.parentNode.removeChild(actualVideo);
                document.body.appendChild(actualVideo);
                actualVideo.pause();
            }
            // 原本是暂停状态就保持暂停，避免离开浮层后自己播起来
            if (originalState.paused) actualVideo.pause();
        }

        function closeOverlay() {
            if (closed) return;
            closed = true;
            if (webFullscreenActive) exitWebFullscreen();
            clearControlsTimer();
            unbindDocumentAll();
            restoreVideo();
            overlay.remove();
            scheduleUpdate();
        }

        playerContainer.appendChild(closeBtn);
        playerContainer.appendChild(fullscreenBtn);
        playerContainer.appendChild(webFullscreenBtn);
        playerContainer.appendChild(customControls);
        overlay.appendChild(playerContainer);
        document.body.appendChild(overlay);
        // video 已进入浮层，立即让对应按钮隐藏
        scheduleUpdate();

        bindDocument('keydown', onKeyDown, { capture: true });
        bindDocument('mousemove', onDocumentMouseMove);
        bindDocument('mouseup', onDocumentMouseUp);

        if (actualVideo.paused) {
            const p = actualVideo.play();
            if (p && typeof p.catch === 'function') p.catch(() => {});
        }
        return true;
    }

    // ========== 构建新标签页播放器 HTML（极简版） ==========
    const HLS_CDN = 'https://cdn.jsdelivr.net/npm/hls.js@1.5.17/dist/hls.min.js';
    const DASH_CDN = 'https://cdn.jsdelivr.net/npm/dashjs@4.7.4/dist/dash.all.min.js';

    /** 属性值转义：用于 src / title 等 HTML 属性 */
    function escapeAttr(str) {
        return String(str == null ? '' : str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    /**
     * 生成播放器页面。
     * 注意：URL 只出现在 HTML 属性里，脚本内一律从 DOM 读回，
     * 避免 query 里的 & 被当成实体、或 URL 含引号/</script> 时破版。
     */
    function buildPlayerHTML(bestSource) {
        const title = escapeAttr(document.title || '视频播放器');
        const src = escapeAttr(bestSource.url);
        const type = escapeAttr(bestSource.type || '');
        return [
            '<!DOCTYPE html>',
            '<html lang="zh-CN"><head><meta charset="UTF-8">',
            '<meta name="viewport" content="width=device-width, initial-scale=1">',
            '<title>', title, ' — 视频提取器</title>',
            '<style>',
            'html,body{margin:0;height:100%;background:#000;overflow:hidden}',
            '#wrap{display:flex;align-items:center;justify-content:center;height:100%}',
            'video{max-width:100%;max-height:100%;outline:none}',
            '#tip{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);color:rgba(255,255,255,.6);font:13px/1.6 system-ui,-apple-system,"Segoe UI",sans-serif;text-align:center;display:none}',
            '</style></head><body>',
            '<div id="wrap"><video id="player" data-src="', src, '" data-type="', type, '" controls autoplay playsinline></video></div>',
            '<div id="tip"></div>',
            '<script src="', HLS_CDN, '"><\/script>',
            '<script src="', DASH_CDN, '"><\/script>',
            '<script>',
            '(function(){',
            'var v=document.getElementById("player");',
            'var tip=document.getElementById("tip");',
            'function show(m){tip.textContent=m;tip.style.display="block";}',
            'var u=v.getAttribute("data-src")||v.currentSrc||v.src||"";',
            'var t=(v.getAttribute("data-type")||"").toLowerCase();',
            'var isHls=t.indexOf("mpegurl")>-1||/\\.m3u8(\\?|#|$)/i.test(u);',
            'var isDash=t.indexOf("dash")>-1||/\\.mpd(\\?|#|$)/i.test(u);',
            'v.addEventListener("playing",function(){tip.style.display="none";},false);',
            'v.addEventListener("error",function(){if(!v.currentSrc)show("视频加载失败，可能源已失效或存在跨域限制");},false);',
            'if(isHls){',
            '  if(window.Hls&&Hls.isSupported()){var h=new Hls();h.on(Hls.Events.ERROR,function(e,d){if(d&&d.fatal)show("HLS 播放失败："+(d.type||"")+"/"+(d.details||""));});h.loadSource(u);h.attachMedia(v);}',
            '  else if(v.canPlayType("application/vnd.apple.mpegurl")){v.src=u;var p1=v.play();if(p1&&p1.catch)p1.catch(function(){});}',
            '  else{show("当前浏览器不支持 HLS 播放");}',
            '}else if(isDash){',
            '  if(window.dashjs){var p=dashjs.MediaPlayer().create();p.on(dashjs.MediaPlayer.events.ERROR,function(){show("DASH 播放失败");});p.initialize(v,u,true);}',
            '  else{show("当前浏览器不支持 DASH 播放");}',
            '}else{',
            '  v.src=u;',
            '  var p2=v.play();if(p2&&p2.catch)p2.catch(function(){});',
            '}',
            '})();',
            '<\/script>',
            '</body></html>'
        ].join('');
    }

    // ========== 扫描与观察（含 open Shadow DOM） ==========
    const observedRoots = new WeakSet();
    let observer = null;

    /** 让 MutationObserver 覆盖 document 或某个 shadow root（幂等） */
    function watchRoot(root) {
        if (!observer || observedRoots.has(root)) return;
        let target = null;
        try {
            target = root === document ? (document.body || document.documentElement) : root;
        } catch (e) {
            return;
        }
        if (!target) return;
        observedRoots.add(root);
        try {
            observer.observe(target, { childList: true, subtree: true, attributes: true, attributeFilter: ['src'] });
        } catch (e) {
            console.error('监听节点失败：', e);
        }
    }

    /** 递归收集 root 及内部所有 open shadow root 里的 video */
    function scanRoot(root, out) {
        if (!root) return;
        let videos;
        try {
            videos = root.querySelectorAll('video');
        } catch (e) {
            return;
        }
        videos.forEach((v) => out.add(v));

        let all;
        try {
            all = root.querySelectorAll('*');
        } catch (e) {
            return;
        }
        for (let i = 0; i < all.length; i++) {
            const shadow = all[i].shadowRoot;
            if (shadow) {
                watchRoot(shadow);
                scanRoot(shadow, out);
            }
        }
    }

    /** 处理 MutationObserver 新增节点（可能带 shadow root） */
    function collectFromNode(node, out) {
        if (!node || node.nodeType !== Node.ELEMENT_NODE) return;
        if (node.tagName === 'VIDEO') out.add(node);
        if (node.shadowRoot) {
            watchRoot(node.shadowRoot);
            scanRoot(node.shadowRoot, out);
        }
        if (node.querySelectorAll) {
            node.querySelectorAll('video').forEach((v) => out.add(v));
            const all = node.querySelectorAll('*');
            for (let i = 0; i < all.length; i++) {
                const shadow = all[i].shadowRoot;
                if (shadow) {
                    watchRoot(shadow);
                    scanRoot(shadow, out);
                }
            }
        }
    }

    function scanAndInject() {
        if (!isEnabled()) return;
        const found = new Set();
        watchRoot(document);
        scanRoot(document, found);
        found.forEach(tryWrapVideo);
    }

    function startObserver() {
        if (observer) return;
        observer = new MutationObserver((mutations) => {
            if (!isEnabled()) return;
            const found = new Set();
            for (const mutation of mutations) {
                if (mutation.type === 'attributes') {
                    // src 变化（换集/换源）：直接恢复按钮，不受 isProcessed 阻挡
                    const target = mutation.target;
                    if (target.tagName === 'VIDEO') {
                        ensureButton(target);
                    } else if (target.tagName === 'SOURCE' && target.parentNode && target.parentNode.tagName === 'VIDEO') {
                        ensureButton(target.parentNode);
                    }
                    continue;
                }
                for (const node of mutation.addedNodes) {
                    collectFromNode(node, found);
                }
            }
            if (found.size) found.forEach(tryWrapVideo);
        });
        watchRoot(document);
    }

    // ========== 初始化 ==========
    function init() {
        startObserver();
        // 每次页面加载时，按当前 localStorage 状态同步菜单文字
        updateMenuCommand();
        if (isEnabled()) {
            removeAllIcons();
            scanAndInject();
            setTimeout(scanAndInject, 500);
            setTimeout(scanAndInject, 1000);
            setTimeout(scanAndInject, 3000);
        }
        // 低频兜底：覆盖运行时才 attachShadow 的组件，以及动态挂载的视频
        setInterval(() => {
            if (!isEnabled() || document.hidden) return;
            scanAndInject();
        }, 10000);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
