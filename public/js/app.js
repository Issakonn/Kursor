/* ============================================================
 KURSOR — Общая логика (навбар, утилиты). Использует window.API.
 ============================================================ */

function requireAuth(allowedRoles) {
 return API.requireAuth(allowedRoles);
}

function renderNavbar(activePage) {
 const user = API.getCurrentUser();
 if (!user) return '';
 const initial = (user.name || 'У').charAt(0).toUpperCase();
 const links = user.role === 'student'? [
 { href:'/pages/dashboard.html', icon:'https://cdn-icons-png.flaticon.com/512/1946/1946436.png', label:'Главная', key:'dashboard' },
 { href:'/pages/catalog.html', icon:'https://cdn-icons-png.flaticon.com/512/2232/2232688.png', label:'Задачи', key:'catalog' },
 { href:'/pages/leaderboard.html', icon:'https://cdn-icons-png.flaticon.com/512/2583/2583344.png', label:'Рейтинг', key:'leaderboard' },
 { href:'/pages/profile.html', icon:'https://cdn-icons-png.flaticon.com/512/1144/1144760.png', label:'Профиль', key:'profile' },
 ]: user.role === 'teacher'? [
 { href:'/pages/teacher.html', icon:'https://cdn-icons-png.flaticon.com/512/1995/1995450.png', label:'Ученики', key:'teacher' },
 { href:'/pages/catalog.html', icon:'https://cdn-icons-png.flaticon.com/512/2232/2232688.png', label:'Задачи', key:'catalog' },
 { href:'/admin/index.html', icon:'https://cdn-icons-png.flaticon.com/512/3524/3524388.png', label:'Управление', key:'admin' },
 ]: [
 { href:'/admin/index.html', icon:'https://cdn-icons-png.flaticon.com/512/3524/3524388.png', label:'Админ-панель', key:'admin' },
 ];

 return `
 <nav class="navbar">
 <a class="navbar-logo" href="/index.html">
 <img src="${KURSOR_DB.LOGO}" alt="КУРСОР">
 </a>
 <div class="navbar-menu">
 ${links.map(l => `<a href="${l.href}" class="${l.key === activePage? 'active': ''}" style="display:inline-flex;align-items:center;gap:8px"><img class="ic ic-20" src="${l.icon}" alt=""> ${l.label}</a>`).join('')}
 </div>
 <div class="navbar-user" style="cursor:pointer">
 <a href="/pages/profile.html" style="display:flex;align-items:center;gap:8px;text-decoration:none;color:inherit" title="Мой профиль">
 ${user.avatar_url
? `<img src="${escapeHtml(user.avatar_url)}" alt="" style="width:40px;height:40px;border-radius:50%;object-fit:cover">`
: `<div class="avatar">${initial}</div>`}
 <div>
 <div style="font-weight:700;font-size:13px">${escapeHtml(user.name)}</div>
 <div style="font-size:11px;color:#64748b">Мой профиль</div>
 </div>
 </a>
 <span onclick="logout()" title="Выйти" style="margin-left:8px;padding:6px 10px;border-radius:6px;cursor:pointer;display:inline-flex;align-items:center" aria-label="Выйти"><img class="ic ic-20" src="https://cdn-icons-png.flaticon.com/512/1828/1828427.png" alt="Выйти"></span>
 </div>
 </nav>`;
}

function logout() {
 API.logout();
 window.location.href = '/index.html';
}

function showToast(msg, type='info') {
 const t = document.createElement('div');
 t.style.cssText = `position:fixed;top:80px;right:24px;background:${type==='success'?'#10b981':type==='error'?'#ef4444':'#3b82f6'};color:white;padding:14px 22px;border-radius:12px;font-weight:700;z-index:9999;box-shadow:0 8px 30px rgba(0,0,0,0.2);animation:fadeIn 0.3s`;
 t.textContent = msg;
 document.body.appendChild(t);
 setTimeout(() => { t.style.opacity='0'; t.style.transition='all 0.3s'; }, 2500);
 setTimeout(() => t.remove(), 3000);
}

function fireConfetti() {
 const colors = ['#fbbf24','#a855f7','#10b981','#3b82f6','#ec4899'];
 for (let i = 0; i < 80; i++) {
 const p = document.createElement('div');
 const size = 6 + Math.random() * 8;
 p.style.cssText = `position:fixed;width:${size}px;height:${size}px;background:${colors[i%5]};top:30%;left:${Math.random()*100}%;border-radius:${Math.random()>0.5?'50%':'2px'};z-index:9999;pointer-events:none;transition:all 2s ease-out;`;
 document.body.appendChild(p);
 requestAnimationFrame(() => {
 p.style.top = (60 + Math.random() * 40) + '%';
 p.style.left = (Math.random() * 100) + '%';
 p.style.transform = `rotate(${Math.random()*720}deg)`;
 p.style.opacity = '0';
 });
 setTimeout(() => p.remove(), 2500);
 }
}

function escapeHtml(s) {
 return String(s?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function getQueryParam(name) {
 return new URLSearchParams(window.location.search).get(name);
}

window.requireAuth = requireAuth;
window.renderNavbar = renderNavbar;
window.logout = logout;
window.showToast = showToast;
window.fireConfetti = fireConfetti;
window.escapeHtml = escapeHtml;
window.getQueryParam = getQueryParam;
