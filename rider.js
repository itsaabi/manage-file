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

// Storage management utilities
function manageLocalStorage(newCid, newData) {
  try {
    const MAX_RIDES = 20; // Keep only 20 most recent rides
    const cids = JSON.parse(localStorage.getItem('ipfsRideCIDs')) || [];
    
    // 1. Remove oldest entries if we're at capacity
    if (cids.length >= MAX_RIDES) {
      const toRemove = cids.splice(0, cids.length - MAX_RIDES + 1);
      toRemove.forEach(cid => {
        try {
          localStorage.removeItem(`ipfsRide_${cid}`);
        } catch (e) {
          console.warn(`Failed to remove old CID ${cid}:`, e);
        }
      });
    }
    
    // 2. Add new CID
    cids.push(newCid);
    localStorage.setItem('ipfsRideCIDs', JSON.stringify(cids));
    
    // 3. Try to store data with quota management
    try {
      localStorage.setItem(`ipfsRide_${newCid}`, JSON.stringify(newData));
    } catch (e) {
      console.warn('LocalStorage full, data will be fetched from IPFS when needed');
      // If we can't store the full data, at least keep a minimal version
      const minimalData = {
        type: newData.type,
        requestId: newData.requestId,
        timestamp: newData.timestamp,
        cid: newCid
      };
      localStorage.setItem(`ipfsRide_${newCid}`, JSON.stringify(minimalData));
    }
    
    return true;
  } catch (error) {
    console.error('Storage management error:', error);
    return false;
  }
}

const style = document.createElement("style");
style.textContent = `
:root {
  --hologram-blue: rgba(0, 255, 255, 0.7);
  --hologram-pink: rgba(255, 0, 255, 0.7);
  --hologram-purple: rgba(170, 0, 255, 0.7);
  --glow-intensity: 0.8;
  --depth-intensity: 20px;
  --transition-3d: all 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.4);
}

.popup-center {
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%) perspective(1200px) rotateX(0deg) rotateY(0deg);
  z-index: 10000;
  width: 380px;
  animation: hologramAppear 0.8s cubic-bezier(0.215, 0.61, 0.355, 1) forwards;
  filter: drop-shadow(0 0 10px var(--hologram-blue));
}

@keyframes hologramAppear {
  0% { 
    opacity: 0;
    transform: translate(-50%, -50%) perspective(1200px) rotateX(-20deg) rotateY(10deg) scale(0.8);
    filter: drop-shadow(0 0 20px var(--hologram-blue)) brightness(1.5);
  }
  100% { 
    opacity: 1;
    transform: translate(-50%, -50%) perspective(1200px) rotateX(0deg) rotateY(0deg) scale(1);
    filter: drop-shadow(0 0 10px var(--hologram-blue));
  }
}

.popup-container {
  position: fixed;
  top: 20px;
  right: 20px;
  z-index: 10000;
  display: flex;
  flex-direction: column;
  gap: 20px;
  max-height: calc(100vh - 40px);
  overflow-y: auto;
  perspective: 2000px;
}

.popup-item {
  position: relative;
  width: 360px;
  animation: hologramSlideIn 0.6s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards;
  transform-origin: right center;
  opacity: 0;
  filter: drop-shadow(0 0 8px rgba(0, 255, 255, 0.5));
}

@keyframes hologramSlideIn {
  0% { 
    transform: translateX(120px) rotateY(45deg) scale(0.9);
    opacity: 0;
    filter: drop-shadow(0 0 20px var(--hologram-pink)) brightness(1.8);
  }
  100% { 
    transform: translateX(0) rotateY(0deg) scale(1);
    opacity: 1;
    filter: drop-shadow(0 0 8px rgba(0, 255, 255, 0.5));
  }
}

.popup-3d {
  perspective: 1000px;
  transform-style: preserve-3d;
  border: none;
  border-radius: 16px;
  padding: 24px;
  overflow: hidden;
  transition: var(--transition-3d);
  background: linear-gradient(145deg, rgba(15, 23, 42, 0.9) 0%, rgba(30, 41, 59, 0.9) 100%);
  backdrop-filter: blur(8px);
  border-top: 1px solid rgba(0, 255, 255, 0.3);
  border-left: 1px solid rgba(0, 255, 255, 0.2);
  box-shadow: 
    0 10px 25px -5px rgba(0, 0, 0, 0.3),
    0 5px 10px -5px rgba(0, 0, 0, 0.1),
    inset 0 0 15px rgba(0, 255, 255, 0.2);
  position: relative;
  overflow: hidden;
}

.popup-3d::before {
  content: '';
  position: absolute;
  top: -50%;
  left: -50%;
  width: 200%;
  height: 200%;
  background: linear-gradient(
    45deg,
    transparent 0%,
    rgba(0, 255, 255, 0.1) 50%,
    transparent 100%
  );
  animation: hologramScan 6s linear infinite;
  transform: rotate(45deg);
}

@keyframes hologramScan {
  0% { transform: translateY(-100%) rotate(45deg); }
  100% { transform: translateY(100%) rotate(45deg); }
}

.popup-3d:hover {
  transform: translateZ(15px) rotateY(5deg) rotateX(2deg);
  box-shadow: 
    0 20px 50px -10px rgba(0, 0, 0, 0.4),
    0 10px 20px -10px rgba(0, 0, 0, 0.2),
    inset 0 0 20px rgba(0, 255, 255, 0.3);
}

.popup-content {
  transform: translateZ(40px);
  position: relative;
  z-index: 2;
}

.popup-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 15px;
}

.popup-icon {
  font-size: 24px;
  animation: hologramPulse 3s ease-in-out infinite;
  text-shadow: 0 0 10px var(--hologram-blue), 0 0 20px var(--hologram-pink);
}

@keyframes hologramPulse {
  0%, 100% { 
    transform: scale(1);
    text-shadow: 0 0 10px var(--hologram-blue), 0 0 20px var(--hologram-pink);
  }
  50% { 
    transform: scale(1.1);
    text-shadow: 0 0 15px var(--hologram-blue), 0 0 30px var(--hologram-pink);
  }
}

.popup-title {
  font-size: 1.1rem;
  font-weight: 600;
  color: white;
  margin: 0;
  text-shadow: 0 0 5px rgba(255, 255, 255, 0.7);
  letter-spacing: 0.5px;
}

.popup-message {
  font-size: 0.85rem;
  color: rgba(255, 255, 255, 0.8);
  margin-bottom: 20px;
  line-height: 1.5;
}

.driver-info-3d {
  margin: 20px 0;
  padding: 15px;
  background: rgba(30, 41, 59, 0.6);
  border-radius: 12px;
  transition: var(--transition-3d);
  display: flex;
  align-items: center;
  gap: 15px;
  border-left: 3px solid var(--hologram-blue);
  backdrop-filter: blur(5px);
  position: relative;
  overflow: hidden;
}

.driver-info-3d::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: linear-gradient(
    90deg,
    transparent 0%,
    rgba(0, 255, 255, 0.1) 50%,
    transparent 100%
  );
  animation: hologramFlow 4s linear infinite;
}

@keyframes hologramFlow {
  0% { transform: translateX(-100%); }
  100% { transform: translateX(100%); }
}

.driver-info-3d:hover {
  transform: translateZ(10px) rotateY(5deg);
  box-shadow: 0 8px 20px rgba(0, 255, 255, 0.2);
  border-left-color: var(--hologram-pink);
}

.driver-image-3d {
  width: 60px;
  height: 60px;
  border-radius: 50%;
  object-fit: cover;
  border: 2px solid var(--hologram-blue);
  box-shadow: 0 0 15px rgba(0, 255, 255, 0.3);
  z-index: 1;
  transition: var(--transition-3d);
}

.driver-info-3d:hover .driver-image-3d {
  border-color: var(--hologram-pink);
  box-shadow: 0 0 20px rgba(255, 0, 255, 0.4);
}

.driver-details-3d h3 {
  margin: 0;
  color: white;
  font-size: 1rem;
  text-shadow: 0 0 5px rgba(255, 255, 255, 0.5);
}

.driver-details-3d p {
  margin: 0.3rem 0;
  color: rgba(255, 255, 255, 0.7);
  font-size: 0.8rem;
}

.fare-amount {
  font-weight: bold;
  color: var(--hologram-blue);
  font-size: 1.2rem;
  text-shadow: 0 0 10px rgba(0, 255, 255, 0.5);
  transition: var(--transition-3d);
}

.driver-info-3d:hover .fare-amount {
  color: var(--hologram-pink);
  text-shadow: 0 0 15px rgba(255, 0, 255, 0.6);
}

.popup-actions {
  display: flex;
  justify-content: flex-end;
  gap: 15px;
  margin-top: 20px;
}

.popup-button {
  padding: 8px 16px;
  border: none;
  border-radius: 8px;
  font-weight: 600;
  cursor: pointer;
  transition: var(--transition-3d);
  transform-style: preserve-3d;
  position: relative;
  overflow: hidden;
  font-size: 0.85rem;
  letter-spacing: 0.5px;
  text-transform: uppercase;
}

.popup-button::before {
  content: '';
  position: absolute;
  top: 0;
  left: -100%;
  width: 100%;
  height: 100%;
  background: linear-gradient(
    90deg,
    transparent,
    rgba(255, 255, 255, 0.2),
    transparent
  );
  transition: 0.5s;
}

.popup-button:hover::before {
  left: 100%;
}

.btn-confirm {
  background: linear-gradient(135deg, rgba(0, 200, 200, 0.8) 0%, rgba(0, 150, 255, 0.8) 100%);
  color: white;
  box-shadow: 0 5px 15px rgba(0, 200, 200, 0.3);
}

.btn-confirm:hover {
  transform: translateY(-3px) translateZ(10px);
  box-shadow: 0 8px 25px rgba(0, 200, 200, 0.5);
}

.btn-reject {
  background: linear-gradient(135deg, rgba(255, 50, 50, 0.8) 0%, rgba(200, 0, 150, 0.8) 100%);
  color: white;
  box-shadow: 0 5px 15px rgba(255, 50, 50, 0.3);
}

.btn-reject:hover {
  transform: translateY(-3px) translateZ(10px);
  box-shadow: 0 8px 25px rgba(255, 50, 50, 0.5);
}

.popup-exit {
  animation: hologramSlideOut 0.5s cubic-bezier(0.6, -0.28, 0.735, 0.045) forwards;
}

@keyframes hologramSlideOut {
  0% { 
    transform: translateX(0) scale(1);
    opacity: 1;
    filter: drop-shadow(0 0 8px rgba(0, 255, 255, 0.5));
  }
  100% { 
    transform: translateX(120px) scale(0.8);
    opacity: 0;
    filter: drop-shadow(0 0 20px var(--hologram-pink)) brightness(1.8);
  }
}

@media (max-width: 768px) {
  .popup-container {
    width: calc(100% - 20px);
    padding: 10px;
    top: 10px;
    right: 10px;
    gap: 15px;
  }
  
  .popup-item {
    width: 100%;
    max-width: 100%;
  }
  
  .popup-center {
    width: calc(100% - 40px);
    max-width: 400px;
  }
  
  .popup-3d {
    padding: 20px;
  }
  
  .driver-info-3d {
    flex-direction: column;
    text-align: center;
  }
  
  .popup-actions {
    justify-content: center;
  }
}

@media (min-width: 769px) {
  .popup-container {
    max-width: 400px;
  }
}
`;
document.head.appendChild(style);

const topic = "ride-requests-final-v1";
const shareRideTopic = "share-ride-posts";
const relayId = "12D3KooWSyy6Pxb7kG9FZLFBHAAvR7ADjqQ4pcZZDug4yCxx1vL2";
const relayAddr = `/ip4/127.0.0.1/tcp/15001/ws/p2p/${relayId}`;

const node = await createLibp2p({
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

node.services.pubsub.addEventListener("message", (evt) => {
  try {
    if (!evt.detail || evt.detail.topic !== topic) return;

    const message = JSON.parse(new TextDecoder().decode(evt.detail.data));

    if (
      message.type === "ride-accepted" &&
      message.requestId === currentRequestId
    ) {
      if (!confirmedDriverId) {
        showDriverAcceptancePopup(message);
      }
    }

    if (message.type === "ride-offer") {
      displayRideOffer(message);
    }
  } catch (err) {
    console.error("Error processing message:", err);
  }
});

// Add click handler with null check
const confirmRequestBtn = document.getElementById("confirm-request");
if (confirmRequestBtn) {
  confirmRequestBtn.addEventListener("click", async (e) => {
    e.preventDefault();

    const riderNameElem = document.getElementById("rider-name");
    const riderPhoneElem = document.getElementById("rider-phone");
    const requestFromElem = document.getElementById("request-from");
    const requestToElem = document.getElementById("request-to");
    const requestFareElem = document.getElementById("request-fare");
    const requestVehicleElem = document.getElementById("request-vehicle");
    const requestSeatsElem = document.getElementById("request-seats");
    const riderAvatarElem = document.getElementById("rider-avatar");

    if (
      !riderNameElem ||
      !riderPhoneElem ||
      !requestFromElem ||
      !requestToElem ||
      !requestFareElem ||
      !requestVehicleElem ||
      !requestSeatsElem ||
      !riderAvatarElem
    ) {
      console.error("Required elements not found in DOM");
      return;
    }

    currentRequestId = Math.random().toString(36).substring(2, 9);
    confirmedDriverId = null;
    removeAllDriverPopups();

    const rideData = {
      type: "ride-request",
      id: currentRequestId,
      name: riderNameElem.textContent || "",
      phone: riderPhoneElem.textContent || "",
      from: requestFromElem.textContent || "",
      to: requestToElem.textContent || "",
      fare: requestFareElem.textContent || "",
      vehicle: requestVehicleElem.textContent || "",
      seats: requestSeatsElem.textContent || "",
      avatar: riderAvatarElem.src || "",
      timestamp: Date.now(),
    };

    try {
      await node.services.pubsub.publish(
        topic,
        new TextEncoder().encode(JSON.stringify(rideData))
      );
      showRequestSentPopup();
    } catch (err) {
      console.error("Failed to send:", err);
    }
  });
}

// Function to display ride offers in the UI
function displayRideOffer(offer) {
  const ridesContainer = document.getElementById("ridesContainer");

  // Create ride card element
  const rideCard = document.createElement("div");
  rideCard.className = "ride-card";
  rideCard.dataset.driverId = offer.driverId;

  rideCard.innerHTML = `
    <div class="ride-header">
      <div class="ride-vehicle">${offer.vehicleType || "Car"}</div>
      <div class="ride-seats">${offer.availableSeats || 1} seat${
    offer.availableSeats !== 1 ? "s" : ""
  }</div>
    </div>
    <div class="ride-details">
      <div class="ride-location">
        <div class="dot dot-start"></div>
        <div>${offer.pickupLocation || "Current Location"}</div>
      </div>
      <div class="ride-location">
        <div class="dot dot-end"></div>
        <div>${offer.destination || "Destination"}</div>
      </div>
    </div>
    <div class="ride-driver">
      <div class="driver-avatar">
        <img src="${offer.driverImage || "https://via.placeholder.com/40"}" 
             alt="Driver" 
             onerror="this.src='https://via.placeholder.com/40'">
      </div>
      <div class="driver-info">
        <div class="driver-name">${offer.driverName || "Driver"}</div>
        <div class="driver-rating">${offer.rating || "★★★★☆ 4.5"}</div>
      </div>
      <div class="ride-price">PKR ${offer.fare || "0"}</div>
    </div>
  `;

  // Add click handler to show details
  rideCard.addEventListener("click", () => {
    showDriverDetails(offer);
  });

  // Add to container
  ridesContainer.insertBefore(rideCard, ridesContainer.firstChild);

  // Remove "no rides" message if present
  const noRides = document.querySelector(".no-rides");
  if (noRides) {
    noRides.remove();
  }
}

// Function to show driver details in modal
function showDriverDetails(offer) {
  const driverModal = document.getElementById("driverModal");
  const driverName = document.getElementById("driverName");
  const driverRating = document.getElementById("driverRating");
  const driverPrice = document.getElementById("driverPrice");
  const driverCurrentLocation = document.getElementById(
    "driverCurrentLocation"
  );
  const driverDestinationLocation = document.getElementById(
    "driverDestinationLocation"
  );
  const driverVehicleDetails = document.getElementById("driverVehicleDetails");
  const driverAvailableSeats = document.getElementById("driverAvailableSeats");
  const driverAvatar = document.getElementById("driverAvatar");

  // Populate modal with offer details
  driverName.textContent = offer.driverName || "Driver";
  driverRating.textContent = offer.rating || "★★★★☆ 4.5";
  driverPrice.textContent = `PKR ${offer.fare || "0"}`;
  driverCurrentLocation.textContent =
    offer.pickupLocation || "Current Location";
  driverDestinationLocation.textContent = offer.destination || "Destination";
  driverVehicleDetails.textContent = `${offer.vehicleType || "Car"} - ${
    offer.vehicleDetails || ""
  }`;
  driverAvailableSeats.textContent = `${offer.availableSeats || 1} seat${
    offer.availableSeats !== 1 ? "s" : ""
  } available`;

  // Set avatar image
  if (offer.driverImage) {
    driverAvatar.innerHTML = `<img src="${
      offer.driverImage
    }" alt="Driver" onerror="this.innerHTML='${offer.driverName.charAt(0)}'">`;
  } else {
    driverAvatar.textContent = offer.driverName.charAt(0);
  }

  // Update accept ride button
  const acceptRideBtn = document.getElementById("acceptRide");
  acceptRideBtn.onclick = () => {
    acceptRideOffer(offer);
    driverModal.classList.remove("active");
  };

  // Show modal
  driverModal.classList.add("active");
}

// Function to accept a ride offer
async function acceptRideOffer(offer) {
  const acceptance = {
    type: "ride-acceptance",
    driverId: offer.driverId,
    riderId: node.peerId.toString(),
    fare: offer.fare,
    pickupLocation: offer.pickupLocation,
    destination: offer.destination,
    timestamp: Date.now(),
  };

  try {
    // Send acceptance directly to the driver
    await node.dialProtocol(offer.driverId, "/ride-acceptance/1.0.0", {
      data: new TextEncoder().encode(JSON.stringify(acceptance)),
    });

    // Show notification
    showNotification(`Ride request sent to ${offer.driverName || "driver"}`);
  } catch (err) {
    console.error("Failed to send ride acceptance:", err);
    showNotification("Failed to send ride request. Please try again.");
  }
}

// Helper function to show notifications
function showNotification(message) {
  const notification = document.getElementById("notification");
  notification.textContent = message;
  notification.classList.add("active");

  setTimeout(() => {
    notification.classList.remove("active");
  }, 5000);
}

node.addEventListener("peer:connect", () => {});

const connectWithRetry = async () => {
  let attempts = 0;
  while (attempts < 3) {
    try {
      await node.dial(multiaddr(relayAddr));
      return;
    } catch (err) {
      attempts++;
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }
  throw new Error("Failed to connect to relay");
};

await connectWithRetry();

node.services.pubsub.subscribe(topic);

const discoverPeers = async () => {
  const peers = await node.peerStore.all();
  for (const peer of peers) {
    if (peer.id.toString() !== node.peerId.toString()) {
      try {
        await node.dial(peer.id);
      } catch (err) {
        console.log("Failed to dial peer:", peer.id.toString());
      }
    }
  }
};

setInterval(discoverPeers, 5000);
discoverPeers();

let currentRequestId = null;
let activeDriverPopups = new Map();
let confirmedDriverId = null;

function ensurePopupContainer() {
  let container = document.querySelector(".popup-container");
  if (!container) {
    container = document.createElement("div");
    container.className = "popup-container";
    document.body.appendChild(container);
  }
  return container;
}

function showRequestSentPopup() {
  const existingPopup = document.querySelector(".popup-center");
  if (existingPopup) {
    existingPopup.remove();
  }

  const popupHTML = `
    <div class="popup-center">
      <div class="popup-3d">
        <div class="popup-content">
          <div class="popup-header">
            <span class="popup-icon">🚗</span>
            <h3 class="popup-title">Request Sent!</h3>
          </div>
          <p class="popup-message">Your ride request has been sent to nearby drivers.</p>
          <p class="popup-message">Waiting for driver acceptance...</p>
        </div>
      </div>
    </div>
  `;

  document.body.insertAdjacentHTML("beforeend", popupHTML);

  setTimeout(() => {
    const popup = document.querySelector(".popup-center");
    if (popup) {
      popup.style.animation = "popOutCenter 0.5s forwards";
      setTimeout(() => popup.remove(), 500);
    }
  }, 3000);
}

function showDriverAcceptancePopup(message) {
  const container = ensurePopupContainer();

  const popupId = `driver-popup-${message.driverId}-${Date.now()}`;
  const popupHTML = `
    <div id="${popupId}" class="popup-item">
      <div class="popup-3d">
        <div class="popup-content">
          <div class="popup-header">
            <span class="popup-icon"><i class="fas fa-car-side fa-beat-fade"></i></span>
            <h3 class="popup-title">Driver Found!</h3>
          </div>
          <p class="popup-message">A driver has accepted your ride request.</p>
          
          <div class="driver-info-3d">
            <img src="${
              message.driverImage || "https://via.placeholder.com/60"
            }" class="driver-image-3d" alt="Driver">
            <div class="driver-details-3d">
              <h3>${message.driverName || "Driver"}</h3>
              <p><i class="fas fa-mobile-alt icon-muted"></i> ${
                message.driverPhone || "N/A"
              }</p>
              <p><i class="fas fa-car icon-muted"></i> ${
                message.vehicle || "Vehicle"
              }</p>
              <p class="fare-amount"><i class="fas fa-coins"></i> PKR ${
                message.fare || "0"
              }</p>
            </div>
          </div>
          
          <div class="popup-actions">
            <button class="popup-button btn-confirm" data-popup-id="${popupId}">
              <i class="fas fa-check-circle"></i> Confirm Ride
            </button>
            <button class="popup-button btn-reject" data-popup-id="${popupId}">
              <i class="fas fa-times-circle"></i> Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  `;

  container.insertAdjacentHTML("afterbegin", popupHTML);
  activeDriverPopups.set(popupId, message);

  const popupElement = document.getElementById(popupId);
  const delay = activeDriverPopups.size * 100;
  popupElement.style.animationDelay = `${delay}ms`;

  const confirmBtn = document.querySelector(
    `.btn-confirm[data-popup-id="${popupId}"]`
  );
  const rejectBtn = document.querySelector(
    `.btn-reject[data-popup-id="${popupId}"]`
  );

  confirmBtn.addEventListener("click", () => {
    confirmedDriverId = message.driverId;
    confirmRide(message);
    removeAllDriverPopups();
  });

  rejectBtn.addEventListener("click", () => {
    removeDriverPopup(popupId);
  });

  setTimeout(() => {
    if (document.getElementById(popupId)) {
      removeDriverPopup(popupId);
    }
  }, 30000);
}

function removeDriverPopup(popupId) {
  const popup = document.getElementById(popupId);
  if (popup) {
    popup.classList.add("popup-exit");
    setTimeout(() => {
      popup.remove();
      activeDriverPopups.delete(popupId);
    }, 500);
  }
}

function removeAllDriverPopups() {
  activeDriverPopups.forEach((_, popupId) => {
    removeDriverPopup(popupId);
  });
  activeDriverPopups.clear();
}

const confirmRide = async (driverResponse) => {
  const confirmation = {
    type: "ride-confirmation",
    requestId: driverResponse.requestId,
    driverId: driverResponse.driverId,
    fare: driverResponse.fare,
    timestamp: Date.now(),
  };

  try {
    await node.services.pubsub.publish(
      topic,
      new TextEncoder().encode(JSON.stringify(confirmation))
    );
    showConfirmationPopup(driverResponse);
  } catch (err) {
    console.error("Failed to send confirmation:", err);
  }
};

function showConfirmationPopup(driverResponse) {
  // Get the original ride request data
  const rideRequestData = {
    from:
      document.getElementById("request-from")?.textContent ||
      "Current Location",
    to: document.getElementById("request-to")?.textContent || "Destination",
    vehicle:
      document.getElementById("request-vehicle")?.textContent || "Vehicle",
    fare: document.getElementById("request-fare")?.textContent || "0",
  };

  // Create complete data object with all required fields
  // In the showConfirmationPopup function, ensure the data structure matches:
  const rideData = {
    type: "ride-confirmation",
    requestId: driverResponse.requestId,
    driver: {
      id: driverResponse.driverId,
      name: driverResponse.driverName,
      phone: driverResponse.driverPhone,
      image: driverResponse.driverImage,
    },
    fare: {
      amount: parseFloat(rideRequestData.fare.replace("PKR ", "")) || 0,
      currency: "PKR",
    },
    vehicle: {
      type: rideRequestData.vehicle,
      model: "Standard",
    },
    route: {
      pickup: rideRequestData.from,
      destination: rideRequestData.to,
      coordinates: {}, // Add if available
    },
    timestamp: new Date().toISOString(),
    status: "completed",
  };

  // Enhanced IPFS upload function with localStorage quota handling
  const uploadToIPFS = async (data) => {
  try {
    const formData = new FormData();
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: 'application/json'
    });
    formData.append('file', blob, `ride-confirm-${data.requestId}.json`);

    const response = await fetch('http://127.0.0.1:5001/api/v0/add', {
      method: 'POST',
      body: formData
    });

    if (!response.ok) {
      throw new Error(`IPFS upload failed with status ${response.status}`);
    }

    const result = await response.json();
    console.log('Data uploaded to IPFS with CID:', result.Hash);

    // Use our storage management function
    manageLocalStorage(result.Hash, data);

    return result.Hash;
  } catch (error) {
    console.error('IPFS upload error:', error);
    return null;
  }
};

  // Upload the complete data
  uploadToIPFS(rideData).then((cid) => {
    if (cid) {
      console.log(`Data uploaded to IPFS with CID: ${cid}`);

      // Try to store locally but don't fail if quota is exceeded
      try {
        localStorage.setItem(`ipfsRide_${cid}`, JSON.stringify(rideData));
      } catch (e) {
        console.warn("Local storage quota exceeded, skipping local storage");
      }
    }
  });

  // Show confirmation popup
  const popupHTML = `
    <div class="popup-center">
      <div class="popup-3d">
        <div class="popup-content">
          <div class="popup-header">
            <span class="popup-icon">
              <i class="fas fa-check-circle fa-beat-fade"></i>
              <i class="fas fa-sparkles fa-fade"></i>
            </span>
            <h3 class="popup-title">Ride Confirmed!</h3>
          </div>
          <p class="popup-message">Your ride with ${
            driverResponse.driverName
          } has been confirmed.</p>
          
          <div class="driver-info-3d">
            <img src="${
              driverResponse.driverImage || "https://via.placeholder.com/60"
            }" 
                 class="driver-image-3d" 
                 alt="Driver">
            <div class="driver-details-3d">
              <h3>${driverResponse.driverName || "Driver"}</h3>
              <p><i class="fas fa-phone-alt"></i> ${
                driverResponse.driverPhone || "N/A"
              }</p>
              <p><i class="fas fa-car"></i> ${rideRequestData.vehicle}</p>
              <p class="fare-amount"><i class="fas fa-coins"></i> PKR ${
                rideRequestData.fare
              }</p>
            </div>
          </div>
          <div class="progress-container">
            <div class="progress-bar"></div>
            <p class="popup-message"><i class="fas fa-car-side"></i> Driver is en route to your location</p>
          </div>
        </div>
      </div>
    </div>
  `;

  document.body.insertAdjacentHTML("beforeend", popupHTML);

  setTimeout(() => {
    const popup = document.querySelector(".popup-center");
    if (popup) {
      popup.style.animation = "popOutCenter 0.5s forwards";
      setTimeout(() => popup.remove(), 500);
    }
  }, 5000);
}
