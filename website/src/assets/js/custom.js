/**
 * Custom JavaScript for CommandTree website
 * Extends mobile menu to also toggle nav-links on homepage
 */

(function() {
  'use strict';

  const initialized = { value: false };

  function closeMenu() {
    const navLinks = document.querySelector('.nav-links');
    if (navLinks) {
      navLinks.classList.remove('open');
    }
    document.body.classList.remove('menu-open');
  }

  function toggleNavLinks() {
    if (initialized.value) {
      return;
    }

    const toggle = document.getElementById('mobile-menu-toggle');
    const navLinks = document.querySelector('.nav-links');

    if (!toggle || !navLinks) {
      return;
    }

    toggle.addEventListener('click', function(e) {
      e.stopPropagation();
      navLinks.classList.toggle('open');
      document.body.classList.toggle('menu-open');
    });

    document.addEventListener('click', function(e) {
      const isMenuOpen = navLinks.classList.contains('open');
      const clickedInsideMenu = navLinks.contains(e.target);
      const clickedToggle = toggle.contains(e.target);

      if (isMenuOpen && !clickedInsideMenu && !clickedToggle) {
        closeMenu();
      }
    });

    const links = navLinks.querySelectorAll('a');
    links.forEach(function(link) {
      link.addEventListener('click', closeMenu);
    });

    initialized.value = true;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', toggleNavLinks);
  } else {
    toggleNavLinks();
  }
})();
