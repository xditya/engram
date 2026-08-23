// Reveal each feature block as it scrolls into view. Blocks already on screen stay put.
(function () {
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var els = Array.prototype.slice.call(document.querySelectorAll('[data-reveal]'));
  if (reduce || !('IntersectionObserver' in window)) return;
  var show = function (el) { el.classList.remove('pending'); el.classList.add('shown'); };
  els.forEach(function (el) {
    if (el.getBoundingClientRect().top < window.innerHeight * 0.9) return;
    el.classList.add('pending');
  });
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) { if (e.isIntersecting) { show(e.target); io.unobserve(e.target); } });
  }, { rootMargin: '-60px' });
  els.forEach(function (el) { io.observe(el); });
  setTimeout(function () { els.forEach(show); }, 4000);
})();
