// Initialize driverNode if it doesn't exist
window.driverNode = window.driverNode || {};

// Add the missing method if it doesn't exist
if (!window.driverNode.markNotificationsAsRead) {
  window.driverNode.markNotificationsAsRead = function() {
    // Implementation to clear notifications
    const notificationList = document.getElementById("notificationList");
    if (notificationList) {
      notificationList.innerHTML = '<li class="empty">No new notifications</li>';
    }
    
    // Update badge count to zero
    const notificationBadge = document.querySelector('.notification-badge');
    if (notificationBadge) {
      notificationBadge.textContent = '0';
      notificationBadge.style.display = 'none';
    }
  };
}

document.addEventListener("DOMContentLoaded", function() {
  // Wait for all elements to be available
  setTimeout(() => {
    // Setup UI event listeners
    const backBtn = document.querySelector(".back-btn");
    const cancelBtn = document.getElementById("cancelBtn");
    const acceptBtn = document.getElementById("acceptBtn");
    const newFareInput = document.getElementById("newFareInput");
    const notificationBell = document.getElementById("notificationBell");
    const notificationDropdown = document.getElementById("notificationDropdown");
    const clearNotificationsBtn = document.getElementById("clearNotifications");

    // Close expanded card
    function closeCard() {
      const expandedCard = document.querySelector(".expanded-card");
      if (expandedCard) {
        expandedCard.classList.remove("active");
        document.body.style.overflow = "auto";
      }
    }

    // Add event listeners only if elements exist
    if (backBtn) backBtn.addEventListener("click", closeCard);
    if (cancelBtn) cancelBtn.addEventListener("click", closeCard);

    // Accept ride
    if (acceptBtn) {
      acceptBtn.addEventListener("click", function() {
        if (window.driverNode && window.driverNode.currentRide) {
          const updatedFare = newFareInput.value || window.driverNode.currentRide.fare;
          if (typeof window.driverNode.acceptRide === "function") {
            window.driverNode.acceptRide(updatedFare);
          }
        }
      });
    }

    // Notification bell functionality - Updated with safe checks
    if (notificationBell) {
      notificationBell.addEventListener("click", function(e) {
        e.stopPropagation();
        if (notificationDropdown) {
          notificationDropdown.classList.toggle("show");
        }
        
        // Safe execution of markNotificationsAsRead
        if (window.driverNode && typeof window.driverNode.markNotificationsAsRead === "function") {
          window.driverNode.markNotificationsAsRead();
        }
      });
    }

    // Clear notifications
    if (clearNotificationsBtn) {
      clearNotificationsBtn.addEventListener("click", function(e) {
        e.stopPropagation();
        const notificationList = document.getElementById("notificationList");
        if (notificationList) {
          notificationList.innerHTML = '<li class="empty">No new notifications</li>';
        }
        
        // Also call the markNotificationsAsRead if available
        if (window.driverNode && typeof window.driverNode.markNotificationsAsRead === "function") {
          window.driverNode.markNotificationsAsRead();
        }
      });
    }

    // Close dropdown when clicking outside
    document.addEventListener("click", function() {
      if (notificationDropdown) {
        notificationDropdown.classList.remove("show");
      }
    });

    // Prevent dropdown from closing when clicking inside it
    if (notificationDropdown) {
      notificationDropdown.addEventListener("click", function(e) {
        e.stopPropagation();
      });
    }
  }, 100); // Small delay to ensure all elements are loaded
});