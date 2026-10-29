// ============================================================
// 登入與登出 (改用 Supabase Auth)
// ============================================================
async function login() {
    const user = document.getElementById('adminUser').value.trim(); // 這裡要輸入 Email 囉！
    const password = document.getElementById('adminPassword').value.trim();
    if (!user || !password) { showToast('請輸入 Email 與密碼'); return; }

    btnLogin.disabled = true; 
    btnLogin.textContent = '登入中...';
    
    // 改用 Supabase Auth 驗證
    const { data, error } = await _supabase.auth.signInWithPassword({
        email: user,
        password: password,
    });
    
    btnLogin.disabled = false; 
    btnLogin.textContent = '登入';

    if (error) { 
        showToast('❌ 帳號或密碼錯誤'); 
        return; 
    }

    sessionStorage.setItem('isAdmin', 'true');
    showToast('✅ 管理員登入成功');
    checkUser();
}

function logout() { 
    // 登出時也要通知 Supabase 清除憑證
    _supabase.auth.signOut();
    sessionStorage.removeItem('isAdmin'); 
    showToast('👋 已登出'); 
    checkUser(); 
}