// ════════════════════════════════════════════════════════════
// SecureWorks — Auth Gate
// Requires Supabase login before showing any page content.
// Include after cloud.js. Set allowed roles via meta tag:
//   <meta name="sw-allowed-roles" content="admin,ops_manager">
// ════════════════════════════════════════════════════════════

(function() {
  'use strict';

  var ALLOWED_ROLES = (function() {
    var meta = document.querySelector('meta[name="sw-allowed-roles"]');
    return meta ? meta.content.split(',').map(function(r){return r.trim();}) : [];
  })();

  // ── Hide main content immediately ──
  var style = document.createElement('style');
  style.textContent = '#mainApp,.main-content,main{display:none !important;}#swAuthGate{display:flex !important;}';
  document.head.appendChild(style);

  // ── Inject login modal ──
  function _injectGate() {
    if (document.getElementById('swAuthGate')) return;
    var gate = document.createElement('div');
    gate.id = 'swAuthGate';
    gate.style.cssText = 'position:fixed;inset:0;background:#293C46;display:flex;align-items:center;justify-content:center;z-index:99999;font-family:Helvetica,Arial,sans-serif;';
    gate.innerHTML =
      '<div style="background:#fff;border-radius:12px;padding:32px;max-width:380px;width:90%;box-shadow:0 8px 32px rgba(0,0,0,0.3);">' +
      '<div style="text-align:center;margin-bottom:24px;">' +
      '<div style="font-size:24px;font-weight:700;color:#293C46;">SecureWorks</div>' +
      '<div style="font-size:13px;color:#4C6A7C;margin-top:4px;">Sign in to continue</div>' +
      '</div>' +
      '<div id="swAuthError" style="display:none;padding:8px 12px;background:#fef3f2;border-radius:6px;color:#e74c3c;font-size:12px;margin-bottom:12px;"></div>' +
      '<label style="font-size:12px;font-weight:600;color:#4C6A7C;display:block;margin-bottom:4px;">Email</label>' +
      '<input id="swAuthEmail" type="email" style="width:100%;padding:10px 12px;border:1px solid #ddd;border-radius:6px;font-size:14px;box-sizing:border-box;margin-bottom:12px;" placeholder="you@secureworkswa.com.au">' +
      '<label style="font-size:12px;font-weight:600;color:#4C6A7C;display:block;margin-bottom:4px;">Password</label>' +
      '<input id="swAuthPassword" type="password" style="width:100%;padding:10px 12px;border:1px solid #ddd;border-radius:6px;font-size:14px;box-sizing:border-box;margin-bottom:16px;" placeholder="Your password">' +
      '<button id="swAuthSubmit" style="width:100%;padding:12px;background:#F15A29;color:#fff;border:none;border-radius:6px;font-size:14px;font-weight:700;cursor:pointer;">Sign In</button>' +
      '</div>';
    document.body.appendChild(gate);

    // Handle enter key
    gate.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') _doLogin();
    });
    document.getElementById('swAuthSubmit').addEventListener('click', _doLogin);
  }

  function _showError(msg) {
    var el = document.getElementById('swAuthError');
    if (el) { el.textContent = msg; el.style.display = 'block'; }
  }

  function _doLogin() {
    var email = document.getElementById('swAuthEmail').value.trim();
    var password = document.getElementById('swAuthPassword').value;
    if (!email || !password) { _showError('Email and password required'); return; }

    var btn = document.getElementById('swAuthSubmit');
    btn.disabled = true; btn.textContent = 'Signing in...';

    _waitForCloud(function(cloud) {
      cloud.auth.signIn(email, password).then(function(profile) {
        _checkRole(cloud, profile);
      }).catch(function(err) {
        btn.disabled = false; btn.textContent = 'Sign In';
        _showError(err.message || 'Login failed');
      });
    });
  }

  function _checkRole(cloud, profile) {
    if (!profile) { _showError('Login failed'); return; }
    var role = profile.role || 'unknown';
    if (ALLOWED_ROLES.length > 0 && ALLOWED_ROLES.indexOf(role) === -1) {
      _showError('Access denied — your role (' + role + ') does not have permission for this page.');
      cloud.auth.signOut();
      var btn = document.getElementById('swAuthSubmit');
      if (btn) { btn.disabled = false; btn.textContent = 'Sign In'; }
      return;
    }
    _unlock();
  }

  function _unlock() {
    // Remove gate, show content
    var gate = document.getElementById('swAuthGate');
    if (gate) gate.remove();
    var style2 = document.querySelector('style');
    if (style2 && style2.textContent.indexOf('swAuthGate') >= 0) style2.remove();
    // Show main content
    var main = document.getElementById('mainApp') || document.querySelector('.main-content') || document.querySelector('main');
    if (main) main.style.display = '';
  }

  function _waitForCloud(cb) {
    if (window.SECUREWORKS_CLOUD) { cb(window.SECUREWORKS_CLOUD); return; }
    var attempts = 0;
    var interval = setInterval(function() {
      attempts++;
      if (window.SECUREWORKS_CLOUD) { clearInterval(interval); cb(window.SECUREWORKS_CLOUD); }
      else if (attempts > 50) { clearInterval(interval); _showError('System failed to initialize'); }
    }, 100);
  }

  // ── On page load: check existing session ──
  document.addEventListener('DOMContentLoaded', function() {
    _injectGate();

    _waitForCloud(function(cloud) {
      // Check if already logged in (existing session)
      if (cloud.auth.isLoggedIn()) {
        var profile = cloud.auth.getUser();
        _checkRole(cloud, profile);
      }

      // Listen for future login events (e.g. from onAuthStateChange)
      cloud.on('auth:login', function(profile) {
        _checkRole(cloud, profile);
      });

      // Listen for logout
      cloud.on('auth:logout', function() {
        _injectGate();
      });
    });
  });
})();
