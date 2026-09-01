/* ============================================
   CRYSTAL EYE TRACKING — Built by Bots
   Makes all crystal avatar eyes follow the cursor.
   Drop this script on any page with crystal avatars.
   Atari Jaguar vibes — the crystals are alive.
   ============================================ */

(function() {
  'use strict';

  // Wait for DOM
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  function init() {
    // Find all crystal avatar images
    const avatars = document.querySelectorAll('img[src*="avatar"], img[src*="ami-avatar"], img[src*="hal-avatar"], img[src*="hermes-avatar"], img[src*="ghost-avatar"]');
    
    if (avatars.length === 0) return;

    // Create eye overlay for each avatar
    avatars.forEach(function(avatar) {
      // Skip if already has eyes
      if (avatar.dataset.crystalEyes) return;
      avatar.dataset.crystalEyes = 'true';

      // Wrap avatar in a container if not already
      const wrapper = document.createElement('div');
      wrapper.className = 'crystal-eye-wrapper';
      wrapper.style.cssText = 'position:relative;display:inline-block;overflow:visible';
      
      const parent = avatar.parentNode;
      parent.insertBefore(wrapper, avatar);
      wrapper.appendChild(avatar);

      // Determine agent color from src
      let eyeColor = '#a855f7'; // default purple (Ami)
      const src = avatar.src.toLowerCase();
      if (src.includes('hal')) eyeColor = '#00d4ff';
      else if (src.includes('hermes')) eyeColor = '#ffc864';
      else if (src.includes('ghost')) eyeColor = '#35f39a';

      // Create eye elements — two pupils that move
      const eyeContainer = document.createElement('div');
      eyeContainer.className = 'crystal-eye-overlay';
      eyeContainer.style.cssText = 'position:absolute;top:35%;left:25%;width:50%;height:30%;pointer-events:none;z-index:2';

      // Left eye
      const leftEye = document.createElement('div');
      leftEye.className = 'crystal-pupil';
      leftEye.style.cssText = 'position:absolute;width:12%;height:30%;border-radius:50%;background:rgba(15,10,25,0.85);left:15%;top:30%;transition:transform 0.15s ease-out;box-shadow:0 0 4px ' + eyeColor;

      // Right eye
      const rightEye = document.createElement('div');
      rightEye.className = 'crystal-pupil';
      rightEye.style.cssText = 'position:absolute;width:12%;height:30%;border-radius:50%;background:rgba(15,10,25,0.85);left:65%;top:30%;transition:transform 0.15s ease-out;box-shadow:0 0 4px ' + eyeColor;

      // Sparkle in each eye
      const leftSparkle = document.createElement('div');
      leftSparkle.style.cssText = 'position:absolute;width:30%;height:30%;background:rgba(255,255,255,0.7);border-radius:50%;top:15%;left:15%';
      leftEye.appendChild(leftSparkle);

      const rightSparkle = document.createElement('div');
      rightSparkle.style.cssText = 'position:absolute;width:30%;height:30%;background:rgba(255,255,255,0.7);border-radius:50%;top:15%;left:15%';
      rightEye.appendChild(rightSparkle);

      eyeContainer.appendChild(leftEye);
      eyeContainer.appendChild(rightEye);
      wrapper.appendChild(eyeContainer);

      // Store references
      avatar._crystalEyes = { leftEye, rightEye, wrapper };
    });

    // Track mouse and update eye positions
    let mouseX = window.innerWidth / 2;
    let mouseY = window.innerHeight / 2;
    let rafId = null;

    function updateEyes() {
      rafId = null;
      
      document.querySelectorAll('img[data-crystal-eyes]').forEach(function(avatar) {
        if (!avatar._crystalEyes) return;
        
        const rect = avatar.getBoundingClientRect();
        if (rect.width === 0) return;
        
        // Center of the avatar
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        
        // Angle and distance to mouse
        const dx = mouseX - cx;
        const dy = mouseY - cy;
        const angle = Math.atan2(dy, dx);
        const dist = Math.min(Math.hypot(dx, dy), 200);
        const maxOffset = rect.width * 0.04; // max pupil travel
        const offset = Math.min(dist / 200, 1) * maxOffset;
        
        const offsetX = Math.cos(angle) * offset;
        const offsetY = Math.sin(angle) * offset;
        
        const { leftEye, rightEye } = avatar._crystalEyes;
        leftEye.style.transform = 'translate(' + offsetX + 'px, ' + offsetY + 'px)';
        rightEye.style.transform = 'translate(' + offsetX + 'px, ' + offsetY + 'px)';
      });
    }

    function onMove(e) {
      mouseX = e.clientX;
      mouseY = e.clientY;
      if (!rafId) {
        rafId = requestAnimationFrame(updateEyes);
      }
    }

    // Also handle scroll (avatar position changes)
    function onScroll() {
      if (!rafId) {
        rafId = requestAnimationFrame(updateEyes);
      }
    }

    // Periodic blink (every 3-6 seconds, randomized)
    function blink() {
      document.querySelectorAll('.crystal-pupil').forEach(function(eye) {
        eye.style.transition = 'transform 0.1s ease-out, height 0.1s';
        const h = eye.style.height;
        eye.style.height = '5%';
        setTimeout(function() {
          eye.style.height = h;
          eye.style.transition = 'transform 0.15s ease-out';
        }, 120);
      });
      // Schedule next blink
      setTimeout(blink, 3000 + Math.random() * 3000);
    }

    document.addEventListener('mousemove', onMove);
    window.addEventListener('scroll', onScroll, { passive: true });
    
    // Start blinking after 2 seconds
    setTimeout(blink, 2000);
    
    // Initial update
    updateEyes();
  }
})();