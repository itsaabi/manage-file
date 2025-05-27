import { createLibp2p } from "libp2p";
import { webSockets } from "@libp2p/websockets";
import { noise } from "@chainsafe/libp2p-noise";
import { yamux } from "@chainsafe/libp2p-yamux";
import { identify } from "@libp2p/identify";
import { gossipsub } from "@chainsafe/libp2p-gossipsub";
import { multiaddr } from "@multiformats/multiaddr";
import { circuitRelayTransport } from "@libp2p/circuit-relay-v2";
import { ping } from "@libp2p/ping";
import { webRTC } from "@libp2p/webrtc";

const topic = "ride-requests-final-v1";
const shareRideTopic = "share-ride-posts-v2";
const rideShareTopic = "ride-share-requests-v2";
const relayId = "12D3KooWSyy6Pxb7kG9FZLFBHAAvR7ADjqQ4pcZZDug4yCxx1vL2";
const relayAddr = `/ip4/127.0.0.1/tcp/15001/ws/p2p/${relayId}`;

class DriverNode {
  constructor() {
    this.node = null;
    this.currentRide = null;
    this.receivedMessages = new Set();
    this.unreadRequests = 0;
    this.statusMessages = [];
    this.driverProfile = this.getDriverProfileFromLocalStorage();
    this.setupHolographicPopup();
    this.initLocalStorage();
    this.sharedRides = [];
    this.rideShareRequests = [];
    this.acceptRideProtocol = "/accept-ride/1.0.0";
    this.rideShareProtocol = "/ride-share/1.0.0";
    this.availableSeats = 4;
    this.trackingWindow = null;
  }

  rideAlert(message) {
  try {
    // Store the actual ride alert data in localStorage
    const rideAlertData = {
      id: message.id || `alert-${Date.now()}`,
      type: "ride-alert",
      message: message.message || "New ride alert",
      timestamp: new Date().toISOString(),
      details: {
        from: message.from || "Unknown location",
        to: message.to || "Unknown destination",
        fare: message.fare || 0,
        rider: message.name || "Unknown Rider",
        phone: message.phone || "N/A"
      }
    };

    // Get existing alerts from localStorage or initialize if not present
    const existingAlerts = JSON.parse(localStorage.getItem("rideAlerts")) || [];
    
    // Add the new alert
    existingAlerts.unshift(rideAlertData);
    
    // Limit to 50 alerts to prevent localStorage overflow
    if (existingAlerts.length > 50) {
      existingAlerts.pop();
    }
    
    // Save back to localStorage
    localStorage.setItem("rideAlerts", JSON.stringify(existingAlerts));
    
    // Log the stored data to console
    console.log("Ride alert stored in localStorage:", rideAlertData);
    console.log("All ride alerts in localStorage:", existingAlerts);
    
    return true;
  } catch (error) {
    console.error("Error storing ride alert:", error);
    return false;
  }
}


  initLocalStorage() {
    if (!localStorage.getItem("driverMetrics")) {
      localStorage.setItem(
        "driverMetrics",
        JSON.stringify({
          completedTrips: 0,
          totalEarnings: 0,
          ratings: [],
          allTrips: [],
          rideAlerts: [],
        })
      );
    }

    if (!localStorage.getItem("riderData")) {
      localStorage.setItem(
        "riderData",
        JSON.stringify({
          riderRequests: [],
          riderProfiles: {},
          lastUpdated: new Date().toISOString(),
        })
      );
    }
  }

  storeRideRequest(message) {
    try {
      if (!this.checkLocalStorageQuota()) {
        console.warn("LocalStorage quota exceeded, cleaning old entries");
        this.cleanOldLocalStorageEntries();
      }

      const riderProfileImage = this.processImageUrl(
        message.avatar || message.riderProfileImage || message.profileImage,
        "Rider"
      );

      const rideAlert = {
        id: message.id || `alert-${Date.now()}`,
        type: "ride",
        message: `New ride request from ${message.name || "Rider"}`,
        time: new Date().toISOString(),
        read: false,
        passenger: message.name || "Unknown Rider",
        location: message.from || "Unknown location",
        distance: message.distance || 0,
        fare: message.fare || 0,
        status: "pending",
        phone: message.phone || "N/A",
        selectedSeats: message.selectedSeats || 1,
        riderName: message.name || "Unknown Rider",
        riderPhone: message.phone || "N/A",
        riderProfileImage: riderProfileImage
      };

      const metrics = JSON.parse(localStorage.getItem("driverMetrics") || "{}");
      metrics.rideAlerts = metrics.rideAlerts || [];
      
      if (metrics.rideAlerts.length >= 50) {
        metrics.rideAlerts.pop();
      }
      metrics.rideAlerts.unshift(rideAlert);

      localStorage.setItem("driverMetrics", JSON.stringify(metrics));

      const riderData = JSON.parse(localStorage.getItem("riderData") || "{}");
      riderData.riderRequests = riderData.riderRequests || [];
      
      if (riderData.riderRequests.length >= 50) {
        riderData.riderRequests.pop();
      }
      
      const riderRequest = {
        requestId: rideAlert.id,
        riderId: message.id || `rider-${Date.now()}`,
        name: message.name || "Unknown Rider",
        displayName: message.name || "Unknown Rider",
        phone: message.phone || "N/A",
        pickupLocation: message.from || "Unknown location",
        destination: message.to || "Unknown destination",
        distance: message.distance || 0,
        fareEstimate: message.fare || 0,
        status: "pending",
        createdAt: new Date().toISOString(),
        vehicleType: message.vehicle || "car",
        selectedSeats: message.selectedSeats || 1,
        riderProfileImage: riderProfileImage
      };
      
      riderData.riderRequests.unshift(riderRequest);
      riderData.lastUpdated = new Date().toISOString();
      
      localStorage.setItem("riderData", JSON.stringify(riderData));

      console.log("Ride request stored in localStorage:", rideAlert);
      return true;
    } catch (error) {
      console.error("Error storing ride request:", error);
      return false;
    }
  }

  processImageUrl(url, fallbackText = "Image") {
    if (!url) return `https://via.placeholder.com/150?text=${fallbackText}`;

    if (url.startsWith("ipfs://")) {
      return `https://ipfs.io/ipfs/${url.replace("ipfs://", "")}`;
    }

    if (url.startsWith("http://") && window.location.protocol === "https:") {
      return url.replace("http://", "https://");
    }

    if (url.startsWith("/")) {
      return window.location.origin + url;
    }

    return url;
  }

  cleanOldLocalStorageEntries() {
    try {
      const metrics = JSON.parse(localStorage.getItem("driverMetrics"));
      if (metrics && metrics.rideAlerts && metrics.rideAlerts.length > 20) {
        metrics.rideAlerts = metrics.rideAlerts.slice(0, 20);
        localStorage.setItem("driverMetrics", JSON.stringify(metrics));
      }

      const riderData = JSON.parse(localStorage.getItem("riderData"));
      if (riderData && riderData.riderRequests && riderData.riderRequests.length > 20) {
        riderData.riderRequests = riderData.riderRequests.slice(0, 20);
        localStorage.setItem("riderData", JSON.stringify(riderData));
      }
    } catch (e) {
      console.error("Error cleaning localStorage:", e);
    }
  }

  checkLocalStorageQuota() {
    try {
      localStorage.setItem('quota_test', 'a'.repeat(1024 * 1024 * 4));
      localStorage.removeItem('quota_test');
      return true;
    } catch (e) {
      return false;
    }
  }

  updateLocalStorageOnAcceptance(requestId, fare) {
    const metrics = JSON.parse(localStorage.getItem("driverMetrics"));
    if (metrics.rideAlerts) {
      const alert = metrics.rideAlerts.find((a) => a.id === requestId);
      if (alert) {
        alert.read = true;
        localStorage.setItem("driverMetrics", JSON.stringify(metrics));
      }
    }

    const riderData = JSON.parse(localStorage.getItem("riderData"));
    if (riderData.riderRequests) {
      const request = riderData.riderRequests.find(
        (r) => r.requestId === requestId
      );
      if (request) {
        request.status = "accepted";
        request.updatedAt = new Date().toISOString();
        localStorage.setItem("riderData", JSON.stringify(riderData));
      }
    }

    const trip = {
      id: `#TR-${Date.now()}`,
      date: new Date().toISOString(),
      passenger: this.currentRide.name || "Rider",
      pickup: this.currentRide.from || "Unknown",
      dropoff: this.currentRide.to || "Unknown",
      distance: this.currentRide.distance || 0,
      fare: parseFloat(fare) || 0,
      status: "accepted",
      selectedSeats: this.currentRide.selectedSeats || 1
    };

    metrics.allTrips = metrics.allTrips || [];
    metrics.allTrips.unshift(trip);
    localStorage.setItem("driverMetrics", JSON.stringify(metrics));
  }

  setupHolographicPopup() {
    if (!document.getElementById("holographic-popup")) {
      const popup = document.createElement("div");
      popup.id = "holographic-popup";
      popup.className = "holographic-popup";
      popup.innerHTML = `
  
  <div class="holographic-content">
    <div class="countdown-timer" id="countdown-timer">5</div>
    <div class="holographic-icon">🚕</div>
    <div class="holographic-title">Ride Confirmed!</div>
    <div class="holographic-message" id="holographic-message"></div>
    <div class="holographic-fare" id="holographic-fare"></div>
    <div class="holographic-button-container">
      <button id="go-to-tracking-btn" class="holographic-button">
        <i class="fas fa-map-marker-alt"></i>
        <span>Go to Tracking</span>
      </button>
    </div>
  </div>
</div>
      `;
      document.body.appendChild(popup);

      const style = document.createElement("style");
      style.textContent = `
        .holographic-popup {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background: rgba(20, 30, 40, 0.85);
    backdrop-filter: blur(10px);
    border-radius: 16px;
    padding: 25px;
    width: 280px;
    box-shadow: 0 0 30px rgba(100, 200, 255, 0.3);
    z-index: 10000;
    opacity: 0;
    pointer-events: none;
    transition: all 0.5s ease;
  }
  
  .holographic-popup.active {
    opacity: 1;
    pointer-events: auto;
    animation: fadeOut 5s forwards; /* 5 seconds duration */
  }
  
  .holographic-content {
    text-align: center;
    color: white;
    position: relative;
  }
  
  .countdown-timer {
    position: absolute;
    top: 10px;
    right: 10px;
    background: rgba(255, 255, 255, 0.2);
    border-radius: 50%;
    width: 30px;
    height: 30px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 12px;
    font-weight: bold;
  }
  
  @keyframes fadeOut {
    0% { opacity: 1; }
    80% { opacity: 1; } /* Stay visible for 80% of duration */
    100% { opacity: 0; }
  }
        
        .holographic-icon {
          font-size: 50px;
          margin-bottom: 15px;
        }
        
        .holographic-title {
          font-size: 22px;
          font-weight: 700;
          margin-bottom: 10px;
        }
        
        .holographic-message {
          font-size: 16px;
          margin-bottom: 15px;
        }
        
        .holographic-fare {
          font-size: 24px;
          font-weight: 700;
          margin: 15px 0;
        }
        
        .holographic-button {
          background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%);
          border: none;
          border-radius: 50px;
          color: white;
          padding: 12px 24px;
          font-size: 16px;
          font-weight: 600;
          cursor: pointer;
        }
      `;
      document.head.appendChild(style);

      document.getElementById('go-to-tracking-btn')?.addEventListener('click', () => {
        this.openTrackingWindow();
      });
    }
  }

  openTrackingWindow() {
    if (this.trackingWindow && !this.trackingWindow.closed) {
      this.trackingWindow.focus();
      return;
    }

    this.trackingWindow = window.open('tracking.html', '_blank');
    
    if (this.trackingWindow) {
      this.trackingWindow.onload = () => {
        const style = document.createElement('style');
        style.textContent = `
          body {
            filter: blur(5px);
            pointer-events: none;
            user-select: none;
            transition: filter 0.3s ease;
          }
          .confirmation-popup {
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: rgba(255, 255, 255, 0.9);
            padding: 20px;
            border-radius: 10px;
            box-shadow: 0 0 20px rgba(0, 0, 0, 0.2);
            z-index: 10000;
            text-align: center;
          }
        `;
        this.trackingWindow.document.head.appendChild(style);

        const popup = document.createElement('div');
        popup.className = 'confirmation-popup';
        popup.innerHTML = `
          <h3>Waiting for Rider Confirmation</h3>
          <p>The rider needs to confirm the ride request</p>
          <div class="loader"></div>
        `;
        this.trackingWindow.document.body.appendChild(popup);
      };
    } else {
      window.location.href = 'tracking.html';
    }
  }

  showHolographicPopup(message) {
    const popup = document.getElementById("holographic-popup");
    const messageEl = document.getElementById("holographic-message");
    const fareEl = document.getElementById("holographic-fare");

    if (popup && messageEl && fareEl) {
      messageEl.textContent = `${message.name || "Rider"} has confirmed the ride`;
      fareEl.textContent = `PKR ${message.fare || "0"}`;

      popup.classList.add("active");

      this.storeRideDetailsToIPFS(message);
      this.publishSharedRide(message);

      if (this.trackingWindow && !this.trackingWindow.closed) {
        this.trackingWindow.document.querySelectorAll('style').forEach(style => {
          if (style.textContent.includes('filter: blur')) {
            style.textContent = style.textContent.replace('filter: blur(5px)', 'filter: none');
          }
        });
        
        const popup = this.trackingWindow.document.querySelector('.confirmation-popup');
        if (popup) {
          popup.remove();
        }
      }

      // Auto-close popup after 2 seconds
      setTimeout(() => {
        popup.classList.remove("active");
        if (!this.trackingWindow || this.trackingWindow.closed) {
          this.openTrackingWindow();
        }
      }, 2000); // Changed from 3000ms to 2000ms as requested
    }
  }

  publishSharedRide(message) {
    const ridePost = {
      type: "ride-share-post",
      driver: {
        name: this.driverProfile.name,
        phone: this.driverProfile.phone,
        profileImage: this.driverProfile.profileImage,
        peerId: this.node.peerId.toString()
      },
      rider: {
        origin: this.currentRide.from || "Unknown",
        destination: this.currentRide.to || "Unknown",
        seatsAvailable: this.currentRide.selectedSeats || 1
      },
      timestamp: Date.now(),
      rideId: this.currentRide.id
    };

    this.sharedRides.push(ridePost);

    try {
      this.node.services.pubsub.publish(
        shareRideTopic,
        new TextEncoder().encode(JSON.stringify(ridePost))
      );
      console.log("Published shared ride:", ridePost);
    } catch (err) {
      console.error("Failed to publish shared ride:", err);
    }
  }

  getDriverProfileFromLocalStorage() {
    try {
      const profileData = JSON.parse(localStorage.getItem("driverProfileData")) || {};
      
      const processedProfileImage = this.processImageUrl(
        profileData.profileImage,
        "Driver"
      );

      return {
        name: profileData.name || "Driver",
        phone: profileData.phone || "N/A",
        profileImage: processedProfileImage,
        peerId: profileData.peerId || ""
      };
    } catch (error) {
      console.error("Error loading driver profile:", error);
      return {
        name: "Driver",
        phone: "N/A",
        profileImage: "https://via.placeholder.com/150?text=Driver",
        peerId: ""
      };
    }
  }

  async initialize() {
    try {
      this.node = await createLibp2p({
        listen: ["/webrtc", "/p2p-circuit"],
        transports: [webRTC(), webSockets(), circuitRelayTransport()],
        connectionEncrypters: [noise()],
        streamMuxers: [yamux()],
        services: {
          ping: ping(),
          identify: identify(),
          pubsub: gossipsub({
            allowPublishToZeroTopicPeers: true,
            fallbackToFloodsub: true,
            floodPublish: true,
            globalSignaturePolicy: "StrictNoSign",
            doPX: false,
            msgIdFn: (msg) => msg.data,
            seenTTL: 300000,
            scoreThresholds: {
              gossipThreshold: -1000,
              publishThreshold: -1000,
              graylistThreshold: -1000,
              acceptPXThreshold: -1000,
              opportunisticGraftThreshold: -1000,
            },
          }),
        },
      });

      this.setupEventListeners();
      await this.connectToRelay();
      this.node.services.pubsub.subscribe(topic);
      this.node.services.pubsub.subscribe(shareRideTopic);
      this.node.services.pubsub.subscribe(rideShareTopic);
      this.addStatusMessage("📡 Subscribed to topic: " + topic);
      this.addStatusMessage("📡 Subscribed to ride-share topic: " + rideShareTopic);

      this.node.handle(this.acceptRideProtocol, async ({ stream }) => {
        try {
          const decoder = new TextDecoder();
          let data = '';
          for await (const chunk of stream.source) {
            data += decoder.decode(chunk, { stream: true });
          }
          const message = JSON.parse(data);
          this.handleAcceptRideMessage(message);
        } catch (err) {
          console.error("Error handling accept ride message:", err);
        }
      });

      this.node.handle(this.rideShareProtocol, async ({ stream }) => {
        try {
          const decoder = new TextDecoder();
          let data = '';
          for await (const chunk of stream.source) {
            data += decoder.decode(chunk, { stream: true });
          }
          const message = JSON.parse(data);
          this.handleRideShareMessage(message);
        } catch (err) {
          console.error("Error handling ride-share message:", err);
        }
      });

      setInterval(() => this.discoverPeers(), 5000);
      this.discoverPeers();
    } catch (err) {
      this.addStatusMessage("❌ Failed to initialize node: " + err.message);
      console.error(err);
    }
  }

  handleAcceptRideMessage(message) {
    console.log("Received ride acceptance:", message);
    const popup = document.createElement("div");
    popup.className = "accept-ride-popup";
    popup.innerHTML = `
      <div class="popup-content">
        <h3>New Ride Request</h3>
        <div class="rider-info">
          <img src="${this.processImageUrl(message.riderProfileImage || message.avatar, "Rider")}" 
               alt="Rider" class="rider-avatar"
               onerror="this.src='https://via.placeholder.com/50?text=Rider'">
          <div>
            <p><strong>${message.name || "Unknown Rider"}</strong></p>
            <p><i class="fas fa-phone"></i> ${message.phone || "N/A"}</p>
          </div>
        </div>
        <div class="ride-details">
          <p><i class="fas fa-map-marker-alt"></i> ${message.currentLocation || "Unknown"}</p>
          <p><i class="fas fa-flag"></i> ${message.destinationLocation || "Unknown"}</p>
          <p><i class="fas fa-chair"></i> ${message.seatsNeeded || 1} seat${message.seatsNeeded !== 1 ? 's' : ''}</p>
          <p><i class="fas fa-money-bill-wave"></i> PKR ${message.fare || 0}</p>
        </div>
        <div class="buttons">
          <button class="accept-btn">Accept</button>
          <button class="reject-btn">Reject</button>
        </div>
      </div>
    `;
    document.body.appendChild(popup);

    popup.querySelector(".accept-btn").addEventListener("click", () => {
      this.sendAcceptResponse(message, true);
      popup.remove();
      this.openTrackingWindow();
    });

    popup.querySelector(".reject-btn").addEventListener("click", () => {
      this.sendAcceptResponse(message, false);
      popup.remove();
    });

    setTimeout(() => {
      if (document.body.contains(popup)) {
        popup.remove();
      }
    }, 10000);
  }

  async sendAcceptResponse(message, accepted) {
    const response = {
      rideId: message.rideId,
      accepted,
      driverId: this.node.peerId.toString(),
      timestamp: Date.now()
    };

    try {
      const conn = await this.node.dial(message.riderPeerId);
      const stream = await conn.newStream(this.acceptRideProtocol);
      const encoder = new TextEncoder();
      const writer = stream.sink.getWriter();
      await writer.write(encoder.encode(JSON.stringify(response)));
      await writer.close();
    } catch (err) {
      console.error("Failed to send accept response:", err);
    }
  }

  setupEventListeners() {
    this.node.addEventListener("peer:connect", (evt) => {
      this.addStatusMessage("🔗 Connected to peer: " + evt.detail.toString());
    });

    this.node.addEventListener("self:peer:update", (evt) => {
      console.log("Self peer update:", evt.detail);
    });

    this.node.services.pubsub.addEventListener("message", (evt) => {
      this.handleIncomingMessage(evt);
    });
  }

  async connectToRelay() {
    let attempts = 0;
    while (attempts < 3) {
      try {
        await this.node.dial(multiaddr(relayAddr));
        this.addStatusMessage("✅ Connected to relay node");
        return;
      } catch (err) {
        attempts++;
        this.addStatusMessage(
          "🔄 Attempt " + attempts + " to connect to relay failed"
        );
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    }
    throw new Error("Failed to connect to relay");
  }

  async discoverPeers() {
    const peers = await this.node.peerStore.all();
    for (const peer of peers) {
      if (peer.id.toString() !== this.node.peerId.toString()) {
        try {
          await this.node.dial(peer.id);
          console.log("Dialed peer:", peer.id.toString());
        } catch (err) {
          console.log("Failed to dial peer:", peer.id.toString());
        }
      }
    }
  }

  handleIncomingMessage(evt) {
  try {
    if (evt.detail.topic !== topic && evt.detail.topic !== shareRideTopic && evt.detail.topic !== rideShareTopic) return;

    const msgId = evt.detail.data.toString();
    if (this.receivedMessages.has(msgId)) return;
    this.receivedMessages.add(msgId);

    const message = JSON.parse(new TextDecoder().decode(evt.detail.data));

    if (!message.phone) {
      message.phone = "N/A";
    }

    // Call rideAlert for all incoming ride messages
    this.rideAlert(message);

    if (message.type === "ride-request" && evt.detail.topic === rideShareTopic) {
      console.log("Received ride request from rider:", message);
      this.handleDirectRideRequest(message);
    } else if (message.type === "ride-request" && evt.detail.topic === topic) {
      message.selectedSeats = message.selectedSeats || 1;
      this.handleRideRequest(message);
      this.storeRideRequest(message);
      this.unreadRequests++;
      this.updateBellNotification();
    } else if (message.type === "ride-confirmation" && evt.detail.topic === topic) {
      this.handleRideConfirmation(message);
    } else if (message.type === "ride-share-post" && evt.detail.topic === shareRideTopic) {
      console.log("Received shared ride post:", message);
    } else if (message.type === "ride-share-request" && evt.detail.topic === rideShareTopic) {
      this.handleRideShareRequest(message);
      // Display in tracking window if open
      this.displayShareRequestInTracking(message);
    } else if (message.type === "ride-share-cancellation" && evt.detail.topic === rideShareTopic) {
      this.handleRideShareCancellation(message);
    }
  } catch (err) {
    console.error("Error processing message:", err);
  }
}

  // New method to display share request in tracking window
  displayShareRequestInTracking(message) {
    if (this.trackingWindow && !this.trackingWindow.closed) {
      const incomingSection = this.trackingWindow.document.getElementById('incoming-ride-section');
      if (incomingSection) {
        const requestElement = document.createElement('div');
        requestElement.className = 'incoming-request-card';
        requestElement.innerHTML = `
          <div class="request-header">
            <img src="${this.processImageUrl(message.rider?.profileImage || message.avatar, 'Rider')}" 
                 class="rider-avatar"
                 onerror="this.src='https://via.placeholder.com/50?text=Rider'">
            <div class="rider-info">
              <h4>${message.rider?.name || message.name || 'Unknown Rider'}</h4>
              <p><i class="fas fa-phone"></i> ${message.rider?.phone || message.phone || 'N/A'}</p>
            </div>
          </div>
          <div class="request-details">
            <p><i class="fas fa-map-marker-alt"></i> ${message.from || message.pickup || 'Unknown'}</p>
            <p><i class="fas fa-flag"></i> ${message.to || message.destination || 'Unknown'}</p>
            <p><i class="fas fa-chair"></i> ${message.selectedSeats || message.seatsNeeded || 1} seat(s)</p>
            <p><i class="fas fa-money-bill-wave"></i> PKR ${message.fare || 0}</p>
          </div>
          <div class="request-actions">
            <button class="accept-btn" data-request-id="${message.requestId || message.id}">Accept</button>
            <button class="reject-btn" data-request-id="${message.requestId || message.id}">Reject</button>
          </div>
        `;
        
        incomingSection.prepend(requestElement);
        
        // Add event listeners for buttons
        requestElement.querySelector('.accept-btn').addEventListener('click', () => {
          this.acceptRideShareRequest(message);
          requestElement.remove();
        });
        
        requestElement.querySelector('.reject-btn').addEventListener('click', () => {
          this.declineRideShareRequest(message);
          requestElement.remove();
        });
      }
    }
  }

  handleRideRequest(message) {
    const requestElement = this.createRequestCard(message);
    document.getElementById("requests").appendChild(requestElement);
  }

  createRequestCard(message) {
    const requestElement = document.createElement("div");
    requestElement.className = "request-card";
    requestElement.style.animationDelay = "0.1s";
    requestElement.setAttribute("data-id", message.id);
    requestElement.setAttribute("data-vehicle", message.vehicle?.toLowerCase() || "car");

    const avatarUrl = this.processImageUrl(message.avatar || message.riderProfileImage, "Rider");
    const fallbackUrl = "https://via.placeholder.com/150?text=Rider";

    requestElement.innerHTML = `
      <div class="header">
        <h3>New Ride Request</h3>
      </div>
      <div class="preview-content">
        <img src="${avatarUrl}" alt="Rider" class="rider-image" 
             onerror="this.onerror=null;this.src='${fallbackUrl}'">
        <div class="details">
          <p><i class="fas fa-user"></i> ${message.name || "Unknown Rider"}</p>
          <p><i class="fas fa-phone"></i> ${message.phone || "N/A"}</p>
          <p><i class="fas fa-map-marker-alt"></i> ${this.shortenText(message.from || message.pickupLocation)}</p>
          <p><i class="fas fa-flag"></i> ${this.shortenText(message.to || message.destination)}</p>
        </div>
        <div class="fare">
          <div class="amount">${message.fare || "0"}</div>
        </div>
      </div>
    `;

    requestElement.rideData = message;
    requestElement.addEventListener("click", () => {
      this.showExpandedCard(message);
    });

    return requestElement;
  }

  shortenText(text, maxLength = 15) {
    if (!text) return "N/A";
    return text.length > maxLength
      ? text.substring(0, maxLength) + "..."
      : text;
  }

  showExpandedCard(message) {
    this.currentRide = message;

    const riderImageUrl = this.processImageUrl(message.avatar || message.riderProfileImage, "Rider");

    const expandedRiderImage = document.getElementById("expandedRiderImage");
    if (expandedRiderImage) {
      expandedRiderImage.src = riderImageUrl;
      expandedRiderImage.onerror = function() {
        this.src = "https://via.placeholder.com/300?text=Rider";
      };
    }

    document.getElementById("expandedRiderName").textContent = message.name || "Unknown Rider";
    document.getElementById("expandedRiderPhone").textContent = message.phone || "N/A";
    document.getElementById("expandedPickup").textContent = message.from || message.pickupLocation || "N/A";
    document.getElementById("expandedDestination").textContent = message.to || message.destination || "N/A";
    document.getElementById("currentFare").textContent = "PKR " + (message.fare || "0");
    document.getElementById("newFareInput").value = "";

    const vehicleType = message.vehicle ? message.vehicle.toLowerCase() : "car";
    document.getElementById("vehicleType").textContent = message.vehicle || "Car";

    const selectedSeats = message.selectedSeats || 1;
    const maxSeats = vehicleType === "bike" ? 1 : 
                    vehicleType === "auto" ? 3 : 4;
    const availableSeats = Math.min(selectedSeats, maxSeats);
    
    document.getElementById("vehicleDesc").textContent = 
      `${availableSeats} seat${availableSeats !== 1 ? 's' : ''} available`;

    const seatsContainer = document.getElementById("seatsContainer");
    if (seatsContainer) {
      seatsContainer.innerHTML = "";
      for (let i = 0; i < maxSeats; i++) {
        const seat = document.createElement("div");
        seat.className = "seat";
        if (i >= availableSeats) seat.classList.add("occupied");
        seatsContainer.appendChild(seat);
      }
    }

    const expandedCard = document.querySelector(".expanded-card");
    if (expandedCard) {
      expandedCard.classList.add("active");
      document.body.style.overflow = "hidden";
    }
  }

  handleDirectRideRequest(message) {
    console.log("Processing direct ride request from rider:", message.rider?.name || "Unknown");
    
    const notification = {
      id: `direct-request-${Date.now()}`,
      type: "direct-ride-request",
      message: `Direct ride request from ${message.rider?.name || "Rider"}`,
      time: new Date().toISOString(),
      read: false,
      passenger: message.rider?.name || "Unknown Rider",
      location: message.rider?.origin || "Unknown",
      destination: message.rider?.destination || "Unknown",
      fare: message.rider?.fare || 0,
      status: "pending",
      phone: message.rider?.phone || "N/A",
      selectedSeats: message.rider?.seatsAvailable || 1,
      rideId: message.rideId,
      riderPeerId: message.rider?.peerId,
      riderProfileImage: message.rider?.profileImage
    };

    try {
      const stored = this.storeRideRequest({
        ...notification,
        from: notification.location,
        to: notification.destination,
        avatar: notification.riderProfileImage,
        name: notification.passenger,
        phone: notification.phone,
        fare: notification.fare
      });
      
      if (!stored) {
        console.warn("Failed to store ride request in localStorage");
      }
    } catch (e) {
      console.error("Error storing ride request:", e);
    }

    this.showRideRequestPopup(notification);
  }

  showRideRequestPopup(request) {
    const popup = document.createElement("div");
    popup.className = "ride-request-popup";
    
    const riderImageUrl = this.processImageUrl(
      request.riderProfileImage || request.avatar,
      "Rider"
    );

    popup.innerHTML = `
      <div class="popup-content">
        <h3>New Ride Request</h3>
        <div class="rider-info">
          <img src="${riderImageUrl}" 
               alt="Rider" class="rider-avatar"
               onerror="this.src='https://via.placeholder.com/50?text=Rider'">
          <div>
            <p><strong>${request.passenger || request.name || "Rider"}</strong></p>
            <p><i class="fas fa-phone"></i> ${request.phone || "N/A"}</p>
          </div>
        </div>
        <div class="ride-details">
          <p><i class="fas fa-map-marker-alt"></i> ${request.location || request.from || "Unknown"}</p>
          <p><i class="fas fa-flag"></i> ${request.destination || request.to || "Unknown"}</p>
          <p><i class="fas fa-chair"></i> ${request.selectedSeats || 1} seat${request.selectedSeats !== 1 ? 's' : ''}</p>
          <p><i class="fas fa-money-bill-wave"></i> PKR ${request.fare || 0}</p>
        </div>
        <div class="popup-actions">
          <button class="accept-btn">Accept</button>
          <button class="reject-btn">Reject</button>
        </div>
      </div>
    `;

    document.body.appendChild(popup);

    popup.querySelector(".accept-btn").addEventListener("click", () => {
      this.acceptDirectRideRequest(request);
      popup.remove();
      this.openTrackingWindow();
    });

    popup.querySelector(".reject-btn").addEventListener("click", () => {
      this.rejectDirectRideRequest(request);
      popup.remove();
    });

    setTimeout(() => {
      if (document.body.contains(popup)) {
        popup.remove();
      }
    }, 30000);
  }

  async acceptDirectRideRequest(request) {
    try {
      const response = {
        type: "ride-accepted",
        requestId: request.rideId,
        driverId: this.node.peerId.toString(),
        driverName: this.driverProfile.name,
        driverPhone: this.driverProfile.phone,
        driverImage: this.driverProfile.profileImage,
        fare: request.fare,
        timestamp: Date.now(),
        vehicle: "Car",
        selectedSeats: request.selectedSeats
      };

      if (request.riderPeerId) {
        try {
          const conn = await this.node.dial(request.riderPeerId);
          const stream = await conn.newStream(this.rideShareProtocol);
          const encoder = new TextEncoder();
          const writer = stream.sink.getWriter();
          await writer.write(encoder.encode(JSON.stringify(response)));
          await writer.close();
          console.log("Direct acceptance sent to rider:", request.riderPeerId);
        } catch (err) {
          console.error("Failed to send direct acceptance:", err);
        }
      }

      await this.node.services.pubsub.publish(
        rideShareTopic,
        new TextEncoder().encode(JSON.stringify(response))
      );

      console.log("Accepted direct ride request:", request.rideId);
      
      this.updateLocalStorageOnAcceptance(request.rideId, request.fare);
      this.showHolographicPopup({
        name: request.passenger,
        phone: request.phone,
        fare: request.fare
      });
    } catch (err) {
      console.error("Error accepting direct ride request:", err);
    }
  }

  async rejectDirectRideRequest(request) {
    try {
      const response = {
        type: "ride-rejected",
        requestId: request.rideId,
        driverId: this.node.peerId.toString(),
        timestamp: Date.now()
      };

      if (request.riderPeerId) {
        try {
          const conn = await this.node.dial(request.riderPeerId);
          const stream = await conn.newStream(this.rideShareProtocol);
          const encoder = new TextEncoder();
          const writer = stream.sink.getWriter();
          await writer.write(encoder.encode(JSON.stringify(response)));
          await writer.close();
        } catch (err) {
          console.error("Failed to send direct rejection:", err);
        }
      }

      await this.node.services.pubsub.publish(
        rideShareTopic,
        new TextEncoder().encode(JSON.stringify(response))
      );

      console.log("Rejected direct ride request:", request.rideId);
    } catch (err) {
      console.error("Error rejecting direct ride request:", err);
    }
  }

  async acceptRide(updatedFare) {
    if (!this.currentRide) {
      return;
    }

    const driverImageUrl = this.processImageUrl(
      this.driverProfile.profileImage,
      "Driver"
    );

    const acceptance = {
      type: "ride-accepted",
      requestId: this.currentRide.id,
      driverId: this.node.peerId.toString(),
      driverName: this.driverProfile.name,
      driverPhone: this.driverProfile.phone,
      driverImage: driverImageUrl,
      fare: updatedFare || this.currentRide.fare || 0,
      timestamp: Date.now(),
      vehicle: this.currentRide.vehicle || "Car",
      selectedSeats: this.currentRide.selectedSeats || 1
    };

    console.log("Sending ride acceptance with driver data:", acceptance);

    try {
      await this.node.services.pubsub.publish(
        topic,
        new TextEncoder().encode(JSON.stringify(acceptance))
      );

      this.updateLocalStorageOnAcceptance(
        this.currentRide.id,
        updatedFare || this.currentRide.fare
      );
      this.showAcceptancePopup();
      this.openTrackingWindow();
    } catch (err) {
      console.error("Failed to send acceptance:", err);
      this.addStatusMessage(
        "❌ Failed to send ride acceptance: " + err.message
      );
    }
  }

  showAcceptancePopup() {
    const popup = document.querySelector(".acceptance-popup");
    if (popup) {
      popup.classList.add("active");

      setTimeout(() => {
        popup.classList.remove("active");
        this.closeExpandedCard();
      }, 2000);
    }
  }

  closeExpandedCard() {
    const expandedCard = document.querySelector(".expanded-card");
    if (expandedCard) {
      expandedCard.classList.remove("active");
      document.body.style.overflow = "auto";
    }
  }

  handleRideConfirmation(message) {
    this.showHolographicPopup(message);
  }

  addStatusMessage(message) {
    this.statusMessages.push(message);
    console.log(message);
  }

  updateBellNotification() {
    const bellIcon = document.getElementById("notificationBell");
    const badge = document.getElementById("notificationBadge");

    if (bellIcon && badge) {
      if (this.unreadRequests > 0) {
        badge.textContent = this.unreadRequests;
        badge.style.display = "flex";
        bellIcon.classList.add("has-notifications");
      } else {
        badge.style.display = "none";
        bellIcon.classList.remove("has-notifications");
      }
    }
  }

  markNotificationsAsRead() {
    this.unreadRequests = 0;
    this.updateBellNotification();
  }

  async storeRideDetailsToIPFS(message) {
    try {
      const vehicleType = this.currentRide?.vehicle?.toLowerCase() || "car";
      let seats = 4;
      if (vehicleType === "bike") seats = 1;
      else if (vehicleType === "auto") seats = 3;

      const rideDetails = {
        driver: {
          driverId: this.node.peerId.toString(),
          name: this.driverProfile.name,
          phone: this.driverProfile.phone,
          profileImage: this.driverProfile.profileImage,
        },
        rider: {
          pickupLocation: this.currentRide?.from || "Unknown location",
          destination: this.currentRide?.to || "Unknown destination",
        },
        vehicle: {
          type: vehicleType,
          seats: seats,
          selectedSeats: this.currentRide?.selectedSeats || 1
        },
        timestamp: new Date().toISOString()
      };

      const jsonData = JSON.stringify(rideDetails, null, 2);
      const blob = new Blob([jsonData], { type: 'application/json' });

      const ipfsClient = await this.createIPFSClient();
      if (!ipfsClient) {
        throw new Error("Failed to initialize IPFS client");
      }

      const result = await ipfsClient.add(blob);
      const cid = result.cid.toString();
      
      await this.pinCID(ipfsClient, cid);
      await this.retrieveAndVerifyRideDetails(ipfsClient, cid);

    } catch (error) {
      console.error("Error storing ride details to IPFS:", error);
    }
  }

  async createIPFSClient() {
    try {
      const { create } = await import('ipfs-http-client');
      
      const ipfsClient = create({
        host: '127.0.0.1',
        port: 5001,
        protocol: 'http',
        headers: {
        }
      });

      console.log("IPFS client created successfully");
      return ipfsClient;
    } catch (error) {
      console.error("Error creating IPFS client:", error);
      return null;
    }
  }

  async pinCID(ipfsClient, cid) {
    try {
      await ipfsClient.pin.add(cid);
      console.log("CID pinned successfully:", cid);
    } catch (error) {
      console.error("Error pinning CID:", error);
    }
  }

  async retrieveAndVerifyRideDetails(ipfsClient, cid) {
    try {
      let content = '';
      for await (const chunk of ipfsClient.cat(cid)) {
        content += new TextDecoder().decode(chunk);
      }

      const retrievedData = JSON.parse(content);
      console.log("Retrieved ride details from IPFS:", retrievedData);

      if (retrievedData.driver && retrievedData.rider && retrievedData.ride) {
        console.log("Ride details verified successfully");
      } else {
        console.log("Ride details verification failed - missing fields");
      }

      return retrievedData;
    } catch (error) {
      console.error("Error retrieving ride details from IPFS:", error);
      return null;
    }
  }

  handleRideShareRequest(message) {
    console.log("Received ride-share request:", message);
    this.rideShareRequests.push(message);
    this.displayRideShareRequest(message);
    this.notifyNewRideShareRequest(message);
    this.displayShareRequestInTracking(message);
  }

  handleRideShareCancellation(message) {
    console.log("Received ride-share cancellation:", message);
    this.rideShareRequests = this.rideShareRequests.filter(
      req => req.requestId !== message.requestId
    );
    this.removeRideShareRequestUI(message.requestId);
  }

  displayRideShareRequest(message) {
    const requestElement = document.createElement("div");
    requestElement.className = "ride-share-request";
    requestElement.innerHTML = `
      <div class="ride-share-header">
        <h4>New Ride Share Request</h4>
        <small>${new Date(message.timestamp).toLocaleTimeString()}</small>
      </div>
      <div class="ride-share-details">
        <p><strong>From:</strong> ${message.pickup || message.from}</p>
        <p><strong>To:</strong> ${message.destination || message.to}</p>
        <p><strong>Seats:</strong> ${message.seatsRequired || message.selectedSeats || 1}</p>
        <p><strong>Rider:</strong> ${message.riderInfo?.name || message.name || 'Unknown'}</p>
        <p><strong>Phone:</strong> ${message.riderInfo?.phone || message.phone || 'N/A'}</p>
      </div>
      <div class="ride-share-actions">
        <button class="accept-ride-share" data-request-id="${message.requestId}">Accept</button>
        <button class="decline-ride-share" data-request-id="${message.requestId}">Decline</button>
      </div>
    `;

    const container = document.getElementById("ride-share-requests-container") || 
                      document.querySelector(".ride-share-container");
    if (container) {
      container.prepend(requestElement);
    }

    requestElement.querySelector(".accept-ride-share").addEventListener("click", () => {
      this.acceptRideShareRequest(message);
    });
    requestElement.querySelector(".decline-ride-share").addEventListener("click", () => {
      this.declineRideShareRequest(message);
    });
  }

  notifyNewRideShareRequest(message) {
    console.log("Notifying about new ride-share request:", message);
    if (window.showToastNotification) {
      window.showToastNotification({
        title: "New Ride Share Request",
        message: `From ${message.pickup || message.from} to ${message.destination || message.to}`,
        type: "info"
      });
    }
  }

  async acceptRideShareRequest(request) {
    try {
      const response = {
        type: "ride-share-response",
        requestId: request.requestId,
        accepted: true,
        driverInfo: {
          name: this.driverProfile.name,
          phone: this.driverProfile.phone,
          profileImage: this.driverProfile.profileImage,
          peerId: this.node.peerId.toString()
        },
        timestamp: Date.now()
      };

      await this.node.services.pubsub.publish(
        rideShareTopic,
        new TextEncoder().encode(JSON.stringify(response))
      );

      if (request.requesterPeerId) {
        try {
          const conn = await this.node.dial(request.requesterPeerId);
          const stream = await conn.newStream(this.rideShareProtocol);
          const encoder = new TextEncoder();
          const writer = stream.sink.getWriter();
          await writer.write(encoder.encode(JSON.stringify(response)));
          await writer.close();
        } catch (err) {
          console.error("Failed to send direct ride-share response:", err);
        }
      }

      console.log("Accepted ride-share request:", request.requestId);
      this.removeRideShareRequestUI(request.requestId);
    } catch (err) {
      console.error("Error accepting ride-share request:", err);
    }
  }

  async declineRideShareRequest(request) {
    try {
      const response = {
        type: "ride-share-response",
        requestId: request.requestId,
        accepted: false,
        timestamp: Date.now()
      };

      await this.node.services.pubsub.publish(
        rideShareTopic,
        new TextEncoder().encode(JSON.stringify(response))
      );

      if (request.requesterPeerId) {
        try {
          const conn = await this.node.dial(request.requesterPeerId);
          const stream = await conn.newStream(this.rideShareProtocol);
          const encoder = new TextEncoder();
          const writer = stream.sink.getWriter();
          await writer.write(encoder.encode(JSON.stringify(response)));
          await writer.close();
        } catch (err) {
          console.error("Failed to send direct ride-share decline:", err);
        }
      }

      console.log("Declined ride-share request:", request.requestId);
      this.removeRideShareRequestUI(request.requestId);
    } catch (err) {
      console.error("Error declining ride-share request:", err);
    }
  }

  removeRideShareRequestUI(requestId) {
    const element = document.querySelector(`[data-request-id="${requestId}"]`)?.closest('.ride-share-request');
    if (element) {
      element.remove();
    }
  }

  handleRideShareMessage(message) {
    if (message.type === "ride-share-response") {
      if (message.accepted) {
        console.log("Ride-share request accepted by driver:", message.driverInfo);
      } else {
        console.log("Ride-share request declined");
      }
    }
  }

  async publishRideShareOffer(offerDetails) {
    try {
      const message = {
        type: "ride-share-offer",
        requestId: `offer-${Date.now()}`,
        driverInfo: {
          name: this.driverProfile.name,
          phone: this.driverProfile.phone,
          profileImage: this.driverProfile.profileImage,
          peerId: this.node.peerId.toString()
        },
        pickup: offerDetails.pickup,
        destination: offerDetails.destination,
        availableSeats: offerDetails.availableSeats,
        departureTime: offerDetails.departureTime,
        timestamp: Date.now()
      };

      await this.node.services.pubsub.publish(
        rideShareTopic,
        new TextEncoder().encode(JSON.stringify(message))
      );

      console.log("Published ride-share offer:", message);
      return message.requestId;
    } catch (err) {
      console.error("Failed to publish ride-share offer:", err);
      return null;
    }
  }
}
function showHolographicPopup(message) {
    const popup = document.getElementById("holographic-popup");
    const messageEl = document.getElementById("holographic-message");
    const fareEl = document.getElementById("holographic-fare");
    const timerEl = document.getElementById("countdown-timer");

    if (popup && messageEl && fareEl && timerEl) {
      // Set content
      messageEl.textContent = `${message.name || "Rider"} has confirmed the ride`;
      fareEl.textContent = `PKR ${message.fare || "0"}`;
      
      // Start countdown
      let seconds = 5;
      timerEl.textContent = seconds;
      
      const countdown = setInterval(() => {
        seconds--;
        timerEl.textContent = seconds;
        
        if (seconds <= 0) {
          clearInterval(countdown);
        }
      }, 1000);

      // Show popup
      popup.classList.add("active");
      
      // Auto-close after 5 seconds
      setTimeout(() => {
        popup.classList.remove("active");
      }, 2000);
    }
  }

document.addEventListener("DOMContentLoaded", () => {
  window.driverNode = new DriverNode();
  window.driverNode.initialize();

  document.querySelectorAll("img").forEach((img) => {
    img.addEventListener("error", (e) => {
      if (e.target.classList.contains('rider-avatar') || 
         e.target.classList.contains('driver-avatar')) {
        e.target.src = 'https://via.placeholder.com/150?text=Avatar';
      }
      console.error("Image failed to load:", e.target.src);
    });
    img.addEventListener("load", (e) => {
      console.log("Image loaded successfully:", e.target.src);
    });
  });
});