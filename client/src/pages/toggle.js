document.addEventListener('DOMContentLoaded', () => {
    const body = document.body;
    const savedTheme = localStorage.getItem('app-theme');

    // 1. Page load hote hi Theme Apply karo (Har page ke liye zaroori)
    if (savedTheme === 'dark') {
        body.classList.add('dark-mode');
    }

    // 2. Toggle Button Logic (Sirf agar button page par maujood hai)
    const btn = document.getElementById('theme-toggle');
    
    if (btn) {
        // Icon set karo current state ke hisab se
        btn.innerHTML = body.classList.contains('dark-mode') ? '☀️' : '🌙';

        btn.addEventListener('click', () => {

            // 👇 YEH LINE ADD KAREIN: Purana fix hatao taaki light mode aa sake
    const flashFix = document.getElementById('flash-fix');
    if (flashFix) flashFix.remove();
    
            body.classList.toggle('dark-mode');
            
            // Save & Update Icon
            if (body.classList.contains('dark-mode')) {
                localStorage.setItem('app-theme', 'dark');
                btn.innerHTML = '☀️';
            } else {
                localStorage.setItem('app-theme', 'light');
                btn.innerHTML = '🌙';
            }
        });
    }
});