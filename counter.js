document.addEventListener('DOMContentLoaded', () => {
  const counterElement = document.getElementById('page-view-counter');
  if (counterElement) {
    fetch('counter.php')
      .then(response => response.json())
      .then(data => {
        // Animate the counter from 0 to target
        let startTimestamp = null;
        const duration = 1500;
        const target = parseInt(data.views, 10);
        
        const step = (timestamp) => {
          if (!startTimestamp) startTimestamp = timestamp;
          const progress = Math.min((timestamp - startTimestamp) / duration, 1);
          // easeOutQuart
          const easeProgress = 1 - Math.pow(1 - progress, 4);
          counterElement.innerText = Math.floor(easeProgress * target).toLocaleString();
          
          if (progress < 1) {
            window.requestAnimationFrame(step);
          } else {
            counterElement.innerText = target.toLocaleString();
          }
        };
        
        window.requestAnimationFrame(step);
      })
      .catch(error => {
        console.error('Error fetching page views:', error);
        counterElement.innerText = 'Unavailable';
      });
  }
});
