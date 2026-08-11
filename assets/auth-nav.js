// Shared across every page: checks login state once, updates the nav's
// Subscribe button in place. Fails silently (leaves Subscribe as-is) on any
// error so a backend hiccup never breaks page rendering.
(function () {
  fetch('/api/user/me', { credentials: 'same-origin' })
    .then(function (r) { return r.json(); })
    .then(function (data) {
      if (!data.loggedIn) return;
      document.querySelectorAll('a.btn-primary[href="/#subscribe"]').forEach(function (btn) {
        btn.textContent = data.username;
        btn.href = '/account/';
        btn.title = data.isPatron ? data.username + ' (Patron)' : data.username;
      });
    })
    .catch(function () {});
})();
