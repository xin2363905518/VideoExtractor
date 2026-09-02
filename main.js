// ==UserScript==
// @name         视频提取器
// @namespace   https://github.com/xin2363905518/VideoExtractor
// @version      1.0.11
// @description  提取页面中的视频到独立浏览器播放器中播放，支持直链/HLS/DASH，并支持 blob 直播流的浮层播放（含网页全屏、拖拽、缩放，自定义控制栏）
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

    // ==========================================
    // 1. 开关管理（使用 sessionStorage 存储，仅当前标签页有效）
    // ==========================================
    const STORAGE_KEY = 'videoExtractor_enabled';

    function isEnabled() {
        return sessionStorage.getItem(STORAGE_KEY) === 'true';
    }

    function setEnabled(val) {
        sessionStorage.setItem(STORAGE_KEY, val ? 'true' : 'false');
    }

    function toggleEnabled() {
        const next = !isEnabled();
        setEnabled(next);
        if (next) {
            scanAndInject();
        } else {
            removeAllIcons();
        }
        alert('视频提取器：已' + (next ? '开启' : '关闭'));
    }

    GM_registerMenuCommand('切换 视频提取器', toggleEnabled);

    // ==========================================
    // 2. 全局 CSS 样式
    // ==========================================
    const CSS = `
.video-extractor-wrapper {
    position: relative;
    display: inline-block;
}
.video-extractor-wrapper video {
    display: block;
}
.video-extractor-icon {
    position: absolute;
    top: 8px;
    right: 8px;
    width: 36px;
    height: 36px;
    border-radius: 50%;
    background: rgba(0, 0, 0);
    color: #fff;
    font-size: 18px;
    line-height: 36px;
    text-align: center;
    cursor: pointer;
    z-index: 99999;
//     border: 2px solid rgba(255, 255, 255, 0.5);
    transition: background 0.2s, transform 0.2s;
    user-select: none;
    -webkit-user-select: none;
}
.video-extractor-icon:hover {
    background: rgba(0, 0, 0, 0.8);
    transform: scale(1.15);
    border-color: rgba(255, 255, 255, 0.9);
}
.video-extractor-icon svg {
    width: 20px;
    height: 20px;
    vertical-align: middle;
    margin-top: -2px;
}

/* 浮层播放器样式 */
.ve-overlay {
    position: fixed;
    top: 0; left: 0; right: 0; bottom: 0;
    background: rgba(0,0,0,0.8);
    z-index: 999999;
    display: flex;
    align-items: center;
    justify-content: center;
}
.ve-player-container {
    position: relative;
    width: 80%;
    height: 80%;
    min-width: 320px;
    min-height: 240px;
    background: #000;
    border-radius: 8px;
    box-shadow: 0 0 30px rgba(0,0,0,0.7);
    overflow: hidden;
    resize: both;
    transition: width 0.3s, height 0.3s, border-radius 0.3s;
}
.ve-player-container video,
.ve-player-container .video-extractor-wrapper {
    width: 100% !important;
    height: 100% !important;
    display: block !important;
    object-fit: contain !important;
}
.ve-player-container .video-extractor-wrapper {
    position: relative;
}
.ve-player-container .video-extractor-icon {
    display: none;
}
.ve-btn {
    position: absolute;
    top: 10px;
    width: 40px;
    height: 40px;
    border-radius: 50%;
    background: rgba(0,0,0,0.7);
    color: #fff;
    font-size: 20px;
    line-height: 40px;
    text-align: center;
    cursor: pointer;
    z-index: 1000;
//     border: 2px solid rgba(255,255,255,0.5);
    transition: background 0.2s, transform 0.2s;
    user-select: none;
    padding: 0;
}
.ve-btn:hover {
    background: rgba(255,255,255,0.3);
    transform: scale(1.1);
}
.ve-close-btn {
    right: 10px;
    background: rgba(0,0,0,0.7);
}
.ve-close-btn:hover {
    background: rgba(255,0,0,0.8);
}
.ve-fullscreen-btn {
    right: 60px;
}
.ve-webfullscreen-btn {
    right: 110px;
}

/* 网页全屏模式 */
.ve-player-container.ve-web-fullscreen {
    width: 100vw !important;
    height: 100vh !important;
    border-radius: 0;
    box-shadow: none;
    resize: none;
}
.ve-player-container.ve-web-fullscreen .ve-btn {
    top: 20px;
    transform: scale(1.1);
}

/* 自定义控制栏 */
.ve-custom-controls {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    height: 50px;
    background: linear-gradient(to top, rgba(0,0,0,0.9), rgba(0,0,0,0.3));
    display: flex;
    align-items: center;
    padding: 0 15px;
    z-index: 1001;
    opacity: 0;
    transition: opacity 0.3s;
    pointer-events: none;
}
.ve-player-container.ve-web-fullscreen .ve-custom-controls {
    opacity: 1;
    pointer-events: auto;
}
.ve-custom-controls button {
    background: none;
    border: none;
    color: #fff;
    font-size: 18px;
    cursor: pointer;
    margin-right: 10px;
    padding: 5px;
    flex: none;
}
.ve-custom-controls .ve-time {
    color: #fff;
    font-size: 13px;
    margin: 0 8px;
    white-space: nowrap;
    flex: none;
}
.ve-custom-controls .ve-progress-container {
    display: flex;
    align-items: center;
    flex: 3;  /* 进度条区域占 3/4 */
    min-width: 0;
}
.ve-custom-controls .ve-volume-container {
    display: flex;
    align-items: center;
    flex: 1;  /* 音量区域占 1/4 */
    min-width: 0;
}
.ve-custom-controls input[type="range"] {
    -webkit-appearance: none;
    appearance: none;
    background: rgba(255,255,255,0.3);
    height: 4px;
    border-radius: 2px;
    outline: none;
    cursor: pointer;
}
.ve-custom-controls .ve-progress-slider {
    flex: 1;
    margin: 0 5px;
}
.ve-custom-controls .ve-volume-slider {
    flex: 1;
    margin: 0 5px;
}
.ve-custom-controls input[type="range"]::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: #fff;
    cursor: pointer;
}
.ve-custom-controls .ve-volume-icon {
    font-size: 18px;
    margin: 0 5px;
    flex: none;
}
`;

    GM_addStyle(CSS);

    // ==========================================
    // 3. 工具函数
    // ==========================================
    function isProcessed(video) {
        return video.dataset.videoExtractorProcessed === '1';
    }
    function markProcessed(video) {
        video.dataset.videoExtractorProcessed = '1';
        delete video.dataset.vePending;
    }
    function unmarkProcessed(video) {
        delete video.dataset.videoExtractorProcessed;
        delete video.dataset.vePending;
    }
    function isPending(video) {
        return video.dataset.vePending === '1';
    }
    function markPending(video) {
        video.dataset.vePending = '1';
    }
    function getVideoSources(video) {
        const sources = [];
        if (video.src && (video.src.startsWith('http') || video.src.startsWith('blob:'))) {
            sources.push({ url: video.src, type: video.getAttribute('type') || guessMimeByUrl(video.src) });
        }
        video.querySelectorAll('source').forEach(src => {
            const url = src.src;
            if (url && (url.startsWith('http') || url.startsWith('blob:'))) {
                sources.push({ url: url, type: src.type || guessMimeByUrl(url) });
            }
        });
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

    // ==========================================
    // 4. SVG 图标
    // ==========================================
    const ICON_SVG = `
<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <polygon points="5 3 19 12 5 21 5 3"></polygon>
    <rect x="2" y="1" width="20" height="22" rx="2" ry="2" stroke="rgba(255,255,255,0.3)" fill="none" stroke-width="1"/>
</svg>`;
    function createIconSVG() {
        const div = document.createElement('div');
        div.innerHTML = ICON_SVG;
        return div.firstElementChild;
    }

    // ==========================================
    // 5. 图标注入与移除（改进版）
    // ==========================================
    function wrapVideo(video) {
        if (isProcessed(video)) return true;
        const sources = getVideoSources(video);
        if (sources.length === 0) return false;

        const parent = video.parentNode;
        if (!parent) return false;

        const wrapper = document.createElement('span');
        wrapper.className = 'video-extractor-wrapper';
        parent.insertBefore(wrapper, video);
        wrapper.appendChild(video);

        const icon = document.createElement('span');
        icon.className = 'video-extractor-icon';
        icon.title = '提取视频到独立播放器';
        icon.appendChild(createIconSVG());
        icon.addEventListener('click', (e) => {
            e.stopPropagation();
            e.preventDefault();
            extractVideo(video);
        });

        wrapper.appendChild(icon);
        markProcessed(video);
        return true;
    }

    function unwrapVideo(video) {
        if (!isProcessed(video)) return;
        const wrapper = video.parentNode;
        if (!wrapper || !wrapper.classList.contains('video-extractor-wrapper')) return;
        const grandParent = wrapper.parentNode;
        if (grandParent) {
            grandParent.insertBefore(video, wrapper);
            grandParent.removeChild(wrapper);
        }
        // 清除可能残留的变换样式
        video.style.transform = '';
        unmarkProcessed(video);
    }

    function removeAllIcons() {
        document.querySelectorAll('video[data-video-extractor-processed="1"]').forEach(v => unwrapVideo(v));
        document.querySelectorAll('video[data-ve-pending="1"]').forEach(v => delete v.dataset.vePending);
    }

    function tryWrapVideo(video) {
        if (isProcessed(video)) return;
        if (!wrapVideo(video)) {
            if (!isPending(video)) {
                markPending(video);
                scheduleRetry(video);
            }
        }
    }

    const pendingVideos = new Map();

    function scheduleRetry(video) {
        if (pendingVideos.has(video)) return;
        const timer = setInterval(() => {
            if (!video.isConnected) {
                clearInterval(timer);
                pendingVideos.delete(video);
                return;
            }
            if (wrapVideo(video)) {
                clearInterval(timer);
                pendingVideos.delete(video);
            }
        }, 1000);
        pendingVideos.set(video, timer);
    }

    // ==========================================
    // 6. 视频提取 + 播放器页面生成
    // ==========================================
    function extractVideo(video) {
        const sources = getVideoSources(video);
        if (sources.length === 0) {
            alert('未能检测到有效的视频源。\n\n提示：某些网站使用 MSE 动态推流（如 B站/YouTube），无法直接提取。');
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

    // ========== 提取 blob 视频：浮层播放器 ==========
    function extractBlobVideo(video) {
        let containerElement = video;
        let originalParent = video.parentNode;
        let originalNextSibling = video.nextSibling;
        if (video.parentNode && video.parentNode.classList.contains('video-extractor-wrapper')) {
            containerElement = video.parentNode;
            originalParent = containerElement.parentNode;
            originalNextSibling = containerElement.nextSibling;
        }

        const overlay = document.createElement('div');
        overlay.className = 've-overlay';
        const playerContainer = document.createElement('div');
        playerContainer.className = 've-player-container';
        const actualVideo = video;

        // 保存原始 controls 状态
        const originalControls = actualVideo.controls;

        // 状态变量
        let webFullscreenActive = false;
        let scale = 1;
        let translateX = 0;
        let translateY = 0;
        let isDragging = false;
        let dragStartX = 0, dragStartY = 0;
        let startTranslateX = 0, startTranslateY = 0;
        let suppressClick = false;

        function updateVideoTransform() {
            actualVideo.style.transform = `translate(${translateX}px, ${translateY}px) scale(${scale})`;
            actualVideo.style.transformOrigin = 'center center';
        }

        function clearTransform() {
            // 彻底清除变换样式，恢复原始
            actualVideo.style.transform = '';
            actualVideo.style.transformOrigin = '';
            scale = 1;
            translateX = 0;
            translateY = 0;
        }

        // ========== 创建顶部按钮 ==========
        const closeBtn = document.createElement('button');
        closeBtn.className = 've-btn ve-close-btn';
        closeBtn.innerHTML = '✕';
        closeBtn.title = '关闭';
        closeBtn.addEventListener('click', () => {
            // 还原视频到原位置
            if (originalParent) {
                if (originalNextSibling) originalParent.insertBefore(containerElement, originalNextSibling);
                else originalParent.appendChild(containerElement);
            }
            // 清除变换
            clearTransform();
            // 恢复 controls
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
            const isWebFullscreen = playerContainer.classList.toggle('ve-web-fullscreen');
            webFullscreenActive = isWebFullscreen;
            webFullscreenBtn.innerHTML = isWebFullscreen ? '⤡' : '⤢';
            webFullscreenBtn.title = isWebFullscreen ? '退出网页全屏' : '网页全屏';
            if (isWebFullscreen) {
                actualVideo.style.cursor = 'grab';
                // 进入网页全屏时，清空变换
                clearTransform();
                actualVideo.controls = false;
                customControls.style.display = 'flex';
                syncVolumeUI();
            } else {
                actualVideo.style.cursor = '';
                // 退出网页全屏，彻底清除变换
                clearTransform();
                isDragging = false;
                actualVideo.controls = originalControls;
                customControls.style.display = 'none';
            }
        });

        // ========== 创建自定义控制栏 ==========
        const customControls = document.createElement('div');
        customControls.className = 've-custom-controls';
        customControls.style.display = 'none';

        // 播放/暂停按钮
        const playPauseBtn = document.createElement('button');
        playPauseBtn.innerHTML = actualVideo.paused ? '▶' : '⏸';
        playPauseBtn.title = '播放/暂停';
        playPauseBtn.addEventListener('click', () => {
            if (actualVideo.paused) actualVideo.play().catch(() => {});
            else actualVideo.pause();
        });

        // 进度条容器
        const progressContainer = document.createElement('div');
        progressContainer.className = 've-progress-container';

        const currentTimeSpan = document.createElement('span');
        currentTimeSpan.className = 've-time';
        currentTimeSpan.textContent = '0:00';

        const progressSlider = document.createElement('input');
        progressSlider.type = 'range';
        progressSlider.className = 've-progress-slider';
        progressSlider.min = 0;
        progressSlider.max = 100;
        progressSlider.value = 0;
        progressSlider.step = 0.1;
        progressSlider.addEventListener('input', () => {
            const duration = actualVideo.duration;
            if (duration && isFinite(duration)) {
                actualVideo.currentTime = (progressSlider.value / 100) * duration;
            }
        });

        const durationSpan = document.createElement('span');
        durationSpan.className = 've-time';
        durationSpan.textContent = '0:00';

        progressContainer.appendChild(currentTimeSpan);
        progressContainer.appendChild(progressSlider);
        progressContainer.appendChild(durationSpan);

        // 音量容器
        const volumeContainer = document.createElement('div');
        volumeContainer.className = 've-volume-container';

        const volumeIcon = document.createElement('span');
        volumeIcon.className = 've-volume-icon';
        volumeIcon.textContent = '🔊';

        const volumeSlider = document.createElement('input');
        volumeSlider.type = 'range';
        volumeSlider.className = 've-volume-slider';
        volumeSlider.min = 0;
        volumeSlider.max = 100;
        volumeSlider.value = actualVideo.volume * 100;
        volumeSlider.addEventListener('input', () => {
            const newVolume = volumeSlider.value / 100;
            actualVideo.muted = false;
            actualVideo.volume = newVolume;
            updateVolumeIcon();
        });

        function updateVolumeIcon() {
            if (actualVideo.muted || actualVideo.volume === 0) {
                volumeIcon.textContent = '🔇';
            } else if (actualVideo.volume < 0.5) {
                volumeIcon.textContent = '🔉';
            } else {
                volumeIcon.textContent = '🔊';
            }
        }

        function syncVolumeUI() {
            volumeSlider.value = actualVideo.volume * 100;
            updateVolumeIcon();
        }

        volumeContainer.appendChild(volumeIcon);
        volumeContainer.appendChild(volumeSlider);

        // 组装控制栏
        customControls.appendChild(playPauseBtn);
        customControls.appendChild(progressContainer);
        customControls.appendChild(volumeContainer);

        // ========== 视频事件监听 ==========
        function formatTime(seconds) {
            if (!isFinite(seconds) || seconds < 0) return '0:00';
            const hrs = Math.floor(seconds / 3600);
            const mins = Math.floor((seconds % 3600) / 60);
            const secs = Math.floor(seconds % 60);
            return hrs > 0 ? `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}` : `${mins}:${secs.toString().padStart(2, '0')}`;
        }

        actualVideo.addEventListener('timeupdate', () => {
            if (actualVideo.duration) {
                const percent = (actualVideo.currentTime / actualVideo.duration) * 100;
                progressSlider.value = percent;
                currentTimeSpan.textContent = formatTime(actualVideo.currentTime);
            }
        });

        actualVideo.addEventListener('loadedmetadata', () => {
            durationSpan.textContent = formatTime(actualVideo.duration);
            progressSlider.max = 100;
            progressSlider.value = 0;
        });

        actualVideo.addEventListener('play', () => {
            playPauseBtn.innerHTML = '⏸';
        });
        actualVideo.addEventListener('pause', () => {
            playPauseBtn.innerHTML = '▶';
        });
        actualVideo.addEventListener('volumechange', () => {
            syncVolumeUI();
        });

        // ========== 拖拽与缩放 ==========
        actualVideo.addEventListener('mousedown', (e) => {
            if (!webFullscreenActive) return;
            if (e.button !== 0) return;
            isDragging = true;
            dragStartX = e.clientX;
            dragStartY = e.clientY;
            startTranslateX = translateX;
            startTranslateY = translateY;
            suppressClick = false;
            e.preventDefault();
            actualVideo.style.cursor = 'grabbing';
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
                actualVideo.style.cursor = 'grab';
                if (suppressClick) {
                    setTimeout(() => { suppressClick = false; }, 0);
                }
            }
        });

        actualVideo.addEventListener('click', (e) => {
            if (webFullscreenActive && suppressClick) {
                e.preventDefault();
                e.stopPropagation();
                suppressClick = false;
            }
        }, { capture: true });

        actualVideo.addEventListener('wheel', (e) => {
            if (!webFullscreenActive) return;
            e.preventDefault();
            const delta = e.deltaY > 0 ? -0.1 : 0.1;
            scale = Math.min(3, Math.max(0.5, scale + delta));
            updateVideoTransform();
        }, { passive: false });

        // ========== 组装浮层 ==========
        playerContainer.appendChild(containerElement);
        playerContainer.appendChild(closeBtn);
        playerContainer.appendChild(fullscreenBtn);
        playerContainer.appendChild(webFullscreenBtn);
        playerContainer.appendChild(customControls);
        overlay.appendChild(playerContainer);
        document.body.appendChild(overlay);

        // 初始状态
        actualVideo.controls = originalControls;
        customControls.style.display = 'none';

        if (video.paused) {
            video.play().catch(() => {});
        }
    }

    // ========== 构建普通播放器 HTML ==========
    function buildPlayerHTML(bestSource, allSources) {
        const title = escapeHtml(document.title || '视频播放器');

        let sourceListHTML = '';
        allSources.forEach((s, i) => {
            const label = s.type || s.url.split('.').pop() || '未知';
            const selected = s.url === bestSource.url ? ' selected' : '';
            sourceListHTML += `<option value="${escapeHtml(s.url)}"${selected}>${escapeHtml(label)} — ${escapeHtml(s.url)}</option>`;
        });

        const bestUrl = escapeHtml(bestSource.url);
        const bestType = escapeHtml(bestSource.type || '');

        return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title} — 视频提取器</title>
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
html, body { width: 100%; height: 100%; overflow: hidden; background: #000; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }

#toolbar {
    position: fixed; top: 0; left: 0; right: 0; z-index: 100;
    display: flex; align-items: center; gap: 12px;
    padding: 10px 16px;
    background: linear-gradient(to bottom, rgba(0,0,0,0.8), rgba(0,0,0,0));
    transition: opacity 0.4s;
}
#toolbar.hidden { opacity: 0; pointer-events: none; }

#toolbar select {
    flex: 1; max-width: 500px;
    padding: 6px 10px; border-radius: 6px; border: 1px solid rgba(255,255,255,0.3);
    background: rgba(0,0,0,0.7); color: #fff; font-size: 13px;
    outline: none;
}
#toolbar select:focus { border-color: #4fc3f7; }

#toolbar button {
    padding: 6px 14px; border-radius: 6px; border: 1px solid rgba(255,255,255,0.3);
    background: rgba(0,0,0,0.7); color: #fff; font-size: 13px; cursor: pointer;
    transition: background 0.2s;
}
#toolbar button:hover { background: rgba(255,255,255,0.2); }
#toolbar button.active { background: #4fc3f7; color: #000; border-color: #4fc3f7; }

#video-container {
    width: 100%; height: 100%;
    display: flex; align-items: center; justify-content: center;
}
video {
    max-width: 100%; max-height: 100%;
    outline: none;
}

#info {
    position: fixed; bottom: 16px; left: 50%; transform: translateX(-50%);
    color: rgba(255,255,255,0.5); font-size: 12px;
    transition: opacity 0.4s;
    pointer-events: none;
}
#info.hidden { opacity: 0; }
</style>
</head>
<body>

<div id="toolbar">
    <select id="source-select" title="切换视频源">
        ${sourceListHTML}
    </select>
    <button id="btn-fullscreen" title="网页全屏 (F)">⛶ 全屏</button>
    <button id="btn-pip" title="画中画 (P)">🖼 画中画</button>
</div>

<div id="video-container">
    <video id="player"
        ${bestType ? `type="${bestType}"` : ''}
        src="${bestUrl}"
        controls
        crossorigin="anonymous"
        playsinline
        autoplay>
    </video>
</div>

<div id="info">空格 暂停/播放 · ← → 快退/快进 · F 全屏 · P 画中画 · M 静音</div>

<script src="https://cdn.jsdelivr.net/npm/hls.js@latest"></script>
<script src="https://cdn.jsdelivr.net/npm/dashjs@latest"></script>
<script>
(function() {
    const player = document.getElementById('player');
    const sourceSelect = document.getElementById('source-select');
    const btnFullscreen = document.getElementById('btn-fullscreen');
    const btnPip = document.getElementById('btn-pip');
    const toolbar = document.getElementById('toolbar');
    const info = document.getElementById('info');

    let hls = null;
    let dashPlayer = null;
    let hideTimer = null;

    function destroyPlayers() {
        if (hls) { hls.destroy(); hls = null; }
        if (dashPlayer) { dashPlayer.reset(); dashPlayer = null; }
        player.src = '';
        player.removeAttribute('src');
        player.removeAttribute('type');
    }

    function loadSource(url) {
        destroyPlayers();
        const lower = url.toLowerCase();

        if (lower.endsWith('.m3u8') && Hls.isSupported()) {
            hls = new Hls();
            hls.loadSource(url);
            hls.attachMedia(player);
            hls.on(Hls.Events.MANIFEST_PARSED, () => {
                player.play().catch(() => {});
            });
        } else if (lower.endsWith('.mpd')) {
            dashPlayer = dashjs.MediaPlayer().create();
            dashPlayer.initialize(player, url, true);
        } else {
            player.src = url;
            player.play().catch(() => {});
        }
    }

    sourceSelect.addEventListener('change', () => {
        loadSource(sourceSelect.value);
    });

    function toggleFullscreen() {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen();
            btnFullscreen.classList.add('active');
        } else {
            document.exitFullscreen();
            btnFullscreen.classList.remove('active');
        }
    }

    btnFullscreen.addEventListener('click', toggleFullscreen);
    document.addEventListener('fullscreenchange', () => {
        btnFullscreen.classList.toggle('active', !!document.fullscreenElement);
    });

    btnPip.addEventListener('click', async () => {
        try {
            if (document.pictureInPictureElement) {
                await document.exitPictureInPicture();
            } else {
                await player.requestPictureInPicture();
            }
        } catch (e) {
            alert('画中画模式不支持：' + e.message);
        }
    });

    function showUI() {
        toolbar.classList.remove('hidden');
        info.classList.remove('hidden');
        clearTimeout(hideTimer);
        hideTimer = setTimeout(() => {
            toolbar.classList.add('hidden');
            info.classList.add('hidden');
        }, 3000);
    }

    document.addEventListener('mousemove', showUI);
    showUI();

    document.addEventListener('keydown', (e) => {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;

        switch (e.key) {
            case ' ':
                e.preventDefault();
                if (player.paused) player.play(); else player.pause();
                break;
            case 'ArrowLeft':
                e.preventDefault();
                player.currentTime = Math.max(0, player.currentTime - 5);
                break;
            case 'ArrowRight':
                e.preventDefault();
                player.currentTime = Math.min(player.duration || Infinity, player.currentTime + 5);
                break;
            case 'f':
            case 'F':
                e.preventDefault();
                toggleFullscreen();
                break;
            case 'p':
            case 'P':
                e.preventDefault();
                btnPip.click();
                break;
            case 'm':
            case 'M':
                e.preventDefault();
                player.muted = !player.muted;
                break;
        }
    });

    const initUrl = sourceSelect.value;
    if (initUrl) {
        loadSource(initUrl);
    }
})();
</script>
</body>
</html>`;
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

// ==========================================
// 7. 视频扫描与 MutationObserver
// ==========================================
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
                    if (node.tagName === 'VIDEO') {
                        videosToCheck.add(node);
                    }
                    if (node.querySelectorAll) {
                        node.querySelectorAll('video').forEach(v => videosToCheck.add(v));
                    }
                }
            }
            if (mutation.type === 'attributes' && mutation.target.tagName === 'VIDEO') {
                videosToCheck.add(mutation.target);
            }
        }

        videosToCheck.forEach(tryWrapVideo);
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['src']
    });
}

// ==========================================
// 8. 初始化
// ==========================================
function init() {
    startObserver();
    if (isEnabled()) {
        setTimeout(scanAndInject, 500);
        setTimeout(scanAndInject, 2000);
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}

})();
