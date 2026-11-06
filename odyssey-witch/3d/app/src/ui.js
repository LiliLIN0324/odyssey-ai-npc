// UI 层:加载页过渡 + 调试 HUD(P1 起扩展为 tris/calls/fps 三项)

export function initUI() {
  const overlay = document.getElementById('loading');
  const startBtn = document.getElementById('start-btn');
  const hud = document.getElementById('hud');

  let started = false;
  startBtn.addEventListener('click', () => {
    if (started) return;
    started = true;
    overlay.classList.add('hidden');
    setTimeout(() => overlay.remove(), 900);
  });

  const showHUD = (text) => { hud.textContent = text; };

  return { showHUD };
}
