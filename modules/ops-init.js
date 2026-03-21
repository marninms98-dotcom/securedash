// ════════════════════════════════════════════════════════════
// INIT
// ════════════════════════════════════════════════════════════

function initApp() {
  cloud = window.SECUREWORKS_CLOUD;
  loadCrewList(); // Pre-cache crew list for dropdowns
  loadWeather(); // Non-blocking weather fetch
  restoreTab();
  // Handle browser back/forward for job detail
  window.addEventListener('popstate', function() {
    var hash = window.location.hash.slice(1);
    if (hash.startsWith('job/')) {
      var jobRef = hash.slice(4);
      openJobDetailByRef(jobRef);
    } else if (document.getElementById('jobDetailView').classList.contains('active')) {
      closeJobDetail(true);
    }
  });
}

// Wait for DOM + cloud.js to be ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}
